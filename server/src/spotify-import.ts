/**
 * GROMKO Spotify Import Module
 * 
 * Integrates with SpotiFLAC Go microservice to:
 * 1. Fetch Spotify metadata (tracks, albums)
 * 2. Download audio files via Tidal/Qobuz/Deezer/Amazon
 * 3. Feed downloaded files into the GROMKO audio processing pipeline
 * 
 * The SpotiFLAC Go server must be running on SPOTIFLAC_URL (default http://localhost:3099)
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { PATHS } from './config.js';
import { query, queryOne, execute } from './db.js';
import { enqueueTrack, extractMetadata } from './audio-processor.js';
import { slugify } from './slugify.js';
import { parseArtistNames } from './parse-artists.js';

const SPOTIFLAC_URL = process.env.SPOTIFLAC_URL || 'http://localhost:3099';
const PRIMARY_SERVICE = 'tidal';
const FALLBACK_SERVICES = (process.env.SPOTIFY_IMPORT_FALLBACK_SERVICES || 'amazon,qobuz')
  .split(',')
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);
const RETRYABLE_DOWNLOAD_ERROR_RE = /\b429\b|\b5\d{2}\b|\b524\b|timeout|timed\s*out|temporar|rate limit|too many requests|aborted/i;
const TRANSPORT_ERROR_RE = /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|network/i;
const INTER_TRACK_DELAY_MS = Number(process.env.SPOTIFY_IMPORT_INTER_TRACK_DELAY_MS || 200);
const DOWNLOAD_CONCURRENCY = Number(process.env.SPOTIFY_IMPORT_CONCURRENCY || 3);
const artistGenreCache = new Map<string, string | null>();

// ─── Types ───

export interface SpotifyTrackMeta {
  spotify_id: string;
  name: string;
  artists: string;
  album_name: string;
  album_artist?: string;
  duration_ms: number;
  images: string; // cover URL
  release_date: string;
  track_number: number;
  total_tracks?: number;
  disc_number?: number;
  total_discs?: number;
  is_explicit?: boolean;
  external_urls?: string;
  plays?: string;
  copyright?: string;
  publisher?: string;
  preview_url?: string;
  genre?: string;
  genres?: string[] | string;
}

export interface SpotifyAlbumMeta {
  album_info: {
    total_tracks: number;
    name: string;
    release_date: string;
    artists: string;
    images: string;
  };
  track_list: SpotifyTrackMeta[];
}

export interface SpotifyImportJob {
  id: string;
  spotifyUrl: string;
  type: 'track' | 'album';
  status: 'pending' | 'fetching_metadata' | 'downloading' | 'processing' | 'done' | 'error';
  service: string;
  progress: number;    // 0-100
  totalTracks: number;
  completedTracks: number;
  failedTracks: number;
  tracks: SpotifyImportTrack[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface SpotifyImportTrack {
  spotifyId: string;
  title: string;
  artist: string;
  album: string;
  status: 'pending' | 'downloading' | 'processing' | 'done' | 'error';
  gromkoTrackId?: string;
  error?: string;
}

// ─── In-memory job store ───

const jobs = new Map<string, SpotifyImportJob>();

export function getJob(id: string): SpotifyImportJob | undefined {
  return jobs.get(id);
}

export function getAllJobs(): SpotifyImportJob[] {
  return Array.from(jobs.values()).sort((a, b) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

// ─── SpotiFLAC API client ───

async function spotiflacFetch(endpoint: string, options?: RequestInit, timeoutMs = 30000): Promise<any> {
  const url = `${SPOTIFLAC_URL}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const combinedSignal = options?.signal || controller.signal;
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        signal: combinedSignal,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      throw new Error(`SpotiFLAC недоступен (${url}): ${msg}`);
    }
    const raw = await res.text();

    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { error: raw || `SpotiFLAC API error: HTTP ${res.status}` };
    }

    if (!res.ok) {
      throw new Error(data.error || `SpotiFLAC API error: HTTP ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run `count` async tasks with at most `concurrency` running at a time.
 * Each task receives its index (0-based).
 */
