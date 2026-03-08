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
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { CONFIG, PATHS, ensureDirs } from './config.js';
import { initSchema } from './db.js';
import { authOptional } from './auth.js';
import routes from './routes.js';
import { slugify } from './slugify.js';

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

// ─── Auto-start SpotiFLAC Go server ───
let spotiflacProcess: ChildProcess | null = null;

function resolveSpotiflacDir(): string | null {
  const explicitDir = (process.env.SPOTIFLAC_DIR || '').trim();
  const candidates = [
    explicitDir,
    path.join(process.cwd(), 'SpotiFLAC-main'),
    path.join(process.cwd(), '..', 'SpotiFLAC-main'),
    path.join(__dirname, '..', '..', 'SpotiFLAC-main'),
    path.join(__dirname, '..', 'SpotiFLAC-main'),
  ].filter(Boolean);

  for (const dir of candidates) {
    const cmdServer = path.join(dir, 'cmd', 'server', 'main.go');
    if (fs.existsSync(cmdServer)) return dir;
  }
  return null;
}

function resolveSpotiflacLaunch(SPOTIFLAC_DIR: string): { cmd: string; args: string[]; cwd: string } | null {
  const explicitBin = (process.env.SPOTIFLAC_BIN || '').trim();
  if (explicitBin && fs.existsSync(explicitBin)) {
    return { cmd: explicitBin, args: [], cwd: path.dirname(explicitBin) };
  }

  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'amd64' : process.arch;
  const platform = process.platform === 'linux' ? 'linux' : process.platform;
  const binCandidates = [
    path.join(SPOTIFLAC_DIR, 'bin', `spotiflac-server-${platform}-${arch}`),
    path.join(SPOTIFLAC_DIR, 'bin', `spotiflac-${platform}-${arch}`),
    path.join(SPOTIFLAC_DIR, 'bin', 'spotiflac-server'),
  ];
  for (const bin of binCandidates) {
    if (fs.existsSync(bin)) {
      return { cmd: bin, args: [], cwd: path.dirname(bin) };
    }
  }

  const goCheck = spawnSync('go', ['version'], { stdio: 'ignore' });
  if (goCheck.status === 0) {
    return { cmd: 'go', args: ['run', './cmd/server'], cwd: SPOTIFLAC_DIR };
  }

  return null;
}

function startSpotiflac() {
  const explicitUrl = (process.env.SPOTIFLAC_URL || '').trim();
  if (explicitUrl && !/localhost|127\.0\.0\.1/.test(explicitUrl)) {
    console.log('  ℹ️ Using external SpotiFLAC service:', explicitUrl);
    return;
  }

  const SPOTIFLAC_DIR = resolveSpotiflacDir();
  const spotiflacPort = process.env.SPOTIFLAC_PORT || '3099';

  if (!SPOTIFLAC_DIR) {
    console.warn('  ⚠️ SpotiFLAC directory not found');
    console.warn('  💡 Checked SPOTIFLAC_DIR, ./SpotiFLAC-main, ../SpotiFLAC-main and dist-relative paths');
    console.warn('  ⚠️ Spotify import will not be available');
    return;
  }
  console.log('  📁 SpotiFLAC dir:', SPOTIFLAC_DIR);

  // Check if SpotiFLAC is already running
  fetch(`http://localhost:${spotiflacPort}/health`)
    .then(r => r.json())
    .then(data => {
      if (data.status === 'ok') {
        console.log('  ✅ SpotiFLAC already running on port', spotiflacPort);
      }
    })
    .catch(() => {
      // Not running, start it
      console.log('  ⏳ Starting SpotiFLAC Go server...');

      const downloadsDir = path.join(SPOTIFLAC_DIR, 'downloads');
      fs.mkdirSync(downloadsDir, { recursive: true });
      const launch = resolveSpotiflacLaunch(SPOTIFLAC_DIR);
      if (!launch) {
        console.warn('  ⚠️ Cannot start SpotiFLAC automatically: no Go runtime and no prebuilt binary found');
        console.warn('  💡 Set SPOTIFLAC_URL (external service) or SPOTIFLAC_BIN (local binary path)');
        return;
      }
      console.log(`  ▶️ SpotiFLAC launch: ${launch.cmd} ${launch.args.join(' ')}`.trim());

      spotiflacProcess = spawn(launch.cmd, launch.args, {
        cwd: launch.cwd,
        env: {
          ...process.env,
          SPOTIFLAC_PORT: spotiflacPort,
          SPOTIFLAC_DOWNLOAD_DIR: downloadsDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      spotiflacProcess.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.log('  [SpotiFLAC]', msg);
      });

      spotiflacProcess.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.error('  [SpotiFLAC ERR]', msg);
      });

      spotiflacProcess.on('exit', (code, signal) => {
        console.warn(`  ⚠️ SpotiFLAC exited (code=${code}, signal=${signal})`);
        spotiflacProcess = null;
        // Auto-restart after 5 seconds
        setTimeout(() => {
          console.log('  🔄 Attempting to restart SpotiFLAC...');
          startSpotiflac();
        }, 5000);
      });

      spotiflacProcess.on('error', (err) => {
        console.error('  ❌ Failed to start SpotiFLAC:', err.message);
        console.warn('  💡 Make sure Go is installed: https://go.dev/dl/');
        spotiflacProcess = null;
      });

      // Wait a bit and check health
      setTimeout(async () => {
        try {
          const r = await fetch(`http://localhost:${spotiflacPort}/health`);
          const data = await r.json();
          if (data.status === 'ok') {
            console.log('  ✅ SpotiFLAC server started on port', spotiflacPort);
          }
        } catch {
          console.warn('  ⚠️ SpotiFLAC not responding yet (may still be compiling...)');
        }
      }, 8000);
    });
}

