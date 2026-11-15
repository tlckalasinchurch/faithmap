import { and, count, eq, isNull } from 'drizzle-orm';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { FaithMapDb } from '@/server/db/client';
import { userPasskeys, users } from '@/server/db/schema';
import { AppError } from '../errors';
import { recordSecurityAudit } from '../audit/service';
import { consumeChallenge, createLineChallenge } from '../line-identity/service';
import { issueSessionForUser, type ActorContext } from './service';

export const MAX_PASSKEYS_PER_USER = 10;

export interface PasskeyConfig {
  rpId: string;
  rpName: string;
  /** Exact origin of the web app, for example https://faithmap.example */
  origin: string;
}

/** Reads the relying party from APP_BASE_URL. Missing config is an error, not a default. */
export function passkeyConfigFromEnv(env: Record<string, string | undefined> = process.env): PasskeyConfig {
  const base = env.APP_BASE_URL;
  if (!base) {
    throw new AppError(503, 'PASSKEY_NOT_CONFIGURED', 'ระบบเข้าสู่ระบบด้วยพาสคีย์ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  }
  const url = new URL(base);
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new AppError(503, 'PASSKEY_NOT_CONFIGURED', 'APP_BASE_URL ต้องเป็น https');
  }
  return { rpId: url.hostname, rpName: 'FaithMap', origin: url.origin };
}

const invalid = (status = 400) =>
  new AppError(status, 'PASSKEY_INVALID', 'ตรวจสอบพาสคีย์ไม่ผ่าน กรุณาลองใหม่อีกครั้ง');

/** The challenge the browser signed is inside clientDataJSON. We look it up, then consume it once. */
function challengeFromClientData(clientDataJSON: string): string {
  try {
    const parsed = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')) as {
      challenge?: unknown;
    };
    if (typeof parsed.challenge === 'string' && parsed.challenge.length > 0) return parsed.challenge;
  } catch {
    /* fall through */
  }
  throw new AppError(
    400,
    'CHALLENGE_INVALID',
    'คำขอหมดอายุหรือถูกใช้ไปแล้ว กรุณากดเข้าสู่ระบบด้วย LINE ใหม่อีกครั้ง'
  );
}

export async function beginPasskeyRegistration(
  db: FaithMapDb,
  actor: ActorContext,
  cfg: PasskeyConfig = passkeyConfigFromEnv(),
  ipAddress: string | null = null
) {
  const [n] = await db
    .select({ n: count() })
    .from(userPasskeys)
    .where(and(eq(userPasskeys.userId, actor.user.id), isNull(userPasskeys.revokedAt)));
  if ((n?.n ?? 0) >= MAX_PASSKEYS_PER_USER) {
    throw new AppError(409, 'PASSKEY_LIMIT', 'บัญชีนี้มีพาสคีย์ครบจำนวนที่กำหนดแล้ว');
  }
  const existing = await db
    .select({ credentialId: userPasskeys.credentialId })
    .from(userPasskeys)
    .where(and(eq(userPasskeys.userId, actor.user.id), isNull(userPasskeys.revokedAt)));

  const ch = await createLineChallenge(db, 'passkey_register', actor.user.id, ipAddress);
  const options = await generateRegistrationOptions({
    rpName: cfg.rpName,
    rpID: cfg.rpId,
    userName: actor.user.username,
    userDisplayName: actor.user.displayName,
    userID: new TextEncoder().encode(actor.user.id),
    challenge: Buffer.from(ch.nonce, 'base64url'),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.credentialId })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  return { challengeId: ch.challengeId, options };
}

