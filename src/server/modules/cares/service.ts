import { and, asc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import {
  assignments,
  bodies,
  cares,
  houseMissionGroups,
  members,
  users,
} from '@/server/db/schema';
import { recordSecurityAudit } from '../audit/service';
import {
  assertCanManageBodyScope,
  isAdmin,
  isGlobalMetricsReader,
} from '../authz/policy';
import { AppError } from '../errors';
import type { ActorContext } from '../identity/service';

export type CareStatus = 'provisional' | 'active' | 'pending_assignment' | 'inactive' | 'archived';

export interface CareStewardSummary {
  assignmentId: string;
  userId: string | null;
  stewardMemberId: string | null;
  stewardDisplayName: string;
  linkStatus: 'linked_user' | 'unlinked_pending_account';
  roleType: 'care_leader' | 'other_authorized';
  isPrimary: boolean;
}

export interface CareRegistryItem {
  id: string;
  careCode: string;
  careName: string | null;
  teamName: string | null;
  bodyId: string | null;
  bodyName: string | null;
  status: CareStatus;
  sourceRef: string | null;
  notes: string | null;
  groupCount: number;
  stewards: CareStewardSummary[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ListCaresFilters {
  bodyId?: string | null;
  status?: CareStatus | null;
  unassignedOnly?: boolean;
  q?: string | null;
}

export async function listCares(
  db: FaithMapDb,
  actor: ActorContext,
  filters: ListCaresFilters = {}
): Promise<CareRegistryItem[]> {
  const conditions = [];

  if (!isGlobalMetricsReader(actor)) {
    const bodyScopeIds = Array.from(actor.bodyLeaderBodyIds);
    const careScopeIds = Array.from(actor.assignedCareIds);
    if (bodyScopeIds.length === 0 && careScopeIds.length === 0) {
      return [];
    }
    if (bodyScopeIds.length > 0 && careScopeIds.length > 0) {
      conditions.push(or(inArray(cares.bodyId, bodyScopeIds), inArray(cares.id, careScopeIds)));
    } else if (bodyScopeIds.length > 0) {
      conditions.push(inArray(cares.bodyId, bodyScopeIds));
    } else {
      conditions.push(inArray(cares.id, careScopeIds));
    }
  }

  if (filters.unassignedOnly) {
    conditions.push(isNull(cares.bodyId));
  } else if (filters.bodyId) {
    conditions.push(eq(cares.bodyId, filters.bodyId));
  }

  if (filters.status) {
    conditions.push(eq(cares.status, filters.status));
  }

  const q = filters.q?.trim();
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(ilike(cares.careCode, pattern), ilike(cares.careName, pattern), ilike(cares.teamName, pattern))
    );
  }

  const careRows = await db
    .select()
    .from(cares)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(cares.careCode));

  if (careRows.length === 0) return [];

  const careIds = careRows.map((c) => c.id);
  const bodyIds = Array.from(new Set(careRows.map((c) => c.bodyId).filter((x): x is string => Boolean(x))));

  const bodyNameMap = new Map<string, string>();
  if (bodyIds.length > 0) {
    const bodyRows = await db
      .select({ id: bodies.id, nameTh: bodies.nameTh })
      .from(bodies)
      .where(inArray(bodies.id, bodyIds));
    for (const b of bodyRows) bodyNameMap.set(b.id, b.nameTh);
  }

  const groupCountRows = await db
    .select({
      careId: houseMissionGroups.careId,
      count: sql<number>`count(*)::int`,
    })
    .from(houseMissionGroups)
    .where(inArray(houseMissionGroups.careId, careIds))
    .groupBy(houseMissionGroups.careId);

  const groupCountMap = new Map<string, number>();
  for (const row of groupCountRows) {
    if (row.careId) groupCountMap.set(row.careId, Number(row.count));
  }

  const stewardRows = await db
    .select({
      assignmentId: assignments.id,
      careId: assignments.careId,
      userId: assignments.userId,
      stewardMemberId: assignments.stewardMemberId,
      stewardDisplayName: assignments.stewardDisplayName,
      userDisplayName: users.displayName,
      linkStatus: assignments.linkStatus,
      roleType: assignments.roleType,
      isPrimary: assignments.isPrimary,
    })
    .from(assignments)
    .leftJoin(users, eq(assignments.userId, users.id))
    .where(
      and(
        eq(assignments.scopeType, 'care'),
        inArray(assignments.careId, careIds),
        isNull(assignments.effectiveTo)
      )
    );

  const stewardMap = new Map<string, CareStewardSummary[]>();
  for (const s of stewardRows) {
    if (!s.careId) continue;
    const list = stewardMap.get(s.careId) ?? [];
    list.push({
      assignmentId: s.assignmentId,
      userId: s.userId ?? null,
      stewardMemberId: s.stewardMemberId ?? null,
      stewardDisplayName: s.userDisplayName ?? s.stewardDisplayName ?? 'รอระบุผู้ดูแล',
      linkStatus: s.linkStatus as 'linked_user' | 'unlinked_pending_account',
      roleType: s.roleType as 'care_leader' | 'other_authorized',
      isPrimary: s.isPrimary,
    });
    stewardMap.set(s.careId, list);
  }

  return careRows.map((c) => ({
    id: c.id,
    careCode: c.careCode,
    careName: c.careName ?? null,
    teamName: c.teamName ?? null,
    bodyId: c.bodyId ?? null,
    bodyName: c.bodyId ? bodyNameMap.get(c.bodyId) ?? null : null,
    status: c.status as CareStatus,
    sourceRef: c.sourceRef ?? null,
    notes: c.notes ?? null,
    groupCount: groupCountMap.get(c.id) ?? 0,
    stewards: stewardMap.get(c.id) ?? [],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

export async function createProvisionalCare(
  db: FaithMapDb,
  actor: ActorContext,
  input: {
    careCode: string;
    careName?: string | null;
    teamName?: string | null;
    bodyId?: string | null;
    status?: CareStatus;
    notes?: string | null;
  }
) {
  const careCode = input.careCode.trim();
  const bodyId = input.bodyId ?? null;

  if (bodyId) {
    assertCanManageBodyScope(actor, bodyId);
    const [bodyRow] = await db.select({ id: bodies.id }).from(bodies).where(eq(bodies.id, bodyId)).limit(1);
    if (!bodyRow) {
      throw new AppError(404, 'BODY_NOT_FOUND', 'ไม่พบบอดี้ที่ระบุ');
    }
  } else if (!isAdmin(actor)) {
    throw new AppError(
      403,
      'ADMIN_REQUIRED',
      'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถสร้างแคร์ที่ยังไม่ผูกบอดี้ได้'
    );
  }

  const [existing] = await db
    .select({ id: cares.id })
    .from(cares)
    .where(eq(cares.careCode, careCode))
    .limit(1);
  if (existing) {
    throw new AppError(409, 'CARE_CODE_EXISTS', `มีรหัสแคร์ "${careCode}" อยู่ในระบบแล้ว`);
  }

  const [created] = await db
    .insert(cares)
    .values({
      careCode,
      careName: input.careName?.trim() || null,
      teamName: input.teamName?.trim() || null,
      bodyId,
      status: input.status ?? 'provisional',
      notes: input.notes?.trim() || null,
    })
    .returning();

  if (!created) {
    throw new AppError(500, 'CARE_CREATE_FAILED', 'ไม่สามารถบันทึกข้อมูลแคร์ได้');
  }

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'CARE_CREATED',
    targetType: 'care',
    targetId: created.id,
    metadata: {
      careCode: created.careCode,
      bodyId: created.bodyId,
      status: created.status,
    },
  });

  return created;
}

export async function assignCareToBody(
  db: FaithMapDb,
  actor: ActorContext,
  input: {
    careId: string;
    bodyId: string | null;
    status?: CareStatus;
    reason: string;
  }
) {
  if (!isAdmin(actor)) {
    throw new AppError(
      403,
      'ADMIN_REQUIRED',
      'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถผูกหรือย้ายสังกัดบอดี้ของแคร์ได้'
    );
  }

  const [careRow] = await db.select().from(cares).where(eq(cares.id, input.careId)).limit(1);
  if (!careRow) {
    throw new AppError(404, 'CARE_NOT_FOUND', 'ไม่พบข้อมูลแคร์');
  }

  if (input.bodyId) {
    const [bodyRow] = await db
      .select({ id: bodies.id })
      .from(bodies)
      .where(eq(bodies.id, input.bodyId))
      .limit(1);
    if (!bodyRow) {
      throw new AppError(404, 'BODY_NOT_FOUND', 'ไม่พบบอดี้ที่ระบุ');
    }
  }

  const [updated] = await db
    .update(cares)
    .set({
      bodyId: input.bodyId,
      status: input.status ?? careRow.status,
      updatedAt: new Date(),
    })
    .where(eq(cares.id, careRow.id))
    .returning();

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'CARE_BODY_MAPPED',
    targetType: 'care',
    targetId: careRow.id,
    reason: input.reason.trim(),
    metadata: {
      careCode: careRow.careCode,
      fromBodyId: careRow.bodyId,
      toBodyId: input.bodyId,
    },
  });

  return updated;
}

