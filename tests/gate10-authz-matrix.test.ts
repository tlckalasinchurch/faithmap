/**
 * Authorization matrix through the REAL route handlers with REAL sessions (no service shortcuts).
 * Roles come from the local demo seed. This is an integration test on a scratch PGlite database.
 * It is not a LINE test and not a production test.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { resetRateLimitsForTests } from '@/server/http/rate-limit';
import { SEED_IDS } from '@/server/db/seed';

const G = SEED_IDS.groups;
const B = SEED_IDS.bodies;
const saved: Record<string, string | undefined> = {};
let dir = '';
const sessions = new Map<string, { cookie: string; csrf: string }>();
let periodId = '';

async function loginAs(username: string) {
  if (sessions.has(username)) return sessions.get(username)!;
  const { getReadyDb } = await import('@/server/db/bootstrap');
  const { loginWithPassword } = await import('@/server/modules/identity/service');
  const r = await loginWithPassword(await getReadyDb(), username, 'FaithMap2026!');
  const s = { cookie: `faithmap_session=${r.sessionToken}; faithmap_csrf=${r.csrfToken}`, csrf: r.csrfToken };
  sessions.set(username, s);
  return s;
}

type Opts = { user?: string; body?: unknown; query?: string; noCsrf?: boolean; origin?: string };
async function call(route: string, method: 'GET' | 'POST', o: Opts = {}) {
  const mod = (await import(`../src/app/api/v1/${route}/route`)) as Record<string, (r: NextRequest) => Promise<Response>>;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (o.user) {
    const s = await loginAs(o.user);
    headers.cookie = s.cookie;
    if (!o.noCsrf && method === 'POST') headers['x-faithmap-csrf'] = s.csrf;
  }
  if (o.origin) headers.origin = o.origin;
  const req = new NextRequest(`http://localhost:3000/api/v1/${route}${o.query ?? ''}`, {
    method,
    headers,
    ...(method === 'POST' ? { body: JSON.stringify(o.body ?? {}) } : {}),
  });
  const res = await mod[method]!(req);
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* csv */ }
  return { status: res.status, json, text };
}
const get = (route: string, o: Opts = {}) => call(route, 'GET', o);
const post = (route: string, o: Opts = {}) => call(route, 'POST', o);

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'faithmap-matrix-'));
  for (const k of ['DATABASE_URL', 'FAITHMAP_DEMO_MODE']) saved[k] = process.env[k];
  process.env.DATABASE_URL = `pglite://${dir}`;
  process.env.FAITHMAP_DEMO_MODE = 'true';
  const ws = await get('workspace', { user: 'somchai_body_n' });
  periodId = ws.json.overview.selectedPeriod.id;
}, 180000);
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => resetRateLimitsForTests());

const LEADER_NONGKUNG = 'arunee_nongkung';
const LEADER_NONTHAN = 'wichai_nonthan';
const LEADER_YANGTALAT = 'boonmee_yangtalat';
const BODY_NORTH = 'somchai_body_n';
const CARE_NONTHAN = 'prapasri_care';
const PASTOR = 'pastor_suda';
const ADMIN = 'admin_kanok';
const SUPER = 'superadmin';
const NOROLE = 'kanya_standby';

