import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, safeValidationIssues } from '@/server/http/body';
import { z } from 'zod';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import { isAdmin } from '@/server/modules/authz/policy';
import {
  assignTeamFieldPoint,
  getFieldPointMappingStatus,
  listTeamFieldPoints,
  syncTeamGFieldPoints,
} from '@/server/modules/team-field-points/service';

export const dynamic = 'force-dynamic';

const teamPointActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sync_team_g') }),
  z.object({
    action: z.literal('assign_point'),
    pointId: z.string().uuid(),
    bodyId: z.string().uuid().nullable(),
    coordinatorUserId: z.string().uuid().nullable(),
  }),
]);

export async function GET(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const teamCode = searchParams.get('teamCode');
    const q = searchParams.get('q');
    const points = await listTeamFieldPoints(db, actor, { teamCode, q });
    // The mapping progress shows counts only. Admins see it to finish the data mapping.
    const mapping = isAdmin(actor) ? await getFieldPointMappingStatus(db) : undefined;
    return NextResponse.json({ ok: true, points, ...(mapping ? { mapping } : {}) });
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

    if (parsed.data.action === 'assign_point') {
      const assigned = await assignTeamFieldPoint(db, actor, parsed.data);
      return NextResponse.json({ ok: true, assigned });
    }
    const result = await syncTeamGFieldPoints(db, actor);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleRouteError(err);
  }
}
