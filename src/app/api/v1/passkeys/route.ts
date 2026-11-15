import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody } from '@/server/http/body';
import { z } from 'zod';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getReadyDb } from '@/server/db/bootstrap';
import { userPasskeys } from '@/server/db/schema';
import {
  assertSameOrigin,
  getRequestMeta,
  handleRouteError,
  requireAuth,
  setSessionCookies,
} from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import {
  beginPasskeyLogin,
  beginPasskeyRegistration,
  finishPasskeyLogin,
  finishPasskeyRegistration,
  revokePasskey,
} from '@/server/modules/identity/passkeys';

export const dynamic = 'force-dynamic';

// The WebAuthn response objects are verified by the server library. Here we only check their shape.
const webauthnResponse = z.object({ id: z.string().min(1).max(512), response: z.record(z.string(), z.unknown()) }).passthrough();

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('register_options') }),
  z.object({
    action: z.literal('register_verify'),
    challengeId: z.string().uuid(),
    deviceLabel: z.string().max(80).default(''),
    response: webauthnResponse,
  }),
  z.object({ action: z.literal('login_options') }),
  z.object({ action: z.literal('login_verify'), challengeId: z.string().uuid(), response: webauthnResponse }),
  z.object({ action: z.literal('revoke'), passkeyId: z.string().uuid() }),
]);

/** Lists the signed-in user's own passkeys. Public keys are not returned. */
export async function GET(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const rows = await db
      .select({
        id: userPasskeys.id,
        deviceLabel: userPasskeys.deviceLabel,
        createdAt: userPasskeys.createdAt,
        lastUsedAt: userPasskeys.lastUsedAt,
      })
      .from(userPasskeys)
      .where(and(eq(userPasskeys.userId, actor.user.id), isNull(userPasskeys.revokedAt)))
      .orderBy(desc(userPasskeys.createdAt));
    return NextResponse.json({ passkeys: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const parsed = actionSchema.safeParse(await readJsonBody(req).catch((e) => { if (e instanceof AppError && e.status === 413) throw e; return null; }));
    if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลคำขอไม่ถูกต้อง');
    const data = parsed.data;
    const meta = getRequestMeta(req);

    if (data.action === 'login_options') {
      const db = await getReadyDb();
      const { challengeId, options } = await beginPasskeyLogin(db, undefined, meta.ipAddress);
      return NextResponse.json({ challengeId, options });
    }

    if (data.action === 'login_verify') {
      const db = await getReadyDb();
      const result = await finishPasskeyLogin(
        db,
        { challengeId: data.challengeId, response: data.response as never },
        undefined,
        meta
      );
      const res = NextResponse.json({
        ok: true,
        authenticated: true,
        csrfToken: result.csrfToken,
        actor: {
          user: result.actor.user,
          assignments: result.actor.assignments,
          bodyLeaderBodyIds: Array.from(result.actor.bodyLeaderBodyIds),
          groupLeaderGroupIds: Array.from(result.actor.groupLeaderGroupIds),
          supervisorGroupIds: Array.from(result.actor.supervisorGroupIds),
        },
      });
      setSessionCookies(res, req, result.sessionToken, result.csrfToken);
      return res;
    }

    const { db, actor } = await requireAuth(req);
    if (data.action === 'register_options') {
      const { challengeId, options } = await beginPasskeyRegistration(db, actor, undefined, meta.ipAddress);
      return NextResponse.json({ challengeId, options });
    }
    if (data.action === 'register_verify') {
      const saved = await finishPasskeyRegistration(
        db,
        actor,
        { challengeId: data.challengeId, response: data.response as never, deviceLabel: data.deviceLabel },
        undefined
      );
      return NextResponse.json({ ok: true, id: saved.id, deviceLabel: saved.deviceLabel }, { status: 201 });
    }
    await revokePasskey(db, actor, data.passkeyId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
