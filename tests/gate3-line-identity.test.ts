import { describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext } from '@/server/modules/identity/service';
import {
  verifyLineIdToken,
  type LineIdTokenClaims,
} from '@/server/modules/line-identity/verifier';
import {
  createLineChallenge,
  linkLineIdentity,
  listRegistrationRequests,
  loginWithLine,
  requestLineRegistration,
  reviewRegistrationRequest,
  unlinkLineIdentity,
  type LineDeps,
} from '@/server/modules/line-identity/service';

const CHANNEL_ID = '1234567890';
const NOW = Math.floor(Date.now() / 1000);

function claims(overrides: Partial<LineIdTokenClaims> = {}): LineIdTokenClaims {
  return {
    iss: 'https://access.line.me',
    sub: 'Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    aud: CHANNEL_ID,
    exp: NOW + 600,
    iat: NOW,
    nonce: 'will-be-replaced',
    name: 'ทดสอบ LINE',
    ...overrides,
  };
}

let tokenCounter = 0;
/** Every real ID token string is different. Make each use of a fake token unique. */
function tk(key: string): string {
  tokenCounter += 1;
  return `${key}#${tokenCounter}`;
}

/** Fake verifier: the "idToken" string maps to claims. Nonce is checked like the real verifier. */
function depsFor(table: Record<string, Partial<LineIdTokenClaims>>): LineDeps {
  return {
    verifyIdToken: async (idToken, expectedNonce) => {
      const entry = table[idToken.split('#')[0]!];
      if (!entry) throw new Error('invalid');
      return verifyLineIdToken({
        idToken,
        expectedNonce,
        channelId: CHANNEL_ID,
        fetchImpl: async () =>
          new Response(JSON.stringify(claims({ ...entry, nonce: entry.nonce ?? expectedNonce })), {
            status: 200,
          }),
      });
    },
  };
}

async function withDb<T>(fn: (rt: DbRuntime) => Promise<T>): Promise<T> {
  const rt = await createInMemoryTestRuntime();
  try {
    await ensureSchema(rt);
    await ensureSeeded(rt.db);
    return await fn(rt);
  } finally {
    await rt.close();
  }
}

async function actorFor(rt: DbRuntime, userId: string) {
  const [u] = await rt.db.select().from(schema.users).where(eq(schema.users.id, userId));
  return buildActorContext(rt.db, u!);
}

describe('Gate 3: LINE ID token verifier', () => {
  const base = { idToken: tk('t'), expectedNonce: 'n1', channelId: CHANNEL_ID };
  const ok = (c: Partial<LineIdTokenClaims>, status = 200) => async () =>
    new Response(JSON.stringify(claims({ nonce: 'n1', ...c })), { status });

  it('accepts a valid token', async () => {
    const r = await verifyLineIdToken({ ...base, fetchImpl: ok({}) });
    expect(r.sub).toMatch(/^U/);
  });

  it('rejects wrong audience, issuer, nonce, missing nonce, expiry and missing subject', async () => {
    for (const bad of [
      { aud: 'other-channel' },
      { iss: 'https://evil.example' },
      { nonce: 'different' },
      { nonce: undefined },
      { exp: NOW - 10 },
      { sub: '' },
    ]) {
      await expect(
        verifyLineIdToken({ ...base, fetchImpl: ok(bad as Partial<LineIdTokenClaims>) })
      ).rejects.toMatchObject({ code: 'LINE_TOKEN_INVALID' });
    }
  });

  it('rejects when LINE answers with an error status', async () => {
    await expect(
      verifyLineIdToken({ ...base, fetchImpl: ok({}, 400) })
    ).rejects.toMatchObject({ code: 'LINE_TOKEN_INVALID' });
  });

  it('reports LINE as unavailable when the network call fails', async () => {
    await expect(
      verifyLineIdToken({
        ...base,
        fetchImpl: async () => {
          throw new Error('network down');
        },
      })
    ).rejects.toMatchObject({ code: 'LINE_UNAVAILABLE', status: 503 });
  });

  it('rejects when the channel is not configured', async () => {
    await expect(
      verifyLineIdToken({ ...base, channelId: '', fetchImpl: ok({}) })
    ).rejects.toMatchObject({ code: 'LINE_NOT_CONFIGURED', status: 503 });
  });
});

