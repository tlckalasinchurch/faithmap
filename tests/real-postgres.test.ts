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
import { assertMigrated, countAppliedMigrations, ensureSchema, EXPECTED_MIGRATION_COUNT } from '@/server/db/migrate';
import { createFirstSuperAdmin } from '@/server/modules/identity/bootstrap';
import { listDecisionHistory, resolveDataQualityIssue, stageImportBatch } from '@/server/modules/ingestion/service';
import { assignCareSteward, createProvisionalCare } from '@/server/modules/cares/service';
import { assignLeadershipRole, createGroup } from '@/server/modules/organization/service';
import { ensureActiveReportingPeriod, submitReport, updateReportIfCurrent } from '@/server/modules/reporting/service';
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
    await rt.execRaw('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
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
    const token2 = 's'.repeat(25);
    const deps = fakeDeps({
      [token]: 'Ureg0conc00000000000000000000000001',
      [token2]: 'Ureg0conc00000000000000000000000001',
    });
    const [c1, c2] = await Promise.all([
      createLineChallenge(rt.db, 'line_register', null),
      createLineChallenge(rt.db, 'line_register', null),
    ]);
    const [a, b] = await Promise.all([
      requestLineRegistration(rt.db, { challengeId: c1.challengeId, nonce: c1.nonce, idToken: token, requestedName: 'A' }, deps),
      requestLineRegistration(rt.db, { challengeId: c2.challengeId, nonce: c2.nonce, idToken: token2, requestedName: 'A' }, deps),
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
  it('has every migration applied and the app agrees the database is ready', async () => {
    expect(await countAppliedMigrations(rt)).toBe(EXPECTED_MIGRATION_COUNT);
    await expect(assertMigrated(rt)).resolves.toBeUndefined();
  });

  it('blocks UPDATE and DELETE on audit logs with database triggers', async () => {
    await expect(rt.db.execute(sql`UPDATE security_audit_logs SET reason = 'x'`)).rejects.toThrow();
    await expect(rt.db.execute(sql`DELETE FROM security_audit_logs`)).rejects.toThrow();
    const r = await rt.db.execute(sql`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'trg_%_immutable' AND NOT tgisinternal`);
    expect((r as unknown as { rows: Array<{ n: number }> }).rows[0]!.n).toBe(4);
  });

  it('Phase 3B: two identical imports at once give one batch and one idempotent hit', async () => {
    const [su] = await rt.db.select().from(schema.users).where(eq(schema.users.id, SEED_IDS.users.admin));
    const admin = await buildActorContext(rt.db, su!);
    const body = {
      sourceArchiveName: 'race.xlsx',
      groups: [{ groupRef: 'G-RACE-1', groupNameFromSheet: 'กลุ่มแข่ง', sourceFile: 'race.xlsx', sourceSheet: 'S1' }],
      members: [],
    };
    const [a, b] = await Promise.all([stageImportBatch(rt.db, admin, body), stageImportBatch(rt.db, admin, body)]);
    expect(a.batch.id).toBe(b.batch.id);
    expect([a.idempotentHit, b.idempotentHit].sort()).toEqual([false, true]);
  });

  it('Phase 3B: two creations of the same care code at once give one care and one clear conflict', async () => {
    const [su] = await rt.db.select().from(schema.users).where(eq(schema.users.id, SEED_IDS.users.admin));
    const admin = await buildActorContext(rt.db, su!);
    const results = await Promise.allSettled([
      createProvisionalCare(rt.db, admin, { careCode: 'C-RACE-1' }),
      createProvisionalCare(rt.db, admin, { careCode: 'C-RACE-1' }),
    ]);
    const codes = results.map((r) => (r.status === 'rejected' ? (r.reason as { code?: string }).code : 'ok')).sort();
    expect(codes).toEqual(['CARE_CODE_EXISTS', 'ok']);
  });

  it('Phase 3B: two primary steward changes at once leave exactly one active primary', async () => {
    const [su] = await rt.db.select().from(schema.users).where(eq(schema.users.id, SEED_IDS.users.admin));
    const admin = await buildActorContext(rt.db, su!);
    const care = await createProvisionalCare(rt.db, admin, { careCode: 'C-RACE-2' });
    await Promise.allSettled([
      assignCareSteward(rt.db, admin, { careId: care.id, userId: SEED_IDS.users.leaderNongkung, roleType: 'care_leader', isPrimary: true }),
      assignCareSteward(rt.db, admin, { careId: care.id, userId: SEED_IDS.users.leaderNonthan, roleType: 'care_leader', isPrimary: true }),
    ]);
    const rows = await rt.db.select().from(schema.assignments).where(eq(schema.assignments.careId, care.id));
    const activePrimary = rows.filter((r) => r.effectiveTo === null && r.isPrimary);
    expect(activePrimary).toHaveLength(1);
  });

  it('Authz review: two decisions on the same copy of a report at once leave exactly one winner', async () => {
    const [su] = await rt.db.select().from(schema.users).where(eq(schema.users.id, SEED_IDS.users.admin));
    const admin = await buildActorContext(rt.db, su!);
    const group = await createGroup(rt.db, admin, { groupCode: 'RACE-RPT', bodyId: SEED_IDS.bodies.north, nameTh: 'กลุ่มแข่งรายงาน', district: 'เมืองกาฬสินธุ์' });
    await assignLeadershipRole(rt.db, admin, { userId: SEED_IDS.users.standbyLeaderSouth, scopeType: 'group', groupId: group.id, roleType: 'group_leader' });
    const [leaderRow] = await rt.db.select().from(schema.users).where(eq(schema.users.id, SEED_IDS.users.standbyLeaderSouth));
    const leader = await buildActorContext(rt.db, leaderRow!);
    const period = await ensureActiveReportingPeriod(rt.db);
    await submitReport(rt.db, leader, period.id, group.id, { meetingHeld: true, totalAttendees: 3, memberAttendees: 3, newVisitorsCount: 0, returningVisitorsCount: 0, childrenCount: 0 });
    const [copy] = await rt.db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.groupId, group.id));

    const results = await Promise.allSettled([
      updateReportIfCurrent(rt.db, copy!, { status: 'approved', approvedByUserId: admin.user.id, approvedAt: new Date() }, ['submitted', 'under_review']),
      updateReportIfCurrent(rt.db, copy!, { status: 'needs_revision', revisionReason: 'ทดสอบ' }, ['submitted', 'under_review']),
    ]);
    const codes = results.map((r) => (r.status === 'rejected' ? (r.reason as { code?: string }).code : 'ok')).sort();
    expect(codes).toEqual(['VERSION_CONFLICT', 'ok']);
    const [after] = await rt.db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, copy!.id));
    expect(after!.version).toBe(copy!.version + 1);
  });

  it('Decisions: two decisions on the same issue at once leave one chain with one winner', async () => {
    const [adminRow] = await rt.db.select().from(schema.users).where(eq(schema.users.id, SEED_IDS.users.admin));
    const admin = await buildActorContext(rt.db, adminRow!);
    const staged = await stageImportBatch(rt.db, admin, {
      sourceArchiveName: 'race-dq.xlsx',
      groups: [
        { groupRef: 'RDQ-A', groupNameFromSheet: 'A', careCode: 'RDQA', sourceFile: 'race-dq.xlsx', sourceSheet: 'A' },
        { groupRef: 'RDQ-B', groupNameFromSheet: 'B', careCode: 'RDQB', sourceFile: 'race-dq.xlsx', sourceSheet: 'B' },
      ],
      members: [
        { memberRowRef: 'RDQ-A1', groupRef: 'RDQ-A', sourceFile: 'race-dq.xlsx', sourceSheet: 'A', sourceRow: 5, fullNameRaw: 'แข่งขัน ตัดสิน', nicknameRaw: 'แข่ง' },
        { memberRowRef: 'RDQ-B1', groupRef: 'RDQ-B', sourceFile: 'race-dq.xlsx', sourceSheet: 'B', sourceRow: 5, fullNameRaw: 'แข่งขัน ตัดสิน', nicknameRaw: 'แข่ง' },
      ],
    });
    const [issue] = await rt.db.select().from(schema.dataQualityIssues).where(eq(schema.dataQualityIssues.batchId, staged.batch.id));
    const results = await Promise.allSettled([
      resolveDataQualityIssue(rt.db, admin, { issueId: issue!.id, decision: 'approved_fix', resolutionNote: 'อนุมัติ' }),
      resolveDataQualityIssue(rt.db, admin, { issueId: issue!.id, decision: 'rejected', resolutionNote: 'ปฏิเสธ' }),
    ]);
    const codes = results.map((r) => (r.status === 'rejected' ? (r.reason as { code?: string }).code : 'ok')).sort();
    expect(codes).toEqual(['DECISION_CONFLICT', 'ok']);
    const history = await listDecisionHistory(rt.db, admin, issue!.id);
    expect(history).toHaveLength(1);
    // A second round on the new head: again exactly one winner.
    const head = history[0]!;
    const round2 = await Promise.allSettled([
      resolveDataQualityIssue(rt.db, admin, { issueId: issue!.id, decision: 'reversed', resolutionNote: 'ยกเลิก', expectedDecisionId: head.id }),
      resolveDataQualityIssue(rt.db, admin, { issueId: issue!.id, decision: 'deferred', resolutionNote: 'รอ', expectedDecisionId: head.id }),
    ]);
    const codes2 = round2.map((r) => (r.status === 'rejected' ? (r.reason as { code?: string }).code : 'ok')).sort();
    expect(codes2.filter((c) => c === 'ok')).toHaveLength(1);
    expect(await listDecisionHistory(rt.db, admin, issue!.id)).toHaveLength(2);
  });

  it('creates exactly one super_admin when two bootstrap runs race (run last: it changes seed roles)', async () => {
    await rt.db.execute(sql`UPDATE users SET system_role = 'admin' WHERE system_role = 'super_admin'`);
    const results = await Promise.allSettled([
      createFirstSuperAdmin(rt.db, { username: 'owner-one', displayName: 'หนึ่ง', password: 'first-long-passphrase-2026' }),
      createFirstSuperAdmin(rt.db, { username: 'owner-two', displayName: 'สอง', password: 'second-long-passphrase-2026' }),
    ]);
    const codes = results.map((r) => (r.status === 'rejected' ? (r.reason as { code?: string }).code : 'ok')).sort();
    expect(codes).toEqual(['SUPER_ADMIN_EXISTS', 'ok']);
    const admins = await rt.db.select().from(schema.users).where(eq(schema.users.systemRole, 'super_admin'));
    expect(admins).toHaveLength(1);
  });
});
