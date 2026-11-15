import { getDbRuntime, type DbRuntime, type FaithMapDb } from './client';
import { prepareSchema } from './migrate';
import { ensureSeeded, shouldAutoSeed } from './seed';

const globalForBootstrap = globalThis as unknown as {
  __faithmapBootstrapPromise?: Promise<DbRuntime>;
};

export async function getReadyRuntime(): Promise<DbRuntime> {
  if (!globalForBootstrap.__faithmapBootstrapPromise) {
    globalForBootstrap.__faithmapBootstrapPromise = (async () => {
      const runtime = getDbRuntime();
      await prepareSchema(runtime);
      if (shouldAutoSeed(runtime.driver)) await ensureSeeded(runtime.db);
      return runtime;
    })();
  }
  return globalForBootstrap.__faithmapBootstrapPromise;
}

export async function getReadyDb(): Promise<FaithMapDb> {
  const runtime = await getReadyRuntime();
  return runtime.db;
}