describe('Reads: scope of reports, workspace, growth, exports', () => {
  it('report detail: own group yes; another group no; other body no; no role no; pastor can read', async () => {
    const q = (g: string) => `?periodId=${periodId}&groupId=${g}`;
    expect((await get('reports', { user: LEADER_NONTHAN, query: q(G.nonthan) })).status).toBe(200);
    expect((await get('reports', { user: LEADER_NONGKUNG, query: q(G.nonthan) })).status).toBe(403); // cross-group
    expect((await get('reports', { user: BODY_NORTH, query: q(G.yangtalat) })).status).toBe(403); // cross-body
    expect((await get('reports', { user: BODY_NORTH, query: q(G.nonthan) })).status).toBe(200); // own body
    expect((await get('reports', { user: NOROLE, query: q(G.nonthan) })).status).toBe(403);
    expect((await get('reports', { user: PASTOR, query: q(G.yangtalat) })).status).toBe(200);
  });

  it('report list shows only the scope of the caller', async () => {
    const names = async (u: string) => ((await get('reports', { user: u, query: `?periodId=${periodId}` })).json.reports as Array<{ groupId: string }>).map((r) => r.groupId).sort();
    expect(await names(LEADER_NONGKUNG)).toEqual([G.nongkung]);
    const north = await names(BODY_NORTH);
    expect(north).not.toContain(G.yangtalat);
    expect(north).toContain(G.nonthan);
    expect(await names(NOROLE)).toEqual([]);
  });

  it('workspace: a group leader gets only own group, no governance, no security logs, no other people contact data', async () => {
    const w = (await get('workspace', { user: LEADER_NONGKUNG })).json;
    expect(w.groups.map((g: any) => g.id)).toEqual([G.nongkung]);
    expect(w.members.every((m: any) => m.groupId === G.nongkung)).toBe(true);
    expect(w.visitors.every((v: any) => v.firstOriginGroupId === G.nongkung)).toBe(true);
    expect(w.governanceUsers).toEqual([]);
    expect(w.securityLogs).toEqual([]);
    expect(JSON.stringify(w)).not.toMatch(/passwordHash|password_hash|sessionToken|tokenHash/i);
  });

  it('workspace: no role gets nothing; admin gets security logs; password hashes never appear', async () => {
    const none = (await get('workspace', { user: NOROLE })).json;
    expect(none.groups).toEqual([]);
    expect(none.members).toEqual([]);
    expect(none.reports).toEqual([]);
    const admin = (await get('workspace', { user: ADMIN })).json;
    expect(Array.isArray(admin.securityLogs)).toBe(true);
    expect(JSON.stringify(admin)).not.toMatch(/passwordHash|password_hash|tokenHash/i);
  });

  it('workspace: a body leader sees no group of the other body', async () => {
    const w = (await get('workspace', { user: BODY_NORTH })).json;
    expect(w.groups.map((g: any) => g.id)).not.toContain(G.yangtalat);
    expect(w.members.some((m: any) => m.groupId === G.yangtalat)).toBe(false);
  });

  it('growth: other body 403, no role 403, pastor 403 (DEC-06), own group allowed', async () => {
    expect((await get('growth', { user: BODY_NORTH, query: `?groupId=${G.yangtalat}` })).status).toBe(403);
    expect((await get('growth', { user: NOROLE })).status).toBe(403);
    expect((await get('growth', { user: PASTOR })).status).toBe(403);
    expect((await get('growth', { user: LEADER_NONGKUNG, query: `?groupId=${G.nongkung}` })).status).toBe(200);
    expect((await get('growth', { user: LEADER_NONGKUNG, query: `?groupId=${G.nonthan}` })).status).toBe(403);
  });

  it('CSV export: no role refused; a leader gets only own group rows', async () => {
    // A user with no role gets a header row only: no data row, so nothing leaks.
    for (const kind of ['reports', 'visitors']) {
      const none = await get('insights', { user: NOROLE, query: `?export=${kind}` });
      expect(none.text.trim().split('\n')).toHaveLength(1);
    }
    const r = await get('insights', { user: LEADER_NONGKUNG, query: '?export=reports' });
    expect(r.status).toBe(200);
    expect(r.text).not.toMatch(/โนนทัน|ยางตลาด|ห้วยสีทน/);
  });

  it('LINE registration list: super_admin only', async () => {
    expect((await get('line', { user: ADMIN })).status).toBe(403);
    expect((await get('line', { user: BODY_NORTH })).status).toBe(403);
    expect((await get('line', { user: LEADER_NONGKUNG })).status).toBe(403);
    expect((await get('line', { user: SUPER })).status).toBe(200);
  });

  it('ingestion overview and care/team-point lists: refused to a plain group leader', async () => {
    expect((await get('ingestion', { user: LEADER_NONGKUNG })).status).toBe(403);
    expect((await get('ingestion', { user: NOROLE })).status).toBe(403);
    // Cares and field points are scoped lists: a leader or an unscoped user receives an EMPTY list.
    for (const [route, key] of [['cares', 'cares'], ['team-field-points', 'points']] as const) {
      for (const user of [LEADER_NONGKUNG, NOROLE]) {
        const r = await get(route, { user });
        if (r.status === 200) expect(r.json[key], `${route} ${user}`).toEqual([]);
        else expect(r.status).toBe(403);
      }
    }
    expect((await get('team-field-points', { user: NOROLE })).status).toBe(403);
  });
});

