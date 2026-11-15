/**
 * PRD FR-04.3, FR-05.3, FR-05.4, FR-06.1, FR-06.4, FR-07.2, FR-09.1, FR-09.2 (Nov 2026 completion round).
 * Scratch PGlite database. No Neon database, no real LINE.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext, type ActorContext } from '@/server/modules/identity/service';
import { assignLeadershipRole, createGroup } from '@/server/modules/organization/service';
import { ensureActiveReportingPeriod, submitReport, type ReportPayloadInput } from '@/server/modules/reporting/service';
import {
  createGroupMemberWithWarnings,
  listScopedFollowUps,
  recordVisitorReturn,
  registerVisitor,
  updateFollowUpItem,
  updateVisitorFollowupStatus,
} from '@/server/modules/pastoral-care/service';
import { runFollowUpAutomationForReport } from '@/server/modules/pastoral-care/followup-automation';

const LEADER = SEED_IDS.users.standbyLeaderSouth;
const SUPERVISOR = SEED_IDS.users.careLeaderNonthan;

async function actorFor(rt: DbRuntime, id: string) {
  const [u] = await rt.db.select().from(schema.users).where(eq(schema.users.id, id));
  return buildActorContext(rt.db, u!);
}

interface Ctx {
  rt: DbRuntime;
  admin: ActorContext;
  groupId: string;
  memberId: string;
  period: typeof schema.reportingPeriods.$inferSelect;
  /** Earlier periods, newest first: [W45, W44, ...]. */
  earlier: Array<typeof schema.reportingPeriods.$inferSelect>;
}

async function withCtx<T>(fn: (c: Ctx) => Promise<T>, opts: { supervisor?: boolean } = {}): Promise<T> {
  const rt = await createInMemoryTestRuntime();
  try {
    await ensureSchema(rt);
    await ensureSeeded(rt.db);
    const admin = await actorFor(rt, SEED_IDS.users.admin);
    const group = await createGroup(rt.db, admin, { groupCode: 'AUTO-1', bodyId: SEED_IDS.bodies.north, nameTh: 'กลุ่มทดสอบติดตามอัตโนมัติ', district: 'เมืองกาฬสินธุ์' });
    await assignLeadershipRole(rt.db, admin, { userId: LEADER, scopeType: 'group', groupId: group.id, roleType: 'group_leader' });
    if (opts.supervisor) {
      await assignLeadershipRole(rt.db, admin, { userId: SUPERVISOR, scopeType: 'group', groupId: group.id, roleType: 'care_leader' });
    }
    const leader = await actorFor(rt, LEADER);
    const { member } = await createGroupMemberWithWarnings(rt.db, leader, { groupId: group.id, fullName: 'สมาชิกทดสอบ หนึ่ง', displayName: 'หนึ่ง' });
    const period = await ensureActiveReportingPeriod(rt.db);
    // Earlier periods: the seed makes the previous week; the test adds the one before it.
    const all = await rt.db.select().from(schema.reportingPeriods);
    const earlier = all.filter((p) => p.startDate < period.startDate).sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
    if (earlier.length < 2) {
      const base = new Date(`${earlier[0]!.startDate}T00:00:00Z`);
      base.setUTCDate(base.getUTCDate() - 7);
      const start = base.toISOString().slice(0, 10);
      const end = new Date(base.getTime() + 6 * 86400000).toISOString().slice(0, 10);
      const [p] = await rt.db
        .insert(schema.reportingPeriods)
        .values({ periodKey: `TEST-${start}`, startDate: start, endDate: end, deadlineAt: new Date(base.getTime() + 6.8 * 86400000), briefScheduledAt: new Date(base.getTime() + 6.85 * 86400000), status: 'closed' })
        .returning();
      earlier.push(p!);
    }
    return await fn({ rt, admin, groupId: group.id, memberId: member.id, period, earlier });
  } finally {
    await rt.close();
  }
}

/** A submitted, held report of an earlier period. The member is marked as given. Written directly: it stands for history. */
async function pastReport(c: Ctx, p: typeof schema.reportingPeriods.$inferSelect, mark: 'absent' | 'present' | 'notheld') {
  const [r] = await c.rt.db
    .insert(schema.weeklyReports)
    .values({
      periodId: p.id,
      groupId: c.groupId,
      bodyId: SEED_IDS.bodies.north,
      status: 'submitted',
      meetingHeld: mark !== 'notheld',
      notHeldReason: mark === 'notheld' ? 'งดประชุม' : null,
      submittedByUserId: LEADER,
      submittedAt: new Date(),
    })
    .returning();
  if (mark !== 'notheld') {
    await c.rt.db.insert(schema.attendanceRecords).values({ weeklyReportId: r!.id, memberId: c.memberId, attendanceStatus: mark });
  }
}

