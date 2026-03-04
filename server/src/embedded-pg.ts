/**
 * Embedded PostgreSQL — starts a local PG instance if no DATABASE_URL is set.
 * Works inside Docker container where `pg_isready`, `initdb`, `pg_ctl` are available.
 */

import { execSync, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const PGDATA = process.env.PGDATA || '/tmp/pgdata';
const PGPORT = '5432';
const PGUSER = 'gromko';
const PGDATABASE = 'gromko';
const SOCKET_DIR = '/tmp';

function pgBin(name: string): string {
  // Try common PostgreSQL binary paths
  const paths = [
    `/usr/lib/postgresql/15/bin/${name}`,
    `/usr/lib/postgresql/16/bin/${name}`,
    `/usr/lib/postgresql/17/bin/${name}`,
    `/usr/bin/${name}`,
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  // fallback — hope it's on PATH
  return name;
}

function run(bin: string, args: string[], env?: Record<string, string>): string {
  try {
    return execFileSync(bin, args, {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      timeout: 30000,
    }).trim();
  } catch (e: any) {
    return e.stderr?.toString() || e.message;
  }
}

export async function startEmbeddedPostgres(): Promise<string> {
  // If DATABASE_URL is set, skip embedded PG entirely
  if (process.env.DATABASE_URL) {
    console.log('  ℹ️  DATABASE_URL found — skipping embedded PostgreSQL');
    return process.env.DATABASE_URL;
  }

  console.log('  🐘 Starting embedded PostgreSQL...');

  // 1. Init data directory if needed
  if (!fs.existsSync(path.join(PGDATA, 'PG_VERSION'))) {
    console.log(`  📁 Initializing data directory: ${PGDATA}`);
    fs.mkdirSync(PGDATA, { recursive: true });
    const initResult = run(pgBin('initdb'), [
      '-D', PGDATA,
      '-U', PGUSER,
      '--no-locale',
      '--encoding=UTF8',
      '--auth=trust',
    ]);
    if (!fs.existsSync(path.join(PGDATA, 'PG_VERSION'))) {
      console.error('  ❌ initdb failed:', initResult);
      throw new Error('Failed to initialize PostgreSQL data directory');
    }
    console.log('  ✅ Data directory initialized');
  }

  // 2. Configure pg_hba.conf for local trust auth
  const hbaPath = path.join(PGDATA, 'pg_hba.conf');
  fs.writeFileSync(hbaPath, [
    'local all all trust',
    'host all all 127.0.0.1/32 trust',
    'host all all ::1/128 trust',
  ].join('\n') + '\n');

  // 3. Start PostgreSQL
  console.log('  🚀 Starting PostgreSQL server...');
  run(pgBin('pg_ctl'), [
    'start',
    '-D', PGDATA,
    '-l', '/tmp/pg.log',
    '-o', `-p ${PGPORT} -k ${SOCKET_DIR}`,
    '-w',  // wait for startup
  ]);

  // 4. Wait for PG to be ready (up to 10 seconds)
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      execSync(`${pgBin('pg_isready')} -h 127.0.0.1 -p ${PGPORT} -U ${PGUSER} -q`, { timeout: 2000 });
      ready = true;
      break;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (!ready) {
    // Print PG log for debugging
    try { console.error(fs.readFileSync('/tmp/pg.log', 'utf-8')); } catch {}
    throw new Error('PostgreSQL did not start in time');
  }

  console.log('  ✅ PostgreSQL is running on port ' + PGPORT);

  // 5. Create database if it doesn't exist
  try {
    execSync(
      `${pgBin('psql')} -h 127.0.0.1 -p ${PGPORT} -U ${PGUSER} -tc "SELECT 1 FROM pg_database WHERE datname='${PGDATABASE}'" | grep -q 1 || ${pgBin('psql')} -h 127.0.0.1 -p ${PGPORT} -U ${PGUSER} -c "CREATE DATABASE ${PGDATABASE}"`,
      { encoding: 'utf-8', shell: '/bin/sh', timeout: 10000 }
    );
  } catch (e: any) {
    console.warn('  ⚠️  DB create warning:', e.message);
  }

  const dbUrl = `postgresql://${PGUSER}@127.0.0.1:${PGPORT}/${PGDATABASE}`;
  process.env.DATABASE_URL = dbUrl;
  console.log(`  📎 DATABASE_URL = ${dbUrl}`);
  return dbUrl;
}

/** Stop embedded PostgreSQL gracefully */
export function stopEmbeddedPostgres(): void {
  if (process.env.DATABASE_URL?.includes('127.0.0.1') && fs.existsSync(path.join(PGDATA, 'PG_VERSION'))) {
    console.log('  🛑 Stopping embedded PostgreSQL...');
    try {
      run(pgBin('pg_ctl'), ['stop', '-D', PGDATA, '-m', 'fast']);
    } catch {}
  }
}
