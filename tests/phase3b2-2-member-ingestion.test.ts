import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext } from '@/server/modules/identity/service';
import {
  listIngestionOverview,
  promoteStagingBatch,
  resolveDataQualityIssue,
  stageImportBatch,
} from '@/server/modules/ingestion/service';

describe('Phase 3B.2.2: Member Ingestion, Provenance, Nickname Rule & Conflict Queue', () => {
  it('preserves all member source fields & rawCells provenance, allows nullable fullName with nickname, blocks missing-both-names, never merges same nickname alone, and never creates user accounts', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [adminRow] = await runtime.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, SEED_IDS.users.superAdmin));
      const adminActor = await buildActorContext(runtime.db, adminRow!);
      const usersBefore = await runtime.db.select().from(schema.users);

      const staged = await stageImportBatch(runtime.db, adminActor, {
        sourceArchiveName: 'synthetic-3b22-members.xlsx',
        groups: [
          {
            groupRef: 'SYN-3B22-G1',
            groupNameFromSheet: 'กลุ่มทดสอบสมาชิก 1',
            district: 'อำเภอเมืองกาฬสินธุ์',
            sourceFile: 'synthetic-3b22-members.xlsx',
            sourceSheet: 'G1',
          },
          {
            groupRef: 'SYN-3B22-G2',
            groupNameFromSheet: 'กลุ่มทดสอบสมาชิก 2',
            district: 'อำเภอยางตลาด',
            sourceFile: 'synthetic-3b22-members.xlsx',
            sourceSheet: 'G2',
          },
        ],
        members: [
          {
            memberRowRef: 'SYN-3B22-M1',
            groupRef: 'SYN-3B22-G1',
            sequenceRaw: '1',
            fullNameRaw: null,
            nicknameRaw: 'ต้น',
            ageRaw: '24',
            occupationRaw: 'นักศึกษา',
            studyWorkplaceRaw: 'มหาวิทยาลัยทดสอบ',
            familyStatusRaw: 'โสด',
            sourceFile: 'synthetic-3b22-members.xlsx',
            sourceSheet: 'G1',
            sourceRow: 5,
            rawCells: {
              Y: '2025-01-10',
              Z: 'เปิดใจ',
            },
          },
          {
            memberRowRef: 'SYN-3B22-M2',
            groupRef: 'SYN-3B22-G2',
            sequenceRaw: '1',
            fullNameRaw: null,
            nicknameRaw: 'ต้น', // Same nickname in another group, NO fullName -> NOT duplicate person!
            sourceFile: 'synthetic-3b22-members.xlsx',
            sourceSheet: 'G2',
            sourceRow: 5,
          },
          {
            memberRowRef: 'SYN-3B22-M3',
            groupRef: 'SYN-3B22-G2',
            fullNameRaw: null,
            nicknameRaw: null, // Missing both -> blocking DQ issue & skipped
            sourceFile: 'synthetic-3b22-members.xlsx',
            sourceSheet: 'G2',
            sourceRow: 6,
          },
        ],
      });

      const overview = await listIngestionOverview(runtime.db, adminActor);
      const dupIssues = overview.issues.filter(
        (i) => i.batchId === staged.batch.id && i.issueCode === 'duplicate_candidate'
      );
      expect(dupIssues).toHaveLength(0);

      const missingIssues = overview.issues.filter(
        (i) => i.batchId === staged.batch.id && i.issueCode === 'missing_member_name'
      );
      expect(missingIssues).toHaveLength(1);
      expect(missingIssues[0]?.severity).toBe('blocking');

      const promoted = await promoteStagingBatch(runtime.db, adminActor, staged.batch.id);
      expect(promoted.promotedMembersCount).toBe(2);
      expect(promoted.skippedIncompleteMembers).toBe(1);

      const [m1] = await runtime.db
        .select()
        .from(schema.members)
        .where(eq(schema.members.memberCode, 'SYN-3B22-M1'));
      const [m2] = await runtime.db
        .select()
        .from(schema.members)
        .where(eq(schema.members.memberCode, 'SYN-3B22-M2'));

      expect(m1).toBeDefined();
      expect(m2).toBeDefined();
      expect(m1?.id).not.toBe(m2?.id);
      expect(m1?.fullName).toBeNull(); // Never fabricated from nickname
      expect(m1?.nickname).toBe('ต้น');
      expect(m1?.sourceSequenceNo).toBe('1');
      expect(m1?.studyWorkplaceRaw).toBe('มหาวิทยาลัยทดสอบ');
      expect(m1?.familyStatusRaw).toBe('โสด');
      expect(m1?.sourceProvenance).toMatchObject({
        sourceFile: 'synthetic-3b22-members.xlsx',
        sourceSheet: 'G1',
        sourceRow: 5,
      });

      // Never create user accounts for imported members
      const usersAfter = await runtime.db.select().from(schema.users);
      expect(usersAfter).toHaveLength(usersBefore.length);
    } finally {
      await runtime.close();
    }
  });

  it('flags full-name matches against existing verified members into Conflict Queue without auto-merging or overwriting verified records', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [adminRow] = await runtime.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, SEED_IDS.users.superAdmin));
      const adminActor = await buildActorContext(runtime.db, adminRow!);

      const secretExistingName = 'สมาชิกยืนยันแล้ว ทดสอบซ้ำ';
      const [verifiedMember] = await runtime.db
        .insert(schema.members)
        .values({
          memberCode: 'VERIFIED-3B22-01',
          fullName: secretExistingName,
          nickname: 'ยืนยัน',
          displayName: 'ยืนยัน',
          verificationStatus: 'verified',
        })
        .returning();

      const staged = await stageImportBatch(runtime.db, adminActor, {
        sourceArchiveName: 'synthetic-3b22-conflict.xlsx',
        groups: [
          {
            groupRef: 'SYN-3B22-CG1',
            groupNameFromSheet: 'กลุ่มทดสอบซ้ำ',
            district: 'อำเภอกมลาไสย',
            sourceFile: 'synthetic-3b22-conflict.xlsx',
            sourceSheet: 'CG1',
          },
        ],
        members: [
          {
            memberRowRef: 'SYN-3B22-CM1',
            groupRef: 'SYN-3B22-CG1',
            fullNameRaw: secretExistingName,
            nicknameRaw: 'ชื่อใหม่',
            sourceFile: 'synthetic-3b22-conflict.xlsx',
            sourceSheet: 'CG1',
            sourceRow: 7,
          },
        ],
      });

      const [stagedRow] = await runtime.db
        .select()
        .from(schema.stagingMemberRows)
        .where(eq(schema.stagingMemberRows.memberRowRef, 'SYN-3B22-CM1'));
      expect(stagedRow?.dataStatus).toBe('conflict');
      expect(stagedRow?.duplicateCandidateOfMemberId).toBe(verifiedMember!.id);

      const overview = await listIngestionOverview(runtime.db, adminActor);
      const conflictIssue = overview.issues.find(
        (i) => i.batchId === staged.batch.id && i.issueCode === 'duplicate_existing_member'
      );
      expect(conflictIssue).toBeDefined();
      expect(conflictIssue?.summarySafeText).not.toContain(secretExistingName);

      // Promote before human approval -> skips conflicted member without auto-merging
      const promotedBeforeApproval = await promoteStagingBatch(
        runtime.db,
        adminActor,
        staged.batch.id
      );
      expect(promotedBeforeApproval.promotedMembersCount).toBe(0);
      expect(promotedBeforeApproval.skippedIncompleteMembers).toBe(1);

      // Verified member remains completely untouched
      const [verifiedAfter] = await runtime.db
        .select()
        .from(schema.members)
        .where(eq(schema.members.id, verifiedMember!.id));
      expect(verifiedAfter?.nickname).toBe('ยืนยัน');
      expect(verifiedAfter?.verificationStatus).toBe('verified');

      // Human resolves DQ issue -> transitions staging row from conflict to approved
      await resolveDataQualityIssue(runtime.db, adminActor, {
        issueId: conflictIssue!.id,
        decision: 'approved_fix',
        resolutionNote: 'ยืนยันว่าเป็นคนละบุคคลในกลุ่มใหม่',
      });

      const [approvedRow] = await runtime.db
        .select()
        .from(schema.stagingMemberRows)
        .where(eq(schema.stagingMemberRows.id, stagedRow!.id));
      expect(approvedRow?.dataStatus).toBe('approved');
    } finally {
      await runtime.close();
    }
  });
});