describe('Gate 3: challenges are one-time and bound to purpose', () => {
  it('rejects a replayed challenge', async () => {
    await withDb(async (rt) => {
      const actor = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const deps = depsFor({ tok: { sub: 'Ureplay0000000000000000000000000001' } });
      const ch = await createLineChallenge(rt.db, 'line_link', actor.user.id);
      await linkLineIdentity(rt.db, actor, { challengeId: ch.challengeId, nonce: ch.nonce, idToken: tk('tok') }, deps);
      await expect(
        linkLineIdentity(rt.db, actor, { challengeId: ch.challengeId, nonce: ch.nonce, idToken: tk('tok') }, deps)
      ).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' });
    });
  });

  it('rejects a challenge issued for another purpose or another user', async () => {
    await withDb(async (rt) => {
      const a = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const b = await actorFor(rt, SEED_IDS.users.leaderNonthan);
      const deps = depsFor({ tok: { sub: 'Ucross00000000000000000000000000001' } });

      const loginCh = await createLineChallenge(rt.db, 'line_login', null);
      await expect(
        linkLineIdentity(rt.db, a, { challengeId: loginCh.challengeId, nonce: loginCh.nonce, idToken: tk('tok') }, deps)
      ).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' });

      const aCh = await createLineChallenge(rt.db, 'line_link', a.user.id);
      await expect(
        linkLineIdentity(rt.db, b, { challengeId: aCh.challengeId, nonce: aCh.nonce, idToken: tk('tok') }, deps)
      ).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' });
    });
  });

  it('rejects a wrong nonce and an expired challenge', async () => {
    await withDb(async (rt) => {
      const a = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const deps = depsFor({ tok: { sub: 'Unonce0000000000000000000000000001' } });
      const ch = await createLineChallenge(rt.db, 'line_link', a.user.id);
      await expect(
        linkLineIdentity(rt.db, a, { challengeId: ch.challengeId, nonce: 'guess', idToken: tk('tok') }, deps)
      ).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' });

      const ch2 = await createLineChallenge(rt.db, 'line_link', a.user.id);
      await rt.db
        .update(schema.authChallenges)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.authChallenges.id, ch2.challengeId));
      await expect(
        linkLineIdentity(rt.db, a, { challengeId: ch2.challengeId, nonce: ch2.nonce, idToken: tk('tok') }, deps)
      ).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' });
    });
  });
});

