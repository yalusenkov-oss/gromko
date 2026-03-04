/**
 * Embedded PostgreSQL via PGlite (Postgres compiled to WASM).
 * Works on any platform without external binaries.
 *
 * When DATABASE_URL is NOT set, PGlite is used as an in-memory
 * (or /tmp-persisted) PostgreSQL instance.
 *
 * When DATABASE_URL IS set, this module does nothing — the app
 * uses the external pg.Pool from db.ts.
 */
import { PGlite } from '@electric-sql/pglite';
const DATA_DIR = process.env.PGDATA || '/tmp/pglite-data';
let pgliteInstance = null;
/**
 * Start PGlite embedded Postgres.
 * Returns the PGlite instance (or null if DATABASE_URL is set).
 */
export async function startEmbeddedPostgres() {
    if (process.env.DATABASE_URL) {
        console.log('  ℹ️  DATABASE_URL found — skipping embedded PGlite');
        return null;
    }
    console.log('  🐘 Starting PGlite (Postgres in WASM)...');
    console.log('  📁 Data dir:', DATA_DIR);
    try {
        pgliteInstance = new PGlite(DATA_DIR);
        // Quick smoke test
        const res = await pgliteInstance.query("SELECT 'PGlite ready' as status");
        console.log('  ✅ PGlite is running:', res.rows[0]?.status);
        return pgliteInstance;
    }
    catch (err) {
        console.error('  ❌ PGlite failed to start:', err.message || err);
        console.error('  💡 Set DATABASE_URL environment variable to use an external database instead');
        throw err;
    }
}
/** Get the running PGlite instance */
export function getPGlite() {
    return pgliteInstance;
}
/** Stop PGlite gracefully */
export async function stopEmbeddedPostgres() {
    if (pgliteInstance) {
        console.log('  🛑 Closing PGlite...');
        try {
            await pgliteInstance.close();
        }
        catch (e) {
            console.error('  ⚠️  PGlite close error:', e.message);
        }
        pgliteInstance = null;
    }
}
//# sourceMappingURL=embedded-pg.js.map