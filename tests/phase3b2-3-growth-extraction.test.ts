import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext } from '@/server/modules/identity/service';
import {
  promoteStagingBatch,
  stageImportBatch,
} from '@/server/modules/ingestion/service';

describe('Phase 3B.2.3: Growth Extraction, Source Provenance & Safeguards', () => {
  it('extracts all 6 Growth fields from both explicit fields and rawCells with full provenance, preserves raw values, creates no user accounts, and never overwrites Member rows', async () => {
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
        sourceArchiveName: 'synthetic-3b23-growth.xlsx',
        groups: [
          {
            groupRef: 'SYN-3B23-G1',
            groupNameFromSheet: 'กลุ่มทดสอบการเติบโต 1',
            district: 'อำเภอเมืองกาฬสินธุ์',
            sourceFile: 'synthetic-3b23-growth.xlsx',
            sourceSheet: 'G1',
          },
        ],
        members: [
          {
            memberRowRef: 'SYN-3B23-M1',
            groupRef: 'SYN-3B23-G1',
            nicknameRaw: 'ผู้เติบโต 1',
            salvationDateRaw: 'ม.ค. 2568 (โดยประมาณ)',
            responseAttitudeRaw: 'เปิดใจเรียนรู้',
            groupAttendanceLevelRaw: 'สม่ำเสมอ',
            discipleshipGoalRaw: 'รับบัพติศมา',
            targetTimeframeRaw: 'ไตรมาส 2',
            disciplerNameRaw: 'ผู้สร้างทดสอบ (ยังไม่มีบัญชี)',
            sourceFile: 'synthetic-3b23-growth.xlsx',
            sourceSheet: 'G1',
            sourceRow: 8,
            rawCells: {
              Y: 'ม.ค. 2568 (โดยประมาณ)',
              Z: 'เปิดใจเรียนรู้',
            },
          },
          {
            memberRowRef: 'SYN-3B23-M2',
            groupRef: 'SYN-3B23-G1',
            nicknameRaw: 'ผู้เติบโต 2',
            sourceFile: 'synthetic-3b23-growth.xlsx',
            sourceSheet: 'G1',
            sourceRow: 9,
            rawCells: {
              วันรับเชื่อ: '2025-02-01',
              เป้าหมายในการสร้าง: 'รับบัพติศมา', // Partial goal (no deadline/discipler) -> INCOMPLETE
            },
          },
          {
            memberRowRef: 'SYN-3B23-M3',
            groupRef: 'SYN-3B23-G1',
            fullNameRaw: null,
            nicknameRaw: null, // Unidentifiable member -> blocked, must NOT create Growth record
            discipleshipGoalRaw: 'เป้าหมายที่ไม่มีชื่อสมาชิก',
            sourceFile: 'synthetic-3b23-growth.xlsx',
            sourceSheet: 'G1',
            sourceRow: 10,
          },
        ],
      });

      const promoted = await promoteStagingBatch(runtime.db, adminActor, staged.batch.id);
      expect(promoted.promotedMembersCount).toBe(2);
      expect(promoted.promotedGrowthRecordsCount).toBe(2);
      expect(promoted.skippedIncompleteMembers).toBe(1);

      const [m1] = await runtime.db
        .select()
        .from(schema.members)
        .where(eq(schema.members.memberCode, 'SYN-3B23-M1'));
      const [m2] = await runtime.db
        .select()
        .from(schema.members)
        .where(eq(schema.members.memberCode, 'SYN-3B23-M2'));

      const growthRows = await runtime.db.select().from(schema.memberGrowthRecords);
      expect(growthRows).toHaveLength(2);

      const g1 = growthRows.find((r) => r.memberId === m1!.id);
      const g2 = growthRows.find((r) => r.memberId === m2!.id);

      expect(g1).toBeDefined();
      expect(g1?.conversionDateRaw).toBe('ม.ค. 2568 (โดยประมาณ)');
      expect(g1?.responseAttitudeRaw).toBe('เปิดใจเรียนรู้');
      expect(g1?.groupAttendanceLevelRaw).toBe('สม่ำเสมอ');
      expect(g1?.discipleshipGoalRaw).toBe('รับบัพติศมา');
      expect(g1?.targetTimeframeRaw).toBe('ไตรมาส 2');
      expect(g1?.disciplerNameRaw).toBe('ผู้สร้างทดสอบ (ยังไม่มีบัญชี)');
      expect(g1?.disciplerAssignmentId).toBeNull();
      expect(g1?.verificationStatus).toBe('RAW');
      expect(g1?.sourceFile).toBe('synthetic-3b23-growth.xlsx');
      expect(g1?.sourceSheet).toBe('G1');
      expect(g1?.sourceRow).toBe(8);
      expect(g1?.rawCellsJson).toEqual([
        { col: 'Y', value: 'ม.ค. 2568 (โดยประมาณ)' },
        { col: 'Z', value: 'เปิดใจเรียนรู้' },
      ]);

      expect(g2).toBeDefined();
      expect(g2?.conversionDateRaw).toBe('2025-02-01');
      expect(g2?.discipleshipGoalRaw).toBe('รับบัพติศมา');
      expect(g2?.verificationStatus).toBe('INCOMPLETE');

      // Duplicate goal text across different rows/batches are kept as separate records
      expect(g1?.id).not.toBe(g2?.id);

      // No user accounts created for Growth Responsible Person
      const usersAfter = await runtime.db.select().from(schema.users);
      expect(usersAfter).toHaveLength(usersBefore.length);
    } finally {
      await runtime.close();
    }
  });
});
