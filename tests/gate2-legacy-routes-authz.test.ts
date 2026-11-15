import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext, type ActorContext } from '@/server/modules/identity/service';
import { assignCareSteward, createProvisionalCare } from '@/server/modules/cares/service';
import {
  assignLeadershipRole,
  createGroup,
  revokeAssignment,
  updateUserStatusByAdmin,
} from '@/server/modules/organization/service';
import {
  canTriggerBrief,
  csvEscape,
  exportScopedCsvData,
  generateMeetingBriefForPeriod,
} from '@/server/modules/insights/service';
import {
  ensureActiveReportingPeriod,
  saveDraftReport,
  submitReport,
  updateReportIfCurrent,
  type ReportPayloadInput,
} from '@/server/modules/reporting/service';
import {
  convertVisitorToMember,
  createGroupMember,
  newMemberCode,
  registerVisitor,
  updateFollowUpItem,
} from '@/server/modules/pastoral-care/service';
import { reportActionSchema } from '@/app/api/v1/reports/schema';

async function withDb<T>(fn: (rt: DbRuntime, admin: ActorContext) => Promise<T>): Promise<T> {
  const rt = await createInMemoryTestRuntime();
  try {
    await ensureSchema(rt);
    await ensureSeeded(rt.db);
    return await fn(rt, await actorFor(rt, SEED_IDS.users.admin));
  } finally {
    await rt.close();
  }
}

async function actorFor(rt: DbRuntime, id: string) {
  const [u] = await rt.db.select().from(schema.users).where(eq(schema.users.id, id));
  return buildActorContext(rt.db, u!);
}

async function unscopedUser(rt: DbRuntime) {
  const [u] = await rt.db
    .insert(schema.users)
    .values({ username: `line-${Math.random().toString(16).slice(2, 10)}`, displayName: 'ไม่มีขอบเขต', systemRole: 'standard_user', status: 'active' })
    .returning();
  return buildActorContext(rt.db, u!);
}

const PAYLOAD: ReportPayloadInput = {
  meetingHeld: true,
  totalAttendees: 5,
  memberAttendees: 4,
  newVisitorsCount: 1,
  returningVisitorsCount: 0,
  childrenCount: 0,
};

/** A fresh group in the north body with standbyLeaderSouth as its group leader. */
async function freshGroup(rt: DbRuntime, admin: ActorContext, code: string) {
  const group = await createGroup(rt.db, admin, { groupCode: code, bodyId: SEED_IDS.bodies.north, nameTh: `กลุ่ม ${code}`, district: 'เมืองกาฬสินธุ์' });
  await assignLeadershipRole(rt.db, admin, { userId: SEED_IDS.users.standbyLeaderSouth, scopeType: 'group', groupId: group.id, roleType: 'group_leader' });
  return group;
}

describe('Authz review: ending a care assignment needs authority over that care', () => {
  it('refuses unscoped users and unrelated leaders; allows the Body Leader of that body and admins', async () => {
    await withDb(async (rt, admin) => {
      const north = await createProvisionalCare(rt.db, admin, { careCode: 'C-AZ-N', bodyId: SEED_IDS.bodies.north });
      const loose = await createProvisionalCare(rt.db, admin, { careCode: 'C-AZ-L' });
      const a1 = await assignCareSteward(rt.db, admin, { careId: north.id, userId: SEED_IDS.users.leaderNongkung, roleType: 'care_leader' });
      const a2 = await assignCareSteward(rt.db, admin, { careId: loose.id, userId: SEED_IDS.users.leaderNongkung, roleType: 'care_leader' });

      for (const who of [await unscopedUser(rt), await actorFor(rt, SEED_IDS.users.leaderNonthan), await actorFor(rt, SEED_IDS.users.pastor)]) {
        await expect(revokeAssignment(rt.db, who, a1.id, 'ทดสอบ')).rejects.toMatchObject({ status: 403 });
      }
      const still = await rt.db.select().from(schema.assignments).where(eq(schema.assignments.id, a1.id));
      expect(still[0]!.effectiveTo).toBeNull();

      // Body Leader of the north body can end an assignment of a care in the north body, but not an unmapped care.
      const bodyLeader = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
      await expect(revokeAssignment(rt.db, bodyLeader, a2.id, 'ทดสอบ')).rejects.toMatchObject({ status: 403 });
      await expect(revokeAssignment(rt.db, bodyLeader, a1.id, 'ทดสอบ')).resolves.toBeTruthy();
      await expect(revokeAssignment(rt.db, admin, a2.id, 'ทดสอบ')).resolves.toBeTruthy();
    });
  });
});

