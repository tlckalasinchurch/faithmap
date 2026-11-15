import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, safeValidationIssues } from '@/server/http/body';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getReadyDb } from '@/server/db/bootstrap';
import { users } from '@/server/db/schema';
import {
  clearSessionCookies,
  CSRF_COOKIE,
  assertSameOrigin,
  extractRawSessionToken,
  getRequestMeta,
  handleRouteError,
  requireAuth,
  setSessionCookies,
} from '@/server/http/session';
import {
  authenticateSessionToken,
  isDemoModeEnabled,
  loginWithPassword,
  logoutBySessionToken,
  switchDemoAccount,
} from '@/server/modules/identity/service';
import { listUserNotifications } from '@/server/modules/notifications/service';
import { AppError } from '@/server/modules/errors';

export const dynamic = 'force-dynamic';

const authActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('login_password'),
    username: z.string().min(1).max(80),
    password: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal('demo_switch'),
    userId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('logout'),
  }),
]);

export async function GET(req: NextRequest) {
  try {
    const db = await getReadyDb();
    const rawToken = extractRawSessionToken(req);
    const actor = await authenticateSessionToken(db, rawToken);
    const demoEnabled = isDemoModeEnabled();

    const demoAccounts = demoEnabled
      ? await db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            systemRole: users.systemRole,
            status: users.status,
          })
          .from(users)
          .where(eq(users.status, 'active'))
          .orderBy(asc(users.username))
      : [];

    if (!actor) {
      return NextResponse.json({
        authenticated: false,
        actor: null,
        csrfToken: null,
        unreadNotifications: 0,
        demoEnabled,
        demoAccounts,
      });
    }

    const notifs = await listUserNotifications(db, actor.user.id, 30);
    const unreadNotifications = notifs.filter((n) => !n.readAt).length;

    return NextResponse.json({
      authenticated: true,
      actor: {
        user: actor.user,
        assignments: actor.assignments,
        bodyLeaderBodyIds: Array.from(actor.bodyLeaderBodyIds),
        groupLeaderGroupIds: Array.from(actor.groupLeaderGroupIds),
        supervisorGroupIds: Array.from(actor.supervisorGroupIds),
      },
      csrfToken: req.cookies.get(CSRF_COOKIE)?.value ?? null,
      unreadNotifications,
      demoEnabled,
      demoAccounts,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const body = await readJsonBody(req);
    const parsed = authActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลคำขอเข้าสู่ระบบไม่ถูกต้อง', {
        issues: safeValidationIssues(parsed.error.issues),
      });
    }

    const data = parsed.data;
    const db = await getReadyDb();
    const meta = getRequestMeta(req);

    if (data.action === 'logout') {
      await logoutBySessionToken(db, extractRawSessionToken(req));
      const res = NextResponse.json({ ok: true, authenticated: false });
      clearSessionCookies(res);
      return res;
    }

    let loginResult: Awaited<ReturnType<typeof loginWithPassword>>;
    if (data.action === 'login_password') {
      loginResult = await loginWithPassword(db, data.username, data.password, meta);
    } else {
      loginResult = await switchDemoAccount(db, data.userId, meta);
    }

    const res = NextResponse.json({
      ok: true,
      authenticated: true,
      csrfToken: loginResult.csrfToken,
      actor: {
        user: loginResult.actor.user,
        assignments: loginResult.actor.assignments,
        bodyLeaderBodyIds: Array.from(loginResult.actor.bodyLeaderBodyIds),
        groupLeaderGroupIds: Array.from(loginResult.actor.groupLeaderGroupIds),
        supervisorGroupIds: Array.from(loginResult.actor.supervisorGroupIds),
      },
    });
    setSessionCookies(res, req, loginResult.sessionToken, loginResult.csrfToken);
    return res;
  } catch (err) {
    return handleRouteError(err);
  }
}
