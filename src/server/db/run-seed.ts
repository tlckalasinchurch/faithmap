import { getDbRuntime } from './client';
import { ensureSchema } from './migrate';
import { ensureSeeded, isExplicitSeedAllowed } from './seed';

async function main() {
  const runtime = getDbRuntime();
  if (!isExplicitSeedAllowed(runtime.driver)) {
    await runtime.close();
    throw new Error(
      'Refusing to seed a remote PostgreSQL database. Set FAITHMAP_ALLOW_REMOTE_SEED=true only for a synthetic staging database.'
    );
  }
  await ensureSchema(runtime);
  const inserted = await ensureSeeded(runtime.db);
  console.log(
    inserted
      ? `FaithMap Kalasin pilot data seeded (driver=${runtime.driver}).`
      : `FaithMap seed already present (driver=${runtime.driver}).`
  );
  await runtime.close();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
