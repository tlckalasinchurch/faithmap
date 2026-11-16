/**
 * Security headers (docs/FAITHMAP_SECURITY_AND_PERMISSION_MODEL.md, "Input & Output Hardening").
 *
 * Enforced policy: only directives that cannot block the LIFF SDK, the map or Next.js scripts.
 *   - frame-ancestors 'none'  : no other site can put FaithMap in a frame (clickjacking).
 *   - object-src 'none', base-uri 'self', form-action 'self'.
 * Full policy: sent as Report-Only. It lists the hosts that LIFF and the map need (from LINE and
 * OpenStreetMap documentation, NOT yet checked on a real device). Check the browser console during the
 * real-device test. Move a directive to the enforced policy only after the console shows no violation.
 */
const ENFORCED_CSP = ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');

const REPORT_ONLY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.line-scdn.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://profile.line-scdn.net",
  "font-src 'self' data:",
  "connect-src 'self' https://api.line.me https://access.line.me https://liff.line.me https://tile.openstreetmap.org",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: ENFORCED_CSP },
  { key: 'Content-Security-Policy-Report-Only', value: REPORT_ONLY_CSP },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  env: {
    NEXT_PUBLIC_LIFF_ID: process.env.NEXT_PUBLIC_LIFF_ID || '2012616582-tsDHY0DR',
  },
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
