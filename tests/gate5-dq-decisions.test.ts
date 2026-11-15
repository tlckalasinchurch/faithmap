import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import { createInMemoryTestRuntime, type DbRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { buildActorContext } from '@/server/modules/identity/service';
import {
  listDecisionHistory,
  rollbackImportBatch,
  promoteStagingBatch,
  resolveDataQualityIssue,
  stageImportBatch,
} from '@/server/modules/ingestion/service';

async function withDb<T>(fn: (rt: DbRuntime) => Promise<T>) {
  const rt = await createInMemoryTestRuntime();
  try {
    await ensureSchema(rt);
    await ensureSeeded(rt.db);
    return await fn(rt);
  } finally {
    await rt.close();
  }
}
async function actorFor(rt: DbRuntime, id: string) {
  const [u] = await rt.db.select().from(schema.users).where(eq(schema.users.id, id));
  return buildActorContext(rt.db, u!);
}

async function stageDuplicatePair(rt: DbRuntime, admin: Awaited<ReturnType<typeof actorFor>>, tag: string) {
  const staged = await stageImportBatch(rt.db, admin, {
    sourceArchiveName: `${tag}.xlsx`,
    groups: [
      { groupRef: `${tag}-A`, groupNameFromSheet: 'กลุ่ม A', careCode: `${tag}A`, sourceFile: `${tag}.xlsx`, sourceSheet: 'A' },
      { groupRef: `${tag}-B`, groupNameFromSheet: 'กลุ่ม B', careCode: `${tag}B`, sourceFile: `${tag}.xlsx`, sourceSheet: 'B' },
    ],
    members: [
      { memberRowRef: `${tag}-A1`, groupRef: `${tag}-A`, sourceFile: `${tag}.xlsx`, sourceSheet: 'A', sourceRow: 5, fullNameRaw: 'สมชาย ซ้ำกัน', nicknameRaw: 'ชาย' },
      { memberRowRef: `${tag}-B1`, groupRef: `${tag}-B`, sourceFile: `${tag}.xlsx`, sourceSheet: 'B', sourceRow: 5, fullNameRaw: 'สมชาย ซ้ำกัน', nicknameRaw: 'ชาย' },
      { memberRowRef: `${tag}-A2`, groupRef: `${tag}-A`, sourceFile: `${tag}.xlsx`, sourceSheet: 'A', sourceRow: 6, fullNameRaw: 'สมหญิง ไม่ซ้ำ', nicknameRaw: 'หญิง' },
    ],
  });
  const issues = await rt.db.select().from(schema.dataQualityIssues).where(eq(schema.dataQualityIssues.batchId, staged.batch.id));
  return { staged, issues };
}

describe('Duplicate review rule (owner decision 1)', () => {
  it('puts every row of a cross-group candidate set in pending_review and promotes none of them', async () => {
    await withDb(async (rt) => {
      const admin = await actorFor(rt, SEED_IDS.users.admin);
      const { staged, issues } = await stageDuplicatePair(rt, admin, 'DUP1');
      const rows = await rt.db.select().from(schema.stagingMemberRows).where(eq(schema.stagingMemberRows.batchId, staged.batch.id));
      const dupRows = rows.filter((r) => r.memberRowRef.endsWith('A1') || r.memberRowRef.endsWith('B1'));
      expect(dupRows).toHaveLength(2);
      expect(dupRows.every((r) => r.dataStatus === 'pending_review')).toBe(true);
      expect(issues.filter((i) => i.issueCode === 'duplicate_candidate')).toHaveLength(2);

      const result = await promoteStagingBatch(rt.db, admin, staged.batch.id);
      const created = await rt.db.select().from(schema.members);
      expect(created.map((m) => m.memberCode).filter((c) => c.startsWith('DUP1'))).toEqual(['DUP1-A2']);
      expect(result.skippedIncompleteMembers).toBe(2);
    });
  });
});

describe('Immutable data-quality decisions (owner decision 3)', () => {
  it('appends a chain: decide, supersede, reverse, decide again. Nothing is overwritten.', async () => {
    await withDb(async (rt) => {
      const superAdmin = await actorFor(rt, SEED_IDS.users.superAdmin);
      const admin = await actorFor(rt, SEED_IDS.users.admin);
      const { issues } = await stageDuplicatePair(rt, admin, 'DUP2');
      const issue = issues[0]!;

      await resolveDataQualityIssue(rt.db, admin, { issueId: issue.id, decision: 'rejected', resolutionNote: 'ซ้ำจริง' });
      await resolveDataQualityIssue(rt.db, superAdmin, { issueId: issue.id, decision: 'approved_fix', resolutionNote: 'ตรวจใหม่ เป็นคนละคน' });
      await resolveDataQualityIssue(rt.db, admin, { issueId: issue.id, decision: 'reversed', resolutionNote: 'ยกเลิก รอตรวจอีกครั้ง' });
      const last = await resolveDataQualityIssue(rt.db, admin, { issueId: issue.id, decision: 'deferred', resolutionNote: 'รอข้อมูลเพิ่ม' });
      expect(last.status).toBe('deferred');

      const history = await listDecisionHistory(rt.db, admin, issue.id);
      expect(history.map((h) => h.decisionType)).toEqual(['rejected', 'approved_fix', 'reversed', 'deferred']);
      expect(history[0]!.supersedesDecisionId).toBeNull();
      for (let i = 1; i < history.length; i++) expect(history[i]!.supersedesDecisionId).toBe(history[i - 1]!.id);
      expect(history.map((h) => h.reason)).toEqual(['ซ้ำจริง', 'ตรวจใหม่ เป็นคนละคน', 'ยกเลิก รอตรวจอีกครั้ง', 'รอข้อมูลเพิ่ม']);
      expect(history[1]!.decidedByUserId).toBe(SEED_IDS.users.superAdmin);
      expect(history.every((h) => h.decidedAt instanceof Date)).toBe(true);
      // The staging row follows the head: deferred keeps the row blocked.
      const [row] = await rt.db.select().from(schema.stagingMemberRows).where(eq(schema.stagingMemberRows.id, issue.targetId));
      expect(row!.dataStatus).toBe('pending_review');
    });
  });

  it('refuses to reverse when there is nothing to reverse, or twice in a row', async () => {
    await withDb(async (rt) => {
      const admin = await actorFor(rt, SEED_IDS.users.admin);
      const { issues } = await stageDuplicatePair(rt, admin, 'DUP3');
      const id = issues[0]!.id;
      await expect(resolveDataQualityIssue(rt.db, admin, { issueId: id, decision: 'reversed', resolutionNote: 'ทดสอบ' })).rejects.toMatchObject({ code: 'NOTHING_TO_REVERSE' });
      await resolveDataQualityIssue(rt.db, admin, { issueId: id, decision: 'approved_fix', resolutionNote: 'ตกลง' });
      await resolveDataQualityIssue(rt.db, admin, { issueId: id, decision: 'reversed', resolutionNote: 'ยกเลิก' });
      await expect(resolveDataQualityIssue(rt.db, admin, { issueId: id, decision: 'reversed', resolutionNote: 'ซ้ำ' })).rejects.toMatchObject({ code: 'NOTHING_TO_REVERSE' });
      const issue = (await rt.db.select().from(schema.dataQualityIssues).where(eq(schema.dataQualityIssues.id, id)))[0]!;
      expect(issue.status).toBe('open');
    });
  });

  it('requires a non-empty reason', async () => {
    await withDb(async (rt) => {
      const admin = await actorFor(rt, SEED_IDS.users.admin);
      const { issues } = await stageDuplicatePair(rt, admin, 'DUP4');
      await expect(resolveDataQualityIssue(rt.db, admin, { issueId: issues[0]!.id, decision: 'rejected', resolutionNote: '   ' })).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
      expect(await listDecisionHistory(rt.db, admin, issues[0]!.id)).toHaveLength(0);
    });
  });

  it('rejects a stale screen with DECISION_STALE', async () => {
    await withDb(async (rt) => {
      const admin = await actorFor(rt, SEED_IDS.users.admin);
      const { issues } = await stageDuplicatePair(rt, admin, 'DUP5');
      const id = issues[0]!.id;
      await resolveDataQualityIssue(rt.db, admin, { issueId: id, decision: 'rejected', resolutionNote: 'หนึ่ง', expectedDecisionId: null });
      await expect(
        resolveDataQualityIssue(rt.db, admin, { issueId: id, decision: 'approved_fix', resolutionNote: 'สอง', expectedDecisionId: null })
      ).rejects.toMatchObject({ code: 'DECISION_STALE' });
      expect(await listDecisionHistory(rt.db, admin, id)).toHaveLength(1);
    });
  });

  it('locks the decision after the row becomes a member', async () => {
    await withDb(async (rt) => {
      const admin = await actorFor(rt, SEED_IDS.users.admin);
      const { staged, issues } = await stageDuplicatePair(rt, admin, 'DUP6');
      const id = issues[0]!.id;
      await resolveDataQualityIssue(rt.db, admin, { issueId: id, decision: 'approved_fix', resolutionNote: 'คนละคน' });
      await promoteStagingBatch(rt.db, admin, staged.batch.id);
      await expect(resolveDataQualityIssue(rt.db, admin, { issueId: id, decision: 'reversed', resolutionNote: 'เปลี่ยนใจ' })).rejects.toMatchObject({ code: 'DECISION_LOCKED' });
      await expect(resolveDataQualityIssue(rt.db, admin, { issueId: id, decision: 'rejected', resolutionNote: 'เปลี่ยนใจ' })).rejects.toMatchObject({ code: 'DECISION_LOCKED' });
      expect(await listDecisionHistory(rt.db, admin, id)).toHaveLength(1);
    });
  });

  it('refuses users without scope and users without a role, for deciding and for reading history', async () => {
    await withDb(async (rt) => {
      const admin = await actorFor(rt, SEED_IDS.users.admin);
      const { issues } = await stageDuplicatePair(rt, admin, 'DUP7');
      const id = issues[0]!.id;
      for (const uid of [SEED_IDS.users.leaderNongkung, SEED_IDS.users.pastor]) {
        const a = await actorFor(rt, uid);
        await expect(resolveDataQualityIssue(rt.db, a, { issueId: id, decision: 'approved_fix', resolutionNote: 'ขอผ่าน' })).rejects.toMatchObject({ status: 403 });
        await expect(listDecisionHistory(rt.db, a, id)).rejects.toMatchObject({ status: 403 });
      }
      expect(await listDecisionHistory(rt.db, admin, id)).toHaveLength(0);
    });
  });

  it('blocks UPDATE and DELETE on the decision table, even with raw SQL', async () => {
    await withDb(async (rt) => {
      const admin = await actorFor(rt, SEED_IDS.users.admin);
      const { issues } = await stageDuplicatePair(rt, admin, 'DUP8');
      await resolveDataQualityIssue(rt.db, admin, { issueId: issues[0]!.id, decision: 'rejected', resolutionNote: 'เหตุผล' });
      await expect(rt.db.execute(sql`UPDATE data_quality_decisions SET reason = 'x'`)).rejects.toThrow();
      await expect(rt.db.execute(sql`DELETE FROM data_quality_decisions`)).rejects.toThrow();
      const rows = await rt.db.select().from(schema.dataQualityDecisions);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.reason).toBe('เหตุผล');
    });
  });

  it('rejects a decision that supersedes a decision of another issue', async () => {
    await withDb(async (rt) => {
      const admin = await actorFor(rt, SEED_IDS.users.admin);
      const { issues } = await stageDuplicatePair(rt, admin, 'DUP9');
      const [i1, i2] = [issues[0]!, issues[1]!];
      await resolveDataQualityIssue(rt.db, admin, { issueId: i1.id, decision: 'rejected', resolutionNote: 'หนึ่ง' });
      const [d1] = await rt.db.select().from(schema.dataQualityDecisions);
      await expect(
        rt.db.insert(schema.dataQualityDecisions).values({
          issueId: i2.id,
          decisionType: 'approved_fix',
          supersedesDecisionId: d1!.id,
          reason: 'ผิดสาย',
          decidedByUserId: SEED_IDS.users.admin,
        })
      ).rejects.toThrow();
    });
  });
});

