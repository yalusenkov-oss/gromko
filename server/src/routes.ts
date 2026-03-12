/**
 * GROMKO API Routes — PostgreSQL + JWT Auth
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { v4 as uuid } from 'uuid';
import { slugify } from './slugify.js';
import { query, queryOne, execute } from './db.js';
import { CONFIG, PATHS, trackAudioDir, trackHlsDir } from './config.js';
import { enqueueTrack, extractMetadata, getQueueStatus, fetchExternalCover, processCoverArt, fixTrackCover } from './audio-processor.js';
import {
  registerUser, loginUser, getUserById,
  authRequired, authOptional, adminRequired,
} from './auth.js';
import { parseArtistNames } from './parse-artists.js';
import { findExistingTrackByArtistAndTitle } from './track-dedupe.js';
import {
  recordEvent,
  rebuildTasteProfile,
  forYou,
  nextTrack,
  similarTracks,
  similarArtists,
  continueListening,
  newForYou,
  trendingForYou,
  rediscover,
  getUserTasteSummary,
} from './recommendations.js';
import {
  checkSpotiflacHealth,
  fetchSpotifyMetadata,
  searchSpotify,
  startSpotifyImport,
  startSpotifySubmission,
  getJob,
  getAllJobs,
} from './spotify-import.js';

const router = Router();

/* ═══════════════════════════════════════════════ */
/*  ACTIVE LISTENERS — in-memory heartbeat tracker */
/* ═══════════════════════════════════════════════ */
const HEARTBEAT_TTL = 45_000; // consider listener inactive after 45s without heartbeat
const activeListenersMap = new Map<string, { trackId: string; userId?: string; ts: number }>();

/** Clean up stale entries */
function pruneStaleListeners() {
  const now = Date.now();
  for (const [sid, entry] of activeListenersMap) {
    if (now - entry.ts > HEARTBEAT_TTL) activeListenersMap.delete(sid);
  }
}
setInterval(pruneStaleListeners, 15_000);

/** Get active listener count */
function getActiveListenerCount(): number {
  pruneStaleListeners();
  return activeListenersMap.size;
}

