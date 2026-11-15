import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import {
  assignments,
  attendanceRecords,
  bodies,
  groupMemberships,
  houseMissionGroups,
  periodGroupSnapshots,
  reportAuditEvents,
  reportingPeriods,
  users,
  weeklyReports,
} from '@/server/db/schema';
import { AppError, isUniqueViolation } from '../errors';
import { recordReportAudit, recordSecurityAudit } from '../audit/service';
import {
  assertCanAccessGroup,
  canAccessGroup,
  canViewUnmaskedGroupPii,
  isAdmin,
  isBodyLeaderForBody,
  isGroupLeaderForGroup,
  isSupervisorForGroup,
} from '../authz/policy';
import { dispatchNotification } from '../notifications/service';
import { isUsableAccount, type ActorContext } from '../identity/service';
import { getBangkokParts, getMondaySundayPeriodBounds, isPastDeadline } from '../time/bangkok';

export interface BodyApprovalReadiness {
  ready: boolean;
  eligibleApproverUserIds: string[];
  reasonIfNotReady:
    | 'NO_ELIGIBLE_BODY_LEADER'
    | 'ONLY_SUBMITTER_IS_BODY_LEADER'
    | 'PENDING_BODY_ASSIGNMENT'
    | null;
}

export async function evaluateBodyApprovalReadiness(
  db: FaithMapDb,
  bodyId: string | null | undefined,
  excludeUserId?: string | null
): Promise<BodyApprovalReadiness> {
  if (!bodyId) {
    return {
      ready: false,
      eligibleApproverUserIds: [],
      reasonIfNotReady: 'PENDING_BODY_ASSIGNMENT',
    };
  }

  const bodyLeaderAssignments = await db
    .select()
    .from(assignments)
    .where(
      and(
        eq(assignments.scopeType, 'body'),
        eq(assignments.bodyId, bodyId),
        eq(assignments.roleType, 'body_leader'),
        isNull(assignments.effectiveTo)
      )
    );

  const blUserIds = bodyLeaderAssignments
    .map((a) => a.userId)
    .filter((id): id is string => Boolean(id));

  if (blUserIds.length === 0) {
    return {
      ready: false,
      eligibleApproverUserIds: [],
      reasonIfNotReady: 'NO_ELIGIBLE_BODY_LEADER',
    };
  }

  const candidateUsers = await db
    .select()
    .from(users)
    .where(inArray(users.id, blUserIds));

  const usableLeaderIds: string[] = [];
  for (const candidate of candidateUsers) {
    if (await isUsableAccount(db, candidate)) {
      usableLeaderIds.push(candidate.id);
    }
  }

  if (usableLeaderIds.length === 0) {
    return {
      ready: false,
      eligibleApproverUserIds: [],
      reasonIfNotReady: 'NO_ELIGIBLE_BODY_LEADER',
    };
  }

  const eligibleNonSelf = excludeUserId
    ? usableLeaderIds.filter((id) => id !== excludeUserId)
    : usableLeaderIds;

  if (eligibleNonSelf.length === 0) {
    return {
      ready: false,
      eligibleApproverUserIds: [],
      reasonIfNotReady: 'ONLY_SUBMITTER_IS_BODY_LEADER',
    };
  }

  return {
    ready: true,
    eligibleApproverUserIds: eligibleNonSelf,
    reasonIfNotReady: null,
  };
}

export async function evaluateRequiresSupervisorReview(
  db: FaithMapDb,
  groupId: string
): Promise<{ required: boolean; supervisorUserIds: string[] }> {
  const supervisorAssignments = await db
    .select()
    .from(assignments)
    .where(
      and(
        eq(assignments.scopeType, 'group'),
        eq(assignments.groupId, groupId),
        inArray(assignments.roleType, ['care_leader', 'coordinator']),
        isNull(assignments.effectiveTo)
      )
    );

  const supUserIds = supervisorAssignments
    .map((a) => a.userId)
    .filter((id): id is string => Boolean(id));

  if (supUserIds.length === 0) {
    return { required: false, supervisorUserIds: [] };
  }

  const supervisorUsers = await db
    .select()
    .from(users)
    .where(inArray(users.id, supUserIds));

  const usableIds: string[] = [];
  for (const u of supervisorUsers) {
    if (await isUsableAccount(db, u)) usableIds.push(u.id);
  }

  return { required: usableIds.length > 0, supervisorUserIds: usableIds };
}

