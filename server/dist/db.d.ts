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
export declare function getPool(): pg.Pool;
/** Run a query and return rows */
export declare function query<T = any>(text: string, params?: any[]): Promise<T[]>;
/** Run a query and return first row or null */
export declare function queryOne<T = any>(text: string, params?: any[]): Promise<T | null>;
/** Run a query returning no data (INSERT/UPDATE/DELETE) */
export declare function execute(text: string, params?: any[]): Promise<number>;
/** Initialize database schema (retries for Neon cold starts) */
export declare function initSchema(): Promise<void>;
export declare function closeDb(): Promise<void>;
//# sourceMappingURL=db.d.ts.map