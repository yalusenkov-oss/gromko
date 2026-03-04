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
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CONFIG, PATHS, ensureDirs } from './config.js';
import { initSchema } from './db.js';
import { authOptional } from './auth.js';
import routes from './routes.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IS_PROD = process.env.NODE_ENV === 'production';
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'dist');
// ─── Catch all unhandled errors to prevent silent crash loops ───
process.on('uncaughtException', (err) => {
    console.error('  ❌ UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('  ❌ UNHANDLED REJECTION:', reason);
});
console.log('  ⏳ GROMKO server starting...');
console.log('  📁 CWD:', process.cwd());
console.log('  📁 __dirname:', __dirname);
console.log('  📁 FRONTEND_DIR:', FRONTEND_DIR);
console.log('  🔑 NODE_ENV:', process.env.NODE_ENV);
console.log('  🔑 DATABASE_URL set:', !!process.env.DATABASE_URL);
console.log('  🔑 PORT:', process.env.PORT || CONFIG.port);
ensureDirs();
// Connect to PostgreSQL and initialize schema
try {
    await initSchema();
}
catch (err) {
    console.error('  ❌ Failed to initialize database schema:', err);
    console.error('  💡 Make sure DATABASE_URL is set correctly');
    process.exit(1);
}
const app = express();
// ─── Middleware ───
app.use(cors({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        const allowed = /^https?:\/\/(localhost(:\d+)?|.*\.vercel\.app|.*\.loca\.lt|.*\.trycloudflare\.com|.*\.timeweb\.cloud|.*\.tw1\.ru)$/;
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
        if (ext === '.m3u8')
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        else if (ext === '.ts')
            res.setHeader('Content-Type', 'video/mp2t');
        else if (ext === '.m4a')
            res.setHeader('Content-Type', 'audio/mp4');
        else if (ext === '.flac')
            res.setHeader('Content-Type', 'audio/flac');
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
// ─── Frontend (production: serve built SPA from /dist) ───
if (IS_PROD && fs.existsSync(FRONTEND_DIR)) {
    // Serve assets with long cache, but NEVER cache index.html
    // (vite-plugin-singlefile inlines everything into index.html,
    //  so browsers must always fetch the latest version)
    app.use(express.static(FRONTEND_DIR, {
        maxAge: '7d',
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html') || filePath.endsWith('index.html')) {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
        },
    }));
    app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
    });
}
else {
    app.use((_req, res) => {
        res.status(404).json({ error: 'Not found', hint: 'This is the GROMKO API server. Frontend is served by Vite on port 5173.' });
    });
}
// ─── Error handler ───
app.use((err, _req, res, _next) => {
    console.error('Server error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
    });
});
// ─── Start ───
const server = app.listen(CONFIG.port, CONFIG.host, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║     🔊  GROMKO Audio Server  🔊     ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  http://localhost:${CONFIG.port}              ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
    // Recalculate artist stats on startup and every hour
    recalcArtistStats();
    setInterval(recalcArtistStats, 60 * 60 * 1000);
});
async function recalcArtistStats() {
    try {
        const { execute } = await import('./db.js');
        await execute(`
      UPDATE artists a SET
        tracks_count = COALESCE(sub.cnt, 0),
        total_plays = COALESCE(sub.tp, 0)
      FROM (
        SELECT ta.artist_id,
               COUNT(DISTINCT t.id) as cnt,
               COALESCE(SUM(t.plays), 0) as tp
        FROM track_artists ta
        JOIN tracks t ON t.id = ta.track_id AND t.status = 'ready'
        GROUP BY ta.artist_id
      ) sub
      WHERE a.id = sub.artist_id
    `);
        console.log('  ✅ Artist stats recalculated');
    }
    catch (e) {
        console.error('  ❌ Artist stats recalc error:', e.message);
    }
}
// ─── Graceful shutdown ───
async function shutdown(signal) {
    console.log(`\n  ${signal} received, shutting down...`);
    server.close();
    const { closeDb } = await import('./db.js');
    await closeDb();
    process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
export default app;
//# sourceMappingURL=index.js.map