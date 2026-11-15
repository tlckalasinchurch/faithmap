import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import { houseMissionGroups, memberGrowthRecords, members } from '@/server/db/schema';
import { canViewUnmaskedGroupPii, isAdmin } from '../authz/policy';
import { AppError } from '../errors';
import type { ActorContext } from '../identity/service';

export interface GrowthRecordView {
  id: string;
  memberName: string;
  groupId: string | null;
  groupName: string | null;
  conversionDateRaw: string | null;
  responseAttitudeRaw: string | null;
  groupAttendanceLevelRaw: string | null;
  discipleshipGoalRaw: string | null;
  targetTimeframeRaw: string | null;
  disciplerNameRaw: string | null;
  verificationStatus: string;
}

/**
 * Growth records are pastoral data about named people (DEC-06).
 * Only direct stewards of the group, the Body Leader of its Body, and admins can read them.
 * Values are returned exactly as imported. Nothing is guessed or cleaned here.
 */
export async function listGrowthRecordsForActor(
  db: FaithMapDb,
  actor: ActorContext,
  filters: { groupId?: string | null } = {}
): Promise<GrowthRecordView[]> {
  const groups = await db
    .select({ id: houseMissionGroups.id, bodyId: houseMissionGroups.bodyId, nameTh: houseMissionGroups.nameTh })
    .from(houseMissionGroups);
  const visible = groups.filter((g) => isAdmin(actor) || canViewUnmaskedGroupPii(actor, g.id, g.bodyId));

  if (visible.length === 0) {
    throw new AppError(403, 'SCOPE_REQUIRED', 'บัญชีนี้ยังไม่มีสิทธิ์ดูข้อมูลการเติบโตของสมาชิก');
  }
  const visibleIds = visible.map((g) => g.id);
  if (filters.groupId && !visibleIds.includes(filters.groupId)) {
    throw new AppError(403, 'SCOPE_FORBIDDEN', 'คุณไม่มีสิทธิ์ดูข้อมูลของกลุ่มนี้');
  }
  const groupName = new Map(visible.map((g) => [g.id, g.nameTh]));

  const rows = await db
    .select({
      id: memberGrowthRecords.id,
      groupId: memberGrowthRecords.groupId,
      conversionDateRaw: memberGrowthRecords.conversionDateRaw,
      responseAttitudeRaw: memberGrowthRecords.responseAttitudeRaw,
      groupAttendanceLevelRaw: memberGrowthRecords.groupAttendanceLevelRaw,
      discipleshipGoalRaw: memberGrowthRecords.discipleshipGoalRaw,
      targetTimeframeRaw: memberGrowthRecords.targetTimeframeRaw,
      disciplerNameRaw: memberGrowthRecords.disciplerNameRaw,
      verificationStatus: memberGrowthRecords.verificationStatus,
      fullName: members.fullName,
      displayName: members.displayName,
    })
    .from(memberGrowthRecords)
    .innerJoin(members, eq(memberGrowthRecords.memberId, members.id))
    .where(
      filters.groupId
        ? eq(memberGrowthRecords.groupId, filters.groupId)
        : inArray(memberGrowthRecords.groupId, visibleIds)
    )
    .orderBy(desc(memberGrowthRecords.updatedAt))
    .limit(500);

  return rows.map((r) => ({
    id: r.id,
    memberName: r.fullName ?? r.displayName,
    groupId: r.groupId,
    groupName: r.groupId ? groupName.get(r.groupId) ?? null : null,
    conversionDateRaw: r.conversionDateRaw,
    responseAttitudeRaw: r.responseAttitudeRaw,
    groupAttendanceLevelRaw: r.groupAttendanceLevelRaw,
    discipleshipGoalRaw: r.discipleshipGoalRaw,
    targetTimeframeRaw: r.targetTimeframeRaw,
    disciplerNameRaw: r.disciplerNameRaw,
    verificationStatus: r.verificationStatus,
  }));
}
