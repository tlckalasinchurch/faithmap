import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import {
  assignLeadershipRole,
  createGroup,
  revokeAssignment,
  transferGroupToBody,
  updateUserStatusByAdmin,
} from '@/server/modules/organization/service';

export const dynamic = 'force-dynamic';

const orgActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_group'),
    groupCode: z.string().min(2).max(40),
    bodyId: z.string().uuid().nullable().optional(),
    nameTh: z.string().min(2).max(120),
    district: z.string().min(2).max(80),
    subdistrict: z.string().nullable().optional(),
    village: z.string().nullable().optional(),
    careCodeRaw: z.string().nullable().optional(),
    addressSummary: z.string().nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    meetingDayOfWeek: z.number().int().min(1).max(7).nullable().optional(),
    meetingTimeLocal: z.string().nullable().optional(),
    targetAttendance: z.number().int().min(1).optional(),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal('transfer_group'),
    groupId: z.string().uuid(),
    toBodyId: z.string().uuid(),
    reason: z.string().min(3),
  }),
  z.object({
    action: z.literal('assign_role'),
    userId: z.string().uuid(),
    scopeType: z.enum(['body', 'group']),
    bodyId: z.string().uuid().nullable().optional(),
    groupId: z.string().uuid().nullable().optional(),
    roleType: z.enum(['body_leader', 'care_leader', 'coordinator', 'group_leader', 'other_authorized']),
    isPrimary: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('revoke_assignment'),
    assignmentId: z.string().uuid(),
    reason: z.string().min(2),
  }),
  z.object({
    action: z.literal('update_user_status'),
    targetUserId: z.string().uuid(),
    nextStatus: z.enum(['pending_activation', 'active', 'suspended', 'revoked']),
    reason: z.string().min(2),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const body = await req.json();
    const parsed = orgActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลโครงสร้างองค์กรไม่ถูกต้อง', {
        issues: parsed.error.issues,
      });
    }

    const data = parsed.data;
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
