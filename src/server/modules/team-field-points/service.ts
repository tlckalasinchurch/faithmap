import { and, asc, eq, ilike, or } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import { bodies, teamFieldPoints, users } from '@/server/db/schema';
import { KALASIN_TEAM_G_POINTS } from '@/lib/kalasin-field-points';
import { recordSecurityAudit } from '../audit/service';
import { isAdmin } from '../authz/policy';
import { AppError } from '../errors';
import type { ActorContext } from '../identity/service';

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

  const isOwnBody = (bodyId: string | null) => Boolean(bodyId && actor.bodyLeaderBodyIds.has(bodyId));
  const isAssigned = (userId: string | null) => Boolean(userId && userId === actor.user.id);
  const rows = admin ? all : all.filter((r) => isOwnBody(r.bodyId) || isAssigned(r.coordinatorUserId));

  if (!admin && rows.length === 0 && actor.bodyLeaderBodyIds.size === 0) {
    throw new AppError(403, 'SCOPE_FORBIDDEN', 'คุณไม่มีสิทธิ์ดูข้อมูลจุดลงพื้นที่');
  }

  return rows.map((r) => ({
    id: r.id,
    teamCode: r.teamCode,
    pointNo: r.pointNo,
    pointName: r.pointName,
    coordinatorName: r.coordinatorName ?? null,
    phone: admin || isAssigned(r.coordinatorUserId) ? r.phoneRaw ?? null : maskPhone(r.phoneRaw ?? null),
    latitude: r.latitude,
    longitude: r.longitude,
    mapsUrl: r.mapsUrl ?? null,
    sourceSheet: r.sourceSheet,
    bodyId: admin ? r.bodyId ?? null : null,
    coordinatorUserId: admin ? r.coordinatorUserId ?? null : null,
  }));
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
    const [user] = await db.select().from(users).where(eq(users.id, input.coordinatorUserId));
    if (!user || user.status !== 'active') {
      throw new AppError(400, 'COORDINATOR_INVALID', 'ไม่พบบัญชีผู้ประสานงานที่ใช้งานอยู่');
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