export async function ensureActiveReportingPeriod(
  db: FaithMapDb,
  referenceDate: Date = new Date()
) {
  const window = getMondaySundayPeriodBounds(referenceDate, '20:00', '20:30');
  const [existing] = await db
    .select()
    .from(reportingPeriods)
    .where(eq(reportingPeriods.periodKey, window.periodKey));

  if (existing) return existing;

  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const [created] = await tdb
      .insert(reportingPeriods)
      .values({
        periodKey: window.periodKey,
        startDate: window.startDate,
        endDate: window.endDate,
        deadlineAt: window.deadlineAt,
        briefScheduledAt: window.briefScheduledAt,
        status: 'open',
      })
      .returning();

    const activeGroups = await tdb
      .select()
      .from(houseMissionGroups)
      .where(eq(houseMissionGroups.status, 'active'));
    const allBodies = await tdb.select().from(bodies);
    const bodyMap = new Map(allBodies.map((b) => [b.id, b.nameTh]));
    const activeAssignments = await tdb
      .select()
      .from(assignments)
      .where(and(eq(assignments.scopeType, 'group'), isNull(assignments.effectiveTo)));

    if (activeGroups.length > 0) {
      await tdb.insert(periodGroupSnapshots).values(
        activeGroups.map((g) => {
          const groupAssign = activeAssignments.filter((a) => a.groupId === g.id);
          const primaryLeader = groupAssign.find(
            (a) => a.roleType === 'group_leader' && a.isPrimary
          );
          const supervisors = groupAssign
            .filter((a) => a.roleType === 'care_leader' || a.roleType === 'coordinator')
            .map((a) => a.userId)
            .filter((id): id is string => Boolean(id));
          return {
            periodId: created!.id,
            groupId: g.id,
            bodyId: g.bodyId,
            groupNameSnapshot: g.nameTh,
            bodyNameSnapshot: g.bodyId ? (bodyMap.get(g.bodyId) ?? 'รอจัดสรรบอดี้') : 'รอจัดสรรบอดี้',
            districtSnapshot: g.district,
            groupStatusSnapshot: g.status,
            targetAttendanceSnapshot: g.targetAttendance,
            expectedReport: true,
            primaryGroupLeaderUserId: primaryLeader?.userId ?? null,
            supervisorUserIdsJson: supervisors,
          };
        })
      );
    }

    return created!;
  });
}

function maskDraftReportForViewer(
  report: typeof weeklyReports.$inferSelect,
  actor: ActorContext
) {
  if (report.status === 'draft' && !isGroupLeaderForGroup(actor, report.groupId)) {
    // FR-07.5: Draft reports MUST NOT expose numbers/notes/details outside Group Leaders!
    return {
      id: report.id,
      periodId: report.periodId,
      groupId: report.groupId,
      bodyId: report.bodyId,
      status: 'not_submitted' as const,
      isDraftHidden: true,
      meetingHeld: null,
      notHeldReason: null,
      meetingDate: null,
      totalAttendees: 0,
      memberAttendees: 0,
      newVisitorsCount: 0,
      returningVisitorsCount: 0,
      childrenCount: 0,
      offeringAmountThb: '0.00',
      summaryNotes: null,
      prayerRequests: null,
      careNeedsNotes: null,
      isLate: false,
      isBlocked: false,
      blockedReason: null,
      requiresSupervisorReview: report.requiresSupervisorReview,
      submittedAt: null,
      supervisorReviewedAt: null,
      approvedAt: null,
      revisionReason: null,
      version: report.version,
    };
  }
  return {
    ...report,
    isDraftHidden: false,
  };
}

export async function listReportsForPeriod(
  db: FaithMapDb,
  actor: ActorContext,
  periodId?: string
) {
  let targetPeriodId = periodId;
  if (!targetPeriodId) {
    const [open] = await db
      .select()
      .from(reportingPeriods)
      .orderBy(desc(reportingPeriods.startDate))
      .limit(1);
    targetPeriodId = open?.id;
  }
  if (!targetPeriodId) return [];

  const rows = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.periodId, targetPeriodId))
    .orderBy(desc(weeklyReports.updatedAt));

  const groups = await db.select().from(houseMissionGroups);
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const allBodies = await db.select().from(bodies);
  const bodyMap = new Map(allBodies.map((b) => [b.id, b]));
  const allUsers = await db.select({ id: users.id, displayName: users.displayName }).from(users);
  const userMap = new Map(allUsers.map((u) => [u.id, u.displayName]));

  return rows
    .filter((r) => canAccessGroup(actor, r.groupId, r.bodyId))
    .map((r) => {
      const masked = maskDraftReportForViewer(r, actor);
      const grp = groupMap.get(r.groupId);
      const body = r.bodyId ? bodyMap.get(r.bodyId) : undefined;
      return {
        ...masked,
        groupName: grp?.nameTh ?? '-',
        groupCode: grp?.groupCode ?? '',
        district: grp?.district ?? '',
        bodyName: body?.nameTh ?? 'รอจัดสรรบอดี้',
        submittedByName:
          masked.isDraftHidden || !r.submittedByUserId
            ? null
            : userMap.get(r.submittedByUserId) ?? null,
        supervisorReviewedByName:
          masked.isDraftHidden || !r.supervisorReviewedByUserId
            ? null
            : userMap.get(r.supervisorReviewedByUserId) ?? null,
        approvedByName:
          masked.isDraftHidden || !r.approvedByUserId
            ? null
            : userMap.get(r.approvedByUserId) ?? null,
      };
    });
}

