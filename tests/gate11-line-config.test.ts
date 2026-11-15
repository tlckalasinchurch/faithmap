import { describe, expect, it } from 'vitest';
import { checkLineConfig, isAcceptableEndpointUrl } from '@/lib/liff/config';
import { createReplayGuard } from '@/lib/liff/replay-guard';

// Public identifiers of the Developing channel (not secrets): channel ID and LIFF ID.
const DEV = { LINE_LOGIN_CHANNEL_ID: '2012616582', NEXT_PUBLIC_LIFF_ID: '2012616582-tsDHY0DR' };
const names = (r: ReturnType<typeof checkLineConfig>) => r.checks.filter((c) => !c.ok).map((c) => c.name);

describe('LINE configuration check', () => {
  it('accepts the Developing identifiers when the LIFF ID belongs to the channel', () => {
    const r = checkLineConfig({ ...DEV, NODE_ENV: 'development' });
    expect(names(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('fails when the channel ID or LIFF ID is missing or malformed', () => {
    expect(names(checkLineConfig({ NODE_ENV: 'development' }))).toEqual(expect.arrayContaining(['channel_id_set', 'liff_id_set']));
    expect(names(checkLineConfig({ LINE_LOGIN_CHANNEL_ID: 'abc', NEXT_PUBLIC_LIFF_ID: 'xyz' }))).toEqual(expect.arrayContaining(['channel_id_format', 'liff_id_format']));
  });

  it('fails when the LIFF ID belongs to another channel (audience mismatch)', () => {
    const r = checkLineConfig({ LINE_LOGIN_CHANNEL_ID: '1111111111', NEXT_PUBLIC_LIFF_ID: '2012616582-tsDHY0DR' });
    expect(names(r)).toContain('liff_matches_channel');
  });

  it('fails in production when the mock flag is on or the base URL is not https', () => {
    const r = checkLineConfig({ ...DEV, NODE_ENV: 'production', NEXT_PUBLIC_FAITHMAP_MOCK_LIFF: 'true', APP_BASE_URL: 'http://localhost:3000' });
    expect(names(r)).toEqual(expect.arrayContaining(['mock_off_in_production', 'app_base_url_https']));
  });

  it('warns that the OA token must stay unset until the quota guard exists', () => {
    const r = checkLineConfig({ ...DEV, LINE_OA_CHANNEL_ACCESS_TOKEN: 'set' });
    expect(names(r)).toContain('oa_token_unset_until_quota_guard');
  });

  it('never returns a configured value, only names and pass/fail', () => {
    const r = checkLineConfig({ ...DEV, LINE_LOGIN_CHANNEL_SECRET: 'super-secret-value', LINE_OA_CHANNEL_ACCESS_TOKEN: 'token-value-123' });
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/super-secret-value|token-value-123|2012616582|tsDHY0DR/);
  });

  it('does not require the channel secret (the LIFF ID-token flow does not use it)', () => {
    expect(checkLineConfig({ ...DEV }).checks.some((c) => c.name.includes('secret') && !c.ok)).toBe(false);
  });
});

describe('Endpoint URL check', () => {
  it('accepts an https FaithMap URL to /mini', () => {
    expect(isAcceptableEndpointUrl('https://faithmap-example.vercel.app/mini')).toEqual({ ok: true });
  });
  it.each([
    ['http://example.com/mini', 'https'],
    ['https://example.com/mini#section', 'fragment'],
    ['https://miniapp.line.me/2012616582-tsDHY0DR', 'line'],
    ['https://liff.line.me/2012616582-tsDHY0DR', 'line'],
    ['https://line.me/', 'line'],
    ['not a url', 'invalid'],
    ['https://user:pass@example.com/mini', 'credentials'],
  ])('refuses %s', (url, why) => {
    const r = isAcceptableEndpointUrl(url);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason.toLowerCase()).toContain(why);
  });
});

describe('Replay retry guard (no redirect loop)', () => {
  function memory() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  }
  it('allows one automatic retry, then stops for 5 minutes', () => {
    const g = createReplayGuard(memory(), () => 1_000);
    expect(g.mayRetry()).toBe(true);
    g.markRetried();
    expect(g.mayRetry()).toBe(false);
  });
  it('allows a new retry after the window', () => {
    const store = memory();
    let now = 1_000;
    const g = createReplayGuard(store, () => now);
    g.markRetried();
    now += 5 * 60_000 + 1;
    expect(g.mayRetry()).toBe(true);
  });
  it('works without storage (blocks the retry, which is the safe choice)', () => {
    const g = createReplayGuard(null, () => 0);
    expect(g.mayRetry()).toBe(false);
  });
});
