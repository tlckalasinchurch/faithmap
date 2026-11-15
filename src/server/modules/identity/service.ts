import { and, count, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import {
  assignments,
  authSessions,
  bodies,
  cares,
  externalIdentities,
  houseMissionGroups,
  securityAuditLogs,
  userPasskeys,
  users,
} from '@/server/db/schema';
import { AppError } from '../errors';
import { recordSecurityAudit } from '../audit/service';
import {
  generateOpaqueToken,
  hashPassword,
  hashSessionToken,
  loginTargetKey,
  verifyPasswordUniform,
} from './crypto';

export type SystemRole = 'super_admin' | 'admin' | 'mission_leader' | 'standard_user';
export type AccountStatus = 'pending_activation' | 'active' | 'suspended' | 'revoked';
export type AssignmentRole = 'body_leader' | 'care_leader' | 'coordinator' | 'group_leader' | 'other_authorized';

export interface ActiveAssignmentView {
  id: string;
  scopeType: 'body' | 'care' | 'group';
  bodyId: string | null;
  careId: string | null;
  groupId: string | null;
  bodyName: string | null;
  careCode: string | null;
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
  careLeaderCareIds: Set<string>;
  assignedCareIds: Set<string>;
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
  const careIds = Array.from(
    new Set(rawAssignments.map((a) => a.careId).filter((x): x is string => Boolean(x)))
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

  const careMap = new Map<string, { careCode: string; bodyId: string | null }>();
  if (careIds.length > 0) {
    const careRows = await db
      .select({ id: cares.id, careCode: cares.careCode, bodyId: cares.bodyId })
      .from(cares)
      .where(inArray(cares.id, careIds));
    for (const c of careRows) careMap.set(c.id, { careCode: c.careCode, bodyId: c.bodyId });
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
    scopeType: a.scopeType as 'body' | 'care' | 'group',
    bodyId: a.bodyId ?? (a.groupId ? groupMap.get(a.groupId)?.bodyId ?? null : null),
    careId: a.careId ?? null,
    groupId: a.groupId ?? null,
    bodyName: a.bodyId ? bodyMap.get(a.bodyId) ?? null : null,
    careCode: a.careId ? careMap.get(a.careId)?.careCode ?? null : null,
    groupName: a.groupId ? groupMap.get(a.groupId)?.nameTh ?? null : null,
    roleType: a.roleType as AssignmentRole,
    isPrimary: a.isPrimary,
  }));

  const bodyLeaderBodyIds = new Set<string>();
  const careLeaderCareIds = new Set<string>();
  const assignedCareIds = new Set<string>();
  const groupLeaderGroupIds = new Set<string>();
  const supervisorGroupIds = new Set<string>();
  const assignedGroupIds = new Set<string>();

  for (const a of views) {
    if (a.scopeType === 'body' && a.roleType === 'body_leader' && a.bodyId) {
      bodyLeaderBodyIds.add(a.bodyId);
    }
    if (a.scopeType === 'care' && a.careId) {
      assignedCareIds.add(a.careId);
      if (a.roleType === 'care_leader') {
        careLeaderCareIds.add(a.careId);
      }
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
    careLeaderCareIds,
    assignedCareIds,
    groupLeaderGroupIds,
    supervisorGroupIds,
    assignedGroupIds,
  };
}

export async function issueSessionForUser(
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
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_MS);

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

  // Keep at most MAX_SESSIONS_PER_USER live sessions. The oldest ones are revoked.
  const live = await db
    .select({ id: authSessions.id })
    .from(authSessions)
    .where(
      and(
        eq(authSessions.userId, userRow.id),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date())
      )
    )
    .orderBy(desc(authSessions.createdAt));
  const extra = live.slice(MAX_SESSIONS_PER_USER).map((s) => s.id);
  if (extra.length > 0) {
    await db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(inArray(authSessions.id, extra));
  }

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
  const normalizedUsername = username.trim().toLowerCase();
  await assertPasswordLoginAllowed(db, normalizedUsername, meta?.ipAddress ?? null);

  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.username, normalizedUsername));

  if (!userRow || !verifyPasswordUniform(plainPassword, userRow.passwordHash)) {
    await recordSecurityAudit(db, {
      actorUserId: userRow?.id ?? null,
      action: 'auth_login_password_failed',
      targetType: 'user',
      targetId: loginTargetKey(normalizedUsername),
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

/**
 * Demo account switching signs in as any account without a credential.
 * It is OFF unless FAITHMAP_DEMO_MODE is exactly "true", and it is always OFF in production.
 */
export function isDemoModeEnabled(): boolean {
  return process.env.FAITHMAP_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

export const SESSION_ABSOLUTE_MS = 7 * 24 * 3_600_000;
export const SESSION_IDLE_MS = 72 * 3_600_000;
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60_000;
export const MAX_SESSIONS_PER_USER = 10;

export const PASSWORD_LOGIN_MAX_FAILURES_PER_USERNAME = 5;
export const PASSWORD_LOGIN_MAX_FAILURES_PER_IP = 20;
export const PASSWORD_LOGIN_WINDOW_MS = 15 * 60_000;

async function assertPasswordLoginAllowed(
  db: FaithMapDb,
  normalizedUsername: string,
  ipAddress: string | null
): Promise<void> {
  const since = new Date(Date.now() - PASSWORD_LOGIN_WINDOW_MS);
  const [byUser] = await db
    .select({ n: count() })
    .from(securityAuditLogs)
    .where(
      and(
        eq(securityAuditLogs.action, 'auth_login_password_failed'),
        eq(securityAuditLogs.targetId, loginTargetKey(normalizedUsername)),
        gt(securityAuditLogs.createdAt, since)
      )
    );
  let blocked = (byUser?.n ?? 0) >= PASSWORD_LOGIN_MAX_FAILURES_PER_USERNAME;
  if (!blocked && ipAddress) {
    const [byIp] = await db
      .select({ n: count() })
      .from(securityAuditLogs)
      .where(
        and(
          eq(securityAuditLogs.action, 'auth_login_password_failed'),
          eq(securityAuditLogs.ipAddress, ipAddress),
          gt(securityAuditLogs.createdAt, since)
        )
      );
    blocked = (byIp?.n ?? 0) >= PASSWORD_LOGIN_MAX_FAILURES_PER_IP;
  }
  if (blocked) {
    throw new AppError(
      429,
      'RATE_LIMITED',
      'ลองเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่'
    );
  }
}

export async function switchDemoAccount(
  db: FaithMapDb,
  userId: string,
  meta?: { userAgent?: string | null; ipAddress?: string | null }
) {
  if (!isDemoModeEnabled()) {
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
  const idleFor = Date.now() - session.lastSeenAt.getTime();
  if (idleFor > SESSION_IDLE_MS) {
    await db.update(authSessions).set({ revokedAt: new Date() }).where(eq(authSessions.id, session.id));
    return null;
  }
  if (idleFor > SESSION_TOUCH_INTERVAL_MS) {
    await db.update(authSessions).set({ lastSeenAt: new Date() }).where(eq(authSessions.id, session.id));
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
