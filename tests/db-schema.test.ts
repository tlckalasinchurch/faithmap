import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createInMemoryTestRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import {
  visitors,
  reportAuditEvents,
  securityAuditLogs,
  reportingPeriods,
} from '@/server/db/schema';

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

describe('PostgreSQL 16 Schema, Constraints, Triggers & Seed Integrity', () => {
  it('enforces PDPA visitor consent, non-self-approval, sequential review, and append-only audit logs in PostgreSQL', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      const seededFirst = await ensureSeeded(runtime.db);
      const seededSecond = await ensureSeeded(runtime.db);
      expect(seededFirst).toBe(true);
      expect(seededSecond).toBe(false);

      // 1. DEC-10 DB CHECK: visitor phone without consent_for_contact = true MUST fail in SQL
      await expectPgError(
        runtime.db.insert(visitors).values({
          fullName: 'Test Unconsented Visitor',
          phoneE164: '+66812345678',
          consentForContact: false,
        }),
        /visitors_pdpa_consent_chk/i
      );

      const [openPeriod] = await runtime.db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.status, 'open'));
      expect(openPeriod).toBeDefined();

      // 2. DEC-05 DB CHECK: approved_by_user_id === submitted_by_user_id MUST fail in SQL
      await expectPgError(
        runtime.db.execute(sql`
          UPDATE weekly_reports
          SET status = 'approved',
              approved_by_user_id = submitted_by_user_id,
              approved_at = NOW(),
              supervisor_reviewed_at = NOW()
          WHERE group_id = ${SEED_IDS.groups.nonthan}::uuid
            AND period_id = ${openPeriod!.id}::uuid
        `),
        /wr_no_self_approval_chk/i
      );

      // 3. DEC-04 DB CHECK: requires_supervisor_review = true without supervisor_reviewed_at MUST fail
      await expectPgError(
        runtime.db.execute(sql`
          UPDATE weekly_reports
          SET status = 'approved',
              approved_by_user_id = ${SEED_IDS.users.bodyLeaderNorth}::uuid,
              approved_at = NOW(),
              supervisor_reviewed_at = NULL
          WHERE group_id = ${SEED_IDS.groups.nonthan}::uuid
            AND period_id = ${openPeriod!.id}::uuid
        `),
        /wr_sequential_review_chk/i
      );

      // 4. CD-07 DB CHECK: blocked report CANNOT reach approved status
      await expectPgError(
        runtime.db.execute(sql`
          UPDATE weekly_reports
          SET status = 'approved',
              approved_by_user_id = ${SEED_IDS.users.admin}::uuid,
              approved_at = NOW()
          WHERE group_id = ${SEED_IDS.groups.yangtalat}::uuid
            AND period_id = ${openPeriod!.id}::uuid
        `),
        /wr_approved_fields_chk/i
      );

      // 5. Append-only audit triggers block UPDATE/DELETE
      const events = await runtime.db.select().from(reportAuditEvents);
      expect(events.length).toBeGreaterThan(0);

      await expectPgError(
        runtime.db.delete(reportAuditEvents).where(eq(reportAuditEvents.id, events[0]!.id)),
        /append-only/i
      );

      const secLogs = await runtime.db.select().from(securityAuditLogs);
      expect(secLogs.length).toBeGreaterThan(0);
      await expectPgError(
        runtime.db
          .update(securityAuditLogs)
          .set({ reason: 'tampered' })
          .where(eq(securityAuditLogs.id, secLogs[0]!.id)),
        /append-only/i
      );
    } finally {
      await runtime.close();
    }
  });
});
