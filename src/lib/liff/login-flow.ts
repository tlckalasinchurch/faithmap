import { ApiClientError } from '@/lib/api-client';
import type { ActorPayload } from '@/lib/types';

/**
 * True for a signed-in account that has no role yet, for example a LINE registration that a
 * super admin approved (approval creates a standard_user with no assignments by design).
 * Such a user should see a "waiting for a group" screen, not an empty app or the sign-in screen.
 */
export function needsRoleAssignment(actor: Pick<ActorPayload, 'user' | 'assignments'> | null | undefined): boolean {
  if (!actor) return false;
  return actor.user.systemRole === 'standard_user' && actor.assignments.length === 0;
}

/** Server code for a verified LINE account that is not linked to any FaithMap user. */
export const LINE_IDENTITY_UNLINKED = 'LINE_IDENTITY_UNLINKED';

/** True when the server says this LINE account is not linked yet. Uses the error code, never the message text. */
export function isLineUnlinkedError(err: unknown): boolean {
  return err instanceof ApiClientError && err.code === LINE_IDENTITY_UNLINKED;
}

/**
 * Runs a task at most once per guard, even if React runs the effect again
 * (new props, Strict Mode). A second LINE sign-in with the same ID token is refused
 * by the server as a replay, and the client would then sign out and redirect again.
 */
export function createOnceGuard() {
  let started = false;
  return {
    get started() {
      return started;
    },
    run<T>(task: () => Promise<T>): Promise<T> | null {
      if (started) return null;
      started = true;
      return task();
    },
  };
}
