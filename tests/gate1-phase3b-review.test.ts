import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext, type ActorContext } from '@/server/modules/identity/service';
import {
  assignUnassignedGroupBody,
  linkStewardAssignmentToUser,
  previewImportForActor,
  promoteStagingBatch,
  rollbackImportBatch,
  stageImportBatch,
} from '@/server/modules/ingestion/service';
import { importPayloadSchema } from '@/server/modules/ingestion/payload-schema';
import { assignCareSteward, createProvisionalCare } from '@/server/modules/cares/service';
import { listIngestionOverview } from '@/server/modules/ingestion/service';
import { listTeamFieldPoints, syncTeamGFieldPoints } from '@/server/modules/team-field-points/service';

async function withDb<T>(fn: (rt: DbRuntime, admin: ActorContext) => Promise<T>): Promise<T> {
  const rt = await createInMemoryTestRuntime();
  try {
    await ensureSchema(rt);
    await ensureSeeded(rt.db);
    const [u] = await rt.db.select().from(schema.users).where(eq(schema.users.id, SEED_IDS.users.admin));
    return await fn(rt, await buildActorContext(rt.db, u!));
  } finally {
    await rt.close();
  }
}

async function actorFor(rt: DbRuntime, id: string) {
  const [u] = await rt.db.select().from(schema.users).where(eq(schema.users.id, id));
  return buildActorContext(rt.db, u!);
}

function payload(opts: {
  tag: string;
  members?: Array<{ ref: string; full?: string | null; nick?: string | null }>;
  leader?: string;
  coordinator?: string;
}) {
  const file = `${opts.tag}.xlsx`;
  return {
    sourceArchiveName: file,
    groups: [
      {
        groupRef: `G-${opts.tag}`,
        groupNameFromSheet: `กลุ่ม ${opts.tag}`,
        careCode: `C-${opts.tag}`,
        district: 'เมืองกาฬสินธุ์',
        leader: opts.leader,
        coordinator: opts.coordinator,
        sourceFile: file,
        sourceSheet: `G-${opts.tag}`,
      },
    ],
    members: (opts.members ?? []).map((m, i) => ({
      memberRowRef: m.ref,
      groupRef: `G-${opts.tag}`,
      sourceFile: file,
      sourceSheet: `G-${opts.tag}`,
      sourceRow: i + 5,
      fullNameRaw: m.full ?? null,
      nicknameRaw: m.nick ?? null,
      disciplerNameRaw: 'พี่เลี้ยง',
      discipleshipGoalRaw: 'อ่านพระคัมภีร์',
      targetTimeframeRaw: 'สิ้นเดือน',
    })),
  };
}