export async function getReportDetailForGroup(
  db: FaithMapDb,
  actor: ActorContext,
  periodId: string,
  groupId: string
) {
  const [grp] = await db
    .select()
    .from(houseMissionGroups)
    .where(eq(houseMissionGroups.id, groupId));
  if (!grp) {
    throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจบ้าน');
  }
  assertCanAccessGroup(actor, grp.id, grp.bodyId);

  const [report] = await db
    .select()
    .from(weeklyReports)
    .where(and(eq(weeklyReports.periodId, periodId), eq(weeklyReports.groupId, groupId)));

  if (!report) {
    return null;
  }

  const masked = maskDraftReportForViewer(report, actor);
  const attRows = masked.isDraftHidden
    ? []
    : await db
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.weeklyReportId, report.id));

  const auditRows = masked.isDraftHidden
    ? []
    : await db
        .select()
        .from(reportAuditEvents)
        .where(eq(reportAuditEvents.weeklyReportId, report.id))
        .orderBy(desc(reportAuditEvents.createdAt));

  // DEC-06: absence notes are restricted. Only direct stewards, the Body Leader and admins read them.
  // A pastor (mission_leader) can read the report but not these notes.
  const canReadAbsenceNotes = canViewUnmaskedGroupPii(actor, grp.id, grp.bodyId);
  const visibleAttendance = canReadAbsenceNotes ? attRows : attRows.map((r) => ({ ...r, notes: null }));

  return {
    report: masked,
    attendanceRecords: visibleAttendance,
    auditEvents: auditRows,
  };
}

export interface ReportPayloadInput {
  meetingHeld: boolean;
  notHeldReason?: string | null;
  meetingDate?: string | null;
  totalAttendees: number;
  memberAttendees: number;
  newVisitorsCount: number;
  returningVisitorsCount: number;
  childrenCount: number;
  offeringAmountThb?: string | number;
  summaryNotes?: string | null;
  prayerRequests?: string | null;
  careNeedsNotes?: string | null;
  attendance?: Array<{ memberId: string; attendanceStatus: 'present' | 'absent' | 'excused' }>;
  expectedVersion?: number;
}

/**
 * Saves a change to a report only if nobody changed it since it was read (same version, allowed status).
 * Without this, two people deciding at the same time could overwrite each other.
 */
export async function updateReportIfCurrent(
  db: FaithMapDb,
  report: typeof weeklyReports.$inferSelect,
  set: Partial<typeof weeklyReports.$inferInsert>,
  allowedStatuses?: string[]
): Promise<typeof weeklyReports.$inferSelect> {
  const conditions = [eq(weeklyReports.id, report.id), eq(weeklyReports.version, report.version)];
  if (allowedStatuses) conditions.push(inArray(weeklyReports.status, allowedStatuses));
  const [row] = await db
    .update(weeklyReports)
    .set({ ...set, version: report.version + 1, updatedAt: new Date() })
    .where(and(...conditions))
    .returning();
  if (!row) {
    throw new AppError(
      409,
      'VERSION_CONFLICT',
      'รายงานถูกเปลี่ยนโดยคำขออื่นแล้ว กรุณาโหลดข้อมูลล่าสุดแล้วลองใหม่'
    );
  }
  return row;
}

async function insertReportOnce(
  db: FaithMapDb,
  values: typeof weeklyReports.$inferInsert
): Promise<typeof weeklyReports.$inferSelect> {
  try {
    const [row] = await db.insert(weeklyReports).values(values).returning();
    return row!;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'VERSION_CONFLICT', 'มีการสร้างรายงานของกลุ่มนี้ในรอบนี้พร้อมกัน กรุณาโหลดข้อมูลล่าสุด');
    }
    throw err;
  }
}

/** A period takes reports from its first day (Bangkok date) until it is closed. Late reports stay allowed. */
function assertPeriodAcceptsReports(
  period: { startDate: string; status: string },
  now: Date
): void {
  if (period.status === 'closed' || getBangkokParts(now).isoDate < period.startDate) {
    throw new AppError(
      409,
      'PERIOD_NOT_ACCEPTING',
      'รอบรายงานนี้ยังไม่เปิดหรือปิดรับรายงานแล้ว'
    );
  }
}

/** Attendance can only name members who belong to the group, once each. */
async function assertAttendanceBelongsToGroup(
  db: FaithMapDb,
  groupId: string,
  attendance: ReportPayloadInput['attendance']
): Promise<void> {
  if (!attendance || attendance.length === 0) return;
  const ids = attendance.map((a) => a.memberId);
  if (new Set(ids).size !== ids.length) {
    throw new AppError(400, 'ATTENDANCE_DUPLICATE_MEMBER', 'มีสมาชิกซ้ำในรายชื่อผู้เข้าร่วม');
  }
  const rows = await db
    .select({ memberId: groupMemberships.memberId })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.groupId, groupId),
        eq(groupMemberships.isActive, true),
        inArray(groupMemberships.memberId, ids)
      )
    );
  if (rows.length !== ids.length) {
    throw new AppError(400, 'MEMBER_NOT_IN_GROUP', 'รายชื่อผู้เข้าร่วมมีสมาชิกที่ไม่ได้อยู่ในกลุ่มนี้');
  }
}