describe('Rollback with a reused member (owner priority 2)', () => {
  it('keeps a verified member that a later batch reused, and removes only unverified growth rows of the rolled-back batch', async () => {
    await withDb(async (rt) => {
      const admin = await actorFor(rt, SEED_IDS.users.admin);
      const mk = (tag: string) => ({
        sourceArchiveName: `${tag}.xlsx`,
        groups: [{ groupRef: `G-${tag}`, groupNameFromSheet: `กลุ่ม ${tag}`, careCode: `C-${tag}`, sourceFile: `${tag}.xlsx`, sourceSheet: tag }],
        members: [
          { memberRowRef: 'M-REUSE-1', groupRef: `G-${tag}`, sourceFile: `${tag}.xlsx`, sourceSheet: tag, sourceRow: 5, fullNameRaw: 'สมใจ ใช้ซ้ำ', nicknameRaw: 'ใจ', discipleshipGoalRaw: `เป้าหมาย ${tag}`, targetTimeframeRaw: 'สิ้นปี', disciplerNameRaw: 'พี่เลี้ยง' },
        ],
      });
      const b1 = await stageImportBatch(rt.db, admin, mk('RE1'));
      await promoteStagingBatch(rt.db, admin, b1.batch.id);
      await rt.db.update(schema.members).set({ verificationStatus: 'verified' }).where(eq(schema.members.memberCode, 'M-REUSE-1'));
      const b2 = await stageImportBatch(rt.db, admin, mk('RE2'));
      await promoteStagingBatch(rt.db, admin, b2.batch.id);
      // The reused member waits for a person (duplicate_existing_member), then the person approves.
      const [reuseIssue] = await rt.db.select().from(schema.dataQualityIssues).where(eq(schema.dataQualityIssues.batchId, b2.batch.id));
      expect(reuseIssue!.issueCode).toBe('duplicate_existing_member');
      await resolveDataQualityIssue(rt.db, admin, { issueId: reuseIssue!.id, decision: 'approved_fix', resolutionNote: 'คนเดียวกัน ย้ายกลุ่ม' });
      await promoteStagingBatch(rt.db, admin, b2.batch.id);

      const growthBefore = await rt.db.select().from(schema.memberGrowthRecords);
      const fromB1 = growthBefore.filter((g) => g.sourceBatchId === b1.batch.id);
      expect(fromB1).toHaveLength(1);

      expect(growthBefore.filter((g) => g.sourceBatchId === b2.batch.id)).toHaveLength(1);
      await rollbackImportBatch(rt.db, admin, b2.batch.id, 'นำเข้าผิดไฟล์');

      const [member] = await rt.db.select().from(schema.members).where(eq(schema.members.memberCode, 'M-REUSE-1'));
      expect(member!.verificationStatus).toBe('verified');
      expect(member!.sourceBatchId).toBe(b1.batch.id);
      const growthAfter = await rt.db.select().from(schema.memberGrowthRecords);
      expect(growthAfter.filter((g) => g.sourceBatchId === b1.batch.id)).toHaveLength(1);
      expect(growthAfter.filter((g) => g.sourceBatchId === b2.batch.id)).toHaveLength(0);
    });
  });
});