describe('Gate 1: rollback never destroys protected data', () => {
  it('archives instead of deleting when a promoted member was verified by a human', async () => {
    await withDb(async (rt, admin) => {
      const staged = await stageImportBatch(rt.db, admin, payload({ tag: 'RB1', members: [{ ref: 'M-RB1-1', full: 'สมศรี ตรวจแล้ว', nick: 'ศรี' }] }));
      await promoteStagingBatch(rt.db, admin, staged.batch.id);
      await rt.db.update(schema.members).set({ verificationStatus: 'verified' }).where(eq(schema.members.memberCode, 'M-RB1-1'));

      const result = await rollbackImportBatch(rt.db, admin, staged.batch.id, 'ทดสอบ');
      expect(result.archivedInsteadOfDeleted).toBe(true);
      const kept = await rt.db.select().from(schema.members).where(eq(schema.members.memberCode, 'M-RB1-1'));
      expect(kept).toHaveLength(1);
      expect(kept[0]!.verificationStatus).toBe('verified');
      const [group] = await rt.db.select().from(schema.houseMissionGroups).where(eq(schema.houseMissionGroups.groupCode, 'G-RB1'));
      expect(group!.status).toBe('archived');
    });
  });

  it('archives instead of deleting when a steward assignment is linked to a real account', async () => {
    await withDb(async (rt, admin) => {
      const staged = await stageImportBatch(rt.db, admin, payload({ tag: 'RB2', leader: 'นายหัวหน้า ทดสอบ', members: [{ ref: 'M-RB2-1', full: 'ผู้ร่วมกลุ่ม หนึ่ง' }] }));
      await promoteStagingBatch(rt.db, admin, staged.batch.id);
      const [grp] = await rt.db.select().from(schema.houseMissionGroups).where(eq(schema.houseMissionGroups.groupCode, 'G-RB2'));
      const [asg] = await rt.db.select().from(schema.assignments).where(eq(schema.assignments.groupId, grp!.id));
      await linkStewardAssignmentToUser(rt.db, admin, asg!.id, SEED_IDS.users.standbyLeaderSouth);

      const result = await rollbackImportBatch(rt.db, admin, staged.batch.id, 'ทดสอบ');
      expect(result.archivedInsteadOfDeleted).toBe(true);
      const still = await rt.db.select().from(schema.assignments).where(eq(schema.assignments.id, asg!.id));
      expect(still).toHaveLength(1);
      expect(still[0]!.userId).toBe(SEED_IDS.users.standbyLeaderSouth);
    });
  });

  it('archives when a promoted member already has attendance history', async () => {
    await withDb(async (rt, admin) => {
      const staged = await stageImportBatch(rt.db, admin, payload({ tag: 'RB3', members: [{ ref: 'M-RB3-1', full: 'มีประวัติ เข้าร่วม' }] }));
      await promoteStagingBatch(rt.db, admin, staged.batch.id);
      const [member] = await rt.db.select().from(schema.members).where(eq(schema.members.memberCode, 'M-RB3-1'));
      const [existingReport] = await rt.db.select().from(schema.weeklyReports).limit(1);
      await rt.db.insert(schema.attendanceRecords).values({ weeklyReportId: existingReport!.id, memberId: member!.id, attendanceStatus: 'present' });

      const result = await rollbackImportBatch(rt.db, admin, staged.batch.id, 'ทดสอบ');
      expect(result.archivedInsteadOfDeleted).toBe(true);
      expect(await rt.db.select().from(schema.attendanceRecords).where(eq(schema.attendanceRecords.memberId, member!.id))).toHaveLength(1);
    });
  });

  it('still removes an untouched batch completely (existing behavior kept)', async () => {
    await withDb(async (rt, admin) => {
      const staged = await stageImportBatch(rt.db, admin, payload({ tag: 'RB4', members: [{ ref: 'M-RB4-1', full: 'ไม่มีใครแตะ' }] }));
      await promoteStagingBatch(rt.db, admin, staged.batch.id);
      const result = await rollbackImportBatch(rt.db, admin, staged.batch.id, 'ทดสอบ');
      expect(result.archivedInsteadOfDeleted).toBe(false);
      expect(await rt.db.select().from(schema.members).where(eq(schema.members.memberCode, 'M-RB4-1'))).toHaveLength(0);
      expect(await rt.db.select().from(schema.houseMissionGroups).where(eq(schema.houseMissionGroups.groupCode, 'G-RB4'))).toHaveLength(0);
    });
  });
});

describe('Gate 1: a reused member code must never merge two different people', () => {
  it('blocks promotion when a row reference matches an existing member with a different name', async () => {
    await withDb(async (rt, admin) => {
      const [existing] = await rt.db
        .insert(schema.members)
        .values({ memberCode: 'M-COL-1', fullName: 'อัญชลี เดิมอยู่', displayName: 'อัญ', verificationStatus: 'verified' })
        .returning();
      const staged = await stageImportBatch(rt.db, admin, payload({ tag: 'COL', members: [{ ref: 'M-COL-1', full: 'บุญมา คนละคน', nick: 'มา' }] }));
      const res = await promoteStagingBatch(rt.db, admin, staged.batch.id);
      expect(res.promotedMembersCount).toBe(0);
      expect(res.promotedGrowthRecordsCount).toBe(0);
      expect(res.skippedIncompleteMembers).toBe(1);

      const [row] = await rt.db.select().from(schema.stagingMemberRows).where(eq(schema.stagingMemberRows.batchId, staged.batch.id));
      expect(row!.dataStatus).toBe('conflict');
      expect(row!.promotedMemberId).toBeNull();
      const issues = await rt.db.select().from(schema.dataQualityIssues).where(eq(schema.dataQualityIssues.batchId, staged.batch.id));
      expect(issues.filter((i) => i.issueCode === 'member_code_collision')).toHaveLength(1);

      // The existing person is untouched: no new group link, no growth record.
      expect(await rt.db.select().from(schema.groupMemberships).where(eq(schema.groupMemberships.memberId, existing!.id))).toHaveLength(0);
      expect(await rt.db.select().from(schema.memberGrowthRecords).where(eq(schema.memberGrowthRecords.memberId, existing!.id))).toHaveLength(0);

      // Promoting again must not create a second issue.
      await promoteStagingBatch(rt.db, admin, staged.batch.id);
      const again = await rt.db.select().from(schema.dataQualityIssues).where(eq(schema.dataQualityIssues.batchId, staged.batch.id));
      expect(again.filter((i) => i.issueCode === 'member_code_collision')).toHaveLength(1);
    });
  });
});