function normalizeCounts(input: ReportPayloadInput) {
  if (!input.meetingHeld) {
    return {
      totalAttendees: 0,
      memberAttendees: 0,
      newVisitorsCount: 0,
      returningVisitorsCount: 0,
      childrenCount: 0,
      offeringAmountThb: '0.00',
    };
  }
  return {
    totalAttendees: Math.max(0, input.totalAttendees),
    memberAttendees: Math.max(0, input.memberAttendees),
    newVisitorsCount: Math.max(0, input.newVisitorsCount),
    returningVisitorsCount: Math.max(0, input.returningVisitorsCount),
    childrenCount: Math.max(0, input.childrenCount),
    offeringAmountThb: Number(input.offeringAmountThb ?? 0).toFixed(2),
  };
}

export async function saveDraftReport(
  db: FaithMapDb,
  actor: ActorContext,
  periodId: string,
  groupId: string,
  input: ReportPayloadInput,
  now: Date = new Date()
) {
  if (!isGroupLeaderForGroup(actor, groupId)) {
    throw new AppError(
      403,
      'GROUP_LEADER_REQUIRED',
      'เฉพาะหัวหน้ากลุ่มพันธกิจที่ได้รับมอบหมายเท่านั้นที่บันทึกฉบับร่างได้'
    );
  }

  const [draftPeriod] = await db.select().from(reportingPeriods).where(eq(reportingPeriods.id, periodId));
  if (!draftPeriod) throw new AppError(404, 'PERIOD_NOT_FOUND', 'ไม่พบรอบรายงานที่ระบุ');
  assertPeriodAcceptsReports(draftPeriod, now);
  await assertAttendanceBelongsToGroup(db, groupId, input.attendance);

  const [grp] = await db
    .select()
    .from(houseMissionGroups)
    .where(eq(houseMissionGroups.id, groupId));
  if (!grp) throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจบ้าน');

  const [existing] = await db
    .select()
    .from(weeklyReports)
    .where(and(eq(weeklyReports.periodId, periodId), eq(weeklyReports.groupId, groupId)));

  if (
    existing &&
    !['draft', 'needs_revision'].includes(existing.status)
  ) {
    throw new AppError(
      409,
      'INVALID_STATE_TRANSITION',
      `ไม่สามารถบันทึกฉบับร่างได้เนื่องจากรายงานอยู่ในสถานะ ${existing.status}`
    );
  }

  if (
    existing &&
    input.expectedVersion !== undefined &&
    existing.version !== input.expectedVersion
  ) {
    throw new AppError(
      409,
      'VERSION_CONFLICT',
      'ข้อมูลรายงานถูกอัปเดตโดยคำขออื่นแล้ว กรุณาโหลดข้อมูลล่าสุด'
    );
  }

  const counts = normalizeCounts(input);
  const supCheck = await evaluateRequiresSupervisorReview(db, groupId);

  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    let saved: typeof weeklyReports.$inferSelect;

    if (!existing) {
      const [snapshot] = await tdb
        .select()
        .from(periodGroupSnapshots)
        .where(
          and(
            eq(periodGroupSnapshots.periodId, periodId),
            eq(periodGroupSnapshots.groupId, groupId)
          )
        );

      saved = await insertReportOnce(tdb, {
          periodId,
          snapshotId: snapshot?.id ?? null,
          groupId,
          bodyId: grp.bodyId,
          status: 'draft',
          meetingHeld: input.meetingHeld,
          notHeldReason: input.meetingHeld ? null : input.notHeldReason?.trim() || null,
          meetingDate: input.meetingDate || null,
          ...counts,
          summaryNotes: input.summaryNotes ?? null,
          prayerRequests: input.prayerRequests ?? null,
          careNeedsNotes: input.careNeedsNotes ?? null,
          requiresSupervisorReview: supCheck.required,
          submittedByUserId: actor.user.id,
          version: 1,
        });
    } else {
      const updated = await updateReportIfCurrent(tdb, existing, {
          meetingHeld: input.meetingHeld,
          notHeldReason: input.meetingHeld ? null : input.notHeldReason?.trim() || null,
          meetingDate: input.meetingDate || null,
          ...counts,
          summaryNotes: input.summaryNotes ?? null,
          prayerRequests: input.prayerRequests ?? null,
          careNeedsNotes: input.careNeedsNotes ?? null,
          requiresSupervisorReview: supCheck.required,
        }, ['draft', 'needs_revision']);
      saved = updated!;
    }

    if (input.attendance) {
      await tdb.delete(attendanceRecords).where(eq(attendanceRecords.weeklyReportId, saved.id));
      if (input.attendance.length > 0) {
        await tdb.insert(attendanceRecords).values(
          input.attendance.map((a) => ({
            weeklyReportId: saved.id,
            memberId: a.memberId,
            attendanceStatus: a.attendanceStatus,
          }))
        );
      }
    }

    return saved;
  });
}

