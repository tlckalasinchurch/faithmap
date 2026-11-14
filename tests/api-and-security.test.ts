import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createInMemoryTestRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import {
  lineDispatches,
  notifications,
  reportingPeriods,
  users,
  weeklyReports,
} from '@/server/db/schema';
import {
  authenticateSessionToken,
  buildActorContext,
  loginWithPassword,
  logoutBySessionToken,
} from '@/server/modules/identity/service';
import { updateUserStatusByAdmin } from '@/server/modules/organization/service';
import { runWithIdempotency } from '@/server/modules/audit/service';
import {
  reviewReportBySupervisor,
  saveDraftReport,
} from '@/server/modules/reporting/service';
import { executeCutoffCheckJob } from '@/server/modules/insights/service';

describe('Authentication, Session Revocation, Concurrency, Idempotency & Cutoff Cron', () => {
  it('handles password login, unusable account blocking, logout revocation, and suspension session invalidation', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      // Invalid password rejected
      await expect(
        loginWithPassword(runtime.db, 'admin_kanok', 'WrongPassword!')
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });

      // Suspended account rejected even with right password
      await expect(
        loginWithPassword(runtime.db, 'wichian_suspended', 'FaithMap2026!')
      ).rejects.toMatchObject({ code: 'ACCOUNT_UNUSABLE', status: 403 });

      // Valid login succeeds and authenticates token
      const loginRes = await loginWithPassword(runtime.db, 'wichai_nonthan', 'FaithMap2026!');
      expect(loginRes.sessionToken.length).toBeGreaterThan(20);

      const authBeforeLogout = await authenticateSessionToken(runtime.db, loginRes.sessionToken);
      expect(authBeforeLogout?.user.id).toBe(SEED_IDS.users.leaderNonthan);

      // Logout revokes token immediately
      await logoutBySessionToken(runtime.db, loginRes.sessionToken);
      const authAfterLogout = await authenticateSessionToken(runtime.db, loginRes.sessionToken);
      expect(authAfterLogout).toBeNull();

      // Re-login then Admin suspends user -> active sessions revoked immediately
      const secondLogin = await loginWithPassword(runtime.db, 'wichai_nonthan', 'FaithMap2026!');
      const [adminRow] = await runtime.db
        .select()
        .from(users)
        .where(eq(users.id, SEED_IDS.users.admin));
      const adminActor = await buildActorContext(runtime.db, adminRow!);

      await updateUserStatusByAdmin(
        runtime.db,
        adminActor,
        SEED_IDS.users.leaderNonthan,
        'suspended',
        'ทดสอบระงับสิทธิ์ชั่วคราว'
      );

      const authAfterSuspend = await authenticateSessionToken(
        runtime.db,
        secondLogin.sessionToken
      );
      expect(authAfterSuspend).toBeNull();
    } finally {
      await runtime.close();
    }
  });

  it('enforces optimistic locking, idempotency replay/conflict, and cutoff missing-report alerts', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [openPeriod] = await runtime.db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.status, 'open'));

      const [blUser] = await runtime.db
        .select()
        .from(users)
        .where(eq(users.id, SEED_IDS.users.bodyLeaderNorth));
      const blActor = await buildActorContext(runtime.db, blUser!);

      const [careUser] = await runtime.db
        .select()
        .from(users)
        .where(eq(users.id, SEED_IDS.users.careLeaderNonthan));
      const careActor = await buildActorContext(runtime.db, careUser!);

      // Version conflict on draft save (stale version 99)
      await expect(
        saveDraftReport(runtime.db, blActor, openPeriod!.id, SEED_IDS.groups.buengwichai, {
          meetingHeld: true,
          totalAttendees: 8,
          memberAttendees: 8,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          expectedVersion: 99,
        })
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });

      // Version conflict on supervisor review
      const [nonthanReport] = await runtime.db
        .select()
        .from(weeklyReports)
        .where(eq(weeklyReports.groupId, SEED_IDS.groups.nonthan));

      await expect(
        reviewReportBySupervisor(
          runtime.db,
          careActor,
          nonthanReport!.id,
          'forward',
          'ok',
          999
        )
      ).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409 });

      // Idempotency replay & conflict
      let calls = 0;
      const first = await runWithIdempotency(
        runtime.db,
        'test:submit',
        'idem-key-1',
        { count: 10 },
        async () => {
          calls += 1;
          return { status: 201, body: { saved: true, count: 10 } };
        }
      );
      const replay = await runWithIdempotency(
        runtime.db,
        'test:submit',
        'idem-key-1',
        { count: 10 },
        async () => {
          calls += 1;
          return { status: 201, body: { saved: true, count: 99 } };
        }
      );
      expect(calls).toBe(1);
      expect(first.replayed).toBe(false);
      expect(replay.replayed).toBe(true);
      expect(replay.body).toEqual({ saved: true, count: 10 });

      await expect(
        runWithIdempotency(
          runtime.db,
          'test:submit',
          'idem-key-1',
          { count: 999 },
          async () => ({ status: 200, body: {} })
        )
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', status: 409 });

      // Cutoff cron job transitions overdue open period and notifies missing (draft) group
      const futureCutoff = new Date(openPeriod!.deadlineAt.getTime() + 60_000);
      const cutoffResult = await executeCutoffCheckJob(runtime.db, futureCutoff);
      expect(cutoffResult.transitionedPeriods).toBe(1);
      expect(cutoffResult.remindersSent).toBe(1); // Only Buengwichai is draft -> treated as missing!

      const notifs = await runtime.db.select().from(notifications);
      expect(notifs.some((n) => n.category === 'cutoff_missing_report')).toBe(true);
      const dispatches = await runtime.db.select().from(lineDispatches);
      expect(dispatches.some((d) => d.category === 'cutoff_missing_report')).toBe(true);
    } finally {
      await runtime.close();
    }
  });
});
