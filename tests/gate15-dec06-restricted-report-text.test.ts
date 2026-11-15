/**
 * Owner decisions Q-1 to Q-4 (DEC-06), Nov 2026:
 *  - `careNeedsNotes` and `prayerRequests` are Restricted Data. Only the group's stewards (group leader, care leader,
 *    coordinator), the Body Leader of the group's Body and admins can read them. A pastor cannot.
 *  - The Meeting Brief never copies raw prayer text. It shows the number of groups that sent a prayer request.
 *  - Team field points (coordinator names and phones) are for admins only until the data links each point to a Body
 *    or to a coordinator account (fail closed).
 * Scratch PGlite database. The marker strings stand for text that a leader could type into a report.
 */
import { describe, expect, it } from 'vitest';
import { eq, ne } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext, type ActorContext } from '@/server/modules/identity/service';
import { assignLeadershipRole, createGroup } from '@/server/modules/organization/service';
import { generateMeetingBriefForPeriod } from '@/server/modules/insights/service';
import {
  ensureActiveReportingPeriod,
  getReportDetailForGroup,
  listReportsForPeriod,
  submitReport,
  type ReportPayloadInput,
} from '@/server/modules/reporting/service';
import { listTeamFieldPoints, syncTeamGFieldPoints } from '@/server/modules/team-field-points/service';

const CARE = 'MARK-CARE-NEED-นาย-ก-โรคร้าย';
const PRAYER = 'MARK-PRAYER-นาง-ข-ป่วย';

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
const PAYLOAD: ReportPayloadInput = {
  meetingHeld: true,
  totalAttendees: 5,
  memberAttendees: 4,
  newVisitorsCount: 1,
  returningVisitorsCount: 0,
  childrenCount: 0,
};

/** Puts the markers into every submitted report of the seed. Drafts stay hidden by FR-07.5. */
async function markSeedReports(rt: DbRuntime) {
  await rt.db
    .update(schema.weeklyReports)
    .set({ careNeedsNotes: CARE, prayerRequests: PRAYER })
    .where(ne(schema.weeklyReports.status, 'draft'));
}

describe('DEC-06: care needs and prayer requests in the report list', () => {
  it('a pastor receives no restricted text; stewards, the Body Leader and admins still do', async () => {
    await withDb(async (rt, admin) => {
      await markSeedReports(rt);
      const pastor = await actorFor(rt, SEED_IDS.users.pastor);
      const forPastor = await listReportsForPeriod(rt.db, pastor);
      expect(forPastor.length).toBeGreaterThan(0);
      expect(forPastor.every((r) => r.careNeedsNotes === null && r.prayerRequests === null)).toBe(true);
      expect(JSON.stringify(forPastor)).not.toContain('MARK-');

      const forAdmin = await listReportsForPeriod(rt.db, admin);
      expect(forAdmin.some((r) => r.careNeedsNotes === CARE && r.prayerRequests === PRAYER)).toBe(true);
      const body = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
      const forBody = await listReportsForPeriod(rt.db, body);
      expect(forBody.some((r) => r.careNeedsNotes === CARE && r.prayerRequests === PRAYER)).toBe(true);
    });
  });
});

describe('DEC-06: care needs and prayer requests in the report detail', () => {
  it('a pastor can read the report but not the restricted text', async () => {
    await withDb(async (rt, admin) => {
      await markSeedReports(rt);
      const [submitted] = await rt.db.select().from(schema.weeklyReports).where(ne(schema.weeklyReports.status, 'draft'));
      const pastor = await actorFor(rt, SEED_IDS.users.pastor);
      const asPastor = await getReportDetailForGroup(rt.db, pastor, submitted!.periodId, submitted!.groupId);
      expect(asPastor!.report.careNeedsNotes).toBeNull();
      expect(asPastor!.report.prayerRequests).toBeNull();
      expect(JSON.stringify(asPastor)).not.toContain('MARK-');
      const asAdmin = await getReportDetailForGroup(rt.db, admin, submitted!.periodId, submitted!.groupId);
      expect(asAdmin!.report.careNeedsNotes).toBe(CARE);
      expect(asAdmin!.report.prayerRequests).toBe(PRAYER);
    });
  });
});

describe('DEC-06 / Q-2: the immutable Meeting Brief never copies raw prayer text', () => {
  it('stores only the number of groups that sent a prayer request', async () => {
    await withDb(async (rt, admin) => {
      const group = await createGroup(rt.db, admin, { groupCode: 'BR-PRAY', bodyId: SEED_IDS.bodies.north, nameTh: 'กลุ่มทดสอบคำอธิษฐาน', district: 'เมืองกาฬสินธุ์' });
      await assignLeadershipRole(rt.db, admin, { userId: SEED_IDS.users.standbyLeaderSouth, scopeType: 'group', groupId: group.id, roleType: 'group_leader' });
      const leader = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      const period = await ensureActiveReportingPeriod(rt.db);
      await submitReport(rt.db, leader, period.id, group.id, { ...PAYLOAD, prayerRequests: PRAYER, careNeedsNotes: CARE, summaryNotes: 'สรุปทั่วไป' });

      const brief = await generateMeetingBriefForPeriod(rt.db, period.id, {
        isCronJob: true,
        now: new Date(period.briefScheduledAt.getTime() + 60_000),
      });
      const json = JSON.stringify(brief);
      expect(json).not.toContain('MARK-');
      expect(json).not.toContain('โรคร้าย');
      const sections = brief.sectionsJson as Record<string, unknown>;
      // The seed already has reports with prayer text in this period. Count them from the database, not by hand.
      const reports = await rt.db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.periodId, period.id));
      const expected = reports.filter((r) => r.status !== 'draft' && r.prayerRequests?.trim()).length;
      expect(expected).toBeGreaterThanOrEqual(1);
      expect(sections.section9GroupsWithPrayerRequests).toBe(expected);
      expect(Array.isArray(sections.section9PrayerAndCareThemes)).toBe(true);
      expect((sections.section9PrayerAndCareThemes as string[]).join(' ')).toContain(`${expected} กลุ่ม`);
      for (const r of reports) {
        if (r.prayerRequests) expect(json).not.toContain(r.prayerRequests);
      }
    });
  });
});

describe('DEC-06 / Q-3: team field points are admin only until the data has a Body or coordinator link', () => {
  it('refuses every non-admin role, even with a masked phone; admins can read', async () => {
    await withDb(async (rt, admin) => {
      await syncTeamGFieldPoints(rt.db, admin);
      const roles = {
        groupLeader: SEED_IDS.users.leaderNongkung,
        bodyLeader: SEED_IDS.users.bodyLeaderNorth,
        pastor: SEED_IDS.users.pastor,
      };
      for (const [name, id] of Object.entries(roles)) {
        await expect(listTeamFieldPoints(rt.db, await actorFor(rt, id)), name).rejects.toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
      }
      const forAdmin = await listTeamFieldPoints(rt.db, admin);
      expect(forAdmin.length).toBeGreaterThan(0);
      expect(forAdmin.some((p) => p.phone && !p.phone.startsWith('***'))).toBe(true);
    });
  });
});
