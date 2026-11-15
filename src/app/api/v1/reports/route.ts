import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, safeValidationIssues, JSON_LIMITS } from '@/server/http/body';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { runWithIdempotency } from '@/server/modules/audit/service';
import { AppError } from '@/server/modules/errors';
import { reportActionSchema } from './schema';
import {
  approveReportByBodyLeader,
  getReportDetailForGroup,
  listReportsForPeriod,
  reviewReportBySupervisor,
  saveDraftReport,
  submitReport,
  unblockReportByAdmin,
} from '@/server/modules/reporting/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const periodId = req.nextUrl.searchParams.get('periodId');
    const groupId = req.nextUrl.searchParams.get('groupId');

    if (periodId && groupId) {
      const detail = await getReportDetailForGroup(db, actor, periodId, groupId);
      return NextResponse.json({ detail });
    }

    const reports = await listReportsForPeriod(db, actor, periodId || undefined);
    return NextResponse.json({ reports });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const rawBody = await readJsonBody(req, { maxBytes: JSON_LIMITS.reports });
    const parsed = reportActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลรายงานไม่ครบถ้วนหรือไม่ถูกต้อง', {
        issues: safeValidationIssues(parsed.error.issues),
      });
    }

    const data = parsed.data;
    const idempotencyKey = req.headers.get('idempotency-key');
    const scopeKey = `reports:${actor.user.id}:${data.action}`;

    const result = await runWithIdempotency(db, scopeKey, idempotencyKey, data, async () => {
      if (data.action === 'save_draft') {
        const saved = await saveDraftReport(
          db,
          actor,
          data.periodId,
          data.groupId,
          data.payload
        );
        return { status: 200, body: { ok: true, report: saved } };
      }

      if (data.action === 'submit') {
        const submitted = await submitReport(
          db,
          actor,
          data.periodId,
          data.groupId,
          data.payload
        );
        return { status: 200, body: { ok: true, report: submitted } };
      }

      if (data.action === 'review') {
        const updated = await reviewReportBySupervisor(
          db,
          actor,
          data.reportId,
          data.decision,
          data.notesOrReason,
          data.expectedVersion
        );
        return { status: 200, body: { ok: true, report: updated } };
      }

      if (data.action === 'approve') {
        const updated = await approveReportByBodyLeader(
          db,
          actor,
          data.reportId,
          data.decision,
          data.notesOrReason,
          data.expectedVersion
        );
        return { status: 200, body: { ok: true, report: updated } };
      }

      const unblocked = await unblockReportByAdmin(db, actor, data.reportId, data.notes);
      return { status: 200, body: { ok: true, report: unblocked } };
    });

    return NextResponse.json(result.body, {
      status: result.status,
      headers: result.replayed ? { 'X-Idempotency-Replayed': 'true' } : undefined,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
