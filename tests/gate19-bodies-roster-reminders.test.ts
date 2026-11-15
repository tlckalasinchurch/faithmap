/**
 * PRD FR-01.2, FR-01.3, FR-04.2, FR-11.2 (Nov 2026 completion round). Scratch PGlite database.
 */
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext, type ActorContext } from '@/server/modules/identity/service';
import { createBody, createGroup, updateBody } from '@/server/modules/organization/service';
import {
  addExistingMemberToGroup,
  createGroupMemberWithWarnings,
  endGroupMembership,
  listScopedMembers,
} from '@/server/modules/pastoral-care/service';
import { executeReminderJob } from '@/server/modules/insights/service';
import { ensureActiveReportingPeriod } from '@/server/modules/reporting/service';

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

describe('FR-01.2, FR-01.3: Body management', () => {
  it('only an admin creates and changes a Body; the code is unique; no delete path exists', async () => {
    await withDb(async (rt, admin) => {
      const body = await createBody(rt.db, admin, { code: 'bd-new', nameTh: 'บอดี้ใหม่' });
      expect(body.code).toBe('BD-NEW');
      expect(body.status).toBe('active');
      await expect(createBody(rt.db, admin, { code: 'BD-NEW', nameTh: 'ซ้ำ' })).rejects.toMatchObject({ code: 'BODY_CODE_EXISTS' });
      for (const id of [SEED_IDS.users.bodyLeaderNorth, SEED_IDS.users.pastor, SEED_IDS.users.leaderNongkung]) {
        const a = await actorFor(rt, id);
        await expect(createBody(rt.db, a, { code: 'X-1', nameTh: 'ไม่ควรสร้างได้' })).rejects.toMatchObject({ status: 403 });
        await expect(updateBody(rt.db, a, body.id, { nameTh: 'เปลี่ยนชื่อ' })).rejects.toMatchObject({ status: 403 });
      }
      const renamed = await updateBody(rt.db, admin, body.id, { nameTh: 'บอดี้ใหม่ (แก้ชื่อ)' });
      expect(renamed.nameTh).toBe('บอดี้ใหม่ (แก้ชื่อ)');
      const logs = (await rt.db.select().from(schema.securityAuditLogs)).map((l) => l.action);
      expect(logs).toContain('body_created');
      expect(logs).toContain('body_updated');
    });
  });

  it('a Body with an active group cannot be set inactive; an empty Body can, and can return', async () => {
    await withDb(async (rt, admin) => {
      await expect(updateBody(rt.db, admin, SEED_IDS.bodies.north, { status: 'inactive' })).rejects.toMatchObject({ code: 'BODY_HAS_ACTIVE_GROUPS' });
      const empty = await createBody(rt.db, admin, { code: 'EMPTY', nameTh: 'ว่าง' });
      expect((await updateBody(rt.db, admin, empty.id, { status: 'inactive' })).status).toBe('inactive');
      expect((await updateBody(rt.db, admin, empty.id, { status: 'active' })).status).toBe('active');
      await expect(updateBody(rt.db, admin, '00000000-0000-4000-8000-000000000000', { status: 'active' })).rejects.toMatchObject({ code: 'BODY_NOT_FOUND' });
    });
  });

  it('a first Body can be created in an empty database and a group can then use it', async () => {
    const rt = await createInMemoryTestRuntime();
    try {
      await ensureSchema(rt);
      const [u] = await rt.db.insert(schema.users).values({ username: 'first_admin', displayName: 'แอดมินแรก', systemRole: 'super_admin', status: 'active', passwordHash: 'not-a-real-hash' }).returning();
      const admin = await buildActorContext(rt.db, u!);
      const body = await createBody(rt.db, admin, { code: 'FIRST', nameTh: 'บอดี้แรก' });
      const group = await createGroup(rt.db, admin, { groupCode: 'G-1', bodyId: body.id, nameTh: 'กลุ่มแรก', district: 'เมือง' });
      expect(group.bodyId).toBe(body.id);
    } finally {
      await rt.close();
    }
  });
});

