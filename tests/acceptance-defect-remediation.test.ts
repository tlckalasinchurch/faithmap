import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { createInMemoryTestRuntime } from '@/server/db/client';
import { ensureSchema } from '@/server/db/migrate';
import { ensureSeeded, SEED_IDS } from '@/server/db/seed';
import { reportingPeriods, users, weeklyReports } from '@/server/db/schema';
import { buildActorContext } from '@/server/modules/identity/service';
import {
  getReportDetailForGroup,
  listReportsForPeriod,
  reviewReportBySupervisor,
  saveDraftReport,
  submitReport,
} from '@/server/modules/reporting/service';
import { endGroupMembership } from '@/server/modules/pastoral-care/service';
import { extractOfflineDraftState } from '@/lib/offline-drafts';
import { setupRouteTestDb, type RouteTestDbHandle } from './helpers/route-test-db';

async function loadActor(
  db: Awaited<ReturnType<typeof createInMemoryTestRuntime>>['db'],
  userId: string
) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return buildActorContext(db, u!);
}

const NONTHAN_MEMBERS = [
  '00000005-0000-4000-8000-000000000003',
  '00000005-0000-4000-8000-000000000008',
  '00000005-0000-4000-8000-000000000009',
] as const;

const HUAISITHON_MEMBERS = [
  '00000005-0000-4000-8000-000000000005',
  '00000005-0000-4000-8000-000000000011',
] as const;

