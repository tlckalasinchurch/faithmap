import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import {
  bodies,
  followUpItems,
  houseMissionGroups,
  meetingBriefs,
  periodGroupSnapshots,
  reportingPeriods,
  visitors,
  weeklyReports,
} from '@/server/db/schema';
import { AppError, isUniqueViolation } from '../errors';
import { recordSecurityAudit } from '../audit/service';
import {
  canAccessGroup,
  canViewUnmaskedGroupPii,
  isAdmin,
  isBodyLeaderForBody,
  isGlobalMetricsReader,
  maskDisplayPiiName,
  maskPhoneNumber,
} from '../authz/policy';
import { dispatchNotification } from '../notifications/service';
import type { ActorContext } from '../identity/service';
import { ensureActiveReportingPeriod } from '../reporting/service';

export interface CanonicalMetrics {
  activeBodies: number;
  activeGroups: number;
  expectedReports: number;
  submittedReports: number;
  missingReports: number;
  heldMeetings: number;
  confirmedNotHeld: number;
  lateReports: number;
  blockedReports: number;
  periodAttendance: number;
  newVisitors: number;
  returningVisitors: number;
  openFollowUps: number;
}

export async function getDashboardOverview(
  db: FaithMapDb,
  actor: ActorContext,
  requestedPeriodId?: string,
  filterBodyId?: string
) {
  await ensureActiveReportingPeriod(db);

  const periods = await db
    .select()
    .from(reportingPeriods)
    .orderBy(desc(reportingPeriods.startDate));
  const selectedPeriod =
    (requestedPeriodId && periods.find((p) => p.id === requestedPeriodId)) ||
    periods.find((p) => p.status === 'open') ||
    periods[0];

  if (!selectedPeriod) {
    throw new AppError(404, 'PERIOD_NOT_FOUND', 'ไม่พบรอบรายงานในระบบ');
  }

  const allBodies = await db.select().from(bodies);
  const allGroups = await db.select().from(houseMissionGroups);
  const snapshots = await db
    .select()
    .from(periodGroupSnapshots)
    .where(eq(periodGroupSnapshots.periodId, selectedPeriod.id));
  const reports = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.periodId, selectedPeriod.id));
  const allFollowUps = await db.select().from(followUpItems);

  const visibleBodies = allBodies.filter((b) => {
    if (filterBodyId && b.id !== filterBodyId) return false;
    if (isGlobalMetricsReader(actor)) return true;
    if (isBodyLeaderForBody(actor, b.id)) return true;
    return allGroups.some((g) => g.bodyId === b.id && actor.assignedGroupIds.has(g.id));
  });
  const visibleBodyIds = new Set(visibleBodies.map((b) => b.id));

  const visibleGroups = allGroups.filter(
    (g) =>
      (g.bodyId ? visibleBodyIds.has(g.bodyId) : !filterBodyId) &&
      canAccessGroup(actor, g.id, g.bodyId)
  );
  const visibleGroupIds = new Set(visibleGroups.map((g) => g.id));

  const scopedSnapshots = snapshots.filter(
    (s) =>
      (s.bodyId ? visibleBodyIds.has(s.bodyId) : !filterBodyId) &&
      canAccessGroup(actor, s.groupId, s.bodyId)
  );
  const scopedReports = reports.filter(
    (r) =>
      (r.bodyId ? visibleBodyIds.has(r.bodyId) : !filterBodyId) &&
      canAccessGroup(actor, r.groupId, r.bodyId)
  );
  const nonDraftReports = scopedReports.filter((r) => r.status !== 'draft');
  const openScopedFollowUps = allFollowUps.filter(
    (f) => visibleGroupIds.has(f.groupId) && (f.status === 'open' || f.status === 'in_progress')
  );

  const expectedCount =
    scopedSnapshots.length > 0
      ? scopedSnapshots.filter((s) => s.expectedReport).length
      : visibleGroups.filter((g) => g.status === 'active').length;

  const submittedCount = nonDraftReports.length;
  const metrics: CanonicalMetrics = {
    activeBodies: visibleBodies.filter((b) => b.status === 'active').length,
    activeGroups: visibleGroups.filter((g) => g.status === 'active').length,
    expectedReports: expectedCount,
    submittedReports: submittedCount,
    missingReports: Math.max(0, expectedCount - submittedCount),
    heldMeetings: nonDraftReports.filter((r) => r.meetingHeld === true).length,
    confirmedNotHeld: nonDraftReports.filter((r) => r.meetingHeld === false).length,
    lateReports: nonDraftReports.filter((r) => r.isLate).length,
    blockedReports: nonDraftReports.filter((r) => r.isBlocked && r.status !== 'approved').length,
    periodAttendance: nonDraftReports
      .filter((r) => r.meetingHeld === true)
      .reduce((sum, r) => sum + r.totalAttendees, 0),
    newVisitors: nonDraftReports
      .filter((r) => r.meetingHeld === true)
      .reduce((sum, r) => sum + r.newVisitorsCount, 0),
    returningVisitors: nonDraftReports
      .filter((r) => r.meetingHeld === true)
      .reduce((sum, r) => sum + r.returningVisitorsCount, 0),
    openFollowUps: openScopedFollowUps.length,
  };

  const bodyBreakdown = visibleBodies.map((b) => {
    const bSnaps = scopedSnapshots.filter((s) => s.bodyId === b.id && s.expectedReport);
    const bReports = nonDraftReports.filter((r) => r.bodyId === b.id);
    return {
      bodyId: b.id,
      bodyCode: b.code,
      bodyName: b.nameTh,
      expectedReports: bSnaps.length,
      submittedReports: bReports.length,
      approvedReports: bReports.filter((r) => r.status === 'approved').length,
      blockedReports: bReports.filter((r) => r.isBlocked).length,
      attendance: bReports
        .filter((r) => r.meetingHeld === true)
        .reduce((sum, r) => sum + r.totalAttendees, 0),
    };
  });

  return {
    selectedPeriod,
    periods,
    metrics,
    bodyBreakdown,
  };
}

