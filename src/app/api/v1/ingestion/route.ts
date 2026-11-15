import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleRouteError, requireAuth } from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import { importPayloadSchema } from '@/server/modules/ingestion/payload-schema';
import {
  assignUnassignedGroupBody,
  confirmCandidateLocation,
  linkStewardAssignmentToUser,
  listIngestionOverview,
  previewImportForActor,
  promoteStagingBatch,
  resolveDataQualityIssue,
  rollbackImportBatch,
  saveCareBodyMapping,
  saveDistrictMapping,
  stageImportBatch,
} from '@/server/modules/ingestion/service';

export const dynamic = 'force-dynamic';

const ingestionActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), payload: importPayloadSchema }),
  z.object({ action: z.literal('stage'), payload: importPayloadSchema }),
  z.object({ action: z.literal('promote'), batchId: z.string().uuid() }),
  z.object({
    action: z.literal('rollback'),
    batchId: z.string().uuid(),
    reason: z.string().min(2),
  }),
  z.object({
    action: z.literal('resolve_issue'),
    issueId: z.string().uuid(),
    decision: z.enum(['approved_fix', 'rejected', 'resolved', 'deferred', 'reversed']),
    resolutionNote: z.string().trim().min(2).max(2000),
    expectedDecisionId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    action: z.literal('review_location_match'),
    matchId: z.string().uuid(),
    decision: z.enum(['confirmed', 'rejected']),
  }),
  z.object({
    action: z.literal('save_district_mapping'),
    districtRaw: z.string().min(1),
    districtCanonical: z.string().min(1),
  }),
  z.object({
    action: z.literal('save_care_body_mapping'),
    careCodeRaw: z.string().min(1),
    bodyId: z.string().uuid(),
    notes: z.string().optional(),
  }),
  z.object({
    action: z.literal('assign_group_body'),
    groupId: z.string().uuid(),
    bodyId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('link_steward_user'),
    assignmentId: z.string().uuid(),
    userId: z.string().uuid(),
  }),
]);

export async function GET(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const overview = await listIngestionOverview(db, actor);
    return NextResponse.json({ ok: true, ...overview });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const body = await req.json();
    const parsed = ingestionActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลคำขอนำเข้าไม่ถูกต้อง', {
        issues: parsed.error.issues,
      });
    }

    const data = parsed.data;
    if (data.action === 'preview') {
      return NextResponse.json({ ok: true, preview: previewImportForActor(actor, data.payload) });
    }
    if (data.action === 'stage') {
      const result = await stageImportBatch(db, actor, data.payload);
      return NextResponse.json({ ok: true, ...result }, { status: 201 });
    }
    if (data.action === 'promote') {
      const result = await promoteStagingBatch(db, actor, data.batchId);
      return NextResponse.json({ ok: true, ...result });
    }
    if (data.action === 'rollback') {
      const result = await rollbackImportBatch(db, actor, data.batchId, data.reason);
      return NextResponse.json({ ok: true, ...result });
    }
    if (data.action === 'resolve_issue') {
      const issue = await resolveDataQualityIssue(db, actor, data);
      return NextResponse.json({ ok: true, issue });
    }
    if (data.action === 'save_district_mapping') {
      const mapping = await saveDistrictMapping(
        db,
        actor,
        data.districtRaw,
        data.districtCanonical
      );
      return NextResponse.json({ ok: true, mapping });
    }
    if (data.action === 'save_care_body_mapping') {
      const mapping = await saveCareBodyMapping(
        db,
        actor,
        data.careCodeRaw,
        data.bodyId,
        data.notes
      );
      return NextResponse.json({ ok: true, mapping });
    }
    if (data.action === 'assign_group_body') {
      const group = await assignUnassignedGroupBody(db, actor, data.groupId, data.bodyId);
      return NextResponse.json({ ok: true, group });
    }
    if (data.action === 'link_steward_user') {
      const assignment = await linkStewardAssignmentToUser(
        db,
        actor,
        data.assignmentId,
        data.userId
      );
      return NextResponse.json({ ok: true, assignment });
    }

    const match = await confirmCandidateLocation(db, actor, data.matchId, data.decision);
    return NextResponse.json({ ok: true, match });
  } catch (err) {
    return handleRouteError(err);
  }
}