function mapAudioPublicPathToFs(publicPath: string): string | null {
  // /audio/{trackId}/{file}
  if (!publicPath.startsWith('/audio/')) return null;
  const rel = publicPath.replace(/^\/audio\//, '');
  return path.join(PATHS.audio, rel);
}

function resolveTrackSourcePath(trackId: string, row: any): string | null {
  const dir = trackAudioDir(trackId);
  const preferred = [
    path.join(dir, 'lossless.flac'),
    path.join(dir, 'high.m4a'),
    path.join(dir, 'medium.m4a'),
    path.join(dir, 'low.m4a'),
  ];
  for (const p of preferred) {
    if (fs.existsSync(p)) return p;
  }

  const streamCandidates = [row.stream_lossless, row.stream_high, row.stream_medium, row.stream_low]
    .filter((v: any) => typeof v === 'string' && v.length > 0) as string[];
  for (const streamPath of streamCandidates) {
    const fsPath = mapAudioPublicPathToFs(streamPath);
    if (fsPath && fs.existsSync(fsPath)) return fsPath;
  }

  return null;
}

async function prepareCoverTempPath(trackId: string, cover: string | null): Promise<string | undefined> {
  const localCandidates = [
    path.join(PATHS.covers, trackId, 'original.jpg'),
    path.join(PATHS.covers, trackId, 'large.webp'),
    path.join(PATHS.covers, trackId, 'medium.webp'),
  ];
  for (const p of localCandidates) {
    if (fs.existsSync(p)) return p;
  }

  if (!cover) return undefined;
  if (!/^https?:\/\//i.test(cover)) return undefined;

  try {
    const resp = await fetch(cover);
    if (!resp.ok) return undefined;
    const ext = cover.includes('.png') ? '.png' : cover.includes('.webp') ? '.webp' : '.jpg';
    const file = path.join(PATHS.temp, `reprocess-cover-${trackId}-${uuid()}${ext}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(file, buf);
    return file;
  } catch {
    return undefined;
  }
}

async function enqueueTrackReprocess(row: any): Promise<{ source: string; cover?: string }> {
  const source = resolveTrackSourcePath(row.id, row);
  if (!source) {
    throw new Error('Исходный файл не найден локально. Нужен хотя бы один локальный stream (lossless/high/medium/low).');
  }

  fs.mkdirSync(PATHS.temp, { recursive: true });
  const ext = path.extname(source) || '.m4a';
  const tempSource = path.join(PATHS.temp, `reprocess-${row.id}-${uuid()}${ext}`);
  fs.copyFileSync(source, tempSource);

  const tempCover = await prepareCoverTempPath(row.id, row.cover_path || null);

  await execute(`
    UPDATE tracks SET
      status = 'pending',
      processing_error = NULL,
      processing_started_at = NULL,
      processing_finished_at = NULL,
      updated_at = NOW()
    WHERE id = $1
  `, [row.id]);

  enqueueTrack(row.id, tempSource, tempCover, false);
  return { source: tempSource, cover: tempCover };
}

// ─── Multer config ───
const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(PATHS.uploads, { recursive: true });
    cb(null, PATHS.uploads);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuid()}${ext}`);
  },
});

const uploadFields = multer({
  storage: uploadStorage,
  limits: { fileSize: CONFIG.maxUploadSize },
}).fields([
  { name: 'audio', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
]);

// ═══════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════

/** POST /api/auth/register */
router.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, country, username } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Имя, email и пароль обязательны' });
    }
    const result = await registerUser(name, email, password, country, username);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** POST /api/auth/login */
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }
    const result = await loginUser(email, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

/** POST /api/admin/bootstrap — promote first admin (one-time) */
router.post('/admin/bootstrap', async (req: Request, res: Response) => {
  try {
    const { secret, userId } = req.body;
    // Simple secret to prevent random access
    if (secret !== 'gromko-bootstrap-2026') {
      return res.status(403).json({ error: 'Invalid secret' });
    }
    // Check if any admin already exists
    const existing = await queryOne(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    if (existing) {
      return res.status(400).json({ error: 'Admin already exists, bootstrap disabled' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    await execute(`UPDATE users SET role = 'admin' WHERE id = $1`, [userId]);
    const user = await getUserById(userId);
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/auth/me — current user */
router.get('/auth/me', authRequired, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

/** PUT /api/auth/me — update profile */
router.put('/auth/me', authRequired, async (req: Request, res: Response) => {
  try {
    const { name, avatar, bio, username } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name) { updates.push(`name = $${idx++}`); params.push(name); }
    if (avatar) { updates.push(`avatar = $${idx++}`); params.push(avatar); }
    if (bio !== undefined) { updates.push(`bio = $${idx++}`); params.push(bio); }
    if (username !== undefined) {
      const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (clean.length < 3) return res.status(400).json({ error: 'Имя пользователя должно содержать минимум 3 символа' });
      if (clean.length > 30) return res.status(400).json({ error: 'Имя пользователя не должно превышать 30 символов' });
      const existingUsername = await queryOne('SELECT id FROM users WHERE username = $1 AND id != $2', [clean, req.user!.id]);
      if (existingUsername) return res.status(400).json({ error: 'Это имя пользователя уже занято' });
      updates.push(`username = $${idx++}`);
      params.push(clean);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Нечего обновлять' });
    }

    params.push(req.user!.id);
    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, params);

    const updated = await getUserById(req.user!.id);
    res.json({ user: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/upload/avatar — upload user avatar */
router.post('/upload/avatar', authRequired, (req: Request, res: Response) => {
  const avatarStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(PATHS.uploads, { recursive: true });
      cb(null, PATHS.uploads);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuid()}${ext}`);
    },
  });
  const avatarUpload = multer({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
      if (/^image\//.test(file.mimetype)) cb(null, true);
      else cb(new Error('Only images allowed'));
    },
  }).single('file');

  avatarUpload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file' });
    const url = `/uploads/${file.filename}`;
    // Update user avatar in DB
    try {
      await execute('UPDATE users SET avatar = $1 WHERE id = $2', [url, req.user!.id]);
      const updated = await getUserById(req.user!.id);
      res.json({ url, user: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
});

// ═══════════════════════════════════════════════
// TRACKS API
// ═══════════════════════════════════════════════

/** GET /api/tracks — list tracks */
router.get('/tracks', async (req: Request, res: Response) => {
  try {
    const {
      genre, sort = 'plays', order = 'desc',
      search, limit = '50', offset = '0',
    } = req.query as Record<string, string>;

    let where = `WHERE status = 'ready'`;
    const params: any[] = [];
    let paramIdx = 1;

    if (genre && genre !== 'Все') {
      where += ` AND genre = $${paramIdx++}`;
      params.push(genre);
    }
    if (search) {
      where += ` AND (title ILIKE $${paramIdx} OR artist ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    const sortCol = sort === 'plays' ? 'plays' : sort === 'likes' ? 'likes'
      : sort === 'year' ? 'year' : sort === 'title' ? 'title'
      : sort === 'new' ? 'created_at' : 'plays';
    const sortOrder = sort === 'new' ? 'DESC' : (order === 'asc' ? 'ASC' : 'DESC');

    const countRes = await queryOne(`SELECT COUNT(*) as total FROM tracks ${where}`, params);
    const total = Number(countRes?.total || 0);

    const lim = Number(limit);
    const off = Number(offset);
    params.push(lim, off);

    const tracks = await query(`
      SELECT id, title, artist, artist_slug, genre, year, duration, plays, likes,
             explicit, is_new, featured, cover_path, status,
             stream_low, stream_medium, stream_high, stream_lossless,
             hls_master, waveform_peaks, meta_album, meta_bpm,
             meta_loudness_lufs, created_at
      FROM tracks ${where}
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `, params);

    const withArtists = await attachArtists(tracks);
    res.json({ tracks: withArtists.map(formatTrackRow), total, limit: lim, offset: off });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/tracks/:id */
router.get('/tracks/:id', async (req: Request, res: Response) => {
  const track = await queryOne('SELECT * FROM tracks WHERE id = $1', [req.params.id]);
  if (!track) return res.status(404).json({ error: 'Трек не найден' });
  const [withArtists] = await attachArtists([track]);
  res.json(formatTrackRow(withArtists));
});

/** GET /api/trending — most played tracks in last 24 hours */
router.get('/trending', async (_req: Request, res: Response) => {
  try {
    const rows = await query(`
      SELECT ph.track_id, COUNT(*) as cnt
      FROM play_history ph
      WHERE ph.played_at > NOW() - INTERVAL '24 hours'
      GROUP BY ph.track_id
      ORDER BY cnt DESC
      LIMIT 10
    `);
    const trackIds = rows.map((r: any) => r.track_id);
    if (trackIds.length === 0) return res.json({ tracks: [] });

    const placeholders = trackIds.map((_: any, i: number) => `$${i + 1}`).join(',');
    const tracks = await query(`SELECT * FROM tracks WHERE id IN (${placeholders}) AND status = 'ready'`, trackIds);
    const withArtists = await attachArtists(tracks);
    // Keep the trending order
    const mapped = withArtists.map(formatTrackRow);
    const ordered = trackIds.map((id: string) => mapped.find((t: any) => t.id === id)).filter(Boolean);
    res.json({ tracks: ordered, playsData: rows.map((r: any) => ({ trackId: r.track_id, plays24h: Number(r.cnt) })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Auto-update hero track every hour (most listened in 24h) */
async function autoUpdateHeroTrack() {
  try {
    const setting = await queryOne(`SELECT value FROM site_settings WHERE key = 'hero_mode'`);
    if (setting?.value !== 'auto') return; // only run in auto mode

    const top = await queryOne(`
      SELECT track_id, COUNT(*) as cnt
      FROM play_history
      WHERE played_at > NOW() - INTERVAL '24 hours'
      GROUP BY track_id
      ORDER BY cnt DESC
      LIMIT 1
    `);
    if (top) {
      await execute('UPDATE tracks SET featured = FALSE WHERE featured = TRUE');
      await execute('UPDATE tracks SET featured = TRUE WHERE id = $1', [top.track_id]);
    }
  } catch (err) {
    console.error('Auto-hero update failed:', err);
  }
}
// Run every hour
setInterval(autoUpdateHeroTrack, 60 * 60 * 1000);
// Also run once on startup (after 10s delay for DB to be ready)
setTimeout(autoUpdateHeroTrack, 10000);

/** GET /api/tracks/:id/waveform */
router.get('/tracks/:id/waveform', async (req: Request, res: Response) => {
  const track = await queryOne('SELECT waveform_peaks FROM tracks WHERE id = $1', [req.params.id]);
  if (!track) return res.status(404).json({ error: 'Трек не найден' });
  res.json({ peaks: track.waveform_peaks || [] });
});

/** POST /api/tracks/:id/play — record a play event (called by frontend when track starts) */
router.post('/tracks/:id/play', authOptional, async (req: Request, res: Response) => {
  const track = await queryOne(`SELECT id, artist_slug, genre FROM tracks WHERE id = $1 AND status = 'ready'`, [req.params.id]);
  if (!track) return res.status(404).json({ error: 'Трек не найден' });

  const userId = req.user?.id || null;
  const quality = (req.body?.quality as string) || 'medium';
  const context = (req.body?.context as string) || undefined;

  // Increment plays counter
  execute('UPDATE tracks SET plays = plays + 1, updated_at = NOW() WHERE id = $1', [req.params.id]).catch(() => {});
  // Record in play_history
  execute('INSERT INTO play_history (track_id, quality, user_id) VALUES ($1, $2, $3)', [req.params.id, quality, userId]).catch(() => {});
  // Update artist total_plays
  execute(`
    UPDATE artists SET total_plays = total_plays + 1
    WHERE id IN (SELECT artist_id FROM track_artists WHERE track_id = $1)
       OR slug = $2
  `, [req.params.id, track.artist_slug]).catch(() => {});

  // Record user event for recommendation engine
  if (userId) {
    recordEvent({
      userId,
      eventType: 'play',
      trackId: req.params.id as string,
      artistSlug: track.artist_slug,
      genre: track.genre,
      context,
    });
  }

  res.json({ ok: true });
});

/** GET /api/tracks/:id/stream — audio stream with Range support */
router.get('/tracks/:id/stream', async (req: Request, res: Response) => {
  const quality = (req.query.quality as string) || 'medium';
  const track = await queryOne(`SELECT * FROM tracks WHERE id = $1 AND status = 'ready'`, [req.params.id]);
  if (!track) return res.status(404).json({ error: 'Трек не найден' });

  let streamPath: string;
  switch (quality) {
    case 'low': streamPath = track.stream_low; break;
    case 'high': streamPath = track.stream_high; break;
    case 'lossless': streamPath = track.stream_lossless || track.stream_high; break;
    default: streamPath = track.stream_medium; break;
  }

  if (!streamPath) return res.status(404).json({ error: `Качество "${quality}" недоступно` });

  // Play counting is now handled by POST /api/tracks/:id/play
  // The stream endpoint only serves the audio file

  // If URL is absolute (S3), redirect to it — browser/player fetches directly from CDN
  if (streamPath.startsWith('http://') || streamPath.startsWith('https://')) {
    return res.redirect(302, streamPath);
  }

  // Otherwise serve from local filesystem
  const filePath = path.join(PATHS.data, streamPath.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл не найден на диске' });

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const mime = filePath.endsWith('.flac') ? 'audio/flac' : 'audio/mp4';
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

/** GET /api/tracks/:id/hls/:file */
router.get('/tracks/:id/hls/:file', async (req: Request, res: Response) => {
  const trackId = req.params.id as string;
  const file = req.params.file as string;

  // Check if track has S3 URL for HLS master
  const track = await queryOne('SELECT hls_master FROM tracks WHERE id = $1', [trackId]);
  if (track?.hls_master?.startsWith('http')) {
    // Redirect to S3 — replace master.m3u8 with requested file
    const baseUrl = track.hls_master.replace(/\/[^/]+$/, '');
    return res.redirect(302, `${baseUrl}/${file}`);
  }

  // Local fallback
  const hlsPath = path.join(trackHlsDir(trackId), file);
  if (!fs.existsSync(hlsPath)) return res.status(404).json({ error: 'HLS file not found' });

  const ext = path.extname(file);
  let mime = 'application/octet-stream';
  if (ext === '.m3u8') mime = 'application/vnd.apple.mpegurl';
  else if (ext === '.ts') mime = 'video/mp2t';

  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  fs.createReadStream(hlsPath).pipe(res);
});

// ═══════════════════════════════════════════════
// UPLOAD
// ═══════════════════════════════════════════════

/** POST /api/tracks/upload */
router.post('/tracks/upload', adminRequired, (req: Request, res: Response) => {
  uploadFields(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const files = req.files as { [f: string]: Express.Multer.File[] } | undefined;
    const audioFile = files?.audio?.[0];
    const coverFile = files?.cover?.[0];
    if (!audioFile) return res.status(400).json({ error: 'Аудиофайл обязателен' });

    try {
      const meta = await extractMetadata(audioFile.path);
      const trackId = uuid();
      const {
        title = meta.title || path.parse(audioFile.originalname).name,
        artist = meta.artist || 'Неизвестный артист',
        genre = meta.genre || 'Другое',
        year = meta.year || new Date().getFullYear(),
        explicit = 'false',
        albumName,
      } = req.body;

      // Multi-artist: split by ", " / "feat." / "ft." / "&" and ensure each artist exists
      const artistNames = parseArtistNames(artist as string);
      const primaryName = artistNames[0] || artist;
      const slug = slugify(primaryName);

      await execute(`
        INSERT INTO tracks (id, title, artist, artist_slug, genre, year, duration,
                           original_filename, original_format, original_size, original_bitrate,
                           original_sample_rate, original_channels, explicit, status, meta_album)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15)
      `, [
        trackId, title, artist, slug, genre, Number(year), meta.duration,
        audioFile.originalname, meta.format, audioFile.size, meta.bitrate,
        meta.sampleRate, meta.channels, explicit === 'true',
        albumName || meta.album || null,
      ]);

      // Create artists and link via junction table
      for (let i = 0; i < artistNames.length; i++) {
        const aName = artistNames[i];
        const aSlug = slugify(aName);
        const existing = await queryOne('SELECT id FROM artists WHERE slug = $1', [aSlug]);
        let artistId: string;
        if (existing) {
          artistId = existing.id;
        } else {
          artistId = uuid();
          await execute(
            `INSERT INTO artists (id, name, slug, genre, tracks_count, total_plays) VALUES ($1, $2, $3, $4, 0, 0)`,
            [artistId, aName, aSlug, genre]
          );
        }
        await execute(
          `INSERT INTO track_artists (track_id, artist_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [trackId, artistId, i]
        );
      }

      enqueueTrack(trackId, audioFile.path, coverFile?.path);

      res.status(201).json({
        trackId, status: 'pending',
        message: 'Трек загружен и поставлен в очередь на обработку',
      });
    } catch (error: any) {
      if (audioFile && fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
      if (coverFile && fs.existsSync(coverFile.path)) fs.unlinkSync(coverFile.path);
      res.status(500).json({ error: error.message || 'Ошибка обработки' });
    }
  });
});

/** GET /api/tracks/:id/status */
router.get('/tracks/:id/status', async (req: Request, res: Response) => {
  const track = await queryOne(
    'SELECT id, title, status, processing_error, processing_started_at, processing_finished_at FROM tracks WHERE id = $1',
    [req.params.id]
  );
  if (!track) return res.status(404).json({ error: 'Трек не найден' });
  res.json({
    id: track.id, title: track.title, status: track.status,
    error: track.processing_error,
    startedAt: track.processing_started_at,
    finishedAt: track.processing_finished_at,
  });
});

// ═══════════════════════════════════════════════
// USER ACTIONS (require auth)
// ═══════════════════════════════════════════════

/** POST /api/tracks/:id/like — toggle like */
router.post('/tracks/:id/like', authRequired, async (req: Request, res: Response) => {
  const trackId = req.params.id as string;
  const userId = req.user!.id;
  const user = await queryOne('SELECT liked_tracks FROM users WHERE id = $1', [userId]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const liked: string[] = Array.isArray(user.liked_tracks) ? user.liked_tracks : [];
  const isLiked = liked.includes(trackId);

  if (isLiked) {
    await execute('UPDATE users SET liked_tracks = array_remove(liked_tracks, $1) WHERE id = $2', [trackId, userId]);
    await execute('UPDATE tracks SET likes = GREATEST(likes - 1, 0) WHERE id = $1', [trackId]);
    recordEvent({ userId, eventType: 'unlike', trackId });
  } else {
    await execute('UPDATE users SET liked_tracks = array_append(liked_tracks, $1) WHERE id = $2', [trackId, userId]);
    await execute('UPDATE tracks SET likes = likes + 1 WHERE id = $1', [trackId]);
    recordEvent({ userId, eventType: 'like', trackId });
  }

  res.json({ liked: !isLiked });
});

/** POST /api/albums/:name/like — toggle album like */
router.post('/albums/:name/like', authRequired, async (req: Request, res: Response) => {
  const albumName = decodeURIComponent(req.params.name as string);
  const userId = req.user!.id;
  const user = await queryOne('SELECT liked_albums FROM users WHERE id = $1', [userId]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const liked: string[] = Array.isArray(user.liked_albums) ? user.liked_albums : [];
  const isLiked = liked.includes(albumName);

  if (isLiked) {
    await execute('UPDATE users SET liked_albums = array_remove(liked_albums, $1) WHERE id = $2', [albumName, userId]);
  } else {
    await execute('UPDATE users SET liked_albums = array_append(liked_albums, $1) WHERE id = $2', [albumName, userId]);
  }

  res.json({ liked: !isLiked });
});

/** POST /api/artists/:slug/like — toggle artist like */
router.post('/artists/:slug/like', authRequired, async (req: Request, res: Response) => {
  const artistSlug = req.params.slug as string;
  const userId = req.user!.id;
  const user = await queryOne('SELECT liked_artists FROM users WHERE id = $1', [userId]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const liked: string[] = Array.isArray(user.liked_artists) ? user.liked_artists : [];
  const isLiked = liked.includes(artistSlug);

  if (isLiked) {
    await execute('UPDATE users SET liked_artists = array_remove(liked_artists, $1) WHERE id = $2', [artistSlug, userId]);
  } else {
    await execute('UPDATE users SET liked_artists = array_append(liked_artists, $1) WHERE id = $2', [artistSlug, userId]);
    recordEvent({ userId, eventType: 'follow_artist', artistSlug });
  }

  res.json({ liked: !isLiked });
});

// ═══════════════════════════════════════════════
// EVENT TRACKING & RECOMMENDATIONS
// ═══════════════════════════════════════════════

/** POST /api/events — record a user event for recommendation engine */
router.post('/events', authRequired, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { eventType, trackId, artistSlug, genre, context, durationListened, trackDuration, sessionId } = req.body;

  if (!eventType) return res.status(400).json({ error: 'eventType required' });

  const validEvents = ['play', 'finish', 'skip', 'replay', 'like', 'unlike',
    'add_to_playlist', 'share', 'follow_artist', 'open_track', 'open_artist',
    'search', 'queue_next'];
  if (!validEvents.includes(eventType)) {
    return res.status(400).json({ error: 'Invalid eventType' });
  }

  // Auto-resolve genre and artistSlug from track if not provided by frontend
  let resolvedGenre = genre;
  let resolvedArtistSlug = artistSlug;
  if (trackId && (!resolvedGenre || !resolvedArtistSlug)) {
    try {
      const trackRow = await queryOne('SELECT genre, artist_slug FROM tracks WHERE id = $1', [trackId]);
      if (trackRow) {
        if (!resolvedGenre) resolvedGenre = trackRow.genre;
        if (!resolvedArtistSlug) resolvedArtistSlug = trackRow.artist_slug;
      }
    } catch { /* non-critical — proceed without */ }
  }

  recordEvent({
    userId,
    eventType,
    trackId,
    artistSlug: resolvedArtistSlug,
    genre: resolvedGenre,
    context,
    durationListened,
    trackDuration,
    sessionId,
  });

  res.json({ ok: true });
});

/** GET /api/recommendations/for-you — персональный микс (works without auth too — falls back to popularity) */
router.get('/recommendations/for-you', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const userId = req.user?.id || null;
    const tracks = await forYou(userId, limit);
    const withArtists = await attachArtists(tracks);
    res.json(withArtists.map(formatTrackRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/recommendations/next — что поставить после текущего трека */
router.get('/recommendations/next', async (req: Request, res: Response) => {
  try {
    const trackId = req.query.trackId as string;
    if (!trackId) return res.status(400).json({ error: 'trackId required' });

    const recentIds = req.query.recent ? (req.query.recent as string).split(',') : [];
    const userId = req.user?.id || null;
    const track = await nextTrack(userId, trackId, recentIds);
    if (!track) return res.json(null);

    const [withArtists] = await attachArtists([track]);
    res.json(formatTrackRow(withArtists));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/recommendations/similar/:id — похожие треки */
router.get('/recommendations/similar/:id', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(20, Number(req.query.limit) || 10);
    const tracks = await similarTracks(req.params.id as string, limit);
    const withArtists = await attachArtists(tracks);
    res.json(withArtists.map(formatTrackRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/recommendations/similar-artists/:slug — похожие артисты */
router.get('/recommendations/similar-artists/:slug', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(20, Number(req.query.limit) || 6);
    const artists = await similarArtists(req.params.slug as string, limit);
    res.json(artists.map(formatArtistRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/recommendations/continue — продолжить слушать */
router.get('/recommendations/continue', authRequired, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(20, Number(req.query.limit) || 10);
    const tracks = await continueListening(req.user!.id, limit);
    const withArtists = await attachArtists(tracks);
    res.json(withArtists.map(formatTrackRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/recommendations/new-for-you — новинки (персонализированные если авторизован) */
router.get('/recommendations/new-for-you', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(20, Number(req.query.limit) || 10);
    const userId = req.user?.id || null;
    const tracks = await newForYou(userId, limit);
    const withArtists = await attachArtists(tracks);
    res.json(withArtists.map(formatTrackRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/recommendations/trending — тренды в ваших жанрах */
router.get('/recommendations/trending', authRequired, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(20, Number(req.query.limit) || 10);
    const tracks = await trendingForYou(req.user!.id, limit);
    const withArtists = await attachArtists(tracks);
    res.json(withArtists.map(formatTrackRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/recommendations/rediscover — забытые любимые */
router.get('/recommendations/rediscover', authRequired, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(20, Number(req.query.limit) || 10);
    const tracks = await rediscover(req.user!.id, limit);
    const withArtists = await attachArtists(tracks);
    res.json(withArtists.map(formatTrackRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/recommendations/taste — ваш музыкальный профиль */
router.get('/recommendations/taste', authRequired, async (req: Request, res: Response) => {
  try {
    const summary = await getUserTasteSummary(req.user!.id);
    res.json(summary || { topGenres: [], topArtists: [], avgListenRatio: 0, skipRate: 0, explorationScore: 50, timePreferences: {}, eventsProcessed: 0, preferredBpm: { min: 80, max: 160 } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/profile/taste-summary — alias for /recommendations/taste */
router.get('/profile/taste-summary', authRequired, async (req: Request, res: Response) => {
  try {
    const summary = await getUserTasteSummary(req.user!.id);
    res.json(summary || { topGenres: [], topArtists: [], avgListenRatio: 0, skipRate: 0, explorationScore: 50, timePreferences: {}, eventsProcessed: 0, preferredBpm: { min: 80, max: 160 } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// PROFILE STATS
// ═══════════════════════════════════════════════

/** GET /api/profile/stats — listening statistics for current user */
router.get('/profile/stats', authRequired, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const [totalPlays, monthPlays, totalTime, monthTime, topArtists, playlists] = await Promise.all([
      // Total plays
      queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM play_history WHERE user_id = $1`, [userId]),
      // Plays this month
      queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM play_history WHERE user_id = $1 AND played_at > NOW() - INTERVAL '30 days'`, [userId]),
      // Total listening time (from play_history duration or fallback to track duration)
      queryOne<{ s: string }>(`
        SELECT COALESCE(SUM(CASE WHEN ph.duration_listened > 0 THEN ph.duration_listened ELSE t.duration END), 0) as s
        FROM play_history ph JOIN tracks t ON t.id = ph.track_id WHERE ph.user_id = $1
      `, [userId]),
      // This month listening time
      queryOne<{ s: string }>(`
        SELECT COALESCE(SUM(CASE WHEN ph.duration_listened > 0 THEN ph.duration_listened ELSE t.duration END), 0) as s
        FROM play_history ph JOIN tracks t ON t.id = ph.track_id WHERE ph.user_id = $1 AND ph.played_at > NOW() - INTERVAL '30 days'
      `, [userId]),
      // Top listened artists (by play count)
      query(`
        SELECT a.name, a.slug, a.photo, COUNT(*) as plays
        FROM play_history ph
        JOIN tracks t ON t.id = ph.track_id
        LEFT JOIN track_artists ta ON ta.track_id = t.id
        LEFT JOIN artists a ON a.id = ta.artist_id OR a.slug = t.artist_slug
        WHERE ph.user_id = $1 AND a.id IS NOT NULL
        GROUP BY a.id, a.name, a.slug, a.photo
        ORDER BY plays DESC
        LIMIT 10
      `, [userId]),
      // Playlists count
      queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM playlists WHERE user_id = $1`, [userId]),
    ]);

    // Last active play
    const lastActive = await queryOne<{ played_at: string }>(
      `SELECT played_at FROM play_history WHERE user_id = $1 ORDER BY played_at DESC LIMIT 1`, [userId]
    );

    res.json({
      totalPlays: Number(totalPlays?.c || 0),
      monthPlays: Number(monthPlays?.c || 0),
      totalTimeSeconds: Number(totalTime?.s || 0),
      monthTimeSeconds: Number(monthTime?.s || 0),
      topListenedArtists: (topArtists || []).map((a: any) => ({
        name: a.name, slug: a.slug, photo: a.photo, plays: Number(a.plays),
      })),
      playlistsCount: Number(playlists?.c || 0),
      lastActive: lastActive?.played_at || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/profile/history — recent listening history */
router.get('/profile/history', authRequired, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(50, Number(req.query.limit) || 30);

    const rows = await query(`
      SELECT DISTINCT ON (t.id) t.*, ph.played_at
      FROM play_history ph
      JOIN tracks t ON t.id = ph.track_id AND t.status = 'ready'
      WHERE ph.user_id = $1
      ORDER BY t.id, ph.played_at DESC
    `, [userId]);

    // Re-sort by most recently played
    rows.sort((a: any, b: any) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime());
    const limited = rows.slice(0, limit);
    const withArtists = await attachArtists(limited);
    res.json(withArtists.map((r: any) => ({
      ...formatTrackRow(r),
      playedAt: r.played_at,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/profile/activity — recent activity feed */
router.get('/profile/activity', authRequired, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(50, Number(req.query.limit) || 20);

    const events = await query(`
      (
        SELECT DISTINCT ON (ue.track_id) ue.event_type, ue.track_id, ue.artist_slug, ue.created_at,
               t.title as track_title, t.artist as track_artist, t.cover_path as track_cover,
               a.name as artist_name, a.photo as artist_photo
        FROM user_events ue
        LEFT JOIN tracks t ON t.id = ue.track_id
        LEFT JOIN artists a ON a.slug = ue.artist_slug
        WHERE ue.user_id = $1 AND ue.event_type = 'play'
        ORDER BY ue.track_id, ue.created_at DESC
      )
      UNION ALL
      (
        SELECT ue.event_type, ue.track_id, ue.artist_slug, ue.created_at,
               t.title as track_title, t.artist as track_artist, t.cover_path as track_cover,
               a.name as artist_name, a.photo as artist_photo
        FROM user_events ue
        LEFT JOIN tracks t ON t.id = ue.track_id
        LEFT JOIN artists a ON a.slug = ue.artist_slug
        WHERE ue.user_id = $1
          AND ue.event_type IN ('like', 'unlike', 'follow_artist', 'add_to_playlist', 'share', 'finish')
        ORDER BY ue.created_at DESC
      )
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    res.json(events.map((e: any) => ({
      type: e.event_type,
      trackId: e.track_id,
      trackTitle: e.track_title,
      trackArtist: e.track_artist,
      trackCover: e.track_cover,
      artistSlug: e.artist_slug,
      artistName: e.artist_name,
      artistPhoto: e.artist_photo,
      createdAt: e.created_at,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// ARTISTS
// ═══════════════════════════════════════════════

router.get('/artists', async (_req: Request, res: Response) => {
  const artists = await query(`
    SELECT a.*,
      (SELECT COUNT(DISTINCT t.id) FROM tracks t
       LEFT JOIN track_artists ta ON ta.track_id = t.id
       WHERE (ta.artist_id = a.id OR t.artist_slug = a.slug)
         AND t.status = 'ready'
      ) AS tracks_count
    FROM artists a ORDER BY a.total_plays DESC
  `);
  res.json(artists.map(formatArtistRow));
});

router.get('/artists/:slug', async (req: Request, res: Response) => {
  const artist = await queryOne('SELECT * FROM artists WHERE slug = $1', [req.params.slug]);
  if (!artist) return res.status(404).json({ error: 'Артист не найден' });

  // Find tracks via junction table (multi-artist) OR via legacy artist_slug field
  const tracks = await query(
    `SELECT DISTINCT t.* FROM tracks t
     LEFT JOIN track_artists ta ON ta.track_id = t.id
     LEFT JOIN artists a ON a.id = ta.artist_id
     WHERE (a.slug = $1 OR t.artist_slug = $1) AND t.status = 'ready'
     ORDER BY t.plays DESC`,
    [req.params.slug]
  );
  const withArtists = await attachArtists(tracks);
  res.json({ ...formatArtistRow(artist), tracks: withArtists.map(formatTrackRow) });
});

// ═══════════════════════════════════════════════
// STATIC / UTILITY
// ═══════════════════════════════════════════════

router.get('/genres', async (_req: Request, res: Response) => {
  const genres = await query(`
    SELECT genre, COUNT(*) as count, COALESCE(SUM(plays), 0) as "totalPlays"
    FROM tracks WHERE status = 'ready'
    GROUP BY genre ORDER BY "totalPlays" DESC
  `);
  res.json(genres);
});

router.get('/stats', async (_req: Request, res: Response) => {
  const [tracks, artists, plays, pending, processing, errors] = await Promise.all([
    queryOne(`SELECT COUNT(*) as c FROM tracks WHERE status = 'ready'`),
    queryOne('SELECT COUNT(*) as c FROM artists'),
    queryOne('SELECT COALESCE(SUM(plays), 0) as s FROM tracks'),
    queryOne(`SELECT COUNT(*) as c FROM tracks WHERE status IN ('pending', 'processing')`),
    queryOne(`SELECT COUNT(*) as c FROM tracks WHERE status = 'processing'`),
    queryOne(`SELECT COUNT(*) as c FROM tracks WHERE status = 'error'`),
  ]);
  res.json({
    tracks: Number(tracks?.c || 0),
    artists: Number(artists?.c || 0),
    totalPlays: Number(plays?.s || 0),
    pending: Number(pending?.c || 0),
    processing: Number(processing?.c || 0),
    errors: Number(errors?.c || 0),
    queue: getQueueStatus(),
  });
});

// ═══════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════

/** GET /api/admin/stats — extended dashboard stats */
router.get('/admin/stats', adminRequired, async (_req: Request, res: Response) => {
  const [
    totalTracks, totalArtists, totalUsers, totalPlays,
    pendingTracks, processingTracks, errorTracks, readyTracks,
    pendingSubmissions,
    recentUsers, recentPlays,
    topGenres,
  ] = await Promise.all([
    queryOne(`SELECT COUNT(*) as c FROM tracks WHERE status = 'ready'`),
    queryOne('SELECT COUNT(*) as c FROM artists'),
    queryOne('SELECT COUNT(*) as c FROM users'),
    queryOne('SELECT COALESCE(SUM(plays), 0) as s FROM tracks'),
    queryOne(`SELECT COUNT(*) as c FROM tracks WHERE status = 'pending'`),
    queryOne(`SELECT COUNT(*) as c FROM tracks WHERE status = 'processing'`),
    queryOne(`SELECT COUNT(*) as c FROM tracks WHERE status = 'error'`),
    queryOne(`SELECT COUNT(*) as c FROM tracks WHERE status = 'ready'`),
    queryOne(`SELECT COUNT(*) as c FROM submissions WHERE status = 'pending'`),
    queryOne(`SELECT COUNT(*) as c FROM users WHERE created_at > NOW() - INTERVAL '7 days'`),
    queryOne(`SELECT COUNT(*) as c FROM play_history WHERE played_at > NOW() - INTERVAL '24 hours'`),
    query(`SELECT genre, COUNT(*) as count FROM tracks WHERE status = 'ready' GROUP BY genre ORDER BY count DESC LIMIT 10`),
  ]);

  // Active listeners — real-time from heartbeat system
  const activeListenersCount = getActiveListenerCount();

  // Plays today / this week / this month
  const [playsToday, playsWeek, playsMonth] = await Promise.all([
    queryOne(`SELECT COUNT(*) as c FROM play_history WHERE played_at > NOW() - INTERVAL '24 hours'`),
    queryOne(`SELECT COUNT(*) as c FROM play_history WHERE played_at > NOW() - INTERVAL '7 days'`),
    queryOne(`SELECT COUNT(*) as c FROM play_history WHERE played_at > NOW() - INTERVAL '30 days'`),
  ]);

  // Top 10 tracks
  const topTracks = await query(`
    SELECT id, title, artist, artist_slug, cover_path, plays, genre, year
    FROM tracks WHERE status = 'ready' ORDER BY plays DESC LIMIT 10
  `);

  res.json({
    tracks: Number(totalTracks?.c || 0),
    artists: Number(totalArtists?.c || 0),
    users: Number(totalUsers?.c || 0),
    totalPlays: Number(totalPlays?.s || 0),
    pending: Number(pendingTracks?.c || 0),
    processing: Number(processingTracks?.c || 0),
    errors: Number(errorTracks?.c || 0),
    ready: Number(readyTracks?.c || 0),
    pendingSubmissions: Number(pendingSubmissions?.c || 0),
    recentUsers: Number(recentUsers?.c || 0),
    activeListeners: activeListenersCount,
    playsToday: Number(playsToday?.c || 0),
    playsWeek: Number(playsWeek?.c || 0),
    playsMonth: Number(playsMonth?.c || 0),
    topGenres: (topGenres || []).map((g: any) => ({ genre: g.genre, count: Number(g.count) })),
    topTracks: topTracks.map(formatTrackRow),
    queue: getQueueStatus(),
  });
});

/** GET /api/admin/settings — get site settings */
router.get('/admin/settings', adminRequired, async (_req: Request, res: Response) => {
  const rows = await query('SELECT key, value FROM site_settings');
  const settings: Record<string, string> = {};
  for (const r of rows) settings[(r as any).key] = (r as any).value;
  res.json(settings);
});

/** PUT /api/admin/settings — update site settings */
router.put('/admin/settings', adminRequired, async (req: Request, res: Response) => {
  const entries = Object.entries(req.body) as [string, string][];
  for (const [key, value] of entries) {
    await execute(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, String(value)]
    );
  }
  // If hero_mode changed to "auto", apply auto-hero immediately
  if (req.body.hero_mode === 'auto') {
    const top = await queryOne(`
      SELECT track_id, COUNT(*) as cnt
      FROM play_history
      WHERE played_at > NOW() - INTERVAL '24 hours'
      GROUP BY track_id
      ORDER BY cnt DESC
      LIMIT 1
    `);
    if (top) {
      await execute('UPDATE tracks SET featured = FALSE WHERE featured = TRUE');
      await execute('UPDATE tracks SET featured = TRUE WHERE id = $1', [(top as any).track_id]);
    }
  }
  res.json({ ok: true });
});

/** GET /api/admin/users */
router.get('/admin/users', adminRequired, async (_req: Request, res: Response) => {
  const users = await query(`
    SELECT u.id, u.name, u.email, u.role, u.avatar, u.is_blocked, u.created_at,
           array_length(u.liked_tracks, 1) as likes_count,
           (SELECT COUNT(*) FROM play_history ph WHERE ph.user_id = u.id) as total_plays,
           (SELECT MAX(ph.played_at) FROM play_history ph WHERE ph.user_id = u.id) as last_active
    FROM users u ORDER BY u.created_at DESC
  `);
  res.json(users.map((u: any) => ({
    id: u.id, name: u.name, email: u.email, role: u.role,
    avatar: u.avatar, isBlocked: !!u.is_blocked,
    createdAt: u.created_at,
    likesCount: Number(u.likes_count || 0),
    totalPlays: Number(u.total_plays || 0),
    lastActive: u.last_active || null,
  })));
});

router.put('/admin/users/:id/block', adminRequired, async (req: Request, res: Response) => {
  await execute('UPDATE users SET is_blocked = NOT is_blocked WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.put('/admin/users/:id/role', adminRequired, async (req: Request, res: Response) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Недопустимая роль' });
  await execute('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
  res.json({ ok: true });
});

router.delete('/admin/users/:id', adminRequired, async (req: Request, res: Response) => {
  const userId = req.params.id;
  try {
    await execute('DELETE FROM play_history WHERE user_id = $1', [userId]);
    await execute('DELETE FROM submissions WHERE user_id = $1', [userId]);
    await execute('DELETE FROM playlists WHERE user_id = $1', [userId]);
    await execute('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ ok: true });
  } catch (e: any) {
    console.error('deleteUser:', e);
    res.status(500).json({ error: 'Не удалось удалить пользователя' });
  }
});

/** PUT /api/admin/tracks/:id — edit track metadata */
router.put('/admin/tracks/:id', adminRequired, async (req: Request, res: Response) => {
  const { title, artist, genre, year, explicit, isNew, featured } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (title !== undefined) { updates.push(`title = $${idx++}`); params.push(title); }
  if (artist !== undefined) { updates.push(`artist = $${idx++}`); params.push(artist); }
  if (genre !== undefined) { updates.push(`genre = $${idx++}`); params.push(genre); }
  if (year !== undefined) { updates.push(`year = $${idx++}`); params.push(year); }
  if (explicit !== undefined) { updates.push(`explicit = $${idx++}`); params.push(explicit); }
  if (isNew !== undefined) { updates.push(`is_new = $${idx++}`); params.push(isNew); }
  if (featured !== undefined) { updates.push(`featured = $${idx++}`); params.push(featured); }

  if (updates.length === 0) return res.status(400).json({ error: 'Нечего обновлять' });

  updates.push(`updated_at = NOW()`);
  params.push(req.params.id);
  await execute(`UPDATE tracks SET ${updates.join(', ')} WHERE id = $${idx}`, params);

  const updated = await queryOne('SELECT * FROM tracks WHERE id = $1', [req.params.id]);
  if (!updated) return res.status(404).json({ error: 'Трек не найден' });
  const [withArtists] = await attachArtists([updated]);
  res.json(formatTrackRow(withArtists));
});

/** POST /api/admin/tracks/:id/reprocess — re-run processing for an existing track */
router.post('/admin/tracks/:id/reprocess', adminRequired, async (req: Request, res: Response) => {
  try {
    const row = await queryOne(`
      SELECT id, title, cover_path, stream_low, stream_medium, stream_high, stream_lossless
      FROM tracks
      WHERE id = $1
    `, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Трек не найден' });

    const result = await enqueueTrackReprocess(row);
    res.json({
      ok: true,
      trackId: row.id,
      sourceQueued: result.source,
      coverQueued: result.cover || null,
      queue: getQueueStatus(),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** POST /api/admin/tracks/reprocess — bulk reprocess by IDs */
router.post('/admin/tracks/reprocess', adminRequired, async (req: Request, res: Response) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.filter((x: any) => typeof x === 'string' && x.length > 0)
    : [];
  if (ids.length === 0) {
    return res.status(400).json({ error: 'Передайте ids: string[]' });
  }

  const placeholders = ids.map((_: string, i: number) => `$${i + 1}`).join(',');
  const rows = await query(`
    SELECT id, title, cover_path, stream_low, stream_medium, stream_high, stream_lossless
    FROM tracks
    WHERE id IN (${placeholders})
  `, ids);

  const rowMap = new Map<string, any>();
  for (const row of rows) rowMap.set(row.id, row);

  const queued: Array<{ id: string; title: string; sourceQueued: string; coverQueued: string | null }> = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const id of ids) {
    const row = rowMap.get(id);
    if (!row) {
      failed.push({ id, error: 'Трек не найден' });
      continue;
    }
    try {
      const result = await enqueueTrackReprocess(row);
      queued.push({
        id: row.id,
        title: row.title,
        sourceQueued: result.source,
        coverQueued: result.cover || null,
      });
    } catch (err: any) {
      failed.push({ id: row.id, error: err.message || 'Не удалось поставить в очередь' });
    }
  }

  res.json({
    ok: failed.length === 0,
    requested: ids.length,
    queuedCount: queued.length,
    failedCount: failed.length,
    queued,
    failed,
    queue: getQueueStatus(),
  });
});

/** DELETE /api/admin/tracks/errors — delete all tracks with status='error' (must be before :id route!) */
router.delete('/admin/tracks/errors', adminRequired, async (_req: Request, res: Response) => {
  try {
    const deleted = await execute(`DELETE FROM tracks WHERE status = 'error'`);
    res.json({ deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/admin/tracks/:id */
router.delete('/admin/tracks/:id', adminRequired, async (req: Request, res: Response) => {
  // Delete from junction table first, then track
  await execute('DELETE FROM track_artists WHERE track_id = $1', [req.params.id]);
  await execute('DELETE FROM play_history WHERE track_id = $1', [req.params.id]);
  const rows = await execute('DELETE FROM tracks WHERE id = $1', [req.params.id]);
  if (rows === 0) return res.status(404).json({ error: 'Трек не найден' });
  res.json({ ok: true });
});

/** POST /api/admin/tracks/bulk-delete — delete multiple tracks by IDs */
router.post('/admin/tracks/bulk-delete', adminRequired, async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
  const placeholders = ids.map((_: string, i: number) => `$${i + 1}`).join(',');
  await execute(`DELETE FROM track_artists WHERE track_id IN (${placeholders})`, ids);
  await execute(`DELETE FROM play_history WHERE track_id IN (${placeholders})`, ids);
  const deleted = await execute(`DELETE FROM tracks WHERE id IN (${placeholders})`, ids);
  res.json({ deleted });
});

/** POST /api/admin/tracks/fix-covers — fetch missing covers from external APIs (iTunes/Deezer) */
router.post('/admin/tracks/fix-covers', adminRequired, async (req: Request, res: Response) => {
  try {
    const tracks = await query(`
      SELECT id, title, artist, meta_album, cover_path
      FROM tracks
      WHERE status = 'ready'
      ORDER BY created_at DESC
    `);

    // Filter tracks with missing/placeholder covers
    const needsFix: typeof tracks = [];
    const forceAll = req.body.force === true;

    for (const t of tracks) {
      if (!t.cover_path) {
        needsFix.push(t);
        continue;
      }

      if (forceAll) {
        needsFix.push(t);
        continue;
      }

      // Local covers: /covers/{id}/medium.webp — check if file is < 5KB (placeholder is ~1-3KB)
      if (t.cover_path.startsWith('/covers/')) {
        const localPath = path.join(process.cwd(), 'data', t.cover_path);
        try {
          const stat = fs.statSync(localPath);
          if (stat.size < 5000) needsFix.push(t);
        } catch {
          needsFix.push(t); // file doesn't exist locally
        }
        continue;
      }

      // S3 covers (https://...) — check Content-Length via HEAD request
      if (t.cover_path.startsWith('http')) {
        try {
          const headRes = await fetch(t.cover_path, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
          const contentLength = Number(headRes.headers.get('content-length') || 0);
          if (!headRes.ok || contentLength < 5000) {
            // Placeholder cover is ~1-3KB, real covers are 20KB+
            needsFix.push(t);
          }
        } catch {
          needsFix.push(t); // can't reach S3 — assume broken
        }
        continue;
      }
    }

    // If `ids` param is provided, only fix those specific tracks
    const requestedIds: string[] = req.body.ids;
    const toFix = requestedIds?.length
      ? tracks.filter(t => requestedIds.includes(t.id))
      : needsFix;

    if (toFix.length === 0) {
      return res.json({ message: 'Нет треков с отсутствующими обложками', fixed: 0, total: tracks.length });
    }

    // Process in background — respond immediately with count
    const fixCount = toFix.length;
    res.json({
      message: `Запущено исправление обложек для ${fixCount} треков`,
      fixing: fixCount,
      total: tracks.length,
    });

    // Fix covers in background (sequential to avoid rate limiting)
    let fixed = 0;
    let failed = 0;
    for (const t of toFix) {
      try {
        const result = await fixTrackCover(t.id, t.artist, t.title, t.meta_album);
        if (result) {
          fixed++;
          console.log(`  ✅ [${fixed}/${fixCount}] Cover fixed: ${t.artist} — ${t.title}`);
        } else {
          failed++;
          console.log(`  ⚠️  [${fixed + failed}/${fixCount}] No cover found: ${t.artist} — ${t.title}`);
        }
      } catch (err: any) {
        failed++;
        console.error(`  ❌ [${fixed + failed}/${fixCount}] Error fixing cover: ${t.artist} — ${t.title}: ${err.message}`);
      }
      // Rate limit: wait 500ms between API calls to avoid being blocked
      await new Promise(r => setTimeout(r, 500));
    }
    console.log(`\n🎨 Cover fix complete: ${fixed} fixed, ${failed} failed out of ${fixCount}`);
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

/** PUT /api/admin/artists/:id — edit artist */
router.put('/admin/artists/:id', adminRequired, async (req: Request, res: Response) => {
  const { name, slug, photo, banner, bio, genre, socials } = req.body;
  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
  if (slug !== undefined) { updates.push(`slug = $${idx++}`); params.push(slug); }
  if (photo !== undefined) { updates.push(`photo = $${idx++}`); params.push(photo); }
  if (banner !== undefined) { updates.push(`banner = $${idx++}`); params.push(banner); }
  if (bio !== undefined) { updates.push(`bio = $${idx++}`); params.push(bio); }
  if (genre !== undefined) { updates.push(`genre = $${idx++}`); params.push(genre); }
  if (socials?.vk !== undefined) { updates.push(`socials_vk = $${idx++}`); params.push(socials.vk); }
  if (socials?.instagram !== undefined) { updates.push(`socials_instagram = $${idx++}`); params.push(socials.instagram); }
  if (socials?.telegram !== undefined) { updates.push(`socials_telegram = $${idx++}`); params.push(socials.telegram); }

  if (updates.length === 0) return res.status(400).json({ error: 'Нечего обновлять' });

  params.push(req.params.id);
  await execute(`UPDATE artists SET ${updates.join(', ')} WHERE id = $${idx}`, params);
  const updated = await queryOne('SELECT * FROM artists WHERE id = $1', [req.params.id]);
  if (!updated) return res.status(404).json({ error: 'Артист не найден' });
  res.json(formatArtistRow(updated));
});

/** DELETE /api/admin/artists/:id */
router.delete('/admin/artists/:id', adminRequired, async (req: Request, res: Response) => {
  await execute('DELETE FROM track_artists WHERE artist_id = $1', [req.params.id]);
  const rows = await execute('DELETE FROM artists WHERE id = $1', [req.params.id]);
  if (rows === 0) return res.status(404).json({ error: 'Артист не найден' });
  res.json({ ok: true });
});

/** GET /api/admin/artists/:id/tracks — get tracks linked to an artist */
router.get('/admin/artists/:id/tracks', adminRequired, async (req: Request, res: Response) => {
  const tracks = await query(`
    SELECT t.id, t.title, t.artist, t.artist_slug, t.cover_path, t.plays, t.genre, t.year, t.duration, ta.position
    FROM track_artists ta
    JOIN tracks t ON t.id = ta.track_id
    WHERE ta.artist_id = $1
    ORDER BY ta.position ASC
  `, [req.params.id]);
  res.json(tracks.map((t: any) => ({ ...formatTrackRow(t), position: t.position })));
});

/** POST /api/admin/artists/:id/tracks — link a track to an artist */
router.post('/admin/artists/:id/tracks', adminRequired, async (req: Request, res: Response) => {
  const { trackId } = req.body;
  if (!trackId) return res.status(400).json({ error: 'trackId обязателен' });
  const maxPos = await queryOne(
    'SELECT COALESCE(MAX(position), -1) as m FROM track_artists WHERE artist_id = $1',
    [req.params.id]
  );
  await execute(
    'INSERT INTO track_artists (track_id, artist_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [trackId, req.params.id, Number(maxPos?.m ?? -1) + 1]
  );
  // Update artist stats
  const cnt = await queryOne(
    "SELECT COUNT(DISTINCT ta.track_id) as c FROM track_artists ta JOIN tracks t ON t.id = ta.track_id WHERE ta.artist_id = $1 AND t.status = 'ready'",
    [req.params.id]
  );
  await execute('UPDATE artists SET tracks_count = $1 WHERE id = $2', [Number(cnt?.c || 0), req.params.id]);
  res.json({ ok: true });
});

/** DELETE /api/admin/artists/:id/tracks/:trackId — unlink a track from an artist */
router.delete('/admin/artists/:id/tracks/:trackId', adminRequired, async (req: Request, res: Response) => {
  await execute(
    'DELETE FROM track_artists WHERE artist_id = $1 AND track_id = $2',
    [req.params.id, req.params.trackId]
  );
  const cnt = await queryOne(
    "SELECT COUNT(DISTINCT ta.track_id) as c FROM track_artists ta JOIN tracks t ON t.id = ta.track_id WHERE ta.artist_id = $1 AND t.status = 'ready'",
    [req.params.id]
  );
  await execute('UPDATE artists SET tracks_count = $1 WHERE id = $2', [Number(cnt?.c || 0), req.params.id]);
  res.json({ ok: true });
});

/** POST /api/admin/artists/:id/photo — upload artist photo */
router.post('/admin/artists/:id/photo', adminRequired, (req: Request, res: Response) => {
  // Store artist photos in a dedicated subfolder inside covers
  const artistPhotoStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(PATHS.covers, 'artists');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${req.params.id}${ext}`);
    },
  });

  const upload = multer({
    storage: artistPhotoStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Только изображения'));
    },
  }).single('photo');

  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const photoUrl = `/covers/artists/${req.file.filename}`;
    await execute('UPDATE artists SET photo = $1 WHERE id = $2', [photoUrl, req.params.id]);
    res.json({ photo: photoUrl });
  });
});

/** PUT /api/admin/artists/:id/photo-url — set artist photo from external URL */
router.put('/admin/artists/:id/photo-url', adminRequired, async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL обязателен' });
  await execute('UPDATE artists SET photo = $1 WHERE id = $2', [url, req.params.id]);
  res.json({ photo: url });
});

/** POST /api/admin/artists/:id/banner — upload artist banner */
router.post('/admin/artists/:id/banner', adminRequired, (req: Request, res: Response) => {
  const bannerStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(PATHS.covers, 'artists');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${req.params.id}-banner${ext}`);
    },
  });
  const upload = multer({
    storage: bannerStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Только изображения'));
    },
  }).single('banner');
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const bannerUrl = `/covers/artists/${req.file.filename}`;
    await execute('UPDATE artists SET banner = $1 WHERE id = $2', [bannerUrl, req.params.id]);
    res.json({ banner: bannerUrl });
  });
});

/** PUT /api/admin/artists/:id/banner-url — set artist banner from external URL */
router.put('/admin/artists/:id/banner-url', adminRequired, async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'URL обязателен' });
  await execute('UPDATE artists SET banner = $1 WHERE id = $2', [url, req.params.id]);
  res.json({ banner: url });
});

// ─── Submissions (user-submitted tracks pending review) ───

/** GET /api/admin/submissions */
router.get('/admin/submissions', adminRequired, async (_req: Request, res: Response) => {
  const subs = await query(`
    SELECT s.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar
    FROM submissions s
    LEFT JOIN users u ON u.id = s.user_id
    ORDER BY s.created_at DESC
  `);
  res.json(subs.map((s: any) => {
    // Convert absolute file paths to relative URLs for admin preview
    const audioUrl = s.file_path ? `/uploads/${path.basename(s.file_path)}` : null;
    const coverUrl = s.cover_path ? `/uploads/${path.basename(s.cover_path)}` : null;
    return {
      id: s.id, userId: s.user_id, title: s.title, artist: s.artist,
      genre: s.genre, year: s.year, comment: s.comment,
      status: s.status, rejectReason: s.reject_reason,
      originalFilename: s.original_filename, filePath: s.file_path,
      coverUrl, audioUrl,
      releaseId: s.release_id || null,
      albumName: s.album_name || null,
      createdAt: s.created_at,
      user: { name: s.user_name, email: s.user_email, avatar: s.user_avatar },
    };
  }));
});

/** POST /api/submissions — user submits a track for review */
router.post('/submissions', authRequired, (req: Request, res: Response) => {
  uploadFields(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const files = req.files as { [f: string]: Express.Multer.File[] } | undefined;
    const audioFile = files?.audio?.[0];
    const coverFile = files?.cover?.[0];
    if (!audioFile) return res.status(400).json({ error: 'Аудиофайл обязателен' });

    try {
      const { title, artist, genre, year, comment, albumName, releaseId } = req.body;
      if (!title || !artist) return res.status(400).json({ error: 'Название и артист обязательны' });
      const existing = await findExistingTrackByArtistAndTitle(String(title), String(artist));
      if (existing) {
        return res.status(409).json({
          error: `Трек уже есть на платформе: ${existing.artist} — ${existing.title}`,
          existingTrack: {
            id: existing.id,
            title: existing.title,
            artist: existing.artist,
            url: `/track/${existing.id}`,
          },
        });
      }

      const subId = uuid();
      await execute(`
        INSERT INTO submissions (id, user_id, release_id, title, artist, genre, year, comment, status, original_filename, file_path, cover_path, album_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11, $12)
      `, [
        subId, req.user!.id, (releaseId && String(releaseId).trim()) || null, title, artist,
        genre || 'Другое', Number(year) || new Date().getFullYear(),
        comment || null, audioFile.originalname, audioFile.path,
        coverFile?.path || null, albumName || null,
      ]);

      res.status(201).json({ id: subId, status: 'pending', message: 'Трек отправлен на модерацию' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
});

/** POST /api/submissions/spotify — submit a track via Spotify URL */
router.post('/submissions/spotify', authRequired, async (req: Request, res: Response) => {
  try {
    const { url, genre = 'Другое' } = req.body;
    if (!url) return res.status(400).json({ error: 'URL обязателен' });

    // Validate URL format
    if (!url.includes('spotify.com/track/') && !url.includes('spotify.com/album/')) {
      return res.status(400).json({ error: 'Только ссылки на треки и альбомы Spotify' });
    }

    // Check SpotiFLAC availability
    const available = await checkSpotiflacHealth();
    if (!available) {
      return res.status(503).json({ error: 'Сервис импорта временно недоступен. Попробуйте позже.' });
    }

    // Duplicate check for single-track URLs before starting import job
    if (url.includes('spotify.com/track/')) {
      try {
        const metadata = await fetchSpotifyMetadata(url);
        const track = metadata?.track;
        if (track?.name && track?.artists) {
          const existing = await findExistingTrackByArtistAndTitle(track.name, track.artists);
          if (existing) {
            return res.status(409).json({
              error: `Этот трек уже есть на платформе: ${existing.artist} — ${existing.title}`,
              existingTrack: {
                id: existing.id,
                title: existing.title,
                artist: existing.artist,
                url: `/track/${existing.id}`,
              },
            });
          }
        }
      } catch {
        // If metadata check failed, continue with normal flow.
      }
    }

    const isAdmin = req.user!.role === 'admin';
    const jobId = startSpotifySubmission(url, req.user!.id, isAdmin, genre, 'tidal');

    res.status(201).json({
      jobId,
      message: isAdmin ? 'Импорт запущен' : 'Трек загружается и будет отправлен на модерацию',
      mode: isAdmin ? 'direct' : 'moderation',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/submissions/spotify/job/:id — check Spotify import job status */
router.get('/submissions/spotify/job/:id', authRequired, async (req: Request, res: Response) => {
  const job = getJob(req.params.id as string);
  if (!job) return res.status(404).json({ error: 'Задача не найдена' });
  res.json(job);
});

/** GET /api/submissions/spotify/health — check SpotiFLAC availability */
router.get('/submissions/spotify/health', authRequired, async (_req: Request, res: Response) => {
  const ok = await checkSpotiflacHealth();
  res.json({ available: ok });
});

/** GET /api/submissions/my — current user's submissions */
router.get('/submissions/my', authRequired, async (req: Request, res: Response) => {
  const subs = await query(
    'SELECT * FROM submissions WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user!.id]
  );
  res.json(subs.map((s: any) => ({
    id: s.id, title: s.title, artist: s.artist, genre: s.genre, year: s.year,
    comment: s.comment, status: s.status, rejectReason: s.reject_reason,
    releaseId: s.release_id || null,
    albumName: s.album_name || null,
    coverUrl: s.cover_path ? `/uploads/${path.basename(s.cover_path)}` : null,
    createdAt: s.created_at,
  })));
});

/** PUT /api/admin/submissions/:id/approve — approve & process */
router.put('/admin/submissions/:id/approve', adminRequired, async (req: Request, res: Response) => {
  const sub = await queryOne('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub) return res.status(404).json({ error: 'Заявка не найдена' });
  if (sub.status !== 'pending' && sub.status !== 'deferred') {
    return res.status(400).json({ error: 'Заявка уже обработана' });
  }

  // Check if file still exists
  if (!sub.file_path || !fs.existsSync(sub.file_path)) {
    return res.status(400).json({ error: 'Аудиофайл не найден на сервере' });
  }

  try {
    const meta = await extractMetadata(sub.file_path);
    const trackId = uuid();
    const artist = sub.artist;
    const artistNames = parseArtistNames(artist);
    const primarySlug = slugify(artistNames[0]);
    const albumName = sub.album_name || null;

    await execute(`
      INSERT INTO tracks (id, title, artist, artist_slug, genre, year, duration,
                         original_filename, original_format, original_size, original_bitrate,
                         original_sample_rate, original_channels, explicit, status, meta_album)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending',$15)
    `, [
      trackId, sub.title, artist, primarySlug, sub.genre, sub.year, meta.duration,
      sub.original_filename, meta.format, 0, meta.bitrate,
      meta.sampleRate, meta.channels, false, albumName,
    ]);

    // Create artists & link
    for (let i = 0; i < artistNames.length; i++) {
      const aName = artistNames[i];
      const aSlug = slugify(aName);
      const existing = await queryOne('SELECT id FROM artists WHERE slug = $1', [aSlug]);
      let artistId: string;
      if (existing) {
        artistId = existing.id;
      } else {
        artistId = uuid();
        await execute(
          `INSERT INTO artists (id, name, slug, genre, tracks_count, total_plays) VALUES ($1, $2, $3, $4, 0, 0)`,
          [artistId, aName, aSlug, sub.genre]
        );
      }
      await execute(
        `INSERT INTO track_artists (track_id, artist_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [trackId, artistId, i]
      );
    }

    // Enqueue for audio processing (with cover if available)
    const coverPath = sub.cover_path && fs.existsSync(sub.cover_path) ? sub.cover_path : undefined;
    enqueueTrack(trackId, sub.file_path, coverPath);

    // Update submission status
    await execute("UPDATE submissions SET status = 'approved' WHERE id = $1", [sub.id]);

    res.json({ ok: true, trackId, message: 'Трек одобрен и поставлен в очередь на обработку' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** PUT /api/admin/submissions/:id/reject */
router.put('/admin/submissions/:id/reject', adminRequired, async (req: Request, res: Response) => {
  const { reason } = req.body;
  const rows = await execute(
    "UPDATE submissions SET status = 'rejected', reject_reason = $1 WHERE id = $2 AND status IN ('pending', 'deferred')",
    [reason || null, req.params.id]
  );
  if (rows === 0) return res.status(404).json({ error: 'Заявка не найдена или уже обработана' });
  res.json({ ok: true });
});

/** PUT /api/admin/submissions/:id/defer */
router.put('/admin/submissions/:id/defer', adminRequired, async (req: Request, res: Response) => {
  const rows = await execute(
    "UPDATE submissions SET status = 'deferred' WHERE id = $1 AND status = 'pending'",
    [req.params.id]
  );
  if (rows === 0) return res.status(404).json({ error: 'Заявка не найдена' });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════
// PLAYLISTS API
// ═══════════════════════════════════════════════

/** GET /api/playlists/my — current user's playlists */
router.get('/playlists/my', authRequired, async (req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT * FROM playlists WHERE user_id = $1 ORDER BY updated_at DESC`,
      [req.user!.id]
    );
    res.json(rows.map(formatPlaylistRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/playlists — create playlist */
router.post('/playlists', authRequired, async (req: Request, res: Response) => {
  try {
    const { title, description, isPublic = false, trackIds = [] } = req.body;
    if (!title) return res.status(400).json({ error: 'Название обязательно' });
    const id = uuid();
    await execute(
      `INSERT INTO playlists (id, title, description, user_id, track_ids, is_public, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [id, title, description || null, req.user!.id, trackIds, !!isPublic]
    );
    const row = await queryOne('SELECT * FROM playlists WHERE id = $1', [id]);
    res.status(201).json(formatPlaylistRow(row));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/playlists/:id — get playlist with tracks */
router.get('/playlists/:id', authOptional, async (req: Request, res: Response) => {
  try {
    const pl = await queryOne('SELECT * FROM playlists WHERE id = $1', [req.params.id]);
    if (!pl) return res.status(404).json({ error: 'Плейлист не найден' });
    // If private, only owner can see
    if (!pl.is_public && (!req.user || req.user.id !== pl.user_id)) {
      return res.status(403).json({ error: 'Плейлист приватный' });
    }
    // Fetch tracks
    const trackIds: string[] = Array.isArray(pl.track_ids) ? pl.track_ids : [];
    let tracks: any[] = [];
    if (trackIds.length > 0) {
      const placeholders = trackIds.map((_: string, i: number) => `$${i + 1}`).join(',');
      const rows = await query(
        `SELECT * FROM tracks WHERE id IN (${placeholders}) AND status = 'ready'`, trackIds
      );
      const withArtists = await attachArtists(rows);
      const mapped = withArtists.map(formatTrackRow);
      // Preserve playlist order
      tracks = trackIds.map(id => mapped.find((t: any) => t.id === id)).filter(Boolean);
    }
    // Fetch owner info
    const owner = await queryOne('SELECT id, name, avatar FROM users WHERE id = $1', [pl.user_id]);
    res.json({
      ...formatPlaylistRow(pl),
      tracks,
      owner: owner ? { id: owner.id, name: owner.name, avatar: owner.avatar } : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/playlists/:id — update playlist */
router.put('/playlists/:id', authRequired, async (req: Request, res: Response) => {
  try {
    const pl = await queryOne('SELECT * FROM playlists WHERE id = $1', [req.params.id]);
    if (!pl) return res.status(404).json({ error: 'Плейлист не найден' });
    if (pl.user_id !== req.user!.id) return res.status(403).json({ error: 'Нет доступа' });

    const { title, description, isPublic, trackIds } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (title !== undefined) { updates.push(`title = $${idx++}`); params.push(title); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (isPublic !== undefined) { updates.push(`is_public = $${idx++}`); params.push(!!isPublic); }
    if (trackIds !== undefined) { updates.push(`track_ids = $${idx++}`); params.push(trackIds); }
    if (updates.length === 0) return res.status(400).json({ error: 'Нечего обновлять' });
    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);
    await execute(`UPDATE playlists SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    const updated = await queryOne('SELECT * FROM playlists WHERE id = $1', [req.params.id]);
    res.json(formatPlaylistRow(updated));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/playlists/:id — delete playlist */
router.delete('/playlists/:id', authRequired, async (req: Request, res: Response) => {
  try {
    const pl = await queryOne('SELECT user_id FROM playlists WHERE id = $1', [req.params.id]);
    if (!pl) return res.status(404).json({ error: 'Плейлист не найден' });
    if (pl.user_id !== req.user!.id && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    await execute('DELETE FROM playlists WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/playlists/:id/tracks — add track to playlist */
router.post('/playlists/:id/tracks', authRequired, async (req: Request, res: Response) => {
  try {
    const pl = await queryOne('SELECT * FROM playlists WHERE id = $1', [req.params.id]);
    if (!pl) return res.status(404).json({ error: 'Плейлист не найден' });
    if (pl.user_id !== req.user!.id) return res.status(403).json({ error: 'Нет доступа' });
    const { trackId } = req.body;
    if (!trackId) return res.status(400).json({ error: 'trackId обязателен' });
    const current: string[] = Array.isArray(pl.track_ids) ? pl.track_ids : [];
    if (current.includes(trackId)) return res.json({ ok: true, message: 'Уже в плейлисте' });
    await execute(
      `UPDATE playlists SET track_ids = array_append(track_ids, $1), updated_at = NOW() WHERE id = $2`,
      [trackId, req.params.id]
    );
    // Record event for recommendations
    recordEvent({ userId: req.user!.id, eventType: 'add_to_playlist', trackId });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/playlists/:id/tracks/:trackId — remove track from playlist */
router.delete('/playlists/:id/tracks/:trackId', authRequired, async (req: Request, res: Response) => {
  try {
    const pl = await queryOne('SELECT user_id FROM playlists WHERE id = $1', [req.params.id]);
    if (!pl) return res.status(404).json({ error: 'Плейлист не найден' });
    if (pl.user_id !== req.user!.id) return res.status(403).json({ error: 'Нет доступа' });
    await execute(
      `UPDATE playlists SET track_ids = array_remove(track_ids, $1), updated_at = NOW() WHERE id = $2`,
      [req.params.trackId, req.params.id]
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/playlists/:id/cover — upload playlist cover */
router.post('/playlists/:id/cover', authRequired, (req: Request, res: Response) => {
  const pl_check = queryOne('SELECT user_id FROM playlists WHERE id = $1', [req.params.id]);
  const coverStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(PATHS.uploads, { recursive: true });
      cb(null, PATHS.uploads);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `playlist-${req.params.id}${ext}`);
    },
  });
  const upload = multer({
    storage: coverStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Только изображения'));
    },
  }).single('cover');

  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const pl = await pl_check;
    if (!pl || pl.user_id !== req.user!.id) return res.status(403).json({ error: 'Нет доступа' });
    const coverUrl = `/uploads/${req.file.filename}`;
    await execute('UPDATE playlists SET cover_url = $1, updated_at = NOW() WHERE id = $2', [coverUrl, req.params.id]);
    res.json({ coverUrl });
  });
});

// ═══════════════════════════════════════════════
// SOCIAL — FOLLOW/UNFOLLOW & PUBLIC PROFILES
// ═══════════════════════════════════════════════

/** GET /api/users/search — search users by name or username */
router.get('/users/search', authOptional, async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) return res.json([]);
    const limit = Math.min(20, Number(req.query.limit) || 10);
    const pattern = `%${q}%`;
    const users = await query(
      `SELECT id, name, username, avatar, bio FROM users
       WHERE is_blocked = false AND (name ILIKE $1 OR username ILIKE $1)
       ORDER BY name ASC LIMIT $2`,
      [pattern, limit]
    );
    res.json(users.map((u: any) => ({
      id: u.id,
      name: u.name,
      username: u.username || null,
      avatar: u.avatar || '',
      bio: u.bio || null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/users/:id — public user profile */
router.get('/users/:id', authOptional, async (req: Request, res: Response) => {
  try {
    const user = await queryOne(
      `SELECT id, name, username, avatar, bio, created_at FROM users WHERE id = $1 AND is_blocked = false`,
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    // Follower / following counts
    const [followers, following] = await Promise.all([
      queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM user_follows WHERE following_id = $1`, [req.params.id]),
      queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM user_follows WHERE follower_id = $1`, [req.params.id]),
    ]);

    // Is current user following this user?
    let isFollowing = false;
    if (req.user) {
      const f = await queryOne(
        `SELECT 1 FROM user_follows WHERE follower_id = $1 AND following_id = $2`,
        [req.user.id, req.params.id]
      );
      isFollowing = !!f;
    }

    // Public playlists
    const playlists = await query(
      `SELECT * FROM playlists WHERE user_id = $1 AND is_public = true ORDER BY updated_at DESC`,
      [req.params.id]
    );

    // Liked tracks count
    const likedRow = await queryOne<{ liked_tracks: string[] }>(
      `SELECT liked_tracks FROM users WHERE id = $1`, [req.params.id]
    );
    const likedCount = Array.isArray(likedRow?.liked_tracks) ? likedRow!.liked_tracks.length : 0;

    // Play stats
    const [totalPlays, totalTime] = await Promise.all([
      queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM play_history WHERE user_id = $1`, [req.params.id]),
      queryOne<{ s: string }>(`
        SELECT COALESCE(SUM(CASE WHEN ph.duration_listened > 0 THEN ph.duration_listened ELSE t.duration END), 0) as s
        FROM play_history ph JOIN tracks t ON t.id = ph.track_id WHERE ph.user_id = $1
      `, [req.params.id]),
    ]);

    res.json({
      id: user.id,
      name: user.name,
      username: user.username || null,
      avatar: user.avatar,
      bio: user.bio || null,
      joinedAt: user.created_at,
      followersCount: Number(followers?.c || 0),
      followingCount: Number(following?.c || 0),
      isFollowing,
      playlists: playlists.map(formatPlaylistRow),
      likedTracksCount: likedCount,
      totalPlays: Number(totalPlays?.c || 0),
      totalTimeSeconds: Number(totalTime?.s || 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/users/:id/follow — toggle follow */
router.post('/users/:id/follow', authRequired, async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id as string;
    const userId = req.user!.id;
    if (targetId === userId) return res.status(400).json({ error: 'Нельзя подписаться на себя' });

    // Check target exists
    const target = await queryOne('SELECT id FROM users WHERE id = $1 AND is_blocked = false', [targetId]);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

    const existing = await queryOne(
      `SELECT 1 FROM user_follows WHERE follower_id = $1 AND following_id = $2`,
      [userId, targetId]
    );

    if (existing) {
      await execute(`DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2`, [userId, targetId]);
      res.json({ following: false });
    } else {
      await execute(
        `INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, targetId]
      );
      res.json({ following: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/users/:id/followers — list followers */
router.get('/users/:id/followers', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const rows = await query(`
      SELECT u.id, u.name, u.avatar, uf.created_at as followed_at
      FROM user_follows uf
      JOIN users u ON u.id = uf.follower_id
      WHERE uf.following_id = $1
      ORDER BY uf.created_at DESC
      LIMIT $2
    `, [req.params.id, limit]);
    res.json(rows.map((r: any) => ({
      id: r.id, name: r.name, avatar: r.avatar, followedAt: r.followed_at,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/users/:id/following — list following */
router.get('/users/:id/following', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const rows = await query(`
      SELECT u.id, u.name, u.avatar, uf.created_at as followed_at
      FROM user_follows uf
      JOIN users u ON u.id = uf.following_id
      WHERE uf.follower_id = $1
      ORDER BY uf.created_at DESC
      LIMIT $2
    `, [req.params.id, limit]);
    res.json(rows.map((r: any) => ({
      id: r.id, name: r.name, avatar: r.avatar, followedAt: r.followed_at,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/users/:id/playlists — get user's public playlists */
router.get('/users/:id/playlists', async (req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT * FROM playlists WHERE user_id = $1 AND is_public = true ORDER BY updated_at DESC`,
      [req.params.id]
    );
    res.json(rows.map(formatPlaylistRow));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/users/:id/stats — public listening stats */
router.get('/users/:id/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const userExists = await queryOne('SELECT id FROM users WHERE id = $1 AND is_blocked = false', [userId]);
    if (!userExists) return res.status(404).json({ error: 'Пользователь не найден' });

    const [totalPlays, monthPlays, totalTime, monthTime, topArtists, plCount] = await Promise.all([
      queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM play_history WHERE user_id = $1`, [userId]),
      queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM play_history WHERE user_id = $1 AND played_at > NOW() - INTERVAL '30 days'`, [userId]),
      queryOne<{ s: string }>(`
        SELECT COALESCE(SUM(CASE WHEN ph.duration_listened > 0 THEN ph.duration_listened ELSE t.duration END), 0) as s
        FROM play_history ph JOIN tracks t ON t.id = ph.track_id WHERE ph.user_id = $1
      `, [userId]),
      queryOne<{ s: string }>(`
        SELECT COALESCE(SUM(CASE WHEN ph.duration_listened > 0 THEN ph.duration_listened ELSE t.duration END), 0) as s
        FROM play_history ph JOIN tracks t ON t.id = ph.track_id WHERE ph.user_id = $1 AND ph.played_at > NOW() - INTERVAL '30 days'
      `, [userId]),
      query(`
        SELECT a.name, a.slug, a.photo, COUNT(*) as plays
        FROM play_history ph
        JOIN tracks t ON t.id = ph.track_id
        LEFT JOIN track_artists ta ON ta.track_id = t.id
        LEFT JOIN artists a ON a.id = ta.artist_id OR a.slug = t.artist_slug
        WHERE ph.user_id = $1 AND a.id IS NOT NULL
        GROUP BY a.id, a.name, a.slug, a.photo
        ORDER BY plays DESC LIMIT 10
      `, [userId]),
      queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM playlists WHERE user_id = $1 AND is_public = true`, [userId]),
    ]);

    const lastActive = await queryOne<{ played_at: string }>(
      `SELECT played_at FROM play_history WHERE user_id = $1 ORDER BY played_at DESC LIMIT 1`, [userId]
    );

    res.json({
      totalPlays: Number(totalPlays?.c || 0),
      monthPlays: Number(monthPlays?.c || 0),
      totalTimeSeconds: Number(totalTime?.s || 0),
      monthTimeSeconds: Number(monthTime?.s || 0),
      topListenedArtists: (topArtists || []).map((a: any) => ({
        name: a.name, slug: a.slug, photo: a.photo, plays: Number(a.plays),
      })),
      playlistsCount: Number(plCount?.c || 0),
      lastActive: lastActive?.played_at || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/users/:id/activity — public activity feed */
router.get('/users/:id/activity', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const limit = Math.min(50, Number(req.query.limit) || 20);

    // De-duplicate: for 'play' events, only show the latest per track;
    // for other event types, show all
    const events = await query(`
      (
        SELECT DISTINCT ON (ue.track_id) ue.event_type, ue.track_id, ue.artist_slug, ue.created_at,
               t.title as track_title, t.artist as track_artist, t.cover_path as track_cover,
               a.name as artist_name, a.photo as artist_photo
        FROM user_events ue
        LEFT JOIN tracks t ON t.id = ue.track_id
        LEFT JOIN artists a ON a.slug = ue.artist_slug
        WHERE ue.user_id = $1 AND ue.event_type = 'play'
        ORDER BY ue.track_id, ue.created_at DESC
      )
      UNION ALL
      (
        SELECT ue.event_type, ue.track_id, ue.artist_slug, ue.created_at,
               t.title as track_title, t.artist as track_artist, t.cover_path as track_cover,
               a.name as artist_name, a.photo as artist_photo
        FROM user_events ue
        LEFT JOIN tracks t ON t.id = ue.track_id
        LEFT JOIN artists a ON a.slug = ue.artist_slug
        WHERE ue.user_id = $1
          AND ue.event_type IN ('like', 'unlike', 'follow_artist', 'add_to_playlist', 'share', 'finish')
        ORDER BY ue.created_at DESC
      )
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);

    res.json(events.map((e: any) => ({
      type: e.event_type,
      trackId: e.track_id,
      trackTitle: e.track_title,
      trackArtist: e.track_artist,
      trackCover: e.track_cover,
      artistSlug: e.artist_slug,
      artistName: e.artist_name,
      createdAt: e.created_at,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/users/:id/history — public listening history */
router.get('/users/:id/history', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const limit = Math.min(50, Number(req.query.limit) || 30);

    const rows = await query(`
      SELECT DISTINCT ON (t.id) t.*, ph.played_at
      FROM play_history ph
      JOIN tracks t ON t.id = ph.track_id AND t.status = 'ready'
      WHERE ph.user_id = $1
      ORDER BY t.id, ph.played_at DESC
    `, [userId]);

    rows.sort((a: any, b: any) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime());
    const limited = rows.slice(0, limit);
    const withArtists = await attachArtists(limited);
    res.json(withArtists.map((r: any) => ({
      ...formatTrackRow(r),
      playedAt: r.played_at,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/users/:id/taste — public taste summary */
router.get('/users/:id/taste', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id as string;
    const summary = await getUserTasteSummary(userId);
    res.json(summary || { topGenres: [], topArtists: [], timePreferences: {} });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/users/:id/recommendation-picks — public recommendation picks */
router.get('/users/:id/recommendation-picks', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id as string;
    const [weekPick, discoveryPick] = await Promise.all([
      queryOne<{ track_id: string }>(
        `SELECT track_id FROM user_events WHERE user_id = $1 AND event_type = 'pick_track_of_week' ORDER BY created_at DESC LIMIT 1`,
        [userId]
      ),
      queryOne<{ track_id: string }>(
        `SELECT track_id FROM user_events WHERE user_id = $1 AND event_type = 'pick_discovery' ORDER BY created_at DESC LIMIT 1`,
        [userId]
      ),
    ]);
    res.json({
      trackOfWeekId: weekPick?.track_id || null,
      discoveryId: discoveryPick?.track_id || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/profile/followers-stats — current user's follower/following count */
router.get('/profile/followers-stats', authRequired, async (req: Request, res: Response) => {
  try {
    const [followers, following] = await Promise.all([
      queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM user_follows WHERE following_id = $1`, [req.user!.id]),
      queryOne<{ c: string }>(`SELECT COUNT(*) as c FROM user_follows WHERE follower_id = $1`, [req.user!.id]),
    ]);
    res.json({
      followersCount: Number(followers?.c || 0),
      followingCount: Number(following?.c || 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

function formatTrackRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    artistSlug: row.artist_slug,
    artists: row._artists || null, // multi-artist array if joined
    genre: row.genre,
    year: row.year,
    duration: row.duration,
    plays: row.plays,
    likes: row.likes,
    explicit: !!row.explicit,
    isNew: !!row.is_new,
    featured: !!row.featured,
    cover: row.cover_path || null,
    status: row.status,
    streams: {
      low: row.stream_low || null,
      medium: row.stream_medium || null,
      high: row.stream_high || null,
      lossless: row.stream_lossless || null,
    },
    hlsMaster: row.hls_master || null,
    waveform: row.waveform_peaks || null,
    meta: { album: row.meta_album, bpm: row.meta_bpm, loudness: row.meta_loudness_lufs },
    createdAt: row.created_at,
  };
}

/** Attach multi-artist info to track rows */
async function attachArtists(tracks: any[]): Promise<any[]> {
  if (tracks.length === 0) return tracks;
  const trackIds = tracks.map(t => t.id);
  const links = await query(`
    SELECT ta.track_id, a.name, a.slug, ta.position
    FROM track_artists ta
    JOIN artists a ON a.id = ta.artist_id
    WHERE ta.track_id = ANY($1)
    ORDER BY ta.position ASC
  `, [trackIds]);

  const artistMap = new Map<string, { name: string; slug: string }[]>();
  for (const link of links) {
    if (!artistMap.has(link.track_id)) artistMap.set(link.track_id, []);
    artistMap.get(link.track_id)!.push({ name: link.name, slug: link.slug });
  }

  return tracks.map(t => ({
    ...t,
    _artists: artistMap.get(t.id) || null,
  }));
}

function formatArtistRow(row: any) {
  return {
    id: row.id, name: row.name, slug: row.slug,
    photo: row.photo, banner: row.banner || null, bio: row.bio, genre: row.genre,
    tracksCount: row.tracks_count, totalPlays: row.total_plays,
    socials: { vk: row.socials_vk, instagram: row.socials_instagram, telegram: row.socials_telegram },
  };
}

function formatPlaylistRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || null,
    userId: row.user_id,
    trackIds: Array.isArray(row.track_ids) ? row.track_ids : [],
    isPublic: !!row.is_public,
    coverUrl: row.cover_url || null,
    likesCount: Number(row.likes_count || 0),
    tracksCount: Array.isArray(row.track_ids) ? row.track_ids.length : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

// ═══════════════════════════════════════════════
// GENRE NORMALIZATION (admin-only)
// ═══════════════════════════════════════════════

const KNOWN_GENRES = ['Хип-хоп', 'Рэп', 'Trap', 'R&B', 'Drill', 'Phonk', 'Pop', 'Rock', 'Electronic', 'Другое'];

const GENRE_NORMALIZE_RULES: [RegExp, string][] = [
  [/hip[\s\-_]*hop/i, 'Хип-хоп'], [/хип[\s\-_]*хоп/i, 'Хип-хоп'],
  [/^rap$/i, 'Рэп'], [/^рэп$/i, 'Рэп'], [/^рап$/i, 'Рэп'], [/gangsta/i, 'Рэп'],
  [/^trap$/i, 'Trap'], [/^трэп$/i, 'Trap'],
  [/r\s*[&n]\s*b/i, 'R&B'], [/rhythm.*blues/i, 'R&B'], [/soul/i, 'R&B'], [/рнб/i, 'R&B'],
  [/drill/i, 'Drill'], [/дрилл/i, 'Drill'],
  [/phonk/i, 'Phonk'], [/фонк/i, 'Phonk'],
  [/^pop$/i, 'Pop'], [/^поп$/i, 'Pop'], [/synth[\s\-]?pop/i, 'Pop'], [/indie[\s\-]?pop/i, 'Pop'], [/dance[\s\-]?pop/i, 'Pop'], [/k[\s\-]?pop/i, 'Pop'],
  [/rock/i, 'Rock'], [/рок/i, 'Rock'], [/punk/i, 'Rock'], [/metal/i, 'Rock'], [/grunge/i, 'Rock'], [/alternative/i, 'Rock'],
  [/electro/i, 'Electronic'], [/edm/i, 'Electronic'], [/techno/i, 'Electronic'], [/house/i, 'Electronic'],
  [/trance/i, 'Electronic'], [/dubstep/i, 'Electronic'], [/drum\s*[&n]\s*bass/i, 'Electronic'], [/dnb/i, 'Electronic'],
  [/ambient/i, 'Electronic'], [/synth/i, 'Electronic'], [/электрон/i, 'Electronic'],
];

function normalizeGenreServer(raw: string): string {
  if (KNOWN_GENRES.includes(raw)) return raw;
  for (const [re, genre] of GENRE_NORMALIZE_RULES) {
    if (re.test(raw)) return genre;
  }
  return 'Другое';
}

/** POST /api/admin/normalize-genres — batch fix genres for all tracks */
router.post('/admin/normalize-genres', adminRequired, async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ id: string; genre: string }>('SELECT id, genre FROM tracks');
    let updated = 0;
    const changes: { from: string; to: string; count: number }[] = [];
    const changeMap = new Map<string, { to: string; count: number }>();

    for (const row of rows) {
      const normalized = normalizeGenreServer(row.genre);
      if (normalized !== row.genre) {
        await execute('UPDATE tracks SET genre = $1 WHERE id = $2', [normalized, row.id]);
        updated++;
        const key = `${row.genre} → ${normalized}`;
        if (!changeMap.has(key)) changeMap.set(key, { to: normalized, count: 0 });
        changeMap.get(key)!.count++;
      }
    }

    for (const [from, { to, count }] of changeMap) {
      changes.push({ from: from.split(' → ')[0], to, count });
    }

    // Also normalize artist genres
    const artistRows = await query<{ id: string; genre: string }>('SELECT id, genre FROM artists WHERE genre IS NOT NULL');
    let artistUpdated = 0;
    for (const row of artistRows) {
      const normalized = normalizeGenreServer(row.genre);
      if (normalized !== row.genre) {
        await execute('UPDATE artists SET genre = $1 WHERE id = $2', [normalized, row.id]);
        artistUpdated++;
      }
    }

    res.json({
      ok: true,
      tracksTotal: rows.length,
      tracksUpdated: updated,
      artistsUpdated: artistUpdated,
      changes: changes.sort((a, b) => b.count - a.count),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// S3 IMPORT (admin-only, runs as child process)
// ═══════════════════════════════════════════════

let s3ImportRunning = false;
let s3ImportLog: string[] = [];
let s3ImportChild: ChildProcess | null = null;

/** POST /api/admin/s3-import — trigger S3 import */
router.post('/admin/s3-import', adminRequired, async (req: Request, res: Response) => {
  if (s3ImportRunning) {
    return res.status(409).json({ error: 'Импорт уже запущен', log: s3ImportLog.slice(-50) });
  }

  const { limit = 30, genre, artist, album, dryRun, skipExisting = true, workers } = req.body;
  s3ImportRunning = true;
  s3ImportLog = [`[${new Date().toISOString()}] Запуск S3 импорта (limit=${limit}${artist ? `, artist=${artist}` : ''}${album ? `, album=${album}` : ''})...`];

  res.json({ ok: true, message: `S3 импорт запущен (limit=${limit}${artist ? `, artist=${artist}` : ''}${album ? `, album=${album}` : ''})` });

  // Find the s3-import script path
  const __dir = path.dirname(new URL(import.meta.url).pathname);
  const scriptPath = path.join(__dir, 's3-import.js');
  const tsScriptPath = path.join(__dir, '..', 'src', 's3-import.ts');

  // Use compiled JS version (server/dist/s3-import.js)
  const runner = fs.existsSync(scriptPath) ? 'node' : 'npx';
  const args = fs.existsSync(scriptPath)
    ? ['--max-old-space-size=512', scriptPath]
    : ['tsx', tsScriptPath];

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    LIMIT: String(limit || 0),
    SKIP_EXISTING: skipExisting ? '1' : '0',
    WORKERS: String(workers || 1),
    // Limit Node.js memory for tsx runner too
    NODE_OPTIONS: '--max-old-space-size=512',
  };
  if (genre) env.GENRE = genre;
  if (artist) env.ARTIST_FILTER = artist;
  if (album) env.ALBUM_FILTER = album;
  if (dryRun) env.DRY_RUN = '1';

  try {
    const child = spawn(runner, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    s3ImportChild = child;

    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      s3ImportLog.push(...lines);
      // Keep log manageable
      if (s3ImportLog.length > 500) s3ImportLog = s3ImportLog.slice(-300);
    });

    child.stderr?.on('data', (data: Buffer) => {
      s3ImportLog.push(...data.toString().split('\n').filter(Boolean));
    });

    child.on('close', (code, signal) => {
      if (signal === 'SIGTERM') {
        s3ImportLog.push(`⛔ Импорт остановлен пользователем`);
      } else if (code !== 0) {
        s3ImportLog.push(`❌ Процесс завершился с кодом ${code}`);
      } else {
        s3ImportLog.push(`✅ Импорт завершён`);
      }
      s3ImportRunning = false;
      s3ImportChild = null;
    });

    child.on('error', (err) => {
      s3ImportLog.push(`❌ Ошибка запуска: ${err.message}`);
      s3ImportRunning = false;
      s3ImportChild = null;
    });

  } catch (err: any) {
    s3ImportLog.push(`❌ Не удалось запустить: ${err.message}`);
    s3ImportRunning = false;
    s3ImportChild = null;
  }
});

/** POST /api/admin/s3-import/stop — stop running import */
router.post('/admin/s3-import/stop', adminRequired, (_req: Request, res: Response) => {
  if (!s3ImportRunning || !s3ImportChild) {
    return res.status(400).json({ error: 'Импорт не запущен' });
  }
  try {
    s3ImportChild.kill('SIGTERM');
    s3ImportLog.push(`⛔ Остановка импорта...`);
    res.json({ ok: true, message: 'Импорт останавливается...' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/s3-import/status — check import status */
router.get('/admin/s3-import/status', adminRequired, (_req: Request, res: Response) => {
  res.json({
    running: s3ImportRunning,
    log: s3ImportLog.slice(-100),
    lines: s3ImportLog.length,
  });
});

// ═══════════════════════════════════════════════
// SPOTIFY IMPORT (admin-only)
// ═══════════════════════════════════════════════

/** GET /api/admin/spotify/health — check SpotiFLAC service status */
router.get('/admin/spotify/health', adminRequired, async (_req: Request, res: Response) => {
  const ok = await checkSpotiflacHealth();
  res.json({ available: ok, url: process.env.SPOTIFLAC_URL || 'http://localhost:3099' });
});

/** GET /api/admin/spotify/metadata — fetch Spotify metadata */
router.get('/admin/spotify/metadata', adminRequired, async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ error: 'URL обязателен' });
    const data = await fetchSpotifyMetadata(url);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/spotify/search — search Spotify */
router.get('/admin/spotify/search', adminRequired, async (req: Request, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: 'Запрос обязателен' });
    const limit = Number(req.query.limit) || 10;
    const data = await searchSpotify(q, limit);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/admin/spotify/import — start Spotify import job */
router.post('/admin/spotify/import', adminRequired, async (req: Request, res: Response) => {
  try {
    const { url, genre = 'Другое' } = req.body;
    if (!url) return res.status(400).json({ error: 'URL обязателен' });

    // Validate URL format
    if (!url.includes('spotify.com/track/') && !url.includes('spotify.com/album/')) {
      return res.status(400).json({ error: 'Только ссылки на треки и альбомы Spotify' });
    }

    const jobId = startSpotifyImport(url, 'tidal', genre);
    res.status(201).json({ jobId, message: 'Импорт запущен' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/spotify/jobs — list all import jobs */
router.get('/admin/spotify/jobs', adminRequired, async (_req: Request, res: Response) => {
  res.json(getAllJobs());
});

/** GET /api/admin/spotify/jobs/:id — get import job status */
router.get('/admin/spotify/jobs/:id', adminRequired, async (req: Request, res: Response) => {
  const job = getJob(req.params.id as string);
  if (!job) return res.status(404).json({ error: 'Задача не найдена' });
  res.json(job);
});

// ═══════════════════════════════════════════════
// LISTENING ROOMS — in-memory real-time sync
// ═══════════════════════════════════════════════

interface ListeningRoom {
  hostId: string;
  trackId: string;
  trackTitle: string;
  trackArtist: string;
  trackCover: string;
  progress: number; // 0..1
  isPlaying: boolean;
  isPublic: boolean; // true = visible to everyone, false = invite-only (by link)
  updatedAt: number;
  listeners: Map<string, { userId: string; name: string; avatar: string; joinedAt: number }>;
}

const listeningRooms = new Map<string, ListeningRoom>();

/** Clean up stale rooms (no update in 2 min) */
function pruneStaleRooms() {
  const now = Date.now();
  for (const [hostId, room] of listeningRooms) {
    if (now - room.updatedAt > 120_000) listeningRooms.delete(hostId);
  }
}
setInterval(pruneStaleRooms, 30_000);

/** PUT /api/listening-room — host creates / updates room */
router.put('/listening-room', authRequired, async (req: Request, res: Response) => {
  try {
    const { trackId, trackTitle, trackArtist, trackCover, progress, isPlaying, isPublic } = req.body;
    const hostId = req.user!.id;
    const existing = listeningRooms.get(hostId);
    const room: ListeningRoom = {
      hostId,
      trackId: trackId || existing?.trackId || '',
      trackTitle: trackTitle || existing?.trackTitle || '',
      trackArtist: trackArtist || existing?.trackArtist || '',
      trackCover: trackCover || existing?.trackCover || '',
      progress: progress ?? existing?.progress ?? 0,
      isPlaying: isPlaying ?? existing?.isPlaying ?? false,
      isPublic: isPublic ?? existing?.isPublic ?? true,
      updatedAt: Date.now(),
      listeners: existing?.listeners || new Map(),
    };
    listeningRooms.set(hostId, room);
    const listeners = Array.from(room.listeners.values()).map(l => ({
      userId: l.userId, name: l.name, avatar: l.avatar,
    }));
    res.json({ ok: true, listenersCount: listeners.length, listeners });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/listening-room — host closes room */
router.delete('/listening-room', authRequired, (req: Request, res: Response) => {
  listeningRooms.delete(req.user!.id);
  res.json({ ok: true });
});

/** GET /api/listening-room/:hostId — get room state */
router.get('/listening-room/:hostId', authOptional, (req: Request, res: Response) => {
  const hostId = req.params.hostId as string;
  const room = listeningRooms.get(hostId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });
  const listeners = Array.from(room.listeners.values()).map(l => ({
    userId: l.userId, name: l.name, avatar: l.avatar,
  }));
  res.json({
    hostId: room.hostId,
    trackId: room.trackId,
    trackTitle: room.trackTitle,
    trackArtist: room.trackArtist,
    trackCover: room.trackCover,
    progress: room.progress,
    isPlaying: room.isPlaying,
    listenersCount: listeners.length,
    listeners,
  });
});

/** POST /api/listening-room/:hostId/join — join a room */
router.post('/listening-room/:hostId/join', authRequired, async (req: Request, res: Response) => {
  const hostId = req.params.hostId as string;
  const room = listeningRooms.get(hostId);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });
  const user = await queryOne<{ id: string; name: string; avatar: string }>(
    'SELECT id, name, avatar FROM users WHERE id = $1', [req.user!.id]
  );
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  room.listeners.set(user.id, { userId: user.id, name: user.name, avatar: user.avatar || '', joinedAt: Date.now() });
  res.json({
    trackId: room.trackId,
    trackTitle: room.trackTitle,
    trackArtist: room.trackArtist,
    trackCover: room.trackCover,
    progress: room.progress,
    isPlaying: room.isPlaying,
  });
});

/** POST /api/listening-room/:hostId/leave — leave a room */
router.post('/listening-room/:hostId/leave', authRequired, (req: Request, res: Response) => {
  const hostId = req.params.hostId as string;
  const room = listeningRooms.get(hostId);
  if (room) room.listeners.delete(req.user!.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════
// PLAYLIST LIKES
// ═══════════════════════════════════════════════

/** POST /api/playlists/:id/like — toggle like on a playlist */
router.post('/playlists/:id/like', authRequired, async (req: Request, res: Response) => {
  try {
    const pl = await queryOne<{ id: string; user_id: string; likes_count: number }>(
      'SELECT id, user_id, likes_count FROM playlists WHERE id = $1', [req.params.id]
    );
    if (!pl) return res.status(404).json({ error: 'Плейлист не найден' });

    // Check if already liked (using user_events table)
    const existing = await queryOne(
      `SELECT 1 FROM user_events WHERE user_id = $1 AND event_type = 'like_playlist' AND track_id = $2`,
      [req.user!.id, req.params.id] // reusing track_id column for playlist id
    );

    if (existing) {
      await execute(
        `DELETE FROM user_events WHERE user_id = $1 AND event_type = 'like_playlist' AND track_id = $2`,
        [req.user!.id, req.params.id]
      );
      await execute(
        `UPDATE playlists SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1`,
        [req.params.id]
      );
      res.json({ liked: false, likesCount: Math.max(0, (pl.likes_count || 0) - 1) });
    } else {
      await execute(
        `INSERT INTO user_events (user_id, event_type, track_id, created_at) VALUES ($1, 'like_playlist', $2, NOW())`,
        [req.user!.id, req.params.id]
      );
      await execute(
        `UPDATE playlists SET likes_count = likes_count + 1 WHERE id = $1`,
        [req.params.id]
      );
      res.json({ liked: true, likesCount: (pl.likes_count || 0) + 1 });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// RECOMMENDATION PICKS — user curated "track of the week" / "my discovery"
// ═══════════════════════════════════════════════

/** PUT /api/profile/recommendation-picks — save user's picks */
router.put('/profile/recommendation-picks', authRequired, async (req: Request, res: Response) => {
  try {
    const { trackOfWeekId, discoveryId } = req.body;
    // Store in user_events as special events
    if (trackOfWeekId) {
      await execute(
        `DELETE FROM user_events WHERE user_id = $1 AND event_type = 'pick_track_of_week'`,
        [req.user!.id]
      );
      await execute(
        `INSERT INTO user_events (user_id, event_type, track_id, created_at) VALUES ($1, 'pick_track_of_week', $2, NOW())`,
        [req.user!.id, trackOfWeekId]
      );
    }
    if (discoveryId) {
      await execute(
        `DELETE FROM user_events WHERE user_id = $1 AND event_type = 'pick_discovery'`,
        [req.user!.id]
      );
      await execute(
        `INSERT INTO user_events (user_id, event_type, track_id, created_at) VALUES ($1, 'pick_discovery', $2, NOW())`,
        [req.user!.id, discoveryId]
      );
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/profile/recommendation-picks — get user's picks */
router.get('/profile/recommendation-picks', authRequired, async (req: Request, res: Response) => {
  try {
    const [weekPick, discoveryPick] = await Promise.all([
      queryOne<{ track_id: string }>(
        `SELECT track_id FROM user_events WHERE user_id = $1 AND event_type = 'pick_track_of_week' ORDER BY created_at DESC LIMIT 1`,
        [req.user!.id]
      ),
      queryOne<{ track_id: string }>(
        `SELECT track_id FROM user_events WHERE user_id = $1 AND event_type = 'pick_discovery' ORDER BY created_at DESC LIMIT 1`,
        [req.user!.id]
      ),
    ]);
    res.json({
      trackOfWeekId: weekPick?.track_id || null,
      discoveryId: discoveryPick?.track_id || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// FRIENDS — following users with online/listening status
// ═══════════════════════════════════════════════

/** GET /api/profile/friends — get following users with their current listening status */
router.get('/profile/friends', authRequired, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(50, Number(req.query.limit) || 20);

    const friends = await query(`
      SELECT u.id, u.name, u.avatar
      FROM user_follows uf
      JOIN users u ON u.id = uf.following_id AND u.is_blocked = false
      WHERE uf.follower_id = $1
      ORDER BY uf.created_at DESC
      LIMIT $2
    `, [userId, limit]);

    // Enrich with listening status from heartbeat map
    pruneStaleListeners();
    const enriched = await Promise.all(friends.map(async (f: any) => {
      // Check if this user is actively listening (they have a heartbeat entry)
      let listeningTrack = null;
      for (const [, entry] of activeListenersMap) {
        if (entry.userId === f.id) {
          const t = await queryOne<{ title: string; artist: string; cover_path: string }>(
            `SELECT title, artist, cover_path FROM tracks WHERE id = $1`, [entry.trackId]
          );
          if (t) {
            listeningTrack = { title: t.title, artist: t.artist, cover: t.cover_path };
          }
          break;
        }
      }
      // Check if they have a listening room
      const room = listeningRooms.get(f.id);
      return {
        id: f.id,
        name: f.name,
        avatar: f.avatar || '',
        isOnline: !!listeningTrack || !!room,
        listeningTrack,
        hasRoom: !!room,
      };
    }));

    // Sort: online first
    enriched.sort((a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0));

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/heartbeat — client sends every 20s while playing */
router.post('/heartbeat', (req: Request, res: Response) => {
  const { sessionId, trackId } = req.body || {};
  if (!sessionId || !trackId) return res.status(400).json({ error: 'sessionId & trackId required' });
  activeListenersMap.set(sessionId, {
    trackId,
    userId: req.user?.id,
    ts: Date.now(),
  });
  res.json({ ok: true });
});

/** POST /api/heartbeat/stop — client sends when pausing/stopping */
router.post('/heartbeat/stop', (req: Request, res: Response) => {
  const { sessionId } = req.body || {};
  if (sessionId) activeListenersMap.delete(sessionId);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════
// POPULAR USERS — public, sorted by followers count (min 5 followers)
// ═══════════════════════════════════════════════
router.get('/popular-users', async (_req: Request, res: Response) => {
  try {
    const rows = await query<{ id: string; name: string; avatar: string; followers_count: number }>(
      `SELECT u.id, u.name, u.avatar,
              (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id)::int AS followers_count
       FROM users u
       WHERE u.role != 'admin'
         AND (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) >= 5
       ORDER BY followers_count DESC
       LIMIT 8`
    );
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      avatar: r.avatar,
      followersCount: r.followers_count,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════
// PUBLIC ROOMS — list all active listening rooms
// ═══════════════════════════════════════════════
router.get('/public-rooms', async (_req: Request, res: Response) => {
  try {
    pruneStaleRooms();
    const rooms: any[] = [];
    for (const [hostId, room] of listeningRooms) {
      if (!room.isPublic) continue; // skip private (invite-only) rooms
      const host = await queryOne<{ name: string; avatar: string }>(
        'SELECT name, avatar FROM users WHERE id = $1', [hostId]
      );
      rooms.push({
        hostId,
        hostName: host?.name || 'Unknown',
        hostAvatar: host?.avatar || '',
        trackTitle: room.trackTitle,
        trackArtist: room.trackArtist,
        trackCover: room.trackCover,
        listenersCount: room.listeners.size,
        isPlaying: room.isPlaying,
      });
    }
    res.json(rooms);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