describe('Authz review: protecting privileged accounts', () => {
  it('an admin cannot suspend a super_admin or another admin; a super_admin can; both can manage standard users', async () => {
    await withDb(async (rt, admin) => {
      const superAdmin = await actorFor(rt, SEED_IDS.users.superAdmin);
      const [admin2] = await rt.db.insert(schema.users).values({ username: 'admin2-az', displayName: 'ผู้ดูแล 2', systemRole: 'admin', status: 'active' }).returning();

      await expect(updateUserStatusByAdmin(rt.db, admin, SEED_IDS.users.superAdmin, 'suspended', 'ทดสอบ')).rejects.toMatchObject({ status: 403, code: 'PRIVILEGED_ACCOUNT' });
      await expect(updateUserStatusByAdmin(rt.db, admin, admin2!.id, 'suspended', 'ทดสอบ')).rejects.toMatchObject({ status: 403, code: 'PRIVILEGED_ACCOUNT' });
      const [sa] = await rt.db.select().from(schema.users).where(eq(schema.users.id, SEED_IDS.users.superAdmin));
      expect(sa!.status).toBe('active');

      await expect(updateUserStatusByAdmin(rt.db, admin, SEED_IDS.users.leaderNongkung, 'suspended', 'ทดสอบ')).resolves.toBeTruthy();
      await expect(updateUserStatusByAdmin(rt.db, superAdmin, admin2!.id, 'suspended', 'ทดสอบ')).resolves.toBeTruthy();
    });
  });
});

describe('Authz review: the Sunday meeting brief cannot be created early or by Body Leaders', () => {
  it('refuses before the scheduled time, creates after it, and returns the same brief afterwards', async () => {
    await withDb(async (rt) => {
      const period = await ensureActiveReportingPeriod(rt.db);
      const early = new Date(period.briefScheduledAt.getTime() - 3_600_000);
      await expect(generateMeetingBriefForPeriod(rt.db, period.id, { isCronJob: false, now: early })).rejects.toMatchObject({ status: 409, code: 'BRIEF_TOO_EARLY' });
      expect(await rt.db.select().from(schema.meetingBriefs).where(eq(schema.meetingBriefs.periodId, period.id))).toHaveLength(0);

      const onTime = new Date(period.briefScheduledAt.getTime() + 60_000);
      const first = await generateMeetingBriefForPeriod(rt.db, period.id, { isCronJob: true, now: onTime });
      const again = await generateMeetingBriefForPeriod(rt.db, period.id, { isCronJob: false, now: onTime });
      expect(again.id).toBe(first.id);
    });
  });

  it('only admins may trigger it by hand', async () => {
    await withDb(async (rt, admin) => {
      expect(canTriggerBrief(admin)).toBe(true);
      expect(canTriggerBrief(await actorFor(rt, SEED_IDS.users.bodyLeaderNorth))).toBe(false);
      expect(canTriggerBrief(await actorFor(rt, SEED_IDS.users.pastor))).toBe(false);
      expect(canTriggerBrief(await actorFor(rt, SEED_IDS.users.leaderNongkung))).toBe(false);
    });
  });
});

