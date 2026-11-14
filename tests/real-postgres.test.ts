/**
 * Real PostgreSQL integration tests.
 * They run only when FAITHMAP_TEST_DATABASE_URL points to a scratch database
 * whose name contains "faithmap_test". The schema of that database is dropped first.
 * PGlite tests cannot check concurrent connections. These tests can.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createDbRuntimeFromEnv, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext, loginWithPassword } from '@/server/modules/identity/service';
import { verifyLineIdToken, type LineIdTokenClaims } from '@/server/modules/line-identity/verifier';
import {
  createLineChallenge,
  loginWithLine,
  requestLineRegistration,
  reviewRegistrationRequest,
  type LineDeps,
} from '@/server/modules/line-identity/service';

const URL_UNDER_TEST = process.env.FAITHMAP_TEST_DATABASE_URL ?? '';
const enabled = URL_UNDER_TEST.includes('faithmap_test');
const CHANNEL_ID = '1234567890';

function fakeDeps(subByToken: Record<string, string>): LineDeps {
  return {
    verifyIdToken: (idToken, nonce) =>
      verifyLineIdToken({
        idToken,
        expectedNonce: nonce,
        channelId: CHANNEL_ID,
        fetchImpl: async () => {
          const claims: LineIdTokenClaims = {
            iss: 'https://access.line.me',
            sub: subByToken[idToken]!,
            aud: CHANNEL_ID,
            exp: Math.floor(Date.now() / 1000) + 600,
            iat: Math.floor(Date.now() / 1000),
            nonce,
            name: 'ทดสอบ',
          };
          return new Response(JSON.stringify(claims), { status: 200 });
        },
      }),
  };
}

describe.skipIf(!enabled)('Real PostgreSQL 16', () => {
  let rt: DbRuntime;

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_UNDER_TEST;
    rt = createDbRuntimeFromEnv();
    expect(rt.driver).toBe('postgres');
    await rt.execRaw('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await ensureSchema(rt);
    await ensureSeeded(rt.db);
  }, 120_000);

  afterAll(async () => {
    await rt?.close();
  });

  it('reports PostgreSQL 16', async () => {
    const r = await rt.db.execute(sql`SHOW server_version_num`);
    const row = (r as unknown as { rows: Array<{ server_version_num: string }> }).rows[0]!;
    expect(Number(row.server_version_num)).toBeGreaterThanOrEqual(160000);
  });

  it('applies the schema a second time without error (idempotent)', async () => {
    await ensureSchema(rt);
    const r = await rt.db.execute(
      sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const n = (r as unknown as { rows: Array<{ n: number }> }).rows[0]!.n;
    expect(n).toBeGreaterThan(30);
  });

  it('has the unique indexes that protect identities and requests', async () => {
    const r = await rt.db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`
    );
    const names = (r as unknown as { rows: Array<{ indexname: string }> }).rows.map((x) => x.indexname);
    expect(names).toContain('line_registration_pending_subject_uidx');
    expect(names).toContain('external_identities_active_provider_sub_uidx');
  });

  it('password login works and the rate limit blocks after 5 failures', async () => {
    const meta = { ipAddress: '203.0.113.77' };
    const ok = await loginWithPassword(rt.db, 'admin_kanok', 'FaithMap2026!', meta);
    expect(ok.actor.user.username).toBe('admin_kanok');
    for (let i = 0; i < 5; i++) {
      await loginWithPassword(rt.db, 'pastor_suda', 'bad', meta).catch(() => undefined);
    }
    await expect(
      loginWithPassword(rt.db, 'pastor_suda', 'FaithMap2026!', meta)
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('lets exactly one of two concurrent uses of the same challenge pass', async () => {
    const ch = await createLineChallenge(rt.db, 'line_login', null);
    const deps = fakeDeps({ t: 'Uconc00000000000000000000000000001' });
    const input = { challengeId: ch.challengeId, nonce: ch.nonce, idToken: 't'.repeat(25) };
    const deps2 = fakeDeps({ [input.idToken]: 'Uconc00000000000000000000000000001' });
    void deps;
    const results = await Promise.allSettled([
      loginWithLine(rt.db, input, deps2),
      loginWithLine(rt.db, input, deps2),
    ]);
    const codes = results
      .map((r) => (r.status === 'rejected' ? (r.reason as { code?: string }).code : 'ok'))
      .sort();
    // One passes the challenge (then fails because the LINE identity is not linked). One is rejected as replay.
    expect(codes).toEqual(['CHALLENGE_INVALID', 'LINE_IDENTITY_UNLINKED']);
  });

  it('keeps one pending request for two concurrent registrations of the same LINE identity', async () => {
    const token = 'r'.repeat(25);
    const deps = fakeDeps({ [token]: 'Ureg0conc00000000000000000000000001' });
    const [c1, c2] = await Promise.all([
      createLineChallenge(rt.db, 'line_register', null),
      createLineChallenge(rt.db, 'line_register', null),
    ]);
    const [a, b] = await Promise.all([
      requestLineRegistration(rt.db, { challengeId: c1.challengeId, nonce: c1.nonce, idToken: token, requestedName: 'A' }, deps),
      requestLineRegistration(rt.db, { challengeId: c2.challengeId, nonce: c2.nonce, idToken: token, requestedName: 'A' }, deps),
    ]);
    expect(a.id).toBe(b.id);
    const rows = await rt.db
      .select()
      .from(schema.lineRegistrationRequests)
      .where(eq(schema.lineRegistrationRequests.lineSubject, 'Ureg0conc00000000000000000000000001'));
    expect(rows).toHaveLength(1);
  });

  it('creates exactly one account when two super_admin approvals race', async () => {
    const token = 'a'.repeat(25);
    const deps = fakeDeps({ [token]: 'Uappr0race0000000000000000000000001' });
    const ch = await createLineChallenge(rt.db, 'line_register', null);
    const req = await requestLineRegistration(
      rt.db,
      { challengeId: ch.challengeId, nonce: ch.nonce, idToken: token, requestedName: 'แข่งกันอนุมัติ' },
      deps
    );
    const [su] = await rt.db.select().from(schema.users).where(eq(schema.users.id, SEED_IDS.users.superAdmin));
    const actor = await buildActorContext(rt.db, su!);
    const before = (await rt.db.select().from(schema.users)).length;

    const results = await Promise.allSettled([
      reviewRegistrationRequest(rt.db, actor, { requestId: req.id, decision: 'approve' }),
      reviewRegistrationRequest(rt.db, actor, { requestId: req.id, decision: 'approve' }),
    ]);
    const codes = results
      .map((r) => (r.status === 'rejected' ? (r.reason as { code?: string }).code : 'ok'))
      .sort();
    expect(codes).toEqual(['REQUEST_ALREADY_DECIDED', 'ok']);
    expect((await rt.db.select().from(schema.users)).length).toBe(before + 1);
  });
});
