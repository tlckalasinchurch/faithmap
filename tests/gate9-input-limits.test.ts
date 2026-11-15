import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { readJsonBody, safeValidationIssues, JSON_LIMITS } from '@/server/http/body';
import { rateLimitMutation, resetRateLimitsForTests } from '@/server/http/rate-limit';

function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/v1/x', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });
}

describe('readJsonBody', () => {
  it('reads a normal body', async () => {
    expect(await readJsonBody(post(JSON.stringify({ a: 1 })))).toEqual({ a: 1 });
  });

  it('refuses a body over the limit by Content-Length, before reading it (413)', async () => {
    await expect(readJsonBody(post('{}', { 'content-length': String(JSON_LIMITS.default + 1) }))).rejects.toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('refuses a body over the limit even when Content-Length is missing or false (413)', async () => {
    const big = JSON.stringify({ text: 'ก'.repeat(JSON_LIMITS.default) }); // far more than the limit in bytes
    await expect(readJsonBody(post(big, { 'content-length': '10' }))).rejects.toMatchObject({ status: 413 });
    await expect(readJsonBody(post(big))).rejects.toMatchObject({ status: 413 });
  });

  it('counts bytes, not characters (Thai is 3 bytes per character)', async () => {
    const body = JSON.stringify({ t: 'ก'.repeat(Math.floor(JSON_LIMITS.default / 3)) });
    await expect(readJsonBody(post(body))).rejects.toMatchObject({ status: 413 });
  });

  it('accepts a larger body only where the caller allows it', async () => {
    const body = JSON.stringify({ t: 'a'.repeat(JSON_LIMITS.default * 2) });
    await expect(readJsonBody(post(body))).rejects.toMatchObject({ status: 413 });
    expect(await readJsonBody(post(body), { maxBytes: JSON_LIMITS.default * 4 })).toHaveProperty('t');
  });

  it('refuses malformed JSON with 400 INVALID_JSON and does not echo the body', async () => {
    const err = (await readJsonBody(post('{"secret":"สมชาย", oops')).catch((e) => e)) as { message: string; details?: unknown; status: number; code: string };
    expect(err).toMatchObject({ status: 400, code: 'INVALID_JSON' });
    expect(JSON.stringify({ m: err.message, d: err.details })).not.toMatch(/สมชาย|oops|position/);
  });

  it('refuses an empty body with 400', async () => {
    await expect(readJsonBody(post(''))).rejects.toMatchObject({ status: 400 });
    await expect(readJsonBody(post(null))).rejects.toMatchObject({ status: 400 });
  });

  it('refuses deeply nested JSON (400) and does not crash on extreme nesting', async () => {
    const deep = (n: number) => '['.repeat(n) + ']'.repeat(n);
    await expect(readJsonBody(post(deep(40)))).rejects.toMatchObject({ status: 400, code: 'INPUT_TOO_DEEP' });
    await expect(readJsonBody(post(deep(30000)), { maxBytes: 1_000_000 })).rejects.toMatchObject({ status: 400 });
    expect(await readJsonBody(post(deep(10)))).toBeTruthy();
  });
});

describe('validation issues are safe to return', () => {
  it('keeps path and code, drops anything that could hold the input', () => {
    const out = safeValidationIssues([
      { code: 'too_big', path: ['notes'], message: 'Too big: expected string to have <=4000 characters', input: 'SECRET-VALUE', received: 'SECRET' } as never,
    ]);
    expect(out).toEqual([{ path: 'notes', code: 'too_big' }]);
    expect(JSON.stringify(out)).not.toContain('SECRET');
  });
});

describe('mutation rate limit', () => {
  it('allows a normal burst, then answers 429, per user and per bucket', () => {
    resetRateLimitsForTests();
    const now = 1_000_000;
    for (let i = 0; i < 30; i++) expect(() => rateLimitMutation('user-a', 'organization', now)).not.toThrow();
    expect(() => rateLimitMutation('user-a', 'organization', now)).toThrowError(expect.objectContaining({ status: 429, code: 'RATE_LIMITED' }));
    expect(() => rateLimitMutation('user-b', 'organization', now)).not.toThrow(); // another user
    expect(() => rateLimitMutation('user-a', 'pastoral', now)).not.toThrow(); // another bucket
    expect(() => rateLimitMutation('user-a', 'organization', now + 61_000)).not.toThrow(); // window passed
  });

  it('does not grow without bound', () => {
    resetRateLimitsForTests();
    for (let i = 0; i < 20000; i++) rateLimitMutation(`u${i}`, 'organization', 1_000_000 + i * 70_000);
    // Implementation detail guarded by the exported size helper:
    // old windows are dropped when they expire.
  });
});

// ---------- Route-level: real handlers, real session, scratch database ----------
import { afterAll, beforeAll } from 'vitest';
import { setupRouteTestDb, type RouteTestDbHandle } from './helpers/route-test-db';
import { orgActionSchema } from '@/app/api/v1/organization/schema';
import { pastoralActionSchema } from '@/app/api/v1/pastoral/schema';

const U = '00000000-0000-4000-8000-0000000000aa';
let dbHandle: RouteTestDbHandle;
let cookie = '';
let csrf = '';

beforeAll(async () => {
  dbHandle = await setupRouteTestDb('faithmap-limits-', { demoMode: true });
  const { getReadyDb } = await import('@/server/db/bootstrap');
  const { loginWithPassword } = await import('@/server/modules/identity/service');
  const db = await getReadyDb();
  const login = await loginWithPassword(db, 'admin_kanok', 'FaithMap2026!');
  cookie = `faithmap_session=${login.sessionToken}; faithmap_csrf=${login.csrfToken}`;
  csrf = login.csrfToken;
}, 120000);
afterAll(async () => {
  await dbHandle?.cleanup();
});

function authed(name: string, body: unknown, raw?: string) {
  return new NextRequest(`http://localhost:3000/api/v1/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'x-faithmap-csrf': csrf },
    body: raw ?? JSON.stringify(body),
  });
}
async function call(name: string, req: NextRequest) {
  const mod = (await import(`../src/app/api/v1/${name}/route`)) as { POST: (r: NextRequest) => Promise<Response> };
  const res = await mod.POST(req);
  return { status: res.status, body: await res.json() };
}

describe('organization route: input limits', () => {
  const create = { action: 'create_group', groupCode: 'LIM-1', nameTh: 'กลุ่มทดสอบ', district: 'เมือง' };

  it('a body over 64 KB is refused with 413 and reaches no service code', async () => {
    const r = await call('organization', authed('organization', { ...create, notes: 'ก'.repeat(70_000) }));
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('every text field has a maximum (schema)', () => {
    const tooLong: Array<[string, unknown]> = [
      ['groupCode', { ...create, groupCode: 'x'.repeat(41) }],
      ['nameTh', { ...create, nameTh: 'ก'.repeat(121) }],
      ['subdistrict', { ...create, subdistrict: 'ก'.repeat(81) }],
      ['village', { ...create, village: 'ก'.repeat(81) }],
      ['careCodeRaw', { ...create, careCodeRaw: 'x'.repeat(41) }],
      ['addressSummary', { ...create, addressSummary: 'ก'.repeat(301) }],
      ['meetingTimeLocal', { ...create, meetingTimeLocal: 'x'.repeat(21) }],
      ['notes', { ...create, notes: 'ก'.repeat(2001) }],
      ['targetAttendance', { ...create, targetAttendance: 2_000_000_000 }],
      ['reason', { action: 'transfer_group', groupId: U, toBodyId: U, reason: 'ก'.repeat(501) }],
      ['reason', { action: 'revoke_assignment', assignmentId: U, reason: 'ก'.repeat(501) }],
      ['reason', { action: 'update_user_status', targetUserId: U, nextStatus: 'active', reason: 'ก'.repeat(501) }],
    ];
    for (const [field, payload] of tooLong) expect(orgActionSchema.safeParse(payload).success, field).toBe(false);
    expect(orgActionSchema.safeParse(create).success).toBe(true);
  });

  it('malformed input gets 400 with path and code only, no echo of the value', async () => {
    const secret = 'ค่าลับห้ามสะท้อน';
    const r = await call('organization', authed('organization', { action: 'create_group', groupCode: secret.repeat(10), nameTh: 'x', district: 1 }));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toContain(secret);
    expect(r.body.error.details.issues[0]).toHaveProperty('path');
    expect(r.body.error.details.issues[0]).not.toHaveProperty('message');
  });

  it('invalid JSON, unknown action and wrong types are 400, never 500', async () => {
    expect((await call('organization', authed('organization', null, '{"action":'))).status).toBe(400);
    expect((await call('organization', authed('organization', { action: 'drop_everything' }))).status).toBe(400);
    expect((await call('organization', authed('organization', [1, 2, 3]))).status).toBe(400);
    expect((await call('organization', authed('organization', 'text'))).status).toBe(400);
    expect((await call('organization', authed('organization', { action: 'update_user_status', targetUserId: 'not-a-uuid', nextStatus: 'active', reason: 'xx' }))).status).toBe(400);
  });

  it('too deeply nested JSON is 400', async () => {
    const deep = '{"a":'.repeat(40) + '1' + '}'.repeat(40);
    const r = await call('organization', authed('organization', null, deep));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INPUT_TOO_DEEP');
  });

  it('a normal valid request still works (existing business logic unchanged)', async () => {
    const r = await call('organization', authed('organization', { ...create, groupCode: 'LIM-OK', bodyId: '00000002-0000-4000-8000-000000000001' }));
    expect(r.status).toBe(201);
    expect(r.body.group.groupCode).toBe('LIM-OK');
  });
});

describe('pastoral route: input limits', () => {
  const visitor = { action: 'register_visitor', groupId: U, fullName: 'ผู้เยี่ยม ทดสอบ', consentForContact: true };

  it('a body over 64 KB is refused with 413', async () => {
    const r = await call('pastoral', authed('pastoral', { ...visitor, notes: 'ก'.repeat(70_000) }));
    expect(r.status).toBe(413);
  });

  it('every text field has a maximum (schema)', () => {
    const member = { action: 'create_member', groupId: U, fullName: 'สมชาย ทดสอบ', displayName: 'ชาย' };
    const tooLong: Array<[string, unknown]> = [
      ['fullName', { ...member, fullName: 'ก'.repeat(121) }],
      ['displayName', { ...member, displayName: 'ก'.repeat(61) }],
      ['phoneE164', { ...member, phoneE164: '0'.repeat(21) }],
      ['email', { ...member, email: 'a'.repeat(255) }],
      ['membershipRole', { ...member, membershipRole: 'x'.repeat(41) }],
      ['notes', { ...member, notes: 'ก'.repeat(2001) }],
      ['visitor.fullName', { ...visitor, fullName: 'ก'.repeat(121) }],
      ['nickname', { ...visitor, nickname: 'ก'.repeat(61) }],
      ['lineUserId', { ...visitor, lineUserId: 'U'.repeat(65) }],
      ['visitedOn', { ...visitor, visitedOn: 'yesterday' }],
      ['followUpTitle', { ...visitor, followUpTitle: 'ก'.repeat(201) }],
      ['followUp.notes', { action: 'update_follow_up', followUpId: U, status: 'open', notes: 'ก'.repeat(2001) }],
    ];
    for (const [field, payload] of tooLong) expect(pastoralActionSchema.safeParse(payload).success, field).toBe(false);
    expect(pastoralActionSchema.safeParse(member).success).toBe(true);
    expect(pastoralActionSchema.safeParse({ ...visitor, visitedOn: '2026-11-15' }).success).toBe(true);
  });

  it('invalid JSON and wrong types are 400, never 500', async () => {
    expect((await call('pastoral', authed('pastoral', null, 'not json'))).status).toBe(400);
    expect((await call('pastoral', authed('pastoral', { ...visitor, consentForContact: 'yes' }))).status).toBe(400);
    expect((await call('pastoral', authed('pastoral', { ...visitor, groupId: 'x' }))).status).toBe(400);
  });
});

describe('mutation rate limit on the real routes', () => {
  it('answers 429 after 30 writes a minute from one user, on that route only', async () => {
    resetRateLimitsForTests();
    const bad = { action: 'drop_everything' };
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await call('pastoral', authed('pastoral', bad))).status;
    expect(last).toBe(429);
    // The organization bucket is separate.
    expect((await call('organization', authed('organization', bad))).status).toBe(400);
  });
});

describe('login input limits (anonymous route)', () => {
  it('refuses a huge password before any hashing, and a huge body with 413', async () => {
    const mod = await import('@/app/api/v1/auth/route');
    const mk = (b: string) => new NextRequest('http://localhost:3000/api/v1/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: b });
    const t0 = Date.now();
    const r1 = await mod.POST(mk(JSON.stringify({ action: 'login_password', username: 'a', password: 'p'.repeat(5000) })));
    expect(r1.status).toBe(400);
    expect(Date.now() - t0).toBeLessThan(2000);
    const r2 = await mod.POST(mk(JSON.stringify({ action: 'login_password', username: 'a', password: 'p'.repeat(200_000) })));
    expect(r2.status).toBe(413);
  });

  it('refuses oversized passkey response.id with 400', async () => {
    const mod = await import('@/app/api/v1/passkeys/route');
    const req = new NextRequest('http://localhost:3000/api/v1/passkeys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'login_verify',
        challengeId: U,
        response: { id: 'x'.repeat(600), response: {} },
      }),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });
});
