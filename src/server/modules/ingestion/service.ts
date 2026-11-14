import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import {
  assignments,
  bodies,
  candidateLocationMatches,
  careBodyMappings,
  dataQualityIssues,
  districtCanonicalMappings,
  groupMemberships,
  houseMissionGroups,
  importBatches,
  members,
  stagingGroups,
  stagingMemberRows,
  users,
  weeklyReports,
} from '@/server/db/schema';
import { KALASIN_TEAM_G_POINTS } from '@/lib/kalasin-field-points';
import { AppError } from '../errors';
import { recordSecurityAudit } from '../audit/service';
import { isAdmin, isBodyLeaderForBody } from '../authz/policy';
import type { ActorContext } from '../identity/service';

export interface ImportGroupInput {
  groupRef: string;
  groupNameFromSheet: string;
  formTitle?: string | null;
  district?: string | null;
  subdistrict?: string | null;
  village?: string | null;
  meetingDay?: string | null;
  meetingTimeStart?: string | number | null;
  meetingTimeEnd?: string | number | null;
  meetingPlace?: string | null;
  leader?: string | null;
  coordinator?: string | null;
  careLabel?: string | null;
  careCode?: string | null;
  registeredTotal?: string | number | null;
  sourceFile: string;
  sourceSheet: string;
}

export interface ImportMemberInput {
  memberRowRef: string;
  groupRef: string;
  fullNameRaw?: string | null;
  nicknameRaw?: string | null;
  ageRaw?: string | number | null;
  occupationRaw?: string | null;
  locationRaw?: string | null;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
  rawCells?: Record<string, unknown>;
}

export interface ImportBatchPayload {
  sourceArchiveName: string;
  selectionPolicyVersion?: string;
  groups: ImportGroupInput[];
  members: ImportMemberInput[];
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function normalizeText(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function parseThaiWeekday(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.includes('จันทร์')) return 1;
  if (s.includes('อังคาร')) return 2;
  if (s.includes('พุธ')) return 3;
  if (s.includes('พฤหัส')) return 4;
  if (s.includes('ศุกร์')) return 5;
  if (s.includes('เสาร์')) return 6;
  if (s.includes('อาทิตย์')) return 7;
  return null;
}

function assertAdminOnly(actor: ActorContext, message: string): void {
  if (!isAdmin(actor)) {
    throw new AppError(403, 'ADMIN_REQUIRED', message);
  }
}

export function previewImportPayload(payload: ImportBatchPayload) {
  const canonicalJson = JSON.stringify({
    sourceArchiveName: payload.sourceArchiveName,
    groups: payload.groups,
    members: payload.members,
  });
  const fileSha256 = sha256Hex(canonicalJson);

  const membersByGroup = new Map<string, ImportMemberInput[]>();
  const nameHashCounts = new Map<string, string[]>();

  for (const m of payload.members) {
    const list = membersByGroup.get(m.groupRef) ?? [];
    list.push(m);
    membersByGroup.set(m.groupRef, list);

    const fn = normalizeText(m.fullNameRaw).replace(/\s+/g, ' ');
    const nn = normalizeText(m.nicknameRaw).replace(/\s+/g, ' ');
    if (fn || nn) {
      const key = sha256Hex(`${fn}|${nn}`).slice(0, 12);
      const refs = nameHashCounts.get(key) ?? [];
      refs.push(m.groupRef);
      nameHashCounts.set(key, refs);
    }
  }

  let missingFullNameCount = 0;
  let missingBothNamesCount = 0;
  for (const m of payload.members) {
    const fn = normalizeText(m.fullNameRaw);
    const nn = normalizeText(m.nicknameRaw);
    if (!fn) missingFullNameCount++;
    if (!fn && !nn) missingBothNamesCount++;
  }

  let countMismatchGroups = 0;
  let nonNumericTotalGroups = 0;
  let missingCoordinatorGroups = 0;
  let unnumberedCareGroups = 0;
  const distinctDistricts = new Set<string>();

  for (const g of payload.groups) {
    const rows = membersByGroup.get(g.groupRef) ?? [];
    const regRaw = normalizeText(g.registeredTotal);
    const regNum = regRaw === '' ? NaN : Number(regRaw);
    if (regRaw !== '' && Number.isNaN(regNum)) {
      nonNumericTotalGroups++;
    } else if (!Number.isNaN(regNum) && regNum !== rows.length) {
      countMismatchGroups++;
    }
    const coord = normalizeText(g.coordinator);
    if (!coord || coord === '-') missingCoordinatorGroups++;
    if (normalizeText(g.careCode) === 'G') unnumberedCareGroups++;
    const dist = normalizeText(g.district);
    if (dist) distinctDistricts.add(dist);
  }

  const crossGroupDuplicateKeys = Array.from(nameHashCounts.values()).filter(
    (refs) => new Set(refs).size > 1
  ).length;

  return {
    fileSha256,
    sourceArchiveName: payload.sourceArchiveName,
    totalGroups: payload.groups.length,
    totalMemberRows: payload.members.length,
    missingCoordinatesGroups: payload.groups.length,
    pendingBodyGroups: payload.groups.length,
    missingFullNameCount,
    missingBothNamesCount,
    countMismatchGroups,
    nonNumericTotalGroups,
    missingCoordinatorGroups,
    unnumberedCareGroups,
    crossGroupDuplicateKeys,
    distinctDistrictLabels: Array.from(distinctDistricts).sort(),
  };
}

export async function stageImportBatch(
  db: FaithMapDb,
  actor: ActorContext,
  payload: ImportBatchPayload
) {
  assertAdminOnly(actor, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถนำเข้าข้อมูลสู่ Staging ได้');
  const preview = previewImportPayload(payload);

  const [existing] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.fileSha256, preview.fileSha256));
  if (existing) {
    return { idempotentHit: true, batch: existing, preview };
  }