describe('Rollback protects reviewed growth records', () => {
  it('archives instead of deleting when a growth record of the batch was verified by a person', async () => {
    await withDb(async (rt) => {
      const admin = await actorFor(rt, SEED_IDS.users.admin);
      const staged = await stageImportBatch(rt.db, admin, {
        sourceArchiveName: 'GV1.xlsx',
        groups: [{ groupRef: 'G-GV1', groupNameFromSheet: 'กลุ่ม GV1', careCode: 'C-GV1', sourceFile: 'GV1.xlsx', sourceSheet: 'GV1' }],
        members: [{ memberRowRef: 'M-GV1-1', groupRef: 'G-GV1', sourceFile: 'GV1.xlsx', sourceSheet: 'GV1', sourceRow: 5, fullNameRaw: 'สมปอง เติบโต', nicknameRaw: 'ปอง', discipleshipGoalRaw: 'อ่านพระคัมภีร์', targetTimeframeRaw: 'สิ้นปี', disciplerNameRaw: 'พี่เลี้ยง' }],
      });
      await promoteStagingBatch(rt.db, admin, staged.batch.id);
      await rt.db.update(schema.memberGrowthRecords).set({ verificationStatus: 'VERIFIED' }).where(eq(schema.memberGrowthRecords.sourceBatchId, staged.batch.id));
      const result = await rollbackImportBatch(rt.db, admin, staged.batch.id, 'ทดสอบ');
      expect(result.archivedInsteadOfDeleted).toBe(true);
      expect(await rt.db.select().from(schema.memberGrowthRecords).where(eq(schema.memberGrowthRecords.sourceBatchId, staged.batch.id))).toHaveLength(1);
      expect(await rt.db.select().from(schema.members).where(eq(schema.members.memberCode, 'M-GV1-1'))).toHaveLength(1);
    });
  });
});

