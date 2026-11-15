import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createInMemoryTestRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import * as schema from '@/server/db/schema';
import { buildActorContext } from '@/server/modules/identity/service';
import {
  promoteStagingBatch,
  resolveDataQualityIssue,
  stageImportBatch,
} from '@/server/modules/ingestion/service';

describe('Phase 3B.2.4: Review, Approval & Promotion Safeguards', () => {
  it('re-promotes approved conflict members and growth records after group promotion, idempotently', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [adminUser] = await runtime.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, SEED_IDS.users.admin));
      const adminActor = await buildActorContext(runtime.db, adminUser!);

      const [verifiedExisting] = await runtime.db
        .insert(schema.members)
        .values({
          memberCode: 'MEM-VERIFIED-3B24',
          fullName: 'สมชาย ทดสอบคอนฟลิกต์',
          nickname: 'เดิมยืนยัน',
          displayName: 'เดิมยืนยัน',
          verificationStatus: 'verified',
        })
        .returning();

      const staged = await stageImportBatch(runtime.db, adminActor, {
        sourceArchiveName: 'phase3b2-4.xlsx',
        groups: [
          {
            groupRef: 'G-3B24-01',
            groupNameFromSheet: 'กลุ่มบ้านทดสอบ 3B24',
            careCode: 'C3B24',
            district: 'เมืองกาฬสินธุ์',
            sourceFile: 'phase3b2-4.xlsx',
            sourceSheet: 'G-3B24-01',
          },
        ],
        members: [
          {
            memberRowRef: 'M-3B24-01',
            groupRef: 'G-3B24-01',
            sourceFile: 'phase3b2-4.xlsx',
            sourceSheet: 'G-3B24-01',
            sourceRow: 5,
            fullNameRaw: 'สมชาย ทดสอบคอนฟลิกต์',
            nicknameRaw: 'ชายใหม่',
            discipleshipGoalRaw: 'อ่านพระคัมภีร์สัปดาห์ละ 3 บท',
            targetTimeframeRaw: 'สิ้นเดือนหน้า',
            disciplerNameRaw: 'พี่เลี้ยงเอ',
            rawCells: {
              Y: 'อ่านพระคัมภีร์สัปดาห์ละ 3 บท',
              Z: 'สิ้นเดือนหน้า',
              AA: 'พี่เลี้ยงเอ',
            },
          },
        ],
      });

      // Pass 1: promotes group, skips conflicted member
      const pass1 = await promoteStagingBatch(runtime.db, adminActor, staged.batch.id);
      expect(pass1.promotedGroupsCount).toBe(1);
      expect(pass1.promotedMembersCount).toBe(0);
      expect(pass1.skippedIncompleteMembers).toBe(1);
      expect(pass1.batch.status).toBe('partially_promoted');

      const [conflictIssue] = await runtime.db
        .select()
        .from(schema.dataQualityIssues)
        .where(eq(schema.dataQualityIssues.batchId, staged.batch.id));
      expect(conflictIssue?.issueCode).toBe('duplicate_existing_member');

      // Human approves the conflict as a distinct person
      await resolveDataQualityIssue(runtime.db, adminActor, {
        issueId: conflictIssue!.id,
        decision: 'approved_fix',
        resolutionNote: 'ตรวจสอบแล้วเป็นคนละบุคคล',
      });

      // Pass 2: re-promotes newly approved member & growth record without duplicating group
      const pass2 = await promoteStagingBatch(runtime.db, adminActor, staged.batch.id);
      expect(pass2.promotedGroupsCount).toBe(0);
      expect(pass2.promotedMembersCount).toBe(1);
      expect(pass2.promotedGrowthRecordsCount).toBe(1);
      expect(pass2.skippedIncompleteMembers).toBe(0);
      expect(pass2.batch.status).toBe('promoted');

      const [promotedRow] = await runtime.db
        .select()
        .from(schema.stagingMemberRows)
        .where(eq(schema.stagingMemberRows.batchId, staged.batch.id));
      expect(promotedRow?.dataStatus).toBe('promoted');
      expect(promotedRow?.promotedMemberId).toBeTruthy();

      // Verified existing record remains untouched
      const [verifiedAfter] = await runtime.db
        .select()
        .from(schema.members)
        .where(eq(schema.members.id, verifiedExisting!.id));
      expect(verifiedAfter?.nickname).toBe('เดิมยืนยัน');
      expect(verifiedAfter?.verificationStatus).toBe('verified');

      // Pass 3: idempotent no-op
      const pass3 = await promoteStagingBatch(runtime.db, adminActor, staged.batch.id);
      expect(pass3.promotedGroupsCount).toBe(0);
      expect(pass3.promotedMembersCount).toBe(0);
      expect(pass3.promotedGrowthRecordsCount).toBe(0);
      expect(pass3.skippedIncompleteMembers).toBe(0);
      expect(pass3.batch.status).toBe('promoted');
    } finally {
      await runtime.close();
    }
  });

  it('marks cross-group duplicate_candidate as pending_review, blocks premature promotion, and supports approve/reject', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [adminUser] = await runtime.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, SEED_IDS.users.admin));
      const adminActor = await buildActorContext(runtime.db, adminUser!);

      const staged = await stageImportBatch(runtime.db, adminActor, {
        sourceArchiveName: 'phase3b2-4-cross.xlsx',
        groups: [
          {
            groupRef: 'G-3B24-A',
            groupNameFromSheet: 'กลุ่มบ้าน A',
            careCode: 'C3B24A',
            sourceFile: 'phase3b2-4-cross.xlsx',
            sourceSheet: 'A',
          },
          {
            groupRef: 'G-3B24-B',
            groupNameFromSheet: 'กลุ่มบ้าน B',
            careCode: 'C3B24B',
            sourceFile: 'phase3b2-4-cross.xlsx',
            sourceSheet: 'B',
          },
        ],
        members: [
          {
            memberRowRef: 'M-3B24-A1',
            groupRef: 'G-3B24-A',
            sourceFile: 'phase3b2-4-cross.xlsx',
            sourceSheet: 'A',
            sourceRow: 5,
            fullNameRaw: 'มานี ซ้ำต่างกลุ่ม',
            nicknameRaw: 'นี',
          },
          {
            memberRowRef: 'M-3B24-B1',
            groupRef: 'G-3B24-B',
            sourceFile: 'phase3b2-4-cross.xlsx',
            sourceSheet: 'B',
            sourceRow: 5,
            fullNameRaw: 'มานี ซ้ำต่างกลุ่ม',
            nicknameRaw: 'นี',
          },
        ],
      });

      const stagedRows = await runtime.db
        .select()
        .from(schema.stagingMemberRows)
        .where(eq(schema.stagingMemberRows.batchId, staged.batch.id));
      const rowA = stagedRows.find((r) => r.memberRowRef === 'M-3B24-A1');
      const rowB = stagedRows.find((r) => r.memberRowRef === 'M-3B24-B1');
      // Owner rule: EVERY row of the candidate set is pending_review, not only the first.
      expect(rowA?.dataStatus).toBe('pending_review');
      expect(rowB?.dataStatus).toBe('pending_review');

      const dupIssues = await runtime.db
        .select()
        .from(schema.dataQualityIssues)
        .where(eq(schema.dataQualityIssues.batchId, staged.batch.id));
      expect(dupIssues).toHaveLength(2);
      expect(dupIssues.every((i) => i.issueCode === 'duplicate_candidate')).toBe(true);
      const dupIssue = dupIssues.find((i) => i.targetId === rowA!.id);
      const dupIssueB = dupIssues.find((i) => i.targetId === rowB!.id);

      // First promote creates both groups but NO member. Nothing is merged or promoted by itself.
      const pass1 = await promoteStagingBatch(runtime.db, adminActor, staged.batch.id);
      expect(pass1.promotedGroupsCount).toBe(2);
      expect(pass1.promotedMembersCount).toBe(0);
      expect(pass1.skippedIncompleteMembers).toBe(2);
      expect(pass1.batch.status).toBe('partially_promoted');
      expect(
        (await runtime.db.select().from(schema.members).where(eq(schema.members.memberCode, 'M-3B24-B1'))).length
      ).toBe(0);

      // A person decides row B on its own: approve. Row A is rejected below.
      await resolveDataQualityIssue(runtime.db, adminActor, {
        issueId: dupIssueB!.id,
        decision: 'approved_fix',
        resolutionNote: 'ยืนยันว่าเป็นคนละคน',
      });

      // Rejecting the duplicate_candidate moves rowA to rejected and never promotes it
      await resolveDataQualityIssue(runtime.db, adminActor, {
        issueId: dupIssue!.id,
        decision: 'rejected',
        resolutionNote: 'ยืนยันเป็นรายการซ้ำ ไม่ต้องสร้างซ้ำ',
      });

      const [rejectedRowA] = await runtime.db
        .select()
        .from(schema.stagingMemberRows)
        .where(eq(schema.stagingMemberRows.id, rowA!.id));
      expect(rejectedRowA?.dataStatus).toBe('rejected');

      const pass2 = await promoteStagingBatch(runtime.db, adminActor, staged.batch.id);
      expect(pass2.promotedMembersCount).toBe(1);
      expect(pass2.skippedIncompleteMembers).toBe(0);
      expect(pass2.batch.status).toBe('promoted');
    } finally {
      await runtime.close();
    }
  });
});
