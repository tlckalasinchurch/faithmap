import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import {
  assignments,
  authSessions,
  bodies,
  externalIdentities,
  houseMissionGroups,
  userPasskeys,
  users,
} from '@/server/db/schema';
import { AppError } from '../errors';
import { recordSecurityAudit } from '../audit/service';
import {
  generateOpaqueToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from './crypto';

export type SystemRole = 'super_admin' | 'admin' | 'mission_leader' | 'standard_user';
export type AccountStatus = 'pending_activation' | 'active' | 'suspended' | 'revoked';
export type AssignmentRole = 'body_leader' | 'care_leader' | 'coordinator' | 'group_leader' | 'other_authorized';

export interface ActiveAssignmentView {
  id: string;
  scopeType: 'body' | 'group';
  bodyId: string | null;
  groupId: string | null;
  bodyName: string | null;
  groupName: string | null;
  roleType: AssignmentRole;
  isPrimary: boolean;
}

export interface ActorContext {
  user: {
    id: string;
    username: string;
    displayName: string;
    email: string | null;
    phoneE164: string | null;
    systemRole: SystemRole;
    status: AccountStatus;
    lineUserId: string | null;
    preferredUiMode: string;
  };
  sessionId: string | null;
  csrfTokenHash: string | null;
  assignments: ActiveAssignmentView[];
  bodyLeaderBodyIds: Set<string>;
  groupLeaderGroupIds: Set<string>;
  supervisorGroupIds: Set<string>;
  assignedGroupIds: Set<string>;
}

export interface UsableUserCandidate {
  id: string;
  status: string;
  passwordHash: string | null;
}

export async function isUsableAccount(
  db: FaithMapDb,
  user: UsableUserCandidate
): Promise<boolean> {
  if (user.status !== 'active') return false;
  if (user.passwordHash) return true;

  const [ext] = await db
    .select({ id: externalIdentities.id })
    .from(externalIdentities)
    .where(and(eq(externalIdentities.userId, user.id), isNull(externalIdentities.revokedAt)))
    .limit(1);
  if (ext) return true;

  const [pk] = await db
    .select({ id: userPasskeys.id })
    .from(userPasskeys)
    .where(and(eq(userPasskeys.userId, user.id), isNull(userPasskeys.revokedAt)))
    .limit(1);
  return Boolean(pk);
}

export async function buildActorContext(
  db: FaithMapDb,
  userRow: typeof users.$inferSelect,
  sessionId: string | null = null,
  csrfTokenHash: string | null = null
): Promise<ActorContext> {
  const rawAssignments = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.userId, userRow.id), isNull(assignments.effectiveTo)));

  const bodyIds = Array.from(
    new Set(rawAssignments.map((a) => a.bodyId).filter((x): x is string => Boolean(x)))
  );
  const groupIds = Array.from(
    new Set(rawAssignments.map((a) => a.groupId).filter((x): x is string => Boolean(x)))
  );

  const bodyMap = new Map<string, string>();
  if (bodyIds.length > 0) {
    const bodyRows = await db
      .select({ id: bodies.id, nameTh: bodies.nameTh })
      .from(bodies)
      .where(inArray(bodies.id, bodyIds));
    for (const b of bodyRows) bodyMap.set(b.id, b.nameTh);
  }

  const groupMap = new Map<string, { nameTh: string; bodyId: string | null }>();
  if (groupIds.length > 0) {
    const groupRows = await db
      .select({
        id: houseMissionGroups.id,
        nameTh: houseMissionGroups.nameTh,
        bodyId: houseMissionGroups.bodyId,
      })
      .from(houseMissionGroups)
      .where(inArray(houseMissionGroups.id, groupIds));
    for (const g of groupRows) groupMap.set(g.id, { nameTh: g.nameTh, bodyId: g.bodyId });
  }

  const views: ActiveAssignmentView[] = rawAssignments.map((a) => ({
    id: a.id,
    scopeType: a.scopeType as 'body' | 'group',
    bodyId: a.bodyId ?? (a.groupId ? groupMap.get(a.groupId)?.bodyId ?? null : null),
    groupId: a.groupId ?? null,
    bodyName: a.bodyId ? bodyMap.get(a.bodyId) ?? null : null,
    groupName: a.groupId ? groupMap.get(a.groupId)?.nameTh ?? null : null,
    roleType: a.roleType as AssignmentRole,
    isPrimary: a.isPrimary,
  }));

  const bodyLeaderBodyIds = new Set<string>();
  const groupLeaderGroupIds = new Set<string>();
  const supervisorGroupIds = new Set<string>();
  const assignedGroupIds = new Set<string>();

  for (const a of views) {
    if (a.roleType === 'body_leader' && a.bodyId) {
      bodyLeaderBodyIds.add(a.bodyId);
    }
    if (a.groupId) {
      assignedGroupIds.add(a.groupId);
      if (a.roleType === 'group_leader') {
        groupLeaderGroupIds.add(a.groupId);
      } else if (a.roleType === 'care_leader' || a.roleType === 'coordinator') {
        supervisorGroupIds.add(a.groupId);
      }
    }
  }

  return {
    user: {
      id: userRow.id,
      username: userRow.username,
      displayName: userRow.displayName,
      email: userRow.email ?? null,
      phoneE164: userRow.phoneE164 ?? null,
      systemRole: userRow.systemRole as SystemRole,
      status: userRow.status as AccountStatus,
      lineUserId: userRow.lineUserId ?? null,
      preferredUiMode: userRow.preferredUiMode,
    },
    sessionId,
    csrfTokenHash,
    assignments: views,
    bodyLeaderBodyIds,
    groupLeaderGroupIds,
    supervisorGroupIds,
    assignedGroupIds,
  };
}

