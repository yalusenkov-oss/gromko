/**
 * Embedded PostgreSQL — starts a local PG instance if no DATABASE_URL is set.
 * Uses the `embedded-postgres` npm package which downloads PG binaries automatically.
 * No system-level PostgreSQL installation required.
 */
export declare function startEmbeddedPostgres(): Promise<string>;
/** Stop embedded PostgreSQL gracefully */
export declare function stopEmbeddedPostgres(): void;
//# sourceMappingURL=embedded-pg.d.ts.map