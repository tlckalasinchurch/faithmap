import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, safeValidationIssues } from '@/server/http/body';
import { rateLimitMutation } from '@/server/http/rate-limit';
import { pastoralActionSchema } from './schema';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import {
  addExistingMemberToGroup,
  convertVisitorToMember,
  endGroupMembership,
  createGroupMemberWithWarnings,
  recordVisitorReturn,
  registerVisitor,
  updateFollowUpItem,
  updateVisitorFollowupStatus,
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
      // FR-04.3: a possible duplicate is a warning, not a block. The warning holds counts only.
      const { member, duplicateWarnings } = await createGroupMemberWithWarnings(db, actor, data);
      return NextResponse.json({ ok: true, member, duplicateWarnings }, { status: 201 });
    }
    if (data.action === 'add_member_to_group') {
      const membership = await addExistingMemberToGroup(db, actor, data);
      return NextResponse.json({ ok: true, membership }, { status: 201 });
    }
    if (data.action === 'end_membership') {
      const membership = await endGroupMembership(db, actor, data);
      return NextResponse.json({ ok: true, membership });
    }
    if (data.action === 'register_visitor') {
      const res = await registerVisitor(db, actor, data);
      return NextResponse.json({ ok: true, ...res }, { status: 201 });
    }
    if (data.action === 'convert_visitor') {
      const member = await convertVisitorToMember(db, actor, data.visitorId, data.targetGroupId);
      return NextResponse.json({ ok: true, member });
    }

    if (data.action === 'record_visitor_return') {
      const res = await recordVisitorReturn(db, actor, data);
      return NextResponse.json({ ok: true, ...res }, { status: 201 });
    }
    if (data.action === 'update_visitor_status') {
      const visitor = await updateVisitorFollowupStatus(db, actor, data.visitorId, data.status);
      return NextResponse.json({ ok: true, visitor });
    }

    const followUp = await updateFollowUpItem(db, actor, data.followUpId, data.status, data.notes, data.outcomeNote);
    return NextResponse.json({ ok: true, followUp });
  } catch (err) {
    return handleRouteError(err);
  }
}
