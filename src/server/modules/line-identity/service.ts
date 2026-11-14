import crypto from 'node:crypto';
import { and, count, desc, eq, gt, isNull } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import {
  authChallenges,
  externalIdentities,
  lineRegistrationRequests,
  userPasskeys,
  users,
} from '@/server/db/schema';
import { AppError } from '../errors';
import { recordSecurityAudit } from '../audit/service';
import { generateOpaqueToken, hashSessionToken } from '../identity/crypto';
import {
  issueSessionForUser,
  type ActorContext,
} from '../identity/service';
import { verifyLineIdToken, type LineIdTokenClaims } from './verifier';

export type ChallengePurpose = 'line_link' | 'line_login' | 'line_register';

export interface LineDeps {
  verifyIdToken: (idToken: string, expectedNonce: string) => Promise<LineIdTokenClaims>;
}

export const CHALLENGE_TTL_MS = 5 * 60_000;
export const CHALLENGE_MAX_PER_IP_PER_MINUTE = 30;

/** Default dependencies: verify with LINE using the Login channel ID from the environment. */
export function defaultLineDeps(): LineDeps {
  return {
    verifyIdToken: (idToken, expectedNonce) =>
      verifyLineIdToken({
        idToken,
        expectedNonce,
        channelId: process.env.LINE_LOGIN_CHANNEL_ID ?? '',
      }),
  };
}

interface ProofInput {
  challengeId: string;
  nonce: string;
  idToken: string;
}

function challengeInvalid(): AppError {
  return new AppError(
    400,
    'CHALLENGE_INVALID',
    'คำขอหมดอายุหรือถูกใช้ไปแล้ว กรุณากดเข้าสู่ระบบด้วย LINE ใหม่อีกครั้ง'
  );
}

function requireSuperAdmin(actor: ActorContext): void {
  if (actor.user.systemRole !== 'super_admin') {
    throw new AppError(403, 'SUPER_ADMIN_REQUIRED', 'เฉพาะผู้ดูแลระบบสูงสุดเท่านั้นที่ทำรายการนี้ได้');
  }
}

export async function createLineChallenge(
  db: FaithMapDb,
  purpose: ChallengePurpose,
  userId: string | null,
  ipAddress: string | null = null
): Promise<{ challengeId: string; nonce: string; expiresAt: Date }> {
  if (purpose === 'line_link' && !userId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'การเชื่อม LINE ต้องเข้าสู่ระบบก่อน');
  }
  if (purpose !== 'line_link' && userId) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ประเภทคำขอไม่ถูกต้อง');
  }

  if (ipAddress) {
    const [recent] = await db
      .select({ n: count() })
      .from(authChallenges)
      .where(
        and(
          eq(authChallenges.ipAddress, ipAddress),
          gt(authChallenges.createdAt, new Date(Date.now() - 60_000))
        )
      );
    if ((recent?.n ?? 0) >= CHALLENGE_MAX_PER_IP_PER_MINUTE) {
      throw new AppError(429, 'RATE_LIMITED', 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่');
    }
  }

  const nonce = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const [row] = await db
    .insert(authChallenges)
    .values({
      purpose,
      nonceHash: hashSessionToken(nonce),
      userId,
      ipAddress,
      expiresAt,
    })
    .returning({ id: authChallenges.id });
  return { challengeId: row!.id, nonce, expiresAt };
}

/** Atomically marks a challenge as used. One challenge can be used exactly once. */
async function consumeChallenge(
  db: FaithMapDb,
  input: { challengeId: string; nonce: string },
  purpose: ChallengePurpose,
  userId: string | null
): Promise<void> {
  const owner = userId ? eq(authChallenges.userId, userId) : isNull(authChallenges.userId);
  const rows = await db
    .update(authChallenges)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authChallenges.id, input.challengeId),
        eq(authChallenges.purpose, purpose),
        eq(authChallenges.nonceHash, hashSessionToken(input.nonce)),
        isNull(authChallenges.consumedAt),
        gt(authChallenges.expiresAt, new Date()),
        owner
      )
    )
    .returning({ id: authChallenges.id });
  if (rows.length === 0) throw challengeInvalid();
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } })?.code
    ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '23505' || /unique|duplicate key/i.test(String((err as Error)?.message ?? ''));
}

