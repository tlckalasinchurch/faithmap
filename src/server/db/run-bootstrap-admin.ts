import { describeErrorForLog, isAppError } from '../modules/errors';
import { getDbRuntime } from './client';
import { prepareSchema } from './migrate';
import { createFirstSuperAdmin } from '../modules/identity/bootstrap';

// Usage (owner, local terminal; values come from the owner's own shell, never from chat):
//   FAITHMAP_BOOTSTRAP_USERNAME=... FAITHMAP_BOOTSTRAP_NAME=... FAITHMAP_BOOTSTRAP_PASSWORD=... \
//   DATABASE_URL=... npm run db:bootstrap-admin
async function main() {
  const username = process.env.FAITHMAP_BOOTSTRAP_USERNAME ?? '';
  const displayName = process.env.FAITHMAP_BOOTSTRAP_NAME ?? '';
  const password = process.env.FAITHMAP_BOOTSTRAP_PASSWORD ?? '';
  const runtime = getDbRuntime();
  try {
    await prepareSchema(runtime); // remote databases must already be migrated (npm run db:migrate)
    const created = await createFirstSuperAdmin(runtime.db, { username, displayName, password });
    console.log(`Super admin created: ${created.username}`);
  } finally {
    await runtime.close();
  }
}

main().catch((err) => {
  console.error(isAppError(err) ? err.message : `Bootstrap failed: ${JSON.stringify(describeErrorForLog(err))}`);
  process.exit(1);
});
