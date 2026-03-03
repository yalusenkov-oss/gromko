/**
 * GROMKO Server — Audio Streaming Platform Backend
 * 
 * Express сервер для:
 * - Загрузки и обработки аудиофайлов (FFmpeg pipeline)
 * - Стриминга аудио (HLS adaptive + direct HTTP Range)
 * - REST API для фронтенда
 * - Раздача статики (обложки, waveforms)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { CONFIG, PATHS, ensureDirs } from './config.js';
import { initSchema } from './db.js';
import { authOptional } from './auth.js';
import routes from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directories exist
ensureDirs();

// Initialize database (async)
await initSchema();

const app = express();

// ─── Middleware ───
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow localhost, vercel.app, and tunnel domains
    const allowed = /^https?:\/\/(localhost(:\d+)?|.*\.vercel\.app|.*\.loca\.lt|.*\.trycloudflare\.com)$/;
    callback(null, allowed.test(origin));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Parse JWT on all requests (optional — sets req.user if token present) ───
app.use(authOptional);

// ─── Static file serving for processed media ───
// Covers: /covers/{trackId}/medium.webp
app.use('/covers', express.static(PATHS.covers, {
  maxAge: '365d',
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

// Audio files: /audio/{trackId}/medium.m4a
app.use('/audio', express.static(PATHS.audio, {
  maxAge: '365d',
  etag: true,
  lastModified: true,
  acceptRanges: true, // Critical for audio seeking
  setHeaders: (res, filePath) => {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    
    // Set correct MIME types
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.m3u8') res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    else if (ext === '.ts') res.setHeader('Content-Type', 'video/mp2t');
    else if (ext === '.m4a') res.setHeader('Content-Type', 'audio/mp4');
    else if (ext === '.flac') res.setHeader('Content-Type', 'audio/flac');
  },
}));

// Waveforms: /waveforms/{trackId}.json
app.use('/waveforms', express.static(PATHS.waveforms, {
  maxAge: '365d',
  setHeaders: (res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

// ─── API Routes ───
app.use('/api', routes);

// ─── Health check ───
app.get('/health', async (_req, res) => {
  const { queryOne } = await import('./db.js');
  const result = await queryOne('SELECT COUNT(*) as c FROM tracks');
  res.json({
    status: 'ok',
    tracks: Number(result?.c || 0),
    uptime: process.uptime(),
  });
});

// ─── Catch-all: return JSON 404 for unknown routes ───
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', hint: 'This is the GROMKO API server. Frontend is served by Vite on port 5173.' });
});

// ─── Error handler ───
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// ─── Start ───
app.listen(CONFIG.port, CONFIG.host, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║     🔊  GROMKO Audio Server  🔊     ║');
  console.log('  ╠══════════════════════════════════════╣');
  console.log(`  ║  http://localhost:${CONFIG.port}              ║`);
  console.log('  ║                                      ║');
  console.log('  ║  Endpoints:                          ║');
  console.log('  ║  POST /api/tracks/upload              ║');
  console.log('  ║  GET  /api/tracks/:id/stream          ║');
  console.log('  ║  GET  /api/tracks/:id/hls/master.m3u8 ║');
  console.log('  ║  GET  /api/tracks/:id/waveform        ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
});

export default app;