export async function submitReport(
  db: FaithMapDb,
  actor: ActorContext,
  periodId: string,
  groupId: string,
  input: ReportPayloadInput,
  now: Date = new Date()
) {
  if (!isGroupLeaderForGroup(actor, groupId)) {
    throw new AppError(
      403,
      'GROUP_LEADER_REQUIRED',
      'เฉพาะหัวหน้ากลุ่มพันธกิจที่ได้รับมอบหมายเท่านั้นที่ส่งรายงานได้'
    );
  }

  if (!input.meetingHeld && (!input.notHeldReason || !input.notHeldReason.trim())) {
    throw new AppError(
      400,
      'NOT_HELD_REASON_REQUIRED',
      'กรุณาระบุเหตุผลเมื่อกลุ่มไม่ได้พบปะในสัปดาห์นี้'
    );
  }

  const [period] = await db
    .select()
    .from(reportingPeriods)
    .where(eq(reportingPeriods.id, periodId));
  if (!period) throw new AppError(404, 'PERIOD_NOT_FOUND', 'ไม่พบรอบรายงานที่ระบุ');
  assertPeriodAcceptsReports(period, now);
  await assertAttendanceBelongsToGroup(db, groupId, input.attendance);

  const [grp] = await db
    .select()
    .from(houseMissionGroups)
    .where(eq(houseMissionGroups.id, groupId));
  if (!grp) throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจบ้าน');

  const [existing] = await db
    .select()
    .from(weeklyReports)
    .where(and(eq(weeklyReports.periodId, periodId), eq(weeklyReports.groupId, groupId)));

  if (existing && !['draft', 'needs_revision'].includes(existing.status)) {
    throw new AppError(
      409,
      'INVALID_STATE_TRANSITION',
      `รายงานนี้อยู่ในสถานะ ${existing.status} แล้ว`
    );
  }

  if (
    existing &&
    input.expectedVersion !== undefined &&
    existing.version !== input.expectedVersion
  ) {
    throw new AppError(409, 'VERSION_CONFLICT', 'รายงานมีการแก้ไขซ้อน กรุณาโหลดข้อมูลล่าสุด');
  }

  const counts = normalizeCounts(input);
  const late = isPastDeadline(now, period.deadlineAt);
  const supCheck = await evaluateRequiresSupervisorReview(db, groupId);
  const readiness = await evaluateBodyApprovalReadiness(db, grp.bodyId, actor.user.id);
  const blocked = !readiness.ready;

  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    let saved: typeof weeklyReports.$inferSelect;
    const prevStatus = existing?.status ?? 'not_submitted';

    if (!existing) {
      const [snapshot] = await tdb
        .select()
        .from(periodGroupSnapshots)
        .where(
          and(
            eq(periodGroupSnapshots.periodId, periodId),
            eq(periodGroupSnapshots.groupId, groupId)
          )
        );
      saved = await insertReportOnce(tdb, {
          periodId,
          snapshotId: snapshot?.id ?? null,
          groupId,
          bodyId: grp.bodyId,
          status: 'submitted',
          meetingHeld: input.meetingHeld,
          notHeldReason: input.meetingHeld ? null : input.notHeldReason!.trim(),
          meetingDate: input.meetingDate || period.startDate,
          ...counts,
          summaryNotes: input.summaryNotes ?? null,
          prayerRequests: input.prayerRequests ?? null,
          careNeedsNotes: input.careNeedsNotes ?? null,
          isLate: late,
          isBlocked: blocked,
          blockedReason: readiness.reasonIfNotReady,
          blockedAt: blocked ? now : null,
          requiresSupervisorReview: supCheck.required,
          submittedByUserId: actor.user.id,
          submittedAt: now,
          version: 1,
        });
    } else {
      const updated = await updateReportIfCurrent(tdb, existing, {
          status: 'submitted',
          meetingHeld: input.meetingHeld,
          notHeldReason: input.meetingHeld ? null : input.notHeldReason!.trim(),
          meetingDate: input.meetingDate || period.startDate,
          ...counts,
          summaryNotes: input.summaryNotes ?? null,
          prayerRequests: input.prayerRequests ?? null,
          careNeedsNotes: input.careNeedsNotes ?? null,
          isLate: late,
          isBlocked: blocked,
          blockedReason: readiness.reasonIfNotReady,
          blockedAt: blocked ? now : null,
          requiresSupervisorReview: supCheck.required,
          submittedByUserId: actor.user.id,
          submittedAt: now,
          supervisorReviewedByUserId: null,
          supervisorReviewedAt: null,
          supervisorNotes: null,
          approvedByUserId: null,
          approvedAt: null,
        }, ['draft', 'needs_revision']);
      saved = updated!;
    }

    if (input.attendance) {
      await tdb.delete(attendanceRecords).where(eq(attendanceRecords.weeklyReportId, saved.id));
      if (input.attendance.length > 0) {
        await tdb.insert(attendanceRecords).values(
          input.attendance.map((a) => ({
            weeklyReportId: saved.id,
            memberId: a.memberId,
            attendanceStatus: a.attendanceStatus,
          }))
        );
      }
    }

    await recordReportAudit(tdb, {
      weeklyReportId: saved.id,
      periodId,
      groupId,
      eventType: blocked ? 'workflow_blocked' : 'report_submitted',
      fromStatus: prevStatus,
      toStatus: 'submitted',
      actorUserId: actor.user.id,
      actorRole: 'group_leader',
      reason: blocked ? readiness.reasonIfNotReady : null,
      metadata: {
        isLate: late,
        requiresSupervisorReview: supCheck.required,
        fastTrackFallback: !supCheck.required,
      },
    });

    if (blocked) {
      const adminUsers = await tdb
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.systemRole, ['admin', 'super_admin']), eq(users.status, 'active')));
      for (const admin of adminUsers) {
        await dispatchNotification(tdb, {
          userId: admin.id,
          category: 'workflow_blocked',
          title: `รายงานติดขัด (Blocked): ${grp.nameTh}`,
          body: `ไม่สามารถส่งต่ออนุมัติได้ (${readiness.reasonIfNotReady}) กรุณาตรวจสอบผู้นำบอดี้และปลดล็อก`,
          relatedEntityType: 'weekly_report',
          relatedEntityId: saved.id,
          dedupeKey: `blocked:${saved.id}:v${saved.version}`,
          sendLine: true,
        });
      }
    } else if (supCheck.required) {
      for (const supId of supCheck.supervisorUserIds) {
        await dispatchNotification(tdb, {
          userId: supId,
          category: 'review_pending',
          title: `รายงานรอตรวจทาน: ${grp.nameTh}`,
          body: `${actor.user.displayName} ส่งรายงานสัปดาห์ ${period.periodKey} แล้ว กรุณาตรวจทาน`,
          relatedEntityType: 'weekly_report',
          relatedEntityId: saved.id,
          dedupeKey: `review:${saved.id}:v${saved.version}`,
          sendLine: true,
        });
      }
    } else {
      for (const blId of readiness.eligibleApproverUserIds) {
        await dispatchNotification(tdb, {
          userId: blId,
          category: 'approval_pending',
          title: `รายงานส่งตรงรออนุมัติ: ${grp.nameTh}`,
          body: `กลุ่มนี้ไม่มีผู้ตรวจทานระดับแคร์ (CD-03) จึงส่งตรงถึงหัวหน้าบอดี้อนุมัติ`,
          relatedEntityType: 'weekly_report',
          relatedEntityId: saved.id,
          dedupeKey: `approve:${saved.id}:v${saved.version}`,
          sendLine: true,
        });
      }
    }

    return saved;
  });
}

