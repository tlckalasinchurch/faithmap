/**
 * Checks the LINE configuration without printing any value.
 * The Channel ID and LIFF ID are public identifiers. The checker still reports only names and pass/fail.
 * The Channel Secret is not used by the LIFF ID-token flow, so it is not required here.
 */
export interface LineConfigEnv {
  NODE_ENV?: string;
  LINE_LOGIN_CHANNEL_ID?: string;
  NEXT_PUBLIC_LIFF_ID?: string;
  NEXT_PUBLIC_FAITHMAP_MOCK_LIFF?: string;
  APP_BASE_URL?: string;
  LINE_OA_CHANNEL_ACCESS_TOKEN?: string;
  LINE_LOGIN_CHANNEL_SECRET?: string;
}

export interface LineConfigCheck {
  name: string;
  ok: boolean;
  hint: string;
}

const CHANNEL_ID = /^\d{9,12}$/;
const LIFF_ID = /^(\d{9,12})-[A-Za-z0-9]{6,12}$/;

export function checkLineConfig(env: LineConfigEnv): { ok: boolean; checks: LineConfigCheck[] } {
  const checks: LineConfigCheck[] = [];
  const add = (name: string, ok: boolean, hint: string) => checks.push({ name, ok, hint });
  const channel = env.LINE_LOGIN_CHANNEL_ID?.trim() ?? '';
  const liff = env.NEXT_PUBLIC_LIFF_ID?.trim() ?? '';

  add('channel_id_set', Boolean(channel), 'Set LINE_LOGIN_CHANNEL_ID to the Channel ID of the channel that owns the LIFF app.');
  add('liff_id_set', Boolean(liff), 'Set NEXT_PUBLIC_LIFF_ID to the LIFF ID (the part after miniapp.line.me/).');
  if (channel) add('channel_id_format', CHANNEL_ID.test(channel), 'A Channel ID is 9 to 12 digits.');
  if (liff) add('liff_id_format', LIFF_ID.test(liff), 'A LIFF ID looks like 1234567890-AbCdEfGh.');
  if (channel && liff) {
    const prefix = LIFF_ID.exec(liff)?.[1];
    add(
      'liff_matches_channel',
      prefix === channel,
      'The number before the dash in the LIFF ID must equal the Channel ID. Each of Developing, In review and Published has its own pair.'
    );
  }
  const production = env.NODE_ENV === 'production';
  if (production) {
    add('mock_off_in_production', env.NEXT_PUBLIC_FAITHMAP_MOCK_LIFF !== 'true', 'Remove NEXT_PUBLIC_FAITHMAP_MOCK_LIFF.');
    const base = env.APP_BASE_URL ?? '';
    let https = false;
    try {
      const u = new URL(base);
      https = u.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname);
    } catch {
      https = false;
    }
    add('app_base_url_https', https, 'Set APP_BASE_URL to the exact https origin, not localhost.');
  }
  add(
    'oa_token_unset_until_quota_guard',
    !env.LINE_OA_CHANNEL_ACCESS_TOKEN,
    'Leave LINE_OA_CHANNEL_ACCESS_TOKEN unset until the message quota guard exists (Gate 5).'
  );
  return { ok: checks.every((c) => c.ok), checks };
}

/** Rules for the LIFF Endpoint URL. It must be the FaithMap page, never a LINE address. */
export function isAcceptableEndpointUrl(raw: string): { ok: true } | { ok: false; reason: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'must use https' };
  if (u.username || u.password) return { ok: false, reason: 'must not contain credentials' };
  if (u.hash) return { ok: false, reason: 'must not contain a fragment' };
  if (/(^|\.)line\.(me|biz)$/i.test(u.hostname)) return { ok: false, reason: 'must not be a LINE address (default or LIFF URL)' };
  return { ok: true };
}