describe('Acceptance Defect Remediation (#1 Attendance, #2 Offline Drafts, #4 Privacy)', () => {
  it('Defect #1: enforces complete active roster attendance on submit while preserving CD-01 partial drafts and meetingHeld=false', async () => {
    const rt = await createInMemoryTestRuntime();
    try {
      await ensureSchema(rt);
      await ensureSeeded(rt.db);

      const [openPeriod] = await rt.db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.status, 'open'));

      const leaderNonthan = await loadActor(rt.db, SEED_IDS.users.leaderNonthan);
      const careLeader = await loadActor(rt.db, SEED_IDS.users.careLeaderNonthan);
      const admin = await loadActor(rt.db, SEED_IDS.users.admin);

      const detail = await getReportDetailForGroup(
        rt.db,
        leaderNonthan,
        openPeriod!.id,
        SEED_IDS.groups.nonthan
      );
      // Put nonthan (3 active members) into needs_revision so it can be re-submitted cleanly
      const revRequested = await reviewReportBySupervisor(
        rt.db,
        careLeader,
        detail!.report.id,
        'request_revision',
        'ขอตรวจเช็กชื่อใหม่',
        detail!.report.version
      );
      let currentVersion = revRequested.version;

      // 1. Empty or omitted attendance when meetingHeld=true MUST fail
      await expect(
        submitReport(rt.db, leaderNonthan, openPeriod!.id, SEED_IDS.groups.nonthan, {
          meetingHeld: true,
          totalAttendees: 3,
          memberAttendees: 3,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          expectedVersion: currentVersion,
        })
      ).rejects.toMatchObject({ status: 400, code: 'ATTENDANCE_INCOMPLETE' });

      await expect(
        submitReport(rt.db, leaderNonthan, openPeriod!.id, SEED_IDS.groups.nonthan, {
          meetingHeld: true,
          totalAttendees: 3,
          memberAttendees: 3,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          attendance: [],
          expectedVersion: currentVersion,
        })
      ).rejects.toMatchObject({ status: 400, code: 'ATTENDANCE_INCOMPLETE' });

      // 2. Partial attendance (2 of 3 active members) MUST fail on submit
      await expect(
        submitReport(rt.db, leaderNonthan, openPeriod!.id, SEED_IDS.groups.nonthan, {
          meetingHeld: true,
          totalAttendees: 2,
          memberAttendees: 2,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          attendance: [
            { memberId: NONTHAN_MEMBERS[0], attendanceStatus: 'present' },
            { memberId: NONTHAN_MEMBERS[1], attendanceStatus: 'online' },
          ],
          expectedVersion: currentVersion,
        })
      ).rejects.toMatchObject({ status: 400, code: 'ATTENDANCE_INCOMPLETE' });

      // 3. Duplicate memberId MUST fail
      await expect(
        submitReport(rt.db, leaderNonthan, openPeriod!.id, SEED_IDS.groups.nonthan, {
          meetingHeld: true,
          totalAttendees: 3,
          memberAttendees: 3,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          attendance: [
            { memberId: NONTHAN_MEMBERS[0], attendanceStatus: 'present' },
            { memberId: NONTHAN_MEMBERS[0], attendanceStatus: 'leave' },
            { memberId: NONTHAN_MEMBERS[1], attendanceStatus: 'present' },
          ],
          expectedVersion: currentVersion,
        })
      ).rejects.toMatchObject({ status: 400, code: 'ATTENDANCE_DUPLICATE_MEMBER' });

      // 4. Member belonging to another group MUST fail
      await expect(
        submitReport(rt.db, leaderNonthan, openPeriod!.id, SEED_IDS.groups.nonthan, {
          meetingHeld: true,
          totalAttendees: 3,
          memberAttendees: 3,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          attendance: [
            { memberId: NONTHAN_MEMBERS[0], attendanceStatus: 'present' },
            { memberId: NONTHAN_MEMBERS[1], attendanceStatus: 'present' },
            { memberId: '00000005-0000-4000-8000-000000000010', attendanceStatus: 'present' },
          ],
          expectedVersion: currentVersion,
        })
      ).rejects.toMatchObject({ status: 400, code: 'MEMBER_NOT_IN_GROUP' });

      // 5. Malformed offering MUST fail
      await expect(
        submitReport(rt.db, leaderNonthan, openPeriod!.id, SEED_IDS.groups.nonthan, {
          meetingHeld: true,
          totalAttendees: 3,
          memberAttendees: 3,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          offeringAmountThb: 'not-a-number',
          attendance: NONTHAN_MEMBERS.map((memberId) => ({
            memberId,
            attendanceStatus: 'present',
          })),
          expectedVersion: currentVersion,
        })
      ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });

      // 6. Save draft (CD-01) allows partial attendance on an editable draft (huaisithon is needs_revision, 2 members)
      const leaderHuai = await loadActor(rt.db, SEED_IDS.users.leaderHuaisithon);
      const huaiDraft = await saveDraftReport(
        rt.db,
        leaderHuai,
        openPeriod!.id,
        SEED_IDS.groups.huaisithon,
        {
          meetingHeld: true,
          totalAttendees: 1,
          memberAttendees: 1,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          attendance: [{ memberId: HUAISITHON_MEMBERS[0], attendanceStatus: 'online' }],
        }
      );
      expect(huaiDraft.status).toBe('needs_revision');

      // 7. End one membership -> remaining 2 active members suffice for submit, while ended member fails
      await endGroupMembership(rt.db, admin, {
        groupId: SEED_IDS.groups.nonthan,
        memberId: NONTHAN_MEMBERS[2],
      });

      await expect(
        submitReport(rt.db, leaderNonthan, openPeriod!.id, SEED_IDS.groups.nonthan, {
          meetingHeld: true,
          totalAttendees: 3,
          memberAttendees: 3,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          attendance: NONTHAN_MEMBERS.map((memberId) => ({
            memberId,
            attendanceStatus: 'present',
          })),
          expectedVersion: currentVersion,
        })
      ).rejects.toMatchObject({ status: 400, code: 'MEMBER_NOT_IN_GROUP' });

      const submittedHeld = await submitReport(
        rt.db,
        leaderNonthan,
        openPeriod!.id,
        SEED_IDS.groups.nonthan,
        {
          meetingHeld: true,
          totalAttendees: 4,
          memberAttendees: 2,
          newVisitorsCount: 1,
          returningVisitorsCount: 1,
          childrenCount: 0,
          offeringAmountThb: '450.50',
          attendance: [
            { memberId: NONTHAN_MEMBERS[0], attendanceStatus: 'online' },
            { memberId: NONTHAN_MEMBERS[1], attendanceStatus: 'leave' },
          ],
          expectedVersion: currentVersion,
        }
      );
      expect(submittedHeld.status).toBe('submitted');
      currentVersion = submittedHeld.version;

      // Put back into needs_revision via care leader, then verify meetingHeld=false submits cleanly without attendance array
      const revAgain = await reviewReportBySupervisor(
        rt.db,
        careLeader,
        submittedHeld.id,
        'request_revision',
        'ทดสอบกรณียงดประชุม',
        currentVersion
      );
      const submittedNotHeld = await submitReport(
        rt.db,
        leaderNonthan,
        openPeriod!.id,
        SEED_IDS.groups.nonthan,
        {
          meetingHeld: false,
          notHeldReason: 'งดประชุมชั่วคราวเนื่องจากน้ำท่วม',
          totalAttendees: 0,
          memberAttendees: 0,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          expectedVersion: revAgain.version,
        }
      );
      expect(submittedNotHeld.status).toBe('submitted');
      expect(submittedNotHeld.meetingHeld).toBe(false);

      // Submitting again while locked ('submitted') MUST still return 409 INVALID_STATE_TRANSITION even if attendance is omitted
      await expect(
        submitReport(rt.db, leaderNonthan, openPeriod!.id, SEED_IDS.groups.nonthan, {
          meetingHeld: true,
          totalAttendees: 2,
          memberAttendees: 2,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          expectedVersion: submittedNotHeld.version,
        })
      ).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE_TRANSITION' });
    } finally {
      await rt.close();
    }
  });

  it('Defect #2: extractOfflineDraftState restores all fields and attendance statuses (including online/leave) losslessly', () => {
    const memberIds = ['m-1', 'm-2', 'm-3', 'm-4'];
    const payload = {
      meetingHeld: true,
      meetingDate: '2026-11-15',
      totalAttendees: 5,
      memberAttendees: 2,
      newVisitorsCount: 2,
      returningVisitorsCount: 1,
      childrenCount: 3,
      offeringAmountThb: 750.5,
      summaryNotes: 'สรุปสามัคคีธรรม',
      prayerRequests: 'อธิษฐานเผื่อผู้ป่วย',
      careNeedsNotes: 'ต้องการเยี่ยมบ้าน',
      teachingTopic: 'ความรักของพระเจ้า',
      scriptureRef: 'ยอห์น 3:16',
      activities: { prayer: false, fellowship: true, other: 'ร่วมรับประทานอาหาร' },
      locationText: 'บ้านป้าสายใจ',
      atmosphereNotes: 'อบอุ่นเป็นกันเอง',
      followupNeedsText: 'ติดตามผู้เยี่ยมใหม่',
      nextWeekPlan: 'ศึกษาพระคัมภีร์บทที่ 4',
      supportNeededText: 'ขอคู่มือเพิ่ม 3 เล่ม',
      expectedVersion: 5,
      attendance: [
        { memberId: 'm-1', attendanceStatus: 'online' },
        { memberId: 'm-2', attendanceStatus: 'leave' },
        { memberId: 'm-3', attendanceStatus: 'absent' },
        { memberId: 'm-removed', attendanceStatus: 'online' },
      ],
    };

    const hydrated = extractOfflineDraftState(payload, memberIds, '2026-11-14', {
      'm-4': 'present',
    });

    expect(hydrated.meetingHeld).toBe(true);
    expect(hydrated.meetingDate).toBe('2026-11-15');
    expect(hydrated.totalAttendees).toBe(5);
    expect(hydrated.memberAttendees).toBe(2); // m-1 (online) + m-4 (present)
    expect(hydrated.newVisitorsCount).toBe(2);
    expect(hydrated.returningVisitorsCount).toBe(1);
    expect(hydrated.childrenCount).toBe(3);
    expect(hydrated.offeringAmountThb).toBe('750.5');
    expect(hydrated.summaryNotes).toBe('สรุปสามัคคีธรรม');
    expect(hydrated.prayerRequests).toBe('อธิษฐานเผื่อผู้ป่วย');
    expect(hydrated.careNeedsNotes).toBe('ต้องการเยี่ยมบ้าน');
    expect(hydrated.content).toEqual({
      teachingTopic: 'ความรักของพระเจ้า',
      scriptureRef: 'ยอห์น 3:16',
      actPrayer: false,
      actFellowship: true,
      actOther: 'ร่วมรับประทานอาหาร',
      locationText: 'บ้านป้าสายใจ',
      atmosphereNotes: 'อบอุ่นเป็นกันเอง',
      followupNeedsText: 'ติดตามผู้เยี่ยมใหม่',
      nextWeekPlan: 'ศึกษาพระคัมภีร์บทที่ 4',
      supportNeededText: 'ขอคู่มือเพิ่ม 3 เล่ม',
    });
    expect(hydrated.expectedVersion).toBe(5);
    expect(hydrated.attendanceMap).toEqual({
      'm-1': 'online',
      'm-2': 'leave',
      'm-3': 'absent',
      'm-4': 'present',
    });
    expect(hydrated.attendanceMap['m-removed']).toBeUndefined();

    // Empty member roster preserves explicit memberAttendees fallback
    const emptyRosterHydrated = extractOfflineDraftState(
      { meetingHeld: true, totalAttendees: 10, memberAttendees: 8 },
      [],
      '2026-11-14'
    );
    expect(emptyRosterHydrated.memberAttendees).toBe(8);
    expect(emptyRosterHydrated.totalAttendees).toBe(10);

    // Non-held meeting zeroes attendee counters/offering while preserving reason & text
    const notHeldHydrated = extractOfflineDraftState(
      {
        meetingHeld: false,
        notHeldReason: 'พายุฝนตกหนัก',
        totalAttendees: 9,
        offeringAmountThb: 500,
      },
      ['m-1'],
      '2026-11-14'
    );
    expect(notHeldHydrated.meetingHeld).toBe(false);
    expect(notHeldHydrated.notHeldReason).toBe('พายุฝนตกหนัก');
    expect(notHeldHydrated.totalAttendees).toBe(0);
    expect(notHeldHydrated.offeringAmountThb).toBe('0');
  });

  it('Defect #4: strips revisionReason, supervisorNotes, and sensitive auditEvents reasons for Pastor (mission_leader)', async () => {
    const rt = await createInMemoryTestRuntime();
    try {
      await ensureSchema(rt);
      await ensureSeeded(rt.db);

      const [openPeriod] = await rt.db
        .select()
        .from(reportingPeriods)
        .where(eq(reportingPeriods.status, 'open'));

      const careLeader = await loadActor(rt.db, SEED_IDS.users.careLeaderNonthan);
      const leaderNonthan = await loadActor(rt.db, SEED_IDS.users.leaderNonthan);
      const bodyLeaderN = await loadActor(rt.db, SEED_IDS.users.bodyLeaderNorth);
      const pastor = await loadActor(rt.db, SEED_IDS.users.pastor);

      const [nonthanReport] = await rt.db
        .select()
        .from(weeklyReports)
        .where(eq(weeklyReports.groupId, SEED_IDS.groups.nonthan));

      const sensitiveRevisionReason = 'ยอดขาดลาของพี่วิชัยไม่ตรงกับในสมุดบ้าน';
      const sensitiveSupervisorNote = 'หมายเหตุหัวหน้าแคร์: บ้านพี่สมหมายกำลังประสบปัญหาครอบครัว';

      const sentBack = await reviewReportBySupervisor(
        rt.db,
        careLeader,
        nonthanReport!.id,
        'request_revision',
        sensitiveRevisionReason,
        nonthanReport!.version
      );
      expect(sentBack.status).toBe('needs_revision');

      // Re-submit & forward with supervisor notes
      const resubmitted = await submitReport(
        rt.db,
        leaderNonthan,
        openPeriod!.id,
        SEED_IDS.groups.nonthan,
        {
          meetingHeld: true,
          totalAttendees: 3,
          memberAttendees: 3,
          newVisitorsCount: 0,
          returningVisitorsCount: 0,
          childrenCount: 0,
          summaryNotes: 'บันทึกสรุปที่มีชื่อคน: คุณวิชัยมาครบ',
          attendance: NONTHAN_MEMBERS.map((memberId) => ({
            memberId,
            attendanceStatus: 'present',
          })),
          expectedVersion: sentBack.version,
        }
      );

      const forwarded = await reviewReportBySupervisor(
        rt.db,
        careLeader,
        resubmitted.id,
        'forward',
        sensitiveSupervisorNote,
        resubmitted.version
      );
      expect(forwarded.status).toBe('under_review');

      // Pastor list view MUST strip both revisionReason and supervisorNotes
      const pastorQueue = await listReportsForPeriod(rt.db, pastor, openPeriod!.id);
      const pastorNonthanRow = pastorQueue.find((r) => r.groupId === SEED_IDS.groups.nonthan);
      expect(pastorNonthanRow).toBeTruthy();
      expect(pastorNonthanRow!.revisionReason).toBeNull();
      expect(pastorNonthanRow!.supervisorNotes).toBeNull();
      expect(pastorNonthanRow!.summaryNotes).toBeNull();

      // Pastor detail view MUST strip revisionReason, supervisorNotes, and sensitive audit event reasons/metadata
      const pastorDetail = await getReportDetailForGroup(
        rt.db,
        pastor,
        openPeriod!.id,
        SEED_IDS.groups.nonthan
      );
      expect(pastorDetail!.report.revisionReason).toBeNull();
      expect(pastorDetail!.report.supervisorNotes).toBeNull();
      const pastorJson = JSON.stringify(pastorDetail);
      expect(pastorJson).not.toContain('พี่วิชัย');
      expect(pastorJson).not.toContain('พี่สมหมาย');
      for (const ev of pastorDetail!.auditEvents) {
        if (ev.eventType !== 'workflow_blocked') {
          expect(ev.reason).toBeNull();
        }
        expect((ev.metadata as Record<string, unknown>)?.supervisorNotes).toBeUndefined();
      }

      // Blocked workflow event code remains visible on Pastor detail for blocked groups (Yangtalat)
      const pastorYtDetail = await getReportDetailForGroup(
        rt.db,
        pastor,
        openPeriod!.id,
        SEED_IDS.groups.yangtalat
      );
      const blockedEvent = pastorYtDetail!.auditEvents.find(
        (e) => e.eventType === 'workflow_blocked'
      );
      if (blockedEvent) {
        expect(blockedEvent.reason).toBeTruthy();
      }

      // Supervisor / Body Leader / Group Leader still see supervisorNotes & audit reasons
      const blDetail = await getReportDetailForGroup(
        rt.db,
        bodyLeaderN,
        openPeriod!.id,
        SEED_IDS.groups.nonthan
      );
      expect(blDetail!.report.supervisorNotes).toBe(sensitiveSupervisorNote);
      expect(blDetail!.auditEvents.some((e) => e.reason === sensitiveRevisionReason)).toBe(true);
    } finally {
      await rt.close();
    }
  });
});