describe('Gate 1: sheet "ผู้รับผิดชอบกลุ่ม" is the Group Leader (approved glossary)', () => {
  it('imports the leader as group_leader and the coordinator as coordinator, both unlinked', async () => {
    await withDb(async (rt, admin) => {
      const staged = await stageImportBatch(rt.db, admin, payload({ tag: 'ROLE', leader: 'นายหัวหน้า', coordinator: 'นางประสาน' }));
      await promoteStagingBatch(rt.db, admin, staged.batch.id);
      const [grp] = await rt.db.select().from(schema.houseMissionGroups).where(eq(schema.houseMissionGroups.groupCode, 'G-ROLE'));
      const rows = await rt.db.select().from(schema.assignments).where(eq(schema.assignments.groupId, grp!.id));
      const leader = rows.find((r) => r.stewardDisplayName === 'นายหัวหน้า')!;
      const coord = rows.find((r) => r.stewardDisplayName === 'นางประสาน')!;
      expect(leader.roleType).toBe('group_leader');
      expect(coord.roleType).toBe('coordinator');
      expect(leader.userId).toBeNull();
      expect(leader.linkStatus).toBe('unlinked_pending_account');

      // Before linking: no permission. After linking: group leader scope, not supervisor scope.
      const standby = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      expect(standby.assignedGroupIds.has(grp!.id)).toBe(false);
      await linkStewardAssignmentToUser(rt.db, admin, leader.id, SEED_IDS.users.standbyLeaderSouth);
      const linked = await actorFor(rt, SEED_IDS.users.standbyLeaderSouth);
      expect(linked.groupLeaderGroupIds.has(grp!.id)).toBe(true);
      expect(linked.supervisorGroupIds.has(grp!.id)).toBe(false);
    });
  });
});

describe('Gate 1: steward linking and group body assignment are validated', () => {
  it('links only an unlinked, current assignment to an existing, usable account', async () => {
    await withDb(async (rt, admin) => {
      const staged = await stageImportBatch(rt.db, admin, payload({ tag: 'LNK', leader: 'หัวหน้า ลิงก์', coordinator: 'ผู้ประสาน ลิงก์' }));
      await promoteStagingBatch(rt.db, admin, staged.batch.id);
      const [grp] = await rt.db.select().from(schema.houseMissionGroups).where(eq(schema.houseMissionGroups.groupCode, 'G-LNK'));
      const rows = await rt.db.select().from(schema.assignments).where(eq(schema.assignments.groupId, grp!.id));
      const leader = rows.find((r) => r.roleType === 'group_leader')!;
      const coord = rows.find((r) => r.roleType === 'coordinator')!;

      await expect(
        linkStewardAssignmentToUser(rt.db, admin, leader.id, '99999999-9999-4999-8999-999999999999')
      ).rejects.toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });

      await rt.db.update(schema.users).set({ status: 'suspended' }).where(eq(schema.users.id, SEED_IDS.users.standbyLeaderSouth));
      await expect(
        linkStewardAssignmentToUser(rt.db, admin, leader.id, SEED_IDS.users.standbyLeaderSouth)
      ).rejects.toMatchObject({ status: 409, code: 'USER_NOT_ACTIVE' });
      await rt.db.update(schema.users).set({ status: 'active' }).where(eq(schema.users.id, SEED_IDS.users.standbyLeaderSouth));

      await linkStewardAssignmentToUser(rt.db, admin, leader.id, SEED_IDS.users.standbyLeaderSouth);
      // Re-pointing an already linked assignment to another account is refused.
      await expect(
        linkStewardAssignmentToUser(rt.db, admin, leader.id, SEED_IDS.users.leaderYangtalat)
      ).rejects.toMatchObject({ status: 409, code: 'ASSIGNMENT_ALREADY_LINKED' });
      // The same account cannot take a second role in the same group through linking.
      await expect(
        linkStewardAssignmentToUser(rt.db, admin, coord.id, SEED_IDS.users.standbyLeaderSouth)
      ).rejects.toMatchObject({ status: 409, code: 'USER_ALREADY_ASSIGNED' });
    });
  });

  it('assigns a body only to a group without one, and only to a body that exists', async () => {
    await withDb(async (rt, admin) => {
      const staged = await stageImportBatch(rt.db, admin, payload({ tag: 'BODY' }));
      await promoteStagingBatch(rt.db, admin, staged.batch.id);
      const [grp] = await rt.db.select().from(schema.houseMissionGroups).where(eq(schema.houseMissionGroups.groupCode, 'G-BODY'));

      await expect(
        assignUnassignedGroupBody(rt.db, admin, grp!.id, '99999999-9999-4999-8999-999999999999')
      ).rejects.toMatchObject({ status: 404, code: 'BODY_NOT_FOUND' });

      const ok = await assignUnassignedGroupBody(rt.db, admin, grp!.id, SEED_IDS.bodies.north);
      expect(ok.bodyId).toBe(SEED_IDS.bodies.north);

      await expect(
        assignUnassignedGroupBody(rt.db, admin, grp!.id, SEED_IDS.bodies.south)
      ).rejects.toMatchObject({ status: 409, code: 'GROUP_ALREADY_ASSIGNED' });
      const [after] = await rt.db.select().from(schema.houseMissionGroups).where(eq(schema.houseMissionGroups.id, grp!.id));
      expect(after!.bodyId).toBe(SEED_IDS.bodies.north);
    });
  });
});