/** Only admins may create the brief by hand. Other leaders can read it. */
export function canTriggerBrief(actor: ActorContext): boolean {
  return isAdmin(actor);
}

export async function generateMeetingBriefForPeriod(
  db: FaithMapDb,
  periodId: string,
  options: { actorUserId?: string | null; isCronJob: boolean; now?: Date }
) {
  const [existing] = await db
    .select()
    .from(meetingBriefs)
    .where(eq(meetingBriefs.periodId, periodId));
  if (existing && existing.isImmutable) {
    return existing;
  }

  const [period] = await db
    .select()
    .from(reportingPeriods)
    .where(eq(reportingPeriods.id, periodId));
  if (!period) throw new AppError(404, 'PERIOD_NOT_FOUND', 'ไม่พบรอบรายงาน');

  // DEC-01: the brief is made at the scheduled time (Sunday 20:30 ICT). It is immutable,
  // so an early brief would replace the official one with an incomplete one.
  const asOf = options.now ?? new Date();
  if (asOf.getTime() < period.briefScheduledAt.getTime()) {
    throw new AppError(
      409,
      'BRIEF_TOO_EARLY',
      'ยังไม่ถึงเวลาสร้างสรุปประชุม (วันอาทิตย์ 20:30 น.) ระบบจะสร้างให้อัตโนมัติเมื่อถึงเวลา'
    );
  }

  const allBodies = await db.select().from(bodies);
  const bodyMap = new Map(allBodies.map((b) => [b.id, b]));
  const snapshots = await db
    .select()
    .from(periodGroupSnapshots)
    .where(eq(periodGroupSnapshots.periodId, periodId));
  const reports = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.periodId, periodId));
  const openFollowUps = await db
    .select()
    .from(followUpItems)
    .where(inArray(followUpItems.status, ['open', 'in_progress']));

  const reportByGroup = new Map(reports.map((r) => [r.groupId, r]));
  const nonDraftReports = reports.filter((r) => r.status !== 'draft');
  const expectedSnapshots = snapshots.filter((s) => s.expectedReport);

  const missingGroups = expectedSnapshots
    .filter((s) => {
      const r = reportByGroup.get(s.groupId);
      return !r || r.status === 'draft';
    })
    .map((s) => `${s.groupNameSnapshot} (${s.bodyNameSnapshot})`);

  const lateGroups = nonDraftReports
    .filter((r) => r.isLate)
    .map((r) => {
      const snap = snapshots.find((s) => s.groupId === r.groupId);
      return snap?.groupNameSnapshot ?? r.groupId;
    });

  const blockedItems = nonDraftReports
    .filter((r) => r.isBlocked)
    .map((r) => {
      const snap = snapshots.find((s) => s.groupId === r.groupId);
      return `${snap?.groupNameSnapshot ?? r.groupId}: ${r.blockedReason}`;
    });

  const prayerThemes = nonDraftReports
    .map((r) => r.prayerRequests?.trim())
    .filter((x): x is string => Boolean(x));

  const metrics: CanonicalMetrics = {
    activeBodies: allBodies.filter((b) => b.status === 'active').length,
    activeGroups: expectedSnapshots.length,
    expectedReports: expectedSnapshots.length,
    submittedReports: nonDraftReports.length,
    missingReports: Math.max(0, expectedSnapshots.length - nonDraftReports.length),
    heldMeetings: nonDraftReports.filter((r) => r.meetingHeld === true).length,
    confirmedNotHeld: nonDraftReports.filter((r) => r.meetingHeld === false).length,
    lateReports: lateGroups.length,
    blockedReports: blockedItems.length,
    periodAttendance: nonDraftReports
      .filter((r) => r.meetingHeld === true)
      .reduce((sum, r) => sum + r.totalAttendees, 0),
    newVisitors: nonDraftReports
      .filter((r) => r.meetingHeld === true)
      .reduce((sum, r) => sum + r.newVisitorsCount, 0),
    returningVisitors: nonDraftReports
      .filter((r) => r.meetingHeld === true)
      .reduce((sum, r) => sum + r.returningVisitorsCount, 0),
    openFollowUps: openFollowUps.length,
  };

  const sections = {
    section1Overview: `สรุปประชุมผู้บริหาร FaithMap สัปดาห์ ${period.periodKey} (${period.startDate} – ${period.endDate})`,
    section2SubmissionHealth: {
      expected: metrics.expectedReports,
      submitted: metrics.submittedReports,
      approved: nonDraftReports.filter((r) => r.status === 'approved').length,
      missing: metrics.missingReports,
    },
    section3AttendanceTrend: {
      periodAttendance: metrics.periodAttendance,
      newVisitors: metrics.newVisitors,
      returningVisitors: metrics.returningVisitors,
    },
    section4BodyBreakdown: allBodies.map((b) => {
      const bSnaps = expectedSnapshots.filter((s) => s.bodyId === b.id);
      const bReports = nonDraftReports.filter((r) => r.bodyId === b.id);
      return {
        bodyName: b.nameTh,
        activeGroups: bSnaps.length,
        submitted: bReports.length,
        approved: bReports.filter((r) => r.status === 'approved').length,
        attendance: bReports
          .filter((r) => r.meetingHeld === true)
          .reduce((sum, r) => sum + r.totalAttendees, 0),
      };
    }),
    section5LateAndMissingGroups: [...missingGroups, ...lateGroups.map((g) => `${g} (ส่งล่าช้า)`)],
    section6BlockedAndEscalations: blockedItems,
    section7NewVisitorsSummary: {
      totalNewVisitors: metrics.newVisitors,
      returningVisitors: metrics.returningVisitors,
    },
    section8OpenFollowUps: openFollowUps.slice(0, 10).map((f) => f.title),
    section9PrayerAndCareThemes: prayerThemes.length > 0 ? prayerThemes : ['ไม่มีหัวข้ออธิษฐานเพิ่มเติมในสัปดาห์นี้'],
    section10ActionDecisions: [
      ...(blockedItems.length > 0
        ? [`เร่งแก้ปัญหา Blocked Workflow (${blockedItems.length} กลุ่ม) ในระดับผู้ดูแลระบบ`]
        : []),
      ...(missingGroups.length > 0
        ? [`ติดตามรายงานที่ยังไม่ส่ง ${missingGroups.length} กลุ่ม`]
        : ['ทุกกลุ่มส่งรายงานครบถ้วน']),
    ],
  };

  try {
    return await db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const [brief] = await tdb
      .insert(meetingBriefs)
      .values({
        periodId,
        generatedByJob: options.isCronJob,
        generatedByUserId: options.actorUserId ?? null,
        isImmutable: true,
        sectionsJson: sections,
        metricsJson: metrics as unknown as Record<string, unknown>,
      })
      .returning();

    await tdb
      .update(reportingPeriods)
      .set({ status: 'brief_published', updatedAt: new Date() })
      .where(eq(reportingPeriods.id, periodId));

    void bodyMap;
    return brief!;
    });
  } catch (err) {
    // Two requests at once: the second one gets the brief that the first one made.
    if (isUniqueViolation(err)) {
      const [raced] = await db.select().from(meetingBriefs).where(eq(meetingBriefs.periodId, periodId));
      if (raced) return raced;
    }
    throw err;
  }
}

