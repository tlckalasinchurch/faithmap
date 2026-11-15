/**
 * PRD FR-07.2 (report content) with DEC-18 (free text is restricted from the pastor). Scratch PGlite database.
 */
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext } from '@/server/modules/identity/service';
import { assignLeadershipRole, createGroup } from '@/server/modules/organization/service';
import {
  approveReportByBodyLeader,
  ensureActiveReportingPeriod,
  getReportDetailForGroup,
  listReportsForPeriod,
  saveDraftReport,
  submitReport,
  type ReportPayloadInput,
} from '@/server/modules/reporting/service';
import { buildReportPayload, type ReportForm } from '@/lib/mini-report';

async function actorFor(rt: DbRuntime, id: string) {
  const [u] = await rt.db.select().from(schema.users).where(eq(schema.users.id, id));
  return buildActorContext(rt.db, u!);
}

const BASE: ReportPayloadInput = {
  meetingHeld: true,
  totalAttendees: 3,
  memberAttendees: 3,
  newVisitorsCount: 0,
  returningVisitorsCount: 0,
  childrenCount: 0,
};
const CONTENT = {
  teachingTopic: 'เรื่องการให้อภัย',
  scriptureRef: 'มัทธิว 18:21-22',
  activities: { prayer: true, fellowship: true, other: 'ร้องเพลงนมัสการ' },
  locationText: 'MARK-LOC-บ้านเลขที่ 12',
  atmosphereNotes: 'MARK-ATMO-อบอุ่น',
  followupNeedsText: 'MARK-FUP-นาย ก ป่วย',
  nextWeekPlan: 'MARK-PLAN-เยี่ยมบ้าน',
  supportNeededText: 'MARK-SUPPORT-ขอยืมเครื่องเสียง',
};

async function withGroup<T>(fn: (c: { rt: DbRuntime; groupId: string; periodId: string }) => Promise<T>): Promise<T> {
  const rt = await createInMemoryTestRuntime();
  try {
    await ensureSchema(rt);
    await ensureSeeded(rt.db);
    const admin = await actorFor(rt, SEED_IDS.users.admin);
    const group = await createGroup(rt.db, admin, { groupCode: 'RC-1', bodyId: SEED_IDS.bodies.north, nameTh: 'กลุ่มทดสอบเนื้อหารายงาน', district: 'เมือง' });
    await assignLeadershipRole(rt.db, admin, { userId: SEED_IDS.users.standbyLeaderSouth, scopeType: 'group', groupId: group.id, roleType: 'group_leader' });
    const period = await ensureActiveReportingPeriod(rt.db);
    return await fn({ rt, groupId: group.id, periodId: period.id });
  } finally {
    await rt.close();
  }
}

