import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import {
  followUpItems,
  groupMemberships,
  houseMissionGroups,
  members,
  reportingPeriods,
  visitorVisits,
  visitors,
  weeklyReports,
} from '@/server/db/schema';
import { AppError } from '../errors';
import { recordSecurityAudit } from '../audit/service';
import {
  canAccessGroup,
  canViewUnmaskedGroupPii,
  isAdmin,
  isBodyLeaderForBody,
  maskDisplayPiiName,
  maskPhoneNumber,
} from '../authz/policy';
import type { ActorContext } from '../identity/service';

export async function listScopedMembers(
  db: FaithMapDb,
  actor: ActorContext,
  filterGroupId?: string
) {
  const allGroups = await db.select().from(houseMissionGroups);
  const groupMap = new Map(allGroups.map((g) => [g.id, g]));

  const memberships = await db
    .select()
    .from(groupMemberships)
    .where(eq(groupMemberships.isActive, true));
  const filteredMemberships = memberships.filter((m) => {
    if (filterGroupId && m.groupId !== filterGroupId) return false;
    const grp = groupMap.get(m.groupId);
    if (!grp) return false;
    return canAccessGroup(actor, grp.id, grp.bodyId);
  });

  if (filteredMemberships.length === 0) return [];

  const memberIds = Array.from(new Set(filteredMemberships.map((m) => m.memberId)));
  const memberRows = await db
    .select()
    .from(members)
    .where(inArray(members.id, memberIds))
    .orderBy(asc(members.memberCode));
  const memberMap = new Map(memberRows.map((m) => [m.id, m]));

  return filteredMemberships
    .map((gm) => {
      const m = memberMap.get(gm.memberId);
      const grp = groupMap.get(gm.groupId);
      if (!m || !grp) return null;

      const unmasked = canViewUnmaskedGroupPii(actor, grp.id, grp.bodyId);
      return {
        id: m.id,
        membershipId: gm.id,
        memberCode: m.memberCode,
        groupId: grp.id,
        groupName: grp.nameTh,
        bodyId: grp.bodyId,
        membershipRole: gm.membershipRole,
        fullName: maskDisplayPiiName(m.fullName, m.displayName, unmasked),
        displayName: m.displayName,
        phone: unmasked ? m.phoneE164 : maskPhoneNumber(m.phoneE164),
        email: unmasked ? m.email : null,
        lineUserId: unmasked ? m.lineUserId : null,
        membershipStatus: m.membershipStatus,
        privacyConsentStatus: m.privacyConsentStatus,
        piiMasked: !unmasked,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

/**
 * Who may change data of a group: admins, the Body Leader of its Body, and stewards assigned to it.
 * Read-only roles (pastors) are not included. They see aggregates only (DEC-06).
 */
function assertCanWriteGroup(
  actor: ActorContext,
  grp: { id: string; bodyId: string | null }
): void {
  if (isAdmin(actor) || isBodyLeaderForBody(actor, grp.bodyId) || actor.assignedGroupIds.has(grp.id)) {
    return;
  }
  throw new AppError(403, 'SCOPE_FORBIDDEN', 'ไม่มีสิทธิ์แก้ไขข้อมูลของกลุ่มพันธกิจนี้');
}

/** Random member code. A time-based code repeated and could collide. */
export function newMemberCode(): string {
  return `MEM-KSN-${randomBytes(5).toString('hex').toUpperCase()}`;
}

export async function createGroupMember(
  db: FaithMapDb,
  actor: ActorContext,
  input: {
    groupId: string;
    fullName: string;
    displayName: string;
    phoneE164?: string | null;
    email?: string | null;
    membershipRole?: string;
    notes?: string | null;
  }
) {
  const [grp] = await db
    .select()
    .from(houseMissionGroups)
    .where(eq(houseMissionGroups.id, input.groupId));
  if (!grp) {
    throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจบ้านที่ระบุ');
  }
  if (
    !isAdmin(actor) &&
    !isBodyLeaderForBody(actor, grp.bodyId) &&
    !actor.assignedGroupIds.has(grp.id)
  ) {
    throw new AppError(403, 'SCOPE_FORBIDDEN', 'ไม่มีสิทธิ์เพิ่มสมาชิกในกลุ่มพันธกิจนี้');
  }

  const memberCode = newMemberCode();
  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const [created] = await tdb
      .insert(members)
      .values({
        memberCode,
        fullName: input.fullName.trim(),
        displayName: input.displayName.trim(),
        phoneE164: input.phoneE164?.trim() || null,
        email: input.email?.trim() || null,
        privacyConsentStatus: 'consented',
        consentRecordedAt: new Date(),
        notes: input.notes?.trim() || null,
      })
      .returning();

    await tdb.insert(groupMemberships).values({
      groupId: grp.id,
      memberId: created!.id,
      membershipRole: input.membershipRole || 'member',
      isActive: true,
    });

    await recordSecurityAudit(tdb, {
      actorUserId: actor.user.id,
      action: 'member_created',
      targetType: 'member',
      targetId: created!.id,
      metadata: { groupId: grp.id },
    });

    return created!;
  });
}

export async function registerVisitor(
  db: FaithMapDb,
  actor: ActorContext,
  input: {
    groupId: string;
    fullName: string;
    nickname?: string | null;
    phoneE164?: string | null;
    lineUserId?: string | null;
    consentForContact: boolean;
    visitType?: 'new_visitor' | 'returning_visitor';
    visitedOn?: string;
    weeklyReportId?: string | null;
    notes?: string | null;
    createFollowUp?: boolean;
    followUpTitle?: string | null;
  }
) {
  const [grp] = await db
    .select()
    .from(houseMissionGroups)
    .where(eq(houseMissionGroups.id, input.groupId));
  if (!grp) {
    throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจบ้านที่ระบุ');
  }
  assertCanWriteGroup(actor, grp);

  if (input.weeklyReportId) {
    const [linkedReport] = await db
      .select({ groupId: weeklyReports.groupId })
      .from(weeklyReports)
      .where(eq(weeklyReports.id, input.weeklyReportId));
    if (!linkedReport || linkedReport.groupId !== grp.id) {
      throw new AppError(400, 'REPORT_GROUP_MISMATCH', 'รายงานที่ระบุไม่ใช่ของกลุ่มพันธกิจนี้');
    }
  }

  const normalizedPhone = input.phoneE164?.trim() || null;
  const normalizedLine = input.lineUserId?.trim() || null;

  // DEC-10 PDPA Contact Consent Enforcement
  if ((normalizedPhone || normalizedLine) && !input.consentForContact) {
    throw new AppError(
      400,
      'VISITOR_CONSENT_REQUIRED',
      'ต้องได้รับความยินยอมให้ติดต่อกลับ (PDPA Consent) ก่อนบันทึกเบอร์โทรศัพท์หรือ LINE ของผู้เยี่ยม (DEC-10)'
    );
  }

  const [openPeriod] = await db
    .select()
    .from(reportingPeriods)
    .where(eq(reportingPeriods.status, 'open'))
    .limit(1);
  if (!openPeriod) {
    throw new AppError(409, 'NO_OPEN_PERIOD', 'ยังไม่มีรอบรายงานสัปดาห์ที่เปิดรับข้อมูล');
  }

  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const now = new Date();
    const [createdVisitor] = await tdb
      .insert(visitors)
      .values({
        fullName: input.fullName.trim(),
        nickname: input.nickname?.trim() || null,
        phoneE164: normalizedPhone,
        lineUserId: normalizedLine,
        consentForContact: Boolean(input.consentForContact),
        consentRecordedAt: input.consentForContact ? now : null,
        consentCapturedByUserId: input.consentForContact ? actor.user.id : null,
        firstOriginGroupId: grp.id,
        visitCount: 1,
      })
      .returning();

    const [createdVisit] = await tdb
      .insert(visitorVisits)
      .values({
        visitorId: createdVisitor!.id,
        groupId: grp.id,
        weeklyReportId: input.weeklyReportId ?? null,
        periodId: openPeriod.id,
        visitType: input.visitType ?? 'new_visitor',
        visitedOn: input.visitedOn ?? openPeriod.startDate,
        recordedByUserId: actor.user.id,
        notes: input.notes?.trim() || null,
      })
      .returning();

    let createdFollowUp: typeof followUpItems.$inferSelect | null = null;
    if (input.createFollowUp) {
      const [fu] = await tdb
        .insert(followUpItems)
        .values({
          groupId: grp.id,
          visitorId: createdVisitor!.id,
          sourceReportId: input.weeklyReportId ?? null,
          assignedToUserId: actor.user.id,
          title:
            input.followUpTitle?.trim() ||
            `เยี่ยมติดตามผู้เยี่ยมใหม่: ${createdVisitor!.nickname || createdVisitor!.fullName}`,
          notes: input.notes?.trim() || null,
          status: 'open',
          createdByUserId: actor.user.id,
        })
        .returning();
      createdFollowUp = fu ?? null;
    }

    await recordSecurityAudit(tdb, {
      actorUserId: actor.user.id,
      action: 'visitor_registered',
      targetType: 'visitor',
      targetId: createdVisitor!.id,
      metadata: { groupId: grp.id, consentForContact: input.consentForContact },
    });

    return {
      visitor: createdVisitor!,
      visit: createdVisit!,
      followUp: createdFollowUp,
    };
  });
}