export async function linkLineIdentity(
  db: FaithMapDb,
  actor: ActorContext,
  input: ProofInput,
  deps: LineDeps = defaultLineDeps()
): Promise<{ linked: true }> {
  await consumeChallenge(db, input, 'line_link', actor.user.id);
  const claims = await deps.verifyIdToken(input.idToken, input.nonce);

  const [bySubject] = await db
    .select()
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.provider, 'line'),
        eq(externalIdentities.providerSubject, claims.sub),
        isNull(externalIdentities.revokedAt)
      )
    );
  if (bySubject) {
    if (bySubject.userId === actor.user.id) return { linked: true };
    await recordSecurityAudit(db, {
      actorUserId: actor.user.id,
      action: 'line_identity_link_denied',
      targetType: 'external_identity',
      outcome: 'denied',
      reason: 'LINE identity already linked to another account',
    });
    throw new AppError(
      409,
      'LINE_ALREADY_LINKED',
      'บัญชี LINE นี้ถูกเชื่อมกับบัญชีผู้ใช้อื่นแล้ว กรุณาติดต่อผู้ดูแลระบบ'
    );
  }

  const [byUser] = await db
    .select()
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.provider, 'line'),
        eq(externalIdentities.userId, actor.user.id),
        isNull(externalIdentities.revokedAt)
      )
    );
  if (byUser) {
    throw new AppError(
      409,
      'ACCOUNT_ALREADY_HAS_LINE',
      'บัญชีนี้เชื่อม LINE ไว้แล้ว หากต้องการเปลี่ยน กรุณายกเลิกการเชื่อมต่อเดิมก่อน'
    );
  }

  try {
    const [created] = await db
      .insert(externalIdentities)
      .values({
        userId: actor.user.id,
        provider: 'line',
        providerSubject: claims.sub,
        displayName: claims.name ?? null,
      })
      .returning({ id: externalIdentities.id });
    await recordSecurityAudit(db, {
      actorUserId: actor.user.id,
      action: 'line_identity_linked',
      targetType: 'external_identity',
      targetId: created!.id,
      outcome: 'success',
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'LINE_ALREADY_LINKED', 'บัญชี LINE นี้ถูกเชื่อมกับบัญชีผู้ใช้อื่นแล้ว');
    }
    throw err;
  }
  return { linked: true };
}

export async function loginWithLine(
  db: FaithMapDb,
  input: ProofInput,
  deps: LineDeps = defaultLineDeps(),
  meta?: { userAgent?: string | null; ipAddress?: string | null }
) {
  await consumeChallenge(db, input, 'line_login', null);
  const claims = await deps.verifyIdToken(input.idToken, input.nonce);

  const [identity] = await db
    .select()
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.provider, 'line'),
        eq(externalIdentities.providerSubject, claims.sub),
        isNull(externalIdentities.revokedAt)
      )
    );
  if (!identity) {
    await recordSecurityAudit(db, {
      action: 'auth_login_line_failed',
      targetType: 'external_identity',
      ipAddress: meta?.ipAddress ?? null,
      outcome: 'denied',
      reason: 'LINE identity is not linked',
    });
    throw new AppError(
      401,
      'LINE_IDENTITY_UNLINKED',
      'บัญชี LINE นี้ยังไม่ได้เชื่อมกับบัญชีผู้ใช้งาน FaithMap กรุณาส่งคำขอลงทะเบียนหรือติดต่อผู้ดูแลระบบ'
    );
  }

  const [userRow] = await db.select().from(users).where(eq(users.id, identity.userId));
  if (!userRow) {
    throw new AppError(401, 'LINE_IDENTITY_UNLINKED', 'ไม่พบบัญชีผู้ใช้ที่เชื่อมโยง');
  }
  return issueSessionForUser(db, userRow, 'line_oidc', meta);
}

export async function unlinkLineIdentity(db: FaithMapDb, actor: ActorContext): Promise<void> {
  const active = await db
    .select()
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.provider, 'line'),
        eq(externalIdentities.userId, actor.user.id),
        isNull(externalIdentities.revokedAt)
      )
    );
  if (active.length === 0) {
    throw new AppError(404, 'LINE_NOT_LINKED', 'บัญชีนี้ยังไม่ได้เชื่อม LINE');
  }

  const [userRow] = await db.select().from(users).where(eq(users.id, actor.user.id));
  const [passkey] = await db
    .select({ id: userPasskeys.id })
    .from(userPasskeys)
    .where(and(eq(userPasskeys.userId, actor.user.id), isNull(userPasskeys.revokedAt)))
    .limit(1);
  if (!userRow?.passwordHash && !passkey) {
    throw new AppError(
      409,
      'LAST_SIGN_IN_METHOD',
      'ยกเลิกการเชื่อม LINE ไม่ได้ เพราะเป็นวิธีเข้าสู่ระบบเดียวของบัญชีนี้ กรุณาตั้งรหัสผ่านก่อน'
    );
  }

  const now = new Date();
  for (const row of active) {
    await db
      .update(externalIdentities)
      .set({ revokedAt: now, updatedAt: now })
      .where(eq(externalIdentities.id, row.id));
    if (userRow?.lineUserId && userRow.lineUserId === row.providerSubject) {
      await db.update(users).set({ lineUserId: null, updatedAt: now }).where(eq(users.id, userRow.id));
    }
    await recordSecurityAudit(db, {
      actorUserId: actor.user.id,
      action: 'line_identity_unlinked',
      targetType: 'external_identity',
      targetId: row.id,
      outcome: 'success',
    });
  }
}