describe('Gate 1: import preview is admin-only and size-limited', () => {
  it('rejects a non-admin and accepts an admin', async () => {
    await withDb(async (rt, admin) => {
      const body = importPayloadSchema.parse(payload({ tag: 'PRV' }));
      const nonAdmin = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      expect(() => previewImportForActor(nonAdmin, body)).toThrowError(/ผู้ดูแลระบบ/);
      expect(previewImportForActor(admin, body).totalGroups).toBe(1);
    });
  });

  it('rejects payloads over the size limits', () => {
    const g = payload({ tag: 'BIG' }).groups[0]!;
    expect(importPayloadSchema.safeParse({ sourceArchiveName: 'x', groups: Array(501).fill(g), members: [] }).success).toBe(false);
    const m = payload({ tag: 'BIG', members: [{ ref: 'a', full: 'x' }] }).members[0]!;
    expect(importPayloadSchema.safeParse({ sourceArchiveName: 'x', groups: [g], members: Array(20001).fill(m) }).success).toBe(false);
    expect(
      importPayloadSchema.safeParse({ sourceArchiveName: 'x', groups: [{ ...g, meetingPlace: 'ก'.repeat(2001) }], members: [] }).success
    ).toBe(false);
  });
});

describe('Gate 1: care steward changes are all-or-nothing', () => {
  it('keeps the current primary when promoting an existing secondary fails, and promotes it correctly', async () => {
    await withDb(async (rt, admin) => {
      const care = await createProvisionalCare(rt.db, admin, { careCode: 'C-TX-1' });
      const a = await assignCareSteward(rt.db, admin, { careId: care.id, userId: SEED_IDS.users.leaderNongkung, roleType: 'care_leader', isPrimary: true });
      const b = await assignCareSteward(rt.db, admin, { careId: care.id, userId: SEED_IDS.users.leaderNonthan, roleType: 'care_leader', isPrimary: false });

      // Promote B (already an active secondary) to primary: A must be replaced, B must become primary, no error.
      const promoted = await assignCareSteward(rt.db, admin, { careId: care.id, userId: SEED_IDS.users.leaderNonthan, roleType: 'care_leader', isPrimary: true });
      expect(promoted.id).toBe(b.id);
      const rows = await rt.db.select().from(schema.assignments).where(and(eq(schema.assignments.careId, care.id)));
      const active = rows.filter((r) => r.effectiveTo === null);
      expect(active.filter((r) => r.isPrimary)).toHaveLength(1);
      expect(active.find((r) => r.isPrimary)!.userId).toBe(SEED_IDS.users.leaderNonthan);
      expect(rows.find((r) => r.id === a.id)!.effectiveTo).not.toBeNull();
    });
  });

  it('is idempotent for the same account and role, and refuses to silently demote a primary', async () => {
    await withDb(async (rt, admin) => {
      const care = await createProvisionalCare(rt.db, admin, { careCode: 'C-TX-2' });
      const a = await assignCareSteward(rt.db, admin, { careId: care.id, userId: SEED_IDS.users.leaderNongkung, roleType: 'care_leader', isPrimary: true });
      const again = await assignCareSteward(rt.db, admin, { careId: care.id, userId: SEED_IDS.users.leaderNongkung, roleType: 'care_leader', isPrimary: true });
      expect(again.id).toBe(a.id);
      await expect(
        assignCareSteward(rt.db, admin, { careId: care.id, userId: SEED_IDS.users.leaderNongkung, roleType: 'care_leader', isPrimary: false })
      ).rejects.toMatchObject({ status: 409, code: 'CARE_PRIMARY_DEMOTE' });
      const active = (await rt.db.select().from(schema.assignments).where(eq(schema.assignments.careId, care.id))).filter((r) => r.effectiveTo === null);
      expect(active).toHaveLength(1);
    });
  });
});