export async function listScopedVisitors(
  db: FaithMapDb,
  actor: ActorContext,
  filterGroupId?: string
) {
  const allGroups = await db.select().from(houseMissionGroups);
  const groupMap = new Map(allGroups.map((g) => [g.id, g]));
  const allVisitors = await db.select().from(visitors).orderBy(desc(visitors.createdAt));

  return allVisitors
    .filter((v) => {
      if (filterGroupId && v.firstOriginGroupId !== filterGroupId) return false;
      if (!v.firstOriginGroupId) return isAdmin(actor);
      const grp = groupMap.get(v.firstOriginGroupId);
      if (!grp) return isAdmin(actor);
      return canAccessGroup(actor, grp.id, grp.bodyId);
    })
    .map((v) => {
      const grp = v.firstOriginGroupId ? groupMap.get(v.firstOriginGroupId) : undefined;
      const unmasked = canViewUnmaskedGroupPii(actor, grp?.id, grp?.bodyId);
      return {
        id: v.id,
        fullName: maskDisplayPiiName(v.fullName, v.nickname || 'ผู้เยี่ยม', unmasked),
        nickname: v.nickname,
        phone: unmasked ? v.phoneE164 : maskPhoneNumber(v.phoneE164),
        lineUserId: unmasked ? v.lineUserId : null,
        consentForContact: v.consentForContact,
        firstOriginGroupId: v.firstOriginGroupId,
        originGroupName: grp?.nameTh ?? '-',
        visitCount: v.visitCount,
        convertedMemberId: v.convertedMemberId,
        createdAt: v.createdAt,
        piiMasked: !unmasked,
      };
    });
}

