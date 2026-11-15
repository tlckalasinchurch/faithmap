import { and, asc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import { assignments, bodies, cares, houseMissionGroups, teamFieldPoints, users } from '@/server/db/schema';
import { KALASIN_TEAM_G_POINTS } from '@/lib/kalasin-field-points';
import { recordSecurityAudit } from '../audit/service';
import { isAdmin } from '../authz/policy';
import { AppError } from '../errors';
import { isUsableAccount, type ActorContext } from '../identity/service';

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***-***-${digits.slice(-4)}`;
}

export interface TeamFieldPointView {
  id: string;
  teamCode: string;
  pointNo: number;
  pointName: string;
  coordinatorName: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
  mapsUrl: string | null;
  sourceSheet: string;
  /** Mapping fields. Only admins read the ids. Other roles get null. */
  bodyId: string | null;
  coordinatorUserId: string | null;
  /** Admin only. Names for the assignment screen. */
  bodyName: string | null;
  coordinatorAccountName: string | null;
  coordinatorAccountStatus: string | null;
  /** Admin only. True when the linked account can still read the point (active and has an assignment in the Body). */
  coordinatorEligible: boolean | null;
}

/**
 * Body ids in which the user holds an active leadership assignment (direct, through a care, or through a group).
 * A coordinator account can read a point only while this holds for the point's Body.
 */
export async function bodiesWithActiveAssignment(db: FaithMapDb, userId: string): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.userId, userId), isNull(assignments.effectiveTo)));
  const result = new Set<string>();
  const careIds: string[] = [];
  const groupIds: string[] = [];
  for (const a of rows) {
    if (a.bodyId) result.add(a.bodyId);
    if (a.careId) careIds.push(a.careId);
    if (a.groupId) groupIds.push(a.groupId);
  }
  if (careIds.length > 0) {
    for (const c of await db.select({ bodyId: cares.bodyId }).from(cares).where(inArray(cares.id, careIds))) {
      if (c.bodyId) result.add(c.bodyId);
    }
  }
  if (groupIds.length > 0) {
    for (const g of await db
      .select({ bodyId: houseMissionGroups.bodyId })
      .from(houseMissionGroups)
      .where(inArray(houseMissionGroups.id, groupIds))) {
      if (g.bodyId) result.add(g.bodyId);
    }
  }
  return result;
}

/**
 * DEC-17 (owner decision Q-3 and Q-8). Who reads a field point:
 * - Admin: every point, the raw phone, and the mapping.
 * - Body Leader: only points whose `body_id` is a Body that the person leads. The phone is masked.
 * - Assigned coordinator: only points whose `coordinator_user_id` is the person. The phone is not masked.
 * - Everyone else, a pastor too: nothing.
 *
 * A point with `body_id` NULL or `coordinator_user_id` NULL matches nobody. Old rows start with both NULL,
 * so after migration 0004 only admins read them until an admin maps them.
 * The data mapping gate: no non-admin reads any point while one point still has `body_id` NULL.
 * The system never guesses a link from a name or a phone number.
 */
export async function getFieldPointMappingStatus(db: FaithMapDb) {
  const rows = await db.select({ id: teamFieldPoints.id, bodyId: teamFieldPoints.bodyId }).from(teamFieldPoints);
  const unmapped = rows.filter((r) => !r.bodyId).length;
  return { total: rows.length, unmapped, complete: rows.length > 0 && unmapped === 0 };
}

export async function listTeamFieldPoints(
  db: FaithMapDb,
  actor: ActorContext,
  filters: { teamCode?: string | null; q?: string | null } = {}
): Promise<TeamFieldPointView[]> {
  const admin = isAdmin(actor);
  if (!admin) {
    const status = await getFieldPointMappingStatus(db);
    if (!status.complete) {
      throw new AppError(
        403,
        'SCOPE_FORBIDDEN',
        'ข้อมูลจุดลงพื้นที่ดูได้เฉพาะผู้ดูแลระบบ จนกว่าจะกำหนดบอดี้ของทุกจุดเสร็จ'
      );
    }
  }
  const conditions = [];
  if (filters.teamCode?.trim()) {
    conditions.push(eq(teamFieldPoints.teamCode, filters.teamCode.trim()));
  }
  const q = filters.q?.trim();
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(ilike(teamFieldPoints.pointName, pattern), ilike(teamFieldPoints.coordinatorName, pattern))
    );
  }

  const all = await db
    .select()
    .from(teamFieldPoints)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(teamFieldPoints.teamCode), asc(teamFieldPoints.pointNo));

  // Read-time checks. A Body Leader reads only the points of an active Body. A coordinator reads a point only while the
  // account still holds an active assignment in the point's Body. A revoked steward loses access without any admin action.
  const activeBodies = new Map(
    (await db.select({ id: bodies.id, nameTh: bodies.nameTh, status: bodies.status }).from(bodies)).map((b) => [b.id, b])
  );
  const isOwnBody = (bodyId: string | null) =>
    Boolean(bodyId && actor.bodyLeaderBodyIds.has(bodyId) && activeBodies.get(bodyId)?.status === 'active');
  const myBodies = admin ? new Set<string>() : await bodiesWithActiveAssignment(db, actor.user.id);
  const isAssigned = (userId: string | null, bodyId: string | null) =>
    Boolean(userId && userId === actor.user.id && bodyId && myBodies.has(bodyId) && activeBodies.get(bodyId)?.status === 'active');
  const rows = admin ? all : all.filter((r) => isOwnBody(r.bodyId) || isAssigned(r.coordinatorUserId, r.bodyId));

  if (!admin && rows.length === 0 && actor.bodyLeaderBodyIds.size === 0) {
    throw new AppError(403, 'SCOPE_FORBIDDEN', 'คุณไม่มีสิทธิ์ดูข้อมูลจุดลงพื้นที่');
  }

  const accountIds = admin ? [...new Set(all.map((r) => r.coordinatorUserId).filter((x): x is string => Boolean(x)))] : [];
  const accounts = new Map(
    accountIds.length > 0
      ? (await db.select().from(users).where(inArray(users.id, accountIds))).map((u) => [u.id, u])
      : []
  );
  const eligibility = new Map<string, Set<string>>();
  for (const id of accountIds) eligibility.set(id, await bodiesWithActiveAssignment(db, id));

  return rows.map((r) => {
    const account = r.coordinatorUserId ? accounts.get(r.coordinatorUserId) : undefined;
    return {
      id: r.id,
      teamCode: r.teamCode,
      pointNo: r.pointNo,
      pointName: r.pointName,
      coordinatorName: r.coordinatorName ?? null,
      phone: admin || isAssigned(r.coordinatorUserId, r.bodyId) ? r.phoneRaw ?? null : maskPhone(r.phoneRaw ?? null),
      latitude: r.latitude,
      longitude: r.longitude,
      mapsUrl: r.mapsUrl ?? null,
      sourceSheet: r.sourceSheet,
      bodyId: admin ? r.bodyId ?? null : null,
      coordinatorUserId: admin ? r.coordinatorUserId ?? null : null,
      bodyName: admin && r.bodyId ? activeBodies.get(r.bodyId)?.nameTh ?? null : null,
      coordinatorAccountName: admin ? account?.displayName ?? null : null,
      coordinatorAccountStatus: admin ? account?.status ?? null : null,
      coordinatorEligible:
        admin && r.coordinatorUserId
          ? Boolean(account && account.status === 'active' && r.bodyId && eligibility.get(account.id)?.has(r.bodyId))
          : null,
    };
  });
}

/**
 * Admin Assignment Workflow (Q-8). An admin links one point to one Body and, if known, to one coordinator account.
 * Pass `null` to clear a link. The function checks that the Body is active and the user is active.
 * It writes a security audit record with ids only (no names, no phone numbers).
 */
export async function assignTeamFieldPoint(
  db: FaithMapDb,
  actor: ActorContext,
  input: { pointId: string; bodyId: string | null; coordinatorUserId: string | null }
): Promise<{ pointId: string; bodyId: string | null; coordinatorUserId: string | null }> {
  if (!isAdmin(actor)) {
    throw new AppError(403, 'ADMIN_REQUIRED', 'เฉพาะผู้ดูแลระบบเท่านั้นที่กำหนดบอดี้และผู้ประสานงานของจุดลงพื้นที่ได้');
  }
  const [point] = await db.select().from(teamFieldPoints).where(eq(teamFieldPoints.id, input.pointId));
  if (!point) throw new AppError(404, 'POINT_NOT_FOUND', 'ไม่พบจุดลงพื้นที่');

  if (input.bodyId) {
    const [body] = await db.select().from(bodies).where(eq(bodies.id, input.bodyId));
    if (!body || body.status !== 'active') {
      throw new AppError(400, 'BODY_INVALID', 'ไม่พบบอดี้ที่ใช้งานอยู่');
    }
  }
  if (input.coordinatorUserId) {
    // A coordinator link needs a Body, because the account reads the point only inside that Body.
    if (!input.bodyId) {
      throw new AppError(400, 'COORDINATOR_NEEDS_BODY', 'ต้องเลือกบอดี้ก่อนกำหนดผู้ประสานงาน');
    }
    const [user] = await db.select().from(users).where(eq(users.id, input.coordinatorUserId));
    if (!user || !(await isUsableAccount(db, user))) {
      throw new AppError(400, 'COORDINATOR_INVALID', 'ไม่พบบัญชีผู้ประสานงานที่ใช้งานอยู่');
    }
    const inBody = await bodiesWithActiveAssignment(db, user.id);
    if (!inBody.has(input.bodyId)) {
      throw new AppError(
        400,
        'COORDINATOR_OUT_OF_SCOPE',
        'ผู้ประสานงานต้องมีหน้าที่ที่ใช้งานอยู่ในบอดี้เดียวกับจุดนี้'
      );
    }
  }

  const now = new Date();
  await db
    .update(teamFieldPoints)
    .set({
      bodyId: input.bodyId,
      coordinatorUserId: input.coordinatorUserId,
      assignedByUserId: actor.user.id,
      assignedAt: now,
      updatedAt: now,
    })
    .where(eq(teamFieldPoints.id, input.pointId));

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'TEAM_FIELD_POINT_ASSIGNED',
    targetType: 'team_field_point',
    targetId: input.pointId,
    metadata: {
      previousBodyId: point.bodyId ?? null,
      bodyId: input.bodyId,
      previousCoordinatorUserId: point.coordinatorUserId ?? null,
      coordinatorUserId: input.coordinatorUserId,
    },
  });
  return { pointId: input.pointId, bodyId: input.bodyId, coordinatorUserId: input.coordinatorUserId };
}

export async function syncTeamGFieldPoints(
  db: FaithMapDb,
  actor: ActorContext
): Promise<{ syncedCount: number }> {
  if (!isAdmin(actor)) {
    throw new AppError(
      403,
      'ADMIN_REQUIRED',
      'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถซิงค์พิกัดจุดลงพื้นที่ทีม G ได้'
    );
  }

  const now = new Date();
  for (const pt of KALASIN_TEAM_G_POINTS) {
    await db
      .insert(teamFieldPoints)
      .values({
        teamCode: pt.team,
        pointNo: pt.no,
        pointName: pt.name,
        coordinatorName: pt.coordinator,
        phoneRaw: pt.phone,
        latitude: pt.latitude,
        longitude: pt.longitude,
        mapsUrl: pt.mapsUrl,
        sourceSheet: 'kalasin-field-points',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [teamFieldPoints.teamCode, teamFieldPoints.pointNo],
        set: {
          pointName: pt.name,
          coordinatorName: pt.coordinator,
          phoneRaw: pt.phone,
          latitude: pt.latitude,
          longitude: pt.longitude,
          mapsUrl: pt.mapsUrl,
          updatedAt: now,
        },
      });
  }

  await recordSecurityAudit(db, {
    actorUserId: actor.user.id,
    action: 'TEAM_FIELD_POINTS_SYNCED',
    targetType: 'team_field_points',
    metadata: {
      teamCode: 'G',
      syncedCount: KALASIN_TEAM_G_POINTS.length,
    },
  });

  return { syncedCount: KALASIN_TEAM_G_POINTS.length };
}