  const batchCode = `IMP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${preview.fileSha256.slice(0, 6).toUpperCase()}`;

  const createdBatch = await db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const [batch] = await tdb
      .insert(importBatches)
      .values({
        batchCode,
        sourceArchiveName: payload.sourceArchiveName,
        fileSha256: preview.fileSha256,
        selectionPolicyVersion: payload.selectionPolicyVersion ?? '1.0',
        status: 'staged',
        summaryJson: preview,
        uploadedByUserId: actor.user.id,
      })
      .returning();

    const districtMappings = await tdb.select().from(districtCanonicalMappings);
    const distMap = new Map(districtMappings.map((d) => [d.districtRaw, d.districtCanonical]));

    const membersByGroup = new Map<string, ImportMemberInput[]>();
    for (const m of payload.members) {
      const list = membersByGroup.get(m.groupRef) ?? [];
      list.push(m);
      membersByGroup.set(m.groupRef, list);
    }

    const stagingGroupIdByRef = new Map<string, string>();
    const dqRows: Array<typeof dataQualityIssues.$inferInsert> = [];
    const candidateRows: Array<typeof candidateLocationMatches.$inferInsert> = [];

    for (const g of payload.groups) {
      const groupMembers = membersByGroup.get(g.groupRef) ?? [];
      const regRaw = normalizeText(g.registeredTotal);
      const regNum = regRaw === '' ? NaN : Number(regRaw);
      const isNonNumeric = regRaw !== '' && Number.isNaN(regNum);
      const isCountMismatch = !Number.isNaN(regNum) && regNum !== groupMembers.length;
      const distRaw = normalizeText(g.district);
      const distNorm = distMap.get(distRaw) ?? null;

      let dataStatus: 'raw' | 'normalized' | 'pending_review' | 'conflict' | 'incomplete' = 'raw';
      if (isCountMismatch) dataStatus = 'conflict';
      else if (isNonNumeric || !distNorm) dataStatus = 'pending_review';

      const rowSha = sha256Hex(`${g.sourceFile}|${g.sourceSheet}|${g.groupRef}`);
      const [sg] = await tdb
        .insert(stagingGroups)
        .values({
          batchId: batch!.id,
          groupRef: g.groupRef,
          sourceFile: g.sourceFile,
          sourceSheet: g.sourceSheet,
          rowSha256: rowSha,
          groupNameFromSheetRaw: g.groupNameFromSheet,
          formTitleRaw: g.formTitle ?? null,
          districtRaw: distRaw || null,
          districtNormalized: distNorm,
          subdistrictRaw: normalizeText(g.subdistrict) || null,
          villageRaw: normalizeText(g.village) || null,
          meetingDayRaw: normalizeText(g.meetingDay) || null,
          meetingTimeStartRaw: normalizeText(g.meetingTimeStart) || null,
          meetingTimeEndRaw: normalizeText(g.meetingTimeEnd) || null,
          meetingPlaceRaw: normalizeText(g.meetingPlace) || null,
          leaderRaw: normalizeText(g.leader) || null,
          coordinatorRaw: normalizeText(g.coordinator) || null,
          careLabelRaw: normalizeText(g.careLabel) || null,
          careCodeRaw: normalizeText(g.careCode) || null,
          registeredTotalRaw: regRaw || null,
          memberRowCountDerived: groupMembers.length,
          dataStatus,
        })
        .returning();

      stagingGroupIdByRef.set(g.groupRef, sg!.id);

      if (isCountMismatch) {
        dqRows.push({
          batchId: batch!.id,
          targetType: 'staging_group',
          targetId: sg!.id,
          issueCode: 'count_mismatch',
          severity: 'review',
          status: 'open',
          summarySafeText: `${g.groupRef} (${g.groupNameFromSheet}): ยอดทะเบียน ${regRaw} ไม่ตรงกับจำนวนแถว ${groupMembers.length}`,
          proposedValueJson: { registeredTotal: regRaw, extractedRows: groupMembers.length },
        });
      }
      if (isNonNumeric) {
        dqRows.push({
          batchId: batch!.id,
          targetType: 'staging_group',
          targetId: sg!.id,
          issueCode: 'non_numeric_registered_total',
          severity: 'review',
          status: 'open',
          summarySafeText: `${g.groupRef} (${g.groupNameFromSheet}): ยอดทะเบียนไม่ใช่ตัวเลข ("${regRaw}")`,
          proposedValueJson: { registeredTotal: regRaw, extractedRows: groupMembers.length },
        });
      }

      // Match candidate coordinates from KALASIN_TEAM_G_POINTS without linking automatically
      const sheetName = g.groupNameFromSheet.trim();
      const villageName = normalizeText(g.village);
      for (const pt of KALASIN_TEAM_G_POINTS) {
        if (
          sheetName.includes(pt.name) ||
          pt.name.includes(sheetName) ||
          (villageName && (villageName.includes(pt.name) || pt.name.includes(villageName)))
        ) {
          candidateRows.push({
            stagingGroupId: sg!.id,
            candidateSource: 'kalasin-field-points',
            candidateNo: pt.no,
            candidateName: pt.name,
            latitude: pt.latitude,
            longitude: pt.longitude,
            matchStatus: 'pending',
          });
        }
      }
    }

