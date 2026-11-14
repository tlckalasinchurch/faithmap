import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import {
  buildActorContext,
  isDemoModeEnabled,
  loginWithPassword,
  switchDemoAccount,
} from '@/server/modules/identity/service';
import { AppError } from '@/server/modules/errors';

const ENV_KEYS = ['FAITHMAP_DEMO_MODE', 'NODE_ENV'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else (process.env as Record<string, string>)[k] = saved[k]!;
  }
});

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else (process.env as Record<string, string>)[key] = value;
}

describe('Gate 2: demo mode is off unless explicitly enabled outside production', () => {
  it('is disabled when FAITHMAP_DEMO_MODE is unset', () => {
    setEnv('FAITHMAP_DEMO_MODE', undefined);
    setEnv('NODE_ENV', 'test');
    expect(isDemoModeEnabled()).toBe(false);
  });

  it('is enabled only when FAITHMAP_DEMO_MODE is "true" and NODE_ENV is not production', () => {
    setEnv('FAITHMAP_DEMO_MODE', 'true');
    setEnv('NODE_ENV', 'test');
    expect(isDemoModeEnabled()).toBe(true);
    setEnv('NODE_ENV', 'production');
    expect(isDemoModeEnabled()).toBe(false);
  });

  it('blocks switchDemoAccount by default and in production, even with the flag set', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      setEnv('FAITHMAP_DEMO_MODE', undefined);
      setEnv('NODE_ENV', 'test');
      await expect(switchDemoAccount(runtime.db, SEED_IDS.users.superAdmin)).rejects.toMatchObject({
        status: 403,
        code: 'DEMO_SWITCH_DISABLED',
      });

      setEnv('FAITHMAP_DEMO_MODE', 'true');
      setEnv('NODE_ENV', 'production');
      await expect(switchDemoAccount(runtime.db, SEED_IDS.users.superAdmin)).rejects.toMatchObject({
        code: 'DEMO_SWITCH_DISABLED',
      });

      setEnv('FAITHMAP_DEMO_MODE', 'true');
      setEnv('NODE_ENV', 'test');
      const ok = await switchDemoAccount(runtime.db, SEED_IDS.users.admin);
      expect(ok.actor.user.id).toBe(SEED_IDS.users.admin);
    } finally {
      await runtime.close();
    }
  });
});

describe('Gate 2: no demo seed in production', () => {
  it('does not insert demo accounts when NODE_ENV is production', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      setEnv('NODE_ENV', 'production');
      const seeded = await ensureSeeded(runtime.db);
      expect(seeded).toBe(false);
      const rows = await runtime.db.select().from(schema.users);
      expect(rows).toHaveLength(0);
    } finally {
      await runtime.close();
    }
  });
});

describe('Gate 2: password login rate limit', () => {
  it('rejects further attempts after 5 failures, even with the correct password', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);
      const meta = { ipAddress: '203.0.113.9', userAgent: 'vitest' };

      for (let i = 0; i < 5; i++) {
        await expect(
          loginWithPassword(runtime.db, 'superadmin', 'wrong-password', meta)
        ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
      }

      await expect(
        loginWithPassword(runtime.db, 'superadmin', 'FaithMap2026!', meta)
      ).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    } finally {
      await runtime.close();
    }
  });

  it('does not lock other usernames from a different address', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);
      for (let i = 0; i < 5; i++) {
        await loginWithPassword(runtime.db, 'superadmin', 'bad', {
          ipAddress: '203.0.113.9',
        }).catch(() => undefined);
      }
      const ok = await loginWithPassword(runtime.db, 'admin_kanok', 'FaithMap2026!', {
        ipAddress: '198.51.100.7',
      });
      expect(ok.actor.user.username).toBe('admin_kanok');
    } finally {
      await runtime.close();
    }
  });

  it('normalizes the username so case changes do not bypass the limit', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);
      const meta = { ipAddress: '198.51.100.20' };
      for (const name of ['SuperAdmin', 'SUPERADMIN', ' superadmin ', 'superadmin', 'Superadmin']) {
        await loginWithPassword(runtime.db, name, 'bad', meta).catch(() => undefined);
      }
      await expect(
        loginWithPassword(runtime.db, 'superadmin', 'FaithMap2026!', { ipAddress: '198.51.100.21' })
      ).rejects.toBeInstanceOf(AppError);
    } finally {
      await runtime.close();
    }
  });
});

describe('Gate 2: an assignment without a linked account never grants permissions', () => {
  it('grants nothing to any user from an unlinked steward assignment', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [group] = await runtime.db
        .select()
        .from(schema.houseMissionGroups)
        .where(eq(schema.houseMissionGroups.id, SEED_IDS.groups.nongkung));

      await runtime.db.insert(schema.assignments).values({
        userId: null,
        stewardDisplayName: 'ผู้ดูแลที่ยังไม่มีบัญชี',
        linkStatus: 'unlinked_pending_account',
        scopeType: 'group',
        groupId: group!.id,
        roleType: 'group_leader',
        isPrimary: false,
      });

      // A user with no assignment of their own (suspended seed user is excluded; use pastor-less standard user).
      const [standby] = await runtime.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, SEED_IDS.users.standbyLeaderSouth));
      const actor = await buildActorContext(runtime.db, standby!);

      expect(actor.groupLeaderGroupIds.has(group!.id)).toBe(false);
      expect(actor.assignedGroupIds.has(group!.id)).toBe(false);
    } finally {
      await runtime.close();
    }
  });
});
