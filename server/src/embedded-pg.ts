/**
 * Embedded PostgreSQL — starts a local PG instance if no DATABASE_URL is set.
 * Uses the `embedded-postgres` npm package which downloads PG binaries automatically.
 * No system-level PostgreSQL installation required.
 */

import EmbeddedPostgres from 'embedded-postgres';

const PGPORT = 5432;
const PGUSER = 'gromko';
const PGPASSWORD = 'gromko';
const PGDATABASE = 'gromko';
const DATA_DIR = process.env.PGDATA || '/tmp/pgdata';

let pg: EmbeddedPostgres | null = null;

export async function startEmbeddedPostgres(): Promise<string> {
  // If DATABASE_URL is set, skip embedded PG entirely
  if (process.env.DATABASE_URL) {
    console.log('  ℹ️  DATABASE_URL found — skipping embedded PostgreSQL');
    return process.env.DATABASE_URL;
  }

  console.log('  🐘 Starting embedded PostgreSQL (npm package)...');

  pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: PGUSER,
    password: PGPASSWORD,
    port: PGPORT,
    persistent: true,
    // Timeweb runs containers as non-root user 'app' — create a postgres system user if running as root
    createPostgresUser: process.getuid?.() === 0,
    onLog: (msg: string) => console.log('  [PG]', msg),
    onError: (msg: string | Error | unknown) => console.error('  [PG ERROR]', msg),
  });

  // Initialize data directory (idempotent — skips if already initialized)
  console.log('  � Initializing PostgreSQL data directory...');
  await pg.initialise();
  console.log('  ✅ Data directory ready');

  // Start the server
  console.log('  🚀 Starting PostgreSQL server...');
  await pg.start();
  console.log('  ✅ PostgreSQL is running on port ' + PGPORT);

  // Create the application database
  try {
    await pg.createDatabase(PGDATABASE);
    console.log(`  ✅ Database "${PGDATABASE}" created`);
  } catch (e: any) {
    // Database might already exist — that's fine
    if (!e.message?.includes('already exists')) {
      console.warn('  ⚠️  DB create warning:', e.message);
    } else {
      console.log(`  ℹ️  Database "${PGDATABASE}" already exists`);
    }
  }

  const dbUrl = `postgresql://${PGUSER}:${PGPASSWORD}@127.0.0.1:${PGPORT}/${PGDATABASE}`;
  process.env.DATABASE_URL = dbUrl;
  console.log(`  📎 DATABASE_URL = ${dbUrl}`);
  return dbUrl;
}

/** Stop embedded PostgreSQL gracefully */
export function stopEmbeddedPostgres(): void {
  if (pg) {
    console.log('  🛑 Stopping embedded PostgreSQL...');
    pg.stop().catch((e) => console.error('  ⚠️  PG stop error:', e));
    pg = null;
  }
}