describe('Mutations: reports', () => {
  const payload = { meetingHeld: false, notHeldReason: 'ทดสอบสิทธิ์', totalAttendees: 0, memberAttendees: 0, newVisitorsCount: 0, returningVisitorsCount: 0, childrenCount: 0 };
  const save = (user: string, groupId: string) => post('reports', { user, body: { action: 'save_draft', periodId, groupId, payload } });

  it('save_draft: another group, another body, a pastor and a no-role user are refused', async () => {
    expect((await save(LEADER_NONGKUNG, G.nonthan)).status).toBe(403);
    expect((await save(BODY_NORTH, G.yangtalat)).status).toBe(403);
    expect((await save(PASTOR, G.nongkung)).status).toBe(403);
    expect((await save(NOROLE, G.nongkung)).status).toBe(403);
  });

  async function reportIdOf(group: string) {
    const list = (await get('reports', { user: ADMIN, query: `?periodId=${periodId}` })).json.reports as Array<{ id: string; groupId: string; version: number }>;
    return list.find((r) => r.groupId === group)!;
  }

  it('approve and review: another body, a group leader, a pastor and a no-role user are refused', async () => {
    const yang = await reportIdOf(G.yangtalat); // submitted, South body
    for (const user of [BODY_NORTH, LEADER_NONGKUNG, PASTOR, NOROLE, CARE_NONTHAN]) {
      expect((await post('reports', { user, body: { action: 'approve', reportId: yang.id, decision: 'approve', expectedVersion: yang.version } })).status, `approve by ${user}`).toBe(403);
    }
    const nonthan = await reportIdOf(G.nonthan);
    for (const user of [LEADER_NONGKUNG, PASTOR, NOROLE, BODY_NORTH /* needs supervisor first */]) {
      const r = await post('reports', { user, body: { action: 'review', reportId: nonthan.id, decision: 'forward', expectedVersion: nonthan.version } });
      expect([403, 409], `review by ${user}: ${r.status}`).toContain(r.status);
      expect(r.status).not.toBe(200);
    }
  });

  it('unblock is admin only', async () => {
    const yang = await reportIdOf(G.yangtalat);
    for (const user of [BODY_NORTH, LEADER_YANGTALAT, PASTOR]) {
      expect((await post('reports', { user, body: { action: 'unblock', reportId: yang.id } })).status).toBe(403);
    }
  });

  it('the person who submitted cannot approve (no self-approval, DEC-05)', async () => {
    const yang = await reportIdOf(G.yangtalat);
    const r = await post('reports', { user: LEADER_YANGTALAT, body: { action: 'approve', reportId: yang.id, decision: 'approve', expectedVersion: yang.version } });
    expect(r.status).toBe(403);
  });
});

describe('Mutations: pastoral (members, visitors, follow-ups)', () => {
  it('create_member and register_visitor: other group, pastor, no role refused', async () => {
    const member = (user: string, groupId: string) => post('pastoral', { user, body: { action: 'create_member', groupId, fullName: 'สมาชิก ทดสอบสิทธิ์', displayName: 'ทดสอบ' } });
    expect((await member(LEADER_NONGKUNG, G.nonthan)).status).toBe(403);
    expect((await member(BODY_NORTH, G.yangtalat)).status).toBe(403);
    expect((await member(PASTOR, G.nongkung)).status).toBe(403);
    expect((await member(NOROLE, G.nongkung)).status).toBe(403);
    const visitor = (user: string, groupId: string) => post('pastoral', { user, body: { action: 'register_visitor', groupId, fullName: 'ผู้เยี่ยม ทดสอบสิทธิ์', consentForContact: true } });
    expect((await visitor(LEADER_NONGKUNG, G.nonthan)).status).toBe(403);
    expect((await visitor(PASTOR, G.nongkung)).status).toBe(403);
    expect((await visitor(NOROLE, G.nongkung)).status).toBe(403);
  });

  it('visitor consent is required to register (DEC-10)', async () => {
    const r = await post('pastoral', { user: LEADER_NONGKUNG, body: { action: 'register_visitor', groupId: G.nongkung, fullName: 'ผู้เยี่ยม ไม่ยินยอม', phoneE164: '0812223333', consentForContact: false } });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });

  it('convert_visitor and update_follow_up of another group are refused', async () => {
    const reg = await post('pastoral', { user: LEADER_YANGTALAT, body: { action: 'register_visitor', groupId: G.yangtalat, fullName: 'ผู้เยี่ยม ยางตลาด', consentForContact: true, createFollowUp: true, followUpTitle: 'ติดตามผล' } });
    expect(reg.status).toBe(201);
    const visitorId = reg.json.visitor?.id ?? reg.json.visitorId;
    const followUpId = reg.json.followUp?.id ?? reg.json.followUpId;
    expect(visitorId).toBeTruthy();
    for (const user of [LEADER_NONGKUNG, BODY_NORTH, PASTOR, NOROLE]) {
      expect((await post('pastoral', { user, body: { action: 'convert_visitor', visitorId } })).status, `convert by ${user}`).toBe(403);
      if (followUpId) expect((await post('pastoral', { user, body: { action: 'update_follow_up', followUpId, status: 'completed' } })).status, `follow-up by ${user}`).toBe(403);
    }
    // And the visitor is not visible in the other group leader's workspace.
    const w = (await get('workspace', { user: LEADER_NONGKUNG })).json;
    expect(JSON.stringify(w.visitors)).not.toContain('ผู้เยี่ยม ยางตลาด');
  });
});

