/**
 * LINE may return the same ID token right after sign-in. The client then signs out of LIFF and in again
 * once. This guard stops a second automatic round within 5 minutes, so a stubborn token cannot cause a
 * redirect loop. Without storage the retry is refused (the safe choice).
 */
export interface MiniStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const KEY = 'faithmap_line_replay_retry_at';
const WINDOW_MS = 5 * 60_000;

export function createReplayGuard(storage: MiniStorage | null, now: () => number = Date.now) {
  return {
    mayRetry(): boolean {
      if (!storage) return false;
      try {
        const last = Number(storage.getItem(KEY) ?? 0);
        return !(last > 0 && now() - last < WINDOW_MS);
      } catch {
        return false;
      }
    },
    markRetried(): void {
      try {
        storage?.setItem(KEY, String(now()));
      } catch {
        /* storage blocked: mayRetry() then refuses */
      }
    },
  };
}
