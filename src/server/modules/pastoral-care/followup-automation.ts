import { and, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import {
  assignments,
  attendanceRecords,
  followUpItems,
  houseMissionGroups,
  reportingPeriods,
  users,
  visitorVisits,
  visitors,
  weeklyReports,
} from '@/server/db/schema';
import { isUniqueViolation } from '../errors';
import { isUsableAccount } from '../identity/service';
import { dispatchNotification } from '../notifications/service';

/**
 * Automatic follow-up items (PRD FR-06.4, FR-05.4, FR-09.2).
 *
 * Interpretation recorded in `FAITHMAP_DECISION_REGISTER.md` (DEC-20, pending owner confirmation as Q-11):
 * - A week counts as "absent" only when the group sent a submitted report for that period, the meeting was held,
 *   and the member is marked `absent`. A week without a report, or without a meeting, is "unknown" (FR-06.3).
 *   It breaks the streak. It does not extend it. This creates fewer items, never more.
 * - A streak needs consecutive reporting periods. A missing period row breaks it.
 * - 2 weeks in a row: one item for the Group Leader (falls back to a Supervisor, then to a Body Leader).
 * - 3 or more weeks in a row: one more item with high priority for the Supervisor (falls back to a Body Leader).
 * - A first-time visitor that has no visit in the next period gets one item, only if the group held a meeting in that period.
 *
 * Each item carries a dedup key. The same cause never creates a second item, even after the first item is completed.
 * Titles are neutral and name no person. The link to the member or visitor sits in the row (DEC-06).
 */

type Db = FaithMapDb;

async function usableUserIds(db: Db, ids: Array<string | null>): Promise<string[]> {
  const clean = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (clean.length === 0) return [];
  const rows = await db.select().from(users).where(inArray(users.id, clean));
  const out: string[] = [];
  for (const u of rows) if (await isUsableAccount(db, u)) out.push(u.id);
  return clean.filter((id) => out.includes(id));
}

async function resolveAssignees(db: Db, groupId: string, bodyId: string | null) {
  const rows = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.scopeType, 'group'), eq(assignments.groupId, groupId), isNull(assignments.effectiveTo)));
  const pick = (roles: string[]) =>
    rows
      .filter((a) => roles.includes(a.roleType))
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
      .map((a) => a.userId);
  const bodyLeaders = bodyId
    ? (
        await db
          .select()
          .from(assignments)
          .where(and(eq(assignments.scopeType, 'body'), eq(assignments.bodyId, bodyId), isNull(assignments.effectiveTo)))
      ).map((a) => a.userId)
    : [];
  const leader = await usableUserIds(db, pick(['group_leader']));
  const supervisor = await usableUserIds(db, pick(['care_leader', 'coordinator']));
  const body = await usableUserIds(db, bodyLeaders);
  return {
    forGroupLeader: leader[0] ?? supervisor[0] ?? body[0] ?? null,
    forSupervisor: supervisor[0] ?? body[0] ?? null,
  };
}

async function createOnce(
  db: Db,
  input: {
    groupId: string;
    memberId?: string | null;
    visitorId?: string | null;
    sourceReportId: string;
    sourceType: 'absent_2_weeks' | 'absent_3plus_weeks' | 'visitor_not_returned';
    dedupKey: string;
    priority: 'normal' | 'high';
    title: string;
    assignedToUserId: string | null;
    createdByUserId: string;
  }
): Promise<boolean> {
  // Any status counts: a completed item must not come back for the same streak.
  const [existing] = await db
    .select({ id: followUpItems.id })
    .from(followUpItems)
    .where(eq(followUpItems.sourceDedupKey, input.dedupKey))
    .limit(1);
  if (existing) return false;
  try {
    const [row] = await db
      .insert(followUpItems)
      .values({
        groupId: input.groupId,
        memberId: input.memberId ?? null,
        visitorId: input.visitorId ?? null,
        sourceReportId: input.sourceReportId,
        assignedToUserId: input.assignedToUserId,
        sourceType: input.sourceType,
        sourceDedupKey: input.dedupKey,
        priority: input.priority,
        title: input.title,
        status: 'open',
        createdByUserId: input.createdByUserId,
      })
      .returning();
    if (row && input.assignedToUserId) {
      await dispatchNotification(db, {
        userId: input.assignedToUserId,
        category: 'follow_up_assigned',
        title: 'มีรายการติดตามใหม่',
        body: input.title,
        relatedEntityType: 'follow_up_item',
        relatedEntityId: row.id,
        dedupeKey: `followup:${row.id}`,
        sendLine: true,
      });
    }
    return Boolean(row);
  } catch (err) {
    if (isUniqueViolation(err)) return false; // another request made it first
    throw err;
  }
}

export interface FollowUpAutomationResult {
  absent2: number;
  absent3plus: number;
  visitorNotReturned: number;
}

/**
 * Runs after a report is submitted or resubmitted. Safe to run again: it creates nothing that exists.
 */
