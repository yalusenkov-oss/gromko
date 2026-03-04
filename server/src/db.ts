/**
 * GROMKO Database Layer — PostgreSQL
 *
 * Вместо SQLite используем PostgreSQL для:
 * - Многопользовательского доступа (concurrent connections)
 * - Продакшен-ready (hosted на любом облаке)
 * - Полнотекстовый поиск, JSONB, нормальные массивы
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

let pool: pg.Pool | undefined;

function isLocalHost(host?: string): boolean {
  return !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function hostFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname; } catch { return undefined; }
}

function buildPoolOptions(): pg.PoolConfig {
  const connectionString = process.env.DATABASE_URL;
  const hasDiscretePgVars = Boolean(process.env.PGHOST || process.env.PGUSER || process.env.PGDATABASE);
  const host = process.env.PGHOST || hostFromUrl(connectionString);

  const shouldUseSsl = process.env.DATABASE_SSL === 'false'
    ? false
    : !isLocalHost(host);

  if (!connectionString && !hasDiscretePgVars && process.env.NODE_ENV === 'production') {
    throw new Error(
      'Database is not configured. Set DATABASE_URL environment variable (e.g. postgresql://user:pass@host:5432/gromko).'
    );
  }

  return {
    connectionString: connectionString || undefined,
    host: process.env.PGHOST || undefined,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER || undefined,
    password: process.env.PGPASSWORD || undefined,
    database: process.env.PGDATABASE || undefined,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 30000,
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5000,
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
  };
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool(buildPoolOptions());
    pool.on('error', (err) => {
      console.error('DB pool error, resetting pool:', err.message);
      pool = undefined;
    });
  }
  return pool;
}

/** Run a query and return rows */
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

/** Run a query and return first row or null */
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const res = await getPool().query(text, params);
  return (res.rows[0] as T) || null;
}

/** Run a query returning no data (INSERT/UPDATE/DELETE) */
export async function execute(text: string, params?: any[]): Promise<number> {
  const res = await getPool().query(text, params);
  return res.rowCount || 0;
}

/** Initialize database schema (retries for Neon cold starts) */
export async function initSchema(): Promise<void> {
  let client: pg.PoolClient | undefined;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      client = await getPool().connect();
      break;
    } catch (err: any) {
      console.warn(`  ⏳ DB connect attempt ${attempt}/5 failed: ${err.code || err.message}`);
      if (attempt === 5) throw err;
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  if (!client) throw new Error('Failed to connect to database');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        artist_slug TEXT NOT NULL,
        genre TEXT NOT NULL,
        year INTEGER NOT NULL,
        duration DOUBLE PRECISION NOT NULL DEFAULT 0,
        plays INTEGER NOT NULL DEFAULT 0,
        likes INTEGER NOT NULL DEFAULT 0,
        explicit BOOLEAN NOT NULL DEFAULT FALSE,
        is_new BOOLEAN NOT NULL DEFAULT TRUE,
        featured BOOLEAN NOT NULL DEFAULT FALSE,

        original_filename TEXT,
        original_format TEXT,
        original_size BIGINT,
        original_bitrate INTEGER,
        original_sample_rate INTEGER,
        original_channels INTEGER,

        cover_path TEXT,

        status TEXT NOT NULL DEFAULT 'pending',
        processing_error TEXT,
        processing_started_at TIMESTAMPTZ,
        processing_finished_at TIMESTAMPTZ,

        hls_master TEXT,
        stream_low TEXT,
        stream_medium TEXT,
        stream_high TEXT,
        stream_lossless TEXT,

        waveform_peaks JSONB,

        meta_album TEXT,
        meta_track_number INTEGER,
        meta_bpm DOUBLE PRECISION,
        meta_key TEXT,
        meta_loudness_lufs DOUBLE PRECISION,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS artists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        photo TEXT,
        bio TEXT,
        genre TEXT,
        tracks_count INTEGER NOT NULL DEFAULT 0,
        total_plays INTEGER NOT NULL DEFAULT 0,
        socials_vk TEXT,
        socials_instagram TEXT,
        socials_telegram TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        avatar TEXT,
        is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
        liked_tracks TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        genre TEXT NOT NULL,
        year INTEGER NOT NULL,
        comment TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        reject_reason TEXT,
        original_filename TEXT,
        file_path TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id),
        track_ids TEXT[] NOT NULL DEFAULT '{}',
        is_public BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS play_history (
        id SERIAL PRIMARY KEY,
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        user_id TEXT,
        played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        duration_listened DOUBLE PRECISION NOT NULL DEFAULT 0,
        quality TEXT NOT NULL DEFAULT 'medium'
      );

      -- Junction table: many-to-many tracks ↔ artists
      CREATE TABLE IF NOT EXISTS track_artists (
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (track_id, artist_id)
      );

      CREATE INDEX IF NOT EXISTS idx_tracks_status ON tracks(status);
      CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
      CREATE INDEX IF NOT EXISTS idx_tracks_artist_slug ON tracks(artist_slug);
      CREATE INDEX IF NOT EXISTS idx_track_artists_track ON track_artists(track_id);
      CREATE INDEX IF NOT EXISTS idx_track_artists_artist ON track_artists(artist_id);
      CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id);
      CREATE INDEX IF NOT EXISTS idx_play_history_user ON play_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    console.log('  ✅ Database schema initialized');
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = undefined;
    await p.end();
  }
}
