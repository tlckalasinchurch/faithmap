import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { runWithIdempotency } from '@/server/modules/audit/service';
import { AppError } from '@/server/modules/errors';
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

const attendanceItemSchema = z.object({
  memberId: z.string().uuid(),
  attendanceStatus: z.enum(['present', 'absent', 'excused']),
});

const reportPayloadSchema = z.object({
  meetingHeld: z.boolean(),
  notHeldReason: z.string().nullable().optional(),
  meetingDate: z.string().nullable().optional(),
  totalAttendees: z.number().int().min(0),
  memberAttendees: z.number().int().min(0),
  newVisitorsCount: z.number().int().min(0),
  returningVisitorsCount: z.number().int().min(0),
  childrenCount: z.number().int().min(0),
  offeringAmountThb: z.union([z.number(), z.string()]).optional(),
  summaryNotes: z.string().nullable().optional(),
  prayerRequests: z.string().nullable().optional(),
  careNeedsNotes: z.string().nullable().optional(),
  attendance: z.array(attendanceItemSchema).optional(),
  expectedVersion: z.number().int().positive().optional(),
});

const reportActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save_draft'),
    periodId: z.string().uuid(),
    groupId: z.string().uuid(),
    payload: reportPayloadSchema,
  }),
  z.object({
    action: z.literal('submit'),
    periodId: z.string().uuid(),
    groupId: z.string().uuid(),
    payload: reportPayloadSchema,
  }),
  z.object({
    action: z.literal('review'),
    reportId: z.string().uuid(),
    decision: z.enum(['forward', 'request_revision']),
    notesOrReason: z.string().nullable().optional(),
    expectedVersion: z.number().int().positive().optional(),
  }),
  z.object({
    action: z.literal('approve'),
    reportId: z.string().uuid(),
    decision: z.enum(['approve', 'request_revision']),
    notesOrReason: z.string().nullable().optional(),
    expectedVersion: z.number().int().positive().optional(),
  }),
  z.object({
    action: z.literal('unblock'),
    reportId: z.string().uuid(),
    notes: z.string().nullable().optional(),
  }),
]);

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
    const rawBody = await req.json();
    const parsed = reportActionSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลรายงานไม่ครบถ้วนหรือไม่ถูกต้อง', {
        issues: parsed.error.issues,
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