const PAYLOAD = (memberId: string, status: 'absent' | 'present' | 'leave' | 'online' = 'absent'): ReportPayloadInput => ({
  meetingHeld: true,
  totalAttendees: 0,
  memberAttendees: 99,
  newVisitorsCount: 0,
  returningVisitorsCount: 0,
  childrenCount: 0,
  attendance: [{ memberId, attendanceStatus: status }],
});

const itemsOf = (c: Ctx) => c.rt.db.select().from(schema.followUpItems).where(eq(schema.followUpItems.groupId, c.groupId));

describe('FR-06.4: follow-ups for consecutive absence', () => {
  it('two weeks in a row: one item for the Group Leader with a neutral title; again and after completion: no second item', async () => {
    await withCtx(async (c) => {
      await pastReport(c, c.earlier[0]!, 'absent');
      const leader = await actorFor(c.rt, LEADER);
      await submitReport(c.rt.db, leader, c.period.id, c.groupId, PAYLOAD(c.memberId));
      let items = (await itemsOf(c)).filter((i) => i.sourceType !== 'manual');
      expect(items.map((i) => i.sourceType)).toEqual(['absent_2_weeks']);
      expect(items[0]!.assignedToUserId).toBe(LEADER);
      expect(items[0]!.memberId).toBe(c.memberId);
      expect(items[0]!.title).not.toContain('หนึ่ง');
      expect(items[0]!.status).toBe('open');

      const [report] = await c.rt.db.select().from(schema.weeklyReports).where(and(eq(schema.weeklyReports.groupId, c.groupId), eq(schema.weeklyReports.periodId, c.period.id)));
      await runFollowUpAutomationForReport(c.rt.db, report!.id);
      expect((await itemsOf(c)).length).toBe(1);

      await updateFollowUpItem(c.rt.db, leader, items[0]!.id, 'completed', undefined, 'โทรหาแล้ว');
      await runFollowUpAutomationForReport(c.rt.db, report!.id);
      expect((await itemsOf(c)).length).toBe(1);
    });
  });

  it('three weeks in a row: one more high priority item for the Supervisor', async () => {
    await withCtx(
      async (c) => {
        await pastReport(c, c.earlier[0]!, 'absent');
        await pastReport(c, c.earlier[1]!, 'absent');
        await submitReport(c.rt.db, await actorFor(c.rt, LEADER), c.period.id, c.groupId, PAYLOAD(c.memberId));
        const items = (await itemsOf(c)).filter((i) => i.sourceType !== 'manual');
        expect(items.map((i) => i.sourceType).sort()).toEqual(['absent_2_weeks', 'absent_3plus_weeks']);
        const three = items.find((i) => i.sourceType === 'absent_3plus_weeks')!;
        expect(three.priority).toBe('high');
        expect(three.assignedToUserId).toBe(SUPERVISOR);
        const note = await c.rt.db.select().from(schema.notifications).where(eq(schema.notifications.userId, SUPERVISOR));
        expect(note.some((n) => n.category === 'follow_up_assigned')).toBe(true);
      },
      { supervisor: true }
    );
  });

  it('a week without a held meeting, or without a report, breaks the streak (unknown is not absent)', async () => {
    await withCtx(async (c) => {
      await pastReport(c, c.earlier[0]!, 'notheld');
      await submitReport(c.rt.db, await actorFor(c.rt, LEADER), c.period.id, c.groupId, PAYLOAD(c.memberId));
      expect((await itemsOf(c)).length).toBe(0);
    });
    await withCtx(async (c) => {
      // No report at all for the earlier period.
      await submitReport(c.rt.db, await actorFor(c.rt, LEADER), c.period.id, c.groupId, PAYLOAD(c.memberId));
      expect((await itemsOf(c)).length).toBe(0);
    });
  });

  it('present once in the middle resets the streak', async () => {
    await withCtx(async (c) => {
      await pastReport(c, c.earlier[0]!, 'present');
      await pastReport(c, c.earlier[1]!, 'absent');
      await submitReport(c.rt.db, await actorFor(c.rt, LEADER), c.period.id, c.groupId, PAYLOAD(c.memberId));
      expect((await itemsOf(c)).length).toBe(0);
    });
  });
});

