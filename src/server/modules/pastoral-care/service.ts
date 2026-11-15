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

export async function createGroupMemberWithWarnings(
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

  // FR-04.3: checked after the scope check, so a caller outside the group cannot probe for names or phones.
  const duplicateWarnings = await findDuplicateMemberWarnings(db, input);
  const memberCode = newMemberCode();
  const member = await db.transaction(async (tx) => {
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
  return { member, duplicateWarnings };
}

export async function createGroupMember(
  db: FaithMapDb,
  actor: ActorContext,
  input: Parameters<typeof createGroupMemberWithWarnings>[2]
) {
  return (await createGroupMemberWithWarnings(db, actor, input)).member;
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
        followupStatus: v.followupStatus,
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
      // DEC-06: care notes are restricted like absence notes. A pastor sees the list, not the notes.
      const canReadNotes = canViewUnmaskedGroupPii(actor, grp?.id, grp?.bodyId);
      return {
        ...item,
        notes: canReadNotes ? item.notes : null,
        // The outcome of a visit is free text like the notes. Same rule (DEC-06).
        outcomeNote: canReadNotes ? item.outcomeNote : null,
        groupName: grp?.nameTh ?? '-',
      };
    });
}

export async function updateFollowUpItem(
  db: FaithMapDb,
  actor: ActorContext,
  followUpId: string,
  status: 'open' | 'in_progress' | 'completed' | 'cancelled',
  notes?: string | null,
  outcomeNote?: string | null
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

  // FR-09.2: an item is completed only with a written outcome.
  const outcome = outcomeNote === undefined ? item.outcomeNote : outcomeNote?.trim() || null;
  if (status === 'completed' && !(outcome && outcome.length > 0)) {
    throw new AppError(400, 'OUTCOME_REQUIRED', 'กรุณาบันทึกผลการติดตามก่อนปิดรายการ');
  }

  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const [updated] = await tdb
      .update(followUpItems)
      .set({
        status,
        notes: notes !== undefined ? notes : item.notes,
        outcomeNote: outcome,
        completedAt: status === 'completed' ? new Date() : item.completedAt,
        completedByUserId: status === 'completed' ? actor.user.id : item.completedByUserId,
        updatedAt: new Date(),
      })
      .where(eq(followUpItems.id, followUpId))
      .returning();
    // FR-05.3: finishing a follow-up of a visitor moves the visitor to "contacted" (never backwards).
    if (status === 'completed' && item.visitorId) {
      await tdb
        .update(visitors)
        .set({ followupStatus: 'contacted', updatedAt: new Date() })
        .where(and(eq(visitors.id, item.visitorId), inArray(visitors.followupStatus, ['first_visit', 'awaiting_followup'])));
    }
    await recordSecurityAudit(tdb, {
      actorUserId: actor.user.id,
      action: 'follow_up_updated',
      targetType: 'follow_up_item',
      targetId: followUpId,
      metadata: { from: item.status, to: status },
    });
    return updated!;
  });
}

const VISITOR_STATUS_NEXT: Record<string, string[]> = {
  first_visit: ['awaiting_followup', 'contacted'],
  awaiting_followup: ['contacted'],
  contacted: ['returned', 'ongoing_care', 'completed'],
  returned: ['ongoing_care', 'completed'],
  ongoing_care: ['completed'],
  completed: [],
};

async function loadVisitorForWrite(db: FaithMapDb, actor: ActorContext, visitorId: string) {
  const [visitor] = await db.select().from(visitors).where(eq(visitors.id, visitorId));
  if (!visitor) throw new AppError(404, 'VISITOR_NOT_FOUND', 'ไม่พบผู้เยี่ยมที่ระบุ');
  const [grp] = visitor.firstOriginGroupId
    ? await db.select().from(houseMissionGroups).where(eq(houseMissionGroups.id, visitor.firstOriginGroupId))
    : [];
  if (!grp) {
    if (!isAdmin(actor)) throw new AppError(403, 'SCOPE_FORBIDDEN', 'ไม่มีสิทธิ์จัดการผู้เยี่ยมนี้');
  } else {
    assertCanWriteGroup(actor, grp);
  }
  return { visitor, grp };
}