export async function requestLineRegistration(
  db: FaithMapDb,
  input: ProofInput & { requestedName: string; note?: string },
  deps: LineDeps = defaultLineDeps()
) {
  const requestedName = input.requestedName.trim();
  if (requestedName.length < 1 || requestedName.length > 80) {
    throw new AppError(400, 'VALIDATION_ERROR', 'กรุณากรอกชื่อ-นามสกุลไม่เกิน 80 ตัวอักษร');
  }
  const note = input.note?.trim().slice(0, 300) || null;

  await consumeChallenge(db, input, 'line_register', null);
  const claims = await deps.verifyIdToken(input.idToken, input.nonce);

  const [linked] = await db
    .select({ id: externalIdentities.id })
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.provider, 'line'),
        eq(externalIdentities.providerSubject, claims.sub),
        isNull(externalIdentities.revokedAt)
      )
    );
  if (linked) {
    throw new AppError(
      409,
      'LINE_ALREADY_LINKED',
      'บัญชี LINE นี้มีบัญชีผู้ใช้อยู่แล้ว กรุณาเข้าสู่ระบบด้วย LINE'
    );
  }

  const findPending = () =>
    db
      .select()
      .from(lineRegistrationRequests)
      .where(
        and(
          eq(lineRegistrationRequests.lineSubject, claims.sub),
          eq(lineRegistrationRequests.status, 'pending')
        )
      );

  const [existing] = await findPending();
  if (existing) return existing;

  try {
    const [created] = await db
      .insert(lineRegistrationRequests)
      .values({
        lineSubject: claims.sub,
        lineDisplayName: claims.name ?? null,
        requestedName,
        note,
      })
      .returning();
    await recordSecurityAudit(db, {
      action: 'line_registration_requested',
      targetType: 'line_registration_request',
      targetId: created!.id,
      outcome: 'success',
    });
    return created!;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const [raced] = await findPending();
      if (raced) return raced;
    }
    throw err;
  }
}

/** The LINE subject is not returned: reviewers do not need it. */
export async function listRegistrationRequests(
  db: FaithMapDb,
  actor: ActorContext,
  status: 'pending' | 'approved' | 'rejected' = 'pending'
) {
  requireSuperAdmin(actor);
  return db
    .select({
      id: lineRegistrationRequests.id,
      lineDisplayName: lineRegistrationRequests.lineDisplayName,
      requestedName: lineRegistrationRequests.requestedName,
      note: lineRegistrationRequests.note,
      status: lineRegistrationRequests.status,
      createdAt: lineRegistrationRequests.createdAt,
      reviewedAt: lineRegistrationRequests.reviewedAt,
    })
    .from(lineRegistrationRequests)
    .where(eq(lineRegistrationRequests.status, status))
    .orderBy(desc(lineRegistrationRequests.createdAt))
    .limit(200);
}

export async function reviewRegistrationRequest(
  db: FaithMapDb,
  actor: ActorContext,
  input: { requestId: string; decision: 'approve' | 'reject'; reason?: string }
) {
  requireSuperAdmin(actor);
  const now = new Date();
  const status = input.decision === 'approve' ? 'approved' : 'rejected';

  let result: { id: string; status: string; createdUserId: string | null };
  try {
    result = await db.transaction(async (tx) => {
      const claimed = await tx
        .update(lineRegistrationRequests)
        .set({
          status,
          reviewedByUserId: actor.user.id,
          reviewedAt: now,
          reviewReason: input.reason?.trim().slice(0, 300) || null,
          updatedAt: now,
        })
        .where(
          and(
            eq(lineRegistrationRequests.id, input.requestId),
            eq(lineRegistrationRequests.status, 'pending')
          )
        )
        .returning();
      const request = claimed[0];
      if (!request) {
        const [exists] = await tx
          .select({ id: lineRegistrationRequests.id })
          .from(lineRegistrationRequests)
          .where(eq(lineRegistrationRequests.id, input.requestId));
        if (!exists) throw new AppError(404, 'REQUEST_NOT_FOUND', 'ไม่พบคำขอลงทะเบียนนี้');
        throw new AppError(409, 'REQUEST_ALREADY_DECIDED', 'คำขอนี้ถูกพิจารณาไปแล้ว');
      }

      if (input.decision === 'reject') {
        return { id: request.id, status, createdUserId: null };
      }

      const username = `line-${crypto.randomBytes(5).toString('hex')}`;
      const [user] = await tx
        .insert(users)
        .values({
          username,
          displayName: request.requestedName,
          systemRole: 'standard_user',
          status: 'active',
          passwordHash: null,
        })
        .returning({ id: users.id });
      await tx.insert(externalIdentities).values({
        userId: user!.id,
        provider: 'line',
        providerSubject: request.lineSubject,
        displayName: request.lineDisplayName,
      });
      await tx
        .update(lineRegistrationRequests)
        .set({ createdUserId: user!.id })
        .where(eq(lineRegistrationRequests.id, request.id));
      return { id: request.id, status, createdUserId: user!.id };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(
        409,
        'LINE_ALREADY_LINKED',
        'บัญชี LINE นี้ถูกเชื่อมกับบัญชีผู้ใช้อื่นไปแล้ว ไม่สามารถอนุมัติได้'
      );
    }
    throw err;
  }

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: `line_registration_${status}`,
    targetType: 'line_registration_request',
    targetId: result.id,
    outcome: 'success',
    metadata: { createdUserId: result.createdUserId },
  });
  return result;
}
