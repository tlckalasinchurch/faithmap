import { describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext } from '@/server/modules/identity/service';
import {
  beginPasskeyLogin,
  beginPasskeyRegistration,
  finishPasskeyLogin,
  finishPasskeyRegistration,
  revokePasskey,
  type PasskeyConfig,
} from '@/server/modules/identity/passkeys';
import { SoftwareAuthenticator } from './helpers/software-authenticator';

const CFG: PasskeyConfig = { rpId: 'faithmap.example', rpName: 'FaithMap', origin: 'https://faithmap.example' };

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

async function register(rt: DbRuntime, userId: string, auth: SoftwareAuthenticator) {
  const actor = await actorFor(rt, userId);
  const begin = await beginPasskeyRegistration(rt.db, actor, CFG);
  const response = auth.register(begin.options.challenge);
  return finishPasskeyRegistration(
    rt.db,
    actor,
    { challengeId: begin.challengeId, response, deviceLabel: 'โทรศัพท์ทดสอบ' },
    CFG
  );
}

describe('Gate 2: Passkey registration is verified on the server', () => {
  it('stores a passkey only after a valid attestation for this challenge, origin and RP ID', async () => {
    await withDb(async (rt) => {
      const auth = new SoftwareAuthenticator(CFG);
      const saved = await register(rt, SEED_IDS.users.leaderNongkung, auth);
      expect(saved.deviceLabel).toBe('โทรศัพท์ทดสอบ');
      const rows = await rt.db.select().from(schema.userPasskeys);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.credentialId).toBe(auth.id);
      expect(rows[0]!.publicKeyB64.length).toBeGreaterThan(40);
    });
  });

  it('rejects a wrong origin, a wrong RP ID and missing user verification', async () => {
    await withDb(async (rt) => {
      const actor = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const cases = [
        { origin: 'https://evil.example' },
        { rpId: 'evil.example' },
        { flags: 0x01 | 0x40 }, // user present, no user verification
      ];
      for (const bad of cases) {
        const auth = new SoftwareAuthenticator(CFG);
        const begin = await beginPasskeyRegistration(rt.db, actor, CFG);
        await expect(
          finishPasskeyRegistration(
            rt.db,
            actor,
            { challengeId: begin.challengeId, response: auth.register(begin.options.challenge, bad), deviceLabel: 'x' },
            CFG
          )
        ).rejects.toMatchObject({ code: 'PASSKEY_INVALID' });
      }
      expect(await rt.db.select().from(schema.userPasskeys)).toHaveLength(0);
    });
  });

  it('rejects a challenge that was already used, another user\'s challenge, and a made-up challenge', async () => {
    await withDb(async (rt) => {
      const a = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const b = await actorFor(rt, SEED_IDS.users.leaderNonthan);
      const auth = new SoftwareAuthenticator(CFG);
      const begin = await beginPasskeyRegistration(rt.db, a, CFG);
      const response = auth.register(begin.options.challenge);
      await finishPasskeyRegistration(rt.db, a, { challengeId: begin.challengeId, response, deviceLabel: 'x' }, CFG);
      await expect(
        finishPasskeyRegistration(rt.db, a, { challengeId: begin.challengeId, response, deviceLabel: 'x' }, CFG)
      ).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' });

      const beginA = await beginPasskeyRegistration(rt.db, a, CFG);
      const other = new SoftwareAuthenticator(CFG);
      await expect(
        finishPasskeyRegistration(
          rt.db,
          b,
          { challengeId: beginA.challengeId, response: other.register(beginA.options.challenge), deviceLabel: 'x' },
          CFG
        )
      ).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' });

      const beginC = await beginPasskeyRegistration(rt.db, a, CFG);
      await expect(
        finishPasskeyRegistration(
          rt.db,
          a,
          { challengeId: beginC.challengeId, response: other.register('made-up-challenge-value-0123456789'), deviceLabel: 'x' },
          CFG
        )
      ).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' });
    });
  });

  it('does not let one credential be registered to two accounts', async () => {
    await withDb(async (rt) => {
      const auth = new SoftwareAuthenticator(CFG);
      await register(rt, SEED_IDS.users.leaderNongkung, auth);
      await expect(register(rt, SEED_IDS.users.leaderNonthan, auth)).rejects.toMatchObject({
        code: 'PASSKEY_ALREADY_REGISTERED',
      });
    });
  });
});

