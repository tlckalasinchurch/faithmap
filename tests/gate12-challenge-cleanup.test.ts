import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded } from '@/server/db/seed';
import { purgeExpiredAuthData, CHALLENGE_RETENTION_MS, USED_TOKEN_RETENTION_MS } from '@/server/modules/line-identity/cleanup';
import { createLineChallenge, consumeChallenge } from '@/server/modules/line-identity/service';

async function withDb<T>(fn: (rt: DbRuntime) => Promise<T>) {
  const rt = await createInMemoryTestRuntime();
  try {
    await ensureSchema(rt);
    await ensureSeeded(rt.db);
    return await fn(rt);
  } finally {
    await rt.close();
  }
}

const NOW = new Date('2026-11-15T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
let n = 0;
const challenge = (expiresAt: Date, consumedAt: Date | null = null) => ({
  purpose: 'line_login',
  nonceHash: `hash-${++n}-${Math.random()}`,
  expiresAt,
  consumedAt,
});

describe('Challenge and used-token cleanup', () => {
  it('deletes challenges long past expiry (used or not) and keeps live and recently expired ones', async () => {
    await withDb(async (rt) => {
      const old = await rt.db.insert(schema.authChallenges).values([
        challenge(ago(CHALLENGE_RETENTION_MS + 60_000)),
        challenge(ago(CHALLENGE_RETENTION_MS + 60_000), ago(CHALLENGE_RETENTION_MS + 120_000)),
      ]).returning();
      const keep = await rt.db.insert(schema.authChallenges).values([
        challenge(new Date(NOW.getTime() + 60_000)), // still valid
        challenge(new Date(NOW.getTime() + 60_000), ago(1_000)), // used, not yet expired
        challenge(ago(60_000)), // just expired, inside the grace period
      ]).returning();

      const r = await purgeExpiredAuthData(rt.db, NOW);
      expect(r.challengesDeleted).toBe(2);
      const left = (await rt.db.select().from(schema.authChallenges)).map((c) => c.id).sort();
      expect(left).toEqual(keep.map((c) => c.id).sort());
      expect(left.some((id) => old.map((o) => o.id).includes(id))).toBe(false);
    });
  });

  it('keeps used ID tokens until a margin after their expiry (replay protection)', async () => {
    await withDb(async (rt) => {
      await rt.db.insert(schema.usedIdTokens).values([
        { tokenHash: 'old-1', expiresAt: ago(USED_TOKEN_RETENTION_MS + 60_000) },
        { tokenHash: 'inside-grace', expiresAt: ago(USED_TOKEN_RETENTION_MS - 60_000) },
        { tokenHash: 'still-valid', expiresAt: new Date(NOW.getTime() + 30 * 60_000) },
      ]);
      const r = await purgeExpiredAuthData(rt.db, NOW);
      expect(r.usedTokensDeleted).toBe(1);
      expect((await rt.db.select().from(schema.usedIdTokens)).map((t) => t.tokenHash).sort()).toEqual(['inside-grace', 'still-valid']);
    });
  });

  it('a token inside the retention window is still refused as a replay after cleanup runs', async () => {
    await withDb(async (rt) => {
      // Cleanup must not open a replay window: an unexpired used token stays.
      await rt.db.insert(schema.usedIdTokens).values({ tokenHash: 'live-token', expiresAt: new Date(NOW.getTime() + 600_000) });
      await purgeExpiredAuthData(rt.db, NOW);
      expect(await rt.db.select().from(schema.usedIdTokens).where(eq(schema.usedIdTokens.tokenHash, 'live-token'))).toHaveLength(1);
    });
  });

  it('is bounded per call and finishes the work over several calls', async () => {
    await withDb(async (rt) => {
      await rt.db.insert(schema.authChallenges).values(Array.from({ length: 25 }, () => challenge(ago(CHALLENGE_RETENTION_MS + 1000))));
      const first = await purgeExpiredAuthData(rt.db, NOW, { limit: 10 });
      expect(first.challengesDeleted).toBe(10);
      expect(first.more).toBe(true);
      await purgeExpiredAuthData(rt.db, NOW, { limit: 10 });
      const last = await purgeExpiredAuthData(rt.db, NOW, { limit: 10 });
      expect(last.challengesDeleted).toBe(5);
      expect(last.more).toBe(false);
      expect(await rt.db.select().from(schema.authChallenges)).toHaveLength(0);
    });
  });

  it('is safe to run twice and on an empty database', async () => {
    await withDb(async (rt) => {
      expect(await purgeExpiredAuthData(rt.db, NOW)).toMatchObject({ challengesDeleted: 0, usedTokensDeleted: 0, more: false });
      await rt.db.insert(schema.authChallenges).values(challenge(ago(CHALLENGE_RETENTION_MS + 1000)));
      await purgeExpiredAuthData(rt.db, NOW);
      expect(await purgeExpiredAuthData(rt.db, NOW)).toMatchObject({ challengesDeleted: 0 });
    });
  });

  it('never touches the audit trail or other tables', async () => {
    await withDb(async (rt) => {
      await rt.db.insert(schema.authChallenges).values(challenge(ago(CHALLENGE_RETENTION_MS + 1000)));
      const [auditBefore, usersBefore, regBefore] = await Promise.all([
        rt.db.select().from(schema.securityAuditLogs),
        rt.db.select().from(schema.users),
        rt.db.select().from(schema.lineRegistrationRequests),
      ]);
      await purgeExpiredAuthData(rt.db, NOW);
      const [auditAfter, usersAfter, regAfter] = await Promise.all([
        rt.db.select().from(schema.securityAuditLogs),
        rt.db.select().from(schema.users),
        rt.db.select().from(schema.lineRegistrationRequests),
      ]);
      expect(auditAfter).toHaveLength(auditBefore.length);
      expect(usersAfter).toHaveLength(usersBefore.length);
      expect(regAfter).toHaveLength(regBefore.length);
    });
  });

  it('creating a challenge also removes old rows (no scheduler needed), and the new challenge still works', async () => {
    await withDb(async (rt) => {
      await rt.db.insert(schema.authChallenges).values(Array.from({ length: 5 }, () => challenge(new Date(Date.now() - CHALLENGE_RETENTION_MS - 60_000))));
      const ch = await createLineChallenge(rt.db, 'line_login', null, '203.0.113.9');
      const rows = await rt.db.select().from(schema.authChallenges);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(ch.challengeId);
      await expect(consumeChallenge(rt.db, { challengeId: ch.challengeId, nonce: ch.nonce }, 'line_login', null)).resolves.toBeUndefined();
    });
  });
});

// ---------- The scheduled job route ----------
import { afterAll, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { setupRouteTestDb, type RouteTestDbHandle } from './helpers/route-test-db';

describe('cleanup_auth_data job route', () => {
  let dbHandle: RouteTestDbHandle;
  const SECRET = 'test-cron-secret-0123456789-0123456789-abcdef';
  beforeAll(async () => {
    dbHandle = await setupRouteTestDb('faithmap-cleanup-', {
      demoMode: true,
      extraEnvKeys: ['CRON_SECRET'],
    });
    process.env.CRON_SECRET = SECRET;
  }, 120000);
  afterAll(async () => {
    await dbHandle?.cleanup();
  });

  async function run(authorization?: string) {
    const mod = await import('@/app/api/internal/jobs/[jobName]/route');
    const req = new NextRequest('http://localhost:3000/api/internal/jobs/cleanup_auth_data', {
      method: 'POST',
      headers: authorization ? { authorization } : {},
    });
    const res = await mod.POST(req, { params: Promise.resolve({ jobName: 'cleanup_auth_data' }) });
    return { status: res.status, json: await res.json() };
  }

  it('refuses a call without the cron secret, and with a wrong one', async () => {
    expect((await run()).status).toBe(401);
    expect((await run('Bearer wrong-secret')).status).toBe(401);
    expect((await run(`Basic ${SECRET}`)).status).toBe(401);
  }, 60000);

  it('with the secret it returns counts only', async () => {
    const r = await run(`Bearer ${SECRET}`);
    expect(r.status).toBe(200);
    expect(r.json.result).toEqual({ challengesDeleted: expect.any(Number), usedTokensDeleted: expect.any(Number), more: expect.any(Boolean) });
    expect(JSON.stringify(r.json)).not.toMatch(/hash|nonce|token_hash/i);
  }, 60000);

  it('rejects non-UUID periodId on generate_meeting_brief without leaking internals', async () => {
    const mod = await import('@/app/api/internal/jobs/[jobName]/route');
    const req = new NextRequest('http://localhost:3000/api/internal/jobs/generate_meeting_brief', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' },
      body: JSON.stringify({ periodId: 'not-a-uuid' }),
    });
    const res = await mod.POST(req, { params: Promise.resolve({ jobName: 'generate_meeting_brief' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  }, 60000);
});
