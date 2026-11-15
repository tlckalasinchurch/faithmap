import { and, asc, eq, ilike, or } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import { teamFieldPoints } from '@/server/db/schema';
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
}

export async function listTeamFieldPoints(
  db: FaithMapDb,
  actor: ActorContext,
  filters: { teamCode?: string | null; q?: string | null } = {}
): Promise<TeamFieldPointView[]> {
  // DEC-06 (owner decision Q-3): coordinator names and phones are for admins, for people of the same Body and for the
  // coordinator who is assigned to the point. A point has no Body and no coordinator account in the data yet, so no
  // non-admin can be proven to qualify. Fail closed: admins only, even for a masked phone.
  // To open it later, add a body link and a coordinator account link to `team_field_points`, then check them here.
  if (!isAdmin(actor)) {
    throw new AppError(403, 'SCOPE_FORBIDDEN', 'ข้อมูลจุดลงพื้นที่ดูได้เฉพาะผู้ดูแลระบบ จนกว่าจะกำหนดบอดี้และผู้ประสานงานของแต่ละจุด');
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

  const rows = await db
    .select()
    .from(teamFieldPoints)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(teamFieldPoints.teamCode), asc(teamFieldPoints.pointNo));

  const includeRawPhone = isAdmin(actor);
  return rows.map((r) => ({
    id: r.id,
    teamCode: r.teamCode,
    pointNo: r.pointNo,
    pointName: r.pointName,
    coordinatorName: r.coordinatorName ?? null,
    phone: includeRawPhone ? r.phoneRaw ?? null : maskPhone(r.phoneRaw ?? null),
    latitude: r.latitude,
    longitude: r.longitude,
    mapsUrl: r.mapsUrl ?? null,
    sourceSheet: r.sourceSheet,
  }));
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