    const stagingMemberBuckets = new Map<string, Array<{ id: string; memberRowRef: string; groupRef: string }>>();

    for (const m of payload.members) {
      const sgId = stagingGroupIdByRef.get(m.groupRef);
      if (!sgId) continue;

      const fn = normalizeText(m.fullNameRaw);
      const nn = normalizeText(m.nicknameRaw);
      const missingBoth = !fn && !nn;
      const rowSha = sha256Hex(`${m.sourceFile}|${m.sourceSheet}|${m.sourceRow}|${m.memberRowRef}`);

      const [sm] = await tdb
        .insert(stagingMemberRows)
        .values({
          batchId: batch!.id,
          stagingGroupId: sgId,
          memberRowRef: m.memberRowRef,
          sourceFile: m.sourceFile,
          sourceSheet: m.sourceSheet,
          sourceRow: m.sourceRow,
          rowSha256: rowSha,
          fullNameRaw: fn || null,
          nicknameRaw: nn || null,
          ageRaw: normalizeText(m.ageRaw) || null,
          occupationRaw: normalizeText(m.occupationRaw) || null,
          locationRaw: normalizeText(m.locationRaw) || null,
          rawCellsJson: m.rawCells ?? {},
          dataStatus: missingBoth ? 'incomplete' : 'raw',
        })
        .returning();

      if (missingBoth) {
        dqRows.push({
          batchId: batch!.id,
          targetType: 'staging_member',
          targetId: sm!.id,
          issueCode: 'missing_member_name',
          severity: 'blocking',
          status: 'open',
          summarySafeText: `${m.memberRowRef} (${m.groupRef} แถว ${m.sourceRow}): ไม่มีทั้งชื่อจริงและชื่อเล่น`,
        });
      } else {
        const nameKey = sha256Hex(
          `${fn.replace(/\s+/g, ' ')}|${nn.replace(/\s+/g, ' ')}`
        ).slice(0, 12);
        const bucket = stagingMemberBuckets.get(nameKey) ?? [];
        bucket.push({ id: sm!.id, memberRowRef: m.memberRowRef, groupRef: m.groupRef });
        stagingMemberBuckets.set(nameKey, bucket);
      }
    }

