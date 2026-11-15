import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, safeValidationIssues } from '@/server/http/body';
import { z } from 'zod';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import {
  assignCareSteward,
  assignCareToBody,
  createProvisionalCare,
  listCares,
  revokeCareAssignment,
  type CareStatus,
} from '@/server/modules/cares/service';

export const dynamic = 'force-dynamic';

const careStatusEnum = z.enum([
  'provisional',
  'active',
  'pending_assignment',
  'inactive',
  'archived',
]);

const careActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_care'),
    careCode: z.string().min(1).max(40),
    careName: z.string().max(120).nullable().optional(),
    teamName: z.string().max(80).nullable().optional(),
    bodyId: z.string().uuid().nullable().optional(),
    status: careStatusEnum.optional(),
    notes: z.string().max(500).nullable().optional(),
  }),
  z.object({
    action: z.literal('assign_body'),
    careId: z.string().uuid(),
    bodyId: z.string().uuid().nullable(),
    status: careStatusEnum.optional(),
    reason: z.string().min(2).max(300),
  }),
  z.object({
    action: z.literal('assign_steward'),
    careId: z.string().uuid(),
    userId: z.string().uuid().nullable().optional(),
    stewardMemberId: z.string().uuid().nullable().optional(),
    stewardDisplayName: z.string().max(120).nullable().optional(),
    sourceRoleLabel: z.string().max(80).nullable().optional(),
    roleType: z.enum(['care_leader', 'other_authorized']),
    isPrimary: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('revoke_steward'),
    assignmentId: z.string().uuid(),
    reason: z.string().min(2).max(300),
  }),
]);

export async function GET(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const bodyId = searchParams.get('bodyId');
    const statusParam = searchParams.get('status');
    const unassignedOnly = searchParams.get('unassignedOnly') === 'true';
    const q = searchParams.get('q');

    let status: CareStatus | null = null;
    if (statusParam) {
      const parsedStatus = careStatusEnum.safeParse(statusParam);
      if (!parsedStatus.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'สถานะแคร์ไม่ถูกต้อง');
      }
      status = parsedStatus.data;
    }

    const items = await listCares(db, actor, {
      bodyId,
      status,
      unassignedOnly,
      q,
    });
    return NextResponse.json({ ok: true, cares: items });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const body = await readJsonBody(req);
    const parsed = careActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลแคร์ไม่ถูกต้อง', {
        issues: safeValidationIssues(parsed.error.issues),
      });
    }

    const data = parsed.data;
    if (data.action === 'create_care') {
      const care = await createProvisionalCare(db, actor, data);
      return NextResponse.json({ ok: true, care }, { status: 201 });
    }
    if (data.action === 'assign_body') {
      const care = await assignCareToBody(db, actor, data);
      return NextResponse.json({ ok: true, care });
    }
    if (data.action === 'assign_steward') {
      const assignment = await assignCareSteward(db, actor, data);
      return NextResponse.json({ ok: true, assignment }, { status: 201 });
    }
    const assignment = await revokeCareAssignment(db, actor, data.assignmentId, data.reason);
    return NextResponse.json({ ok: true, assignment });
  } catch (err) {
    return handleRouteError(err);
  }
}
