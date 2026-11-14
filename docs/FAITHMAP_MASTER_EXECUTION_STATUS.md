# FaithMap — Master Execution Status

**Updated:** 2026-11-14 · **Branch:** `claude/vigilant-noether-4fn1g1` · **Baseline commit:** `8818ef4` (main checkpoint `e38a24e`)
**Budget:** 0 THB/month. No paid service was used, created or enabled.
**Push / merge / deploy:** none done. All work is local commits on the feature branch.

## Gate overview

| Gate | Status | One-line reason |
|---|---|---|
| 0 Infrastructure readiness | **NEEDS OWNER APPROVAL** | B-1 needs Vercel's written reply. B-2 needs a scheduler decision. No Vercel project or Neon database exists. |
| 1 Phase 3B verification | **IN PROGRESS** | Typecheck, build and tests pass. Line-by-line review of Phase 3B is not done. |
| 2 Database and security hardening | **IN PROGRESS** | Critical login flaws fixed with tests. Several hardening items remain (see Gate 2). |
| 3 LINE identity and authentication | **IN PROGRESS** | Server side done and tested with a fake LINE verifier. Not tested with real LINE. Blocked on owner LINE channel. |
| 4 LINE MINI App | NOT STARTED | Needs the LINE channel and LIFF ID from the owner for real testing. |
| 5 LINE OA messaging | NOT STARTED | Needs consent design, quota guard and owner approval. |
| 6 Scheduler | NOT STARTED | Needs B-2 decision. |
| 7 End-to-end QA | NOT STARTED | — |
| 8 Release readiness | NOT STARTED | — |

No gate is PASSED. Critical blockers remain in Gate 0.

---

## Gate 0 — Infrastructure readiness (NEEDS OWNER APPROVAL)

**Facts (verified this session)**
- HEAD equals origin/main (`e38a24e`) when Phase 0 started. The Phase 3B commit changed no infrastructure files.
- Vercel team `tlckalasinchurch` is on Hobby. It has no `faithmap` project and no deployment for `e38a24e`.
- Neon integration is installed with no project. No Development, Preview or Production database exists.
- Vercel Terms section 4: Hobby is for "personal or non-commercial use". The terms do not define it. No church or non-profit exception was found.
- Vercel Terms section 3: Hobby content may be used for AI training. Opt-out is in team settings.
- Legacy Cron on Hobby: once per day, ±59 minutes. Vercel Schedules (beta) on Hobby: at most every 15 minutes, 15-minute jitter, 5,000 runs per billing period, supports `Asia/Bangkok`.
- GitHub Free: 2,000 Actions minutes per month for private repositories.

**B-1 (Vercel written reply):** I cannot send this request for you. It needs your Vercel account. Text to send is in the checklist (section B). Status: OPEN.
**If Vercel says no:** stop and report. Do not move hosting without your approval.

**B-2 scheduler decision (proposal, not decided)**

| Option | Facts | Fit for Sunday 20:00 / 20:30 ICT |
|---|---|---|
| Legacy Vercel Cron | Daily, ±59 min | **Fails.** Order of the two jobs is not guaranteed. |
| Vercel Schedules (beta), Hobby | 15-min jitter, forward only, beta, 5,000 runs per period | Works. Starts 0–15 min late. Order kept. |
| GitHub Actions `schedule` | Free minutes verified. Start-delay behavior **not verified** in this session. | Unknown until delay rules are read. Calls the app over HTTPS with a secret. |

Recommendation: Vercel Schedules (POST, `Asia/Bangkok`), if Hobby eligibility is confirmed. The job must be idempotent and must use the 20:00 deadline, not the job start time. Final choice needs your approval.

**Owner actions:** see `FAITHMAP_ACCOUNT_ACCESS_CHECKLIST.md`.
**Monthly cost estimate:** 0 THB if B-1 is confirmed. Otherwise unknown.
**Quota remaining:** Cannot measure. No project or database exists yet.
**Next executable task:** none for me in Gate 0. Waiting for your decisions.

---

## Gate 1 — Phase 3B verification (IN PROGRESS)

**Executed in this session**

| Check | Result | Test layer |
|---|---|---|
| `npx tsc --noEmit` | exit 0 | static |
| `npx vitest run` (default) | 14 files, 52 tests, all passed | unit / integration on **PGlite** |
| `FAITHMAP_TEST_DATABASE_URL=… npx vitest run tests/real-postgres.test.ts` | 1 file, 7 tests, all passed | integration on **local PostgreSQL 16.15** (scratch database, not production) |
| `npx next build` | exit 0, route `/api/v1/line` listed | build |