    for (const bucket of stagingMemberBuckets.values()) {
      const distinctGroups = new Set(bucket.map((b) => b.groupRef));
      if (distinctGroups.size > 1) {
        const first = bucket[0]!;
        const peerRefs = bucket
          .slice(1)
          .map((b) => `${b.memberRowRef}/${b.groupRef}`)
          .join(', ');
        dqRows.push({
          batchId: batch!.id,
          targetType: 'staging_member',
          targetId: first.id,
          issueCode: 'duplicate_candidate',
          severity: 'review',
          status: 'open',
          summarySafeText: `${first.memberRowRef} (${first.groupRef}): ชื่อตรงกับแถวอื่นในต่างกลุ่ม (${peerRefs}) — รอคนยืนยัน`,
          proposedValueJson: {
            refs: bucket.map((b) => ({ memberRowRef: b.memberRowRef, groupRef: b.groupRef })),
          },
        });
      }
    }

    if (dqRows.length > 0) {
      await tdb.insert(dataQualityIssues).values(dqRows);
    }
    if (candidateRows.length > 0) {
      await tdb.insert(candidateLocationMatches).values(candidateRows);
    }

    await recordSecurityAudit(tdb, {
      actorUserId: actor.user.id,
      action: 'import_batch_staged',
      targetType: 'import_batch',
      targetId: batch!.id,
      metadata: {
        batchCode: batch!.batchCode,
        totalGroups: preview.totalGroups,
        totalMemberRows: preview.totalMemberRows,
        dqIssueCount: dqRows.length,
      },
    });

    return batch!;
  });

  return { idempotentHit: false, batch: createdBatch, preview };
}

export async function listIngestionOverview(db: FaithMapDb, actor: ActorContext) {
  const admin = isAdmin(actor);
  const batches = admin
    ? await db.select().from(importBatches).orderBy(desc(importBatches.createdAt))
    : [];

  const allGroups = await db.select().from(houseMissionGroups);
  const visibleGroupIds = new Set(
    allGroups
      .filter((g) => admin || (g.bodyId && isBodyLeaderForBody(actor, g.bodyId)))
      .map((g) => g.id)
  );

  const allIssues = await db
    .select()
    .from(dataQualityIssues)
    .orderBy(desc(dataQualityIssues.createdAt));

  const scopedIssues = allIssues.filter((issue) => {
    if (admin) return true;
    if (issue.targetType === 'group') return visibleGroupIds.has(issue.targetId);
    return false;
  });

  const allCandidates = await db
    .select()
    .from(candidateLocationMatches)
    .orderBy(candidateLocationMatches.candidateNo);

  const scopedCandidates = allCandidates.filter((c) => {
    if (admin) return true;
    if (c.groupId) return visibleGroupIds.has(c.groupId);
    return false;
  });

  const unlocatedGroups = allGroups
    .filter((g) => g.locationStatus === 'pending_location' && visibleGroupIds.has(g.id))
    .map((g) => ({
      id: g.id,
      groupCode: g.groupCode,
      nameTh: g.nameTh,
      district: g.district,
      subdistrict: g.subdistrict,
      village: g.village,
      addressSummary: g.addressSummary,
      assignmentStatus: g.assignmentStatus,
      careCodeRaw: g.careCodeRaw,
    }));

  const unassignedBodyGroups = admin
    ? allGroups
        .filter((g) => g.bodyId === null || g.assignmentStatus === 'pending_assignment')
        .map((g) => ({
          id: g.id,
          groupCode: g.groupCode,
          nameTh: g.nameTh,
          district: g.district,
          careCodeRaw: g.careCodeRaw,
        }))
    : [];

  const stagingGroupRows = admin
    ? await db.select().from(stagingGroups).orderBy(stagingGroups.groupRef)
    : [];

  const districtMappings = await db.select().from(districtCanonicalMappings);
  const careMappings = await db.select().from(careBodyMappings);
  const allBodies = await db.select().from(bodies);

  const unlinkedStewards = admin
    ? (
        await db
          .select({
            id: assignments.id,
            roleType: assignments.roleType,
            stewardDisplayName: assignments.stewardDisplayName,
            bodyId: assignments.bodyId,
            groupId: assignments.groupId,
            linkStatus: assignments.linkStatus,
          })
          .from(assignments)
          .where(
            and(
              eq(assignments.linkStatus, 'unlinked_pending_account'),
              isNull(assignments.effectiveTo)
            )
          )
      )
    : [];

  const linkableUsers = admin
    ? await db
        .select({
          id: users.id,
          displayName: users.displayName,
          username: users.username,
        })
        .from(users)
        .where(eq(users.status, 'active'))
    : [];

  return {
    batches,
    stagingGroups: stagingGroupRows,
    issues: scopedIssues,
    candidateLocations: scopedCandidates,
    unlocatedGroups,
    unassignedBodyGroups,
    districtMappings,
    careMappings,
    bodies: allBodies,
    unlinkedStewards,
    linkableUsers,
  };
}

