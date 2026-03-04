/**
 * GROMKO Database Layer — PostgreSQL via pg.Pool
 * Requires DATABASE_URL environment variable.
 */
import pg from 'pg';
import 'dotenv/config';
export declare function getPool(): pg.Pool;
export declare function query<T = any>(text: string, params?: any[]): Promise<T[]>;
export declare function queryOne<T = any>(text: string, params?: any[]): Promise<T | null>;
export declare function execute(text: string, params?: any[]): Promise<number>;
export declare function initSchema(): Promise<void>;
export declare function closeDb(): Promise<void>;
//# sourceMappingURL=db.d.ts.map