describe('Gate 3: path A — link LINE to an existing FaithMap account', () => {
  it('links, then logs in with a server-issued session; roles come only from existing assignments', async () => {
    await withDb(async (rt) => {
      const actor = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const sub = 'Ulink00000000000000000000000000001';
      const deps = depsFor({ tok: { sub } });

      const ch = await createLineChallenge(rt.db, 'line_link', actor.user.id);
      await linkLineIdentity(rt.db, actor, { challengeId: ch.challengeId, nonce: ch.nonce, idToken: tk('tok') }, deps);

      const login = await createLineChallenge(rt.db, 'line_login', null);
      const result = await loginWithLine(
        rt.db,
        { challengeId: login.challengeId, nonce: login.nonce, idToken: tk('tok') },
        deps,
        { ipAddress: '203.0.113.50' }
      );
      expect(result.actor.user.id).toBe(actor.user.id);
      expect(result.sessionToken.length).toBeGreaterThan(20);
      expect(result.actor.assignedGroupIds.size).toBe(actor.assignedGroupIds.size);

      const audits = await rt.db.select().from(schema.securityAuditLogs);
      expect(audits.some((r) => r.action === 'line_identity_linked')).toBe(true);
      expect(JSON.stringify(audits)).not.toContain('tok');
    });
  });

  it('refuses to link one LINE identity to two accounts, and one account to two LINE identities', async () => {
    await withDb(async (rt) => {
      const a = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const b = await actorFor(rt, SEED_IDS.users.leaderNonthan);
      const deps = depsFor({
        one: { sub: 'Uone0000000000000000000000000000001' },
        two: { sub: 'Utwo0000000000000000000000000000002' },
      });

      const c1 = await createLineChallenge(rt.db, 'line_link', a.user.id);
      await linkLineIdentity(rt.db, a, { challengeId: c1.challengeId, nonce: c1.nonce, idToken: tk('one') }, deps);

      const c2 = await createLineChallenge(rt.db, 'line_link', b.user.id);
      await expect(
        linkLineIdentity(rt.db, b, { challengeId: c2.challengeId, nonce: c2.nonce, idToken: tk('one') }, deps)
      ).rejects.toMatchObject({ status: 409, code: 'LINE_ALREADY_LINKED' });

      const c3 = await createLineChallenge(rt.db, 'line_link', a.user.id);
      await expect(
        linkLineIdentity(rt.db, a, { challengeId: c3.challengeId, nonce: c3.nonce, idToken: tk('two') }, deps)
      ).rejects.toMatchObject({ status: 409, code: 'ACCOUNT_ALREADY_HAS_LINE' });
    });
  });

  it('rejects login for an unlinked LINE identity and for a suspended account', async () => {
    await withDb(async (rt) => {
      const deps = depsFor({ ghost: { sub: 'Ughost00000000000000000000000000001' } });
      const c = await createLineChallenge(rt.db, 'line_login', null);
      await expect(
        loginWithLine(rt.db, { challengeId: c.challengeId, nonce: c.nonce, idToken: tk('ghost') }, deps)
      ).rejects.toMatchObject({ status: 401, code: 'LINE_IDENTITY_UNLINKED' });

      const actor = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const sub = 'Ususp00000000000000000000000000001';
      const d2 = depsFor({ s: { sub } });
      const lc = await createLineChallenge(rt.db, 'line_link', actor.user.id);
      await linkLineIdentity(rt.db, actor, { challengeId: lc.challengeId, nonce: lc.nonce, idToken: tk('s') }, d2);
      await rt.db.update(schema.users).set({ status: 'suspended' }).where(eq(schema.users.id, actor.user.id));
      const c2 = await createLineChallenge(rt.db, 'line_login', null);
      await expect(
        loginWithLine(rt.db, { challengeId: c2.challengeId, nonce: c2.nonce, idToken: tk('s') }, d2)
      ).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_UNUSABLE' });
    });
  });

  it('unlinks safely: revokes the identity, and refuses when it would leave no other sign-in method', async () => {
    await withDb(async (rt) => {
      const actor = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const deps = depsFor({ tok: { sub: 'Uunl00000000000000000000000000000001' } });
      const c = await createLineChallenge(rt.db, 'line_link', actor.user.id);
      await linkLineIdentity(rt.db, actor, { challengeId: c.challengeId, nonce: c.nonce, idToken: tk('tok') }, deps);

      // Seed users have a password, so unlink is allowed.
      await unlinkLineIdentity(rt.db, actor);
      const active = await rt.db
        .select()
        .from(schema.externalIdentities)
        .where(and(eq(schema.externalIdentities.userId, actor.user.id), isNull(schema.externalIdentities.revokedAt)));
      expect(active).toHaveLength(0);

      // Re-link, then remove the password: unlink must be refused.
      const c2 = await createLineChallenge(rt.db, 'line_link', actor.user.id);
      await linkLineIdentity(rt.db, actor, { challengeId: c2.challengeId, nonce: c2.nonce, idToken: tk('tok') }, deps);
      await rt.db.update(schema.users).set({ passwordHash: null }).where(eq(schema.users.id, actor.user.id));
      await expect(unlinkLineIdentity(rt.db, actor)).rejects.toMatchObject({ code: 'LAST_SIGN_IN_METHOD' });
    });
  });
});

