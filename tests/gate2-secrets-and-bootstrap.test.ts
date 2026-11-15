import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { hashSessionToken } from '@/server/modules/identity/crypto';
import { getCronSecret } from '@/server/http/cron-auth';
import { createFirstSuperAdmin } from '@/server/modules/identity/bootstrap';
import { loginWithPassword } from '@/server/modules/identity/service';

const KEYS = ['NODE_ENV', 'AUTH_SESSION_PEPPER', 'CRON_SECRET'] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else (process.env as Record<string, string>)[k] = saved[k]!;
  }
});
const set = (k: (typeof KEYS)[number], v: string | undefined) => {
  if (v === undefined) delete process.env[k];
  else (process.env as Record<string, string>)[k] = v;
};

describe('Gate 2: production refuses default secrets', () => {
  it('throws when AUTH_SESSION_PEPPER is missing or short in production', () => {
    set('NODE_ENV', 'production');
    set('AUTH_SESSION_PEPPER', undefined);
    expect(() => hashSessionToken('x')).toThrow(/AUTH_SESSION_PEPPER/);
    set('AUTH_SESSION_PEPPER', 'short');
    expect(() => hashSessionToken('x')).toThrow(/AUTH_SESSION_PEPPER/);
    set('AUTH_SESSION_PEPPER', 'a'.repeat(32));
    expect(hashSessionToken('x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses a development default outside production', () => {
    set('NODE_ENV', 'test');
    set('AUTH_SESSION_PEPPER', undefined);
    expect(hashSessionToken('x')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('throws when CRON_SECRET is missing or short in production', () => {
    set('NODE_ENV', 'production');
    set('CRON_SECRET', undefined);
    expect(() => getCronSecret()).toThrow(/CRON_SECRET/);
    set('CRON_SECRET', 'b'.repeat(32));
    expect(getCronSecret()).toBe('b'.repeat(32));
  });
});

describe('Gate 2: first super_admin bootstrap', () => {
  it('creates one super_admin with a hashed password, then refuses a second run', async () => {
    const rt = await createInMemoryTestRuntime();
    try {
      await ensureSchema(rt);
      const created = await createFirstSuperAdmin(rt.db, {
        username: 'Owner',
        displayName: 'ผู้ดูแลระบบ',
        password: 'a-long-passphrase-2026',
      });
      expect(created.username).toBe('owner');

      const [row] = await rt.db.select().from(schema.users);
      expect(row!.systemRole).toBe('super_admin');
      expect(row!.passwordHash).toMatch(/^scrypt\$/);
      expect(row!.passwordHash).not.toContain('a-long-passphrase-2026');

      const login = await loginWithPassword(rt.db, 'owner', 'a-long-passphrase-2026');
      expect(login.actor.user.systemRole).toBe('super_admin');

      await expect(
        createFirstSuperAdmin(rt.db, {
          username: 'second',
          displayName: 'คนที่สอง',
          password: 'another-long-passphrase-2026',
        })
      ).rejects.toMatchObject({ code: 'SUPER_ADMIN_EXISTS' });
    } finally {
      await rt.close();
    }
  });

  it('rejects short passwords', async () => {
    const rt = await createInMemoryTestRuntime();
    try {
      await ensureSchema(rt);
      await expect(
        createFirstSuperAdmin(rt.db, { username: 'owner', displayName: 'x', password: 'short' })
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    } finally {
      await rt.close();
    }
  });
});

describe('Gate 2: demo data is never created implicitly on a remote database', () => {
  it('auto-seeds only local PGlite outside production, or with demo mode on', async () => {
    const { shouldAutoSeed, isExplicitSeedAllowed } = await import('@/server/db/seed');
    expect(shouldAutoSeed('pglite', { NODE_ENV: 'development' })).toBe(true);
    expect(shouldAutoSeed('pglite', { NODE_ENV: 'production' })).toBe(false);
    expect(shouldAutoSeed('postgres', { NODE_ENV: 'development' })).toBe(false);
    expect(shouldAutoSeed('postgres', { NODE_ENV: 'development', FAITHMAP_DEMO_MODE: 'true' })).toBe(true);
    expect(shouldAutoSeed('postgres', { NODE_ENV: 'production', FAITHMAP_DEMO_MODE: 'true' })).toBe(false);
    expect(isExplicitSeedAllowed('postgres', {})).toBe(false);
    expect(isExplicitSeedAllowed('postgres', { FAITHMAP_ALLOW_REMOTE_SEED: 'true' })).toBe(true);
    expect(isExplicitSeedAllowed('pglite', {})).toBe(true);
  });
});

describe('Gate 2: FAITHMAP_TEST_ALL_POSTGRES=1 never silently falls back to PGlite', () => {
  it('throws when FAITHMAP_TEST_ALL_POSTGRES=1 and FAITHMAP_TEST_DATABASE_URL is missing or invalid', async () => {
    const { resolveAllPostgresTestUrl, createInMemoryTestRuntime } = await import('@/server/db/client');
    const { setupRouteTestDb } = await import('./helpers/route-test-db');

    expect(resolveAllPostgresTestUrl({})).toBeNull();
    expect(() => resolveAllPostgresTestUrl({ FAITHMAP_TEST_ALL_POSTGRES: '1' })).toThrow(/FAITHMAP_TEST_DATABASE_URL/);
    expect(() =>
      resolveAllPostgresTestUrl({
        FAITHMAP_TEST_ALL_POSTGRES: '1',
        FAITHMAP_TEST_DATABASE_URL: 'postgresql://user:pass@localhost:5432/prod_db',
      })
    ).toThrow(/faithmap_test/);
    expect(() =>
      resolveAllPostgresTestUrl({
        FAITHMAP_TEST_ALL_POSTGRES: '1',
        FAITHMAP_TEST_DATABASE_URL: 'pglite://./faithmap_test',
      })
    ).toThrow(/postgres/);

    const prevFlag = process.env.FAITHMAP_TEST_ALL_POSTGRES;
    const prevUrl = process.env.FAITHMAP_TEST_DATABASE_URL;
    try {
      process.env.FAITHMAP_TEST_ALL_POSTGRES = '1';
      delete process.env.FAITHMAP_TEST_DATABASE_URL;
      await expect(createInMemoryTestRuntime()).rejects.toThrow(/FAITHMAP_TEST_DATABASE_URL/);
      await expect(setupRouteTestDb('faithmap-strict-', { demoMode: false })).rejects.toThrow(
        /FAITHMAP_TEST_DATABASE_URL/
      );
    } finally {
      if (prevFlag === undefined) delete process.env.FAITHMAP_TEST_ALL_POSTGRES;
      else process.env.FAITHMAP_TEST_ALL_POSTGRES = prevFlag;
      if (prevUrl === undefined) delete process.env.FAITHMAP_TEST_DATABASE_URL;
      else process.env.FAITHMAP_TEST_DATABASE_URL = prevUrl;
    }
  });
});