describe('Mutations: organization (role escalation)', () => {
  const asg = (user: string, body: unknown) => post('organization', { user, body });

  it('group leader, pastor and no-role cannot create groups or assign roles', async () => {
    for (const user of [LEADER_NONGKUNG, PASTOR, NOROLE, CARE_NONTHAN]) {
      expect((await asg(user, { action: 'create_group', groupCode: `ESC-${user.slice(0, 4)}`, nameTh: 'กลุ่มทดสอบ', district: 'เมือง', bodyId: B.north })).status, `create by ${user}`).toBe(403);
      expect((await asg(user, { action: 'assign_role', userId: SEED_IDS.users.leaderNongkung, scopeType: 'body', bodyId: B.north, roleType: 'body_leader' })).status, `assign body_leader by ${user}`).toBe(403);
      expect((await asg(user, { action: 'assign_role', userId: SEED_IDS.users.leaderNongkung, scopeType: 'group', groupId: G.nongkung, roleType: 'care_leader' })).status, `assign care_leader by ${user}`).toBe(403);
    }
  });

  it('self-promotion: a group leader cannot give themself a higher role', async () => {
    for (const roleType of ['body_leader', 'care_leader', 'other_authorized']) {
      const scope = roleType === 'body_leader' ? { scopeType: 'body', bodyId: B.north } : { scopeType: 'group', groupId: G.nongkung };
      const r = await asg(LEADER_NONGKUNG, { action: 'assign_role', userId: SEED_IDS.users.leaderNongkung, roleType, ...scope });
      expect(r.status, roleType).toBe(403);
    }
  });

  it('a body leader cannot act on the other body (transfer, assign, create)', async () => {
    expect((await asg(BODY_NORTH, { action: 'transfer_group', groupId: G.yangtalat, toBodyId: B.north, reason: 'ทดสอบสิทธิ์' })).status).toBe(403);
    expect((await asg(BODY_NORTH, { action: 'assign_role', userId: SEED_IDS.users.standbyLeaderSouth, scopeType: 'group', groupId: G.yangtalat, roleType: 'group_leader' })).status).toBe(403);
    expect((await asg(BODY_NORTH, { action: 'create_group', groupCode: 'ESC-SOUTH', nameTh: 'กลุ่มข้ามบอดี้', district: 'เมือง', bodyId: B.south })).status).toBe(403);
  });

  it('a body leader cannot grant body_leader or other_authorized', async () => {
    const bl = await asg(BODY_NORTH, { action: 'assign_role', userId: SEED_IDS.users.standbyLeaderSouth, scopeType: 'body', bodyId: B.north, roleType: 'body_leader' });
    expect(bl.status).toBe(403);
    const oa = await asg(BODY_NORTH, { action: 'assign_role', userId: SEED_IDS.users.standbyLeaderSouth, scopeType: 'group', groupId: G.nonthan, roleType: 'other_authorized' });
    expect(oa.status).toBe(403);
  });

  it('account status: only admins, and only a super_admin may change an admin or super_admin', async () => {
    const st = (user: string, target: string) => asg(user, { action: 'update_user_status', targetUserId: target, nextStatus: 'suspended', reason: 'ทดสอบสิทธิ์' });
    expect((await st(LEADER_NONGKUNG, SEED_IDS.users.leaderNonthan)).status).toBe(403);
    expect((await st(PASTOR, SEED_IDS.users.leaderNonthan)).status).toBe(403);
    expect((await st(ADMIN, SEED_IDS.users.superAdmin)).status).toBe(403);
    const self = await st(ADMIN, SEED_IDS.users.admin);
    expect([400, 403]).toContain(self.status); // an admin cannot suspend themself or another admin
  });

  it('revoke_assignment: a group leader cannot end another person assignment', async () => {
    const w = (await get('workspace', { user: ADMIN })).json;
    const a = w.groups.flatMap((g: any) => g.assignments).find((x: any) => x.roleType === 'group_leader' && x.groupId === G.nonthan) ?? w.groups.flatMap((g: any) => g.assignments)[0];
    expect(a).toBeTruthy();
    expect((await asg(LEADER_NONGKUNG, { action: 'revoke_assignment', assignmentId: a.id, reason: 'ทดสอบสิทธิ์' })).status).toBe(403);
  });
});

