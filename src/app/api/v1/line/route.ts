import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getReadyDb } from '@/server/db/bootstrap';
import {
  getRequestMeta,
  handleRouteError,
  requireAuth,
  setSessionCookies,
} from '@/server/http/session';
import { AppError } from '@/server/modules/errors';
import {
  createLineChallenge,
  linkLineIdentity,
  listRegistrationRequests,
  loginWithLine,
  requestLineRegistration,
  reviewRegistrationRequest,
  unlinkLineIdentity,
} from '@/server/modules/line-identity/service';

export const dynamic = 'force-dynamic';

const proof = {
  challengeId: z.string().uuid(),
  nonce: z.string().min(16).max(200),
  idToken: z.string().min(20).max(8000),
};

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('challenge'), purpose: z.enum(['login', 'register', 'link']) }),
  z.object({ action: z.literal('link'), ...proof }),
  z.object({ action: z.literal('login'), ...proof }),
  z.object({
    action: z.literal('register'),
    ...proof,
    requestedName: z.string().min(1).max(80),
    note: z.string().max(300).optional(),
  }),
  z.object({ action: z.literal('unlink') }),
  z.object({
    action: z.literal('review'),
    requestId: z.string().uuid(),
    decision: z.enum(['approve', 'reject']),
    reason: z.string().max(300).optional(),
  }),
]);

/** Pending registration requests. Super admin only. */
export async function GET(req: NextRequest) {
  try {
    const { db, actor } = await requireAuth(req);
    const status = req.nextUrl.searchParams.get('status') ?? 'pending';
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'สถานะที่ขอไม่ถูกต้อง');
    }
    const rows = await listRegistrationRequests(db, actor, status as 'pending' | 'approved' | 'rejected');
    return NextResponse.json({ requests: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลคำขอไม่ถูกต้อง');
    }
    const data = parsed.data;
    const meta = getRequestMeta(req);

    if (data.action === 'challenge') {
      if (data.purpose === 'link') {
        const { db, actor } = await requireAuth(req);
        const ch = await createLineChallenge(db, 'line_link', actor.user.id, meta.ipAddress);
        return NextResponse.json(ch);
      }
      const db = await getReadyDb();
      const purpose = data.purpose === 'login' ? 'line_login' : 'line_register';
      const ch = await createLineChallenge(db, purpose, null, meta.ipAddress);
      return NextResponse.json(ch);
    }

    if (data.action === 'login') {
      const db = await getReadyDb();
      const result = await loginWithLine(db, data, undefined, meta);
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

    if (data.action === 'register') {
      const db = await getReadyDb();
      const created = await requestLineRegistration(db, data);
      // No session and no roles. A super admin must approve first.
      return NextResponse.json(
        { ok: true, requestId: created.id, status: created.status },
        { status: 202 }
      );
    }

    // The actions below need a signed-in account (and CSRF for cookie sessions).
    const { db, actor } = await requireAuth(req);

    if (data.action === 'link') {
      await linkLineIdentity(db, actor, data);
      return NextResponse.json({ ok: true });
    }
    if (data.action === 'unlink') {
      await unlinkLineIdentity(db, actor);
      return NextResponse.json({ ok: true });
    }
    const reviewed = await reviewRegistrationRequest(db, actor, data);
    return NextResponse.json({ ok: true, status: reviewed.status });
  } catch (err) {
    return handleRouteError(err);
  }
}