export async function resolveDataQualityIssue(
  db: FaithMapDb,
  actor: ActorContext,
  input: {
    issueId: string;
    decision: 'approved_fix' | 'rejected' | 'resolved' | 'deferred';
    resolutionNote: string;
  }
) {
  const [issue] = await db
    .select()
    .from(dataQualityIssues)
    .where(eq(dataQualityIssues.id, input.issueId));
  if (!issue) {
    throw new AppError(404, 'ISSUE_NOT_FOUND', 'ไม่พบรายการตรวจสอบคุณภาพข้อมูล');
  }

  if (!isAdmin(actor)) {
    if (issue.targetType === 'group') {
      const [grp] = await db
        .select()
        .from(houseMissionGroups)
        .where(eq(houseMissionGroups.id, issue.targetId));
      if (!grp?.bodyId || !isBodyLeaderForBody(actor, grp.bodyId)) {
        throw new AppError(403, 'SCOPE_FORBIDDEN', 'ไม่มีสิทธิ์จัดการรายการนอกบอดี้ของตนเอง');
      }
    } else {
      throw new AppError(403, 'ADMIN_REQUIRED', 'เฉพาะผู้ดูแลระบบเท่านั้นที่อนุมัติรายการ Staging ได้');
    }
  }

  const [updated] = await db
    .update(dataQualityIssues)
    .set({
      status: input.decision,
      resolutionNote: input.resolutionNote,
      resolvedByUserId: actor.user.id,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dataQualityIssues.id, input.issueId))
    .returning();

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'dq_issue_resolved',
    targetType: 'data_quality_issue',
    targetId: issue.id,
    reason: input.resolutionNote,
    metadata: { issueCode: issue.issueCode, decision: input.decision },
  });

  return updated!;
}

export async function confirmCandidateLocation(
  db: FaithMapDb,
  actor: ActorContext,
  matchId: string,
  decision: 'confirmed' | 'rejected'
) {
  const [match] = await db
    .select()
    .from(candidateLocationMatches)
    .where(eq(candidateLocationMatches.id, matchId));
  if (!match) {
    throw new AppError(404, 'MATCH_NOT_FOUND', 'ไม่พบรายการจับคู่พิกัด');
  }

  if (!isAdmin(actor)) {
    if (match.groupId) {
      const [grp] = await db
        .select()
        .from(houseMissionGroups)
        .where(eq(houseMissionGroups.id, match.groupId));
      if (!grp?.bodyId || !isBodyLeaderForBody(actor, grp.bodyId)) {
        throw new AppError(403, 'SCOPE_FORBIDDEN', 'ไม่มีสิทธิ์ยืนยันพิกัดนอกบอดี้ของตนเอง');
      }
    } else {
      throw new AppError(403, 'ADMIN_REQUIRED', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ยืนยันพิกัดใน Staging ได้');
    }
  }

  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const [updatedMatch] = await tdb
      .update(candidateLocationMatches)
      .set({
        matchStatus: decision,
        reviewedByUserId: actor.user.id,
        reviewedAt: new Date(),
      })
      .where(eq(candidateLocationMatches.id, matchId))
      .returning();

    if (decision === 'confirmed' && match.groupId) {
      await tdb
        .update(houseMissionGroups)
        .set({
          latitude: match.latitude,
          longitude: match.longitude,
          locationStatus: 'verified',
          updatedAt: new Date(),
        })
        .where(eq(houseMissionGroups.id, match.groupId));
    }

    await recordSecurityAudit(tdb, {
      actorUserId: actor.user.id,
      action: 'candidate_location_reviewed',
      targetType: 'candidate_location_match',
      targetId: matchId,
      metadata: { decision, candidateNo: match.candidateNo },
    });

    return updatedMatch!;
  });
}