describe('FR-05.3, FR-05.4: visitors', () => {
  async function visitorSetup(c: Ctx) {
    const leader = await actorFor(c.rt, LEADER);
    // The visitor came in the earlier period. registerVisitor writes to the open period, so the visit is moved back.
    const { visitor, visit } = await registerVisitor(c.rt.db, leader, { groupId: c.groupId, fullName: 'ผู้เยี่ยม ทดสอบ', consentForContact: false });
    await c.rt.db.update(schema.visitorVisits).set({ periodId: c.earlier[0]!.id }).where(eq(schema.visitorVisits.id, visit.id));
    return { leader, visitor };
  }

  it('a first-time visitor who did not return gets one item; the visitor moves to awaiting_followup', async () => {
    await withCtx(async (c) => {
      const { leader, visitor } = await visitorSetup(c);
      await submitReport(c.rt.db, leader, c.period.id, c.groupId, PAYLOAD(c.memberId, 'present'));
      const items = (await itemsOf(c)).filter((i) => i.sourceType === 'visitor_not_returned');
      expect(items).toHaveLength(1);
      expect(items[0]!.visitorId).toBe(visitor.id);
      expect(items[0]!.title).not.toContain('ทดสอบ');
      const [v] = await c.rt.db.select().from(schema.visitors).where(eq(schema.visitors.id, visitor.id));
      expect(v!.followupStatus).toBe('awaiting_followup');
    });
  });

  it('a visitor who returned gets no item; a recorded return cancels an open item and moves the status to returned', async () => {
    await withCtx(async (c) => {
      const { leader, visitor } = await visitorSetup(c);
      await submitReport(c.rt.db, leader, c.period.id, c.groupId, PAYLOAD(c.memberId, 'present'));
      const res = await recordVisitorReturn(c.rt.db, leader, { visitorId: visitor.id });
      expect(res.visitor.followupStatus).toBe('returned');
      expect(res.visitor.visitCount).toBe(2);
      const item = (await itemsOf(c)).find((i) => i.sourceType === 'visitor_not_returned')!;
      expect(item.status).toBe('cancelled');
      await expect(recordVisitorReturn(c.rt.db, leader, { visitorId: visitor.id })).rejects.toMatchObject({ code: 'VISIT_ALREADY_RECORDED' });
    });
  });

  it('lifecycle moves forward only; another group leader cannot change it', async () => {
    await withCtx(async (c) => {
      const { leader, visitor } = await visitorSetup(c);
      await expect(updateVisitorFollowupStatus(c.rt.db, leader, visitor.id, 'completed')).rejects.toMatchObject({ code: 'VISITOR_STATUS_INVALID' });
      expect((await updateVisitorFollowupStatus(c.rt.db, leader, visitor.id, 'contacted')).followupStatus).toBe('contacted');
      await expect(updateVisitorFollowupStatus(c.rt.db, leader, visitor.id, 'awaiting_followup')).rejects.toMatchObject({ code: 'VISITOR_STATUS_INVALID' });
      const other = await actorFor(c.rt, SEED_IDS.users.leaderNongkung);
      await expect(updateVisitorFollowupStatus(c.rt.db, other, visitor.id, 'returned')).rejects.toMatchObject({ status: 403 });
    });
  });
});

describe('FR-09.2: outcome is required to complete', () => {
  it('service and database both refuse a completed item without an outcome; the pastor does not read the outcome text', async () => {
    await withCtx(async (c) => {
      const leader = await actorFor(c.rt, LEADER);
      const [item] = await c.rt.db
        .insert(schema.followUpItems)
        .values({ groupId: c.groupId, title: 'ติดตามทั่วไป', createdByUserId: LEADER, assignedToUserId: LEADER })
        .returning();
      await expect(updateFollowUpItem(c.rt.db, leader, item!.id, 'completed')).rejects.toMatchObject({ code: 'OUTCOME_REQUIRED' });
      await expect(updateFollowUpItem(c.rt.db, leader, item!.id, 'completed', undefined, '   ')).rejects.toMatchObject({ code: 'OUTCOME_REQUIRED' });
      await expect(c.rt.db.update(schema.followUpItems).set({ status: 'completed' }).where(eq(schema.followUpItems.id, item!.id))).rejects.toThrow();
      const done = await updateFollowUpItem(c.rt.db, leader, item!.id, 'completed', undefined, 'MARK-OUTCOME-เยี่ยมบ้านแล้ว');
      expect(done.completedByUserId).toBe(LEADER);
      const asPastor = (await listScopedFollowUps(c.rt.db, await actorFor(c.rt, SEED_IDS.users.pastor))).find((f) => f.id === item!.id)!;
      expect(asPastor.outcomeNote).toBeNull();
      const asLeader = (await listScopedFollowUps(c.rt.db, leader)).find((f) => f.id === item!.id)!;
      expect(asLeader.outcomeNote).toBe('MARK-OUTCOME-เยี่ยมบ้านแล้ว');
    });
  });

  it('an open item for the same cause cannot be created twice (partial unique index)', async () => {
    await withCtx(async (c) => {
      const v = { groupId: c.groupId, title: 'x', createdByUserId: LEADER, sourceType: 'absent_2_weeks', sourceDedupKey: 'k1' } as const;
      await c.rt.db.insert(schema.followUpItems).values(v);
      await expect(c.rt.db.insert(schema.followUpItems).values(v)).rejects.toThrow();
    });
  });
});