export async function listMeetingBriefs(db: FaithMapDb, actor: ActorContext) {
  if (!isGlobalMetricsReader(actor) && actor.bodyLeaderBodyIds.size === 0) {
    throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้นำบอดี้ ศิษยาภิบาล หรือผู้ดูแลระบบที่เข้าดูสรุปประชุมได้');
  }
  const rows = await db
    .select()
    .from(meetingBriefs)
    .orderBy(desc(meetingBriefs.generatedAt));
  const periods = await db.select().from(reportingPeriods);
  const periodMap = new Map(periods.map((p) => [p.id, p]));
  return rows.map((b) => ({
    ...b,
    periodKey: periodMap.get(b.periodId)?.periodKey ?? '',
    startDate: periodMap.get(b.periodId)?.startDate ?? '',
    endDate: periodMap.get(b.periodId)?.endDate ?? '',
  }));
}

/**
 * Escapes one CSV cell. A cell that a spreadsheet could read as a formula gets a leading apostrophe,
 * so names typed by users cannot run as formulas (OWASP CSV injection).
 * A phone number or a plain number that starts with + or - stays as it is.
 */
export function csvEscape(val: unknown): string {
  let s = val === null || val === undefined ? '' : String(val);
  const startsLikeFormula = /^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]\d[\d\s().-]*$/.test(s));
  if (startsLikeFormula) s = `'${s}`;
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export async function exportScopedCsvData(
  db: FaithMapDb,
  actor: ActorContext,
  dataset: 'reports' | 'visitors',
  periodId?: string
): Promise<{ filename: string; csv: string }> {
  const allGroups = await db.select().from(houseMissionGroups);
  const groupMap = new Map(allGroups.map((g) => [g.id, g]));
  const allBodies = await db.select().from(bodies);
  const bodyMap = new Map(allBodies.map((b) => [b.id, b]));

  if (dataset === 'reports') {
    let targetPeriodId = periodId;
    if (!targetPeriodId) {
      const [p] = await db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.status, 'open'))
        .limit(1);
      targetPeriodId = p?.id;
    }
    const rows = targetPeriodId
      ? await db.select().from(weeklyReports).where(eq(weeklyReports.periodId, targetPeriodId))
      : [];

    // Exclude draft reports completely from reports export (FR-07.5)
    const scoped = rows.filter(
      (r) => r.status !== 'draft' && canAccessGroup(actor, r.groupId, r.bodyId)
    );

    const header = [
      'GroupCode',
      'GroupName',
      'BodyName',
      'Status',
      'MeetingHeld',
      'TotalAttendees',
      'MemberAttendees',
      'NewVisitors',
      'ReturningVisitors',
      'Late',
      'Blocked',
      'BlockedReason',
    ].join(',');

    const lines = scoped.map((r) => {
      const grp = groupMap.get(r.groupId);
      const body = r.bodyId ? bodyMap.get(r.bodyId) : undefined;
      return [
        grp?.groupCode ?? '',
        grp?.nameTh ?? '',
        body?.nameTh ?? 'รอจัดสรรบอดี้',
        r.status,
        r.meetingHeld,
        r.totalAttendees,
        r.memberAttendees,
        r.newVisitorsCount,
        r.returningVisitorsCount,
        r.isLate,
        r.isBlocked,
        r.blockedReason ?? '',
      ]
        .map(csvEscape)
        .join(',');
    });

    await recordSecurityAudit(db, {
      actorUserId: actor.user.id,
      action: 'csv_export_reports',
      targetType: 'weekly_report',
      targetId: targetPeriodId ?? null,
      metadata: { rowCount: lines.length },
    });

    return {
      filename: `faithmap-reports-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: `\uFEFF${[header, ...lines].join('\r\n')}`,
    };
  }

  const allVisitors = await db.select().from(visitors);
  const scopedVisitors = allVisitors.filter((v) => {
    const grp = v.firstOriginGroupId ? groupMap.get(v.firstOriginGroupId) : undefined;
    return grp ? canAccessGroup(actor, grp.id, grp.bodyId) : isGlobalMetricsReader(actor);
  });

  const header = ['OriginGroup', 'Name', 'Phone', 'ConsentForContact', 'VisitCount'].join(',');
  const lines = scopedVisitors.map((v) => {
    const grp = v.firstOriginGroupId ? groupMap.get(v.firstOriginGroupId) : undefined;
    const unmasked = canViewUnmaskedGroupPii(actor, grp?.id, grp?.bodyId);
    return [
      grp?.nameTh ?? '-',
      maskDisplayPiiName(v.fullName, v.nickname || 'ผู้เยี่ยม', unmasked),
      unmasked ? v.phoneE164 ?? '' : maskPhoneNumber(v.phoneE164) ?? '',
      v.consentForContact,
      v.visitCount,
    ]
      .map(csvEscape)
      .join(',');
  });

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'csv_export_visitors',
    targetType: 'visitor',
    metadata: { rowCount: lines.length, piiMaskedApplied: isGlobalMetricsReader(actor) },
  });

  return {
    filename: `faithmap-visitors-${new Date().toISOString().slice(0, 10)}.csv`,
    csv: `\uFEFF${[header, ...lines].join('\r\n')}`,
  };
}

export async function executeCutoffCheckJob(db: FaithMapDb, now: Date = new Date()) {
  const duePeriods = await db
    .select()
    .from(reportingPeriods)
    .where(and(eq(reportingPeriods.status, 'open'), lte(reportingPeriods.deadlineAt, now)));

  let transitioned = 0;
  let remindersSent = 0;

  for (const period of duePeriods) {
    await db
      .update(reportingPeriods)
      .set({ status: 'cutoff_reached', updatedAt: now })
      .where(eq(reportingPeriods.id, period.id));
    transitioned += 1;

    const snapshots = await db
      .select()
      .from(periodGroupSnapshots)
      .where(eq(periodGroupSnapshots.periodId, period.id));
    const reports = await db
      .select()
      .from(weeklyReports)
      .where(eq(weeklyReports.periodId, period.id));
    const submittedGroupIds = new Set(
      reports.filter((r) => r.status !== 'draft').map((r) => r.groupId)
    );

    for (const snap of snapshots) {
      if (snap.expectedReport && !submittedGroupIds.has(snap.groupId) && snap.primaryGroupLeaderUserId) {
        await dispatchNotification(db, {
          userId: snap.primaryGroupLeaderUserId,
          category: 'cutoff_missing_report',
          title: `เลยกำหนดส่งรายงานสัปดาห์ ${period.periodKey}: ${snap.groupNameSnapshot}`,
          body: 'ครบกำหนดวันอาทิตย์ 20:00 น. แล้ว กรุณาส่งรายงานกลุ่มของคุณโดยเร็ว',
          relatedEntityType: 'reporting_period',
          relatedEntityId: period.id,
          dedupeKey: `cutoff:${period.id}:${snap.groupId}`,
          sendLine: true,
        });
        remindersSent += 1;
      }
    }
  }

  return { checkedAt: now.toISOString(), transitionedPeriods: transitioned, remindersSent };
}
