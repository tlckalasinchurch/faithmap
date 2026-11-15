import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDbRuntimeFromEnv, resetDbRuntimeForTests } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded } from '@/server/db/seed';

export interface RouteTestDbHandle {
  cleanup: () => Promise<void>;
}

/**
 * Configures DATABASE_URL and FAITHMAP_DEMO_MODE for route-level integration tests.
 * Uses real PostgreSQL 16 when FAITHMAP_TEST_ALL_POSTGRES=1 and FAITHMAP_TEST_DATABASE_URL
 * targets a scratch database ("faithmap_test"); otherwise uses an isolated temp PGlite dir.
 */
export async function setupRouteTestDb(
  prefix: string,
  options: { demoMode: boolean; seedIfPostgres?: boolean; extraEnvKeys?: string[] }
): Promise<RouteTestDbHandle> {
  const keys = ['DATABASE_URL', 'FAITHMAP_DEMO_MODE', ...(options.extraEnvKeys ?? [])];
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) saved[k] = process.env[k];

  await resetDbRuntimeForTests();

  const pgUrl = process.env.FAITHMAP_TEST_DATABASE_URL;
  const usePostgres =
    process.env.FAITHMAP_TEST_ALL_POSTGRES === '1' &&
    Boolean(pgUrl && pgUrl.includes('faithmap_test'));

  let dir = '';
  if (usePostgres && pgUrl) {
    process.env.DATABASE_URL = pgUrl;
    process.env.FAITHMAP_DEMO_MODE = options.demoMode ? 'true' : 'false';
    const rt = createDbRuntimeFromEnv();
    try {
      await rt.execRaw(
        'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;'
      );
      await ensureSchema(rt);
      if (options.seedIfPostgres ?? options.demoMode) {
        await ensureSeeded(rt.db);
      }
    } finally {
      await rt.close();
    }
  } else {
    dir = mkdtempSync(path.join(tmpdir(), prefix));
    process.env.DATABASE_URL = `pglite://${dir}`;
    process.env.FAITHMAP_DEMO_MODE = options.demoMode ? 'true' : 'false';
  }

  return {
    cleanup: async () => {
      await resetDbRuntimeForTests();
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
