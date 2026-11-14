import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createInMemoryTestRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import {
  assignments,
  houseMissionGroups,
  members,
  weeklyReports,
  reportingPeriods,
  users,
} from '@/server/db/schema';
import { buildActorContext } from '@/server/modules/identity/service';
import {
  assignUnassignedGroupBody,
  confirmCandidateLocation,
  linkStewardAssignmentToUser,
  listIngestionOverview,
  previewImportPayload,
  promoteStagingBatch,
  resolveDataQualityIssue,
  rollbackImportBatch,
  saveCareBodyMapping,
  saveDistrictMapping,
  stageImportBatch,
} from '@/server/modules/ingestion/service';

async function expectPgError(promise: Promise<unknown>, pattern: RegExp) {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  const parts: string[] = [];
  let cursor: unknown = caught;
  while (cursor && typeof cursor === 'object') {
    if ('message' in cursor && typeof (cursor as { message: unknown }).message === 'string') {
      parts.push((cursor as { message: string }).message);
    }
    cursor = 'cause' in cursor ? (cursor as { cause: unknown }).cause : undefined;
  }
  expect(parts.join(' | ')).toMatch(pattern);
}

describe('Phase 2: Flexible Schema, Staging Import, DQ Review & Rollback', () => {
  it('supports incomplete groups/members, unlinked stewards, idempotent staging, promotion, scope guards, and safe rollback', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [adminUser] = await runtime.db
        .select()
        .from(users)
        .where(eq(users.id, SEED_IDS.users.admin));
      const [bodyLeaderUser] = await runtime.db
        .select()
        .from(users)
        .where(eq(users.id, SEED_IDS.users.bodyLeaderNorth));
      const adminActor = await buildActorContext(runtime.db, adminUser!);
      const bodyLeaderActor = await buildActorContext(runtime.db, bodyLeaderUser!);

      // 1. Incomplete group (no body, no GPS, no meeting day/place)
      const [incompleteGroup] = await runtime.db
        .insert(houseMissionGroups)
        .values({
          groupCode: 'TEST-INCOMPLETE-01',
          bodyId: null,
          nameTh: 'กลุ่มทดสอบรอข้อมูล',
          district: 'เมือง',
          assignmentStatus: 'pending_assignment',
          locationStatus: 'pending_location',
        })
        .returning();
      expect(incompleteGroup?.bodyId).toBeNull();
      expect(incompleteGroup?.latitude).toBeNull();

      // 2. Member without fullName (nickname only) succeeds; missing both fails CHECK
      const [nickOnlyMember] = await runtime.db
        .insert(members)
        .values({
          memberCode: 'MEM-NICK-01',
          fullName: null,
          nickname: 'พี่แดง',
          displayName: 'พี่แดง',
        })
        .returning();
      expect(nickOnlyMember?.fullName).toBeNull();

      await expectPgError(
        runtime.db.insert(members).values({
          memberCode: 'MEM-EMPTY-01',
          fullName: null,
          nickname: null,
          displayName: 'ไม่มีชื่อ',
        }),
        /members_identity_chk/i
      );

      // 3. Unlinked steward assignment with other_authorized role
      const [unlinkedAssign] = await runtime.db
        .insert(assignments)
        .values({
          userId: null,
          stewardDisplayName: 'ผู้ดูแลทดสอบ',
          linkStatus: 'unlinked_pending_account',
          scopeType: 'group',
          groupId: incompleteGroup!.id,
          roleType: 'other_authorized',
          isPrimary: false,
        })
        .returning();
      expect(unlinkedAssign?.linkStatus).toBe('unlinked_pending_account');

      // 4. Dry-run preview & idempotent staging
      const payload = {
        sourceArchiveName: 'test-pack.zip',
        groups: [
          {
            groupRef: 'FMG-T01',
            groupNameFromSheet: 'โนนเที่ยง',
            district: 'นามน',
            leader: 'ผู้ดูแล ก',
            coordinator: '-',
            careCode: 'G1',
            registeredTotal: 5,
            sourceFile: 'test.xlsx',
            sourceSheet: 'โนนเที่ยง',
          },
          {
            groupRef: 'FMG-T02',
            groupNameFromSheet: 'สร้างแก้ว',
            district: 'สมเด็จ',
            leader: 'ผู้ดูแล ข',
            registeredTotal: 'คน',
            sourceFile: 'test.xlsx',
            sourceSheet: 'สร้างแก้ว',
          },
        ],
        members: [
          {
            memberRowRef: 'FMM-T01',
            groupRef: 'FMG-T01',
            fullNameRaw: null,
            nicknameRaw: 'สมาชิก A',
            sourceFile: 'test.xlsx',
            sourceSheet: 'โนนเที่ยง',
            sourceRow: 1,
          },
          {
            memberRowRef: 'FMM-T02',
            groupRef: 'FMG-T02',
            fullNameRaw: null,
            nicknameRaw: null,
            sourceFile: 'test.xlsx',
            sourceSheet: 'สร้างแก้ว',
            sourceRow: 6,
          },
        ],
      };

      const preview = previewImportPayload(payload);
      expect(preview.totalGroups).toBe(2);
      expect(preview.countMismatchGroups).toBe(1);
      expect(preview.nonNumericTotalGroups).toBe(1);
      expect(preview.missingBothNamesCount).toBe(1);

      const staged1 = await stageImportBatch(runtime.db, adminActor, payload);
      expect(staged1.idempotentHit).toBe(false);
      const staged2 = await stageImportBatch(runtime.db, adminActor, payload);
      expect(staged2.idempotentHit).toBe(true);
      expect(staged2.batch.id).toBe(staged1.batch.id);

      // 5. Scope guard: Body Leader MUST NOT see unassigned groups (body_id IS NULL) or staging batches
      const bodyLeaderView = await listIngestionOverview(runtime.db, bodyLeaderActor);
      expect(bodyLeaderView.batches).toHaveLength(0);
      expect(bodyLeaderView.unlocatedGroups.some((g) => g.id === incompleteGroup!.id)).toBe(false);

      const adminView = await listIngestionOverview(runtime.db, adminActor);
      expect(adminView.issues.length).toBeGreaterThanOrEqual(3);
      expect(adminView.candidateLocations.length).toBeGreaterThanOrEqual(1);

      // Resolve one DQ issue and confirm one candidate location
      const firstIssue = adminView.issues[0]!;
      const resolvedIssue = await resolveDataQualityIssue(runtime.db, adminActor, {
        issueId: firstIssue.id,
        decision: 'approved_fix',
        resolutionNote: 'ตรวจสอบแล้ว',
      });
      expect(resolvedIssue.status).toBe('approved_fix');

      const firstCandidate = adminView.candidateLocations[0]!;
      const confirmedCandidate = await confirmCandidateLocation(
        runtime.db,
        adminActor,
        firstCandidate.id,
        'confirmed'
      );
      expect(confirmedCandidate.matchStatus).toBe('confirmed');

      // 6. Promote batch to production tables (skips row missing both fullName & nickname)
      const promoted = await promoteStagingBatch(runtime.db, adminActor, staged1.batch.id);
      expect(promoted.promotedGroupsCount).toBe(2);
      expect(promoted.promotedMembersCount).toBe(1);
      expect(promoted.skippedIncompleteMembers).toBe(1);

      // 7. Safe rollback when a promoted group has a weekly report -> archives instead of deleting
      const [promotedGroup] = await runtime.db
        .select()
        .from(houseMissionGroups)
        .where(eq(houseMissionGroups.groupCode, 'FMG-T01'));
      const [openPeriod] = await runtime.db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.status, 'open'));

      await runtime.db.insert(weeklyReports).values({
        periodId: openPeriod!.id,
        groupId: promotedGroup!.id,
        bodyId: null,
        status: 'draft',
      });

      const rolledBack = await rollbackImportBatch(
        runtime.db,
        adminActor,
        staged1.batch.id,
        'ทดสอบ safe rollback'
      );
      expect(rolledBack.archivedInsteadOfDeleted).toBe(true);

      const [afterRollback] = await runtime.db
        .select()
        .from(houseMissionGroups)
        .where(eq(houseMissionGroups.groupCode, 'FMG-T01'));
      expect(afterRollback?.status).toBe('archived');
    } finally {
      await runtime.close();
    }
  });

  it('detects PII-free duplicate_candidate issues, saves mappings, assigns body, and links unlinked stewards', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [adminUser] = await runtime.db
        .select()
        .from(users)
        .where(eq(users.id, SEED_IDS.users.admin));
      const [bodyLeaderUser] = await runtime.db
        .select()
        .from(users)
        .where(eq(users.id, SEED_IDS.users.bodyLeaderNorth));
      const adminActor = await buildActorContext(runtime.db, adminUser!);
      const bodyLeaderActor = await buildActorContext(runtime.db, bodyLeaderUser!);

      // 1. Cross-group duplicate_candidate DQ issue (PII-free summarySafeText)
      const dupSecretName = 'คุณสมชาย ทดสอบความลับ';
      await stageImportBatch(runtime.db, adminActor, {
        sourceArchiveName: 'dup-pack.zip',
        groups: [
          {
            groupRef: 'FMG-D01',
            groupNameFromSheet: 'กลุ่มซ้ำ A',
            district: 'อำเภอกมลาไสย',
            sourceFile: 'dup.xlsx',
            sourceSheet: 'A',
          },
          {
            groupRef: 'FMG-D02',
            groupNameFromSheet: 'กลุ่มซ้ำ B',
            district: 'กมลาไสย',
            sourceFile: 'dup.xlsx',
            sourceSheet: 'B',
          },
        ],
        members: [
          {
            memberRowRef: 'FMM-D01',
            groupRef: 'FMG-D01',
            fullNameRaw: dupSecretName,
            nicknameRaw: 'ชาย',
            sourceFile: 'dup.xlsx',
            sourceSheet: 'A',
            sourceRow: 1,
          },
          {
            memberRowRef: 'FMM-D02',
            groupRef: 'FMG-D02',
            fullNameRaw: dupSecretName,
            nicknameRaw: 'ชาย',
            sourceFile: 'dup.xlsx',
            sourceSheet: 'B',
            sourceRow: 2,
          },
        ],
      });

      const adminView = await listIngestionOverview(runtime.db, adminActor);
      const dupIssues = adminView.issues.filter((i) => i.issueCode === 'duplicate_candidate');
      expect(dupIssues).toHaveLength(1);
      expect(dupIssues[0]!.summarySafeText).not.toContain(dupSecretName);
      expect(dupIssues[0]!.summarySafeText).toContain('FMM-D01');
      expect(dupIssues[0]!.summarySafeText).toContain('FMG-D01');
      expect(dupIssues[0]!.summarySafeText).toContain('FMM-D02');
      expect(dupIssues[0]!.summarySafeText).toContain('FMG-D02');

      // 2. District & Care-Body mappings + assignUnassignedGroupBody
      const distMap = await saveDistrictMapping(
        runtime.db,
        adminActor,
        'อำเภอกมลาไสย',
        'กมลาไสย'
      );
      expect(distMap.districtCanonical).toBe('กมลาไสย');

      const careMap = await saveCareBodyMapping(
        runtime.db,
        adminActor,
        'G1',
        SEED_IDS.bodies.north,
        'ยืนยันการจับคู่แคร์ G1'
      );
      expect(careMap.bodyId).toBe(SEED_IDS.bodies.north);

      const [unassignedGroup] = await runtime.db
        .insert(houseMissionGroups)
        .values({
          groupCode: 'TEST-UNASSIGNED-02',
          bodyId: null,
          nameTh: 'กลุ่มรอจัดสรรบอดี้',
          district: 'กมลาไสย',
          assignmentStatus: 'pending_assignment',
          locationStatus: 'pending_location',
        })
        .returning();

      await expect(
        assignUnassignedGroupBody(
          runtime.db,
          bodyLeaderActor,
          unassignedGroup!.id,
          SEED_IDS.bodies.north
        )
      ).rejects.toThrow();

      const assignedGroup = await assignUnassignedGroupBody(
        runtime.db,
        adminActor,
        unassignedGroup!.id,
        SEED_IDS.bodies.north
      );
      expect(assignedGroup.bodyId).toBe(SEED_IDS.bodies.north);
      expect(assignedGroup.assignmentStatus).toBe('assigned');

      // 3. Unlinked steward -> linkStewardAssignmentToUser
      const [unlinkedSteward] = await runtime.db
        .insert(assignments)
        .values({
          userId: null,
          stewardDisplayName: 'ผู้ประสานงานรอผูกบัญชี',
          linkStatus: 'unlinked_pending_account',
          scopeType: 'group',
          groupId: unassignedGroup!.id,
          roleType: 'coordinator',
          isPrimary: false,
        })
        .returning();

      const bodyLeaderView = await listIngestionOverview(runtime.db, bodyLeaderActor);
      expect(bodyLeaderView.unlinkedStewards).toHaveLength(0);
      expect(bodyLeaderView.linkableUsers).toHaveLength(0);

      const adminBeforeLink = await listIngestionOverview(runtime.db, adminActor);
      expect(adminBeforeLink.unlinkedStewards.some((s) => s.id === unlinkedSteward!.id)).toBe(true);
      expect(adminBeforeLink.linkableUsers.length).toBeGreaterThanOrEqual(2);

      const linked = await linkStewardAssignmentToUser(
        runtime.db,
        adminActor,
        unlinkedSteward!.id,
        SEED_IDS.users.bodyLeaderNorth
      );
      expect(linked.userId).toBe(SEED_IDS.users.bodyLeaderNorth);
      expect(linked.linkStatus).toBe('linked_user');
    } finally {
      await runtime.close();
    }
  });
});