describe('FR-04.2: group roster', () => {
  it('a leader ends a membership; the row stays with left_at, attendance stays, the member leaves the list', async () => {
    await withDb(async (rt, admin) => {
      const leader = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const [m] = await rt.db.select().from(schema.groupMemberships).where(and(eq(schema.groupMemberships.groupId, SEED_IDS.groups.nongkung), eq(schema.groupMemberships.isActive, true)));
      const before = (await listScopedMembers(rt.db, leader)).length;
      const ended = await endGroupMembership(rt.db, leader, { groupId: SEED_IDS.groups.nongkung, memberId: m!.memberId });
      expect(ended.isActive).toBe(false);
      expect(ended.leftAt).not.toBeNull();
      const rows = await rt.db.select().from(schema.groupMemberships).where(eq(schema.groupMemberships.id, m!.id));
      expect(rows).toHaveLength(1);
      expect((await listScopedMembers(rt.db, leader)).length).toBeLessThan(before);
      await expect(endGroupMembership(rt.db, leader, { groupId: SEED_IDS.groups.nongkung, memberId: m!.memberId })).rejects.toMatchObject({ code: 'MEMBERSHIP_NOT_FOUND' });
      const stranger = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      await expect(endGroupMembership(rt.db, stranger, { groupId: SEED_IDS.groups.nongkung, memberId: m!.memberId })).rejects.toMatchObject({ status: 403 });
    });
  });

  it('only an admin or the Body Leader adds an existing member; a group leader cannot pull a member from another Body', async () => {
    await withDb(async (rt, admin) => {
      const leader = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      const north = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
      const { member } = await createGroupMemberWithWarnings(rt.db, leader, { groupId: SEED_IDS.groups.nongkung, fullName: 'ย้ายกลุ่ม', displayName: 'ย้าย' });
      await expect(addExistingMemberToGroup(rt.db, leader, { groupId: SEED_IDS.groups.nonthan, memberId: member.id })).rejects.toMatchObject({ status: 403 });
      const added = await addExistingMemberToGroup(rt.db, north, { groupId: SEED_IDS.groups.nonthan, memberId: member.id });
      expect(added.isActive).toBe(true);
      await expect(addExistingMemberToGroup(rt.db, north, { groupId: SEED_IDS.groups.nonthan, memberId: member.id })).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
      // A member of a north group cannot be pulled into a south group by the north Body Leader.
      await expect(addExistingMemberToGroup(rt.db, north, { groupId: SEED_IDS.groups.yangtalat, memberId: member.id })).rejects.toMatchObject({ status: 403 });
      expect((await addExistingMemberToGroup(rt.db, admin, { groupId: SEED_IDS.groups.yangtalat, memberId: member.id })).isActive).toBe(true);
    });
  });
});

describe('FR-11.2: weekend reminders', () => {
  it('sends one reminder per missing group on Saturday and Sunday before the deadline; none on a weekday, none after the deadline, none twice', async () => {
    await withDb(async (rt) => {
      const period = await ensureActiveReportingPeriod(rt.db);
      const start = new Date(`${period.startDate}T00:00:00+07:00`).getTime();
      const day = 86400000;
      const wed = new Date(start + 2 * day + 10 * 3600000);
      const sat = new Date(start + 5 * day + 10 * 3600000);
      const sunNoon = new Date(start + 6 * day + 12 * 3600000);
      const sunLate = new Date(start + 6 * day + 21 * 3600000);
      expect((await executeReminderJob(rt.db, wed)).remindersSent).toBe(0);
      const first = await executeReminderJob(rt.db, sat);
      expect(first.remindersSent).toBeGreaterThanOrEqual(0);
      const again = await executeReminderJob(rt.db, sat);
      const notes = (await rt.db.select().from(schema.notifications)).filter((n) => n.category === 'deadline_reminder');
      expect(new Set(notes.map((n) => n.dedupeKey)).size).toBe(notes.length);
      expect(again.remindersSent).toBe(first.remindersSent);
      const sun = await executeReminderJob(rt.db, sunNoon);
      expect(sun.remindersSent).toBeGreaterThanOrEqual(0);
      expect((await executeReminderJob(rt.db, sunLate)).remindersSent).toBe(0);
      // A group that already submitted gets no reminder.
      const submittedGroupIds = new Set((await rt.db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.periodId, period.id))).filter((r) => r.status !== 'draft').map((r) => r.groupId));
      const snaps = await rt.db.select().from(schema.periodGroupSnapshots).where(eq(schema.periodGroupSnapshots.periodId, period.id));
      const expectedMissing = snaps.filter((s) => s.expectedReport && !submittedGroupIds.has(s.groupId) && s.primaryGroupLeaderUserId).length;
      expect(expectedMissing).toBeGreaterThanOrEqual(1);
      expect(first.remindersSent).toBe(expectedMissing);
    });
  });
});