async function runConcurrent(count: number, concurrency: number, fn: (index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const workers: Promise<void>[] = [];

  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= count) return;
      await fn(i);
    }
  };

  const numWorkers = Math.min(concurrency, count);
  for (let w = 0; w < numWorkers; w++) {
    workers.push(worker());
  }

  await Promise.all(workers);
}

function buildDownloadPayload(
  trackMeta: SpotifyTrackMeta,
  spotifyId: string,
  albumName: string | undefined,
  albumCover: string | undefined,
  index: number,
  totalTracks: number,
  service: string,
  streamingInfo?: {
    tidal_url?: string;
    amazon_url?: string;
    isrc?: string;
  } | null,
) {
  const quality = service === 'qobuz' ? '6' : 'LOSSLESS';
  const serviceUrl =
    service === 'tidal' ? streamingInfo?.tidal_url :
    service === 'amazon' ? streamingInfo?.amazon_url :
    undefined;

  return {
    spotify_id: spotifyId,
    spotify_url: `https://open.spotify.com/track/${spotifyId}`,
    track_name: trackMeta.name,
    artist_name: trackMeta.artists,
    album_name: trackMeta.album_name || albumName || '',
    album_artist: trackMeta.album_artist || trackMeta.artists,
    release_date: trackMeta.release_date || '',
    cover_url: trackMeta.images || albumCover || '',
    track_number: trackMeta.track_number || (index + 1),
    disc_number: trackMeta.disc_number || 1,
    total_tracks: trackMeta.total_tracks || totalTracks,
    total_discs: trackMeta.total_discs || 1,
    service,
    quality,
    service_url: serviceUrl,
    isrc: streamingInfo?.isrc || '',
  };
}

async function fetchStreamingInfo(spotifyId: string): Promise<{ tidal_url?: string; amazon_url?: string; isrc?: string } | null> {
  try {
    return await spotiflacFetch(`/api/streaming-urls?spotify_id=${encodeURIComponent(spotifyId)}`, undefined, 30000);
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn(`  ⚠️ Failed to prefetch streaming info for ${spotifyId}: ${msg}`);
    return null;
  }
}

async function downloadViaPrimaryService(
  spotifyId: string,
  payloadFactory: (service: string, streamingInfo: { tidal_url?: string; amazon_url?: string; isrc?: string } | null) => any,
): Promise<any> {
  const allServices = [PRIMARY_SERVICE, ...FALLBACK_SERVICES];
  const errors: string[] = [];
  const streamingInfo = await fetchStreamingInfo(spotifyId);

  for (const service of allServices) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`  ⬇️ Trying download via ${service} (attempt ${attempt})`);
        return await spotiflacFetch('/api/download', {
          method: 'POST',
          body: JSON.stringify(payloadFactory(service, streamingInfo)),
        }, 5 * 60 * 1000);
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (TRANSPORT_ERROR_RE.test(msg)) {
          throw new Error(msg);
        }
        errors.push(`${service}#${attempt}: ${msg}`);
        console.warn(`  ⚠️ Download failed via ${service}#${attempt}: ${msg}`);
        const retryable = RETRYABLE_DOWNLOAD_ERROR_RE.test(msg);
        if (retryable && attempt < 2) {
          await sleep(1200);
          continue;
        }
        break; // Move to next service
      }
    }
  }
  throw new Error(`Не удалось скачать трек ни через один сервис (${errors.join(' | ')})`);
}

export async function checkSpotiflacHealth(): Promise<boolean> {
  try {
    const data = await spotiflacFetch('/health', undefined, 5000);
    return data.status === 'ok';
  } catch {
    return false;
  }
}

export async function fetchSpotifyMetadata(spotifyUrl: string): Promise<any> {
  return spotiflacFetch(`/api/metadata?url=${encodeURIComponent(spotifyUrl)}`, undefined, 20000);
}