describe('Growth columns Y-AD stay unmapped until the workbook is inspected (owner decision 2)', () => {
  it('invents no growth data from column letters, and keeps the raw cells', async () => {
    await withDb(async (rt) => {
      const admin = await actorFor(rt, SEED_IDS.users.admin);
      const staged = await stageImportBatch(rt.db, admin, {
        sourceArchiveName: 'LET1.xlsx',
        groups: [{ groupRef: 'G-LET1', groupNameFromSheet: 'กลุ่ม LET1', careCode: 'C-LET1', sourceFile: 'LET1.xlsx', sourceSheet: 'S' }],
        members: [{
          memberRowRef: 'M-LET1-1', groupRef: 'G-LET1', sourceFile: 'LET1.xlsx', sourceSheet: 'S', sourceRow: 5,
          fullNameRaw: 'สมศักดิ์ ตัวอักษร', nicknameRaw: 'ศักดิ์',
          rawCells: { Y: 'ค่าในคอลัมน์ Y', Z: 'ค่าในคอลัมน์ Z', AA: 'AA', AB: 'AB', AC: 'AC', AD: 'AD' },
        }],
      });
      await promoteStagingBatch(rt.db, admin, staged.batch.id);
      expect(await rt.db.select().from(schema.memberGrowthRecords).where(eq(schema.memberGrowthRecords.sourceBatchId, staged.batch.id))).toHaveLength(0);
      const [row] = await rt.db.select().from(schema.stagingMemberRows).where(eq(schema.stagingMemberRows.batchId, staged.batch.id));
      expect(row!.rawCellsJson).toMatchObject({ Y: 'ค่าในคอลัมน์ Y', AD: 'AD' });
    });
  });
});