export async function reviewReportBySupervisor(
  db: FaithMapDb,
  actor: ActorContext,
  reportId: string,
  action: 'forward' | 'request_revision',
  notesOrReason: string | null | undefined,
  expectedVersion?: number
) {
  const [report] = await db.select().from(weeklyReports).where(eq(weeklyReports.id, reportId));
  if (!report) throw new AppError(404, 'REPORT_NOT_FOUND', 'ไม่พบรายงานที่ระบุ');

  if (!isSupervisorForGroup(actor, report.groupId)) {
    throw new AppError(
      403,
      'SUPERVISOR_REQUIRED',
      'เฉพาะหัวหน้าแคร์หรือผู้ประสานงานของกลุ่มนี้เท่านั้นที่ตรวจทานรายงานได้'
    );
  }
  if (report.submittedByUserId === actor.user.id) {
    throw new AppError(
      403,
      'SELF_APPROVAL_FORBIDDEN',
      'ไม่อนุญาตให้ผู้ส่งรายงานตรวจทานรายงานของตนเอง (DEC-05)'
    );
  }
  if (report.isBlocked) {
    throw new AppError(
      409,
      'REPORT_WORKFLOW_BLOCKED',
      `รายงานนี้อยู่ในสถานะ Blocked (${report.blockedReason}) ต้องรอผู้ดูแลระบบปลดล็อกก่อน (CD-07)`
    );
  }
  if (expectedVersion !== undefined && report.version !== expectedVersion) {
    throw new AppError(409, 'VERSION_CONFLICT', 'เวอร์ชันรายงานมีการเปลี่ยนแปลงแล้ว');
  }
  if (!['submitted', 'under_review'].includes(report.status)) {
    throw new AppError(409, 'INVALID_STATE_TRANSITION', `ไม่สามารถตรวจทานรายงานสถานะ ${report.status} ได้`);
  }

  const now = new Date();
  const [grp] = await db
    .select()
    .from(houseMissionGroups)
    .where(eq(houseMissionGroups.id, report.groupId));

  if (action === 'request_revision') {
    const reason = notesOrReason?.trim() ?? '';
    if (!reason) {
      throw new AppError(400, 'REVISION_REASON_REQUIRED', 'กรุณาระบุเหตุผลในการส่งกลับขอแก้ไข');
    }
    const updated = await updateReportIfCurrent(db, report, {
        status: 'needs_revision',
        revisionRequestedByUserId: actor.user.id,
        revisionRequestedAt: now,
        revisionReason: reason,
      }, ['submitted', 'under_review']);

    await recordReportAudit(db, {
      weeklyReportId: report.id,
      periodId: report.periodId,
      groupId: report.groupId,
      eventType: 'revision_requested',
      fromStatus: report.status,
      toStatus: 'needs_revision',
      actorUserId: actor.user.id,
      actorRole: 'supervisor',
      reason,
    });

    if (report.submittedByUserId) {
      await dispatchNotification(db, {
        userId: report.submittedByUserId,
        category: 'needs_revision',
        title: `รายงานถูกส่งกลับแก้ไข: ${grp?.nameTh ?? ''}`,
        body: `${actor.user.displayName}: ${reason}`,
        relatedEntityType: 'weekly_report',
        relatedEntityId: report.id,
        dedupeKey: `rev:${report.id}:v${updated!.version}`,
        sendLine: true,
      });
    }
    return updated!;
  }

  const updated = await updateReportIfCurrent(db, report, {
      status: 'under_review',
      supervisorReviewedByUserId: actor.user.id,
      supervisorReviewedAt: now,
      supervisorNotes: notesOrReason?.trim() || 'ตรวจทานเรียบร้อย',
    }, ['submitted', 'under_review']);

  await recordReportAudit(db, {
    weeklyReportId: report.id,
    periodId: report.periodId,
    groupId: report.groupId,
    eventType: 'supervisor_reviewed',
    fromStatus: report.status,
    toStatus: 'under_review',
    actorUserId: actor.user.id,
    actorRole: 'supervisor',
    metadata: { supervisorNotes: updated!.supervisorNotes },
  });

  const readiness = await evaluateBodyApprovalReadiness(db, report.bodyId, report.submittedByUserId);
  for (const blId of readiness.eligibleApproverUserIds) {
    await dispatchNotification(db, {
      userId: blId,
      category: 'approval_pending',
      title: `ผ่านการตรวจทานแล้ว รออนุมัติ: ${grp?.nameTh ?? ''}`,
      body: `${actor.user.displayName} ตรวจทานแล้ว พร้อมให้หัวหน้าบอดี้อนุมัติ`,
      relatedEntityType: 'weekly_report',
      relatedEntityId: report.id,
      dedupeKey: `sup_ok:${report.id}:v${updated!.version}`,
      sendLine: true,
    });
  }

  return updated!;
}

