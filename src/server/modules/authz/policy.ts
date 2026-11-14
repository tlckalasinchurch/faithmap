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

export function isBodyLeaderForBody(actor: ActorContext, bodyId: string): boolean {
  return actor.bodyLeaderBodyIds.has(bodyId);
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
  bodyId: string
): boolean {
  if (isGlobalMetricsReader(actor)) return true;
  if (isBodyLeaderForBody(actor, bodyId)) return true;
  return actor.assignedGroupIds.has(groupId);
}

export function assertCanAccessGroup(
  actor: ActorContext,
  groupId: string,
  bodyId: string
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
export function canManageBodyScope(actor: ActorContext, bodyId: string): boolean {
  if (isAdmin(actor)) return true;
  return isBodyLeaderForBody(actor, bodyId);
}

export function assertCanManageBodyScope(actor: ActorContext, bodyId: string): void {
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
  fullName: string,
  displayName: string,
  isUnmasked: boolean
): string {
  if (isUnmasked) return fullName;
  const firstToken = displayName.split(/\s+/)[0] || 'สมาชิก';
  return `${firstToken} (ปกปิด PII ตาม DEC-06)`;
}
