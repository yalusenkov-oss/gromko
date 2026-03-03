/**
 * GROMKO API Routes — PostgreSQL + JWT Auth
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { query, queryOne, execute } from './db.js';
import { CONFIG, PATHS, trackHlsDir } from './config.js';
import { enqueueTrack, extractMetadata, getQueueStatus } from './audio-processor.js';
import {
  registerUser, loginUser, getUserById,
  authRequired, authOptional, adminRequired,
} from './auth.js';

const router = Router();

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
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Имя, email и пароль обязательны' });
    }
    const result = await registerUser(name, email, password);
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

/** GET /api/auth/me — current user */
router.get('/auth/me', authRequired, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

/** PUT /api/auth/me — update profile */
router.put('/auth/me', authRequired, async (req: Request, res: Response) => {
  try {
    const { name, avatar } = req.body;
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name) { updates.push(`name = $${idx++}`); params.push(name); }
    if (avatar) { updates.push(`avatar = $${idx++}`); params.push(avatar); }

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
      : sort === 'year' ? 'year' : sort === 'title' ? 'title' : 'plays';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

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

    res.json({ tracks: tracks.map(formatTrackRow), total, limit: lim, offset: off });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/tracks/:id */
router.get('/tracks/:id', async (req: Request, res: Response) => {
  const track = await queryOne('SELECT * FROM tracks WHERE id = $1', [req.params.id]);
  if (!track) return res.status(404).json({ error: 'Трек не найден' });
  res.json(formatTrackRow(track));
});

/** GET /api/tracks/:id/waveform */
router.get('/tracks/:id/waveform', async (req: Request, res: Response) => {
  const track = await queryOne('SELECT waveform_peaks FROM tracks WHERE id = $1', [req.params.id]);
  if (!track) return res.status(404).json({ error: 'Трек не найден' });
  res.json({ peaks: track.waveform_peaks || [] });
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

  const filePath = path.join(PATHS.data, '..', 'data', streamPath.replace(/^\//, ''));
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

  // Record play (fire & forget)
  execute('UPDATE tracks SET plays = plays + 1, updated_at = NOW() WHERE id = $1', [req.params.id]).catch(() => {});
  execute('INSERT INTO play_history (track_id, quality) VALUES ($1, $2)', [req.params.id, quality]).catch(() => {});
});

/** GET /api/tracks/:id/hls/:file */
router.get('/tracks/:id/hls/:file', (req: Request, res: Response) => {
  const trackId = req.params.id as string;
  const file = req.params.file as string;
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
router.post('/tracks/upload', (req: Request, res: Response) => {
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
      } = req.body;
      const slug = artist.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');

      await execute(`
        INSERT INTO tracks (id, title, artist, artist_slug, genre, year, duration,
                           original_filename, original_format, original_size, original_bitrate,
                           original_sample_rate, original_channels, explicit, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'pending')
      `, [
        trackId, title, artist, slug, genre, Number(year), meta.duration,
        audioFile.originalname, meta.format, audioFile.size, meta.bitrate,
        meta.sampleRate, meta.channels, explicit === 'true',
      ]);

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
  } else {
    await execute('UPDATE users SET liked_tracks = array_append(liked_tracks, $1) WHERE id = $2', [trackId, userId]);
    await execute('UPDATE tracks SET likes = likes + 1 WHERE id = $1', [trackId]);
  }

  res.json({ liked: !isLiked });
});

// ═══════════════════════════════════════════════
// ARTISTS
// ═══════════════════════════════════════════════

router.get('/artists', async (_req: Request, res: Response) => {
  const artists = await query('SELECT * FROM artists ORDER BY total_plays DESC');
  res.json(artists.map(formatArtistRow));
});

router.get('/artists/:slug', async (req: Request, res: Response) => {
  const artist = await queryOne('SELECT * FROM artists WHERE slug = $1', [req.params.slug]);
  if (!artist) return res.status(404).json({ error: 'Артист не найден' });
  const tracks = await query(
    `SELECT * FROM tracks WHERE artist_slug = $1 AND status = 'ready' ORDER BY plays DESC`,
    [req.params.slug]
  );
  res.json({ ...formatArtistRow(artist), tracks: tracks.map(formatTrackRow) });
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

router.get('/admin/users', adminRequired, async (_req: Request, res: Response) => {
  const users = await query('SELECT id, name, email, role, avatar, is_blocked, created_at FROM users ORDER BY created_at DESC');
  res.json(users);
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

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

function formatTrackRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    artistSlug: row.artist_slug,
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

function formatArtistRow(row: any) {
  return {
    id: row.id, name: row.name, slug: row.slug,
    photo: row.photo, bio: row.bio, genre: row.genre,
    tracksCount: row.tracks_count, totalPlays: row.total_plays,
    socials: { vk: row.socials_vk, instagram: row.socials_instagram, telegram: row.socials_telegram },
  };
}

export default router;
