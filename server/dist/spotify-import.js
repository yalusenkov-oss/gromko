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
import { queryOne, execute } from './db.js';
import { enqueueTrack, extractMetadata } from './audio-processor.js';
import { slugify } from './slugify.js';
import { parseArtistNames } from './parse-artists.js';
const SPOTIFLAC_URL = process.env.SPOTIFLAC_URL || 'http://localhost:3099';
const PRIMARY_SERVICE = 'tidal';
const RETRYABLE_DOWNLOAD_ERROR_RE = /\b524\b|timeout|timed\s*out|temporar/i;
const TRANSPORT_ERROR_RE = /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|network/i;
const INTER_TRACK_DELAY_MS = Number(process.env.SPOTIFY_IMPORT_INTER_TRACK_DELAY_MS || 200);
const artistGenreCache = new Map();
// ─── In-memory job store ───
const jobs = new Map();
export function getJob(id) {
    return jobs.get(id);
}
export function getAllJobs() {
    return Array.from(jobs.values()).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}
// ─── SpotiFLAC API client ───
async function spotiflacFetch(endpoint, options, timeoutMs = 30000) {
    const url = `${SPOTIFLAC_URL}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const combinedSignal = options?.signal || controller.signal;
    try {
        let res;
        try {
            res = await fetch(url, {
                ...options,
                signal: combinedSignal,
                headers: {
                    'Content-Type': 'application/json',
                    ...options?.headers,
                },
            });
        }
        catch (err) {
            const msg = err?.message || String(err);
            throw new Error(`SpotiFLAC недоступен (${url}): ${msg}`);
        }
        const raw = await res.text();
        let data = null;
        try {
            data = raw ? JSON.parse(raw) : {};
        }
        catch {
            data = { error: raw || `SpotiFLAC API error: HTTP ${res.status}` };
        }
        if (!res.ok) {
            throw new Error(data.error || `SpotiFLAC API error: HTTP ${res.status}`);
        }
        return data;
    }
    finally {
        clearTimeout(timeout);
    }
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function buildDownloadPayload(trackMeta, spotifyId, albumName, albumCover, index, totalTracks, service) {
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
        quality: 'LOSSLESS',
    };
}
async function downloadViaPrimaryService(payloadFactory) {
    const errors = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            return await spotiflacFetch('/api/download', {
                method: 'POST',
                body: JSON.stringify(payloadFactory(PRIMARY_SERVICE)),
            }, 5 * 60 * 1000);
        }
        catch (err) {
            const msg = err?.message || String(err);
            if (TRANSPORT_ERROR_RE.test(msg)) {
                throw new Error(msg);
            }
            errors.push(`${PRIMARY_SERVICE}#${attempt}: ${msg}`);
            const retryable = RETRYABLE_DOWNLOAD_ERROR_RE.test(msg);
            if (retryable && attempt < 2) {
                await sleep(1200);
                continue;
            }
            break;
        }
    }
    throw new Error(`Не удалось скачать трек через ${PRIMARY_SERVICE} (${errors.join(' | ')})`);
}
export async function checkSpotiflacHealth() {
    try {
        const data = await spotiflacFetch('/health', undefined, 5000);
        return data.status === 'ok';
    }
    catch {
        return false;
    }
}
export async function fetchSpotifyMetadata(spotifyUrl) {
    return spotiflacFetch(`/api/metadata?url=${encodeURIComponent(spotifyUrl)}`, undefined, 20000);
}
export async function searchSpotify(query, limit = 10) {
    return spotiflacFetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`, undefined, 20000);
}
// ─── Import logic ───
/**
 * Start a Spotify import job. Returns the job ID immediately,
 * the import runs in the background.
 */
export function startSpotifyImport(spotifyUrl, service = PRIMARY_SERVICE, genre = 'Другое') {
    const jobId = uuid();
    const type = spotifyUrl.includes('/album/') ? 'album' : 'track';
    const job = {
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
async function runImport(job, genre) {
    try {
        // Step 1: Fetch metadata
        job.status = 'fetching_metadata';
        const metadata = await fetchSpotifyMetadata(job.spotifyUrl);
        let tracks = [];
        let albumName;
        let albumCover;
        if (job.type === 'album' && metadata.album_info) {
            // Album response
            const albumMeta = metadata;
            tracks = albumMeta.track_list || [];
            albumName = albumMeta.album_info.name;
            albumCover = albumMeta.album_info.images;
        }
        else if (metadata.track) {
            // Single track response
            const trackMeta = metadata.track;
            tracks = [trackMeta];
            albumName = trackMeta.album_name;
        }
        else {
            throw new Error('Не удалось распознать ответ Spotify. Убедитесь что ссылка на трек или альбом.');
        }
        job.totalTracks = tracks.length;
        job.tracks = tracks.map(t => ({
            spotifyId: t.spotify_id || extractIdFromUrl(t.external_urls || ''),
            title: t.name,
            artist: t.artists,
            album: t.album_name || albumName || '',
            status: 'pending',
        }));
        // Step 2: Download and process each track
        job.status = 'downloading';
        for (let i = 0; i < tracks.length; i++) {
            const trackMeta = tracks[i];
            const trackJob = job.tracks[i];
            try {
                trackJob.status = 'downloading';
                job.progress = Math.round((i / tracks.length) * 100);
                const spotifyId = trackJob.spotifyId || trackMeta.spotify_id;
                if (!spotifyId) {
                    throw new Error('Не удалось определить Spotify ID трека');
                }
                // Download via SpotiFLAC (tidal-only, with retry on transient failures)
                const downloadResult = await downloadViaPrimaryService((service) => buildDownloadPayload(trackMeta, spotifyId, albumName, albumCover, i, tracks.length, service));
                if (!downloadResult.success) {
                    throw new Error(downloadResult.error || 'Загрузка не удалась');
                }
                // Step 3: Copy file to GROMKO uploads dir and process
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
                // Download cover image if available
                let coverPath;
                const coverUrl = trackMeta.images || albumCover;
                if (coverUrl) {
                    try {
                        coverPath = await downloadCoverImage(coverUrl);
                    }
                    catch (e) {
                        console.warn(`  ⚠️ Failed to download cover: ${e}`);
                    }
                }
                // Extract metadata from downloaded file
                const meta = await extractMetadata(destPath);
                const trackId = uuid();
                const title = trackMeta.name || meta.title || 'Unknown';
                const artist = trackMeta.artists || meta.artist || 'Unknown';
                const explicit = trackMeta.is_explicit || false;
                const yearStr = trackMeta.release_date || '';
                const year = yearStr ? parseInt(yearStr.substring(0, 4)) || new Date().getFullYear() : (meta.year || new Date().getFullYear());
                const album = trackMeta.album_name || albumName || meta.album || null;
                const resolvedGenre = await resolveImportGenre(trackMeta, genre, meta.genre);
                // Multi-artist handling
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
                // Create artists and link via junction table
                for (let j = 0; j < artistNames.length; j++) {
                    const aName = artistNames[j];
                    const aSlug = slugify(aName);
                    const existing = await queryOne('SELECT id FROM artists WHERE slug = $1', [aSlug]);
                    let artistId;
                    if (existing) {
                        artistId = existing.id;
                    }
                    else {
                        artistId = uuid();
                        await execute(`INSERT INTO artists (id, name, slug, genre, tracks_count, total_plays) VALUES ($1, $2, $3, $4, 0, 0)`, [artistId, aName, aSlug, resolvedGenre]);
                    }
                    await execute(`INSERT INTO track_artists (track_id, artist_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [trackId, artistId, j]);
                }
                // Enqueue for audio processing
                enqueueTrack(trackId, destPath, coverPath);
                trackJob.status = 'done';
                trackJob.gromkoTrackId = trackId;
                job.completedTracks++;
                // Clean up SpotiFLAC download
                try {
                    fs.unlinkSync(srcPath);
                    // Also try to remove the parent directory if empty
                    const parentDir = path.dirname(srcPath);
                    if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
                        fs.rmdirSync(parentDir);
                    }
                }
                catch { /* ignore cleanup errors */ }
            }
            catch (err) {
                trackJob.status = 'error';
                trackJob.error = err.message;
                job.failedTracks++;
                console.error(`  ❌ Failed to import track "${trackJob.title}": ${err.message}`);
            }
            // Tiny configurable delay to reduce provider pressure without slowing imports too much.
            if (i < tracks.length - 1 && INTER_TRACK_DELAY_MS > 0) {
                await new Promise(r => setTimeout(r, INTER_TRACK_DELAY_MS));
            }
        }
        finalizeJob(job);
    }
    catch (err) {
        job.status = 'error';
        job.error = err.message;
        job.finishedAt = new Date().toISOString();
        throw err;
    }
}
// ─── Helpers ───
async function downloadCoverImage(url) {
    // Convert Spotify image hash to high-res URL if needed
    let coverUrl = url;
    if (coverUrl.includes('i.scdn.co/image/')) {
        // Already a full URL
    }
    else if (/^[a-f0-9]{40}$/.test(coverUrl)) {
        // Just a hash
        coverUrl = `https://i.scdn.co/image/${coverUrl}`;
    }
    const res = await fetch(coverUrl);
    if (!res.ok)
        throw new Error(`Cover download failed: HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = coverUrl.includes('.png') ? '.png' : '.jpg';
    const filename = `${uuid()}${ext}`;
    const destPath = path.join(PATHS.uploads, filename);
    fs.writeFileSync(destPath, buffer);
    return destPath;
}
function extractIdFromUrl(url) {
    if (!url)
        return '';
    const match = url.match(/\/track\/([a-zA-Z0-9]+)/);
    return match ? match[1] : '';
}
function resolveDownloadedFilePath(srcPath) {
    const candidates = [
        srcPath,
        path.resolve(srcPath),
        path.resolve(process.cwd(), srcPath),
        path.resolve(process.cwd(), '..', srcPath),
        path.resolve(process.cwd(), '..', 'SpotiFLAC-main', srcPath),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate))
            return candidate;
    }
    return srcPath;
}
function pickGenreFromTrackMeta(trackMeta) {
    const direct = typeof trackMeta.genre === 'string' ? trackMeta.genre : null;
    if (direct && direct.trim())
        return direct.trim();
    if (Array.isArray(trackMeta.genres)) {
        const first = trackMeta.genres.find(g => typeof g === 'string' && g.trim());
        return first ? first.trim() : null;
    }
    if (typeof trackMeta.genres === 'string' && trackMeta.genres.trim()) {
        return trackMeta.genres.trim();
    }
    return null;
}
async function findArtistGenre(artist) {
    const primary = parseArtistNames(artist)[0] || artist;
    const row = await queryOne(`SELECT genre FROM artists WHERE LOWER(name) = LOWER($1) AND genre IS NOT NULL AND genre <> '' ORDER BY tracks_count DESC LIMIT 1`, [primary]);
    return row?.genre || null;
}
async function findSpotifyArtistGenre(artistName) {
    const primary = (parseArtistNames(artistName)[0] || artistName || '').trim();
    if (!primary)
        return null;
    const cacheKey = primary.toLowerCase();
    if (artistGenreCache.has(cacheKey))
        return artistGenreCache.get(cacheKey) ?? null;
    try {
        const search = await searchSpotify(primary, 5);
        const artists = Array.isArray(search?.artists) ? search.artists : [];
        const exact = artists.find(a => typeof a?.name === 'string' && a.name.toLowerCase() === cacheKey);
        const picked = exact || artists[0];
        const artistId = picked?.id;
        if (!artistId) {
            artistGenreCache.set(cacheKey, null);
            return null;
        }
        const meta = await fetchSpotifyMetadata(`spotify:artist:${artistId}`);
        const genres = meta?.artist_info?.genres;
        const genre = Array.isArray(genres) ? genres.find((g) => typeof g === 'string' && g.trim()) : null;
        const normalized = genre ? genre.trim() : null;
        artistGenreCache.set(cacheKey, normalized);
        return normalized;
    }
    catch {
        artistGenreCache.set(cacheKey, null);
        return null;
    }
}
async function resolveImportGenre(trackMeta, requestedGenre, fallbackMetaGenre) {
    const fromSpotify = pickGenreFromTrackMeta(trackMeta);
    if (fromSpotify)
        return fromSpotify;
    const fromSpotifyArtist = await findSpotifyArtistGenre(trackMeta.artists || '');
    if (fromSpotifyArtist)
        return fromSpotifyArtist;
    const fromArtist = await findArtistGenre(trackMeta.artists || '');
    if (fromArtist)
        return fromArtist;
    if (fallbackMetaGenre && fallbackMetaGenre.trim())
        return fallbackMetaGenre.trim();
    return requestedGenre || 'Другое';
}
function buildSpotifyImportComment(trackMeta, spotifyUrl) {
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
export function startSpotifySubmission(spotifyUrl, userId, isAdmin, genre = 'Другое', service = PRIMARY_SERVICE) {
    const jobId = uuid();
    const type = spotifyUrl.includes('/album/') ? 'album' : 'track';
    const job = {
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
    }
    else {
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
async function runSubmission(job, userId, genre) {
    try {
        // Step 1: Fetch metadata
        job.status = 'fetching_metadata';
        const metadata = await fetchSpotifyMetadata(job.spotifyUrl);
        let tracks = [];
        let albumName;
        let albumCover;
        if (job.type === 'album' && metadata.album_info) {
            const albumMeta = metadata;
            tracks = albumMeta.track_list || [];
            albumName = albumMeta.album_info.name;
            albumCover = albumMeta.album_info.images;
        }
        else if (metadata.track) {
            const trackMeta = metadata.track;
            tracks = [trackMeta];
            albumName = trackMeta.album_name;
        }
        else {
            throw new Error('Не удалось распознать ответ Spotify. Убедитесь что ссылка на трек или альбом.');
        }
        job.totalTracks = tracks.length;
        job.tracks = tracks.map(t => ({
            spotifyId: t.spotify_id || extractIdFromUrl(t.external_urls || ''),
            title: t.name,
            artist: t.artists,
            album: t.album_name || albumName || '',
            status: 'pending',
        }));
        // Step 2: Download and create submission for each track
        job.status = 'downloading';
        for (let i = 0; i < tracks.length; i++) {
            const trackMeta = tracks[i];
            const trackJob = job.tracks[i];
            try {
                trackJob.status = 'downloading';
                job.progress = Math.round((i / tracks.length) * 100);
                const spotifyId = trackJob.spotifyId || trackMeta.spotify_id;
                if (!spotifyId) {
                    throw new Error('Не удалось определить Spotify ID трека');
                }
                // Download via SpotiFLAC (tidal-only, with retry on transient failures)
                const downloadResult = await downloadViaPrimaryService((service) => buildDownloadPayload(trackMeta, spotifyId, albumName, albumCover, i, tracks.length, service));
                if (!downloadResult.success) {
                    throw new Error(downloadResult.error || 'Загрузка не удалась');
                }
                trackJob.status = 'processing';
                const rawSrcPath = downloadResult.file_path;
                const srcPath = resolveDownloadedFilePath(rawSrcPath);
                if (!srcPath || !fs.existsSync(srcPath)) {
                    throw new Error(`Файл не найден: ${rawSrcPath}`);
                }
                // Copy file to uploads
                const ext = path.extname(srcPath).toLowerCase();
                const destFilename = `${uuid()}${ext}`;
                const destPath = path.join(PATHS.uploads, destFilename);
                fs.mkdirSync(PATHS.uploads, { recursive: true });
                fs.copyFileSync(srcPath, destPath);
                // Download cover image
                let coverPath;
                const coverUrl = trackMeta.images || albumCover;
                if (coverUrl) {
                    try {
                        coverPath = await downloadCoverImage(coverUrl);
                    }
                    catch (e) {
                        console.warn(`  ⚠️ Failed to download cover: ${e}`);
                    }
                }
                const meta = await extractMetadata(destPath);
                const title = trackMeta.name || meta.title || 'Unknown';
                const artist = trackMeta.artists || 'Unknown';
                const yearStr = trackMeta.release_date || '';
                const year = yearStr ? parseInt(yearStr.substring(0, 4)) || new Date().getFullYear() : new Date().getFullYear();
                const album = trackMeta.album_name || albumName || null;
                const resolvedGenre = await resolveImportGenre(trackMeta, genre, meta.genre);
                const importComment = buildSpotifyImportComment(trackMeta, job.spotifyUrl);
                // Create submission entry for moderation
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
                trackJob.gromkoTrackId = subId; // submission ID for tracking
                job.completedTracks++;
                // Clean up SpotiFLAC download
                try {
                    fs.unlinkSync(srcPath);
                    const parentDir = path.dirname(srcPath);
                    if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
                        fs.rmdirSync(parentDir);
                    }
                }
                catch { /* ignore cleanup errors */ }
            }
            catch (err) {
                trackJob.status = 'error';
                trackJob.error = err.message;
                job.failedTracks++;
                console.error(`  ❌ Failed to submit track "${trackJob.title}": ${err.message}`);
            }
            if (i < tracks.length - 1 && INTER_TRACK_DELAY_MS > 0) {
                await new Promise(r => setTimeout(r, INTER_TRACK_DELAY_MS));
            }
        }
        finalizeJob(job);
    }
    catch (err) {
        job.status = 'error';
        job.error = err.message;
        job.finishedAt = new Date().toISOString();
        throw err;
    }
}
function finalizeJob(job) {
    job.progress = 100;
    job.finishedAt = new Date().toISOString();
    if (job.completedTracks === 0 && job.failedTracks > 0) {
        job.status = 'error';
        job.error = `Не удалось загрузить ни одного трека (${job.failedTracks}/${job.totalTracks}).`;
        return;
    }
    job.status = 'done';
    if (job.failedTracks > 0) {
        job.error = `Завершено частично: ${job.completedTracks} успешно, ${job.failedTracks} с ошибкой.`;
    }
}
//# sourceMappingURL=spotify-import.js.map