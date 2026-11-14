import { NextRequest, NextResponse } from 'next/server';
import { and, eq, lte } from 'drizzle-orm';
import { getReadyDb } from '@/server/db/bootstrap';
import { reportingPeriods } from '@/server/db/schema';
import {
  executeCutoffCheckJob,
  generateMeetingBriefForPeriod,
} from '@/server/modules/insights/service';

export const dynamic = 'force-dynamic';

function isAuthorizedCronRequest(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || 'faithmap-dev-cron-secret-change-in-prod';
  const headerSecret = req.headers.get('x-cron-secret');
  const auth = req.headers.get('authorization');
  const bearer = auth && auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  return headerSecret === expected || bearer === expected;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobName: string }> }
) {
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

  if (jobName === 'generate_meeting_brief') {
    const body = await req.json().catch(() => ({}));
    const explicitPeriodId =
      body && typeof body.periodId === 'string' ? body.periodId : null;

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
}