export async function promoteStagingBatch(
  db: FaithMapDb,
  actor: ActorContext,
  batchId: string
) {
  assertAdminOnly(actor, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถ Promote ข้อมูลเข้าสู่ระบบหลักได้');

  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'ไม่พบ Import Batch ที่ระบุ');
  if (batch.status === 'rolled_back') {
    throw new AppError(409, 'BATCH_ROLLED_BACK', 'Batch นี้ถูก Rollback ไปแล้ว');
  }

  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const sGroups = await tdb
      .select()
      .from(stagingGroups)
      .where(and(eq(stagingGroups.batchId, batchId), isNull(stagingGroups.promotedGroupId)));

    const careMapRows = await tdb.select().from(careBodyMappings);
    const careToBody = new Map(careMapRows.map((c) => [c.careCodeRaw, c.bodyId]));

    let promotedGroupsCount = 0;
    let promotedMembersCount = 0;
    let skippedIncompleteMembers = 0;

    for (const sg of sGroups) {
      const mappedBodyId = sg.careCodeRaw ? careToBody.get(sg.careCodeRaw) ?? null : null;
      const [confirmedLoc] = await tdb
        .select()
        .from(candidateLocationMatches)
        .where(
          and(
            eq(candidateLocationMatches.stagingGroupId, sg.id),
            eq(candidateLocationMatches.matchStatus, 'confirmed')
          )
        );

      const hasCoords = Boolean(confirmedLoc);
      const [createdGroup] = await tdb
        .insert(houseMissionGroups)
        .values({
          groupCode: sg.groupRef,
          bodyId: mappedBodyId,
          nameTh: sg.groupNameFromSheetRaw,
          groupNameFromSheet: sg.groupNameFromSheetRaw,
          formTitle: sg.formTitleRaw,
          careCodeRaw: sg.careCodeRaw,
          district: sg.districtNormalized ?? sg.districtRaw ?? 'ไม่ระบุอำเภอ',
          subdistrict: sg.subdistrictRaw,
          village: sg.villageRaw,
          addressSummary: sg.meetingPlaceRaw,
          latitude: confirmedLoc?.latitude ?? null,
          longitude: confirmedLoc?.longitude ?? null,
          meetingDayOfWeek: sg.meetingDayRaw ? parseThaiWeekday(sg.meetingDayRaw) : null,
          meetingTimeLocal: null,
          meetingTimeRaw: [sg.meetingTimeStartRaw, sg.meetingTimeEndRaw].filter(Boolean).join(' - ') || null,
          status: 'active',
          assignmentStatus: mappedBodyId ? 'assigned' : 'pending_assignment',
          locationStatus: hasCoords ? 'verified' : 'pending_location',
          sourceBatchId: batchId,
          sourceRef: sg.groupRef,
        })
        .returning();

      promotedGroupsCount++;

      await tdb
        .update(stagingGroups)
        .set({ promotedGroupId: createdGroup!.id, dataStatus: 'promoted', updatedAt: new Date() })
        .where(eq(stagingGroups.id, sg.id));

      // Create unlinked steward assignments for leader & coordinator if present
      if (sg.leaderRaw && sg.leaderRaw !== '-') {
        await tdb.insert(assignments).values({
          userId: null,
          stewardDisplayName: sg.leaderRaw,
          linkStatus: 'unlinked_pending_account',
          sourceRoleLabel: 'ผู้รับผิดชอบกลุ่ม (ต้นฉบับ)',
          scopeType: 'group',
          groupId: createdGroup!.id,
          roleType: 'care_leader',
          isPrimary: true,
          assignedByUserId: actor.user.id,
        });
      }
      if (sg.coordinatorRaw && sg.coordinatorRaw !== '-') {
        await tdb.insert(assignments).values({
          userId: null,
          stewardDisplayName: sg.coordinatorRaw,
          linkStatus: 'unlinked_pending_account',
          sourceRoleLabel: 'ผู้ประสานงาน (ต้นฉบับ)',
          scopeType: 'group',
          groupId: createdGroup!.id,
          roleType: 'coordinator',
          isPrimary: true,
          assignedByUserId: actor.user.id,
        });
      }

      const sMembers = await tdb
        .select()
        .from(stagingMemberRows)
        .where(
          and(
            eq(stagingMemberRows.stagingGroupId, sg.id),
            isNull(stagingMemberRows.promotedMemberId)
          )
        );

      for (const sm of sMembers) {
        if (!sm.fullNameRaw && !sm.nicknameRaw) {
          skippedIncompleteMembers++;
          continue;
        }
        const [createdMember] = await tdb
          .insert(members)
          .values({
            memberCode: sm.memberRowRef,
            fullName: sm.fullNameRaw,
            nickname: sm.nicknameRaw,
            displayName: sm.nicknameRaw ?? sm.fullNameRaw ?? sm.memberRowRef,
            ageRaw: sm.ageRaw,
            occupationRaw: sm.occupationRaw,
            locationTextRaw: sm.locationRaw,
            verificationStatus: sm.fullNameRaw ? 'pending_review' : 'unverified',
            sourceBatchId: batchId,
            sourceRowRef: sm.memberRowRef,
            sourceProvenance: {
              sourceFile: sm.sourceFile,
              sourceSheet: sm.sourceSheet,
              sourceRow: sm.sourceRow,
            },
          })
          .returning();

        await tdb.insert(groupMemberships).values({
          groupId: createdGroup!.id,
          memberId: createdMember!.id,
          membershipRole: 'member',
          isActive: true,
        });

        await tdb
          .update(stagingMemberRows)
          .set({ promotedMemberId: createdMember!.id, dataStatus: 'promoted', updatedAt: new Date() })
          .where(eq(stagingMemberRows.id, sm.id));

        promotedMembersCount++;
      }
    }

    const nextStatus = skippedIncompleteMembers > 0 ? 'partially_promoted' : 'promoted';
    const [updatedBatch] = await tdb
      .update(importBatches)
      .set({
        status: nextStatus,
        approvedByUserId: actor.user.id,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(importBatches.id, batchId))
      .returning();

    await recordSecurityAudit(tdb, {
      actorUserId: actor.user.id,
      action: 'import_batch_promoted',
      targetType: 'import_batch',
      targetId: batchId,
      metadata: {
        promotedGroupsCount,
        promotedMembersCount,
        skippedIncompleteMembers,
      },
    });

    return {
      batch: updatedBatch!,
      promotedGroupsCount,
      promotedMembersCount,
      skippedIncompleteMembers,
    };
  });
}

