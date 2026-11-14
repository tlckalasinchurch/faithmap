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

describe('Phase 3B.2.1: Group Ingestion Extensions, Provisional Care Auto-Registration & Provenance', () => {
  it('preserves all Group 13 fields, keeps non-numeric registeredTotalRaw intact with null registeredTotalInt, auto-registers provisional Cares without guessing Body, and leaves Team G candidates pending', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [adminRow] = await runtime.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, SEED_IDS.users.superAdmin));
      const adminActor = await buildActorContext(runtime.db, adminRow!);

      const staged = await stageImportBatch(runtime.db, adminActor, {
        sourceArchiveName: 'synthetic-phase3b21.xlsx',
        groups: [
          {
            groupRef: 'SYN-3B21-01',
            groupNameFromSheet: 'บ้านวราภรณ์ (ทดสอบ)',
            formTitle: 'แบบฟอร์มทดสอบ 3B.2.1',
            district: 'อำเภอเมืองกาฬสินธุ์',
            subdistrict: 'กาฬสินธุ์',
            village: 'บ้านวราภรณ์',
            meetingDay: 'พฤหัส',
            meetingTimeStart: '19:00',
            meetingTimeEnd: '20:30',
            meetingPlace: 'บ้านสมาชิกทดสอบ 1',
            leader: 'ผู้รับผิดชอบทดสอบ 1',
            coordinator: '-',
            careLabel: 'แคร์ G1',
            careCode: 'G1',
            teamName: 'ทีม G',
            registeredTotal: 'คน',
            mapUrlRaw: 'https://maps.example.local/syn-01',
            groupPhotoUrl: 'https://photos.example.local/syn-01.jpg',
            sourceFile: 'synthetic-phase3b21.xlsx',
            sourceSheet: 'G01',
          },
          {
            groupRef: 'SYN-3B21-02',
            groupNameFromSheet: 'กลุ่มทดสอบไม่มีพิกัด',
            district: 'อำเภอยางตลาด',
            careLabel: 'แคร์ G1',
            careCode: 'G1',
            teamName: 'ทีม G',
            registeredTotal: 1,
            sourceFile: 'synthetic-phase3b21.xlsx',
            sourceSheet: 'G02',
          },
        ],
        members: [
          {
            memberRowRef: 'SYN-3B21-02#R1',
            groupRef: 'SYN-3B21-02',
            nicknameRaw: 'สมาชิกทดสอบ',
            sourceFile: 'synthetic-phase3b21.xlsx',
            sourceSheet: 'G02',
            sourceRow: 5,
          },
        ],
      });

      expect(staged.idempotentHit).toBe(false);

      // Re-staging exact same payload is idempotent
      const stagedAgain = await stageImportBatch(runtime.db, adminActor, {
        sourceArchiveName: 'synthetic-phase3b21.xlsx',
        groups: [
          {
            groupRef: 'SYN-3B21-01',
            groupNameFromSheet: 'บ้านวราภรณ์ (ทดสอบ)',
            formTitle: 'แบบฟอร์มทดสอบ 3B.2.1',
            district: 'อำเภอเมืองกาฬสินธุ์',
            subdistrict: 'กาฬสินธุ์',
            village: 'บ้านวราภรณ์',
            meetingDay: 'พฤหัส',
            meetingTimeStart: '19:00',
            meetingTimeEnd: '20:30',
            meetingPlace: 'บ้านสมาชิกทดสอบ 1',
            leader: 'ผู้รับผิดชอบทดสอบ 1',
            coordinator: '-',
            careLabel: 'แคร์ G1',
            careCode: 'G1',
            teamName: 'ทีม G',
            registeredTotal: 'คน',
            mapUrlRaw: 'https://maps.example.local/syn-01',
            groupPhotoUrl: 'https://photos.example.local/syn-01.jpg',
            sourceFile: 'synthetic-phase3b21.xlsx',
            sourceSheet: 'G01',
          },
          {
            groupRef: 'SYN-3B21-02',
            groupNameFromSheet: 'กลุ่มทดสอบไม่มีพิกัด',
            district: 'อำเภอยางตลาด',
            careLabel: 'แคร์ G1',
            careCode: 'G1',
            teamName: 'ทีม G',
            registeredTotal: 1,
            sourceFile: 'synthetic-phase3b21.xlsx',
            sourceSheet: 'G02',
          },
        ],
        members: [
          {
            memberRowRef: 'SYN-3B21-02#R1',
            groupRef: 'SYN-3B21-02',
            nicknameRaw: 'สมาชิกทดสอบ',
            sourceFile: 'synthetic-phase3b21.xlsx',
            sourceSheet: 'G02',
            sourceRow: 5,
          },
        ],
      });
      expect(stagedAgain.idempotentHit).toBe(true);

      const promoted = await promoteStagingBatch(runtime.db, adminActor, staged.batch.id);
      expect(promoted.promotedGroupsCount).toBe(2);

      // Provisional Care G1 auto-registered once with bodyId = null
      const careRows = await runtime.db
        .select()
        .from(schema.cares)
        .where(eq(schema.cares.careCode, 'G1'));
      expect(careRows).toHaveLength(1);
      expect(careRows[0]?.bodyId).toBeNull();
      expect(careRows[0]?.status).toBe('provisional');
      expect(careRows[0]?.teamName).toBe('ทีม G');

      const [g1] = await runtime.db
        .select()
        .from(schema.houseMissionGroups)
        .where(eq(schema.houseMissionGroups.groupCode, 'SYN-3B21-01'));
      const [g2] = await runtime.db
        .select()
        .from(schema.houseMissionGroups)
        .where(eq(schema.houseMissionGroups.groupCode, 'SYN-3B21-02'));

      expect(g1?.careId).toBe(careRows[0]!.id);
      expect(g2?.careId).toBe(careRows[0]!.id);
      expect(g1?.bodyId).toBeNull();
      expect(g1?.teamName).toBe('ทีม G');
      expect(g1?.registeredTotalRaw).toBe('คน');
      expect(g1?.registeredTotalInt).toBeNull();
      expect(g1?.districtRaw).toBe('อำเภอเมืองกาฬสินธุ์');
      expect(g1?.meetingDayRaw).toBe('พฤหัส');
      expect(g1?.mapUrlRaw).toBe('https://maps.example.local/syn-01');
      expect(g1?.groupPhotoUrl).toBe('https://photos.example.local/syn-01.jpg');
      expect(g1?.locationStatus).toBe('pending_location');
      expect(g1?.latitude).toBeNull();
      expect(g1?.verificationStatus).toBe('PENDING_REVIEW');

      expect(g2?.registeredTotalRaw).toBe('1');
      expect(g2?.registeredTotalInt).toBe(1);

      // Candidate Team G match for บ้านวราภรณ์ remains pending until human confirmation
      const candidates = await runtime.db.select().from(schema.candidateLocationMatches);
      expect(candidates.some((c) => c.candidateName === 'บ้านวราภรณ์' && c.matchStatus === 'pending')).toBe(
        true
      );
    } finally {
      await runtime.close();
    }
  });
});
