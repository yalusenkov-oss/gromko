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
/**
 * Start PGlite embedded Postgres.
 * Returns the PGlite instance (or null if DATABASE_URL is set).
 */
export declare function startEmbeddedPostgres(): Promise<PGlite | null>;
/** Get the running PGlite instance */
export declare function getPGlite(): PGlite | null;
/** Stop PGlite gracefully */
export declare function stopEmbeddedPostgres(): Promise<void>;
//# sourceMappingURL=embedded-pg.d.ts.map