export async function finishPasskeyRegistration(
  db: FaithMapDb,
  actor: ActorContext,
  input: { challengeId: string; response: RegistrationResponseJSON; deviceLabel: string },
  cfg: PasskeyConfig = passkeyConfigFromEnv()
) {
  const challenge = challengeFromClientData(input.response?.response?.clientDataJSON ?? '');
  await consumeChallenge(db, { challengeId: input.challengeId, nonce: challenge }, 'passkey_register', actor.user.id);

  let verified;
  try {
    verified = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpId,
      requireUserPresence: true,
      requireUserVerification: true,
    });
  } catch {
    await recordSecurityAudit(db, {
      actorUserId: actor.user.id,
      action: 'passkey_register_failed',
      targetType: 'user_passkey',
      outcome: 'denied',
      reason: 'Attestation could not be verified',
    });
    throw invalid();
  }
  if (!verified.verified || !verified.registrationInfo) throw invalid();

  const cred = verified.registrationInfo.credential;
  const [dup] = await db
    .select({ id: userPasskeys.id })
    .from(userPasskeys)
    .where(eq(userPasskeys.credentialId, cred.id));
  if (dup) {
    throw new AppError(409, 'PASSKEY_ALREADY_REGISTERED', 'พาสคีย์นี้ถูกลงทะเบียนไว้แล้ว');
  }

  const [created] = await db
    .insert(userPasskeys)
    .values({
      userId: actor.user.id,
      credentialId: cred.id,
      publicKeyB64: Buffer.from(cred.publicKey).toString('base64url'),
      signCount: cred.counter,
      deviceLabel: input.deviceLabel.trim().slice(0, 80) || 'อุปกรณ์หลัก',
    })
    .returning();
  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'passkey_registered',
    targetType: 'user_passkey',
    targetId: created!.id,
    outcome: 'success',
  });
  return created!;
}

export async function beginPasskeyLogin(
  db: FaithMapDb,
  cfg: PasskeyConfig = passkeyConfigFromEnv(),
  ipAddress: string | null = null
) {
  const ch = await createLineChallenge(db, 'passkey_login', null, ipAddress);
  const options = await generateAuthenticationOptions({
    rpID: cfg.rpId,
    challenge: Buffer.from(ch.nonce, 'base64url'),
    userVerification: 'required',
  });
  return { challengeId: ch.challengeId, options };
}

export async function finishPasskeyLogin(
  db: FaithMapDb,
  input: { challengeId: string; response: AuthenticationResponseJSON },
  cfg: PasskeyConfig = passkeyConfigFromEnv(),
  meta?: { userAgent?: string | null; ipAddress?: string | null }
) {
  const challenge = challengeFromClientData(input.response?.response?.clientDataJSON ?? '');
  await consumeChallenge(db, { challengeId: input.challengeId, nonce: challenge }, 'passkey_login', null);

  const [stored] = await db
    .select()
    .from(userPasskeys)
    .where(and(eq(userPasskeys.credentialId, input.response.id ?? ''), isNull(userPasskeys.revokedAt)));
  // Unknown and revoked credentials give the same answer as a bad signature.
  if (!stored) {
    await recordSecurityAudit(db, {
      action: 'auth_login_passkey_failed',
      targetType: 'user_passkey',
      ipAddress: meta?.ipAddress ?? null,
      outcome: 'denied',
      reason: 'Unknown or revoked credential',
    });
    throw invalid(401);
  }

  const handle = input.response.response.userHandle;
  if (handle && Buffer.from(handle, 'base64url').toString('utf8') !== stored.userId) {
    throw invalid(401);
  }

  let result;
  try {
    result = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: cfg.origin,
      expectedRPID: cfg.rpId,
      requireUserVerification: true,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(Buffer.from(stored.publicKeyB64, 'base64url')),
        counter: stored.signCount,
      },
    });
  } catch {
    await recordSecurityAudit(db, {
      actorUserId: stored.userId,
      action: 'auth_login_passkey_failed',
      targetType: 'user_passkey',
      targetId: stored.id,
      ipAddress: meta?.ipAddress ?? null,
      outcome: 'denied',
      reason: 'Assertion could not be verified',
    });
    throw invalid(401);
  }
  if (!result.verified) throw invalid(401);

  await db
    .update(userPasskeys)
    .set({ signCount: result.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(userPasskeys.id, stored.id));

  const [userRow] = await db.select().from(users).where(eq(users.id, stored.userId));
  if (!userRow) throw invalid(401);
  return issueSessionForUser(db, userRow, 'passkey', meta);
}

export async function revokePasskey(db: FaithMapDb, actor: ActorContext, passkeyId: string) {
  const rows = await db
    .update(userPasskeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userPasskeys.id, passkeyId),
        eq(userPasskeys.userId, actor.user.id),
        isNull(userPasskeys.revokedAt)
      )
    )
    .returning({ id: userPasskeys.id });
  if (rows.length === 0) throw new AppError(404, 'PASSKEY_NOT_FOUND', 'ไม่พบพาสคีย์นี้');
  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'passkey_revoked',
    targetType: 'user_passkey',
    targetId: passkeyId,
    outcome: 'success',
  });
}
