import { getDbRuntime } from './client';
import { ensureSchema } from './migrate';

async function main() {
  const runtime = getDbRuntime();
  await ensureSchema(runtime);
  console.log(`FaithMap PostgreSQL schema ready (driver=${runtime.driver}).`);
  await runtime.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
