import { NextResponse } from 'next/server';
import { AppError } from '@/server/modules/errors';
import { sql } from 'drizzle-orm';
import { getReadyRuntime } from '@/server/db/bootstrap';
import { ensureActiveReportingPeriod } from '@/server/modules/reporting/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const runtime = await getReadyRuntime();
    await runtime.db.execute(sql`SELECT 1`);
    const activePeriod = await ensureActiveReportingPeriod(runtime.db);
    return NextResponse.json({
      ok: true,
      driver: runtime.driver,
      activePeriodKey: activePeriod.periodKey,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Never return driver messages: they can contain host names or query text.
    const code = err instanceof AppError ? err.code : 'NOT_READY';
    return NextResponse.json({ ok: false, code }, { status: 503 });
  }
}
