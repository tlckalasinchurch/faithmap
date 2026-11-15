import { getDbRuntime } from './client';
import { applyMigrations, countAppliedMigrations, EXPECTED_MIGRATION_COUNT } from './migrate';

/**
 * Controlled migration command. Run by the owner or an approved release job, never by the web app.
 * For a remote database the owner must name the host on purpose:
 *   FAITHMAP_CONFIRM_MIGRATE_HOST=<host from the connection string> npm run db:migrate
 */
function remoteHost(url: string | undefined): string | null {
  if (!url || !/^postgres(ql)?:\/\//.test(url)) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return 'unparseable-host';
  }
}

async function main() {
  const host = remoteHost(process.env.DATABASE_URL);
  if (host && process.env.FAITHMAP_CONFIRM_MIGRATE_HOST !== host) {
    throw new Error(
      `Refusing to migrate remote host "${host}". Set FAITHMAP_CONFIRM_MIGRATE_HOST=${host} to confirm.`
    );
  }
  const runtime = getDbRuntime();
  try {
    await applyMigrations(runtime);
    const applied = await countAppliedMigrations(runtime);
    console.log(
      `FaithMap schema ready (driver=${runtime.driver}, migrations=${applied}/${EXPECTED_MIGRATION_COUNT}).`
    );
  } finally {
    await runtime.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
