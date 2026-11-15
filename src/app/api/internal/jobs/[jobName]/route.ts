import { readJsonBody } from '@/server/http/body';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, lte } from 'drizzle-orm';
import { getReadyDb } from '@/server/db/bootstrap';
import { isCronRequestAuthorized } from '@/server/http/cron-auth';
import { handleRouteError } from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import { reportingPeriods } from '@/server/db/schema';
import { purgeExpiredAuthData } from '@/server/modules/line-identity/cleanup';
import {
  executeCutoffCheckJob,
  generateMeetingBriefForPeriod,
} from '@/server/modules/insights/service';

export const dynamic = 'force-dynamic';

const briefJobBodySchema = z.object({
  periodId: z.string().uuid().optional(),
});

function isAuthorizedCronRequest(req: NextRequest): boolean {
  return isCronRequestAuthorized(req.headers.get('authorization'));
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobName: string }> }
) {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED_JOB', message: 'Cron secret ไม่ถูกต้อง' } },
        { status: 401 }
      );
    }

    const { jobName } = await context.params;
    const db = await getReadyDb();

    if (jobName === 'cutoff_check') {
      const result = await executeCutoffCheckJob(db, new Date());
      return NextResponse.json({ ok: true, jobName, result });
    }

    if (jobName === 'cleanup_auth_data') {
      // Counts only. No row content is returned or logged.
      const result = await purgeExpiredAuthData(db, new Date());
      return NextResponse.json({ ok: true, jobName, result });
    }

    if (jobName === 'generate_meeting_brief') {
      const rawText = await req.clone().text().catch(() => '');
      let parsedBody: { periodId?: string } = {};
      if (rawText.trim().length > 0) {
        const raw = await readJsonBody(req);
        const parsed = briefJobBodySchema.safeParse(raw);
        if (!parsed.success) {
          throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลคำขอไม่ถูกต้อง');
        }
        parsedBody = parsed.data;
      }
      const explicitPeriodId = parsedBody.periodId ?? null;

      if (explicitPeriodId) {
        const brief = await generateMeetingBriefForPeriod(db, explicitPeriodId, {
          isCronJob: true,
        });
        return NextResponse.json({ ok: true, jobName, briefId: brief.id });
      }

      const now = new Date();
      const duePeriods = await db
        .select()
        .from(reportingPeriods)
        .where(
          and(
            eq(reportingPeriods.status, 'cutoff_reached'),
            lte(reportingPeriods.briefScheduledAt, now)
          )
        );

      const createdBriefIds: string[] = [];
      for (const p of duePeriods) {
        const b = await generateMeetingBriefForPeriod(db, p.id, { isCronJob: true });
        createdBriefIds.push(b.id);
      }
      return NextResponse.json({
        ok: true,
        jobName,
        generatedCount: createdBriefIds.length,
        createdBriefIds,
      });
    }

    return NextResponse.json(
      { error: { code: 'UNKNOWN_JOB', message: `ไม่พบงานเบื้องหลังชื่อ ${jobName}` } },
      { status: 404 }
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
