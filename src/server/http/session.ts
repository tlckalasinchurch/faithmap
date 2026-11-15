import { NextRequest, NextResponse } from 'next/server';
import { getReadyDb } from '@/server/db/bootstrap';
import type { FaithMapDb } from '@/server/db/client';
import { authenticateSessionToken, type ActorContext } from '@/server/modules/identity/service';
import { hashSessionToken } from '@/server/modules/identity/crypto';
import { AppError, toErrorResponseBody } from '@/server/modules/errors';

export const PROD_SESSION_COOKIE = '__Host-faithmap_session';
export const DEV_SESSION_COOKIE = 'faithmap_session';
export const CSRF_COOKIE = 'faithmap_csrf';

/** Production always uses Secure cookies, even if a proxy header is missing. */
export function shouldUseSecureCookies(
  req: Request,
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.NODE_ENV === 'production' || isHttpsRequest(req);
}

/**
 * CSRF defence in depth. A browser sends `Origin` on cross-site POST requests.
 * If it is present, it must match the app origin (APP_BASE_URL, or the request host when unset).
 */
export function isAllowedOrigin(
  originHeader: string | null,
  req: Request,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (!originHeader) return true;
  let allowed: string;
  try {
    allowed = env.APP_BASE_URL ? new URL(env.APP_BASE_URL).origin : new URL(req.url).origin;
  } catch {
    return false;
  }
  return originHeader === allowed;
}

export function assertSameOrigin(req: Request): void {
  const method = req.method.toUpperCase();
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return;
  if (!isAllowedOrigin(req.headers.get('origin'), req)) {
    throw new AppError(403, 'ORIGIN_MISMATCH', 'คำขอนี้มาจากเว็บไซต์ที่ไม่ได้รับอนุญาต');
  }
}

export function isHttpsRequest(req: Request): boolean {
  const proto = req.headers.get('x-forwarded-proto');
  if (proto) return proto.split(',')[0]?.trim() === 'https';
  return req.url.startsWith('https://');
}

export function extractRawSessionToken(req: NextRequest): string | null {
  const hostCookie = req.cookies.get(PROD_SESSION_COOKIE)?.value;
  if (hostCookie) return hostCookie;
  const devCookie = req.cookies.get(DEV_SESSION_COOKIE)?.value;
  if (devCookie) return devCookie;
  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim();
  }
  return null;
}

export async function requireAuth(
  req: NextRequest,
  options?: { db?: FaithMapDb; checkCsrf?: boolean }
): Promise<{ db: FaithMapDb; actor: ActorContext }> {
  const db = options?.db ?? (await getReadyDb());
  const rawToken = extractRawSessionToken(req);
  const actor = await authenticateSessionToken(db, rawToken);
  if (!actor) {
    throw new AppError(401, 'UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบก่อนใช้งาน');
  }

  const method = req.method.toUpperCase();
  assertSameOrigin(req);
  const usesCookieAuth =
    Boolean(req.cookies.get(PROD_SESSION_COOKIE)?.value) ||
    Boolean(req.cookies.get(DEV_SESSION_COOKIE)?.value);

  if (
    (options?.checkCsrf ?? true) &&
    usesCookieAuth &&
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
  ) {
    const csrfHeader = req.headers.get('x-faithmap-csrf');
    if (!csrfHeader || !actor.csrfTokenHash || hashSessionToken(csrfHeader) !== actor.csrfTokenHash) {
      throw new AppError(403, 'CSRF_MISMATCH', 'โทเคนยืนยันคำขอ (CSRF) ไม่ถูกต้อง กรุณารีเฟรชหน้าจอ');
    }
  }

  return { db, actor };
}

export function setSessionCookies(
  res: NextResponse,
  req: Request,
  sessionToken: string,
  csrfToken: string
) {
  const secure = shouldUseSecureCookies(req);
  const cookieName = secure ? PROD_SESSION_COOKIE : DEV_SESSION_COOKIE;
  res.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 7 * 24 * 3600,
  });
  res.cookies.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 7 * 24 * 3600,
  });
}

export function clearSessionCookies(res: NextResponse) {
  res.cookies.set(PROD_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 0,
  });
  res.cookies.set(DEV_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  res.cookies.set(CSRF_COOKIE, '', {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function getRequestMeta(req: NextRequest) {
  return {
    userAgent: req.headers.get('user-agent'),
    ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1',
  };
}

export function handleRouteError(err: unknown): NextResponse {
  const { status, body } = toErrorResponseBody(err);
  return NextResponse.json(body, { status });
}
