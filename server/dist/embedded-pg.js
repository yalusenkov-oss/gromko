/**
 * Embedded PostgreSQL — starts a local PG instance if no DATABASE_URL is set.
 * Uses the `embedded-postgres` npm package which downloads PG binaries automatically.
 * No system-level PostgreSQL installation required.
 */
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'fs';
import path from 'path';
const PGPORT = 5432;
const PGUSER = 'gromko';
const PGPASSWORD = 'gromko';
const PGDATABASE = 'gromko';
const DATA_DIR = process.env.PGDATA || '/tmp/pgdata';
let pg = null;
function createPgInstance() {
    return new EmbeddedPostgres({
        databaseDir: DATA_DIR,
        user: PGUSER,
        password: PGPASSWORD,
        port: PGPORT,
        persistent: true,
        createPostgresUser: process.getuid?.() === 0,
        onLog: (msg) => console.log('  [PG]', msg),
        onError: (msg) => console.error('  [PG ERROR]', msg),
    });
}
/** Check if the PG data directory has already been fully initialized */
function isDataDirInitialized() {
    return fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));
}
/** Remove data dir contents so initdb can start fresh */
function cleanDataDir() {
    console.log('  🗑️  Cleaning stale data directory:', DATA_DIR);
    try {
        fs.rmSync(DATA_DIR, { recursive: true, force: true });
    }
    catch (e) {
        console.warn('  ⚠️  Could not clean data dir:', e.message);
    }
}
export async function startEmbeddedPostgres() {
    // If DATABASE_URL is set, skip embedded PG entirely
    if (process.env.DATABASE_URL) {
        console.log('  ℹ️  DATABASE_URL found — skipping embedded PostgreSQL');
        return process.env.DATABASE_URL;
    }
    console.log('  🐘 Starting embedded PostgreSQL (npm package)...');
    console.log('  📁 PGDATA:', DATA_DIR);
    console.log('  👤 UID:', process.getuid?.(), '  GID:', process.getgid?.());
    console.log('  📁 Data dir exists:', fs.existsSync(DATA_DIR));
    console.log('  📁 Data dir initialized:', isDataDirInitialized());
    pg = createPgInstance();
    // ── Step 1: Initialize ──
    if (!isDataDirInitialized()) {
        // If data dir exists but is not initialized (partial/broken state), clean it
        if (fs.existsSync(DATA_DIR)) {
            cleanDataDir();
            pg = createPgInstance();
        }
        console.log('  📁 Initializing PostgreSQL data directory...');
        try {
            await pg.initialise();
            console.log('  ✅ Data directory initialized');
        }
        catch (initErr) {
            console.error('  ❌ initdb failed:', initErr.message || initErr);
            // One more try: clean and re-create
            cleanDataDir();
            pg = createPgInstance();
            await pg.initialise();
            console.log('  ✅ Data directory initialized (retry)');
        }
    }
    else {
        console.log('  ℹ️  Data directory already initialized, skipping initdb');
    }
    // ── Step 2: Start ──
    console.log('  🚀 Starting PostgreSQL server...');
    await pg.start();
    console.log('  ✅ PostgreSQL is running on port ' + PGPORT);
    // ── Step 3: Create database ──
    try {
        await pg.createDatabase(PGDATABASE);
        console.log(`  ✅ Database "${PGDATABASE}" created`);
    }
    catch (e) {
        if (e.message?.includes('already exists')) {
            console.log(`  ℹ️  Database "${PGDATABASE}" already exists`);
        }
        else {
            console.warn('  ⚠️  DB create warning:', e.message);
        }
    }
    const dbUrl = `postgresql://${PGUSER}:${PGPASSWORD}@127.0.0.1:${PGPORT}/${PGDATABASE}`;
    process.env.DATABASE_URL = dbUrl;
    console.log(`  📎 DATABASE_URL = ${dbUrl}`);
    return dbUrl;
}
/** Stop embedded PostgreSQL gracefully */
export function stopEmbeddedPostgres() {
    if (pg) {
        console.log('  🛑 Stopping embedded PostgreSQL...');
        pg.stop().catch((e) => console.error('  ⚠️  PG stop error:', e));
        pg = null;
    }
}
//# sourceMappingURL=embedded-pg.js.map