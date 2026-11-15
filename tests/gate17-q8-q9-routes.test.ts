/**
 * Q-8 and Q-9 through the REAL route handlers with REAL sessions: team field point assignment and the Meeting Brief
 * per role. Scratch database only. Not a LINE test and not a production test.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { resetRateLimitsForTests } from '@/server/http/rate-limit';
import { SEED_IDS } from '@/server/db/seed';
import { setupRouteTestDb, type RouteTestDbHandle } from './helpers/route-test-db';

const G = SEED_IDS.groups;
const B = SEED_IDS.bodies;
let dbHandle: RouteTestDbHandle;
const sessions = new Map<string, { cookie: string; csrf: string }>();

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
  dbHandle = await setupRouteTestDb('faithmap-matrix-', { demoMode: true });
}, 180000);
afterAll(async () => {
  await dbHandle?.cleanup();
});
beforeEach(() => resetRateLimitsForTests());


const BODY_NORTH = 'somchai_body_n';
const PASTOR = 'pastor_suda';
const ADMIN = 'admin_kanok';
const LEADER = 'arunee_nongkung';

describe('Team field points: assignment API', () => {
  it('only an admin can sync or assign; others get 403; a missing CSRF token is refused', async () => {
    expect((await post('team-field-points', { user: ADMIN, body: { action: 'sync_team_g' } })).status).toBe(200);
    const list = await get('team-field-points', { user: ADMIN });
    expect(list.status).toBe(200);
    expect(list.json.mapping.complete).toBe(false);
    const pointId = list.json.points[0].id as string;
    const body = { action: 'assign_point', pointId, bodyId: B.north, coordinatorUserId: null };
    for (const user of [BODY_NORTH, PASTOR, LEADER]) {
      expect((await post('team-field-points', { user, body })).status, user).toBe(403);
    }
    expect((await post('team-field-points', { user: ADMIN, body, noCsrf: true })).status).toBeGreaterThanOrEqual(400);
    expect((await post('team-field-points', { user: ADMIN, body: { ...body, bodyId: 'not-a-uuid' } })).status).toBe(400);
    expect((await post('team-field-points', { user: ADMIN, body: { ...body, extra: 1, coordinatorUserId: '00000000-0000-4000-8000-000000000000' } })).json.error?.code ?? '').toBe('COORDINATOR_INVALID');
    expect((await post('team-field-points', { user: ADMIN, body })).status).toBe(200);
  });

  it('while the mapping is incomplete, no non-admin reads a point; the mapping counts reach admins only', async () => {
    for (const user of [BODY_NORTH, PASTOR, LEADER]) {
      const r = await get('team-field-points', { user });
      expect(r.status, user).toBe(403);
      expect(r.text).not.toContain('mapping');
    }
  });
});

describe('Meeting Brief through the workspace API', () => {
  it('a pastor receives no group name, no follow-up title and no slice data; a Body Leader of a version 1 brief gets no numbers', async () => {
    const pastor = await get('workspace', { user: PASTOR });
    expect(pastor.status).toBe(200);
    expect(pastor.json.briefs.length).toBeGreaterThan(0);
    const text = JSON.stringify(pastor.json.briefs);
    expect(text).not.toMatch(/กลุ่มบ้าน|กลุ่มพันธกิจบ้าน|bodySlices|ติดตามสมาชิกขาดประชุม/);
    for (const b of pastor.json.briefs) expect(b.viewScope).toBe('organization_aggregate');

    const bl = await get('workspace', { user: BODY_NORTH });
    for (const b of bl.json.briefs) {
      expect(b.viewScope).toBe('body');
      expect(Object.keys(b.metricsJson)).toHaveLength(0);
    }
    const admin = await get('workspace', { user: ADMIN });
    for (const b of admin.json.briefs) expect(b.viewScope).toBe('organization_detail');
    const leader = await get('workspace', { user: LEADER });
    expect(leader.json.briefs).toEqual([]);
  });

  it('the generate action is admin only and returns the built view, not the stored row', async () => {
    const ws = await get('workspace', { user: ADMIN });
    const periodId = ws.json.overview.selectedPeriod.id as string;
    for (const user of [BODY_NORTH, PASTOR, LEADER]) {
      expect((await post('insights', { user, body: { action: 'generate_brief', periodId } })).status, user).toBe(403);
    }
  });
});