describe('HTTP /api/v1/reports Route Remediation Verification (#1 & #4)', () => {
  let dbHandle: RouteTestDbHandle;
  let openPeriodId = '';
  let leaderCookie = '';
  let leaderCsrf = '';
  let pastorCookie = '';
  let pastorCsrf = '';

  beforeAll(async () => {
    dbHandle = await setupRouteTestDb('faithmap-remediation-', { demoMode: true });
    const { getReadyDb } = await import('@/server/db/bootstrap');
    const { loginWithPassword } = await import('@/server/modules/identity/service');
    const db = await getReadyDb();

    const [openPeriod] = await db
      .select()
      .from(reportingPeriods)
      .where(eq(reportingPeriods.status, 'open'));
    openPeriodId = openPeriod!.id;

    // malee_huaisithon leads huaisithon, which starts in editable 'needs_revision' state
    const leaderLogin = await loginWithPassword(db, 'malee_huaisithon', 'FaithMap2026!');
    leaderCookie = `faithmap_session=${leaderLogin.sessionToken}; faithmap_csrf=${leaderLogin.csrfToken}`;
    leaderCsrf = leaderLogin.csrfToken;

    const pastorLogin = await loginWithPassword(db, 'pastor_suda', 'FaithMap2026!');
    pastorCookie = `faithmap_session=${pastorLogin.sessionToken}; faithmap_csrf=${pastorLogin.csrfToken}`;
    pastorCsrf = pastorLogin.csrfToken;
  }, 120000);

  afterAll(async () => {
    await dbHandle?.cleanup();
  });

  it('rejects empty/incomplete/invalid HTTP report submits with 400 and hides revisionReason/supervisorNotes from Pastor GET', async () => {
    const reportsRoute = await import('../src/app/api/v1/reports/route');

    // 1. Submit with attendance=[] -> HTTP 400 ATTENDANCE_INCOMPLETE
    const emptyAttRes = await reportsRoute.POST(
      new NextRequest('http://localhost:3000/api/v1/reports', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: leaderCookie,
          'x-faithmap-csrf': leaderCsrf,
        },
        body: JSON.stringify({
          action: 'submit',
          periodId: openPeriodId,
          groupId: SEED_IDS.groups.huaisithon,
          payload: {
            meetingHeld: true,
            totalAttendees: 2,
            memberAttendees: 2,
            newVisitorsCount: 0,
            returningVisitorsCount: 0,
            childrenCount: 0,
            attendance: [],
          },
        }),
      })
    );
    expect(emptyAttRes.status).toBe(400);
    const emptyAttJson = await emptyAttRes.json();
    expect(emptyAttJson.error?.code).toBe('ATTENDANCE_INCOMPLETE');

    // 2. Submit with invalid attendanceStatus -> HTTP 400 VALIDATION_ERROR (no input echo)
    const badStatusRes = await reportsRoute.POST(
      new NextRequest('http://localhost:3000/api/v1/reports', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: leaderCookie,
          'x-faithmap-csrf': leaderCsrf,
        },
        body: JSON.stringify({
          action: 'submit',
          periodId: openPeriodId,
          groupId: SEED_IDS.groups.huaisithon,
          payload: {
            meetingHeld: true,
            totalAttendees: 2,
            memberAttendees: 2,
            newVisitorsCount: 0,
            returningVisitorsCount: 0,
            childrenCount: 0,
            attendance: [{ memberId: HUAISITHON_MEMBERS[0], attendanceStatus: 'INVALID_XYZ' }],
          },
        }),
      })
    );
    expect(badStatusRes.status).toBe(400);
    const badStatusText = await badStatusRes.text();
    expect(badStatusText).not.toContain('INVALID_XYZ');

    // 3. Submit with malformed offeringAmountThb -> HTTP 400 VALIDATION_ERROR
    const badOfferRes = await reportsRoute.POST(
      new NextRequest('http://localhost:3000/api/v1/reports', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: leaderCookie,
          'x-faithmap-csrf': leaderCsrf,
        },
        body: JSON.stringify({
          action: 'submit',
          periodId: openPeriodId,
          groupId: SEED_IDS.groups.huaisithon,
          payload: {
            meetingHeld: true,
            totalAttendees: 2,
            memberAttendees: 2,
            newVisitorsCount: 0,
            returningVisitorsCount: 0,
            childrenCount: 0,
            offeringAmountThb: 'abc-invalid',
            attendance: HUAISITHON_MEMBERS.map((memberId) => ({
              memberId,
              attendanceStatus: 'present',
            })),
          },
        }),
      })
    );
    expect(badOfferRes.status).toBe(400);
    const badOfferText = await badOfferRes.text();
    expect(badOfferText).not.toContain('abc-invalid');

    // 4. Submit with complete attendance -> HTTP 200
    const validRes = await reportsRoute.POST(
      new NextRequest('http://localhost:3000/api/v1/reports', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: leaderCookie,
          'x-faithmap-csrf': leaderCsrf,
        },
        body: JSON.stringify({
          action: 'submit',
          periodId: openPeriodId,
          groupId: SEED_IDS.groups.huaisithon,
          payload: {
            meetingHeld: true,
            totalAttendees: 2,
            memberAttendees: 2,
            newVisitorsCount: 0,
            returningVisitorsCount: 0,
            childrenCount: 0,
            offeringAmountThb: 300,
            attendance: HUAISITHON_MEMBERS.map((memberId) => ({
              memberId,
              attendanceStatus: 'present',
            })),
          },
        }),
      })
    );
    expect(validRes.status).toBe(200);

    // 5. Pastor GET list and detail strip supervisorNotes & revisionReason
    const pastorListRes = await reportsRoute.GET(
      new NextRequest(`http://localhost:3000/api/v1/reports?periodId=${openPeriodId}`, {
        headers: { cookie: pastorCookie, 'x-faithmap-csrf': pastorCsrf },
      })
    );
    expect(pastorListRes.status).toBe(200);
    const pastorListJson = await pastorListRes.json();
    for (const r of pastorListJson.reports) {
      expect(r.revisionReason).toBeNull();
      expect(r.supervisorNotes).toBeNull();
    }

    const pastorDetailRes = await reportsRoute.GET(
      new NextRequest(
        `http://localhost:3000/api/v1/reports?periodId=${openPeriodId}&groupId=${SEED_IDS.groups.huaisithon}`,
        { headers: { cookie: pastorCookie } }
      )
    );
    expect(pastorDetailRes.status).toBe(200);
    const pastorDetailJson = await pastorDetailRes.json();
    expect(pastorDetailJson.detail.report.revisionReason).toBeNull();
    expect(pastorDetailJson.detail.report.supervisorNotes).toBeNull();
  });
});
