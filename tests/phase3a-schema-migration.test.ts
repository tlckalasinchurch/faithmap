import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { KALASIN_TEAM_G_POINTS } from '@/lib/kalasin-field-points';
import { buildActorContext } from '@/server/modules/identity/service';
import { canAccessGroup } from '@/server/modules/authz/policy';

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

describe('Phase 3A: Schema, Care/Team-G Separation, Growth & Idempotent Migration', () => {
  it('creates cares, team_field_points, member_growth_records, and new Group/Member columns on fresh DB and is idempotent', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      // Idempotency check: second run must succeed cleanly
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      // 1. Provisional Care with nullable bodyId (no auto Body assignment)
      const [careG1] = await runtime.db
        .insert(schema.cares)
        .values({
          careCode: 'G1',
          careName: 'แคร์ G1',
          teamName: 'ทีม G',
          bodyId: null,
          status: 'provisional',
        })
        .returning();
      expect(careG1?.careCode).toBe('G1');
      expect(careG1?.bodyId).toBeNull();
      expect(careG1?.status).toBe('provisional');

      // 2. Team G 23 field points stored separately from cares
      for (const pt of KALASIN_TEAM_G_POINTS) {
        await runtime.db.insert(schema.teamFieldPoints).values({
          teamCode: pt.team,
          pointNo: pt.no,
          pointName: pt.name,
          coordinatorName: pt.coordinator,
          phoneRaw: pt.phone,
          latitude: pt.latitude,
          longitude: pt.longitude,
          mapsUrl: pt.mapsUrl,
        });
      }
      const insertedPoints = await runtime.db.select().from(schema.teamFieldPoints);
      expect(insertedPoints).toHaveLength(23);

      // 3. Group with all new Excel registry fields & provisional Care link
      const [group] = await runtime.db
        .insert(schema.houseMissionGroups)
        .values({
          groupCode: 'TEST-3A-G01',
          bodyId: null,
          careId: careG1!.id,
          teamName: 'ทีม G',
          nameTh: 'กลุ่มทดสอบ 3A',
          careCodeRaw: 'G1',
          registeredTotalRaw: 'คน',
          registeredTotalInt: null,
          district: 'กมลาไสย',
          districtRaw: 'อำเภอกมลาไสย',
          meetingDayRaw: 'พฤหัส',
          mapUrlRaw: 'https://maps.example.local/test',
          groupPhotoUrl: 'https://photos.example.local/test.jpg',
          assignmentStatus: 'pending_assignment',
          locationStatus: 'pending_location',
          verificationStatus: 'RAW',
        })
        .returning();
      expect(group?.careId).toBe(careG1!.id);
      expect(group?.bodyId).toBeNull();
      expect(group?.registeredTotalRaw).toBe('คน');
      expect(group?.verificationStatus).toBe('RAW');

      // 4. Member with new Excel fields (PII-free synthetic fixture) + Growth record
      const [member] = await runtime.db
        .insert(schema.members)
        .values({
          memberCode: 'TEST-3A-M01',
          fullName: null,
          nickname: 'ทดสอบ 1',
          displayName: 'ทดสอบ 1',
          sourceSequenceNo: '1',
          studyWorkplaceRaw: 'โรงเรียนทดสอบ',
          familyStatusRaw: 'โสด',
        })
        .returning();
      expect(member?.sourceSequenceNo).toBe('1');
      expect(member?.studyWorkplaceRaw).toBe('โรงเรียนทดสอบ');

      const [growth] = await runtime.db
        .insert(schema.memberGrowthRecords)
        .values({
          memberId: member!.id,
          groupId: group!.id,
          conversionDateRaw: '2025-01-15',
          responseAttitudeRaw: 'เปิดใจ',
          groupAttendanceLevelRaw: 'สม่ำเสมอ',
          discipleshipGoalRaw: 'รับบัพติศมา',
          targetTimeframeRaw: '3 เดือน',
          disciplerNameRaw: 'ผู้ดูแลทดสอบ',
          verificationStatus: 'RAW',
          sourceFile: 'test.xlsx',
          sourceSheet: 'Sheet1',
          sourceRow: 10,
          rawCellsJson: ['2025-01-15', 'เปิดใจ'],
        })
        .returning();
      expect(growth?.responseAttitudeRaw).toBe('เปิดใจ');
      expect(growth?.sourceRow).toBe(10);
    } finally {
      await runtime.close();
    }
  });

  // Decision (Gate 2): no database exists outside local PGlite, so upgrade from the old inline DDL
  // is not supported. The schema starts from the Drizzle migration history in ./drizzle.
  it('applies the migration history to an empty database, twice, without error or data loss', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await runtime.db.insert(schema.bodies).values({ code: 'KEEP-1', nameTh: 'บอดี้ทดสอบ' });
      await ensureSchema(runtime);
      const rows = await runtime.db.select().from(schema.bodies);
      expect(rows.map((r) => r.code)).toEqual(['KEEP-1']);
      const { countAppliedMigrations, EXPECTED_MIGRATION_COUNT } = await import('@/server/db/migrate');
      expect(await countAppliedMigrations(runtime)).toBe(EXPECTED_MIGRATION_COUNT);
    } finally {
      await runtime.close();
    }
  });

  it('assertMigrated refuses an empty database and accepts a migrated one', async () => {
    const { assertMigrated } = await import('@/server/db/migrate');
    const runtime = await createInMemoryTestRuntime();
    try {
      await expect(assertMigrated(runtime)).rejects.toMatchObject({ status: 503, code: 'DB_NOT_MIGRATED' });
      await ensureSchema(runtime);
      await expect(assertMigrated(runtime)).resolves.toBeUndefined();
    } finally {
      await runtime.close();
    }
  });

  it('enforces care assignment constraints and ensures unlinked assignments do not grant access', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [careG2] = await runtime.db
        .insert(schema.cares)
        .values({
          careCode: 'G2',
          careName: 'แคร์ G2',
          teamName: 'ทีม G',
          bodyId: null,
          status: 'provisional',
        })
        .returning();

      const [unassignedGroup] = await runtime.db
        .insert(schema.houseMissionGroups)
        .values({
          groupCode: 'TEST-3A-UNLINKED',
          bodyId: null,
          careId: careG2!.id,
          nameTh: 'กลุ่มทดสอบสิทธิ์แคร์',
          district: 'สมเด็จ',
          assignmentStatus: 'pending_assignment',
          locationStatus: 'pending_location',
        })
        .returning();

      // Valid unlinked care assignment
      const [careAssign] = await runtime.db
        .insert(schema.assignments)
        .values({
          userId: null,
          stewardDisplayName: 'ผู้ดูแลแคร์รอผูกบัญชี',
          linkStatus: 'unlinked_pending_account',
          scopeType: 'care',
          careId: careG2!.id,
          roleType: 'care_leader',
          isPrimary: true,
        })
        .returning();
      expect(careAssign?.scopeType).toBe('care');
      expect(careAssign?.userId).toBeNull();

      // Invalid role for care scope must fail CHECK
      await expectPgError(
        runtime.db.insert(schema.assignments).values({
          userId: null,
          stewardDisplayName: 'ผิดบทบาท',
          linkStatus: 'unlinked_pending_account',
          scopeType: 'care',
          careId: careG2!.id,
          roleType: 'body_leader',
          isPrimary: false,
        }),
        /assignments_scope_role_match_chk/i
      );

      // Missing care_id for care scope must fail CHECK
      await expectPgError(
        runtime.db.insert(schema.assignments).values({
          userId: null,
          stewardDisplayName: 'ไม่มี careId',
          linkStatus: 'unlinked_pending_account',
          scopeType: 'care',
          careId: null,
          roleType: 'care_leader',
          isPrimary: false,
        }),
        /assignments_scope_chk/i
      );

      // Unlinked assignment grants zero access to a Body Leader
      const [bodyLeaderUser] = await runtime.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, SEED_IDS.users.bodyLeaderNorth));
      const actor = await buildActorContext(runtime.db, bodyLeaderUser!);
      expect(
        canAccessGroup(actor, unassignedGroup!.id, unassignedGroup!.bodyId)
      ).toBe(false);
    } finally {
      await runtime.close();
    }
  });
});