export async function rollbackImportBatch(
  db: FaithMapDb,
  actor: ActorContext,
  batchId: string,
  reason: string
) {
  assertAdminOnly(actor, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถ Rollback Import Batch ได้');

  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'ไม่พบ Import Batch ที่ระบุ');

  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const promotedGroups = await tdb
      .select()
      .from(houseMissionGroups)
      .where(eq(houseMissionGroups.sourceBatchId, batchId));

    const promotedGroupIds = promotedGroups.map((g) => g.id);
    let hasDependentReports = false;
    if (promotedGroupIds.length > 0) {
      const linkedReports = await tdb
        .select({ id: weeklyReports.id })
        .from(weeklyReports)
        .where(inArray(weeklyReports.groupId, promotedGroupIds))
        .limit(1);
      hasDependentReports = linkedReports.length > 0;
    }

    if (hasDependentReports) {
      await tdb
        .update(houseMissionGroups)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(houseMissionGroups.sourceBatchId, batchId));
    } else if (promotedGroupIds.length > 0) {
      await tdb.delete(members).where(eq(members.sourceBatchId, batchId));
      await tdb.delete(houseMissionGroups).where(eq(houseMissionGroups.sourceBatchId, batchId));
    }

    const [updatedBatch] = await tdb
      .update(importBatches)
      .set({
        status: 'rolled_back',
        rolledBackAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(importBatches.id, batchId))
      .returning();

    await recordSecurityAudit(tdb, {
      actorUserId: actor.user.id,
      action: 'import_batch_rolled_back',
      targetType: 'import_batch',
      targetId: batchId,
      reason,
      metadata: { archivedInsteadOfDeleted: hasDependentReports },
    });

    return {
      batch: updatedBatch!,
      archivedInsteadOfDeleted: hasDependentReports,
    };
  });
}

