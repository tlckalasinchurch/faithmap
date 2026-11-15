import crypto from 'node:crypto';

const DEV_PEPPER = 'faithmap-dev-session-pepper-not-for-production';

/** Read at call time so `next build` works without secrets. Production never uses a default. */
function getPepper(): string {
  const value = process.env.AUTH_SESSION_PEPPER;
  if (process.env.NODE_ENV === 'production') {
    if (!value || value.length < 32) {
      throw new Error('AUTH_SESSION_PEPPER must be set to at least 32 characters in production.');
    }
    return value;
  }
  return value || DEV_PEPPER;
}

export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plainPassword: string, storedHash: string | null): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, salt, hexDigest] = parts;
  if (!salt || !hexDigest) return false;
  const derived = crypto.scryptSync(plainPassword, salt, 64);
  const storedBuf = Buffer.from(hexDigest, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

let dummyHash: string | null = null;

/**
 * Checks a password. When the account does not exist (or has no password), it still does the same
 * amount of work, so response time does not reveal which usernames exist.
 */
export function verifyPasswordUniform(plainPassword: string, storedHash: string | null): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt$')) {
    dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex'));
    verifyPassword(plainPassword, dummyHash);
    return false;
  }
  return verifyPassword(plainPassword, storedHash);
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHmac('sha256', getPepper()).update(rawToken).digest('hex');
}

export function hashRequestPayload(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload ?? null)).digest('hex');
}

/**
 * Audit and rate-limit key for a typed username. People sometimes type a password into the username
 * field, and audit rows are permanent. The key is a peppered HMAC, so the log holds no readable text
 * and a typed password cannot be guessed back from it without the server secret.
 */
export function loginTargetKey(normalizedUsername: string): string {
  return `login:${crypto.createHmac('sha256', getPepper()).update(`login-target\0${normalizedUsername}`).digest('hex').slice(0, 32)}`;
}
