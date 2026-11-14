import type { ActorContext } from '../identity/service';
import { AppError } from '../errors';

export function isAdmin(actor: ActorContext): boolean {
  return actor.user.systemRole === 'super_admin' || actor.user.systemRole === 'admin';
}

export function isSuperAdmin(actor: ActorContext): boolean {
  return actor.user.systemRole === 'super_admin';
}

export function isMissionLeader(actor: ActorContext): boolean {
  return actor.user.systemRole === 'mission_leader';
}

export function isGlobalMetricsReader(actor: ActorContext): boolean {
  return isAdmin(actor) || isMissionLeader(actor);
}

export function isBodyLeaderForBody(actor: ActorContext, bodyId: string | null | undefined): boolean {
  if (!bodyId) return false;
  return actor.bodyLeaderBodyIds.has(bodyId);
}

export function isCareLeaderForCare(actor: ActorContext, careId: string | null | undefined): boolean {
  if (!careId) return false;
  return actor.careLeaderCareIds.has(careId);
}

export function canAccessCare(
  actor: ActorContext,
  careId: string,
  bodyId: string | null | undefined
): boolean {
  if (isGlobalMetricsReader(actor)) return true;
  if (isBodyLeaderForBody(actor, bodyId)) return true;
  return actor.assignedCareIds.has(careId);
}

export function assertCanAccessCare(
  actor: ActorContext,
  careId: string,
  bodyId: string | null | undefined
): void {
  if (!canAccessCare(actor, careId, bodyId)) {
    throw new AppError(
      403,
      'SCOPE_FORBIDDEN',
      'คุณไม่มีสิทธิ์เข้าถึงข้อมูลของแคร์นี้'
    );
  }
}

export function canManageCareScope(
  actor: ActorContext,
  careId: string | null | undefined,
  bodyId: string | null | undefined
): boolean {
  if (isAdmin(actor)) return true;
  if (bodyId && isBodyLeaderForBody(actor, bodyId)) return true;
  if (careId && isCareLeaderForCare(actor, careId)) return true;
  return false;
}

export function assertCanManageCareScope(
  actor: ActorContext,
  careId: string | null | undefined,
  bodyId: string | null | undefined
): void {
  if (!canManageCareScope(actor, careId, bodyId)) {
    throw new AppError(
      403,
      'SCOPE_FORBIDDEN',
      'คุณไม่มีสิทธิ์จัดการแคร์หรือผู้ดูแลแคร์นี้'
    );
  }
}

export function isGroupLeaderForGroup(actor: ActorContext, groupId: string): boolean {
  return actor.groupLeaderGroupIds.has(groupId);
}

export function isSupervisorForGroup(actor: ActorContext, groupId: string): boolean {
  return actor.supervisorGroupIds.has(groupId);
}

export function canAccessGroup(
  actor: ActorContext,
  groupId: string,
  bodyId: string | null | undefined
): boolean {
  if (isGlobalMetricsReader(actor)) return true;
  if (isBodyLeaderForBody(actor, bodyId)) return true;
  return actor.assignedGroupIds.has(groupId);
}

export function assertCanAccessGroup(
  actor: ActorContext,
  groupId: string,
  bodyId: string | null | undefined
): void {
  if (!canAccessGroup(actor, groupId, bodyId)) {
    throw new AppError(
      403,
      'SCOPE_FORBIDDEN',
      'คุณไม่มีสิทธิ์เข้าถึงข้อมูลของกลุ่มพันธกิจนี้'
    );
  }
}

/**
 * DEC-09: Body Leaders may manage groups and assignments ONLY within their assigned Body.
 */
export function canManageBodyScope(actor: ActorContext, bodyId: string | null | undefined): boolean {
  if (isAdmin(actor)) return true;
  if (!bodyId) return false;
  return isBodyLeaderForBody(actor, bodyId);
}

export function assertCanManageBodyScope(actor: ActorContext, bodyId: string | null | undefined): void {
  if (!canManageBodyScope(actor, bodyId)) {
    throw new AppError(
      403,
      'SCOPE_FORBIDDEN',
      'หัวหน้าบอดี้สามารถจัดการกลุ่มหรือมอบหมายหน้าที่ได้เฉพาะภายในบอดี้ของตนเองเท่านั้น (DEC-09)'
    );
  }
}

/**
 * DEC-06: Global Mission Leaders (Pastors) see aggregate metrics and pastoral themes,
 * while individual member/visitor direct PII (phone, lineUserId, email, full legal name details)
 * is visible ONLY to scoped stewards (Group Leader, assigned Care/Coordinator, Body Leader in same Body, Admin).
 */
export function canViewUnmaskedGroupPii(
  actor: ActorContext,
  groupId: string | null | undefined,
  bodyId: string | null | undefined
): boolean {
  if (isAdmin(actor)) return true;
  if (bodyId && isBodyLeaderForBody(actor, bodyId)) return true;
  if (groupId && actor.assignedGroupIds.has(groupId)) return true;
  return false;
}

export function maskPhoneNumber(phoneE164: string | null | undefined): string | null {
  if (!phoneE164) return null;
  if (phoneE164.length <= 4) return '****';
  return `***-***-${phoneE164.slice(-4)}`;
}

export function maskDisplayPiiName(
  fullName: string | null | undefined,
  displayName: string,
  isUnmasked: boolean
): string {
  if (isUnmasked) return fullName || displayName;
  const firstToken = displayName.split(/\s+/)[0] || 'สมาชิก';
  return `${firstToken} (ปกปิด PII ตาม DEC-06)`;
}
