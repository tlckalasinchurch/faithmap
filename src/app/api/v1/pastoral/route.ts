import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, safeValidationIssues } from '@/server/http/body';
import { rateLimitMutation } from '@/server/http/rate-limit';
import { pastoralActionSchema } from './schema';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import {
  convertVisitorToMember,
  createGroupMember,
  registerVisitor,
  updateFollowUpItem,
} from '@/server/modules/pastoral-care/service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    rateLimitMutation(actor.user.id, 'pastoral');
    const body = await readJsonBody(req);
    const parsed = pastoralActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลสมาชิกหรือผู้เยี่ยมไม่ถูกต้อง', {
        issues: safeValidationIssues(parsed.error.issues),
      });
    }

    const data = parsed.data;
    if (data.action === 'create_member') {
      const member = await createGroupMember(db, actor, data);
      return NextResponse.json({ ok: true, member }, { status: 201 });
    }
    if (data.action === 'register_visitor') {
      const res = await registerVisitor(db, actor, data);
      return NextResponse.json({ ok: true, ...res }, { status: 201 });
    }
    if (data.action === 'convert_visitor') {
      const member = await convertVisitorToMember(db, actor, data.visitorId, data.targetGroupId);
      return NextResponse.json({ ok: true, member });
    }

    const followUp = await updateFollowUpItem(db, actor, data.followUpId, data.status, data.notes);
    return NextResponse.json({ ok: true, followUp });
  } catch (err) {
    return handleRouteError(err);
  }
}
