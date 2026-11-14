import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
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

  it('upgrades a pre-existing Phase 1/2 database safely while preserving existing rows', async () => {
    const pglite = new PGlite();
    const db = drizzle(pglite, { schema });
    const runtime: DbRuntime = {
      driver: 'pglite',
      db,
      execRaw: async (sqlText: string) => {
        await pglite.exec(sqlText);
      },
      close: async () => {
        await pglite.close();
      },
    };

    try {
      // Simulate a pre-Phase-3A database without cares, team_field_points, member_growth_records, or care_id
      await pglite.exec(`
        CREATE TABLE bodies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          code TEXT NOT NULL UNIQUE,
          name_th TEXT NOT NULL,
          name_en TEXT,
          region TEXT NOT NULL DEFAULT 'ภาคตะวันออกเฉียงเหนือ',
          province TEXT NOT NULL DEFAULT 'กาฬสินธุ์',
          status TEXT NOT NULL DEFAULT 'active',
          sort_order INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE members (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          member_code TEXT NOT NULL UNIQUE,
          full_name TEXT,
          nickname TEXT,
          display_name TEXT NOT NULL,
          membership_status TEXT NOT NULL DEFAULT 'active',
          privacy_consent_status TEXT NOT NULL DEFAULT 'consented',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          member_id UUID REFERENCES members(id) ON DELETE SET NULL,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          system_role TEXT NOT NULL DEFAULT 'standard_user',
          status TEXT NOT NULL DEFAULT 'active',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE house_mission_groups (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          group_code TEXT NOT NULL UNIQUE,
          body_id UUID REFERENCES bodies(id) ON DELETE SET NULL,
          name_th TEXT NOT NULL,
          name_en TEXT,
          district TEXT NOT NULL,
          subdistrict TEXT,
          province TEXT NOT NULL DEFAULT 'กาฬสินธุ์',
          address_summary TEXT NOT NULL DEFAULT '',
          latitude DOUBLE PRECISION NOT NULL DEFAULT 16.4,
          longitude DOUBLE PRECISION NOT NULL DEFAULT 103.5,
          meeting_day_of_week INTEGER NOT NULL DEFAULT 1,
          meeting_time_local TEXT NOT NULL DEFAULT '19:00',
          status TEXT NOT NULL DEFAULT 'active',
          target_attendance INTEGER NOT NULL DEFAULT 12,
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE assignments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          scope_type TEXT NOT NULL,
          body_id UUID REFERENCES bodies(id) ON DELETE CASCADE,
          group_id UUID REFERENCES house_mission_groups(id) ON DELETE CASCADE,
          role_type TEXT NOT NULL,
          is_primary BOOLEAN NOT NULL DEFAULT true,
          effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          effective_to TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT assignments_scope_chk CHECK (
            (scope_type = 'body' AND body_id IS NOT NULL AND group_id IS NULL)
            OR (scope_type = 'group' AND group_id IS NOT NULL AND body_id IS NULL)
          ),
          CONSTRAINT assignments_scope_role_match_chk CHECK (
            (scope_type = 'body' AND role_type = 'body_leader')
            OR (scope_type = 'group' AND role_type IN ('care_leader', 'coordinator', 'group_leader', 'other_authorized'))
          )
        );
        CREATE TABLE period_group_snapshots (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          period_id UUID NOT NULL,
          group_id UUID NOT NULL,
          body_id UUID NOT NULL,
          body_name_snapshot TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE weekly_reports (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          period_id UUID NOT NULL,
          group_id UUID NOT NULL,
          body_id UUID NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          is_blocked BOOLEAN NOT NULL DEFAULT false
        );
        INSERT INTO house_mission_groups (group_code, name_th, district)
        VALUES ('LEGACY-01', 'กลุ่มเดิมก่อนอัปเกรด', 'เมืองกาฬสินธุ์');
      `);

      // Run Phase 3A migration on pre-existing DB twice (upgrade + idempotency)
      await ensureSchema(runtime);
      await ensureSchema(runtime);

      const [legacyGroup] = await db
        .select()
        .from(schema.houseMissionGroups)
        .where(eq(schema.houseMissionGroups.groupCode, 'LEGACY-01'));
      expect(legacyGroup?.nameTh).toBe('กลุ่มเดิมก่อนอัปเกรด');
      expect(legacyGroup?.careId).toBeNull();
      expect(legacyGroup?.verificationStatus).toBe('RAW');
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