export async function saveDistrictMapping(
  db: FaithMapDb,
  actor: ActorContext,
  districtRaw: string,
  districtCanonical: string
) {
  assertAdminOnly(actor, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถกำหนด Mapping อำเภอได้');
  const rawTrim = districtRaw.trim();
  const canonTrim = districtCanonical.trim();
  if (!rawTrim || !canonTrim) {
    throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุชื่ออำเภอต้นฉบับและชื่อมาตรฐาน');
  }

  const [existing] = await db
    .select()
    .from(districtCanonicalMappings)
    .where(eq(districtCanonicalMappings.districtRaw, rawTrim));

  const now = new Date();
  const row = existing
    ? (
        await db
          .update(districtCanonicalMappings)
          .set({
            districtCanonical: canonTrim,
            approvedByUserId: actor.user.id,
            approvedAt: now,
          })
          .where(eq(districtCanonicalMappings.id, existing.id))
          .returning()
      )[0]!
    : (
        await db
          .insert(districtCanonicalMappings)
          .values({
            districtRaw: rawTrim,
            districtCanonical: canonTrim,
            approvedByUserId: actor.user.id,
            approvedAt: now,
          })
          .returning()
      )[0]!;

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'district_mapping_saved',
    targetType: 'district_canonical_mapping',
    targetId: row.id,
    metadata: { districtRaw: rawTrim, districtCanonical: canonTrim },
  });

  return row;
}

export async function saveCareBodyMapping(
  db: FaithMapDb,
  actor: ActorContext,
  careCodeRaw: string,
  bodyId: string,
  notes?: string
) {
  assertAdminOnly(actor, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถกำหนด Mapping รหัสแคร์เข้าบอดี้ได้');
  const codeTrim = careCodeRaw.trim();
  if (!codeTrim) {
    throw new AppError(400, 'VALIDATION_ERROR', 'กรุณาระบุรหัสแคร์ต้นฉบับ');
  }

  const [existing] = await db
    .select()
    .from(careBodyMappings)
    .where(eq(careBodyMappings.careCodeRaw, codeTrim));

  const now = new Date();
  const row = existing
    ? (
        await db
          .update(careBodyMappings)
          .set({
            bodyId,
            notes: notes?.trim() ?? null,
            approvedByUserId: actor.user.id,
            approvedAt: now,
          })
          .where(eq(careBodyMappings.id, existing.id))
          .returning()
      )[0]!
    : (
        await db
          .insert(careBodyMappings)
          .values({
            careCodeRaw: codeTrim,
            bodyId,
            notes: notes?.trim() ?? null,
            approvedByUserId: actor.user.id,
            approvedAt: now,
          })
          .returning()
      )[0]!;

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'care_body_mapping_saved',
    targetType: 'care_body_mapping',
    targetId: row.id,
    metadata: { careCodeRaw: codeTrim, bodyId },
  });

  return row;
}

export async function assignUnassignedGroupBody(
  db: FaithMapDb,
  actor: ActorContext,
  groupId: string,
  bodyId: string
) {
  assertAdminOnly(actor, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถจัดสรรบอดี้ให้กลุ่มได้');

  const [updated] = await db
    .update(houseMissionGroups)
    .set({
      bodyId,
      assignmentStatus: 'assigned',
      updatedAt: new Date(),
    })
    .where(eq(houseMissionGroups.id, groupId))
    .returning();

  if (!updated) {
    throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจที่ระบุ');
  }

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'group_body_assigned',
    targetType: 'house_mission_group',
    targetId: groupId,
    metadata: { bodyId },
  });

  return updated;
}

export async function linkStewardAssignmentToUser(
  db: FaithMapDb,
  actor: ActorContext,
  assignmentId: string,
  userId: string
) {
  assertAdminOnly(actor, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถผูกผู้ดูแลเข้ากับบัญชีผู้ใช้ได้');

  const [updated] = await db
    .update(assignments)
    .set({
      userId,
      linkStatus: 'linked_user',
      updatedAt: new Date(),
    })
    .where(eq(assignments.id, assignmentId))
    .returning();

  if (!updated) {
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'ไม่พบรายการมอบหมายผู้ดูแลที่ระบุ');
  }

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'steward_assignment_linked_user',
    targetType: 'assignment',
    targetId: assignmentId,
    metadata: { userId, roleType: updated.roleType },
  });

  return updated;
}
