/**
 * GROMKO Database Layer
 * PostgreSQL (external via pg.Pool) or PGlite (embedded WASM Postgres).
 */
import pg from 'pg';
import 'dotenv/config';
export declare function getPool(): pg.Pool;
/** Run a query and return rows */
export declare function query<T = any>(text: string, params?: any[]): Promise<T[]>;
/** Run a query and return first row or null */
export declare function queryOne<T = any>(text: string, params?: any[]): Promise<T | null>;
/** Run a query returning no data (INSERT/UPDATE/DELETE) */
export declare function execute(text: string, params?: any[]): Promise<number>;
/** Initialize database schema */
export declare function initSchema(): Promise<void>;
export declare function closeDb(): Promise<void>;
//# sourceMappingURL=db.d.ts.map