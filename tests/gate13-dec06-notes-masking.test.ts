/**
 * DEC-06 regression: restricted absence notes and follow-up notes are visible only to direct stewards,
 * the Body Leader of that Body and admins. A pastor (mission_leader) sees aggregates and non-PII summaries.
 * Found in the Phase "application completion" review: the report detail and the follow-up list returned
 * these notes to a pastor. Integration test on a scratch PGlite database through the real route handlers.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { eq, isNotNull } from 'drizzle-orm';
import { setupRouteTestDb, type RouteTestDbHandle } from './helpers/route-test-db';

let handle: RouteTestDbHandle;
const sessions = new Map<string, string>();

async function cookieFor(username: string) {
  if (sessions.has(username)) return sessions.get(username)!;
  const { getReadyDb } = await import('@/server/db/bootstrap');
  const { loginWithPassword } = await import('@/server/modules/identity/service');
  const r = await loginWithPassword(await getReadyDb(), username, 'FaithMap2026!');
  const cookie = `faithmap_session=${r.sessionToken}; faithmap_csrf=${r.csrfToken}`;
  sessions.set(username, cookie);
  return cookie;
}
async function get(route: string, user: string, query = '') {
  const mod = (await import(`../src/app/api/v1/${route}/route`)) as Record<string, (r: NextRequest) => Promise<Response>>;
  const res = await mod.GET!(
    new NextRequest(`http://localhost:3000/api/v1/${route}${query}`, { headers: { cookie: await cookieFor(user) } })
  );
  return { status: res.status, json: (await res.json()) as any };
}

let target: { periodId: string; groupId: string; note: string };

beforeAll(async () => {
  handle = await setupRouteTestDb('faithmap-dec06-', { demoMode: true });
  const { getReadyDb } = await import('@/server/db/bootstrap');
  const { attendanceRecords, weeklyReports } = await import('@/server/db/schema');
  const db = await getReadyDb();
  const rows = await db
    .select({ notes: attendanceRecords.notes, periodId: weeklyReports.periodId, groupId: weeklyReports.groupId, status: weeklyReports.status })
    .from(attendanceRecords)
    .innerJoin(weeklyReports, eq(attendanceRecords.weeklyReportId, weeklyReports.id))
    .where(isNotNull(attendanceRecords.notes));
  const row = rows.find((r) => r.status !== 'draft');
  if (!row) throw new Error('The seed has no absence note on a submitted report. The test needs one.');
  target = { periodId: row.periodId, groupId: row.groupId, note: row.notes! };
}, 180000);
afterAll(async () => {
  await handle?.cleanup();
});

const PASTOR = 'pastor_suda';
const ADMIN = 'admin_kanok';

describe('DEC-06: absence notes in the report detail', () => {
  it('control: an admin still sees the absence note', async () => {
    const r = await get('reports', ADMIN, `?periodId=${target.periodId}&groupId=${target.groupId}`);
    expect(r.status).toBe(200);
    const notes = r.json.detail.attendanceRecords.map((a: any) => a.notes);
    expect(notes).toContain(target.note);
  });

  it('a pastor can read the report but every absence note is removed', async () => {
    const r = await get('reports', PASTOR, `?periodId=${target.periodId}&groupId=${target.groupId}`);
    expect(r.status).toBe(200);
    expect(r.json.detail.attendanceRecords.length).toBeGreaterThan(0);
    expect(r.json.detail.attendanceRecords.every((a: any) => a.notes === null)).toBe(true);
    expect(JSON.stringify(r.json)).not.toContain(target.note);
  });
});

describe('DEC-06: follow-up notes in the workspace', () => {
  it('control: an admin still sees follow-up notes', async () => {
    const w = await get('workspace', ADMIN);
    expect(w.json.followUps.some((f: any) => f.notes)).toBe(true);
  });

  it('a pastor sees the follow-up list without the notes', async () => {
    const w = await get('workspace', PASTOR);
    expect(w.status).toBe(200);
    expect(w.json.followUps.length).toBeGreaterThan(0);
    expect(w.json.followUps.every((f: any) => f.notes === null)).toBe(true);
  });
});
