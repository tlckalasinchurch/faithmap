import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { buildPoolConfig, createInMemoryTestRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import {
  authenticateSessionToken,
  loginWithPassword,
  MAX_SESSIONS_PER_USER,
  SESSION_IDLE_MS,
} from '@/server/modules/identity/service';
import { hashPassword, verifyPasswordUniform } from '@/server/modules/identity/crypto';
import { isAllowedOrigin, shouldUseSecureCookies } from '@/server/http/session';

describe('Gate 2: database TLS and pool settings', () => {
  it('verifies certificates for every non-local host, whatever the host name is', () => {
    for (const url of [
      'postgres://u:p@ep-example-123.ap-southeast-1.aws.neon.tech/db?sslmode=require',
      'postgres://u:p@db.internal.example.com:5432/db',
      'postgres://u:p@10.0.0.5/db',
    ]) {
      const cfg = buildPoolConfig(url, {});
      expect(cfg.ssl).toMatchObject({ rejectUnauthorized: true });
      expect(cfg.connectionString).not.toContain('sslmode');
    }
  });

  it('does not use TLS for local hosts and never turns verification off', () => {
    expect(buildPoolConfig('postgres://u:p@127.0.0.1:5432/faithmap_test_a', {}).ssl).toBe(false);
    expect(buildPoolConfig('postgres://u:p@localhost/db', {}).ssl).toBe(false);
  });

  it('limits the pool size and accepts a custom CA', () => {
    expect(buildPoolConfig('postgres://u:p@h.example.com/db', {}).max).toBe(5);
    expect(buildPoolConfig('postgres://u:p@h.example.com/db', { DATABASE_POOL_MAX: '500' }).max).toBe(20);
    expect(buildPoolConfig('postgres://u:p@h.example.com/db', { DATABASE_POOL_MAX: '0' }).max).toBe(5);
    expect(
      buildPoolConfig('postgres://u:p@h.example.com/db', { DATABASE_SSL_CA: 'PEM' }).ssl
    ).toMatchObject({ ca: 'PEM', rejectUnauthorized: true });
  });
});

describe('Gate 2: cookies and same-origin checks', () => {
  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

  it('production always sets Secure cookies, even when the proxy header is missing', () => {
    expect(shouldUseSecureCookies(req('http://x.example/'), { NODE_ENV: 'production' })).toBe(true);
    expect(shouldUseSecureCookies(req('http://localhost:3000/'), { NODE_ENV: 'development' })).toBe(false);
    expect(
      shouldUseSecureCookies(req('http://x/', { 'x-forwarded-proto': 'https' }), { NODE_ENV: 'development' })
    ).toBe(true);
  });

  it('accepts the app origin, rejects another origin, and accepts requests with no Origin header', () => {
    const r = req('https://faithmap.example/api/v1/auth');
    const env = { APP_BASE_URL: 'https://faithmap.example' };
    expect(isAllowedOrigin('https://faithmap.example', r, env)).toBe(true);
    expect(isAllowedOrigin('https://evil.example', r, env)).toBe(false);
    expect(isAllowedOrigin('https://faithmap.example.evil.example', r, env)).toBe(false);
    expect(isAllowedOrigin(null, r, env)).toBe(true);
    expect(isAllowedOrigin('https://faithmap.example', r, {})).toBe(true);
    expect(isAllowedOrigin('https://other.example', r, {})).toBe(false);
  });
});

describe('Gate 2: login does not reveal which usernames exist', () => {
  it('does the same password work for an unknown user as for a wrong password', () => {
    const real = hashPassword('correct horse battery staple');
    const time = (fn: () => boolean) => {
      const start = process.hrtime.bigint();
      const out = fn();
      return { ms: Number(process.hrtime.bigint() - start) / 1e6, out };
    };
    verifyPasswordUniform('warm-up', real); // JIT and dummy hash creation
    verifyPasswordUniform('warm-up', null);
    const known = [1, 2, 3].map(() => time(() => verifyPasswordUniform('wrong', real)));
    const unknown = [1, 2, 3].map(() => time(() => verifyPasswordUniform('wrong', null)));
    expect(known.every((r) => r.out === false)).toBe(true);
    expect(unknown.every((r) => r.out === false)).toBe(true);
    const median = (a: number[]) => [...a].sort((x, y) => x - y)[1]!;
    const k = median(known.map((r) => r.ms));
    const u = median(unknown.map((r) => r.ms));
    // An unknown user must cost at least half of a known user. If the work were skipped it would be ~1% of it.
    expect(u).toBeGreaterThan(k * 0.5);
  });

  it('returns the same error for unknown username and wrong password', async () => {
    const rt = await createInMemoryTestRuntime();
    try {
      await ensureSchema(rt);
      await ensureSeeded(rt.db);
      const a = await loginWithPassword(rt.db, 'no-such-user', 'x', { ipAddress: '198.51.100.1' }).catch((e) => e);
      const b = await loginWithPassword(rt.db, 'superadmin', 'x', { ipAddress: '198.51.100.2' }).catch((e) => e);
      expect(a).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
      expect(b).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
      expect(a.message).toBe(b.message);
    } finally {
      await rt.close();
    }
  });
});

describe('Gate 2: session lifecycle', () => {
  async function setup() {
    const rt = await createInMemoryTestRuntime();
    await ensureSchema(rt);
    await ensureSeeded(rt.db);
    return rt;
  }

  it('ends a session that was idle longer than the idle limit, and keeps an active one', async () => {
    const rt = await setup();
    try {
      const { sessionToken } = await loginWithPassword(rt.db, 'admin_kanok', 'FaithMap2026!', { ipAddress: '198.51.100.3' });
      expect(await authenticateSessionToken(rt.db, sessionToken)).not.toBeNull();

      await rt.db
        .update(schema.authSessions)
        .set({ lastSeenAt: new Date(Date.now() - SESSION_IDLE_MS - 60_000) })
        .where(eq(schema.authSessions.userId, SEED_IDS.users.admin));
      expect(await authenticateSessionToken(rt.db, sessionToken)).toBeNull();
      // The session is revoked, not only ignored.
      const [row] = await rt.db.select().from(schema.authSessions).where(eq(schema.authSessions.userId, SEED_IDS.users.admin));
      expect(row!.revokedAt).not.toBeNull();
    } finally {
      await rt.close();
    }
  });

  it('refreshes last-seen for an active session', async () => {
    const rt = await setup();
    try {
      const { sessionToken } = await loginWithPassword(rt.db, 'admin_kanok', 'FaithMap2026!', { ipAddress: '198.51.100.4' });
      const old = new Date(Date.now() - 3_600_000);
      await rt.db.update(schema.authSessions).set({ lastSeenAt: old }).where(eq(schema.authSessions.userId, SEED_IDS.users.admin));
      await authenticateSessionToken(rt.db, sessionToken);
      const [row] = await rt.db.select().from(schema.authSessions).where(eq(schema.authSessions.userId, SEED_IDS.users.admin));
      expect(row!.lastSeenAt.getTime()).toBeGreaterThan(old.getTime() + 3_000_000);
    } finally {
      await rt.close();
    }
  });

  it('keeps at most the allowed number of live sessions per user and revokes the oldest', async () => {
    const rt = await setup();
    try {
      const tokens: string[] = [];
      for (let i = 0; i < MAX_SESSIONS_PER_USER + 2; i++) {
        const r = await loginWithPassword(rt.db, 'admin_kanok', 'FaithMap2026!', { ipAddress: `198.51.100.${10 + i}` });
        tokens.push(r.sessionToken);
        // Make creation order clear.
        await new Promise((res) => setTimeout(res, 5));
      }
      const live = (await rt.db.select().from(schema.authSessions).where(eq(schema.authSessions.userId, SEED_IDS.users.admin)))
        .filter((s) => s.revokedAt === null);
      expect(live).toHaveLength(MAX_SESSIONS_PER_USER);
      expect(await authenticateSessionToken(rt.db, tokens[0]!)).toBeNull();
      expect(await authenticateSessionToken(rt.db, tokens.at(-1)!)).not.toBeNull();
    } finally {
      await rt.close();
    }
  });
});