describe('Authz review: report writes are checked against the group and the period', () => {
  it('rejects attendance for a member who is not in the group, and duplicates', async () => {
    await withDb(async (rt, admin) => {
      const group = await freshGroup(rt, admin, 'AZ-ATT');
      const leader = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      const period = await ensureActiveReportingPeriod(rt.db);
      const [outsider] = await rt.db.select().from(schema.groupMemberships).where(eq(schema.groupMemberships.groupId, SEED_IDS.groups.nongkung)).limit(1);
      const mine = await createGroupMember(rt.db, admin, { groupId: group.id, fullName: 'สมาชิกในกลุ่ม', displayName: 'ในกลุ่ม' });

      for (const run of [saveDraftReport, submitReport] as const) {
        await expect(
          run(rt.db, leader, period.id, group.id, { ...PAYLOAD, attendance: [{ memberId: outsider!.memberId, attendanceStatus: 'present' }] })
        ).rejects.toMatchObject({ status: 400, code: 'MEMBER_NOT_IN_GROUP' });
        await expect(
          run(rt.db, leader, period.id, group.id, { ...PAYLOAD, attendance: [{ memberId: mine.id, attendanceStatus: 'present' }, { memberId: mine.id, attendanceStatus: 'absent' }] })
        ).rejects.toMatchObject({ status: 400, code: 'ATTENDANCE_DUPLICATE_MEMBER' });
      }
      const ok = await saveDraftReport(rt.db, leader, period.id, group.id, { ...PAYLOAD, attendance: [{ memberId: mine.id, attendanceStatus: 'present' }] });
      expect(ok.status).toBe('draft');
    });
  });

  it('does not accept a report for a future period or a closed period', async () => {
    await withDb(async (rt, admin) => {
      const group = await freshGroup(rt, admin, 'AZ-PER');
      const leader = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      const mk = (key: string, start: string, end: string, status: string) =>
        rt.db.insert(schema.reportingPeriods).values({ periodKey: key, startDate: start, endDate: end, deadlineAt: new Date(`${end}T13:00:00Z`), briefScheduledAt: new Date(`${end}T13:30:00Z`), status }).returning();
      const [future] = await mk('2099-W02', '2099-01-05', '2099-01-11', 'open');
      const [closed] = await mk('2020-W02', '2020-01-06', '2020-01-12', 'closed');
      for (const p of [future!, closed!]) {
        for (const run of [saveDraftReport, submitReport] as const) {
          await expect(run(rt.db, leader, p.id, group.id, PAYLOAD)).rejects.toMatchObject({ status: 409, code: 'PERIOD_NOT_ACCEPTING' });
        }
      }
    });
  });

  it('a decision made on an out-of-date copy of a report is refused (no lost update)', async () => {
    await withDb(async (rt, admin) => {
      const group = await freshGroup(rt, admin, 'AZ-VER');
      const leader = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      const period = await ensureActiveReportingPeriod(rt.db);
      await submitReport(rt.db, leader, period.id, group.id, PAYLOAD);
      const [copy] = await rt.db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.groupId, group.id));

      // Someone else changes the report after the copy was read.
      await rt.db.update(schema.weeklyReports).set({ status: 'needs_revision', revisionReason: 'ทดสอบ', version: copy!.version + 1 }).where(eq(schema.weeklyReports.id, copy!.id));
      await expect(
        updateReportIfCurrent(rt.db, copy!, { status: 'approved' }, ['submitted', 'under_review'])
      ).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
      const [after] = await rt.db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, copy!.id));
      expect(after!.status).toBe('needs_revision');
    });
  });

  it('approve and review must name the version that the person saw', () => {
    const base = { reportId: '11111111-1111-4111-8111-111111111111' };
    expect(reportActionSchema.safeParse({ action: 'approve', ...base, decision: 'approve' }).success).toBe(false);
    expect(reportActionSchema.safeParse({ action: 'review', ...base, decision: 'forward' }).success).toBe(false);
    expect(reportActionSchema.safeParse({ action: 'approve', ...base, decision: 'approve', expectedVersion: 2 }).success).toBe(true);
  });
});