/** FR-05.1, FR-05.3: record that an existing visitor came again. The visit history grows; no second visitor row is made. */
export async function recordVisitorReturn(
  db: FaithMapDb,
  actor: ActorContext,
  input: { visitorId: string; groupId?: string; visitedOn?: string; weeklyReportId?: string | null; notes?: string | null }
) {
  const { visitor, grp: originGroup } = await loadVisitorForWrite(db, actor, input.visitorId);
  const groupId = input.groupId ?? originGroup?.id;
  if (!groupId) throw new AppError(400, 'GROUP_REQUIRED', 'ต้องระบุกลุ่มที่ผู้เยี่ยมมาร่วม');
  const [visitGroup] = await db.select().from(houseMissionGroups).where(eq(houseMissionGroups.id, groupId));
  if (!visitGroup) throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจบ้านที่ระบุ');
  assertCanWriteGroup(actor, visitGroup);
  const [openPeriod] = await db.select().from(reportingPeriods).where(eq(reportingPeriods.status, 'open')).limit(1);
  if (!openPeriod) throw new AppError(409, 'NO_OPEN_PERIOD', 'ยังไม่มีรอบรายงานสัปดาห์ที่เปิดรับข้อมูล');
  const [already] = await db
    .select({ id: visitorVisits.id })
    .from(visitorVisits)
    .where(and(eq(visitorVisits.visitorId, visitor.id), eq(visitorVisits.periodId, openPeriod.id)))
    .limit(1);
  if (already) throw new AppError(409, 'VISIT_ALREADY_RECORDED', 'บันทึกการมาร่วมของผู้เยี่ยมคนนี้ในสัปดาห์นี้แล้ว');

  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const [visit] = await tdb
      .insert(visitorVisits)
      .values({
        visitorId: visitor.id,
        groupId,
        weeklyReportId: input.weeklyReportId ?? null,
        periodId: openPeriod.id,
        visitType: 'returning_visitor',
        visitedOn: input.visitedOn ?? openPeriod.startDate,
        recordedByUserId: actor.user.id,
        notes: input.notes?.trim() || null,
      })
      .returning();
    // A visit is the proof that the visitor returned. Later stages (ongoing care, completed) are not moved back.
    const nextStatus = ['first_visit', 'awaiting_followup', 'contacted'].includes(visitor.followupStatus) ? 'returned' : visitor.followupStatus;
    const [updated] = await tdb
      .update(visitors)
      .set({ visitCount: visitor.visitCount + 1, followupStatus: nextStatus, updatedAt: new Date() })
      .where(eq(visitors.id, visitor.id))
      .returning();
    // A returned visitor needs no "not returned" item any more.
    await tdb
      .update(followUpItems)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(followUpItems.visitorId, visitor.id),
          eq(followUpItems.sourceType, 'visitor_not_returned'),
          inArray(followUpItems.status, ['open', 'in_progress'])
        )
      );
    return { visitor: updated!, visit: visit! };
  });
}

/** FR-05.3: move a visitor forward in the follow-up lifecycle. Backward moves are refused. */
export async function updateVisitorFollowupStatus(
  db: FaithMapDb,
  actor: ActorContext,
  visitorId: string,
  status: string
) {
  const { visitor } = await loadVisitorForWrite(db, actor, visitorId);
  if (!(VISITOR_STATUS_NEXT[visitor.followupStatus] ?? []).includes(status)) {
    throw new AppError(409, 'VISITOR_STATUS_INVALID', 'ไม่สามารถเปลี่ยนสถานะผู้เยี่ยมไปขั้นนี้ได้');
  }
  const [updated] = await db
    .update(visitors)
    .set({ followupStatus: status, updatedAt: new Date() })
    .where(eq(visitors.id, visitorId))
    .returning();
  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'visitor_status_changed',
    targetType: 'visitor',
    targetId: visitorId,
    metadata: { from: visitor.followupStatus, to: status },
  });
  return updated!;
}

/**
 * FR-04.3: warn about a possible duplicate before a member is created. The warning gives counts only.
 * It never returns the other person's name or phone (DEC-06). The caller decides to continue or not.
 */
