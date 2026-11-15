import { inArray, lt } from 'drizzle-orm';
import type { FaithMapDb } from '@/server/db/client';
import { authChallenges, usedIdTokens } from '@/server/db/schema';

/** A challenge row is kept this long after it expires. */
export const CHALLENGE_RETENTION_MS = 60 * 60_000;
/**
 * A used ID token row is kept this long after the token expires. LINE ID tokens live 1 hour and the
 * verifier already refuses an expired token. The margin covers clock differences, so cleanup never
 * opens a replay window.
 */
export const USED_TOKEN_RETENTION_MS = 10 * 60_000;
export const PURGE_DEFAULT_LIMIT = 1000;

export interface PurgeResult {
  challengesDeleted: number;
  usedTokensDeleted: number;
  /** True when the limit was reached, so another call may find more rows. */
  more: boolean;
}

/**
 * Deletes expired sign-in challenges and used-token records, at most `limit` rows per table per call.
 * It never touches audit logs, users, sessions or registration requests.
 */
export async function purgeExpiredAuthData(
  db: FaithMapDb,
  now: Date = new Date(),
  options: { limit?: number } = {}
): Promise<PurgeResult> {
  const limit = Math.max(1, Math.min(options.limit ?? PURGE_DEFAULT_LIMIT, 10_000));

  const oldChallenges = await db
    .select({ id: authChallenges.id })
    .from(authChallenges)
    .where(lt(authChallenges.expiresAt, new Date(now.getTime() - CHALLENGE_RETENTION_MS)))
    .limit(limit);
  if (oldChallenges.length > 0) {
    await db.delete(authChallenges).where(inArray(authChallenges.id, oldChallenges.map((r) => r.id)));
  }

  const oldTokens = await db
    .select({ tokenHash: usedIdTokens.tokenHash })
    .from(usedIdTokens)
    .where(lt(usedIdTokens.expiresAt, new Date(now.getTime() - USED_TOKEN_RETENTION_MS)))
    .limit(limit);
  if (oldTokens.length > 0) {
    await db.delete(usedIdTokens).where(inArray(usedIdTokens.tokenHash, oldTokens.map((r) => r.tokenHash)));
  }

  return {
    challengesDeleted: oldChallenges.length,
    usedTokensDeleted: oldTokens.length,
    more: oldChallenges.length === limit || oldTokens.length === limit,
  };
}
