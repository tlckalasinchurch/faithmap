import { AppError } from '@/server/modules/errors';

/**
 * Per-user limit on write requests. It is held in the memory of one server instance.
 * On Vercel each instance counts on its own, so this stops a runaway client or a loop in one
 * session. It does not replace the platform firewall against a distributed attack.
 */
const WINDOW_MS = 60_000;
export const MUTATIONS_PER_WINDOW = 30;

const hits = new Map<string, { start: number; count: number }>();
let lastSweep = 0;

export function resetRateLimitsForTests(): void {
  hits.clear();
  lastSweep = 0;
}

export function rateLimitMutation(userId: string, bucket: string, now: number = Date.now()): void {
  if (now - lastSweep > WINDOW_MS) {
    for (const [k, v] of hits) if (now - v.start >= WINDOW_MS) hits.delete(k); // memory stays bounded
    lastSweep = now;
  }
  const key = `${bucket}:${userId}`;
  const entry = hits.get(key);
  if (!entry || now - entry.start >= WINDOW_MS) {
    hits.set(key, { start: now, count: 1 });
    return;
  }
  entry.count += 1;
  if (entry.count > MUTATIONS_PER_WINDOW) {
    throw new AppError(429, 'RATE_LIMITED', 'ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่');
  }
}