describe('Gate 2: Passkey sign-in is verified on the server', () => {
  async function signedUp(rt: DbRuntime) {
    const auth = new SoftwareAuthenticator(CFG);
    await register(rt, SEED_IDS.users.leaderNongkung, auth);
    return { auth, handle: Buffer.from(SEED_IDS.users.leaderNongkung) };
  }

  it('signs in with a valid assertion and rejects replay of the same challenge', async () => {
    await withDb(async (rt) => {
      const { auth, handle } = await signedUp(rt);
      const begin = await beginPasskeyLogin(rt.db, CFG, '203.0.113.5');
      const assertion = auth.authenticate(begin.options.challenge, handle);
      const ok = await finishPasskeyLogin(rt.db, { challengeId: begin.challengeId, response: assertion }, CFG);
      expect(ok.actor.user.id).toBe(SEED_IDS.users.leaderNongkung);
      await expect(
        finishPasskeyLogin(rt.db, { challengeId: begin.challengeId, response: assertion }, CFG)
      ).rejects.toMatchObject({ code: 'CHALLENGE_INVALID' });
    });
  });

  it('rejects a tampered signature, wrong origin, unknown credential and a stale counter (cloned key)', async () => {
    await withDb(async (rt) => {
      const { auth, handle } = await signedUp(rt);

      let b = await beginPasskeyLogin(rt.db, CFG);
      await expect(
        finishPasskeyLogin(rt.db, { challengeId: b.challengeId, response: auth.authenticate(b.options.challenge, handle, { tamper: true }) }, CFG)
      ).rejects.toMatchObject({ code: 'PASSKEY_INVALID' });

      b = await beginPasskeyLogin(rt.db, CFG);
      await expect(
        finishPasskeyLogin(rt.db, { challengeId: b.challengeId, response: auth.authenticate(b.options.challenge, handle, { origin: 'https://evil.example' }) }, CFG)
      ).rejects.toMatchObject({ code: 'PASSKEY_INVALID' });

      b = await beginPasskeyLogin(rt.db, CFG);
      const stranger = new SoftwareAuthenticator(CFG);
      await expect(
        finishPasskeyLogin(rt.db, { challengeId: b.challengeId, response: stranger.authenticate(b.options.challenge, handle) }, CFG)
      ).rejects.toMatchObject({ code: 'PASSKEY_INVALID' });

      // Counter moves forward on a good login, then an old counter is refused.
      b = await beginPasskeyLogin(rt.db, CFG);
      await finishPasskeyLogin(rt.db, { challengeId: b.challengeId, response: auth.authenticate(b.options.challenge, handle, { counter: 10 }) }, CFG);
      b = await beginPasskeyLogin(rt.db, CFG);
      await expect(
        finishPasskeyLogin(rt.db, { challengeId: b.challengeId, response: auth.authenticate(b.options.challenge, handle, { counter: 5 }) }, CFG)
      ).rejects.toMatchObject({ code: 'PASSKEY_INVALID' });
    });
  });

  it('refuses sign-in for a revoked passkey and for a suspended account', async () => {
    await withDb(async (rt) => {
      const { auth, handle } = await signedUp(rt);
      const actor = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const [row] = await rt.db.select().from(schema.userPasskeys);

      await rt.db.update(schema.users).set({ status: 'suspended' }).where(eq(schema.users.id, actor.user.id));
      let b = await beginPasskeyLogin(rt.db, CFG);
      await expect(
        finishPasskeyLogin(rt.db, { challengeId: b.challengeId, response: auth.authenticate(b.options.challenge, handle) }, CFG)
      ).rejects.toMatchObject({ code: 'ACCOUNT_UNUSABLE' });

      await rt.db.update(schema.users).set({ status: 'active' }).where(eq(schema.users.id, actor.user.id));
      await revokePasskey(rt.db, actor, row!.id);
      b = await beginPasskeyLogin(rt.db, CFG);
      await expect(
        finishPasskeyLogin(rt.db, { challengeId: b.challengeId, response: auth.authenticate(b.options.challenge, handle) }, CFG)
      ).rejects.toMatchObject({ code: 'PASSKEY_INVALID' });
    });
  });

  it('only the owner can revoke a passkey', async () => {
    await withDb(async (rt) => {
      await signedUp(rt);
      const [row] = await rt.db.select().from(schema.userPasskeys);
      const other = await actorFor(rt, SEED_IDS.users.leaderNonthan);
      await expect(revokePasskey(rt.db, other, row!.id)).rejects.toMatchObject({ status: 404 });
      const active = await rt.db
        .select()
        .from(schema.userPasskeys)
        .where(and(eq(schema.userPasskeys.id, row!.id), isNull(schema.userPasskeys.revokedAt)));
      expect(active).toHaveLength(1);
    });
  });
});
