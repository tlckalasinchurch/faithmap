import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, isNotNull, isNull, ne, notInArray, or } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import {
  assignments,
  attendanceRecords,
  bodies,
  candidateLocationMatches,
  careBodyMappings,
  cares,
  dataQualityDecisions,
  dataQualityIssues,
  districtCanonicalMappings,
  groupMemberships,
  houseMissionGroups,
  importBatches,
  memberGrowthRecords,
  members,
  stagingGroups,
  stagingMemberRows,
  users,
  weeklyReports,
} from '@/server/db/schema';
import { KALASIN_TEAM_G_POINTS } from '@/lib/kalasin-field-points';
import { AppError, isUniqueViolation } from '../errors';
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
  teamName?: string | null;
  registeredTotal?: string | number | null;
  mapUrlRaw?: string | null;
  groupPhotoUrl?: string | null;
  sourceFile: string;
  sourceSheet: string;
}

export interface ImportMemberInput {
  memberRowRef: string;
  groupRef: string;
  sequenceRaw?: string | number | null;
  fullNameRaw?: string | null;
  nicknameRaw?: string | null;
  ageRaw?: string | number | null;
  occupationRaw?: string | null;
  studyWorkplaceRaw?: string | null;
  familyStatusRaw?: string | null;
  locationRaw?: string | null;
  salvationDateRaw?: string | null;
  responseAttitudeRaw?: string | null;
  groupAttendanceLevelRaw?: string | null;
  discipleshipGoalRaw?: string | null;
  targetTimeframeRaw?: string | null;
  disciplerNameRaw?: string | null;
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

function pickRawCell(
  rawCells: Record<string, unknown> | undefined,
  keys: string[]
): string | null {
  if (!rawCells) return null;
  for (const key of keys) {
    const val = rawCells[key];
    if (val !== undefined && val !== null) {
      const s = String(val).trim();
      if (s !== '') return s;
    }
  }
  return null;
}

function extractMemberExtras(rawCells: Record<string, unknown> | undefined) {
  const meta =
    rawCells && typeof rawCells.__memberFields === 'object' && rawCells.__memberFields !== null
      ? (rawCells.__memberFields as Record<string, unknown>)
      : undefined;
  return {
    sourceSequenceNo:
      (meta?.sequenceRaw ? String(meta.sequenceRaw).trim() : null) ??
      pickRawCell(rawCells, ['ลำดับ', 'sequence', 'no', 'seq']),
    studyWorkplaceRaw:
      (meta?.studyWorkplaceRaw ? String(meta.studyWorkplaceRaw).trim() : null) ??
      pickRawCell(rawCells, ['สถานที่เรียน/ทำงาน', 'สถานที่เรียน', 'ที่ทำงาน', 'studyWorkplace', 'study_workplace']),
    familyStatusRaw:
      (meta?.familyStatusRaw ? String(meta.familyStatusRaw).trim() : null) ??
      pickRawCell(rawCells, ['สถานภาพครอบครัว', 'สถานภาพ', 'familyStatus', 'family_status']),
  };
}

/**
 * Growth fields come only from explicit field names or named headers.
 * Column letters (Y to AD) are NOT used: the mapping is not verified against the source workbook
 * (owner decision 2). The raw cells stay in provenance, so nothing is lost and nothing is invented.
 */
function extractGrowthFields(rawCells: Record<string, unknown> | undefined) {
  const meta =
    rawCells && typeof rawCells.__growthFields === 'object' && rawCells.__growthFields !== null
      ? (rawCells.__growthFields as Record<string, unknown>)
      : undefined;
  const pickMeta = (k: string) => {
    const v = meta?.[k];
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s || null;
  };
  return {
    conversionDateRaw:
      pickMeta('salvationDateRaw') ??
      pickRawCell(rawCells, ['วันรับเชื่อ', 'salvation_date', 'conversionDateRaw']),
    responseAttitudeRaw:
      pickMeta('responseAttitudeRaw') ??
      pickRawCell(rawCells, ['ท่าทีการตอบสนอง', 'response', 'responseAttitudeRaw']),
    groupAttendanceLevelRaw:
      pickMeta('groupAttendanceLevelRaw') ??
      pickRawCell(rawCells, ['การเข้าร่วมกลุ่ม', 'group_attendance', 'groupAttendanceLevelRaw']),
    discipleshipGoalRaw:
      pickMeta('discipleshipGoalRaw') ??
      pickRawCell(rawCells, ['เป้าหมายในการสร้าง', 'growth_goal', 'discipleshipGoalRaw']),
    targetTimeframeRaw:
      pickMeta('targetTimeframeRaw') ??
      pickRawCell(rawCells, ['กำหนดเวลาภายใน', 'deadline', 'targetTimeframeRaw']),
    disciplerNameRaw:
      pickMeta('disciplerNameRaw') ??
      pickRawCell(rawCells, ['ผู้รับผิดชอบสร้าง', 'growth_responsible_person', 'disciplerNameRaw']),
  };
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

/** Preview needs admin rights and is not open to every signed-in user. */
export function previewImportForActor(actor: ActorContext, payload: ImportBatchPayload) {
  assertAdminOnly(actor, 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถตรวจสอบไฟล์นำเข้าได้');
  return previewImportPayload(payload);
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

  const groupExtrasByRef: Record<
    string,
    { teamName: string | null; mapUrlRaw: string | null; groupPhotoUrl: string | null }
  > = {};
  for (const g of payload.groups) {
    groupExtrasByRef[g.groupRef] = {
      teamName: normalizeText(g.teamName) || null,
      mapUrlRaw: normalizeText(g.mapUrlRaw) || null,
      groupPhotoUrl: normalizeText(g.groupPhotoUrl) || null,
    };
  }

  let createdBatch: typeof importBatches.$inferSelect;
  try {
    createdBatch = await db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const [batch] = await tdb
      .insert(importBatches)
      .values({
        batchCode,
        sourceArchiveName: payload.sourceArchiveName,
        fileSha256: preview.fileSha256,
        selectionPolicyVersion: payload.selectionPolicyVersion ?? '1.0',
        status: 'staged',
        summaryJson: { ...preview, groupExtrasByRef },
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

    const existingMembers = await tdb
      .select({
        id: members.id,
        memberCode: members.memberCode,
        fullName: members.fullName,
      })
      .from(members);
    const existingMemberByFullName = new Map<string, { id: string; memberCode: string }>();
    for (const em of existingMembers) {
      const normFn = em.fullName?.trim().replace(/\s+/g, ' ');
      if (normFn && !existingMemberByFullName.has(normFn)) {
        existingMemberByFullName.set(normFn, { id: em.id, memberCode: em.memberCode });
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

      const normFullName = fn ? fn.replace(/\s+/g, ' ') : '';
      const matchedExisting = normFullName ? existingMemberByFullName.get(normFullName) : undefined;

      const rawCellsToStore: Record<string, unknown> = { ...(m.rawCells ?? {}) };
      if (
        m.sequenceRaw !== undefined ||
        m.studyWorkplaceRaw !== undefined ||
        m.familyStatusRaw !== undefined
      ) {
        rawCellsToStore.__memberFields = {
          ...(m.sequenceRaw !== undefined ? { sequenceRaw: normalizeText(m.sequenceRaw) || null } : {}),
          ...(m.studyWorkplaceRaw !== undefined
            ? { studyWorkplaceRaw: normalizeText(m.studyWorkplaceRaw) || null }
            : {}),
          ...(m.familyStatusRaw !== undefined
            ? { familyStatusRaw: normalizeText(m.familyStatusRaw) || null }
            : {}),
        };
      }
      if (
        m.salvationDateRaw !== undefined ||
        m.responseAttitudeRaw !== undefined ||
        m.groupAttendanceLevelRaw !== undefined ||
        m.discipleshipGoalRaw !== undefined ||
        m.targetTimeframeRaw !== undefined ||
        m.disciplerNameRaw !== undefined
      ) {
        rawCellsToStore.__growthFields = {
          ...(m.salvationDateRaw !== undefined
            ? { salvationDateRaw: normalizeText(m.salvationDateRaw) || null }
            : {}),
          ...(m.responseAttitudeRaw !== undefined
            ? { responseAttitudeRaw: normalizeText(m.responseAttitudeRaw) || null }
            : {}),
          ...(m.groupAttendanceLevelRaw !== undefined
            ? { groupAttendanceLevelRaw: normalizeText(m.groupAttendanceLevelRaw) || null }
            : {}),
          ...(m.discipleshipGoalRaw !== undefined
            ? { discipleshipGoalRaw: normalizeText(m.discipleshipGoalRaw) || null }
            : {}),
          ...(m.targetTimeframeRaw !== undefined
            ? { targetTimeframeRaw: normalizeText(m.targetTimeframeRaw) || null }
            : {}),
          ...(m.disciplerNameRaw !== undefined
            ? { disciplerNameRaw: normalizeText(m.disciplerNameRaw) || null }
            : {}),
        };
      }

      const initialStatus = missingBoth
        ? 'incomplete'
        : matchedExisting
          ? 'conflict'
          : 'raw';

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
          rawCellsJson: rawCellsToStore,
          duplicateCandidateOfMemberId: matchedExisting?.id ?? null,
          dataStatus: initialStatus,
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
        if (matchedExisting) {
          dqRows.push({
            batchId: batch!.id,
            targetType: 'staging_member',
            targetId: sm!.id,
            issueCode: 'duplicate_existing_member',
            severity: 'review',
            status: 'open',
            summarySafeText: `${m.memberRowRef} (${m.groupRef} แถว ${m.sourceRow}): พบชื่อตรงกับทะเบียนสมาชิกเดิม (${matchedExisting.memberCode}) — รอคนตรวจสอบก่อนเชื่อมโยง`,
            proposedValueJson: {
              existingMemberId: matchedExisting.id,
              existingMemberCode: matchedExisting.memberCode,
            },
          });
        }

        // Only bucket by fullName when fullName exists; never treat same nickname alone as same person
        if (normFullName) {
          const nameKey = sha256Hex(`${normFullName}|${nn.replace(/\s+/g, ' ')}`).slice(0, 12);
          const bucket = stagingMemberBuckets.get(nameKey) ?? [];
          bucket.push({ id: sm!.id, memberRowRef: m.memberRowRef, groupRef: m.groupRef });
          stagingMemberBuckets.set(nameKey, bucket);
        }
      }
    }

    // Owner rule: every row of a cross-group duplicate candidate set enters pending_review.
    // No row of the set is promoted or merged automatically. Each row gets its own issue,
    // so a person decides each row on its own.
    const duplicateCandidateMemberIds: string[] = [];
    for (const bucket of stagingMemberBuckets.values()) {
      const distinctGroups = new Set(bucket.map((b) => b.groupRef));
      if (distinctGroups.size <= 1) continue;
      for (const row of bucket) {
        duplicateCandidateMemberIds.push(row.id);
        const peerRefs = bucket
          .filter((b) => b.id !== row.id)
          .map((b) => `${b.memberRowRef}/${b.groupRef}`)
          .join(', ');
        dqRows.push({
          batchId: batch!.id,
          targetType: 'staging_member',
          targetId: row.id,
          issueCode: 'duplicate_candidate',
          severity: 'review',
          status: 'open',
          summarySafeText: `${row.memberRowRef} (${row.groupRef}): ชื่อตรงกับแถวอื่นในต่างกลุ่ม (${peerRefs}) — รอคนยืนยัน`,
          proposedValueJson: {
            refs: bucket.map((b) => ({ memberRowRef: b.memberRowRef, groupRef: b.groupRef })),
          },
        });
      }
    }

    if (duplicateCandidateMemberIds.length > 0) {
      await tdb
        .update(stagingMemberRows)
        .set({ dataStatus: 'pending_review', updatedAt: new Date() })
        .where(
          and(
            inArray(stagingMemberRows.id, duplicateCandidateMemberIds),
            inArray(stagingMemberRows.dataStatus, ['raw', 'normalized'])
          )
        );
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
  } catch (err) {
    // Two requests with the same file at the same time: the second one gets the first batch.
    if (isUniqueViolation(err)) {
      const [raced] = await db
        .select()
        .from(importBatches)
        .where(eq(importBatches.fileSha256, preview.fileSha256));
      if (raced) return { idempotentHit: true, batch: raced, preview };
    }
    throw err;
  }

  return { idempotentHit: false, batch: createdBatch, preview };
}

export async function listIngestionOverview(db: FaithMapDb, actor: ActorContext) {
  const admin = isAdmin(actor);
  // The overview shows import queues and the whole Body list. Only admins and Body Leaders need it.
  if (!admin && actor.bodyLeaderBodyIds.size === 0) {
    throw new AppError(403, 'SCOPE_FORBIDDEN', 'เฉพาะผู้ดูแลระบบและหัวหน้าบอดี้เท่านั้นที่ดูหน้านี้ได้');
  }
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

export type DataQualityDecisionType =
  | 'approved_fix'
  | 'rejected'
  | 'resolved'
  | 'deferred'
  | 'reversed';

type DecisionRow = typeof dataQualityDecisions.$inferSelect;

/** The head is the decision that no other decision supersedes. */
function findDecisionHead(rows: DecisionRow[]): DecisionRow | null {
  const superseded = new Set(rows.map((r) => r.supersedesDecisionId).filter(Boolean));
  return rows.find((r) => !superseded.has(r.id)) ?? null;
}

async function assertCanDecideIssue(
  db: FaithMapDb,
  actor: ActorContext,
  issue: typeof dataQualityIssues.$inferSelect
) {
  if (isAdmin(actor)) return;
  if (issue.targetType === 'group') {
    const [grp] = await db
      .select()
      .from(houseMissionGroups)
      .where(eq(houseMissionGroups.id, issue.targetId));
    if (!grp?.bodyId || !isBodyLeaderForBody(actor, grp.bodyId)) {
      throw new AppError(403, 'SCOPE_FORBIDDEN', 'ไม่มีสิทธิ์จัดการรายการนอกบอดี้ของตนเอง');
    }
    return;
  }
  throw new AppError(403, 'ADMIN_REQUIRED', 'เฉพาะผู้ดูแลระบบเท่านั้นที่อนุมัติรายการ Staging ได้');
}

/**
 * Records a data-quality decision. Decisions are immutable: this function only appends a row.
 * A new decision supersedes the current head. A 'reversed' decision cancels the head and re-opens the
 * issue. The issue row keeps a projection of the head for fast lists; the decision table is the record.
 */
export async function resolveDataQualityIssue(
  db: FaithMapDb,
  actor: ActorContext,
  input: {
    issueId: string;
    decision: DataQualityDecisionType;
    resolutionNote: string;
    /** Optional stale-screen guard. null means "I expect no earlier decision". */
    expectedDecisionId?: string | null;
  }
) {
  const reason = input.resolutionNote.trim();
  if (!reason) {
    throw new AppError(400, 'REASON_REQUIRED', 'กรุณาระบุเหตุผลของการตัดสินใจ');
  }
  const [issue] = await db
    .select()
    .from(dataQualityIssues)
    .where(eq(dataQualityIssues.id, input.issueId));
  if (!issue) {
    throw new AppError(404, 'ISSUE_NOT_FOUND', 'ไม่พบรายการตรวจสอบคุณภาพข้อมูล');
  }
  await assertCanDecideIssue(db, actor, issue);

  try {
    return await db.transaction(async (tx) => {
      const history = await tx
        .select()
        .from(dataQualityDecisions)
        .where(eq(dataQualityDecisions.issueId, issue.id));
      const head = findDecisionHead(history);

      if (input.expectedDecisionId !== undefined && (head?.id ?? null) !== input.expectedDecisionId) {
        throw new AppError(409, 'DECISION_STALE', 'มีผู้อื่นตัดสินใจรายการนี้แล้ว กรุณาโหลดหน้าใหม่');
      }
      if (input.decision === 'reversed' && (!head || head.decisionType === 'reversed')) {
        throw new AppError(409, 'NOTHING_TO_REVERSE', 'ไม่มีการตัดสินใจที่ยกเลิกได้');
      }

      let stagingRow: typeof stagingMemberRows.$inferSelect | undefined;
      if (issue.targetType === 'staging_member') {
        [stagingRow] = await tx
          .select()
          .from(stagingMemberRows)
          .where(eq(stagingMemberRows.id, issue.targetId));
        if (stagingRow && (stagingRow.promotedMemberId || stagingRow.dataStatus === 'promoted')) {
          throw new AppError(
            409,
            'DECISION_LOCKED',
            'แถวนี้นำเข้าเป็นสมาชิกแล้ว จึงเปลี่ยนการตัดสินใจไม่ได้'
          );
        }
      }

      const [decision] = await tx
        .insert(dataQualityDecisions)
        .values({
          issueId: issue.id,
          decisionType: input.decision,
          supersedesDecisionId: head?.id ?? null,
          reason,
          decidedByUserId: actor.user.id,
        })
        .returning();

      const reopened = input.decision === 'reversed';
      const [updated] = await tx
        .update(dataQualityIssues)
        .set({
          status: reopened ? 'open' : input.decision,
          resolutionNote: reason,
          resolvedByUserId: reopened ? null : actor.user.id,
          resolvedAt: reopened ? null : decision!.decidedAt,
          updatedAt: new Date(),
        })
        .where(eq(dataQualityIssues.id, issue.id))
        .returning();

      if (stagingRow) {
        const next =
          input.decision === 'approved_fix' || input.decision === 'resolved'
            ? 'approved'
            : input.decision === 'rejected'
              ? 'rejected'
              : 'pending_review'; // deferred and reversed: a person must decide again
        await tx
          .update(stagingMemberRows)
          .set({ dataStatus: next, updatedAt: new Date() })
          .where(
            and(
              eq(stagingMemberRows.id, stagingRow.id),
              isNull(stagingMemberRows.promotedMemberId),
              inArray(stagingMemberRows.dataStatus, [
                'conflict',
                'pending_review',
                'approved',
                'rejected',
              ])
            )
          );
      }

      await recordSecurityAudit(tx, {
        actorUserId: actor.user.id,
        action: head ? 'dq_decision_superseded' : 'dq_issue_resolved',
        targetType: 'data_quality_issue',
        targetId: issue.id,
        reason,
        metadata: {
          issueCode: issue.issueCode,
          decision: input.decision,
          decisionId: decision!.id,
          supersedesDecisionId: head?.id ?? null,
        },
      });

      return updated!;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'DECISION_CONFLICT', 'มีผู้อื่นตัดสินใจรายการนี้พร้อมกัน กรุณาโหลดหน้าใหม่');
    }
    throw err;
  }
}

/** Full decision history of one issue, oldest first. Same access rule as deciding. */
export async function listDecisionHistory(db: FaithMapDb, actor: ActorContext, issueId: string) {
  const [issue] = await db.select().from(dataQualityIssues).where(eq(dataQualityIssues.id, issueId));
  if (!issue) throw new AppError(404, 'ISSUE_NOT_FOUND', 'ไม่พบรายการตรวจสอบคุณภาพข้อมูล');
  await assertCanDecideIssue(db, actor, issue);
  return db
    .select()
    .from(dataQualityDecisions)
    .where(eq(dataQualityDecisions.issueId, issueId))
    .orderBy(dataQualityDecisions.decidedAt);
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

function normName(v: string | null | undefined): string {
  return (v ?? '').trim().replace(/\s+/g, ' ');
}

/** Same person only when the names agree. A staged row with a full name needs the same full name. */
function isSamePerson(
  existing: { fullName: string | null; nickname: string | null },
  staged: { fullNameRaw: string | null; nicknameRaw: string | null }
): boolean {
  if (staged.fullNameRaw) return normName(existing.fullName) === normName(staged.fullNameRaw);
  return !normName(existing.fullName) && normName(existing.nickname) === normName(staged.nicknameRaw);
}

async function promoteStagingMembersForGroup(
  tdb: FaithMapDb,
  batchId: string,
  stagingGroupId: string,
  targetGroupId: string
): Promise<{
  promotedMembersCount: number;
  promotedGrowthRecordsCount: number;
  skippedIncompleteMembers: number;
}> {
  const sMembers = await tdb
    .select()
    .from(stagingMemberRows)
    .where(
      and(
        eq(stagingMemberRows.stagingGroupId, stagingGroupId),
        isNull(stagingMemberRows.promotedMemberId)
      )
    );

  let promotedMembersCount = 0;
  let promotedGrowthRecordsCount = 0;
  let skippedIncompleteMembers = 0;

  for (const sm of sMembers) {
    if (sm.dataStatus === 'rejected') {
      continue;
    }
    if (
      (!sm.fullNameRaw && !sm.nicknameRaw) ||
      sm.dataStatus === 'incomplete' ||
      sm.dataStatus === 'conflict' ||
      sm.dataStatus === 'pending_review'
    ) {
      skippedIncompleteMembers++;
      continue;
    }

    const [existingByCode] = await tdb
      .select({
        id: members.id,
        verificationStatus: members.verificationStatus,
        fullName: members.fullName,
        nickname: members.nickname,
      })
      .from(members)
      .where(eq(members.memberCode, sm.memberRowRef))
      .limit(1);

    let targetMemberId: string;
    if (existingByCode) {
      // A member code is a source row reference. Reuse the member only when it is clearly the same
      // person. A different name means a code collision: never merge two people automatically.
      if (!isSamePerson(existingByCode, sm)) {
        await tdb
          .update(stagingMemberRows)
          .set({ dataStatus: 'conflict', updatedAt: new Date() })
          .where(eq(stagingMemberRows.id, sm.id));
        const [openIssue] = await tdb
          .select({ id: dataQualityIssues.id })
          .from(dataQualityIssues)
          .where(
            and(
              eq(dataQualityIssues.targetId, sm.id),
              eq(dataQualityIssues.issueCode, 'member_code_collision')
            )
          )
          .limit(1);
        if (!openIssue) {
          await tdb.insert(dataQualityIssues).values({
            batchId,
            targetType: 'staging_member',
            targetId: sm.id,
            issueCode: 'member_code_collision',
            severity: 'blocking',
            status: 'open',
            summarySafeText: `${sm.memberRowRef}: รหัสสมาชิกซ้ำกับสมาชิกเดิมที่ชื่อไม่ตรงกัน — ต้องแก้รหัสต้นฉบับก่อนนำเข้าใหม่`,
            proposedValueJson: { existingMemberId: existingByCode.id },
          });
        }
        skippedIncompleteMembers++;
        continue;
      }
      targetMemberId = existingByCode.id;
    } else {
      const extras = extractMemberExtras(sm.rawCellsJson);
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
          sourceSequenceNo: extras.sourceSequenceNo,
          studyWorkplaceRaw: extras.studyWorkplaceRaw,
          familyStatusRaw: extras.familyStatusRaw,
          verificationStatus: sm.fullNameRaw ? 'pending_review' : 'unverified',
          sourceBatchId: batchId,
          sourceRowRef: sm.memberRowRef,
          sourceProvenance: {
            sourceFile: sm.sourceFile,
            sourceSheet: sm.sourceSheet,
            sourceRow: sm.sourceRow,
            rawCells: sm.rawCellsJson,
          },
        })
        .returning();
      targetMemberId = createdMember!.id;
    }

    const [existingLink] = await tdb
      .select({ id: groupMemberships.id })
      .from(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, targetGroupId),
          eq(groupMemberships.memberId, targetMemberId)
        )
      )
      .limit(1);

    if (!existingLink) {
      await tdb.insert(groupMemberships).values({
        groupId: targetGroupId,
        memberId: targetMemberId,
        membershipRole: 'member',
        isActive: true,
      });
    }

    await tdb
      .update(stagingMemberRows)
      .set({ promotedMemberId: targetMemberId, dataStatus: 'promoted', updatedAt: new Date() })
      .where(eq(stagingMemberRows.id, sm.id));

    const growth = extractGrowthFields(sm.rawCellsJson);
    const hasAnyGrowth = Boolean(
      growth.conversionDateRaw ||
        growth.responseAttitudeRaw ||
        growth.groupAttendanceLevelRaw ||
        growth.discipleshipGoalRaw ||
        growth.targetTimeframeRaw ||
        growth.disciplerNameRaw
    );
    if (hasAnyGrowth) {
      const [existingGrowth] = await tdb
        .select({ id: memberGrowthRecords.id })
        .from(memberGrowthRecords)
        .where(
          and(
            eq(memberGrowthRecords.memberId, targetMemberId),
            eq(memberGrowthRecords.sourceBatchId, batchId),
            eq(memberGrowthRecords.sourceFile, sm.sourceFile),
            eq(memberGrowthRecords.sourceSheet, sm.sourceSheet),
            eq(memberGrowthRecords.sourceRow, sm.sourceRow)
          )
        )
        .limit(1);

      if (!existingGrowth) {
        const rawCellsEntries = Object.entries(sm.rawCellsJson ?? {})
          .filter(([k]) => !k.startsWith('__'))
          .map(([col, value]) => ({ col, value }));
        const isIncompleteGoal = Boolean(
          growth.discipleshipGoalRaw && (!growth.targetTimeframeRaw || !growth.disciplerNameRaw)
        );
        await tdb.insert(memberGrowthRecords).values({
          memberId: targetMemberId,
          groupId: targetGroupId,
          conversionDateRaw: growth.conversionDateRaw,
          responseAttitudeRaw: growth.responseAttitudeRaw,
          groupAttendanceLevelRaw: growth.groupAttendanceLevelRaw,
          discipleshipGoalRaw: growth.discipleshipGoalRaw,
          targetTimeframeRaw: growth.targetTimeframeRaw,
          disciplerNameRaw: growth.disciplerNameRaw,
          disciplerAssignmentId: null,
          verificationStatus: isIncompleteGoal ? 'INCOMPLETE' : 'RAW',
          sourceBatchId: batchId,
          sourceFile: sm.sourceFile,
          sourceSheet: sm.sourceSheet,
          sourceRow: sm.sourceRow,
          rawCellsJson: rawCellsEntries,
        });
        promotedGrowthRecordsCount++;
      }
    }

    promotedMembersCount++;
  }

  return {
    promotedMembersCount,
    promotedGrowthRecordsCount,
    skippedIncompleteMembers,
  };
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

  try {
    return await promoteBatchTransaction(db, actor, batch, batchId);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(
        409,
        'PROMOTION_CONFLICT',
        'นำเข้าไม่สำเร็จ เพราะมีรหัสกลุ่มหรือรหัสสมาชิกซ้ำกับข้อมูลที่มีอยู่แล้ว ระบบยังไม่ได้บันทึกอะไรจาก Batch นี้'
      );
    }
    throw err;
  }
}

async function promoteBatchTransaction(
  db: FaithMapDb,
  actor: ActorContext,
  batch: typeof importBatches.$inferSelect,
  batchId: string
) {
  return db.transaction(async (tx) => {
    const tdb = tx as unknown as FaithMapDb;
    const sGroups = await tdb
      .select()
      .from(stagingGroups)
      .where(and(eq(stagingGroups.batchId, batchId), isNull(stagingGroups.promotedGroupId)));

    const careMapRows = await tdb.select().from(careBodyMappings);
    const careToBody = new Map(careMapRows.map((c) => [c.careCodeRaw, c.bodyId]));

    const summaryObj = (batch.summaryJson ?? {}) as {
      groupExtrasByRef?: Record<
        string,
        { teamName?: string | null; mapUrlRaw?: string | null; groupPhotoUrl?: string | null }
      >;
    };
    const groupExtrasByRef = summaryObj.groupExtrasByRef ?? {};

    let promotedGroupsCount = 0;
    let promotedMembersCount = 0;
    let promotedGrowthRecordsCount = 0;
    let skippedIncompleteMembers = 0;
    const newlyPromotedStagingGroupIds = new Set<string>();

    for (const sg of sGroups) {
      newlyPromotedStagingGroupIds.add(sg.id);
      const extras = groupExtrasByRef[sg.groupRef] ?? {};
      const teamName = extras.teamName ?? null;
      const mapUrlRaw = extras.mapUrlRaw ?? null;
      const groupPhotoUrl = extras.groupPhotoUrl ?? null;

      let resolvedCareId: string | null = null;
      const trimmedCareCode = sg.careCodeRaw?.trim() || '';
      if (trimmedCareCode && trimmedCareCode !== '-') {
        const [existingCare] = await tdb
          .select({ id: cares.id })
          .from(cares)
          .where(eq(cares.careCode, trimmedCareCode))
          .limit(1);
        if (existingCare) {
          resolvedCareId = existingCare.id;
        } else {
          const [createdCare] = await tdb
            .insert(cares)
            .values({
              careCode: trimmedCareCode,
              careName: sg.careLabelRaw?.trim() || null,
              teamName,
              bodyId: null,
              status: 'provisional',
              sourceBatchId: batchId,
              sourceRef: sg.groupRef,
            })
            .returning();
          resolvedCareId = createdCare?.id ?? null;
        }
      }

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
      const regRawTrimmed = sg.registeredTotalRaw?.trim() ?? '';
      const registeredTotalInt =
        regRawTrimmed && /^\d+$/.test(regRawTrimmed) ? Number(regRawTrimmed) : null;

      let groupVerificationStatus:
        | 'RAW'
        | 'NORMALIZED'
        | 'PENDING_REVIEW'
        | 'CONFLICT'
        | 'INCOMPLETE' = 'RAW';
      if (sg.dataStatus === 'conflict') {
        groupVerificationStatus = 'CONFLICT';
      } else if (sg.dataStatus === 'pending_review') {
        groupVerificationStatus = 'PENDING_REVIEW';
      } else if (!sg.districtNormalized || !hasCoords || !sg.meetingDayRaw) {
        groupVerificationStatus = 'INCOMPLETE';
      } else if (sg.districtNormalized) {
        groupVerificationStatus = 'NORMALIZED';
      }

      const [createdGroup] = await tdb
        .insert(houseMissionGroups)
        .values({
          groupCode: sg.groupRef,
          bodyId: mappedBodyId,
          careId: resolvedCareId,
          teamName,
          nameTh: sg.groupNameFromSheetRaw,
          groupNameFromSheet: sg.groupNameFromSheetRaw,
          formTitle: sg.formTitleRaw,
          careCodeRaw: sg.careCodeRaw,
          registeredTotalRaw: sg.registeredTotalRaw ?? null,
          registeredTotalInt,
          district: sg.districtNormalized ?? sg.districtRaw ?? 'ไม่ระบุอำเภอ',
          districtRaw: sg.districtRaw ?? null,
          subdistrict: sg.subdistrictRaw,
          village: sg.villageRaw,
          addressSummary: sg.meetingPlaceRaw,
          latitude: confirmedLoc?.latitude ?? null,
          longitude: confirmedLoc?.longitude ?? null,
          mapUrlRaw,
          groupPhotoUrl,
          meetingDayOfWeek: sg.meetingDayRaw ? parseThaiWeekday(sg.meetingDayRaw) : null,
          meetingDayRaw: sg.meetingDayRaw ?? null,
          meetingTimeLocal: null,
          meetingTimeRaw: [sg.meetingTimeStartRaw, sg.meetingTimeEndRaw].filter(Boolean).join(' - ') || null,
          status: 'active',
          assignmentStatus: mappedBodyId ? 'assigned' : 'pending_assignment',
          locationStatus: hasCoords ? 'verified' : 'pending_location',
          verificationStatus: groupVerificationStatus,
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
          roleType: 'group_leader', // "ผู้รับผิดชอบกลุ่ม" is the Group Leader (PRD glossary)
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

      const pass1Result = await promoteStagingMembersForGroup(tdb, batchId, sg.id, createdGroup!.id);
      promotedMembersCount += pass1Result.promotedMembersCount;
      promotedGrowthRecordsCount += pass1Result.promotedGrowthRecordsCount;
      skippedIncompleteMembers += pass1Result.skippedIncompleteMembers;
    }

    // Pass 2: Re-promote newly approved / unpromoted staging members whose parent group was already promoted
    const alreadyPromotedGroups = await tdb
      .select({
        id: stagingGroups.id,
        promotedGroupId: stagingGroups.promotedGroupId,
      })
      .from(stagingGroups)
      .where(and(eq(stagingGroups.batchId, batchId), isNotNull(stagingGroups.promotedGroupId)));

    for (const promotedSg of alreadyPromotedGroups) {
      if (!promotedSg.promotedGroupId || newlyPromotedStagingGroupIds.has(promotedSg.id)) {
        continue;
      }
      const pass2Result = await promoteStagingMembersForGroup(
        tdb,
        batchId,
        promotedSg.id,
        promotedSg.promotedGroupId
      );
      promotedMembersCount += pass2Result.promotedMembersCount;
      promotedGrowthRecordsCount += pass2Result.promotedGrowthRecordsCount;
      skippedIncompleteMembers += pass2Result.skippedIncompleteMembers;
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
        promotedGrowthRecordsCount,
        skippedIncompleteMembers,
      },
    });

    return {
      batch: updatedBatch!,
      promotedGroupsCount,
      promotedMembersCount,
      promotedGrowthRecordsCount,
      skippedIncompleteMembers,
    };
  });
}

/** Counts what a rollback must not delete. Only counts and booleans leave this function. */
async function findRollbackProtection(
  tdb: FaithMapDb,
  batchId: string,
  promotedGroupIds: string[]
): Promise<{
  protected: boolean;
  verifiedMembers: number;
  membersWithHistory: number;
  linkedAssignments: number;
}> {
  const batchMembers = await tdb
    .select({ id: members.id, verificationStatus: members.verificationStatus })
    .from(members)
    .where(eq(members.sourceBatchId, batchId));
  const verifiedMembers = batchMembers.filter((m) => m.verificationStatus === 'verified').length;

  const ids = batchMembers.map((m) => m.id);
  const withHistory = new Set<string>();
  for (let i = 0; i < ids.length; i += 5000) {
    const chunk = ids.slice(i, i + 5000);
    const [att, growth, accounts, stewards] = await Promise.all([
      tdb.select({ id: attendanceRecords.memberId }).from(attendanceRecords).where(inArray(attendanceRecords.memberId, chunk)),
      // Growth rows from other batches, plus rows of this batch that a person already reviewed.
      tdb
        .select({ id: memberGrowthRecords.memberId })
        .from(memberGrowthRecords)
        .where(
          and(
            inArray(memberGrowthRecords.memberId, chunk),
            or(
              ne(memberGrowthRecords.sourceBatchId, batchId),
              notInArray(memberGrowthRecords.verificationStatus, ['RAW', 'INCOMPLETE'])
            )
          )
        ),
      tdb.select({ id: users.memberId }).from(users).where(inArray(users.memberId, chunk)),
      tdb.select({ id: assignments.stewardMemberId }).from(assignments).where(inArray(assignments.stewardMemberId, chunk)),
    ]);
    for (const r of [...att, ...growth, ...accounts, ...stewards]) if (r.id) withHistory.add(r.id);
  }

  // Memberships in groups outside this batch.
  for (let i = 0; i < ids.length; i += 5000) {
    const chunk = ids.slice(i, i + 5000);
    const rows = await tdb
      .select({ id: groupMemberships.memberId, groupId: groupMemberships.groupId })
      .from(groupMemberships)
      .where(inArray(groupMemberships.memberId, chunk));
    const own = new Set(promotedGroupIds);
    for (const r of rows) if (!own.has(r.groupId)) withHistory.add(r.id);
  }

  let linkedAssignments = 0;
  if (promotedGroupIds.length > 0) {
    const linked = await tdb
      .select({ id: assignments.id })
      .from(assignments)
      .where(and(inArray(assignments.groupId, promotedGroupIds), isNotNull(assignments.userId)));
    linkedAssignments = linked.length;
  }

  return {
    protected: verifiedMembers > 0 || withHistory.size > 0 || linkedAssignments > 0,
    verifiedMembers,
    membersWithHistory: withHistory.size,
    linkedAssignments,
  };
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

    // Data that a person or a later process now depends on must never be deleted by a rollback.
    const protection = await findRollbackProtection(tdb, batchId, promotedGroupIds);
    const mustArchive = hasDependentReports || protection.protected;

    if (mustArchive) {
      await tdb
        .update(houseMissionGroups)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(houseMissionGroups.sourceBatchId, batchId));
    } else if (promotedGroupIds.length > 0) {
      // Growth rows this batch added to members of EARLIER batches (a person approved the match).
      // Remove only rows nobody reviewed. A reviewed row is human work and stays.
      await tdb
        .delete(memberGrowthRecords)
        .where(
          and(
            eq(memberGrowthRecords.sourceBatchId, batchId),
            inArray(memberGrowthRecords.verificationStatus, ['RAW', 'INCOMPLETE'])
          )
        );
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
      metadata: {
        archivedInsteadOfDeleted: mustArchive,
        hasDependentReports,
        verifiedMembers: protection.verifiedMembers,
        membersWithHistory: protection.membersWithHistory,
        linkedAssignments: protection.linkedAssignments,
      },
    });

    return {
      batch: updatedBatch!,
      archivedInsteadOfDeleted: mustArchive,
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

  const [bodyRow] = await db.select({ id: bodies.id }).from(bodies).where(eq(bodies.id, bodyId)).limit(1);
  if (!bodyRow) {
    throw new AppError(404, 'BODY_NOT_FOUND', 'ไม่พบบอดี้ที่ระบุ');
  }

  // Only a group without a body can be assigned here. A group that already has a Body keeps it:
  // changing Body changes who can see its members, and that needs the transfer process.
  const [updated] = await db
    .update(houseMissionGroups)
    .set({
      bodyId,
      assignmentStatus: 'assigned',
      updatedAt: new Date(),
    })
    .where(and(eq(houseMissionGroups.id, groupId), isNull(houseMissionGroups.bodyId)))
    .returning();

  if (!updated) {
    const [exists] = await db
      .select({ id: houseMissionGroups.id })
      .from(houseMissionGroups)
      .where(eq(houseMissionGroups.id, groupId));
    if (!exists) throw new AppError(404, 'GROUP_NOT_FOUND', 'ไม่พบกลุ่มพันธกิจที่ระบุ');
    throw new AppError(
      409,
      'GROUP_ALREADY_ASSIGNED',
      'กลุ่มนี้มีบอดี้อยู่แล้ว การย้ายบอดี้ต้องทำผ่านขั้นตอนย้ายบอดี้'
    );
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

  const [target] = await db.select().from(assignments).where(eq(assignments.id, assignmentId));
  if (!target) {
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'ไม่พบรายการมอบหมายผู้ดูแลที่ระบุ');
  }
  if (target.effectiveTo || target.userId) {
    throw new AppError(
      409,
      'ASSIGNMENT_ALREADY_LINKED',
      'รายการนี้ผูกกับบัญชีผู้ใช้แล้วหรือสิ้นสุดแล้ว ไม่สามารถผูกซ้ำได้'
    );
  }
  const [userRow] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, userId));
  if (!userRow) {
    throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบบัญชีผู้ใช้ที่ระบุ');
  }
  if (userRow.status !== 'active' && userRow.status !== 'pending_activation') {
    throw new AppError(409, 'USER_NOT_ACTIVE', 'บัญชีผู้ใช้นี้ถูกระงับหรือยกเลิกแล้ว');
  }
  const sameScope = target.groupId
    ? eq(assignments.groupId, target.groupId)
    : target.careId
      ? eq(assignments.careId, target.careId)
      : eq(assignments.bodyId, target.bodyId!);
  const [dup] = await db
    .select({ id: assignments.id })
    .from(assignments)
    .where(and(eq(assignments.userId, userId), sameScope, isNull(assignments.effectiveTo)))
    .limit(1);
  if (dup) {
    throw new AppError(
      409,
      'USER_ALREADY_ASSIGNED',
      'บัญชีนี้มีหน้าที่ในขอบเขตเดียวกันอยู่แล้ว กรุณาตรวจสอบก่อนผูกเพิ่ม'
    );
  }

  const [updated] = await db
    .update(assignments)
    .set({
      userId,
      linkStatus: 'linked_user',
      updatedAt: new Date(),
    })
    .where(and(eq(assignments.id, assignmentId), isNull(assignments.userId)))
    .returning();

  if (!updated) {
    throw new AppError(409, 'ASSIGNMENT_ALREADY_LINKED', 'รายการนี้ถูกผูกกับบัญชีไปแล้ว');
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