export async function convertVisitorToMember(
  db: FaithMapDb,
  actor: ActorContext,
  visitorId: string,
  targetGroupId?: string
) {
  const [visitor] = await db.select().from(visitors).where(eq(visitors.id, visitorId));
  if (!visitor) {
    throw new AppError(404, 'VISITOR_NOT_FOUND', 'ไม่พบข้อมูลผู้เยี่ยม');
  }
  if (visitor.convertedMemberId) {
    throw new AppError(409, 'ALREADY_CONVERTED', 'ผู้เยี่ยมท่านนี้ได้โอนย้ายเป็นสมาชิกแล้ว');
  }

  const grpId = targetGroupId || visitor.firstOriginGroupId;
  if (!grpId) {
    throw new AppError(400, 'GROUP_REQUIRED', 'กรุณาระบุกลุ่มพันธกิจบ้านปลายทาง');
  }
  const [grp] = await db
    .select()
    .from(houseMissionGroups)
    .where(eq(houseMissionGroups.id, grpId));
  if (!grp) {
    throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจปลายทาง');
  }
  assertCanWriteGroup(actor, grp);
  // The visitor belongs to the group where they first came. Moving them needs access there too.
  if (visitor.firstOriginGroupId && visitor.firstOriginGroupId !== grp.id) {
    const [origin] = await db
      .select()
      .from(houseMissionGroups)
      .where(eq(houseMissionGroups.id, visitor.firstOriginGroupId));
    if (origin) assertCanWriteGroup(actor, origin);
  }

  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const [createdMember] = await tdb
      .insert(members)
      .values({
        memberCode: `MEM-KSN-${String(Date.now()).slice(-6)}`,
        fullName: visitor.fullName,
        displayName: visitor.nickname || visitor.fullName.split(' ')[0] || visitor.fullName,
        phoneE164: visitor.phoneE164,
        lineUserId: visitor.lineUserId,
        privacyConsentStatus: visitor.consentForContact ? 'consented' : 'pending',
        consentRecordedAt: visitor.consentRecordedAt,
      })
      .returning();

    await tdb.insert(groupMemberships).values({
      groupId: grp.id,
      memberId: createdMember!.id,
      membershipRole: 'member',
      isActive: true,
    });

    await tdb
      .update(visitors)
      .set({ convertedMemberId: createdMember!.id, updatedAt: new Date() })
      .where(eq(visitors.id, visitor.id));

    await recordSecurityAudit(tdb, {
      actorUserId: actor.user.id,
      action: 'visitor_converted_to_member',
      targetType: 'visitor',
      targetId: visitor.id,
      metadata: { newMemberId: createdMember!.id, groupId: grp.id },
    });

    return createdMember!;
  });
}