describe('Gate 3: path B — LINE-first registration needs super_admin approval', () => {
  it('creates a pending request only: no user, no roles, no session', async () => {
    await withDb(async (rt) => {
      const before = (await rt.db.select().from(schema.users)).length;
      const deps = depsFor({ r: { sub: 'Ureg00000000000000000000000000000001' } });
      const c = await createLineChallenge(rt.db, 'line_register', null);
      const req = await requestLineRegistration(
        rt.db,
        { challengeId: c.challengeId, nonce: c.nonce, idToken: tk('r'), requestedName: 'สมชาย ทดสอบ', note: 'อยากเข้ากลุ่ม' },
        deps
      );
      expect(req.status).toBe('pending');
      expect((await rt.db.select().from(schema.users)).length).toBe(before);
    });
  });

  it('is idempotent for the same LINE identity and refuses an already linked identity', async () => {
    await withDb(async (rt) => {
      const deps = depsFor({
        r: { sub: 'Uidem00000000000000000000000000001' },
        linked: { sub: 'Ulinkd0000000000000000000000000001' },
      });
      const c1 = await createLineChallenge(rt.db, 'line_register', null);
      const r1 = await requestLineRegistration(rt.db, { challengeId: c1.challengeId, nonce: c1.nonce, idToken: tk('r'), requestedName: 'A' }, deps);
      const c2 = await createLineChallenge(rt.db, 'line_register', null);
      const r2 = await requestLineRegistration(rt.db, { challengeId: c2.challengeId, nonce: c2.nonce, idToken: tk('r'), requestedName: 'A' }, deps);
      expect(r2.id).toBe(r1.id);

      const actor = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const lc = await createLineChallenge(rt.db, 'line_link', actor.user.id);
      await linkLineIdentity(rt.db, actor, { challengeId: lc.challengeId, nonce: lc.nonce, idToken: tk('linked') }, deps);
      const c3 = await createLineChallenge(rt.db, 'line_register', null);
      await expect(
        requestLineRegistration(rt.db, { challengeId: c3.challengeId, nonce: c3.nonce, idToken: tk('linked'), requestedName: 'B' }, deps)
      ).rejects.toMatchObject({ status: 409, code: 'LINE_ALREADY_LINKED' });
    });
  });

  it('only super_admin can list and review; admin and others get 403', async () => {
    await withDb(async (rt) => {
      const deps = depsFor({ r: { sub: 'Uauth00000000000000000000000000001' } });
      const c = await createLineChallenge(rt.db, 'line_register', null);
      const req = await requestLineRegistration(rt.db, { challengeId: c.challengeId, nonce: c.nonce, idToken: tk('r'), requestedName: 'C' }, deps);

      for (const uid of [SEED_IDS.users.admin, SEED_IDS.users.bodyLeaderNorth, SEED_IDS.users.pastor]) {
        const actor = await actorFor(rt, uid);
        await expect(listRegistrationRequests(rt.db, actor)).rejects.toMatchObject({ status: 403 });
        await expect(
          reviewRegistrationRequest(rt.db, actor, { requestId: req.id, decision: 'approve' })
        ).rejects.toMatchObject({ status: 403 });
      }
    });
  });

  it('approval creates a standard_user linked to the verified LINE identity with NO assignments; reject creates nothing', async () => {
    await withDb(async (rt) => {
      const deps = depsFor({
        yes: { sub: 'Uyes00000000000000000000000000001' },
        no: { sub: 'Uno000000000000000000000000000001' },
      });
      const superAdmin = await actorFor(rt, SEED_IDS.users.superAdmin);

      const c1 = await createLineChallenge(rt.db, 'line_register', null);
      const yes = await requestLineRegistration(rt.db, { challengeId: c1.challengeId, nonce: c1.nonce, idToken: tk('yes'), requestedName: 'อนุมัติ' }, deps);
      const c2 = await createLineChallenge(rt.db, 'line_register', null);
      const no = await requestLineRegistration(rt.db, { challengeId: c2.challengeId, nonce: c2.nonce, idToken: tk('no'), requestedName: 'ปฏิเสธ' }, deps);

      const usersBefore = (await rt.db.select().from(schema.users)).length;
      const approved = await reviewRegistrationRequest(rt.db, superAdmin, { requestId: yes.id, decision: 'approve' });
      expect(approved.status).toBe('approved');
      const usersAfter = await rt.db.select().from(schema.users);
      expect(usersAfter.length).toBe(usersBefore + 1);
      const created = usersAfter.find((u) => u.id === approved.createdUserId)!;
      expect(created.systemRole).toBe('standard_user');
      expect(created.status).toBe('active');
      expect(created.passwordHash).toBeNull();
      const rolesRows = await rt.db.select().from(schema.assignments).where(eq(schema.assignments.userId, created.id));
      expect(rolesRows).toHaveLength(0);

      // Approved user can sign in with LINE but has no organizational scope.
      const lc = await createLineChallenge(rt.db, 'line_login', null);
      const login = await loginWithLine(rt.db, { challengeId: lc.challengeId, nonce: lc.nonce, idToken: tk('yes') }, deps);
      expect(login.actor.assignedGroupIds.size).toBe(0);
      expect(login.actor.bodyLeaderBodyIds.size).toBe(0);

      const rejected = await reviewRegistrationRequest(rt.db, superAdmin, { requestId: no.id, decision: 'reject', reason: 'ไม่พบชื่อในทะเบียน' });
      expect(rejected.status).toBe('rejected');
      expect((await rt.db.select().from(schema.users)).length).toBe(usersAfter.length);

      // A decided request cannot be decided again.
      await expect(
        reviewRegistrationRequest(rt.db, superAdmin, { requestId: yes.id, decision: 'approve' })
      ).rejects.toMatchObject({ status: 409, code: 'REQUEST_ALREADY_DECIDED' });
    });
  });
});


