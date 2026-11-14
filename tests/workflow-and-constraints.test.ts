import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createInMemoryTestRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import {
  periodGroupSnapshots,
  reportingPeriods,
  users,
  weeklyReports,
} from '@/server/db/schema';
import { buildActorContext } from '@/server/modules/identity/service';
import {
  approveReportByBodyLeader,
  getReportDetailForGroup,
  listReportsForPeriod,
  reviewReportBySupervisor,
  saveDraftReport,
  submitReport,
  unblockReportByAdmin,
} from '@/server/modules/reporting/service';
import {
  assignLeadershipRole,
  transferGroupToBody,
} from '@/server/modules/organization/service';
import {
  listScopedMembers,
  listScopedVisitors,
  registerVisitor,
} from '@/server/modules/pastoral-care/service';
import {
  exportScopedCsvData,
  generateMeetingBriefForPeriod,
  getDashboardOverview,
} from '@/server/modules/insights/service';

async function loadActor(db: Awaited<ReturnType<typeof createInMemoryTestRuntime>>['db'], userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return buildActorContext(db, u!);
}

describe('FaithMap Core Business Workflows & Security Rules (CD-01..CD-10, DEC-01..DEC-10)', () => {
  it('enforces FR-07.5 draft isolation, DEC-04 sequential review, and DEC-05/CD-07 blocked & unblock recovery', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [openPeriod] = await runtime.db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.status, 'open'));

      const admin = await loadActor(runtime.db, SEED_IDS.users.admin);
      const pastor = await loadActor(runtime.db, SEED_IDS.users.pastor);
      const bodyLeaderN = await loadActor(runtime.db, SEED_IDS.users.bodyLeaderNorth);
      const careLeader = await loadActor(runtime.db, SEED_IDS.users.careLeaderNonthan);
      const standbySouth = await loadActor(runtime.db, SEED_IDS.users.standbyLeaderSouth);

      // 1. FR-07.5 Draft isolation: Pastor & Admin MUST NOT read Buengwichai draft content
      const pastorView = await getReportDetailForGroup(
        runtime.db,
        pastor,
        openPeriod!.id,
        SEED_IDS.groups.buengwichai
      );
      expect(pastorView?.report.status).toBe('not_submitted');
      expect(pastorView?.report.isDraftHidden).toBe(true);
      expect(pastorView?.report.summaryNotes).toBeNull();
      expect(pastorView?.report.totalAttendees).toBe(0);

      const adminQueue = await listReportsForPeriod(runtime.db, admin, openPeriod!.id);
      const bwInAdminQueue = adminQueue.find((r) => r.groupId === SEED_IDS.groups.buengwichai);
      expect(bwInAdminQueue?.status).toBe('not_submitted');
      expect(bwInAdminQueue?.isDraftHidden).toBe(true);

      // Draft owner (acting as Group Leader of Buengwichai) CAN read their own draft
      const ownerView = await getReportDetailForGroup(
        runtime.db,
        bodyLeaderN,
        openPeriod!.id,
        SEED_IDS.groups.buengwichai
      );
      expect(ownerView?.report.status).toBe('draft');
      expect(ownerView?.report.isDraftHidden).toBe(false);
      expect(ownerView?.report.totalAttendees).toBe(7);

      // Dashboard metrics exclude drafts from submittedReports and count them in missingReports
      const dash = await getDashboardOverview(runtime.db, pastor, openPeriod!.id);
      expect(dash.metrics.activeBodies).toBe(2);
      expect(dash.metrics.activeGroups).toBe(5);
      expect(dash.metrics.expectedReports).toBe(5);
      expect(dash.metrics.submittedReports).toBe(4); // Nonthan, Nongkung, Huaisithon, Yangtalat
      expect(dash.metrics.missingReports).toBe(1); // Buengwichai is still draft!
      expect(dash.metrics.blockedReports).toBe(1); // Yangtalat

      // 2. DEC-04: Body Leader CANNOT approve Nonthan before Care Leader reviews
      const [nonthanReport] = await runtime.db
        .select()
        .from(weeklyReports)
        .where(eq(weeklyReports.groupId, SEED_IDS.groups.nonthan));

      await expect(
        approveReportByBodyLeader(
          runtime.db,
          bodyLeaderN,
          nonthanReport!.id,
          'approve',
          'skip try',
          nonthanReport!.version
        )
      ).rejects.toMatchObject({ code: 'WORKFLOW_SUPERVISOR_REVIEW_REQUIRED', status: 409 });

      // Supervisor forwards -> Body Leader approves cleanly
      const reviewed = await reviewReportBySupervisor(
        runtime.db,
        careLeader,
        nonthanReport!.id,
        'forward',
        'ตรวจสอบยอดสมาชิกถูกต้อง',
        nonthanReport!.version
      );
      expect(reviewed.status).toBe('under_review');

      const approved = await approveReportByBodyLeader(
        runtime.db,
        bodyLeaderN,
        reviewed.id,
        'approve',
        'อนุมัติเรียบร้อย',
        reviewed.version
      );
      expect(approved.status).toBe('approved');

      // 3. DEC-05 + CD-07 on Buengwichai: sole Body Leader submits -> Blocked; self-approval forbidden!
      const bwDraft = await saveDraftReport(
        runtime.db,
        bodyLeaderN,
        openPeriod!.id,
        SEED_IDS.groups.buengwichai,
        {
          meetingHeld: true,
          totalAttendees: 9,
          memberAttendees: 9,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          summaryNotes: 'พร้อมส่งอนุมัติ',
          expectedVersion: ownerView!.report.version,
        }
      );
      const bwSubmitted = await submitReport(
        runtime.db,
        bodyLeaderN,
        openPeriod!.id,
        SEED_IDS.groups.buengwichai,
        {
          meetingHeld: true,
          totalAttendees: 9,
          memberAttendees: 9,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          summaryNotes: 'ส่งรายงานจริง',
          expectedVersion: bwDraft.version,
        }
      );
      expect(bwSubmitted.isBlocked).toBe(true);
      expect(bwSubmitted.blockedReason).toBe('ONLY_SUBMITTER_IS_BODY_LEADER');

      await expect(
        approveReportByBodyLeader(
          runtime.db,
          bodyLeaderN,
          bwSubmitted.id,
          'approve',
          'self approve attempt',
          bwSubmitted.version
        )
      ).rejects.toMatchObject({ code: 'SELF_APPROVAL_FORBIDDEN', status: 403 });

      // 4. CD-07 Recovery on Yangtalat (Body South currently has suspended Body Leader)
      const [ytReport] = await runtime.db
        .select()
        .from(weeklyReports)
        .where(eq(weeklyReports.groupId, SEED_IDS.groups.yangtalat));
      expect(ytReport!.isBlocked).toBe(true);

      // Admin cannot unblock before assigning a usable Body Leader
      await expect(
        unblockReportByAdmin(runtime.db, admin, ytReport!.id, 'unblock prematurely')
      ).rejects.toMatchObject({ code: 'REPORT_WORKFLOW_BLOCKED', status: 409 });

      // Admin assigns active standby leader as Body South's Body Leader, unblocks, then approves!
      await assignLeadershipRole(runtime.db, admin, {
        userId: standbySouth.user.id,
        scopeType: 'body',
        bodyId: SEED_IDS.bodies.south,
        roleType: 'body_leader',
        isPrimary: true,
      });

      const unblockedYt = await unblockReportByAdmin(
        runtime.db,
        admin,
        ytReport!.id,
        'แต่งตั้งกัญญาเป็นหัวหน้าบอดี้ใต้แล้ว'
      );
      expect(unblockedYt.isBlocked).toBe(false);

      const refreshedStandby = await loadActor(runtime.db, standbySouth.user.id);
      const approvedYt = await approveReportByBodyLeader(
        runtime.db,
        refreshedStandby,
        unblockedYt.id,
        'approve',
        'อนุมัติหลังปลดล็อก',
        unblockedYt.version
      );
      expect(approvedYt.status).toBe('approved');
    } finally {
      await runtime.close();
    }
  });

  it('enforces DEC-09 Body Leader scope, DEC-10 PDPA visitor consent, DEC-06 PII masking, and DEC-08/DEC-01 snapshots & brief immutability', async () => {
    const runtime = await createInMemoryTestRuntime();
    try {
      await ensureSchema(runtime);
      await ensureSeeded(runtime.db);

      const [openPeriod] = await runtime.db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.status, 'open'));

      const admin = await loadActor(runtime.db, SEED_IDS.users.admin);
      const pastor = await loadActor(runtime.db, SEED_IDS.users.pastor);
      const bodyLeaderN = await loadActor(runtime.db, SEED_IDS.users.bodyLeaderNorth);
      const leaderNonthan = await loadActor(runtime.db, SEED_IDS.users.leaderNonthan);
      const standbySouth = await loadActor(runtime.db, SEED_IDS.users.standbyLeaderSouth);

      // DEC-09: Body Leader North CAN manage group assignment in Body North
      const newAssign = await assignLeadershipRole(runtime.db, bodyLeaderN, {
        userId: standbySouth.user.id,
        scopeType: 'group',
        groupId: SEED_IDS.groups.nongkung,
        roleType: 'care_leader',
        isPrimary: true,
      });
      expect(newAssign.roleType).toBe('care_leader');

      // DEC-09: Body Leader North CANNOT assign roles in Body South or appoint body_leader
      await expect(
        assignLeadershipRole(runtime.db, bodyLeaderN, {
          userId: standbySouth.user.id,
          scopeType: 'group',
          groupId: SEED_IDS.groups.yangtalat,
          roleType: 'care_leader',
        })
      ).rejects.toMatchObject({ code: 'SCOPE_FORBIDDEN', status: 403 });

      await expect(
        assignLeadershipRole(runtime.db, bodyLeaderN, {
          userId: standbySouth.user.id,
          scopeType: 'body',
          bodyId: SEED_IDS.bodies.north,
          roleType: 'body_leader',
        })
      ).rejects.toMatchObject({ code: 'ADMIN_REQUIRED', status: 403 });

      // DEC-10: PDPA visitor contact consent required when phone provided
      await expect(
        registerVisitor(runtime.db, leaderNonthan, {
          groupId: SEED_IDS.groups.nonthan,
          fullName: 'นายทดลอง ไม่ยินยอม',
          phoneE164: '+66899998888',
          consentForContact: false,
        })
      ).rejects.toMatchObject({ code: 'VISITOR_CONSENT_REQUIRED', status: 400 });

      // Without phone, walk-in visitor succeeds even with consent=false
      const walkIn = await registerVisitor(runtime.db, leaderNonthan, {
        groupId: SEED_IDS.groups.nonthan,
        fullName: 'นางสาวมาร่วม ไม่ทิ้งเบอร์',
        consentForContact: false,
      });
      expect(walkIn.visitor.phoneE164).toBeNull();

      // With phone + consent=true succeeds and can auto-create follow-up
      const consented = await registerVisitor(runtime.db, leaderNonthan, {
        groupId: SEED_IDS.groups.nonthan,
        fullName: 'นายสมหมาย ยินยอมแล้ว',
        phoneE164: '+66891112222',
        consentForContact: true,
        createFollowUp: true,
      });
      expect(consented.visitor.consentForContact).toBe(true);
      expect(consented.followUp).not.toBeNull();

      // DEC-06: Pastor (mission_leader) sees masked PII, Group Leader sees unmasked PII
      const pastorMembers = await listScopedMembers(runtime.db, pastor);
      expect(pastorMembers.length).toBeGreaterThan(0);
      expect(pastorMembers.every((m) => m.piiMasked)).toBe(true);
      expect(pastorMembers.some((m) => m.phone?.includes('***'))).toBe(true);

      const leaderMembers = await listScopedMembers(runtime.db, leaderNonthan);
      expect(leaderMembers.every((m) => !m.piiMasked)).toBe(true);
      expect(leaderMembers.some((m) => m.phone?.startsWith('+66'))).toBe(true);

      const pastorVisitors = await listScopedVisitors(runtime.db, pastor);
      expect(pastorVisitors.every((v) => v.piiMasked)).toBe(true);

      const csvPastor = await exportScopedCsvData(runtime.db, pastor, 'visitors');
      expect(csvPastor.csv).not.toContain('+66894123456');

      // DEC-08: Transferring group to Body South updates live group but leaves historical period_group_snapshots intact
      await transferGroupToBody(
        runtime.db,
        admin,
        SEED_IDS.groups.nongkung,
        SEED_IDS.bodies.south,
        'ปรับเขตดูแลอำเภอยางตลาด-หนองกุง'
      );
      const [snapAfterTransfer] = await runtime.db
        .select()
        .from(periodGroupSnapshots)
        .where(eq(periodGroupSnapshots.groupId, SEED_IDS.groups.nongkung));
      expect(snapAfterTransfer!.bodyId).toBe(SEED_IDS.bodies.north);

      // DEC-01: Brief generation creates immutable brief and repeats idempotently
      const brief1 = await generateMeetingBriefForPeriod(runtime.db, openPeriod!.id, {
        actorUserId: admin.user.id,
        isCronJob: false,
      });
      const brief2 = await generateMeetingBriefForPeriod(runtime.db, openPeriod!.id, {
        actorUserId: admin.user.id,
        isCronJob: true,
      });
      expect(brief2.id).toBe(brief1.id);
      expect(brief1.isImmutable).toBe(true);
    } finally {
      await runtime.close();
    }
  });
});