export async function approveReportByBodyLeader(
  db: FaithMapDb,
  actor: ActorContext,
  reportId: string,
  action: 'approve' | 'request_revision',
  notesOrReason: string | null | undefined,
  expectedVersion?: number
) {
  const [report] = await db.select().from(weeklyReports).where(eq(weeklyReports.id, reportId));
  if (!report) throw new AppError(404, 'REPORT_NOT_FOUND', 'ไม่พบรายงานที่ระบุ');

  if (!isBodyLeaderForBody(actor, report.bodyId)) {
    throw new AppError(
      403,
      'BODY_LEADER_REQUIRED',
      'เฉพาะหัวหน้าบอดี้ที่ดูแลกลุ่มนี้เท่านั้นที่สามารถอนุมัติรายงานได้'
    );
  }

  // DEC-05: Strict non-self-approval guard
  if (report.submittedByUserId === actor.user.id) {
    throw new AppError(
      403,
      'SELF_APPROVAL_FORBIDDEN',
      'ห้ามผู้นำที่ส่งรายงานกดอนุมัติรายงานของตนเอง (DEC-05)'
    );
  }

  // CD-07: Strict blocked report guard
  if (report.isBlocked) {
    throw new AppError(
      409,
      'REPORT_WORKFLOW_BLOCKED',
      `รายงานนี้อยู่ในสถานะ Blocked (${report.blockedReason}) กรุณาให้ผู้ดูแลระบบปลดล็อกก่อน (CD-07)`
    );
  }

  if (expectedVersion !== undefined && report.version !== expectedVersion) {
    throw new AppError(409, 'VERSION_CONFLICT', 'เวอร์ชันรายงานมีการเปลี่ยนแปลงแล้ว');
  }

  if (!['submitted', 'under_review'].includes(report.status)) {
    throw new AppError(409, 'INVALID_STATE_TRANSITION', `ไม่สามารถอนุมัติรายงานในสถานะ ${report.status}`);
  }

  const now = new Date();
  const [grp] = await db
    .select()
    .from(houseMissionGroups)
    .where(eq(houseMissionGroups.id, report.groupId));

  if (action === 'request_revision') {
    const reason = notesOrReason?.trim() ?? '';
    if (!reason) {
      throw new AppError(400, 'REVISION_REASON_REQUIRED', 'กรุณาระบุเหตุผลในการส่งกลับขอแก้ไข');
    }
    const updated = await updateReportIfCurrent(db, report, {
        status: 'needs_revision',
        revisionRequestedByUserId: actor.user.id,
        revisionRequestedAt: now,
        revisionReason: reason,
      }, ['submitted', 'under_review']);

    await recordReportAudit(db, {
      weeklyReportId: report.id,
      periodId: report.periodId,
      groupId: report.groupId,
      eventType: 'revision_requested_by_body_leader',
      fromStatus: report.status,
      toStatus: 'needs_revision',
      actorUserId: actor.user.id,
      actorRole: 'body_leader',
      reason,
    });

    if (report.submittedByUserId) {
      await dispatchNotification(db, {
        userId: report.submittedByUserId,
        category: 'needs_revision',
        title: `หัวหน้าบอดี้ส่งกลับขอแก้ไข: ${grp?.nameTh ?? ''}`,
        body: reason,
        relatedEntityType: 'weekly_report',
        relatedEntityId: report.id,
        dedupeKey: `bl_rev:${report.id}:v${updated!.version}`,
        sendLine: true,
      });
    }
    return updated!;
  }

  // DEC-04: Sequential Supervisor Review Enforcement before Approval
  if (report.requiresSupervisorReview && !report.supervisorReviewedAt) {
    throw new AppError(
      409,
      'WORKFLOW_SUPERVISOR_REVIEW_REQUIRED',
      'รายงานนี้ต้องผ่านการตรวจทานจากหัวหน้าแคร์หรือผู้ประสานงานก่อนจึงจะอนุมัติได้ (DEC-04)'
    );
  }

  const updated = await updateReportIfCurrent(db, report, {
      status: 'approved',
      approvedByUserId: actor.user.id,
      approvedAt: now,
    }, ['submitted', 'under_review']);

  await recordReportAudit(db, {
    weeklyReportId: report.id,
    periodId: report.periodId,
    groupId: report.groupId,
    eventType: 'report_approved',
    fromStatus: report.status,
    toStatus: 'approved',
    actorUserId: actor.user.id,
    actorRole: 'body_leader',
    metadata: { supervisorReviewed: Boolean(report.supervisorReviewedAt) },
  });

  if (report.submittedByUserId) {
    await dispatchNotification(db, {
      userId: report.submittedByUserId,
      category: 'report_approved',
      title: `รายงานได้รับการอนุมัติแล้ว: ${grp?.nameTh ?? ''}`,
      body: `${actor.user.displayName} อนุมัติรายงานประจำสัปดาห์เรียบร้อย`,
      relatedEntityType: 'weekly_report',
      relatedEntityId: report.id,
      dedupeKey: `approved:${report.id}`,
      sendLine: true,
    });
  }

  return updated!;
}