export async function runFollowUpAutomationForReport(db: Db, reportId: string): Promise<FollowUpAutomationResult> {
  const result: FollowUpAutomationResult = { absent2: 0, absent3plus: 0, visitorNotReturned: 0 };
  const [report] = await db.select().from(weeklyReports).where(eq(weeklyReports.id, reportId));
  if (!report || report.status === 'draft' || report.meetingHeld !== true || !report.submittedByUserId) return result;
  const [group] = await db.select().from(houseMissionGroups).where(eq(houseMissionGroups.id, report.groupId));
  const [period] = await db.select().from(reportingPeriods).where(eq(reportingPeriods.id, report.periodId));
  if (!group || !period) return result;
  const creator = report.submittedByUserId;

  // Periods up to the current one, newest first. Only these can form a streak that ends now.
  const periods = await db
    .select()
    .from(reportingPeriods)
    .where(lte(reportingPeriods.startDate, period.startDate))
    .orderBy(desc(reportingPeriods.startDate));
  const periodIndex = new Map(periods.map((p, i) => [p.id, i]));

  const groupReports = await db
    .select()
    .from(weeklyReports)
    .where(and(eq(weeklyReports.groupId, group.id), inArray(weeklyReports.periodId, periods.map((p) => p.id))));
  const heldByPeriod = new Map(
    groupReports.filter((r) => r.status !== 'draft' && r.meetingHeld === true).map((r) => [r.periodId, r])
  );

  const assignees = await resolveAssignees(db, group.id, group.bodyId);

  // --- Absence streaks ---
  const marks = await db.select().from(attendanceRecords).where(eq(attendanceRecords.weeklyReportId, report.id));
  const absentNow = marks.filter((m) => m.attendanceStatus === 'absent').map((m) => m.memberId);
  if (absentNow.length > 0) {
    const heldReportIds = [...heldByPeriod.values()].map((r) => r.id);
    const absentRows = await db
      .select()
      .from(attendanceRecords)
      .where(and(inArray(attendanceRecords.weeklyReportId, heldReportIds), eq(attendanceRecords.attendanceStatus, 'absent')));
    const absentByReport = new Map<string, Set<string>>();
    for (const row of absentRows) {
      const set = absentByReport.get(row.weeklyReportId) ?? new Set<string>();
      set.add(row.memberId);
      absentByReport.set(row.weeklyReportId, set);
    }
    for (const memberId of absentNow) {
      let streak = 0;
      let startPeriodKey = period.periodKey;
      for (let i = periodIndex.get(period.id) ?? 0; i < periods.length; i++) {
        const p = periods[i]!;
        const r = heldByPeriod.get(p.id);
        if (!r || !absentByReport.get(r.id)?.has(memberId)) break;
        streak += 1;
        startPeriodKey = p.periodKey;
      }
      if (streak >= 2) {
        const made = await createOnce(db, {
          groupId: group.id,
          memberId,
          sourceReportId: report.id,
          sourceType: 'absent_2_weeks',
          dedupKey: `absent_2_weeks:${memberId}:${group.id}:${startPeriodKey}`,
          priority: 'normal',
          title: 'ติดตามสมาชิกที่ขาดประชุมต่อเนื่อง 2 สัปดาห์',
          assignedToUserId: assignees.forGroupLeader,
          createdByUserId: creator,
        });
        if (made) result.absent2 += 1;
      }
      if (streak >= 3) {
        const made = await createOnce(db, {
          groupId: group.id,
          memberId,
          sourceReportId: report.id,
          sourceType: 'absent_3plus_weeks',
          dedupKey: `absent_3plus_weeks:${memberId}:${group.id}:${startPeriodKey}`,
          priority: 'high',
          title: 'สมาชิกขาดประชุมต่อเนื่อง 3 สัปดาห์ขึ้นไป ขอให้หัวหน้าแคร์หรือผู้ประสานงานดูแล',
          assignedToUserId: assignees.forSupervisor,
          createdByUserId: creator,
        });
        if (made) result.absent3plus += 1;
      }
    }
  }

  // --- First-time visitors who did not return in the next period (this period) ---
  const prev = periods[(periodIndex.get(period.id) ?? 0) + 1];
  if (prev) {
    const firstVisits = await db
      .select()
      .from(visitorVisits)
      .where(and(eq(visitorVisits.periodId, prev.id), eq(visitorVisits.groupId, group.id), eq(visitorVisits.visitType, 'new_visitor')));
    for (const visit of firstVisits) {
      const [back] = await db
        .select({ id: visitorVisits.id })
        .from(visitorVisits)
        .where(and(eq(visitorVisits.visitorId, visit.visitorId), eq(visitorVisits.periodId, period.id)))
        .limit(1);
      if (back) continue;
      const made = await createOnce(db, {
        groupId: group.id,
        visitorId: visit.visitorId,
        sourceReportId: report.id,
        sourceType: 'visitor_not_returned',
        dedupKey: `visitor_not_returned:${visit.visitorId}`,
        priority: 'normal',
        title: 'ผู้เยี่ยมใหม่ยังไม่กลับมาในสัปดาห์ถัดมา',
        assignedToUserId: assignees.forGroupLeader,
        createdByUserId: creator,
      });
      if (made) {
        result.visitorNotReturned += 1;
        await db
          .update(visitors)
          .set({ followupStatus: 'awaiting_followup', updatedAt: new Date() })
          .where(and(eq(visitors.id, visit.visitorId), eq(visitors.followupStatus, 'first_visit')));
      }
    }
  }
  return result;
}
