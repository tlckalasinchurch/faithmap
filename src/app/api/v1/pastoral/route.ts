import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import {
  convertVisitorToMember,
  createGroupMember,
  registerVisitor,
  updateFollowUpItem,
} from '@/server/modules/pastoral-care/service';

export const dynamic = 'force-dynamic';

const pastoralActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_member'),
    groupId: z.string().uuid(),
    fullName: z.string().min(2),
    displayName: z.string().min(1),
    phoneE164: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    membershipRole: z.string().optional(),
    notes: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal('register_visitor'),
    groupId: z.string().uuid(),
    fullName: z.string().min(2),
    nickname: z.string().nullable().optional(),
    phoneE164: z.string().nullable().optional(),
    lineUserId: z.string().nullable().optional(),
    consentForContact: z.boolean(),
    visitType: z.enum(['new_visitor', 'returning_visitor']).optional(),
    visitedOn: z.string().optional(),
    weeklyReportId: z.string().uuid().nullable().optional(),
    notes: z.string().nullable().optional(),
    createFollowUp: z.boolean().optional(),
    followUpTitle: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal('convert_visitor'),
    visitorId: z.string().uuid(),
    targetGroupId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal('update_follow_up'),
    followUpId: z.string().uuid(),
    status: z.enum(['open', 'in_progress', 'completed', 'cancelled']),
    notes: z.string().nullable().optional(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const body = await req.json();
    const parsed = pastoralActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลสมาชิกหรือผู้เยี่ยมไม่ถูกต้อง', {
        issues: parsed.error.issues,
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
