import { NextRequest, NextResponse } from 'next/server';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { isAdmin } from '@/server/modules/authz/policy';
import { listSecurityAuditLogs } from '@/server/modules/audit/service';
import {
  getDashboardOverview,
  listMeetingBriefs,
} from '@/server/modules/insights/service';
import { listUserNotifications } from '@/server/modules/notifications/service';
import {
  listBodiesWithLeaders,
  listGroupsWithContext,
  listUsersForGovernance,
} from '@/server/modules/organization/service';
import {
  listScopedFollowUps,
  listScopedMembers,
  listScopedVisitors,
} from '@/server/modules/pastoral-care/service';
import { listReportsForPeriod } from '@/server/modules/reporting/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const periodId = req.nextUrl.searchParams.get('periodId') || undefined;
    const bodyId = req.nextUrl.searchParams.get('bodyId') || undefined;

    const overview = await getDashboardOverview(db, actor, periodId, bodyId);
    const selectedPeriodId = overview.selectedPeriod.id;

    const [
      bodiesList,
      groupsList,
      reportsList,
      membersList,
      visitorsList,
      followUpsList,
      notificationsList,
    ] = await Promise.all([
      listBodiesWithLeaders(db, actor),
      listGroupsWithContext(db, actor, { periodId: selectedPeriodId, bodyId }),
      listReportsForPeriod(db, actor, selectedPeriodId),
      listScopedMembers(db, actor),
      listScopedVisitors(db, actor),
      listScopedFollowUps(db, actor),
      listUserNotifications(db, actor.user.id, 40),
    ]);

    const briefs =
      actor.user.systemRole !== 'standard_user' || actor.bodyLeaderBodyIds.size > 0
        ? await listMeetingBriefs(db, actor)
        : [];

    const governanceUsers =
      isAdmin(actor) || actor.bodyLeaderBodyIds.size > 0
        ? await listUsersForGovernance(db, actor)
        : [];

    const securityLogs = isAdmin(actor) ? await listSecurityAuditLogs(db, 50) : [];

    return NextResponse.json({
      actor: {
        user: actor.user,
        assignments: actor.assignments,
        bodyLeaderBodyIds: Array.from(actor.bodyLeaderBodyIds),
        groupLeaderGroupIds: Array.from(actor.groupLeaderGroupIds),
        supervisorGroupIds: Array.from(actor.supervisorGroupIds),
      },
      overview,
      bodies: bodiesList,
      groups: groupsList,
      reports: reportsList,
      members: membersList,
      visitors: visitorsList,
      followUps: followUpsList,
      briefs,
      notifications: notificationsList,
      governanceUsers,
      securityLogs,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
