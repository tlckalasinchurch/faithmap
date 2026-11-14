import crypto from 'node:crypto';

const DEV_CRON_SECRET = 'faithmap-dev-cron-secret-not-for-production';

/** Read at call time. Production never uses a default secret. */
export function getCronSecret(): string {
  const value = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!value || value.length < 32) {
      throw new Error('CRON_SECRET must be set to at least 32 characters in production.');
    }
    return value;
  }
  return value || DEV_CRON_SECRET;
}

/** Accepts only `Authorization: Bearer <CRON_SECRET>`. Compares in constant time. */
export function isCronRequestAuthorized(authorizationHeader: string | null): boolean {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) return false;
  let expected: string;
  try {
    expected = getCronSecret();
  } catch {
    return false;
  }
  const given = authorizationHeader.slice('Bearer '.length).trim();
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
