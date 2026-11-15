import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

export type FaithMapDb = PgliteDatabase<typeof schema>;

export interface DbRuntime {
  db: FaithMapDb;
  driver: 'pglite' | 'postgres';
  execRaw: (sqlText: string) => Promise<void>;
  close: () => Promise<void>;
}

const globalForDb = globalThis as unknown as {
  __faithmapRuntime?: DbRuntime;
  __faithmapReadyPromise?: Promise<DbRuntime>;
};

function isRemotePostgresUrl(url: string | undefined): url is string {
  if (!url) return false;
  return url.startsWith('postgres://') || url.startsWith('postgresql://');
}

function resolvePgliteDir(url: string | undefined): string {
  if (url && url.startsWith('pglite://')) {
    const raw = url.slice('pglite://'.length);
    return path.isAbsolute(raw)
      ? raw
      : path.resolve(/*turbopackIgnore: true*/ process.cwd(), raw);
  }
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), '.data', 'faithmap-pg');
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Pool settings for a remote PostgreSQL URL.
 * Certificates are always verified for non-local hosts. `sslmode` is removed from the URL
 * because the pg driver would let it override the explicit `ssl` setting.
 */
export function buildPoolConfig(
  url: string,
  env: Record<string, string | undefined> = process.env
): { connectionString: string; ssl: false | { rejectUnauthorized: true; ca?: string }; max: number } {
  const parsed = new URL(url);
  const local = LOCAL_HOSTS.has(parsed.hostname);
  parsed.searchParams.delete('sslmode');
  const max = Math.min(Math.max(Number(env.DATABASE_POOL_MAX ?? '5') || 5, 1), 20);
  return {
    connectionString: parsed.toString(),
    ssl: local ? false : { rejectUnauthorized: true, ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}) },
    max,
  };
}

export function createDbRuntimeFromEnv(): DbRuntime {
  const url = process.env.DATABASE_URL;
  if (isRemotePostgresUrl(url)) {
    const pool = new Pool(buildPoolConfig(url));
    const db = drizzlePg(pool, { schema }) as unknown as FaithMapDb;
    return {
      db,
      driver: 'postgres',
      execRaw: async (sqlText: string) => {
        await pool.query(sqlText);
      },
      close: async () => {
        await pool.end();
      },
    };
  }

  const dataDir = resolvePgliteDir(url);
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  return {
    db,
    driver: 'pglite',
    execRaw: async (sqlText: string) => {
      await client.exec(sqlText);
    },
    close: async () => {
      await client.close();
    },
  };
}

export function getDbRuntime(): DbRuntime {
  if (!globalForDb.__faithmapRuntime) {
    globalForDb.__faithmapRuntime = createDbRuntimeFromEnv();
  }
  return globalForDb.__faithmapRuntime;
}

export async function createInMemoryTestRuntime(): Promise<DbRuntime> {
  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  return {
    db,
    driver: 'pglite',
    execRaw: async (sqlText: string) => {
      await client.exec(sqlText);
    },
    close: async () => {
      await client.close();
    },
  };
}