**Defect found and fixed:** `package-lock.json` did not match `package.json` (missing `esbuild@0.28.2`). `npm ci` failed. I ran `npm install`. `package.json` is unchanged. `npm ci --dry-run` now succeeds.

**Not done yet (honest):** I did not review each Phase 3B module against its source line by line (care management, Team Field Points, group and member ingestion, growth extraction, provenance, conflict handling, promotion safeguards, verified-member protection). Existing Phase 3B tests pass. Their coverage is not yet judged. The existing tests do not run on real PostgreSQL.

**Next executable task:** read each Phase 3B service against its tests, list gaps, add regression tests, then run them against local PostgreSQL.

---

## Gate 2 — Database and security hardening (IN PROGRESS)

### Fixed this session (each has a regression test; red phase was run first)

| ID | Before | After | Test file |
|---|---|---|---|
| S-1 **Critical** | `GET /api/v1/auth` listed all accounts. `demo_switch` logged in as any account with no password. Demo mode was ON unless set to `false`. | Demo mode is OFF unless `FAITHMAP_DEMO_MODE=true` and `NODE_ENV` is not production. | `gate2-auth-hardening` |
| S-2 **Critical** | `line_oidc` logged in using a LINE ID sent by the client, with no check. | Action removed. Replaced by verified flow (Gate 3). | `gate3-line-identity` |
| S-3 High | Demo accounts with a published password were created on any empty database. | No seed in production. Remote PostgreSQL is never seeded implicitly. Seed command on a remote database needs `FAITHMAP_ALLOW_REMOTE_SEED=true`. | `gate2-auth-hardening`, `gate2-secrets-and-bootstrap` |
| S-4 High | Default session pepper and cron secret in source. | Production throws if `AUTH_SESSION_PEPPER` or `CRON_SECRET` is missing or shorter than 32 characters. Check runs at call time, so `next build` still works. | `gate2-secrets-and-bootstrap` |
| S-5 High | No limit on password guesses. | 5 failures per username or 20 per IP in 15 minutes returns 429. Username is normalized. | `gate2-auth-hardening`, `real-postgres` |
| S-6 Medium | Cron accepted a second header and used a plain string compare. | Only `Authorization: Bearer`, constant-time compare. | covered by S-4 tests (secret logic) |
| S-7 | No way to create the first admin in production. | `npm run db:bootstrap-admin` creates one `super_admin`. Refuses a second run. Password minimum 12 characters. | `gate2-secrets-and-bootstrap` |

**Rule check — "an assignment without a linked authenticated account never grants permissions":** verified in code (`buildActorContext` reads assignments by `user_id` only) and by a regression test (unlinked group-leader assignment grants nothing).

### Remaining defects (not fixed)

| ID | Risk | Item |
|---|---|---|
| D-04 | High | No migration history or version table. Schema is inline idempotent DDL. Owner decision needed. |
| D-05 | High | Schema is applied on the first request in every environment. |
| D-03 | Medium | TLS check disabled for `neon.tech` URLs (`rejectUnauthorized: false`). |
| D-02 | Medium | Pool size 10 per instance. Use Neon pooled host and a lower value. |
| S-8 | Medium | `enroll_passkey` stores a public key with no proof. No passkey login exists. Disable or implement WebAuthn. |
| S-9 | Medium | Sessions last 7 days with no idle timeout or rotation. |
| S-10 | Medium | Rate limit uses the audit table and `x-forwarded-for`. Safe on Vercel (platform sets it). Not safe behind an unknown proxy. Only password login and LINE challenges are limited. |
| S-11 | Medium | Locking a username for 15 minutes lets an attacker block a real user. Accepted trade-off. Owner may choose otherwise. |
| S-12 | Low | The UI still contains demo auto-login code. It only runs when the server enables demo mode (never in production). |
| — | — | Authorization review of every API route, input validation review, PII review of logs and error text, and backup/restore verification are not done. |

---

## Gate 3 — LINE identity and authentication (IN PROGRESS)

**Built** (`src/server/modules/line-identity/`, `src/app/api/v1/line/route.ts`, tables `auth_challenges` and `line_registration_requests`):
- Server-side ID token verification through LINE's verify endpoint. Checks issuer, audience, subject, expiry and nonce. No client-supplied subject is trusted.
- One-time challenges (5 minutes). The nonce is stored only as a keyed hash. Use is atomic. A challenge is bound to purpose and, for linking, to the signed-in user.
- Path A: link to an existing account (needs session and CSRF). One LINE identity per account. One account per LINE identity. Safe unlink: refused when LINE is the only sign-in method.
- Path B: LINE-first registration creates a **pending request only**. No user, no role, no session. Only `super_admin` can list and decide. Approval creates a `standard_user` with **no assignments**. The request list does not return the LINE ID. Decisions are audited.
- Existing tables were reused: `external_identities`, `auth_sessions`, `security_audit_logs`. Two new tables were needed (challenges and requests). No existing table had this purpose.