startSpotiflac();

// Connect to PostgreSQL and initialize schema
let dbReady = false;
try {
  await initSchema();
  dbReady = true;
  console.log('  ✅ Database connected');
} catch (err) {
  console.error('  ❌ Failed to initialize database schema:', err);
  console.error('  💡 Make sure DATABASE_URL is set correctly');
  console.error('  ⚠️ Server will start WITHOUT database — frontend will be served but API will not work');
}

const app = express();

// ─── Middleware ───
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = /^https?:\/\/(localhost(:\d+)?|.*\.vercel\.app|.*\.loca\.lt|.*\.trycloudflare\.com|.*\.timeweb\.cloud|.*\.tw1\.ru)$/;
    callback(null, allowed.test(origin));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Parse JWT on all requests (optional — sets req.user if token present) ───
app.use(authOptional);

// ─── Guard API routes if DB is not connected ───
app.use('/api', (req, res, next) => {
  if (!dbReady) {
    return res.status(503).json({
      error: 'Database not connected',
      hint: 'DATABASE_URL is not configured correctly on this server',
    });
  }
  next();
});

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

// Uploads: /uploads/{filename} (avatars, etc.)
app.use('/uploads', express.static(PATHS.uploads, {
  maxAge: '30d',
  etag: true,
}));

// ─── API Routes ───
app.use('/api', routes);

// ─── Health check ───
app.get('/health', async (_req, res) => {
  if (!dbReady) {
    return res.status(503).json({
      status: 'degraded',
      error: 'Database not connected',
      uptime: process.uptime(),
    });
  }
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
} else {
  // Dev mode: redirect root to Vite dev server, return hint for other routes
  app.get('/', (_req, res) => {
    res.redirect('http://localhost:5173');
  });
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found', hint: 'This is the GROMKO API server. Frontend is served by Vite on port 5173.' });
  });
}

// ─── Error handler ───
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
  if (dbReady) {
    recalcArtistStats();
    setInterval(recalcArtistStats, 60 * 60 * 1000);
  }
});