describe('FR-04.3: duplicate warning', () => {
  it('warns with counts only; creates the member anyway; a person outside the group gets 403 before any warning', async () => {
    await withCtx(async (c) => {
      const leader = await actorFor(c.rt, LEADER);
      const again = await createGroupMemberWithWarnings(c.rt.db, leader, { groupId: c.groupId, fullName: 'สมาชิกทดสอบ หนึ่ง', displayName: 'หนึ่ง 2', phoneE164: '+66800000001' });
      expect(again.duplicateWarnings).toEqual({ samePhone: 0, sameName: 1 });
      const third = await createGroupMemberWithWarnings(c.rt.db, leader, { groupId: c.groupId, fullName: 'อีกคน', displayName: 'อีกคน', phoneE164: '+66800000001' });
      expect(third.duplicateWarnings).toEqual({ samePhone: 1, sameName: 0 });
      expect(JSON.stringify(third.duplicateWarnings)).not.toContain('สมาชิก');
      const outsider = await actorFor(c.rt, SEED_IDS.users.leaderNongkung);
      await expect(createGroupMemberWithWarnings(c.rt.db, outsider, { groupId: c.groupId, fullName: 'สมาชิกทดสอบ หนึ่ง', displayName: 'x' })).rejects.toMatchObject({ status: 403 });
    });
  });
});

describe('FR-06.1, FR-07.2: attendance statuses and derived counts', () => {
  it('present and online count as member attendance; the typed number cannot disagree with the marks', async () => {
    await withCtx(async (c) => {
      const leader = await actorFor(c.rt, LEADER);
      const { member: m2 } = await createGroupMemberWithWarnings(c.rt.db, leader, { groupId: c.groupId, fullName: 'สอง', displayName: 'สอง' });
      const { member: m3 } = await createGroupMemberWithWarnings(c.rt.db, leader, { groupId: c.groupId, fullName: 'สาม', displayName: 'สาม' });
      const saved = await submitReport(c.rt.db, leader, c.period.id, c.groupId, {
        ...PAYLOAD(c.memberId),
        attendance: [
          { memberId: c.memberId, attendanceStatus: 'present' },
          { memberId: m2.id, attendanceStatus: 'online' },
          { memberId: m3.id, attendanceStatus: 'leave' },
        ],
      });
      expect(saved.memberAttendees).toBe(2);
      expect(saved.totalAttendees).toBeGreaterThanOrEqual(2);
    });
  });

  it('the database accepts present, absent, leave, online and refuses the old value excused', async () => {
    await withCtx(async (c) => {
      await submitReport(c.rt.db, await actorFor(c.rt, LEADER), c.period.id, c.groupId, PAYLOAD(c.memberId, 'leave'));
      const [r] = await c.rt.db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.groupId, c.groupId));
      await expect(c.rt.db.update(schema.attendanceRecords).set({ attendanceStatus: 'excused' }).where(eq(schema.attendanceRecords.weeklyReportId, r!.id))).rejects.toThrow();
    });
  });
});

describe('migration 0005 data steps', () => {
  it('converts excused to leave and gives old completed items a marker outcome, in that order before the new checks', () => {
    const sql = readFileSync(path.join(process.cwd(), 'drizzle/0005_report_content_followups_attendance.sql'), 'utf8');
    const drop = sql.indexOf('DROP CONSTRAINT "attendance_status_chk"');
    const upd = sql.indexOf(`SET "attendance_status" = 'leave' WHERE "attendance_status" = 'excused'`);
    const add = sql.indexOf('ADD CONSTRAINT "attendance_status_chk"');
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(upd).toBeGreaterThan(drop);
    expect(add).toBeGreaterThan(upd);
    const updOutcome = sql.indexOf('UPDATE "follow_up_items" SET "outcome_note"');
    expect(updOutcome).toBeGreaterThan(0);
    expect(sql.indexOf('ADD CONSTRAINT "follow_up_completed_outcome_chk"')).toBeGreaterThan(updOutcome);
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });
});