describe('Gate 3: LIFF ID tokens have no nonce (official LINE docs) — single-use replacement', () => {
  const liffClaims = (c: Partial<LineIdTokenClaims> = {}) =>
    JSON.stringify({ ...claims({ ...c }), nonce: undefined });

  it('verifier: without requireNonce, accepts a token that has no nonce claim', async () => {
    const r = await verifyLineIdToken({
      idToken: 'x'.repeat(30),
      expectedNonce: '',
      requireNonce: false,
      channelId: CHANNEL_ID,
      fetchImpl: async () => new Response(liffClaims(), { status: 200 }),
    });
    expect(r.sub).toMatch(/^U/);
  });

  it('verifier: without requireNonce, still rejects wrong audience, issuer, expiry and future iat', async () => {
    for (const bad of [
      { aud: 'other' },
      { iss: 'https://evil.example' },
      { exp: NOW - 5 },
      { iat: NOW + 3600 },
    ]) {
      await expect(
        verifyLineIdToken({
          idToken: 'x'.repeat(30),
          expectedNonce: '',
          requireNonce: false,
          channelId: CHANNEL_ID,
          fetchImpl: async () => new Response(liffClaims(bad), { status: 200 }),
        })
      ).rejects.toMatchObject({ code: 'LINE_TOKEN_INVALID' });
    }
  });

  it('default verifier mode stays strict: a token without nonce is rejected', async () => {
    await expect(
      verifyLineIdToken({
        idToken: 'x'.repeat(30),
        expectedNonce: 'n',
        channelId: CHANNEL_ID,
        fetchImpl: async () => new Response(liffClaims(), { status: 200 }),
      })
    ).rejects.toMatchObject({ code: 'LINE_TOKEN_INVALID' });
  });

  it('service: the same ID token cannot be used twice, even with a fresh challenge', async () => {
    await withDb(async (rt) => {
      const sub = 'Ureplay2000000000000000000000000001';
      const real = 'same-token-string-0123456789';
      const deps: LineDeps = {
        verifyIdToken: async () => ({ ...claims({ sub }), nonce: undefined }) as LineIdTokenClaims,
      };
      const a = await createLineChallenge(rt.db, 'line_login', null);
      await expect(
        loginWithLine(rt.db, { challengeId: a.challengeId, nonce: a.nonce, idToken: real }, deps)
      ).rejects.toMatchObject({ code: 'LINE_IDENTITY_UNLINKED' });
      const b = await createLineChallenge(rt.db, 'line_login', null);
      await expect(
        loginWithLine(rt.db, { challengeId: b.challengeId, nonce: b.nonce, idToken: real }, deps)
      ).rejects.toMatchObject({ status: 401, code: 'LINE_TOKEN_REPLAYED' });
    });
  });
});