export async function findDuplicateMemberWarnings(
  db: FaithMapDb,
  input: { fullName: string; phoneE164?: string | null }
): Promise<{ samePhone: number; sameName: number }> {
  const name = input.fullName.trim();
  const phone = input.phoneE164?.trim() || null;
  const byName = await db.select({ id: members.id }).from(members).where(eq(members.fullName, name));
  const byPhone = phone ? await db.select({ id: members.id }).from(members).where(eq(members.phoneE164, phone)) : [];
  return { samePhone: byPhone.length, sameName: byName.length };
}

/**
 * FR-04.2: end the membership of a member in a group. The row stays with `left_at`; attendance history is not touched.
 * The member is not deleted and is not labelled inactive (FR-06.5).
 */
export async function endGroupMembership(
  db: FaithMapDb,
  actor: ActorContext,
  input: { groupId: string; memberId: string }
) {
  const [grp] = await db.select().from(houseMissionGroups).where(eq(houseMissionGroups.id, input.groupId));
  if (!grp) throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจบ้านที่ระบุ');
  assertCanWriteGroup(actor, grp);
  const [membership] = await db
    .select()
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, grp.id), eq(groupMemberships.memberId, input.memberId), eq(groupMemberships.isActive, true)));
  if (!membership) throw new AppError(404, 'MEMBERSHIP_NOT_FOUND', 'ไม่พบการเป็นสมาชิกที่ใช้งานอยู่ในกลุ่มนี้');
  const [updated] = await db
    .update(groupMemberships)
    .set({ isActive: false, leftAt: new Date(), updatedAt: new Date() })
    .where(eq(groupMemberships.id, membership.id))
    .returning();
  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'membership_ended',
    targetType: 'member',
    targetId: input.memberId,
    metadata: { groupId: grp.id },
  });
  return updated!;
}

/**
 * FR-04.2: put an existing member into a group. Only an admin or the Body Leader of the group's Body may do it,
 * because the group leader would then read the member's phone and address (DEC-06). The member must be free
 * or already in a group of the same Body. A group leader creates a new member instead (`createGroupMember`).
 */
export async function addExistingMemberToGroup(
  db: FaithMapDb,
  actor: ActorContext,
  input: { groupId: string; memberId: string; membershipRole?: string }
) {
  const [grp] = await db.select().from(houseMissionGroups).where(eq(houseMissionGroups.id, input.groupId));
  if (!grp) throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจบ้านที่ระบุ');
  if (!isAdmin(actor) && !isBodyLeaderForBody(actor, grp.bodyId)) {
    throw new AppError(403, 'SCOPE_FORBIDDEN', 'เฉพาะผู้ดูแลระบบหรือหัวหน้าบอดี้ของกลุ่มนี้เท่านั้นที่เพิ่มสมาชิกเดิมเข้ากลุ่มได้');
  }
  const [member] = await db.select().from(members).where(eq(members.id, input.memberId));
  if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'ไม่พบสมาชิกที่ระบุ');
  const active = await db
    .select({ groupId: groupMemberships.groupId })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.memberId, member.id), eq(groupMemberships.isActive, true)));
  if (active.some((m) => m.groupId === grp.id)) {
    throw new AppError(409, 'ALREADY_MEMBER', 'สมาชิกคนนี้อยู่ในกลุ่มนี้แล้ว');
  }
  if (!isAdmin(actor) && active.length > 0) {
    const groups = await db
      .select({ id: houseMissionGroups.id, bodyId: houseMissionGroups.bodyId })
      .from(houseMissionGroups)
      .where(inArray(houseMissionGroups.id, active.map((m) => m.groupId)));
    if (groups.some((g) => g.bodyId !== grp.bodyId)) {
      throw new AppError(403, 'SCOPE_FORBIDDEN', 'สมาชิกคนนี้อยู่ในกลุ่มของบอดี้อื่น ต้องให้ผู้ดูแลระบบดำเนินการ');
    }
  }
  const [created] = await db
    .insert(groupMemberships)
    .values({ groupId: grp.id, memberId: member.id, membershipRole: input.membershipRole || 'member', isActive: true })
    .returning();
  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'membership_added',
    targetType: 'member',
    targetId: member.id,
    metadata: { groupId: grp.id },
  });
  return created!;
}
