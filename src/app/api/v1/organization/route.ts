import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, safeValidationIssues } from '@/server/http/body';
import { rateLimitMutation } from '@/server/http/rate-limit';
import { orgActionSchema } from './schema';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import {
  assignLeadershipRole,
  createBody,
  createGroup,
  revokeAssignment,
  transferGroupToBody,
  updateBody,
  updateUserStatusByAdmin,
} from '@/server/modules/organization/service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    rateLimitMutation(actor.user.id, 'organization');
    const body = await readJsonBody(req);
    const parsed = orgActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลโครงสร้างองค์กรไม่ถูกต้อง', {
        issues: safeValidationIssues(parsed.error.issues),
      });
    }

    const data = parsed.data;
    if (data.action === 'create_body') {
      const created = await createBody(db, actor, data);
      return NextResponse.json({ ok: true, body: created }, { status: 201 });
    }
    if (data.action === 'update_body') {
      const updated = await updateBody(db, actor, data.bodyId, data);
      return NextResponse.json({ ok: true, body: updated });
    }
    if (data.action === 'create_group') {
      const group = await createGroup(db, actor, data);
      return NextResponse.json({ ok: true, group }, { status: 201 });
    }
    if (data.action === 'transfer_group') {
      const group = await transferGroupToBody(db, actor, data.groupId, data.toBodyId, data.reason);
      return NextResponse.json({ ok: true, group });
    }
    if (data.action === 'assign_role') {
      const assignment = await assignLeadershipRole(db, actor, data);
      return NextResponse.json({ ok: true, assignment }, { status: 201 });
    }
    if (data.action === 'revoke_assignment') {
      const assignment = await revokeAssignment(db, actor, data.assignmentId, data.reason);
      return NextResponse.json({ ok: true, assignment });
    }

    const user = await updateUserStatusByAdmin(
      db,
      actor,
      data.targetUserId,
      data.nextStatus,
      data.reason
    );
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    return handleRouteError(err);
  }
}