**Tested**

| Item | Layer |
|---|---|
| Verifier: wrong audience, issuer, nonce, missing nonce, expiry, missing subject, LINE error, network failure, missing config | unit (fake `fetch`) |
| Replay, wrong purpose, wrong user, wrong nonce, expiry | integration (PGlite) |
| Link, duplicate link both ways, login, unlinked login, suspended account, unlink rules | integration (PGlite) |
| Registration, idempotency, super_admin-only, approve / reject, no roles granted | integration (PGlite) |
| Concurrent challenge use, concurrent registration, concurrent approval | integration (**real PostgreSQL 16.15**) |

**NOT tested:** any call to real LINE. The real verify endpoint, a real ID token and the LIFF / MINI App behavior are **not tested**. One open question needs a LINE sandbox test: this design requires a `nonce` claim in the ID token. Whether a LIFF or MINI App ID token carries a server-chosen nonce is not verified. If it does not, the design must change (for example, use the OIDC authorization-code flow for the web, which supports nonce). Do not claim LINE login works until this is tested with a real channel.

**Owner actions needed:** create LINE Provider and Login channel; give the Channel ID (not a secret) and set `LINE_LOGIN_CHANNEL_ID` in Vercel. See checklist section F.
**Next executable task:** Gate 4 UI work using a mock LIFF object in tests, and the web OIDC start/callback route as a fallback path.

---

## Gates 4–8

Not started. Notes for later gates:
- Gate 5: `users.line_user_id` is not set by account linking. Push needs explicit consent and a Messaging channel under the same provider. Existing push code sends real messages when `LINE_OA_CHANNEL_ACCESS_TOKEN` is set. No quota guard exists yet. **Do not set that token before the quota guard exists.**
- Gate 6: Cron route accepts POST with Bearer. It works with Vercel Schedules (POST default). Job idempotency and execution history are not built.

## Environment variable names (names only)

| Name | New or changed this session |
|---|---|
| `FAITHMAP_DEMO_MODE` | Now must be exactly `true` to enable. Never works in production. |
| `AUTH_SESSION_PEPPER` | Required in production, 32+ characters. |
| `CRON_SECRET` | Required in production, 32+ characters. |
| `LINE_LOGIN_CHANNEL_ID` | Now read by the code (LINE token check). |
| `FAITHMAP_ALLOW_REMOTE_SEED` | New. Allows explicit seed on a remote database. Staging only. |
| `FAITHMAP_BOOTSTRAP_USERNAME`, `FAITHMAP_BOOTSTRAP_NAME`, `FAITHMAP_BOOTSTRAP_PASSWORD` | New. Local terminal only, for the first super admin. |
| `FAITHMAP_TEST_DATABASE_URL` | New. Tests only. Database name must contain `faithmap_test`. |
| `LINE_LOGIN_CHANNEL_SECRET`, `APP_BASE_URL` | Still unused by code. |

## Files changed this session

Code: `src/server/modules/identity/{service,crypto,bootstrap}.ts`, `src/server/modules/line-identity/{verifier,service}.ts`, `src/server/http/cron-auth.ts`, `src/server/db/{schema,migrate,seed,bootstrap,run-seed,run-bootstrap-admin}.ts`, `src/app/api/v1/{auth,line}/route.ts`, `src/app/api/internal/jobs/[jobName]/route.ts`, `src/components/LoginView.tsx`, `package.json` (script), `package-lock.json` (repair).
Tests: `tests/gate2-auth-hardening.test.ts`, `tests/gate2-secrets-and-bootstrap.test.ts`, `tests/gate3-line-identity.test.ts`, `tests/real-postgres.test.ts`.

## Breaking behavior changes (review before deploy)

1. The demo account switcher no longer appears unless `FAITHMAP_DEMO_MODE=true`. Local demos need this variable.
2. Production starts with an empty database. Run `npm run db:bootstrap-admin` once.
3. The "เข้าสู่ระบบด้วย LINE" button shows a message until Gate 4 is built.
4. Production fails fast when `AUTH_SESSION_PEPPER` or `CRON_SECRET` is missing.