describe('Gate 1: an account with no organizational scope cannot read internal registries', () => {
  async function unscopedUser(rt: DbRuntime) {
    // A user such as one approved from a LINE registration: active, no assignment, standard role.
    const [u] = await rt.db
      .insert(schema.users)
      .values({ username: 'line-unscoped', displayName: 'ไม่มีขอบเขต', systemRole: 'standard_user', status: 'active' })
      .returning();
    return buildActorContext(rt.db, u!);
  }

  it('field points: only admins can read (owner decision Q-3, DEC-06); everyone else is refused, unscoped or scoped', async () => {
    await withDb(async (rt, admin) => {
      await syncTeamGFieldPoints(rt.db, admin);
      const unscoped = await unscopedUser(rt);
      await expect(listTeamFieldPoints(rt.db, unscoped)).rejects.toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });

      const leader = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      await expect(listTeamFieldPoints(rt.db, leader)).rejects.toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });
      const forAdmin = await listTeamFieldPoints(rt.db, admin);
      expect(forAdmin.some((p) => p.phone && !p.phone.startsWith('***'))).toBe(true);
    });
  });

  it('ingestion overview: unscoped and plain group leaders are refused; admins and body leaders can read', async () => {
    await withDb(async (rt, admin) => {
      const unscoped = await unscopedUser(rt);
      await expect(listIngestionOverview(rt.db, unscoped)).rejects.toMatchObject({ status: 403 });
      const groupLeader = await actorFor(rt, SEED_IDS.users.leaderNongkung);
      await expect(listIngestionOverview(rt.db, groupLeader)).rejects.toMatchObject({ status: 403 });

      const bodyLeader = await actorFor(rt, SEED_IDS.users.bodyLeaderNorth);
      const view = await listIngestionOverview(rt.db, bodyLeader);
      expect(view.batches).toEqual([]);
      expect(view.linkableUsers).toEqual([]);
      expect((await listIngestionOverview(rt.db, admin)).bodies.length).toBeGreaterThan(0);
    });
  });
});


describe('Gate 1: promoting a group code that already exists is a clear conflict', () => {
  it('returns 409 and leaves the first batch untouched', async () => {
    await withDb(async (rt, admin) => {
      const first = await stageImportBatch(rt.db, admin, payload({ tag: 'DUP', members: [{ ref: 'M-DUP-1', full: 'คนแรก' }] }));
      await promoteStagingBatch(rt.db, admin, first.batch.id);

      const second = payload({ tag: 'DUP', members: [{ ref: 'M-DUP-2', full: 'คนที่สอง' }] });
      second.sourceArchiveName = 'dup-second-file.xlsx';
      const staged2 = await stageImportBatch(rt.db, admin, second);
      await expect(promoteStagingBatch(rt.db, admin, staged2.batch.id)).rejects.toMatchObject({
        status: 409,
        code: 'PROMOTION_CONFLICT',
      });
      // Nothing from the second batch was saved, and the first batch is intact.
      expect(await rt.db.select().from(schema.members).where(eq(schema.members.memberCode, 'M-DUP-2'))).toHaveLength(0);
      expect(await rt.db.select().from(schema.members).where(eq(schema.members.memberCode, 'M-DUP-1'))).toHaveLength(1);
      expect(await rt.db.select().from(schema.houseMissionGroups).where(eq(schema.houseMissionGroups.groupCode, 'G-DUP'))).toHaveLength(1);
    });
  });
});