export async function listScopedFollowUps(db: FaithMapDb, actor: ActorContext) {
  const allGroups = await db.select().from(houseMissionGroups);
  const groupMap = new Map(allGroups.map((g) => [g.id, g]));
  const items = await db.select().from(followUpItems).orderBy(desc(followUpItems.createdAt));

  return items
    .filter((item) => {
      const grp = groupMap.get(item.groupId);
      return grp ? canAccessGroup(actor, grp.id, grp.bodyId) : isAdmin(actor);
    })
    .map((item) => {
      const grp = groupMap.get(item.groupId);
      return {
        ...item,
        groupName: grp?.nameTh ?? '-',
      };
    });
}

export async function updateFollowUpItem(
  db: FaithMapDb,
  actor: ActorContext,
  followUpId: string,
  status: 'open' | 'in_progress' | 'completed' | 'cancelled',
  notes?: string | null
) {
  const [item] = await db
    .select()
    .from(followUpItems)
    .where(eq(followUpItems.id, followUpId));
  if (!item) {
    throw new AppError(404, 'FOLLOW_UP_NOT_FOUND', 'ไม่พบรายการติดตามดูแล');
  }
  const [grp] = await db
    .select()
    .from(houseMissionGroups)
    .where(eq(houseMissionGroups.id, item.groupId));
  if (!grp) {
    throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจ');
  }
  assertCanWriteGroup(actor, grp);

  const [updated] = await db
    .update(followUpItems)
    .set({
      status,
      notes: notes !== undefined ? notes : item.notes,
      completedAt: status === 'completed' ? new Date() : item.completedAt,
      updatedAt: new Date(),
    })
    .where(eq(followUpItems.id, followUpId))
    .returning();

  return updated!;
}
