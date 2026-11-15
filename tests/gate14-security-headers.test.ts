/**
 * Security headers are configured for every route. Before this test the app sent none.
 * This test checks the configuration. The live response is checked in the build step (curl on `next start`).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- next.config.mjs is plain JavaScript and has no declaration file
import rawConfig from '../next.config.mjs';

interface HeaderRule { source: string; headers: { key: string; value: string }[] }
const nextConfig = rawConfig as { poweredByHeader: boolean; headers: () => Promise<HeaderRule[]> };

async function headersFor() {
  const rules = await nextConfig.headers();
  const all = rules.find((r) => r.source === '/:path*');
  expect(all, 'a rule that covers every path').toBeDefined();
  return new Map<string, string>(all!.headers.map((h) => [h.key.toLowerCase(), h.value]));
}

describe('security headers', () => {
  it('sets the basic protections on every route', async () => {
    const h = await headersFor();
    expect(h.get('x-content-type-options')).toBe('nosniff');
    expect(h.get('x-frame-options')).toBe('DENY');
    expect(h.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(h.get('strict-transport-security')).toMatch(/max-age=\d{7,}/);
    expect(h.get('permissions-policy')).toMatch(/camera=\(\)/);
  });

  it('enforces anti-framing and base restrictions without blocking scripts', async () => {
    const csp = (await headersFor()).get('content-security-policy')!;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toMatch(/script-src|default-src|connect-src/);
  });

  it('keeps the full policy in Report-Only mode and never allows eval', async () => {
    const h = await headersFor();
    const ro = h.get('content-security-policy-report-only')!;
    expect(ro).toContain("default-src 'self'");
    expect(ro).toContain('https://static.line-scdn.net');
    expect(ro).not.toContain('unsafe-eval');
    expect(ro).not.toContain('*');
  });

  it('does not advertise the framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