async function issueSessionForUser(
  db: FaithMapDb,
  userRow: typeof users.$inferSelect,
  authMethod: string,
  meta?: { userAgent?: string | null; ipAddress?: string | null }
): Promise<{
  sessionToken: string;
  csrfToken: string;
  actor: ActorContext;
}> {
  const usable = await isUsableAccount(db, userRow);
  if (!usable) {
    await recordSecurityAudit(db, {
      actorUserId: userRow.id,
      action: 'auth_login_rejected',
      targetType: 'user',
      targetId: userRow.id,
      ipAddress: meta?.ipAddress ?? null,
      outcome: 'denied',
      reason: `Account is not usable (status=${userRow.status})`,
    });
    throw new AppError(
      403,
      'ACCOUNT_UNUSABLE',
      'บัญชีผู้ใช้นี้ยังไม่เปิดใช้งานหรือถูกระงับสิทธิ์ชั่วคราว'
    );
  }

  const rawToken = generateOpaqueToken();
  const csrfToken = generateOpaqueToken();
  const tokenHash = hashSessionToken(rawToken);
  const csrfTokenHash = hashSessionToken(csrfToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 3_600_000);

  const [session] = await db
    .insert(authSessions)
    .values({
      userId: userRow.id,
      tokenHash,
      csrfTokenHash,
      authMethod,
      userAgent: meta?.userAgent ?? null,
      ipAddress: meta?.ipAddress ?? null,
      expiresAt,
    })
    .returning();

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userRow.id));

  await recordSecurityAudit(db, {
    actorUserId: userRow.id,
    action: `auth_login_${authMethod}`,
    targetType: 'auth_session',
    targetId: session!.id,
    ipAddress: meta?.ipAddress ?? null,
    outcome: 'success',
  });

  const actor = await buildActorContext(db, userRow, session!.id, csrfTokenHash);
  return { sessionToken: rawToken, csrfToken, actor };
}