export async function searchSpotify(query: string, limit = 10): Promise<any> {
  return spotiflacFetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`, undefined, 20000);
}

// ─── Import logic ───

/**
 * Start a Spotify import job. Returns the job ID immediately,
 * the import runs in the background.
 */
export function startSpotifyImport(
  spotifyUrl: string,
  service: string = PRIMARY_SERVICE,
  genre: string = 'Другое',
): string {
  const jobId = uuid();
  const type = spotifyUrl.includes('/album/') ? 'album' : 'track';

  const job: SpotifyImportJob = {
    id: jobId,
    spotifyUrl,
    type,
    status: 'pending',
    service: PRIMARY_SERVICE,
    progress: 0,
    totalTracks: 0,
    completedTracks: 0,
    failedTracks: 0,
    tracks: [],
    startedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  // Run import in background
  runImport(job, genre).catch(err => {
    job.status = 'error';
    job.error = err.message;
    job.finishedAt = new Date().toISOString();
  });

  return jobId;
}

async function runImport(job: SpotifyImportJob, genre: string) {
  try {
    // Step 1: Fetch metadata
    job.status = 'fetching_metadata';

    const metadata = await fetchSpotifyMetadata(job.spotifyUrl);

    let tracks: SpotifyTrackMeta[] = [];
    let albumName: string | undefined;
    let albumCover: string | undefined;

    if (job.type === 'album' && metadata.album_info) {
      const albumMeta = metadata as SpotifyAlbumMeta;
      tracks = albumMeta.track_list || [];
      albumName = albumMeta.album_info.name;
      albumCover = albumMeta.album_info.images;
    } else if (metadata.track) {
      const trackMeta = metadata.track as SpotifyTrackMeta;
      tracks = [trackMeta];
      albumName = trackMeta.album_name;
    } else {
      throw new Error('Не удалось распознать ответ Spotify. Убедитесь что ссылка на трек или альбом.');
    }

    job.totalTracks = tracks.length;
    job.tracks = tracks.map(t => ({
      spotifyId: t.spotify_id || extractIdFromUrl(t.external_urls || ''),
      title: t.name,
      artist: t.artists,
      album: t.album_name || albumName || '',
      status: 'pending' as const,
    }));

    // Step 2: Download and process tracks in parallel (DOWNLOAD_CONCURRENCY at a time)
    job.status = 'downloading';

    const processImportTrack = async (i: number) => {
      const trackMeta = tracks[i];
      const trackJob = job.tracks[i];

      try {
        trackJob.status = 'downloading';

        const spotifyId = trackJob.spotifyId || trackMeta.spotify_id;
        if (!spotifyId) {
          throw new Error('Не удалось определить Spotify ID трека');
        }

        const downloadResult = await downloadViaPrimaryService(
          spotifyId,
          (service, streamingInfo) => buildDownloadPayload(trackMeta, spotifyId, albumName, albumCover, i, tracks.length, service, streamingInfo),
        );

        if (!downloadResult.success) {
          throw new Error(downloadResult.error || 'Загрузка не удалась');
        }

        // Copy file to GROMKO uploads dir — lightweight, runs inline
        trackJob.status = 'processing';

        const rawSrcPath = downloadResult.file_path;
        const srcPath = resolveDownloadedFilePath(rawSrcPath);
        if (!srcPath || !fs.existsSync(srcPath)) {
          throw new Error(`Файл не найден: ${rawSrcPath}`);
        }

        const ext = path.extname(srcPath).toLowerCase();
        const destFilename = `${uuid()}${ext}`;
        const destPath = path.join(PATHS.uploads, destFilename);
        fs.mkdirSync(PATHS.uploads, { recursive: true });
        fs.copyFileSync(srcPath, destPath);

        // Download cover (quick HTTP fetch)
        let coverPath: string | undefined;
        const coverUrl = trackMeta.images || albumCover;
        if (coverUrl) {
          try { coverPath = await downloadCoverImage(coverUrl); } catch { /* skip */ }
        }

        // Extract basic metadata (fast FFprobe call)
        const meta = await extractMetadata(destPath);

        const trackId = uuid();
        const title = trackMeta.name || meta.title || 'Unknown';
        const artist = trackMeta.artists || meta.artist || 'Unknown';
        const explicit = trackMeta.is_explicit || false;
        const yearStr = trackMeta.release_date || '';
        const year = yearStr ? parseInt(yearStr.substring(0, 4)) || new Date().getFullYear() : (meta.year || new Date().getFullYear());
        const album = trackMeta.album_name || albumName || meta.album || null;
        const resolvedGenre = await resolveImportGenre(trackMeta, genre, meta.genre);

        const artistNames = parseArtistNames(artist);
        const primarySlug = slugify(artistNames[0] || artist);

        // Insert track into DB
        await execute(`
          INSERT INTO tracks (id, title, artist, artist_slug, genre, year, duration,
                             original_filename, original_format, original_size, original_bitrate,
                             original_sample_rate, original_channels, explicit, status, meta_album, meta_track_number)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15,$16)
        `, [
          trackId, title, artist, primarySlug, resolvedGenre, year, meta.duration,
          downloadResult.file_name || path.basename(srcPath), meta.format, meta.bitrate ? meta.bitrate * 1000 : 0, meta.bitrate,
          meta.sampleRate, meta.channels, explicit, album, trackMeta.track_number || null,
        ]);

        // Create artists
        for (let j = 0; j < artistNames.length; j++) {
          const aName = artistNames[j];
          const aSlug = slugify(aName);
          const existing = await queryOne('SELECT id FROM artists WHERE slug = $1', [aSlug]);
          let artistId: string;
          if (existing) {
            artistId = existing.id;
          } else {
            artistId = uuid();
            await execute(
              `INSERT INTO artists (id, name, slug, genre, tracks_count, total_plays) VALUES ($1, $2, $3, $4, 0, 0)`,
              [artistId, aName, aSlug, resolvedGenre]
            );
          }
          await execute(
            `INSERT INTO track_artists (track_id, artist_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [trackId, artistId, j]
          );
        }

        // Heavy audio processing (FFmpeg transcode, waveform) — enqueued to background worker pool
        enqueueTrack(trackId, destPath, coverPath);

        trackJob.status = 'done';
        trackJob.gromkoTrackId = trackId;
        job.completedTracks++;

        // Clean up SpotiFLAC download
        try {
          fs.unlinkSync(srcPath);
          const parentDir = path.dirname(srcPath);
          if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
            fs.rmdirSync(parentDir);
          }
        } catch { /* ignore */ }

      } catch (err: any) {
        trackJob.status = 'error';
        trackJob.error = err.message;
        job.failedTracks++;
        console.error(`  ❌ Failed to import track "${trackJob.title}": ${err.message}`);
      }
    };

    await runConcurrent(tracks.length, DOWNLOAD_CONCURRENCY, async (i) => {
      await processImportTrack(i);
      job.progress = Math.round(((job.completedTracks + job.failedTracks) / tracks.length) * 100);
    });

    finalizeJob(job);

  } catch (err: any) {
    job.status = 'error';
    job.error = err.message;
    job.finishedAt = new Date().toISOString();
    throw err;
  }
}

