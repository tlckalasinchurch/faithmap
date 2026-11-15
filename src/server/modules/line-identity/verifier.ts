import { AppError } from '../errors';

export interface LineIdTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
  name?: string;
  picture?: string;
}

export const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
export const LINE_ISSUER = 'https://access.line.me';

function invalid(reason: string): AppError {
  return new AppError(
    401,
    'LINE_TOKEN_INVALID',
    'ตรวจสอบบัญชี LINE ไม่ผ่าน กรุณาลองเข้าสู่ระบบด้วย LINE ใหม่อีกครั้ง',
    { reason }
  );
}

/**
 * Verifies a LINE ID token on the server.
 * LINE's verify endpoint checks the signature and expiry. This function then checks
 * issuer, audience, subject, expiry and nonce itself. It never trusts a client-supplied subject.
 */
export async function verifyLineIdToken(input: {
  idToken: string;
  expectedNonce: string;
  /**
   * Default true. LIFF and MINI App ID tokens carry no nonce: `liff.login()` has no nonce option
   * and LINE adds the claim only when the authorization request has one. For those tokens pass
   * false and rely on single-use token tracking in the service.
   */
  requireNonce?: boolean;
  channelId: string;
  fetchImpl?: typeof fetch;
  nowSeconds?: number;
}): Promise<LineIdTokenClaims> {
  if (!input.channelId) {
    throw new AppError(
      503,
      'LINE_NOT_CONFIGURED',
      'ระบบเข้าสู่ระบบด้วย LINE ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ'
    );
  }
  const requireNonce = input.requireNonce ?? true;
  if (!input.idToken || (requireNonce && !input.expectedNonce)) throw invalid('missing_input');

  const doFetch = input.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(LINE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: input.idToken, client_id: input.channelId }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new AppError(
      503,
      'LINE_UNAVAILABLE',
      'ติดต่อ LINE ไม่ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง'
    );
  }

  if (!res.ok) throw invalid(`line_status_${res.status}`);

  let claims: Partial<LineIdTokenClaims>;
  try {
    claims = (await res.json()) as Partial<LineIdTokenClaims>;
  } catch {
    throw invalid('bad_response');
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.iss !== LINE_ISSUER) throw invalid('issuer');
  if (claims.aud !== input.channelId) throw invalid('audience');
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) throw invalid('subject');
  if (typeof claims.exp !== 'number' || claims.exp <= now) throw invalid('expired');
  if (typeof claims.iat !== 'number' || claims.iat > now + 120) throw invalid('issued_in_future');
  if (requireNonce && (typeof claims.nonce !== 'string' || claims.nonce !== input.expectedNonce)) {
    throw invalid('nonce');
  }

  return claims as LineIdTokenClaims;
}
