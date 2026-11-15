import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

/**
 * Black-box check: every protected route answers 401 when no session cookie is sent.
 * It calls the real route handlers on a scratch database.
 * Public by design and NOT in this list: auth (login), line (challenge, login, register), passkeys login,
 * health, and internal jobs (they use CRON_SECRET and have their own tests).
 */
const PROTECTED: Array<[string, string[]]> = [
  ['cares', ['GET', 'POST']],
  ['growth', ['GET']],
  ['ingestion', ['GET', 'POST']],
  ['insights', ['GET', 'POST']],
  ['organization', ['POST']],
  ['pastoral', ['POST']],
  ['reports', ['GET', 'POST']],
  ['team-field-points', ['GET', 'POST']],
  ['workspace', ['GET']],
  ['line', ['GET']],
  ['passkeys', ['GET']],
];

let dir = '';
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'faithmap-unauth-'));
  for (const k of ['DATABASE_URL', 'FAITHMAP_DEMO_MODE']) saved[k] = process.env[k];
  process.env.DATABASE_URL = `pglite://${dir}`;
  process.env.FAITHMAP_DEMO_MODE = 'false';
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(dir, { recursive: true, force: true });
});

function request(method: string, name: string, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } };
  if (method !== 'GET') init.body = JSON.stringify({ action: 'anything' });
  return new NextRequest(`http://localhost:3000/api/v1/${name}`, init);
}

describe('Every protected route refuses a request without a session', () => {
  for (const [name, methods] of PROTECTED) {
    for (const method of methods) {
      it(`${method} /api/v1/${name} -> 401 with no cookie`, async () => {
        const mod = (await import(`@/app/api/v1/${name}/route`)) as Record<string, (r: NextRequest) => Promise<Response>>;
        expect(typeof mod[method]).toBe('function');
        const res = await mod[method]!(request(method, name));
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(JSON.stringify(body)).not.toMatch(/stack|node_modules|SELECT |postgres/i);
      }, 60000);

      it(`${method} /api/v1/${name} -> 401 with a made-up session cookie`, async () => {
        const mod = (await import(`@/app/api/v1/${name}/route`)) as Record<string, (r: NextRequest) => Promise<Response>>;
        const res = await mod[method]!(
          request(method, name, { cookie: 'faithmap_session=not-a-real-token; __Host-faithmap_session=not-a-real-token' })
        );
        expect(res.status).toBe(401);
      }, 60000);
    }
  }

  it('GET /api/v1/auth reports "not signed in" without leaking user data', async () => {
    const mod = await import('@/app/api/v1/auth/route');
    const res = await mod.GET(request('GET', 'auth'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ authenticated: false });
  }, 60000);
});
