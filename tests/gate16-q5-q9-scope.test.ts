/**
 * Owner decisions Q-5 to Q-9 (DEC-06, DEC-18, DEC-19), Nov 2026:
 *  - Q-5, Q-6: `notHeldReason` and `summaryNotes` are restricted free text. A pastor does not read them.
 *  - Q-7: the Meeting Brief shows only the number of open follow-ups. It never shows a follow-up title.
 *  - Q-8: team field points are linked to a Body and to a coordinator account by an admin. NULL links match nobody.
 *  - Q-9: the stored brief is one immutable record. The API builds the response for the role and scope of the caller.
 * Scratch PGlite database. No Neon database is used.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { eq, ne } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext, type ActorContext } from '@/server/modules/identity/service';
import { assignLeadershipRole, createGroup } from '@/server/modules/organization/service';
import { generateMeetingBriefForPeriod, listMeetingBriefs } from '@/server/modules/insights/service';
import {
  ensureActiveReportingPeriod,
  getReportDetailForGroup,
  listReportsForPeriod,
} from '@/server/modules/reporting/service';
import {
  assignTeamFieldPoint,
  listTeamFieldPoints,
  syncTeamGFieldPoints,
} from '@/server/modules/team-field-points/service';

const NOT_HELD = 'MARK-NOTHELD-ผู้นำป่วยหนัก';
const SUMMARY = 'MARK-SUMMARY-ครอบครัวนาย-ค';

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

describe('Q-5 and Q-6: notHeldReason and summaryNotes', () => {
  it('a pastor reads neither in the list nor in the detail; admin and Body Leader still do', async () => {
    await withDb(async (rt, admin) => {
      await rt.db
        .update(schema.weeklyReports)
        .set({ notHeldReason: NOT_HELD, summaryNotes: SUMMARY })
        .where(ne(schema.weeklyReports.status, 'draft'));
      const pastor = await actorFor(rt, SEED_IDS.users.pastor);
      const list = await listReportsForPeriod(rt.db, pastor);
      expect(list.length).toBeGreaterThan(0);
      expect(JSON.stringify(list)).not.toContain('MARK-');
      expect(list.every((r) => r.notHeldReason === null && r.summaryNotes === null)).toBe(true);

      const [one] = await rt.db.select().from(schema.weeklyReports).where(ne(schema.weeklyReports.status, 'draft'));
      const detail = await getReportDetailForGroup(rt.db, pastor, one!.periodId, one!.groupId);
      expect(JSON.stringify(detail)).not.toContain('MARK-');

      const forAdmin = await listReportsForPeriod(rt.db, admin);
      expect(forAdmin.some((r) => r.notHeldReason === NOT_HELD && r.summaryNotes === SUMMARY)).toBe(true);
      const body = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
      const forBody = await listReportsForPeriod(rt.db, body);
      expect(forBody.some((r) => r.summaryNotes === SUMMARY)).toBe(true);
    });
  });
});

describe('Q-7 and Q-9: Meeting Brief by role and scope', () => {
  async function makeBrief(rt: DbRuntime, admin: ActorContext) {
    // A second Body Leader, so the test can prove that one Body does not read the other Body.
    await assignLeadershipRole(rt.db, admin, {
      userId: SEED_IDS.users.standbyLeaderSouth,
      scopeType: 'body',
      bodyId: SEED_IDS.bodies.south,
      roleType: 'body_leader',
    });
    const period = await ensureActiveReportingPeriod(rt.db);
    const brief = await generateMeetingBriefForPeriod(rt.db, period.id, {
      isCronJob: true,
      now: new Date(period.briefScheduledAt.getTime() + 60_000),
    });
    return brief;
  }

  it('stores no follow-up title and no free text; the stored record is not changed by reads', async () => {
    await withDb(async (rt, admin) => {
      const brief = await makeBrief(rt, admin);
      const titles = (await rt.db.select().from(schema.followUpItems)).map((f) => f.title);
      expect(titles.length).toBeGreaterThan(0);
      const stored = JSON.stringify(brief);
      for (const t of titles) expect(stored).not.toContain(t);
      const before = JSON.stringify(await rt.db.select().from(schema.meetingBriefs));
      await listMeetingBriefs(rt.db, admin);
      await listMeetingBriefs(rt.db, await actorFor(rt, SEED_IDS.users.pastor));
      expect(JSON.stringify(await rt.db.select().from(schema.meetingBriefs))).toBe(before);
    });
  });

  it('admin: whole organization with group names; pastor: numbers only; no title anywhere', async () => {
    await withDb(async (rt, admin) => {
      await makeBrief(rt, admin);
      const groups = (await rt.db.select().from(schema.houseMissionGroups)).map((g) => g.nameTh);
      const titles = (await rt.db.select().from(schema.followUpItems)).map((f) => f.title);

      const forAdmin = await listMeetingBriefs(rt.db, admin);
      const current = forAdmin.find((b) => (b.sectionsJson as Record<string, unknown>).briefSchemaVersion === 2)!;
      expect(current.viewScope).toBe('organization_detail');
      expect(JSON.stringify(current)).toContain('กลุ่มพันธกิจบ้าน');
      for (const t of titles) expect(JSON.stringify(forAdmin)).not.toContain(t);

      const pastor = await actorFor(rt, SEED_IDS.users.pastor);
      const forPastor = await listMeetingBriefs(rt.db, pastor);
      expect(forPastor.length).toBeGreaterThan(0);
      for (const b of forPastor) {
        const text = JSON.stringify(b);
        expect(b.viewScope).toBe('organization_aggregate');
        for (const g of groups) expect(text, `group name ${g}`).not.toContain(g);
        for (const t of titles) expect(text).not.toContain(t);
        expect(text).not.toContain('bodySlices');
      }
      const pastorCurrent = forPastor.find((b) => b.id === current.id)!;
      expect((pastorCurrent.metricsJson as unknown as { expectedReports: number }).expectedReports).toBe(
        (current.metricsJson as unknown as { expectedReports: number }).expectedReports
      );
    });
  });

  it('a Body Leader reads only the own Body; the other Body Leader reads only theirs', async () => {
    await withDb(async (rt, admin) => {
      await makeBrief(rt, admin);
      const north = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
      const south = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      const groups = await rt.db.select().from(schema.houseMissionGroups);
      const northNames = groups.filter((g) => g.bodyId === SEED_IDS.bodies.north).map((g) => g.nameTh);
      const southNames = groups.filter((g) => g.bodyId === SEED_IDS.bodies.south).map((g) => g.nameTh);
      expect(northNames.length).toBeGreaterThan(0);
      expect(southNames.length).toBeGreaterThan(0);

      const forNorth = (await listMeetingBriefs(rt.db, north)).find((b) => (b.sectionsJson as Record<string, unknown>).briefSchemaVersion === 2)!;
      const forSouth = (await listMeetingBriefs(rt.db, south)).find((b) => (b.sectionsJson as Record<string, unknown>).briefSchemaVersion === 2)!;
      const n = JSON.stringify(forNorth);
      const s = JSON.stringify(forSouth);
      expect(forNorth.viewScope).toBe('body');
      for (const name of southNames) expect(n).not.toContain(name);
      for (const name of northNames) expect(s).not.toContain(name);
      expect(n).not.toContain('bodySlices');
      const nMetrics = forNorth.metricsJson as unknown as { activeGroups: number };
      const sMetrics = forSouth.metricsJson as unknown as { activeGroups: number };
      expect(nMetrics.activeGroups).toBe(northNames.length);
      expect(sMetrics.activeGroups).toBe(southNames.length);
      const rows = (forNorth.sectionsJson as unknown as { section4BodyBreakdown: Array<{ bodyName: string }> }).section4BodyBreakdown;
      expect(rows).toHaveLength(1);
    });
  });

  it('fails closed: a brief made before version 2 gives a Body Leader no numbers', async () => {
    await withDb(async (rt) => {
      const north = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
      const legacy = (await listMeetingBriefs(rt.db, north)).find((b) => !(b.sectionsJson as Record<string, unknown>).briefSchemaVersion)!;
      expect(legacy).toBeDefined();
      expect(legacy.viewScope).toBe('body');
      expect(Object.keys(legacy.metricsJson as object)).toHaveLength(0);
      expect(JSON.stringify(legacy)).not.toContain('กลุ่มบ้าน');
    });
  });

  it('refuses people without a brief role', async () => {
    await withDb(async (rt) => {
      for (const id of [SEED_IDS.users.leaderNongkung]) {
        await expect(listMeetingBriefs(rt.db, await actorFor(rt, id))).rejects.toMatchObject({ status: 403 });
      }
    });
  });

  it('structure guard: only the insights service reads meeting_briefs, and the route builds the view', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) {
          const text = readFileSync(p, 'utf8');
          if (/from\(\s*meetingBriefs\s*\)/.test(text)) offenders.push(path.relative(process.cwd(), p));
        }
      }
    };
    walk(path.join(process.cwd(), 'src'));
    expect(offenders.sort()).toEqual(['src/server/modules/insights/service.ts']);
    const route = readFileSync(path.join(process.cwd(), 'src/app/api/v1/insights/route.ts'), 'utf8');
    expect(route).toContain('buildMeetingBriefView(brief, actor)');
  });
});

describe('Q-8: team field point mapping', () => {
  it('migration 0004 is additive and only adds nullable columns', () => {
    const sql = readFileSync(path.join(process.cwd(), 'drizzle/0004_team_field_points_scope.sql'), 'utf8');
    expect(sql.replace(/ON (DELETE|UPDATE) [a-z ]+?(;|\n)/gi, "$2")).not.toMatch(/DROP|TRUNCATE|DELETE|UPDATE\s|NOT NULL/i);
    expect(sql.match(/ADD COLUMN/g)).toHaveLength(4);
  });

  it('old rows start unmapped; only admins read them; no link is guessed', async () => {
    await withDb(async (rt, admin) => {
      await syncTeamGFieldPoints(rt.db, admin);
      const rows = await rt.db.select().from(schema.teamFieldPoints);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.bodyId === null && r.coordinatorUserId === null)).toBe(true);
      const north = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
      await expect(listTeamFieldPoints(rt.db, north)).rejects.toMatchObject({ status: 403 });
      expect((await listTeamFieldPoints(rt.db, admin)).length).toBe(rows.length);
    });
  });

  it('only an admin assigns, with a valid active Body and user, and the action is audited', async () => {
    await withDb(async (rt, admin) => {
      await syncTeamGFieldPoints(rt.db, admin);
      const [point] = await rt.db.select().from(schema.teamFieldPoints);
      const north = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
      await expect(
        assignTeamFieldPoint(rt.db, north, { pointId: point!.id, bodyId: SEED_IDS.bodies.north, coordinatorUserId: null })
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        assignTeamFieldPoint(rt.db, admin, { pointId: point!.id, bodyId: '00000000-0000-4000-8000-000000000000', coordinatorUserId: null })
      ).rejects.toMatchObject({ code: 'BODY_INVALID' });
      await expect(
        assignTeamFieldPoint(rt.db, admin, { pointId: point!.id, bodyId: null, coordinatorUserId: '00000000-0000-4000-8000-000000000000' })
      ).rejects.toMatchObject({ code: 'COORDINATOR_INVALID' });
      await assignTeamFieldPoint(rt.db, admin, { pointId: point!.id, bodyId: SEED_IDS.bodies.north, coordinatorUserId: null });
      const logs = await rt.db.select().from(schema.securityAuditLogs);
      expect(logs.some((l) => l.action === 'TEAM_FIELD_POINT_ASSIGNED' && l.targetId === point!.id)).toBe(true);
    });
  });

  it('after the mapping is complete: Body Leader reads own Body only, coordinator reads own point, others read nothing', async () => {
    await withDb(async (rt, admin) => {
      await syncTeamGFieldPoints(rt.db, admin);
      const points = await rt.db.select().from(schema.teamFieldPoints);
      // Admin maps the first point to the south Body with an assigned coordinator, every other point to the north Body.
      const [first, ...rest] = points;
      await assignTeamFieldPoint(rt.db, admin, {
        pointId: first!.id,
        bodyId: SEED_IDS.bodies.south,
        coordinatorUserId: SEED_IDS.users.leaderNongkung,
      });
      // Gate: one point is still unmapped, so nobody except admin reads anything.
      if (rest.length > 1) {
        for (const p of rest.slice(1)) {
          await assignTeamFieldPoint(rt.db, admin, { pointId: p.id, bodyId: SEED_IDS.bodies.north, coordinatorUserId: null });
        }
        const north = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
        await expect(listTeamFieldPoints(rt.db, north)).rejects.toMatchObject({ status: 403 });
      }
      await assignTeamFieldPoint(rt.db, admin, { pointId: rest[0]!.id, bodyId: SEED_IDS.bodies.north, coordinatorUserId: null });

      const north = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
      const seenNorth = await listTeamFieldPoints(rt.db, north);
      expect(seenNorth).toHaveLength(points.length - 1);
      expect(seenNorth.some((p) => p.id === first!.id)).toBe(false);
      expect(seenNorth.every((p) => p.bodyId === null && p.coordinatorUserId === null)).toBe(true);
      expect(seenNorth.every((p) => p.phone === null || p.phone.startsWith('***'))).toBe(true);

      const coordinator = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const seenCoord = await listTeamFieldPoints(rt.db, coordinator);
      expect(seenCoord.map((p) => p.id)).toEqual([first!.id]);

      const pastor = await actorFor(rt, SEED_IDS.users.pastor);
      await expect(listTeamFieldPoints(rt.db, pastor)).rejects.toMatchObject({ status: 403 });
      const stranger = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      await expect(listTeamFieldPoints(rt.db, stranger)).rejects.toMatchObject({ status: 403 });
    });
  });

  it('a sync of the source list keeps the mapping', async () => {
    await withDb(async (rt, admin) => {
      await syncTeamGFieldPoints(rt.db, admin);
      const [point] = await rt.db.select().from(schema.teamFieldPoints);
      await assignTeamFieldPoint(rt.db, admin, { pointId: point!.id, bodyId: SEED_IDS.bodies.north, coordinatorUserId: null });
      await syncTeamGFieldPoints(rt.db, admin);
      const [after] = await rt.db.select().from(schema.teamFieldPoints).where(eq(schema.teamFieldPoints.id, point!.id));
      expect(after!.bodyId).toBe(SEED_IDS.bodies.north);
    });
  });
});
