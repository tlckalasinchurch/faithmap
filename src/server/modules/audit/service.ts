import { and, desc, eq, gt } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import {
  idempotencyKeys,
  reportAuditEvents,
  securityAuditLogs,
} from '@/server/db/schema';
import { AppError } from '../errors';
import { hashRequestPayload } from '../identity/crypto';

export async function recordSecurityAudit(
  db: FaithMapDb,
  input: {
    actorUserId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    ipAddress?: string | null;
    outcome?: 'success' | 'denied' | 'error';
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await db.insert(securityAuditLogs).values({
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    ipAddress: input.ipAddress ?? null,
    outcome: input.outcome ?? 'success',
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function recordReportAudit(
  db: FaithMapDb,
  input: {
    weeklyReportId: string;
    periodId: string;
    groupId: string;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    actorUserId?: string | null;
    actorRole?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await db.insert(reportAuditEvents).values({
    weeklyReportId: input.weeklyReportId,
    periodId: input.periodId,
    groupId: input.groupId,
    eventType: input.eventType,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function listSecurityAuditLogs(db: FaithMapDb, limit = 100) {
  return db
    .select()
    .from(securityAuditLogs)
    .orderBy(desc(securityAuditLogs.createdAt))
    .limit(limit);
}

export async function runWithIdempotency<T>(
  db: FaithMapDb,
  scopeKey: string,
  idempotencyKey: string | null,
  payload: unknown,
  handler: () => Promise<{ status: number; body: T }>
): Promise<{ status: number; body: T; replayed: boolean }> {
  if (!idempotencyKey) {
    const res = await handler();
    return { ...res, replayed: false };
  }

  const reqHash = hashRequestPayload(payload);
  const now = new Date();
  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.scopeKey, scopeKey),
        eq(idempotencyKeys.idempotencyKey, idempotencyKey),
        gt(idempotencyKeys.expiresAt, now)
      )
    );

  if (existing) {
    if (existing.requestHash !== reqHash) {
      throw new AppError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key นี้ถูกใช้งานไปแล้วด้วยข้อมูลที่แตกต่างกัน'
      );
    }
    return {
      status: existing.responseStatus,
      body: existing.responseBody as T,
      replayed: true,
    };
  }

  const result = await handler();
  const expiresAt = new Date(now.getTime() + 24 * 3_600_000);

  await db
    .insert(idempotencyKeys)
    .values({
      scopeKey,
      idempotencyKey,
      requestHash: reqHash,
      responseStatus: result.status,
      responseBody: result.body,
      expiresAt,
    })
    .onConflictDoNothing();

  return { ...result, replayed: false };
}