async function recalcArtistStats() {
  try {
    const { execute, query, queryOne } = await import('./db.js');
    const { parseArtistNames } = await import('./parse-artists.js');
    const { v4: uuid } = await import('uuid');

    // Step 0: Normalize genres
    const genreMap: Record<string, string> = {
      'Rap': 'Рэп', 'Rap/Hip Hop': 'Рэп', 'Hip-Hop/Rap': 'Хип-хоп',
      'Hip Hop': 'Хип-хоп', 'hip-hop': 'Хип-хоп', 'rap': 'Рэп',
      'Pop': 'Pop', 'Rock': 'Rock', 'Electronic': 'Electronic',
      'R&B': 'R&B', 'Trap': 'Trap', 'Drill': 'Drill', 'Phonk': 'Phonk',
      'Toxic DUB': 'Другое',
    };
    for (const [from, to] of Object.entries(genreMap)) {
      if (from !== to) {
        await execute('UPDATE tracks SET genre = $1 WHERE genre = $2', [to, from]);
        await execute('UPDATE artists SET genre = $1 WHERE genre = $2', [to, from]);
      }
    }
    console.log('  ✅ Genres normalized');

    // Step 0.5: Fix broken slugs (re-transliterate from artist name)
    const allArtists = await query('SELECT id, name, slug FROM artists');
    let slugsFixed = 0;
    for (const a of allArtists) {
      const correctSlug = slugify(a.name);
      if (correctSlug && correctSlug !== a.slug) {
        // Check no collision
        const collision = await queryOne('SELECT id FROM artists WHERE slug = $1 AND id != $2', [correctSlug, a.id]);
        if (!collision) {
          await execute('UPDATE artists SET slug = $1 WHERE id = $2', [correctSlug, a.id]);
          await execute('UPDATE tracks SET artist_slug = $1 WHERE artist_slug = $2', [correctSlug, a.slug]);
          slugsFixed++;
        }
      }
    }
    if (slugsFixed > 0) console.log(`  🔧 Fixed ${slugsFixed} artist slugs`);

    // Step 1: Clean up combined-name artists (feat/ft/&/comma)
    const combinedArtists = await query(
      `SELECT id, name, slug, genre
       FROM artists
       WHERE name ~* '\\s+(feat\\.?|ft\\.?)\\s+'
          OR name LIKE '%,%'
          OR name LIKE '%;%'
          OR name ~ '\\s+&\\s+'`
    );
    let cleaned = 0;
    for (const ca of combinedArtists) {
      const names = parseArtistNames(ca.name);
      if (names.length <= 1) continue;

      // Get all tracks linked to this combined artist
      const links = await query('SELECT track_id, position FROM track_artists WHERE artist_id = $1', [ca.id]);

      // Ensure each individual artist exists and re-link tracks
      for (const link of links) {
        for (let i = 0; i < names.length; i++) {
          const aName = names[i];
          const aSlug = slugify(aName);
          let existing = await queryOne('SELECT id FROM artists WHERE slug = $1', [aSlug]);
          let artistId: string;
          if (existing) {
            artistId = existing.id;
          } else {
            artistId = uuid();
            await execute(
              'INSERT INTO artists (id, name, slug, genre, tracks_count, total_plays) VALUES ($1, $2, $3, $4, 0, 0)',
              [artistId, aName, aSlug, ca.genre]
            );
          }
          await execute(
            'INSERT INTO track_artists (track_id, artist_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [link.track_id, artistId, link.position + i]
          );
        }
      }

      // Update tracks that reference the combined artist_slug
      const primarySlug = slugify(names[0]);
      await execute('UPDATE tracks SET artist_slug = $1 WHERE artist_slug = $2', [primarySlug, ca.slug]);

      // Delete old links and the combined artist
      await execute('DELETE FROM track_artists WHERE artist_id = $1', [ca.id]);
      await execute('DELETE FROM artists WHERE id = $1', [ca.id]);
      cleaned++;
    }
    if (cleaned > 0) console.log(`  🧹 Cleaned ${cleaned} combined artists`);

    // Step 2: Recalculate track counts and play totals
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

    // Step 3: Remove "new" flag from tracks older than 24 hours
    await execute(`
      UPDATE tracks SET is_new = FALSE
      WHERE is_new = TRUE AND created_at < NOW() - INTERVAL '24 hours'
    `);

    console.log('  ✅ Artist stats recalculated');
  } catch (e: any) {
    console.error('  ❌ Artist stats recalc error:', e.message);
  }
}

// ─── Graceful shutdown ───
async function shutdown(signal: string) {
  console.log(`\n  ${signal} received, shutting down...`);
  server.close();

  // Stop SpotiFLAC Go server
  if (spotiflacProcess) {
    console.log('  Stopping SpotiFLAC...');
    spotiflacProcess.removeAllListeners('exit'); // prevent auto-restart
    spotiflacProcess.kill('SIGTERM');
    spotiflacProcess = null;
  }

  const { closeDb } = await import('./db.js');
  await closeDb();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