describe('FR-07.2: report content', () => {
  it('a draft stores the content; submit keeps it; a draft is hidden from everyone except the group leader', async () => {
    await withGroup(async ({ rt, groupId, periodId }) => {
      const leader = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      await saveDraftReport(rt.db, leader, periodId, groupId, { ...BASE, ...CONTENT });
      const asLeader = await getReportDetailForGroup(rt.db, leader, periodId, groupId);
      expect(asLeader!.report.teachingTopic).toBe('เรื่องการให้อภัย');
      expect(asLeader!.report.activities).toEqual({ prayer: true, fellowship: true, other: 'ร้องเพลงนมัสการ' });
      const north = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
      const hidden = await getReportDetailForGroup(rt.db, north, periodId, groupId);
      expect(JSON.stringify(hidden)).not.toContain('MARK-');
      expect(hidden!.report.teachingTopic).toBeNull();
      await submitReport(rt.db, leader, periodId, groupId, { ...BASE, ...CONTENT });
      const [row] = await rt.db.select().from(schema.weeklyReports).where(and(eq(schema.weeklyReports.groupId, groupId), eq(schema.weeklyReports.periodId, periodId)));
      expect(row!.status).toBe('submitted');
      expect(row!.nextWeekPlan).toBe('MARK-PLAN-เยี่ยมบ้าน');
    });
  });

  it('a pastor reads the topic, scripture and activities but none of the free text or the address; stewards and admins read all', async () => {
    await withGroup(async ({ rt, groupId, periodId }) => {
      const leader = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      await submitReport(rt.db, leader, periodId, groupId, { ...BASE, ...CONTENT });
      const pastor = await actorFor(rt, SEED_IDS.users.pastor);
      const list = (await listReportsForPeriod(rt.db, pastor, periodId)).find((r) => r.groupId === groupId)!;
      expect(list.teachingTopic).toBe('เรื่องการให้อภัย');
      expect(list.scriptureRef).toBe('มัทธิว 18:21-22');
      expect(list.activities).toMatchObject({ prayer: true });
      expect(JSON.stringify(list)).not.toContain('MARK-');
      const detail = await getReportDetailForGroup(rt.db, pastor, periodId, groupId);
      expect(JSON.stringify(detail)).not.toContain('MARK-');
      for (const id of [SEED_IDS.users.admin, SEED_IDS.users.bodyLeaderNorth]) {
        const d = await getReportDetailForGroup(rt.db, await actorFor(rt, id), periodId, groupId);
        expect(d!.report.supportNeededText).toBe('MARK-SUPPORT-ขอยืมเครื่องเสียง');
        expect(d!.report.locationText).toBe('MARK-LOC-บ้านเลขที่ 12');
      }
    });
  });

  it('a meeting that was not held stores no content', async () => {
    await withGroup(async ({ rt, groupId, periodId }) => {
      const leader = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      await submitReport(rt.db, leader, periodId, groupId, { ...BASE, ...CONTENT, meetingHeld: false, notHeldReason: 'งดประชุม' });
      const [row] = await rt.db.select().from(schema.weeklyReports).where(and(eq(schema.weeklyReports.groupId, groupId), eq(schema.weeklyReports.periodId, periodId)));
      expect(row!.teachingTopic).toBeNull();
      expect(row!.nextWeekPlan).toBeNull();
      expect(row!.activities).toEqual({ prayer: false, fellowship: false, other: null });
    });
  });

  it('the MINI form builds a payload with the content fields', () => {
    const form: ReportForm = {
      meetingHeld: true, notHeldReason: '', meetingDate: '2026-11-15', newVisitorsCount: '0', returningVisitorsCount: '0', childrenCount: '0', offeringAmountThb: '0',
      summaryNotes: '', prayerRequests: '', careNeedsNotes: '', teachingTopic: 'หัวข้อ', scriptureRef: 'ยอห์น 3:16', actPrayer: true, actFellowship: false, actOther: '',
      locationText: '', atmosphereNotes: '', followupNeedsText: '', nextWeekPlan: 'แผน', supportNeededText: '', attendance: {},
    };
    const p = buildReportPayload(form);
    expect(p.teachingTopic).toBe('หัวข้อ');
    expect(p.activities).toEqual({ prayer: true, fellowship: false, other: '' });
    expect(p.nextWeekPlan).toBe('แผน');
  });
});

describe('FR-07.6, FR-08.3: the first submit time and the late flag never change', () => {
  it('an on-time report that is sent back and resubmitted after the deadline stays on time; the first submit time is kept', async () => {
    await withGroup(async ({ rt, groupId, periodId }) => {
      const leader = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      const [period] = await rt.db.select().from(schema.reportingPeriods).where(eq(schema.reportingPeriods.id, periodId));
      const onTime = new Date(period!.deadlineAt.getTime() - 3_600_000);
      const afterDeadline = new Date(period!.deadlineAt.getTime() + 3_600_000);
      const first = await submitReport(rt.db, leader, periodId, groupId, { ...BASE }, onTime);
      expect(first.isLate).toBe(false);
      expect(first.firstSubmittedAt?.getTime()).toBe(onTime.getTime());

      const body = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
      await approveReportByBodyLeader(rt.db, body, first.id, 'request_revision', 'กรุณาแก้ไขจำนวนผู้เข้าร่วม', first.version);
      const [sentBack] = await rt.db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, first.id));
      expect(sentBack!.status).toBe('needs_revision');

      const again = await submitReport(rt.db, leader, periodId, groupId, { ...BASE, expectedVersion: sentBack!.version }, afterDeadline);
      expect(again.status).toBe('submitted');
      expect(again.isLate).toBe(false);
      expect(again.firstSubmittedAt?.getTime()).toBe(onTime.getTime());
      expect(again.submittedAt?.getTime()).toBe(afterDeadline.getTime());
    });
  });

  it('a report first submitted after the deadline is late for good', async () => {
    await withGroup(async ({ rt, groupId, periodId }) => {
      const leader = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      const [period] = await rt.db.select().from(schema.reportingPeriods).where(eq(schema.reportingPeriods.id, periodId));
      const late = new Date(period!.deadlineAt.getTime() + 60_000);
      const first = await submitReport(rt.db, leader, periodId, groupId, { ...BASE }, late);
      expect(first.isLate).toBe(true);
      expect(first.firstSubmittedAt?.getTime()).toBe(late.getTime());
    });
  });
});