export async function assignCareSteward(
  db: FaithMapDb,
  actor: ActorContext,
  input: {
    careId: string;
    userId?: string | null;
    stewardMemberId?: string | null;
    stewardDisplayName?: string | null;
    sourceRoleLabel?: string | null;
    roleType: 'care_leader' | 'other_authorized';
    isPrimary?: boolean;
  }
) {
  const [careRow] = await db.select().from(cares).where(eq(cares.id, input.careId)).limit(1);
  if (!careRow) {
    throw new AppError(404, 'CARE_NOT_FOUND', 'ไม่พบข้อมูลแคร์');
  }

  assertCanManageBodyScope(actor, careRow.bodyId);

  const userId = input.userId ?? null;
  const stewardMemberId = input.stewardMemberId ?? null;
  const stewardDisplayName = input.stewardDisplayName?.trim() || null;

  if (!userId && !stewardMemberId && !stewardDisplayName) {
    throw new AppError(
      400,
      'STEWARD_IDENTITY_REQUIRED',
      'ต้องระบุผู้ใช้ สมาชิก หรือชื่อผู้ดูแลอย่างน้อย 1 อย่าง'
    );
  }

  if (userId) {
    const [userRow] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!userRow) {
      throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบบัญชีผู้ใช้ที่ระบุ');
    }
  }

  if (stewardMemberId) {
    const [memberRow] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.id, stewardMemberId))
      .limit(1);
    if (!memberRow) {
      throw new AppError(404, 'MEMBER_NOT_FOUND', 'ไม่พบข้อมูลสมาชิกที่ระบุ');
    }
  }

  const now = new Date();
  const isPrimary = input.isPrimary ?? true;

  if (isPrimary) {
    await db
      .update(assignments)
      .set({
        effectiveTo: now,
        revokedByUserId: actor.user.id,
        revokedReason: 'เปลี่ยนผู้รับผิดชอบหลักของแคร์',
        updatedAt: now,
      })
      .where(
        and(
          eq(assignments.scopeType, 'care'),
          eq(assignments.careId, careRow.id),
          eq(assignments.roleType, input.roleType),
          eq(assignments.isPrimary, true),
          isNull(assignments.effectiveTo)
        )
      );
  }

  const linkStatus = userId ? 'linked_user' : 'unlinked_pending_account';

  const [created] = await db
    .insert(assignments)
    .values({
      userId,
      stewardMemberId,
      stewardDisplayName,
      linkStatus,
      sourceRoleLabel: input.sourceRoleLabel?.trim() || null,
      scopeType: 'care',
      bodyId: null,
      careId: careRow.id,
      groupId: null,
      roleType: input.roleType,
      isPrimary,
      effectiveFrom: now,
      assignedByUserId: actor.user.id,
    })
    .returning();

  if (!created) {
    throw new AppError(500, 'ASSIGNMENT_CREATE_FAILED', 'ไม่สามารถบันทึกการมอบหมายแคร์ได้');
  }

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'CARE_STEWARD_ASSIGNED',
    targetType: 'assignment',
    targetId: created.id,
    metadata: {
      careId: careRow.id,
      careCode: careRow.careCode,
      roleType: input.roleType,
      linkStatus,
      userId,
    },
  });

  return created;
}

export async function revokeCareAssignment(
  db: FaithMapDb,
  actor: ActorContext,
  assignmentId: string,
  reason: string
) {
  const [row] = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.id, assignmentId), eq(assignments.scopeType, 'care')))
    .limit(1);

  if (!row || !row.careId) {
    throw new AppError(404, 'ASSIGNMENT_NOT_FOUND', 'ไม่พบการมอบหมายหน้าที่ระดับแคร์');
  }

  const [careRow] = await db.select().from(cares).where(eq(cares.id, row.careId)).limit(1);
  assertCanManageBodyScope(actor, careRow?.bodyId ?? null);

  if (row.effectiveTo) {
    return row;
  }

  const now = new Date();
  const [updated] = await db
    .update(assignments)
    .set({
      effectiveTo: now,
      revokedByUserId: actor.user.id,
      revokedReason: reason.trim(),
      updatedAt: now,
    })
    .where(eq(assignments.id, row.id))
    .returning();

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'CARE_STEWARD_REVOKED',
    targetType: 'assignment',
    targetId: row.id,
    reason: reason.trim(),
    metadata: {
      careId: row.careId,
      roleType: row.roleType,
    },
  });

  return updated;
}
