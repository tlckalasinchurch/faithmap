import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext } from '@/server/modules/identity/service';
import {
  canAccessCare,
  canManageBodyScope,
  canManageCareScope,
} from '@/server/modules/authz/policy';
import {
  assignCareSteward,
  assignCareToBody,
  createProvisionalCare,
  listCares,
  revokeCareAssignment,
} from '@/server/modules/cares/service';
import {
  listTeamFieldPoints,
  syncTeamGFieldPoints,
} from '@/server/modules/team-field-points/service';

describe('Phase 3B.1: Care Management, Team Field Points & Care-Scoped Authorization', () => {
  it('supports provisional Care creation without auto Body mapping, Care-to-Body mapping, and unlinked steward assignment without fake users', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [adminRow] = await runtime.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, SEED_IDS.users.superAdmin));
      const [bodyLeaderNorthRow] = await runtime.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, SEED_IDS.users.bodyLeaderNorth));

      const adminActor = await buildActorContext(runtime.db, adminRow!);
      const northLeaderActor = await buildActorContext(runtime.db, bodyLeaderNorthRow!);

      // Body Leader cannot create an unassigned provisional Care
      await expect(
        createProvisionalCare(runtime.db, northLeaderActor, {
          careCode: 'G1',
          careName: 'แคร์ทดสอบ G1',
        })
      ).rejects.toMatchObject({ status: 403, code: 'ADMIN_REQUIRED' });

      // Admin creates provisional Care with bodyId = null (never auto-mapped)
      const careG1 = await createProvisionalCare(runtime.db, adminActor, {
        careCode: 'G1',
        careName: 'แคร์ทดสอบ G1',
        teamName: 'ทีม G',
      });
      expect(careG1.bodyId).toBeNull();
      expect(careG1.status).toBe('provisional');

      // Admin maps Care G1 to BODY_NORTH with audit reason
      const mapped = await assignCareToBody(runtime.db, adminActor, {
        careId: careG1.id,
        bodyId: SEED_IDS.bodies.north,
        status: 'active',
        reason: 'ยืนยันสังกัดบอดี้เหนือสำหรับการทดสอบ 3B.1',
      });
      expect(mapped?.bodyId).toBe(SEED_IDS.bodies.north);
      expect(mapped?.status).toBe('active');

      // Body Leader North assigns an unlinked Care steward (must NOT create a fake user account)
      const usersBefore = await runtime.db.select().from(schema.users);
      const unlinkedSteward = await assignCareSteward(runtime.db, northLeaderActor, {
        careId: careG1.id,
        stewardDisplayName: 'ผู้ดูแลแคร์ G1 ทดสอบ (ยังไม่มีบัญชี)',
        roleType: 'care_leader',
        isPrimary: true,
      });
      const usersAfter = await runtime.db.select().from(schema.users);

      expect(unlinkedSteward.userId).toBeNull();
      expect(unlinkedSteward.linkStatus).toBe('unlinked_pending_account');
      expect(usersAfter).toHaveLength(usersBefore.length);

      // Revoke Care assignment cleanly
      const revoked = await revokeCareAssignment(
        runtime.db,
        northLeaderActor,
        unlinkedSteward.id,
        'เปลี่ยนผู้ดูแลทดสอบ'
      );
      expect(revoked?.effectiveTo).not.toBeNull();

      // Verify audit logs recorded
      const audits = await runtime.db.select().from(schema.securityAuditLogs);
      const actions = audits.map((a) => a.action);
      expect(actions).toContain('CARE_CREATED');
      expect(actions).toContain('CARE_BODY_MAPPED');
      expect(actions).toContain('CARE_STEWARD_ASSIGNED');
      expect(actions).toContain('CARE_STEWARD_REVOKED');
    } finally {
      await runtime.close();
    }
  });

  it('enforces Care authorization isolation: Care assignment never grants Body access, and Body Leaders cannot see unassigned or foreign Cares', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [adminRow] = await runtime.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, SEED_IDS.users.superAdmin));
      const [northLeaderRow] = await runtime.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, SEED_IDS.users.bodyLeaderNorth));

      // Create an active South Body Leader + a fresh standard user for Care Leader
      const [southLeaderRow] = await runtime.db
        .insert(schema.users)
        .values({
          username: 'test_south_leader_3b1',
          displayName: 'หัวหน้าบอดี้ใต้ทดสอบ',
          systemRole: 'standard_user',
          status: 'active',
        })
        .returning();
      await runtime.db.insert(schema.assignments).values({
        userId: southLeaderRow!.id,
        scopeType: 'body',
        bodyId: SEED_IDS.bodies.south,
        roleType: 'body_leader',
        isPrimary: false,
      });

      const [careUserRow] = await runtime.db
        .insert(schema.users)
        .values({
          username: 'test_care_leader_3b1',
          displayName: 'ผู้ดูแลแคร์ทดสอบ',
          systemRole: 'standard_user',
          status: 'active',
        })
        .returning();

      const adminActor = await buildActorContext(runtime.db, adminRow!);
      const northActor = await buildActorContext(runtime.db, northLeaderRow!);
      const southActor = await buildActorContext(runtime.db, southLeaderRow!);

      const unassignedCare = await createProvisionalCare(runtime.db, adminActor, {
        careCode: 'G-UNASSIGNED',
      });
      const northCare = await createProvisionalCare(runtime.db, adminActor, {
        careCode: 'G2',
        bodyId: SEED_IDS.bodies.north,
        status: 'active',
      });

      // Assign careUserRow as Care Leader of northCare
      await assignCareSteward(runtime.db, northActor, {
        careId: northCare.id,
        userId: careUserRow!.id,
        roleType: 'care_leader',
        isPrimary: true,
      });

      const careActor = await buildActorContext(runtime.db, careUserRow!);

      // Care Leader can access and manage their assigned Care, but NOT Body scope
      expect(careActor.assignedCareIds.has(northCare.id)).toBe(true);
      expect(careActor.bodyLeaderBodyIds.size).toBe(0);
      expect(canAccessCare(careActor, northCare.id, northCare.bodyId)).toBe(true);
      expect(canManageCareScope(careActor, northCare.id, northCare.bodyId)).toBe(true);
      expect(canManageBodyScope(careActor, SEED_IDS.bodies.north)).toBe(false);

      // Care Leader sees ONLY their assigned Care
      const careActorList = await listCares(runtime.db, careActor);
      expect(careActorList.map((c) => c.careCode)).toEqual(['G2']);

      // South Body Leader cannot see unassigned Care or North Care
      const southList = await listCares(runtime.db, southActor);
      expect(southList).toHaveLength(0);

      // South Body Leader cannot assign stewards to North Care
      await expect(
        assignCareSteward(runtime.db, southActor, {
          careId: northCare.id,
          stewardDisplayName: 'ไม่ได้รับอนุญาต',
          roleType: 'other_authorized',
        })
      ).rejects.toMatchObject({ status: 403, code: 'SCOPE_FORBIDDEN' });

      // North Body Leader sees only North Care (not unassignedCare)
      const northList = await listCares(runtime.db, northActor);
      expect(northList.map((c) => c.careCode)).toEqual(['G2']);
      expect(unassignedCare.bodyId).toBeNull();
    } finally {
      await runtime.close();
    }
  });

  it('syncs 23 Team G field points idempotently without creating Care or Group records, and masks phones for non-admin users', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [adminRow] = await runtime.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, SEED_IDS.users.superAdmin));
      const [northLeaderRow] = await runtime.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, SEED_IDS.users.bodyLeaderNorth));

      const adminActor = await buildActorContext(runtime.db, adminRow!);
      const northActor = await buildActorContext(runtime.db, northLeaderRow!);

      // Non-admin cannot sync
      await expect(syncTeamGFieldPoints(runtime.db, northActor)).rejects.toMatchObject({
        status: 403,
        code: 'ADMIN_REQUIRED',
      });

      const groupsBefore = await runtime.db.select().from(schema.houseMissionGroups);
      const caresBefore = await runtime.db.select().from(schema.cares);

      // Sync twice to verify idempotency
      const first = await syncTeamGFieldPoints(runtime.db, adminActor);
      const second = await syncTeamGFieldPoints(runtime.db, adminActor);
      expect(first.syncedCount).toBe(23);
      expect(second.syncedCount).toBe(23);

      const groupsAfter = await runtime.db.select().from(schema.houseMissionGroups);
      const caresAfter = await runtime.db.select().from(schema.cares);
      expect(groupsAfter).toHaveLength(groupsBefore.length);
      expect(caresAfter).toHaveLength(caresBefore.length);

      const adminPoints = await listTeamFieldPoints(runtime.db, adminActor, { teamCode: 'G' });
      const stewardPoints = await listTeamFieldPoints(runtime.db, northActor, { teamCode: 'G' });
      expect(adminPoints).toHaveLength(23);
      expect(stewardPoints).toHaveLength(23);

      // Non-admin gets masked phone number
      expect(stewardPoints[0]?.phone).toMatch(/^\*\*\*-\*\*\*-\d{4}$/);
      expect(adminPoints[0]?.phone).not.toMatch(/^\*\*\*/);
    } finally {
      await runtime.close();
    }
  });
});
