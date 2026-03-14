/**
 * GROMKO Database Layer — PostgreSQL via pg.Pool
 * Requires DATABASE_URL environment variable.
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

let pool: pg.Pool | undefined;

function isLocalHost(host?: string): boolean {
  if (!host) return true;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  // Private network ranges (Timeweb internal DB uses 192.168.x.x)
  if (host.startsWith('10.') || host.startsWith('172.') || host.startsWith('192.168.')) return true;
  return false;
}

function hostFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try { return new URL(url).hostname; } catch { /* ignore */ }
  // Fallback: extract host via regex when URL has unescaped special chars
  const m = url.match(/@([^:/]+)/);
  return m ? m[1] : undefined;
}

/**
 * Fix DATABASE_URL that contains un-encoded special characters in the password.
 * e.g. postgresql://user:p@ss>w*rd@host:5432/db → properly encoded password
 */
function sanitizeConnectionString(raw: string): string {
  // Match: scheme://user:password@host:port/db?params
  const m = raw.match(/^(postgresql|postgres):\/\/([^:]+):(.+)@([^@]+)$/);
  if (!m) return raw; // can't parse — return as-is
  const [, scheme, user, password, hostAndRest] = m;
  const encodedPassword = encodeURIComponent(password);
  return `${scheme}://${encodeURIComponent(user)}:${encodedPassword}@${hostAndRest}`;
}

function buildPoolOptions(): pg.PoolConfig {
  const rawConnectionString = process.env.DATABASE_URL;
  const connectionString = rawConnectionString ? sanitizeConnectionString(rawConnectionString) : undefined;
  const hasDiscretePgVars = Boolean(process.env.PGHOST || process.env.PGUSER || process.env.PGDATABASE);
  const host = process.env.PGHOST || hostFromUrl(rawConnectionString);

  const shouldUseSsl = process.env.DATABASE_SSL === 'false'
    ? false
    : !isLocalHost(host);

  console.log(`  🔌 DB config: host=${host}, ssl=${shouldUseSsl}, hasConnectionString=${!!connectionString}`);

  if (!connectionString && !hasDiscretePgVars) {
    throw new Error(
      'DATABASE_URL is not set. Create a PostgreSQL database on Timeweb and set the DATABASE_URL env variable.'
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

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const res = await getPool().query(text, params);
  return (res.rows[0] as T) || null;
}

export async function execute(text: string, params?: any[]): Promise<number> {
  const res = await getPool().query(text, params);
  return res.rowCount || 0;
}

export async function initSchema(): Promise<void> {
  let client: pg.PoolClient | undefined;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      client = await getPool().connect();
      break;
    } catch (err: any) {
      console.warn('  DB connect attempt ' + attempt + '/5 failed: ' + (err.code || err.message));
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
        banner TEXT,
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
        country TEXT,
        timezone TEXT,
        is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
        liked_tracks TEXT[] NOT NULL DEFAULT '{}',
        liked_albums TEXT[] NOT NULL DEFAULT '{}',
        liked_artists TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        release_id TEXT,
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
    // Migration: site_settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    // Migration: add banner column if missing
    await client.query(`ALTER TABLE artists ADD COLUMN IF NOT EXISTS banner TEXT`);
    // Migration: add liked_albums, liked_artists, country columns
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS liked_albums TEXT[] NOT NULL DEFAULT '{}'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS liked_artists TEXT[] NOT NULL DEFAULT '{}'`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT`);
    // Migration: add cover_path and album_name to submissions
    await client.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS cover_path TEXT`);
    await client.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS album_name TEXT`);
    await client.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS release_id TEXT`);

    // Migration: social features — user_follows + enhanced playlists
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_follows (
        follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (follower_id, following_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
      CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id);
    `);
    await client.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS description TEXT`);
    await client.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS cover_url TEXT`);
    await client.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

    // Migration: track metadata enrichment columns
    await client.query(`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS release_date DATE`);
    await client.query(`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS meta_label TEXT`);
    await client.query(`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS meta_isrc TEXT`);

    // Add bio column to users for public profiles
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`);
    // Add username column for unique user IDs
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT`);
    // Drop old index if it exists (may have wrong WHERE clause from earlier migration)
    await client.query(`DROP INDEX IF EXISTS idx_users_username`);
    // Backfill username for users that don't have one yet (or have empty string)
    // For Cyrillic/non-Latin names the regex strips everything, so fallback to 'user_' + id prefix
    await client.query(`
      UPDATE users
      SET username = CASE
        WHEN LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9_]', '', 'g')) <> ''
          THEN LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9_]', '', 'g'))
        ELSE 'user_' || LEFT(id, 8)
      END
      WHERE username IS NULL OR username = ''
    `);
    // Handle potential collisions by appending id suffix
    await client.query(`
      UPDATE users u SET username = u.username || '_' || LEFT(u.id, 4)
      WHERE (SELECT COUNT(*) FROM users u2 WHERE u2.username = u.username AND u2.id <> u.id) > 0
    `);
    // Recreate unique index excluding NULL and empty strings
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL AND username <> ''`);

    // Migration: recommendation system tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_events (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        track_id TEXT,
        artist_slug TEXT,
        genre TEXT,
        context TEXT,
        duration_listened DOUBLE PRECISION DEFAULT 0,
        track_duration DOUBLE PRECISION DEFAULT 0,
        session_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS user_taste_profile (
        user_id TEXT PRIMARY KEY,
        genre_scores JSONB NOT NULL DEFAULT '{}',
        artist_scores JSONB NOT NULL DEFAULT '{}',
        preferred_bpm_min DOUBLE PRECISION DEFAULT 80,
        preferred_bpm_max DOUBLE PRECISION DEFAULT 160,
        avg_listen_ratio DOUBLE PRECISION DEFAULT 0.7,
        skip_rate DOUBLE PRECISION DEFAULT 0.2,
        exploration_score DOUBLE PRECISION DEFAULT 0.5,
        time_preferences JSONB NOT NULL DEFAULT '{}',
        timezone TEXT,
        events_processed INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_events_user ON user_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_events_track ON user_events(track_id);
      CREATE INDEX IF NOT EXISTS idx_user_events_type ON user_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_user_events_created ON user_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_user_events_user_type ON user_events(user_id, event_type);
    `);
    await client.query(`ALTER TABLE user_taste_profile ADD COLUMN IF NOT EXISTS timezone TEXT`);

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