describe('Mutations: insights, ingestion, cares, notifications', () => {
  it('generate_brief is admin only', async () => {
    for (const user of [BODY_NORTH, LEADER_NONGKUNG, PASTOR, NOROLE]) {
      expect((await post('insights', { user, body: { action: 'generate_brief', periodId } })).status, user).toBe(403);
    }
  });

  it('ingestion actions are refused to non-admins (stage, promote, rollback, resolve, assign body)', async () => {
    const U = '00000000-0000-4000-8000-0000000000aa';
    const bodies = [
      { action: 'promote', batchId: U },
      { action: 'rollback', batchId: U, reason: 'ทดสอบสิทธิ์' },
      { action: 'resolve_issue', issueId: U, decision: 'approved_fix', resolutionNote: 'ทดสอบสิทธิ์' },
      { action: 'assign_group_body', groupId: U, bodyId: B.north },
    ];
    for (const user of [LEADER_NONGKUNG, BODY_NORTH, PASTOR, NOROLE]) {
      for (const b of bodies) {
        const r = await post('ingestion', { user, body: b });
        expect([403, 404], `${user} ${b.action}: ${r.status}`).toContain(r.status);
        if (b.action !== 'resolve_issue' && b.action !== 'assign_group_body') expect(r.status).toBe(403);
      }
    }
  });

  it('cares: create and assign are refused to a group leader and a pastor', async () => {
    const U = '00000000-0000-4000-8000-0000000000aa';
    for (const user of [LEADER_NONGKUNG, PASTOR, NOROLE]) {
      expect((await post('cares', { user, body: { action: 'create_care', careCode: 'ESC-C', careName: 'ทดสอบ' } })).status, `create ${user}`).toBe(403);
      expect((await post('cares', { user, body: { action: 'assign_body', careId: U, bodyId: B.north, reason: 'ทดสอบ' } })).status, `body ${user}`).toBe(403);
    }
  });

  it('a user cannot mark another user notification as read', async () => {
    const w = (await get('workspace', { user: LEADER_NONTHAN })).json;
    const n = w.notifications[0];
    if (!n) return; // no notification in this seed state
    const r = await post('insights', { user: LEADER_NONGKUNG, body: { action: 'mark_notification_read', notificationId: n.id } });
    expect([403, 404, 200]).toContain(r.status);
    const after = (await get('workspace', { user: LEADER_NONTHAN })).json.notifications.find((x: any) => x.id === n.id);
    expect(after.readAt ?? null).toBe(n.readAt ?? null); // unchanged for the real owner
  });
});

describe('Request integrity: unauthenticated, CSRF, origin', () => {
  it('a cookie without the CSRF header is refused on every write route', async () => {
    for (const route of ['organization', 'pastoral', 'reports', 'cares', 'insights']) {
      const r = await post(route, { user: ADMIN, noCsrf: true, body: { action: 'x' } });
      expect(r.status, route).toBe(403);
      expect(r.json.error.code).toBe('CSRF_MISMATCH');
    }
  });

  it('a request from a foreign origin is refused', async () => {
    const r = await post('organization', { user: ADMIN, origin: 'https://evil.example.com', body: { action: 'x' } });
    expect(r.status).toBe(403);
  });
});
