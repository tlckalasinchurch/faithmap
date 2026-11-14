import { getDbRuntime } from './client';
import { ensureSchema } from './migrate';
import { ensureSeeded } from './seed';

async function main() {
  const runtime = getDbRuntime();
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