// ─── Helpers ───

async function downloadCoverImage(url: string): Promise<string> {
  // Convert Spotify image hash to high-res URL if needed
  let coverUrl = url;
  if (coverUrl.includes('i.scdn.co/image/')) {
    // Already a full URL
  } else if (/^[a-f0-9]{40}$/.test(coverUrl)) {
    // Just a hash
    coverUrl = `https://i.scdn.co/image/${coverUrl}`;
  }

  const res = await fetch(coverUrl);
  if (!res.ok) throw new Error(`Cover download failed: HTTP ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = coverUrl.includes('.png') ? '.png' : '.jpg';
  const filename = `${uuid()}${ext}`;
  const destPath = path.join(PATHS.uploads, filename);
  fs.writeFileSync(destPath, buffer);

  return destPath;
}

function extractIdFromUrl(url: string): string {
  if (!url) return '';
  const match = url.match(/\/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] : '';
}

function resolveDownloadedFilePath(srcPath: string): string {
  const candidates = [
    srcPath,
    path.resolve(srcPath),
    path.resolve(process.cwd(), srcPath),
    path.resolve(process.cwd(), '..', srcPath),
    path.resolve(process.cwd(), '..', 'SpotiFLAC-main', srcPath),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return srcPath;
}

function pickGenreFromTrackMeta(trackMeta: SpotifyTrackMeta): string | null {
  const direct = typeof trackMeta.genre === 'string' ? trackMeta.genre : null;
  if (direct && direct.trim()) return direct.trim();

  if (Array.isArray(trackMeta.genres)) {
    const first = trackMeta.genres.find(g => typeof g === 'string' && g.trim());
    return first ? first.trim() : null;
  }
  if (typeof trackMeta.genres === 'string' && trackMeta.genres.trim()) {
    return trackMeta.genres.trim();
  }
  return null;
}

async function findArtistGenre(artist: string): Promise<string | null> {
  const primary = parseArtistNames(artist)[0] || artist;
  const row = await queryOne<{ genre: string }>(
    `SELECT genre FROM artists WHERE LOWER(name) = LOWER($1) AND genre IS NOT NULL AND genre <> '' ORDER BY tracks_count DESC LIMIT 1`,
    [primary]
  );
  return row?.genre || null;
}

async function findSpotifyArtistGenre(artistName: string): Promise<string | null> {
  const primary = (parseArtistNames(artistName)[0] || artistName || '').trim();
  if (!primary) return null;
  const cacheKey = primary.toLowerCase();
  if (artistGenreCache.has(cacheKey)) return artistGenreCache.get(cacheKey) ?? null;

  try {
    const search = await searchSpotify(primary, 5);
    const artists: any[] = Array.isArray(search?.artists) ? search.artists : [];
    const exact = artists.find(a => typeof a?.name === 'string' && a.name.toLowerCase() === cacheKey);
    const picked = exact || artists[0];
    const artistId = picked?.id;
    if (!artistId) {
      artistGenreCache.set(cacheKey, null);
      return null;
    }

    const meta = await fetchSpotifyMetadata(`spotify:artist:${artistId}`);
    const genres = meta?.artist_info?.genres;
    const genre = Array.isArray(genres) ? genres.find((g: any) => typeof g === 'string' && g.trim()) : null;
    const normalized = genre ? genre.trim() : null;
    artistGenreCache.set(cacheKey, normalized);
    return normalized;
  } catch {
    artistGenreCache.set(cacheKey, null);
    return null;
  }
}

async function resolveImportGenre(
  trackMeta: SpotifyTrackMeta,
  requestedGenre: string,
  fallbackMetaGenre?: string,
): Promise<string> {
  const fromSpotify = pickGenreFromTrackMeta(trackMeta);
  if (fromSpotify) return fromSpotify;
  const fromSpotifyArtist = await findSpotifyArtistGenre(trackMeta.artists || '');
  if (fromSpotifyArtist) return fromSpotifyArtist;
  const fromArtist = await findArtistGenre(trackMeta.artists || '');
  if (fromArtist) return fromArtist;
  if (fallbackMetaGenre && fallbackMetaGenre.trim()) return fallbackMetaGenre.trim();
  return requestedGenre || 'Другое';
}

function buildSpotifyImportComment(trackMeta: SpotifyTrackMeta, spotifyUrl: string): string {
  const lines = [
    `Импортировано из Spotify: ${spotifyUrl}`,
    `Spotify ID: ${trackMeta.spotify_id || extractIdFromUrl(trackMeta.external_urls || spotifyUrl)}`,
    `Ссылка трека: ${trackMeta.external_urls || spotifyUrl}`,
    `Артист: ${trackMeta.artists || '—'}`,
    `Альбом: ${trackMeta.album_name || '—'}`,
    `Дата релиза: ${trackMeta.release_date || '—'}`,
    `Трек/диск: ${trackMeta.track_number || 0}/${trackMeta.total_tracks || 0} · ${trackMeta.disc_number || 1}/${trackMeta.total_discs || 1}`,
    `Прослушивания Spotify: ${trackMeta.plays || '—'}`,
    `Explicit: ${trackMeta.is_explicit ? 'да' : 'нет'}`,
    `Лейбл/издатель: ${trackMeta.publisher || '—'}`,
    `Copyright: ${trackMeta.copyright || '—'}`,
  ];
  return lines.join('\n');
}

// ─── User-facing: submit Spotify track for moderation ───

/**
 * Submit a Spotify track by URL. For regular users, creates a submission entry 
 * that goes through moderation. For admins, directly imports the track.
 * Returns job status info for polling.
 */
export function startSpotifySubmission(
  spotifyUrl: string,
  userId: string,
  isAdmin: boolean,
  genre: string = 'Другое',
  service: string = PRIMARY_SERVICE,
): string {
  const jobId = uuid();
  const type = spotifyUrl.includes('/album/') ? 'album' : 'track';

  const job: SpotifyImportJob = {
    id: jobId,
    spotifyUrl,
    type,
    status: 'pending',
    service: PRIMARY_SERVICE,
    progress: 0,
    totalTracks: 0,
    completedTracks: 0,
    failedTracks: 0,
    tracks: [],
    startedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  if (isAdmin) {
    // Admin: direct import (skip moderation)
    runImport(job, genre).catch(err => {
      job.status = 'error';
      job.error = err.message;
      job.finishedAt = new Date().toISOString();
    });
  } else {
    // Regular user: download and create submission for moderation
    runSubmission(job, userId, genre).catch(err => {
      job.status = 'error';
      job.error = err.message;
      job.finishedAt = new Date().toISOString();
    });
  }

  return jobId;
}

/**
 * Download tracks and create submissions for moderation (non-admin flow)
 */
async function runSubmission(job: SpotifyImportJob, userId: string, genre: string) {
  try {
    job.status = 'fetching_metadata';

    const metadata = await fetchSpotifyMetadata(job.spotifyUrl);

    let tracks: SpotifyTrackMeta[] = [];
    let albumName: string | undefined;
    let albumCover: string | undefined;

    if (job.type === 'album' && metadata.album_info) {
      const albumMeta = metadata as SpotifyAlbumMeta;
      tracks = albumMeta.track_list || [];
      albumName = albumMeta.album_info.name;
      albumCover = albumMeta.album_info.images;
    } else if (metadata.track) {
      const trackMeta = metadata.track as SpotifyTrackMeta;
      tracks = [trackMeta];
      albumName = trackMeta.album_name;
    } else {
      throw new Error('Не удалось распознать ответ Spotify. Убедитесь что ссылка на трек или альбом.');
    }

    job.totalTracks = tracks.length;
    job.tracks = tracks.map(t => ({
      spotifyId: t.spotify_id || extractIdFromUrl(t.external_urls || ''),
      title: t.name,
      artist: t.artists,
      album: t.album_name || albumName || '',
      status: 'pending' as const,
    }));

    // Step 2: Download tracks in parallel
    job.status = 'downloading';

    const processSubmissionTrack = async (i: number) => {
      const trackMeta = tracks[i];
      const trackJob = job.tracks[i];

      try {
        trackJob.status = 'downloading';

        const spotifyId = trackJob.spotifyId || trackMeta.spotify_id;
        if (!spotifyId) {
          throw new Error('Не удалось определить Spotify ID трека');
        }

        const downloadResult = await downloadViaPrimaryService(
          spotifyId,
          (service, streamingInfo) => buildDownloadPayload(trackMeta, spotifyId, albumName, albumCover, i, tracks.length, service, streamingInfo),
        );

        if (!downloadResult.success) {
          throw new Error(downloadResult.error || 'Загрузка не удалась');
        }

        trackJob.status = 'processing';

        const rawSrcPath = downloadResult.file_path;
        const srcPath = resolveDownloadedFilePath(rawSrcPath);
        if (!srcPath || !fs.existsSync(srcPath)) {
          throw new Error(`Файл не найден: ${rawSrcPath}`);
        }

        const ext = path.extname(srcPath).toLowerCase();
        const destFilename = `${uuid()}${ext}`;
        const destPath = path.join(PATHS.uploads, destFilename);
        fs.mkdirSync(PATHS.uploads, { recursive: true });
        fs.copyFileSync(srcPath, destPath);

        let coverPath: string | undefined;
        const coverUrl = trackMeta.images || albumCover;
        if (coverUrl) {
          try { coverPath = await downloadCoverImage(coverUrl); } catch { /* skip */ }
        }

        const meta = await extractMetadata(destPath);
        const title = trackMeta.name || meta.title || 'Unknown';
        const artist = trackMeta.artists || 'Unknown';
        const yearStr = trackMeta.release_date || '';
        const year = yearStr ? parseInt(yearStr.substring(0, 4)) || new Date().getFullYear() : new Date().getFullYear();
        const album = trackMeta.album_name || albumName || null;
        const resolvedGenre = await resolveImportGenre(trackMeta, genre, meta.genre);
        const importComment = buildSpotifyImportComment(trackMeta, job.spotifyUrl);

        const subId = uuid();
        await execute(`
          INSERT INTO submissions (id, user_id, release_id, title, artist, genre, year, comment, status, original_filename, file_path, cover_path, album_name)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11, $12)
        `, [
          subId, userId, job.id, title, artist,
          resolvedGenre, year,
          importComment,
          downloadResult.file_name || path.basename(srcPath),
          destPath,
          coverPath || null,
          album,
        ]);

        trackJob.status = 'done';
        trackJob.gromkoTrackId = subId;
        job.completedTracks++;

        // Clean up SpotiFLAC download
        try {
          fs.unlinkSync(srcPath);
          const parentDir = path.dirname(srcPath);
          if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
            fs.rmdirSync(parentDir);
          }
        } catch { /* ignore */ }

      } catch (err: any) {
        trackJob.status = 'error';
        trackJob.error = err.message;
        job.failedTracks++;
        console.error(`  ❌ Failed to submit track "${trackJob.title}": ${err.message}`);
      }
    };

    await runConcurrent(tracks.length, DOWNLOAD_CONCURRENCY, async (i: number) => {
      await processSubmissionTrack(i);
      job.progress = Math.round(((job.completedTracks + job.failedTracks) / tracks.length) * 100);
    });

    finalizeJob(job);

  } catch (err: any) {
    job.status = 'error';
    job.error = err.message;
    job.finishedAt = new Date().toISOString();
    throw err;
  }
}

function finalizeJob(job: SpotifyImportJob) {
  job.progress = 100;
  job.finishedAt = new Date().toISOString();

  if (job.completedTracks === 0 && job.failedTracks > 0) {
    job.status = 'error';
    const trackErrors = job.tracks
      .filter(t => t.status === 'error' && t.error)
      .map(t => `${t.title}: ${t.error}`)
      .join('; ');
    job.error = `Не удалось загрузить ни одного трека (${job.failedTracks}/${job.totalTracks}).${trackErrors ? ' Ошибки: ' + trackErrors : ''}`;
    return;
  }

  job.status = 'done';
  if (job.failedTracks > 0) {
    job.error = `Завершено частично: ${job.completedTracks} успешно, ${job.failedTracks} с ошибкой.`;
  }
}