export async function loginWithPassword(
  db: FaithMapDb,
  username: string,
  plainPassword: string,
  meta?: { userAgent?: string | null; ipAddress?: string | null }
) {
  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.username, username.trim().toLowerCase()));

  if (!userRow || !verifyPassword(plainPassword, userRow.passwordHash)) {
    await recordSecurityAudit(db, {
      actorUserId: userRow?.id ?? null,
      action: 'auth_login_password_failed',
      targetType: 'user',
      targetId: username,
      ipAddress: meta?.ipAddress ?? null,
      outcome: 'denied',
      reason: 'Invalid username or password',
    });
    throw new AppError(
      401,
      'INVALID_CREDENTIALS',
      'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
    );
  }

  return issueSessionForUser(db, userRow, 'password', meta);
}

export async function switchDemoAccount(
  db: FaithMapDb,
  userId: string,
  meta?: { userAgent?: string | null; ipAddress?: string | null }
) {
  if (process.env.FAITHMAP_DEMO_MODE === 'false') {
    throw new AppError(
      403,
      'DEMO_SWITCH_DISABLED',
      'โหมดสลับบัญชีสาธิตถูกปิดการใช้งาน'
    );
  }

  const [userRow] = await db.select().from(users).where(eq(users.id, userId));
  if (!userRow) {
    throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบบัญชีผู้ใช้ที่เลือก');
  }

  return issueSessionForUser(db, userRow, 'demo_switch', meta);
}

export async function loginWithLineSubject(
  db: FaithMapDb,
  lineSubject: string,
  lineDisplayName?: string,
  meta?: { userAgent?: string | null; ipAddress?: string | null }
) {
  const [identity] = await db
    .select()
    .from(externalIdentities)
    .where(
      and(
        eq(externalIdentities.provider, 'line'),
        eq(externalIdentities.providerSubject, lineSubject),
        isNull(externalIdentities.revokedAt)
      )
    );

  if (!identity) {
    throw new AppError(
      401,
      'LINE_IDENTITY_UNLINKED',
      'บัญชี LINE นี้ยังไม่ได้เชื่อมกับบัญชีผู้ใช้งาน FaithMap กรุณาติดต่อผู้ดูแลระบบ'
    );
  }

  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.id, identity.userId));
  if (!userRow) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'ไม่พบบัญชีผู้ใช้ที่เชื่อมโยง');
  }

  if (lineDisplayName && lineDisplayName !== identity.displayName) {
    await db
      .update(externalIdentities)
      .set({ displayName: lineDisplayName, updatedAt: new Date() })
      .where(eq(externalIdentities.id, identity.id));
  }

  return issueSessionForUser(db, userRow, 'line_oidc', meta);
}

export async function authenticateSessionToken(
  db: FaithMapDb,
  rawToken: string | null | undefined
): Promise<ActorContext | null> {
  if (!rawToken) return null;
  const tokenHash = hashSessionToken(rawToken);

  const [session] = await db
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)));

  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId));
  if (!userRow || userRow.status !== 'active') {
    return null;
  }

  return buildActorContext(db, userRow, session.id, session.csrfTokenHash);
}

export async function logoutBySessionToken(
  db: FaithMapDb,
  rawToken: string | null | undefined
): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashSessionToken(rawToken);
  const [session] = await db
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)));
  if (!session) return;

  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(eq(authSessions.id, session.id));

  await recordSecurityAudit(db, {
    actorUserId: session.userId,
    action: 'auth_logout',
    targetType: 'auth_session',
    targetId: session.id,
    outcome: 'success',
  });
}

export async function enrollPasskey(
  db: FaithMapDb,
  userId: string,
  input: { credentialId: string; publicKeyB64: string; deviceLabel: string }
) {
  const [created] = await db
    .insert(userPasskeys)
    .values({
      userId,
      credentialId: input.credentialId,
      publicKeyB64: input.publicKeyB64,
      deviceLabel: input.deviceLabel,
    })
    .returning();

  await recordSecurityAudit(db, {
    actorUserId: userId,
    action: 'passkey_enrolled',
    targetType: 'user_passkey',
    targetId: created!.id,
    outcome: 'success',
  });
  return created!;
}

export async function createOrUpdateUserPassword(
  db: FaithMapDb,
  userId: string,
  plainPassword: string
) {
  const hash = hashPassword(plainPassword);
  await db
    .update(users)
    .set({ passwordHash: hash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