describe('Authz review: pastoral writes belong to stewards, not to read-only roles', () => {
  it('a pastor cannot register visitors; the group leader can; a report of another group cannot be attached', async () => {
    await withDb(async (rt) => {
      await ensureActiveReportingPeriod(rt.db);
      const input = { groupId: SEED_IDS.groups.nongkung, fullName: 'ผู้เยี่ยม ทดสอบ', phoneE164: '+66812340001', consentForContact: true, createFollowUp: true };
      await expect(registerVisitor(rt.db, await actorFor(rt, SEED_IDS.users.pastor), input)).rejects.toMatchObject({ status: 403 });

      const [otherReport] = await rt.db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.groupId, SEED_IDS.groups.nonthan)).limit(1);
      const leader = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      await expect(registerVisitor(rt.db, leader, { ...input, weeklyReportId: otherReport!.id })).rejects.toMatchObject({ status: 400, code: 'REPORT_GROUP_MISMATCH' });
      await expect(registerVisitor(rt.db, leader, input)).resolves.toBeTruthy();
    });
  });

  it('follow-ups cannot be changed by a pastor, and a visitor cannot be moved by someone with no access to its origin group', async () => {
    await withDb(async (rt) => {
      await ensureActiveReportingPeriod(rt.db);
      const leader = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      await registerVisitor(rt.db, leader, { groupId: SEED_IDS.groups.nongkung, fullName: 'ผู้เยี่ยม สอง', phoneE164: '+66812340002', consentForContact: true, createFollowUp: true });
      const [visitor] = await rt.db.select().from(schema.visitors).where(eq(schema.visitors.fullName, 'ผู้เยี่ยม สอง'));
      const [fu] = await rt.db.select().from(schema.followUpItems).where(eq(schema.followUpItems.visitorId, visitor!.id));

      await expect(updateFollowUpItem(rt.db, await actorFor(rt, SEED_IDS.users.pastor), fu!.id, 'completed')).rejects.toMatchObject({ status: 403 });

      // A leader of another group cannot pull this visitor into their own group.
      const other = await actorFor(rt, SEED_IDS.users.leaderNonthan);
      await expect(convertVisitorToMember(rt.db, other, visitor!.id, SEED_IDS.groups.nonthan)).rejects.toMatchObject({ status: 403 });
      const [unchanged] = await rt.db.select().from(schema.visitors).where(eq(schema.visitors.id, visitor!.id));
      expect(unchanged!.convertedMemberId).toBeNull();
      await expect(convertVisitorToMember(rt.db, leader, visitor!.id)).resolves.toBeTruthy();
    });
  });

  it('member codes are random and unique', () => {
    const codes = new Set(Array.from({ length: 20000 }, () => newMemberCode()));
    expect(codes.size).toBe(20000);
    for (const c of codes) expect(c).toMatch(/^MEM-KSN-[0-9A-F]{10}$/);
  });
});

describe('Authz review: Body Leaders can grant only the roles that DEC-09 lists', () => {
  it('other_authorized is admin-only; group_leader, care_leader and coordinator stay allowed for a Body Leader in their body', async () => {
    await withDb(async (rt, admin) => {
      const group = await createGroup(rt.db, admin, { groupCode: 'AZ-ROLE', bodyId: SEED_IDS.bodies.north, nameTh: 'กลุ่มบทบาท', district: 'เมืองกาฬสินธุ์' });
      const bodyLeader = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
      const grant = (actor: ActorContext, role: 'other_authorized' | 'coordinator') =>
        assignLeadershipRole(rt.db, actor, { userId: SEED_IDS.users.standbyLeaderSouth, scopeType: 'group', groupId: group.id, roleType: role });
      await expect(grant(bodyLeader, 'other_authorized')).rejects.toMatchObject({ status: 403, code: 'ADMIN_REQUIRED' });
      await expect(grant(bodyLeader, 'coordinator')).resolves.toBeTruthy();
      await expect(grant(admin, 'other_authorized')).resolves.toBeTruthy();
    });
  });
});

describe('Authz review: CSV export cannot carry spreadsheet formulas', () => {
  it('neutralizes cells that start with a formula character, but keeps phone numbers and normal text', () => {
    expect(csvEscape('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
    expect(csvEscape('@SUM(A1:A9)')).toBe("'@SUM(A1:A9)");
    expect(csvEscape('+cmd|calc')).toBe("'+cmd|calc");
    expect(csvEscape('-2+3')).toBe("'-2+3");
    expect(csvEscape('\t=1')).toBe("'\t=1");
    expect(csvEscape('+66812345678')).toBe('+66812345678');
    expect(csvEscape('-5')).toBe('-5');
    expect(csvEscape('สมชาย, ใจดี')).toBe('"สมชาย, ใจดี"');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(12)).toBe('12');
  });

  it('a visitor named like a formula is exported as text', async () => {
    await withDb(async (rt, admin) => {
      await ensureActiveReportingPeriod(rt.db);
      const leader = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      await registerVisitor(rt.db, leader, { groupId: SEED_IDS.groups.nongkung, fullName: '=1+1', consentForContact: true });
      const out = await exportScopedCsvData(rt.db, admin, 'visitors');
      expect(out.csv).toContain("'=1+1");
      expect(out.csv.split('\r\n').some((line) => /(^|,)=1\+1/.test(line))).toBe(false);
    });
  });
});
