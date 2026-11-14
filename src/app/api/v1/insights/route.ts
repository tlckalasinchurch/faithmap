import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import { isAdmin, isBodyLeaderForBody } from '@/server/modules/authz/policy';
import {
  exportScopedCsvData,
  generateMeetingBriefForPeriod,
} from '@/server/modules/insights/service';
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/server/modules/notifications/service';

export const dynamic = 'force-dynamic';

const insightsActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('generate_brief'),
    periodId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('mark_notification_read'),
    notificationId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('mark_all_notifications_read'),
  }),
]);

export async function GET(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const dataset = req.nextUrl.searchParams.get('export');
    const periodId = req.nextUrl.searchParams.get('periodId') || undefined;

    if (dataset !== 'reports' && dataset !== 'visitors') {
      throw new AppError(400, 'INVALID_EXPORT', 'รองรับเฉพาะ export=reports หรือ export=visitors');
    }

    const exported = await exportScopedCsvData(db, actor, dataset, periodId);
    return new NextResponse(exported.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exported.filename}"`,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const body = await req.json();
    const parsed = insightsActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'คำขอไม่ถูกต้อง');
    }

    const data = parsed.data;
    if (data.action === 'generate_brief') {
      const canTrigger =
        isAdmin(actor) ||
        actor.user.systemRole === 'mission_leader' ||
        Array.from(actor.bodyLeaderBodyIds).some((b) => isBodyLeaderForBody(actor, b));
      if (!canTrigger) {
        throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์สร้างสรุปประชุมผู้บริหาร');
      }
      const brief = await generateMeetingBriefForPeriod(db, data.periodId, {
        actorUserId: actor.user.id,
        isCronJob: false,
      });
      return NextResponse.json({ ok: true, brief });
    }

    if (data.action === 'mark_notification_read') {
      const updated = await markNotificationRead(db, actor.user.id, data.notificationId);
      return NextResponse.json({ ok: true, updated });
    }

    const count = await markAllNotificationsRead(db, actor.user.id);
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return handleRouteError(err);
  }
}
