/**
 * GROMKO API Routes — PostgreSQL + JWT Auth
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { v4 as uuid } from 'uuid';
import { query, queryOne, execute } from './db.js';
import { CONFIG, PATHS, trackHlsDir } from './config.js';
import { enqueueTrack, extractMetadata, getQueueStatus } from './audio-processor.js';
import {
  registerUser, loginUser, getUserById,
  authRequired, authOptional, adminRequired,
} from './auth.js';
import { parseArtistNames } from './parse-artists.js';

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
    const { name, email, password, country } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Имя, email и пароль обязательны' });
    }
    const result = await registerUser(name, email, password, country);
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

  // Record play (fire & forget) — include user_id from authOptional middleware
  const userId = req.user?.id || null;
  execute('UPDATE tracks SET plays = plays + 1, updated_at = NOW() WHERE id = $1', [req.params.id]).catch(() => {});
  execute('INSERT INTO play_history (track_id, quality, user_id) VALUES ($1, $2, $3)', [req.params.id, quality, userId]).catch(() => {});
  // Update total_plays for all artists linked to this track
  execute(`
    UPDATE artists SET total_plays = total_plays + 1
    WHERE id IN (SELECT artist_id FROM track_artists WHERE track_id = $1)
       OR slug = $2
  `, [req.params.id, track.artist_slug]).catch(() => {});

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
      const slug = primaryName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');

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
        const aSlug = aName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
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
  } else {
    await execute('UPDATE users SET liked_tracks = array_append(liked_tracks, $1) WHERE id = $2', [trackId, userId]);
    await execute('UPDATE tracks SET likes = likes + 1 WHERE id = $1', [trackId]);
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

  // Active listeners (played something in last 15 minutes)
  const activeListeners = await queryOne(
    `SELECT COUNT(DISTINCT user_id) as c FROM play_history WHERE played_at > NOW() - INTERVAL '15 minutes' AND user_id IS NOT NULL`
  );

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
    activeListeners: Number(activeListeners?.c || 0),
    playsToday: Number(playsToday?.c || 0),
    playsWeek: Number(playsWeek?.c || 0),
    playsMonth: Number(playsMonth?.c || 0),
    topGenres: (topGenres || []).map((g: any) => ({ genre: g.genre, count: Number(g.count) })),
    topTracks: topTracks.map(formatTrackRow),
    queue: getQueueStatus(),
  });
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
      const { title, artist, genre, year, comment, albumName } = req.body;
      if (!title || !artist) return res.status(400).json({ error: 'Название и артист обязательны' });

      const subId = uuid();
      await execute(`
        INSERT INTO submissions (id, user_id, title, artist, genre, year, comment, status, original_filename, file_path, cover_path, album_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11)
      `, [
        subId, req.user!.id, title, artist,
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

/** GET /api/submissions/my — current user's submissions */
router.get('/submissions/my', authRequired, async (req: Request, res: Response) => {
  const subs = await query(
    'SELECT * FROM submissions WHERE user_id = $1 ORDER BY created_at DESC',
    [req.user!.id]
  );
  res.json(subs.map((s: any) => ({
    id: s.id, title: s.title, artist: s.artist, genre: s.genre, year: s.year,
    comment: s.comment, status: s.status, rejectReason: s.reject_reason,
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
    const primarySlug = artistNames[0].toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
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
      const aSlug = aName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
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

// ═══════════════════════════════════════════════
// S3 IMPORT (admin-only, runs as child process)
// ═══════════════════════════════════════════════

let s3ImportRunning = false;
let s3ImportLog: string[] = [];
let s3ImportChild: ReturnType<typeof execFile> | null = null;

/** POST /api/admin/s3-import — trigger S3 import */
router.post('/admin/s3-import', adminRequired, async (req: Request, res: Response) => {
  if (s3ImportRunning) {
    return res.status(409).json({ error: 'Импорт уже запущен', log: s3ImportLog.slice(-50) });
  }

  const { limit = 30, genre, artist, dryRun, skipExisting = true } = req.body;
  s3ImportRunning = true;
  s3ImportLog = [`[${new Date().toISOString()}] Запуск S3 импорта (limit=${limit}${artist ? `, artist=${artist}` : ''})...`];

  res.json({ ok: true, message: `S3 импорт запущен (limit=${limit}${artist ? `, artist=${artist}` : ''})` });

  // Find the s3-import script path
  const __dir = path.dirname(new URL(import.meta.url).pathname);
  const scriptPath = path.join(__dir, 's3-import.js');
  const tsScriptPath = path.join(__dir, '..', 'src', 's3-import.ts');

  // Use compiled JS version (server/dist/s3-import.js)
  const script = fs.existsSync(scriptPath) ? scriptPath : tsScriptPath;
  const runner = fs.existsSync(scriptPath) ? 'node' : 'npx';
  const args = fs.existsSync(scriptPath) ? [scriptPath] : ['tsx', tsScriptPath];

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    LIMIT: String(limit || 0),
    SKIP_EXISTING: skipExisting ? '1' : '0',
  };
  if (genre) env.GENRE = genre;
  if (artist) env.ARTIST_FILTER = artist;
  if (dryRun) env.DRY_RUN = '1';

  try {
    const child = execFile(runner, args, {
      env,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30 * 60 * 1000, // 30 min max
    }, (error, stdout, stderr) => {
      if (stdout) s3ImportLog.push(...stdout.split('\n').filter(Boolean));
      if (stderr) s3ImportLog.push(...stderr.split('\n').filter(Boolean));
      if (error) {
        if (error.killed || error.signal === 'SIGTERM') {
          s3ImportLog.push(`⛔ Импорт остановлен пользователем`);
        } else {
          s3ImportLog.push(`❌ Ошибка: ${error.message}`);
        }
      } else {
        s3ImportLog.push(`✅ Импорт завершён`);
      }
      s3ImportRunning = false;
      s3ImportChild = null;
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

export default router;
