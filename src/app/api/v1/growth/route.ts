import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import { listGrowthRecordsForActor } from '@/server/modules/growth/service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const raw = req.nextUrl.searchParams.get('groupId');
    const groupId = raw ? z.string().uuid().safeParse(raw) : null;
    if (groupId && !groupId.success) throw new AppError(400, 'VALIDATION_ERROR', 'รหัสกลุ่มไม่ถูกต้อง');
    const records = await listGrowthRecordsForActor(db, actor, { groupId: groupId?.data ?? null });
    return NextResponse.json({ ok: true, records });
  } catch (err) {
    return handleRouteError(err);
  }
}