export async function unblockReportByAdmin(
  db: FaithMapDb,
  actor: ActorContext,
  reportId: string,
  notes?: string | null
) {
  if (!isAdmin(actor)) {
    throw new AppError(403, 'ADMIN_REQUIRED', 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถปลดล็อกรายงาน Blocked ได้');
  }

  const [report] = await db.select().from(weeklyReports).where(eq(weeklyReports.id, reportId));
  if (!report) throw new AppError(404, 'REPORT_NOT_FOUND', 'ไม่พบรายงานที่ระบุ');
  if (!report.isBlocked) {
    throw new AppError(400, 'REPORT_NOT_BLOCKED', 'รายงานนี้ไม่ได้อยู่ในสถานะ Blocked');
  }

  const readiness = await evaluateBodyApprovalReadiness(db, report.bodyId, report.submittedByUserId);
  if (!readiness.ready) {
    throw new AppError(
      409,
      'REPORT_WORKFLOW_BLOCKED',
      `ยังไม่สามารถปลดล็อกได้ (${readiness.reasonIfNotReady}) กรุณามอบหมาย Body Leader ที่บัญชี active และไม่ใช่ผู้ส่งรายงานให้กับบอดี้ก่อน`
    );
  }

  const now = new Date();
  const updated = await updateReportIfCurrent(db, report, {
      isBlocked: false,
      blockedReason: null,
      blockedAt: null,
    });

  await recordReportAudit(db, {
    weeklyReportId: report.id,
    periodId: report.periodId,
    groupId: report.groupId,
    eventType: 'workflow_unblocked',
    fromStatus: report.status,
    toStatus: report.status,
    actorUserId: actor.user.id,
    actorRole: actor.user.systemRole,
    reason: notes?.trim() || 'Admin verified eligible Body Leader and unblocked workflow',
  });

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'report_unblocked',
    targetType: 'weekly_report',
    targetId: report.id,
    reason: notes?.trim() || 'Resolved blocked workflow',
  });

  const [grp] = await db
    .select()
    .from(houseMissionGroups)
    .where(eq(houseMissionGroups.id, report.groupId));

  for (const blId of readiness.eligibleApproverUserIds) {
    await dispatchNotification(db, {
      userId: blId,
      category: 'approval_pending',
      title: `ปลดล็อกรายงานแล้ว รออนุมัติ: ${grp?.nameTh ?? ''}`,
      body: `ผู้ดูแลระบบปลดล็อกรายงานเรียบร้อย สามารถเข้าตรวจและอนุมัติได้ทันที`,
      relatedEntityType: 'weekly_report',
      relatedEntityId: report.id,
      dedupeKey: `unblocked:${report.id}:v${updated!.version}`,
      sendLine: true,
    });
  }

  return updated!;
}
