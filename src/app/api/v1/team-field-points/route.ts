import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, safeValidationIssues } from '@/server/http/body';
import { z } from 'zod';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import {
  listTeamFieldPoints,
  syncTeamGFieldPoints,
} from '@/server/modules/team-field-points/service';

export const dynamic = 'force-dynamic';

const teamPointActionSchema = z.object({
  action: z.literal('sync_team_g'),
});

export async function GET(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const teamCode = searchParams.get('teamCode');
    const q = searchParams.get('q');
    const points = await listTeamFieldPoints(db, actor, { teamCode, q });
    return NextResponse.json({ ok: true, points });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const body = await readJsonBody(req);
    const parsed = teamPointActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'คำสั่งซิงค์พิกัดทีม G ไม่ถูกต้อง', {
        issues: safeValidationIssues(parsed.error.issues),
      });
    }

    const result = await syncTeamGFieldPoints(db, actor);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleRouteError(err);
  }
}
