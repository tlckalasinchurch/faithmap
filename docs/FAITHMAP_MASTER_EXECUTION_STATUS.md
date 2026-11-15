# FaithMap — Master Execution Status

**Updated:** 2026-11-15 (round 3: authorization review) · **Branch:** `claude/vigilant-noether-4fn1g1` · **`main` is unchanged (`e38a24e`).**
**Budget:** 0 THB/month. No paid service was used, created or enabled.
**Push / merge / deploy:** the feature branch was pushed after the tests above passed (round-2 Git rules). `main` was not touched. No pull request was opened. Nothing was deployed.

## Gate overview

| Gate | Status | Reason |
|---|---|---|
| 0 Infrastructure readiness | **NEEDS OWNER APPROVAL** | B-1 (Vercel Hobby reply) and B-2 (scheduler) are open. No Vercel project, Neon project or LINE channel exists. |
| 1 Phase 3B verification | **READY FOR OWNER REVIEW. Item 2 BLOCKED** | 8 + 2 defects fixed. Your 3 decisions are applied (see "Round 4"). Growth columns Y–AD stay unmapped: the source workbook is not available. |
| 2 Database and security hardening | **IN PROGRESS** | All 9 listed blockers are done. Round 5 closed the PII/secret scan, input limits and route-level authorization matrix (see Round 5). Open: real-PostgreSQL run of older tests, challenge cleanup, platform firewall. No Critical or High code finding is open. |
| 3 LINE identity and authentication | **BLOCKED** | Server side built. A Developing channel now exists (owner-reported). Real LINE test needs a database, variables, a protection decision and the Endpoint URL (see `FAITHMAP_LINE_MINIAPP_READINESS.md`). |
| 4 LINE MINI App | **IN PROGRESS** | Built and tested with the mock on desktop. Real device tests are **BLOCKED** (`FAITHMAP_REAL_DEVICE_TEST_PLAN.md`). |
| 5 LINE OA messaging | NOT STARTED | |
| 6 Scheduler | NOT STARTED | Needs B-2. |
| 7 End-to-end QA | NOT STARTED | |
| 8 Release readiness | NOT STARTED | |

No gate is PASSED. Gate 0 has critical blockers.

## Commits (all on the feature branch)

| Hash | Content | Pushed |
|---|---|---|
| `8818ef4` | Phase 0 reports | yes |
| `f7c65bd` | Demo/LINE takeover fixes, first LINE identity flow, bootstrap admin | yes |
| `010ef84` | Migration history, passkeys, session and TLS hardening, LIFF-compatible LINE verification | yes |
| `484fdb1` | Phase 3B review fixes (rollback, member merge, roles, validation) | yes |
| `4e60ae7` | Gate 4 MINI App, growth API, status report | yes |
| `a7d3b76` | Authorization review of the older routes (10 defects) | yes |
| `0f4ad39` | Duplicate rule (all rows pending_review); immutable data-quality decisions | local |
| `d2c0b2c` | Rollback removes only unreviewed growth rows; protects reviewed ones | local |
| `ab84604` | MINI App weekly report form | local |
| `c20b235` | GitHub Actions CI; 401 tests for every protected route | local |
| `946301c` | Growth columns Y–AD no longer guessed by letter | local |

## Exact test results (commands run on 2026-11-15)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | **26 files passed, 1 skipped; 254 tests passed, 15 skipped** (skipped = real-PostgreSQL file, needs a database URL) |
| `FAITHMAP_TEST_DATABASE_URL=postgres://…@127.0.0.1:5432/faithmap_test_a npx vitest run tests/real-postgres.test.ts` | **1 file passed; 15 tests passed** on local PostgreSQL 16.15 (adds the concurrent-decision race) |
| `npx next build` | exit 0. Routes include `/mini`, `/api/v1/line`, `/api/v1/passkeys`, `/api/v1/growth` |
| `npx next build` with `NEXT_PUBLIC_FAITHMAP_MOCK_LIFF=true` | exit 0. `grep` finds no mock token or mock label in `.next` (mock is not shipped) |
| `npm ci --dry-run` | succeeds (lock file repaired) |
| `node scripts/e2e-mini-report.mjs` (Chromium, dev server, mock LIFF, demo data, fresh `.data`) | **52 of 52 checks passed** (report form at 360, 768, 1280 px, plus the draft, submit, revision, supervisor and approval flows) |
| `node scripts/e2e-mini.mjs` (re-run after the Reports screen change) | **84 of 84 checks passed** |
| GitHub Actions run 43677777198 (pull request) and 43677775509 (push), commit `23addf7` | **Both succeeded**, about 3 minutes. Log: 23 files, 193 tests passed, including `real-postgres.test.ts` (15 tests, on the PostgreSQL 16.16 service container), then `next build` passed. Database URL masked in the log. See Round 5 for the run on the newest commit. |
| `node scripts/e2e-mini.mjs` (Chromium, dev server, mock LIFF, demo mode) | **84 of 84 checks passed** at 360, 768 and 1280 px |
| `npx impeccable detect src/components/mini` | exit 0. Regex-only mode. It states its findings are an undercount. |
| `npx impeccable detect http://localhost:3100/mini` | exit 0, no output |
| `pg_dump -Fc` and `pg_restore` on local PostgreSQL | 38 tables, 130 rows, identical counts; 3 triggers and 2 migrations restored |

**Test layers.** Unit and integration: PGlite. Concurrency, triggers, migration journal and restore: local real PostgreSQL 16.15. Browser: Chromium against the dev server. **External sandbox (real LINE): none. Production: none.**

**Not run against real PostgreSQL:** the 11 older Phase 1–3B test files and the new Gate 1–4 files run on PGlite only. Only `tests/real-postgres.test.ts` runs on real PostgreSQL.

---

## Gate 0 — Infrastructure readiness (NEEDS OWNER APPROVAL)

Facts and the scheduler comparison are in `FAITHMAP_INFRASTRUCTURE_AUDIT.md` (Z-01, Z-02, Z-07) and are unchanged.
- **B-1:** Vercel Hobby terms say "personal or non-commercial use" with no definition. A written Vercel reply is required. I cannot send it. Text is in the checklist.
- **B-2:** Legacy Cron fails `DEC-01` on Hobby. Vercel Schedules (beta) runs 0–15 minutes late. Recommendation unchanged. Needs your decision.
- No Vercel project, Neon database or deployment exists.

---

## Gate 1 — Phase 3B verification (NEEDS OWNER APPROVAL)

**Reviewed line by line:** `cares/service.ts`, `team-field-points/service.ts`, `ingestion/service.ts` (staging, promotion, issue resolution, location, rollback, mappings, linking), the three API routes, `authz/policy.ts`, and the authorization guards of all 18 exported service functions.

### Defects found and fixed (each has a regression test in `tests/gate1-phase3b-review.test.ts`; red phase run before the fix)

| ID | Severity | Defect | Fix |
|---|---|---|---|
| R-1 | **Critical** | Rollback deleted every member the batch created, including **verified** members, members with attendance history, and steward assignments linked to real accounts (cascade). | Rollback archives when any of these exist. It deletes only an untouched batch. |
| P-1 | **High** | A new row with the same member code as an existing member attached to that member, with no name check. Two people could merge and growth data could land on the wrong person. | Same person only if names agree. Otherwise a blocking `member_code_collision` issue; row is not promoted. |
| P-5 | **High** | The sheet's "ผู้รับผิดชอบกลุ่ม" was imported as `care_leader`. The PRD defines it as the Group Leader. After linking, the user got supervisor scope, not group-leader scope. | Imported as `group_leader`. |
| R-3 | High | Steward linking could re-point an already linked assignment to another account, accepted missing or suspended users, and could cause a raw database error. | Validated: unlinked and current assignment, existing active account, no duplicate role in scope. |
| C-2 | High | Promoting a secondary care steward to primary revoked the old primary first, then failed on a unique index. The care ended with **no primary steward**. | One transaction. Promotion updates the existing row. Same request twice is a no-op. |
| R-4 | Medium | "Assign body to unassigned group" overwrote the body of any group and did not check the body exists. | Only a group with no body; body must exist; clear 409. |
| T-1 | Medium | Any signed-in account (including a LINE-registered user with no role) could read coordinator names and the whole registry overview. | Requires an organizational scope. |
| I-1 | Medium | Import preview was open to any signed-in user and had no size limit. | Admin only. Limits: 500 groups, 20,000 members, 2,000 characters per text, 20 KB per `rawCells`. |
| — | Low | Unique-key races (same file staged twice, same care code, same group code on promotion) returned raw database errors. | Clear 409 or idempotent result. Real-PostgreSQL race tests pass. |

### Owner decisions on Gate 1 (answered in round 4, now applied)

1. **Cross-group duplicates:** done. See Round 4, item A.
2. **Growth columns Y–AD:** **BLOCKED.** No source workbook exists on this machine. The importer no longer guesses by letter. See Round 4, item B.
3. **Issue re-decision:** done as immutable decisions. See Round 4, item C.

### Not verified
Performance of staging (one insert per row, so slow on a remote database for thousands of rows). `ilike` search treats `%` and `_` typed by the user as wildcards (no injection; parameterized).


---

## Gate 2 — Database and security hardening (IN PROGRESS)

### Your 9 listed items

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Drizzle migration history | **Done** | `drizzle/0000_baseline.sql` (generated) + `0001_immutable_triggers.sql` (custom). Baseline compared with the old DDL on PostgreSQL 16: 486 columns, 177 constraints, 108 indexes identical. The comparison missed triggers. A test caught that. Triggers are restored in migration 0001. |
| 2 | No schema change at request time | **Done** | Remote databases are only checked (`assertMigrated`). Readiness returns 503 `DB_NOT_MIGRATED` if migrations are missing. Local PGlite outside production still self-migrates. |
| 3 | Controlled migration | **Done (command)** | `npm run db:migrate` refuses a remote host unless `FAITHMAP_CONFIRM_MIGRATE_HOST` names it. **No CI workflow was created.** |
| 4 | TLS verification | **Done** | Non-local hosts always verify certificates. `sslmode` is removed from the URL so it cannot override. Pool size defaults to 5 (`DATABASE_POOL_MAX`, max 20). |
| 5 | Secure passkeys | **Done** | `@simplewebauthn/server` 14.1.0 (MIT). Registration and sign-in verified: challenge, origin, RP ID, user verification, signature, counter, one credential per account, revocation. Tested with a software authenticator that builds real WebAuthn objects. The old unverified `enroll_passkey` action is removed. **Not tested with a real browser or device.** |
| 6 | Bootstrap admin | **Done** | Advisory lock; two concurrent runs create one admin (real-PostgreSQL test). Refuses a weak or demo password. Does not run the app start-up path, so it cannot seed demo data. |
| 7 | Login limiting and enumeration | **Done** | 5 failures per username or 20 per address in 15 minutes. Unknown users cost the same time as wrong passwords (timing test). Same error text. |
| 8 | Sessions, cookies, CSRF, authorization | **Partly done** | Idle timeout 72 h, absolute 7 days, 10 sessions per user, secure cookies forced in production, `Origin` check on every state-changing route, CSRF token unchanged. **Authorization of `reports`, `pastoral`, `organization`, `insights`, `workspace` routes was not reviewed.** |
| 9 | Regression tests | **Done** | Every fix above has a test. |

Also: backup and restore procedure verified on **local** PostgreSQL (see test table). **Not verified on Neon.**


### Authorization review of the older routes (round 3)

**Scope:** `reporting`, `pastoral-care`, `organization`, `insights`, `notifications` and `audit` services (all 38 exported functions mapped to their guards), and the `reports`, `pastoral`, `organization`, `insights` and `workspace` routes. I read the state machine, role assignment, status change, export and visitor code in full.

**Confirmed correct (evidence in code and existing tests):**
- `CD-08`: exactly one code path sets a report to `approved` (Body Leader approval). The cutoff job only changes the period status and sends reminders.
- `DEC-05`: self-approval and self-review are refused. `DEC-04`: the supervisor step comes before approval. `CD-07`: blocked reports cannot be approved.
- Notifications are owner-scoped. Idempotency keys include the user, so no cross-user replay. Security audit logs are admin-only at the route.
- Draft reports are hidden from other viewers. Visitor phone numbers exist only with consent (database check).

**Defects fixed** (each has a test in `tests/gate2-legacy-routes-authz.test.ts`; the first run failed to load until the code existed):

| ID | Severity | Defect | Fix |
|---|---|---|---|
| A-1 | **Critical** | `revokeAssignment` had no check for **care-scope** assignments (Phase 3B). Any signed-in user who knew an assignment ID could end a care steward. | Care assignments need authority over the care's Body. Unknown scopes are admin-only. |
| A-2 | **Critical** | An `admin` could suspend a `super_admin` or another admin and lock out the account that approves registrations. | Only a `super_admin` can change admin or super_admin status. |
| A-3 | **High** | Any Body Leader, pastor or admin could create the immutable meeting brief at any time. An early brief replaces the official Sunday 20:30 brief with an incomplete one (`DEC-01`). The cron path with an explicit period had no time check either. | Time guard inside the generator for every caller. Manual trigger is admin-only. A race returns the first brief. |
| A-4 | **High** | Report attendance accepted any member ID, including members of other groups, and duplicates. | Members must be active in the group, once each. |
| A-5 | **High** | Reports could be saved or submitted for a future or closed period. | Refused with 409. Late reports in an open period stay allowed. |
| A-6 | **High** | Report updates had no version or status condition. Two decisions at once (or a draft save during a submit) could overwrite each other. | One guarded update. Real PostgreSQL race test: exactly one winner. First-insert race returns 409. |
| A-7 | **High** | `review` and `approve` could be sent without `expectedVersion`, so a reviewer could approve content they had not seen. | Required in the API. The web UI already sends it. |
| A-8 | **High** | Pastors (read-only role) could register visitors and change follow-ups. A visit could be attached to another group's report. A visitor could be moved into any group the user could access, without access to the origin group. | Steward-only writes (admin, Body Leader, assigned steward). Report must belong to the group. Origin group access required. |
| A-9 | **High** | CSV export did not neutralize formulas. A visitor named `=HYPERLINK(…)` would run in Excel. | Leading apostrophe for formula-like cells. Phone numbers and plain numbers are kept. |
| A-10 | Medium | Body Leaders could grant `other_authorized`, which `DEC-09` does not list. It gives group-member data access. | Admin-only. The three listed roles stay allowed. |
| A-11 | Low | Member code was the last 6 digits of the clock and could collide. Missing body or duplicate group code gave raw database errors. | Random 40-bit codes. Clear 404 and 409 errors. |

An existing test (`workflow-and-constraints`) created the brief in mid-week. That is the A-3 behavior. I moved its clock to after the scheduled time. Its purpose (immutability and idempotency) is unchanged. Nothing else in that test changed.

**Open owner decisions from this review (not changed):**

1. **Brief visibility.** Body Leaders can read the brief of all Bodies. It contains other Bodies' group names, follow-up titles and prayer themes. Should Body Leaders see only their own Body?
2. **Reports after the brief.** The plan says late reports after the brief are allowed and the brief stays unchanged. The live data then differs from the brief. Keep this, or close the period at a set time?
3. **Member consent.** `createGroupMember` records "consented" for every new member, with a consent time, without asking. Phone and email are stored. Should consent be captured on purpose?
4. **Care-level leaders.** A Care Leader assigned at care level (Phase 3B) does not get review rights over the care's groups. Only group-level assignments do. This is safe, but it may not be what you expect.
5. **LINE inside the database transaction.** Report submit sends LINE messages while its transaction is open. A slow LINE call holds the transaction. A rollback after a send would leave a message about a report that does not exist. Needs a send-after-commit queue (Gate 5).
6. **Admins managing admins.** I made admin accounts changeable only by a super_admin (A-2). Confirm this is the rule you want.

**Not reviewed:** `listBodiesWithLeaders`, `listGroupsWithContext`, `getDashboardOverview` and the draft-masking functions were read through their guards but not traced line by line. Input length limits on the `organization` and `pastoral` routes.

### Remaining vulnerabilities and gaps

| ID | Risk | Item |
|---|---|---|
| G2-1 | ~~High~~ **Reviewed in round 3** | See "Authorization review of the older routes" below. 10 defects fixed. 6 owner decisions open. |
| G2-2 | Medium | Rate limit uses `x-forwarded-for`. Safe on Vercel. Not safe behind an unknown proxy. Only password login and challenge creation are limited. |
| G2-3 | Medium | A locked username blocks the real user for 15 minutes (accepted trade-off; your call). |
| G2-4 | ~~Medium~~ **Closed in round 6** | Challenge and used-token cleanup built and tested (see Round 6). |
| G2-5 | Medium | No session revocation on password change (no password-change feature exists yet). |
| G2-6 | Medium | Logs and error text were not scanned for PII. Also not done: a review of input limits on `organization` and `pastoral` routes. (Report and ingestion routes have limits.) |
| G2-7 | Medium | `ensureSeeded` and demo accounts still exist for local use. The default password `FaithMap2026!` is public in the source. They never run in production. |
| G2-8 | Low | Older inline-DDL databases (local `.data`) cannot be upgraded. Delete `.data` and start again. No other database exists. |

---

## Round 6 — challenge and used-token cleanup (G2-4)

- **Problem:** `auth_challenges` (one row per sign-in attempt) grew without limit, and `used_id_tokens` was cleaned only when a new token was saved. On Neon Free (0.5 to 1 GB) unbounded growth is a cost and availability risk. Rows also hold the caller IP address.
- **Built:** `purgeExpiredAuthData` (`src/server/modules/line-identity/cleanup.ts`).
  - Deletes a challenge **1 hour after it expires** (used or not). Deletes a used ID token **10 minutes after it expires**. The margin covers clock differences, so cleanup cannot open a replay window: LINE ID tokens live 1 hour and the verifier already refuses an expired token.
  - Bounded: at most 1000 rows per table per call (default). It reports `more: true` when the limit is reached.
  - **Never touches** audit logs, users, sessions or registration requests (tested by row counts).
- **Two triggers, so it does not wait for the scheduler decision (B-2):**
  1. Opportunistic: creating a challenge removes up to 100 old rows. A failure is ignored and never blocks sign-in.
  2. Job `POST /api/internal/jobs/cleanup_auth_data`, protected by the cron secret (`Authorization: Bearer`). It returns counts only. Wire it to a schedule when B-2 is decided.
- **Tests:** `tests/gate12-challenge-cleanup.test.ts`, 9 tests: old rows deleted; live, used-but-unexpired and recently expired rows kept; token grace margin; batch limit over several calls; idempotent and safe on an empty database; audit, users and registration rows unchanged; challenge creation cleans up and the new challenge still works; the job returns `401` without the secret, with a wrong secret and with a non-Bearer scheme, and returns counts only with the right secret. Plus **one real PostgreSQL test**: three purges at once, all succeed, the live row stays, every expired row is gone.
- **Results:** typecheck exit 0. Local tests: 263 passed, 16 skipped (the skipped file is real PostgreSQL). Real PostgreSQL 16.15: 16 passed. Build exit 0. CI result for this commit is recorded below only after GitHub reports it.
- **Not done:** the cleanup has no schedule yet (needs B-2). Session rows (`sessions`) are not purged: expired sessions stay until a separate retention rule is decided (low volume, about 100 users).

---

## Round 5 — CI proof, PII audit, input limits, authorization matrix, LINE readiness

### A. GitHub Actions (priority 1)
- **Result for `23addf7`: success** on both triggers (push, pull request). Job `verify`, about 3 minutes. Steps: `npm ci`, typecheck, tests, build. The log shows 23 test files, 193 tests passed, **no skip** of the real-PostgreSQL file (15 tests ran on the service container). Build passed.
- **Log leak check:** the database URL appears as `***`. The PostgreSQL service log shows constraint errors from deliberate race tests: they contain generated ids and batch codes only (synthetic data). No token, secret, member name or phone in the log.
- **Findings:** (1) the CI password is a throwaway test value written in the workflow (acceptable, documented). (2) Vite warned about a dynamic import in a test (cosmetic). (3) GitHub warns that Node 20 action runtimes are deprecated (`actions/checkout@v4`, `setup-node@v4` are forced to Node 24). (4) `npm audit`: 1 high and 4 moderate. See B-5.
- **Run on `48df4f7` (all round 5 code and documents):** push run **43679421733: success**. Every step passed: `npm ci`, typecheck, tests (81 s, includes the real-PostgreSQL file), build (13 s). Total about 2.5 minutes. The matching pull-request run 43679427428 ended **cancelled**, not failed: my next docs push started a newer run and the workflow cancels older runs of the same branch (`cancel-in-progress`). **Final check on `436e684`:** push run 43679635162 **success**; pull-request run 43679641831 **success** (completed 05:10 UTC). Both are GitHub results, not local ones. The PostgreSQL service log again shows only deliberate-race constraint errors with generated ids and synthetic test LINE ids. No secret or member data. I did not read the per-file test counts from this log (only step results). Local result on the same code: 254 passed, 15 skipped (real-PostgreSQL file skipped locally; it ran in CI).

### B. PII and secret leakage audit (priority 2)
Scope: all `src`, scripts, workflow, git history (secret pattern scan), logs, API errors, audit rows, LINE identity, import.

| ID | Severity | Finding | Fix | Regression test |
|---|---|---|---|---|
| B-1 | **High** | Any unexpected error returned `err.message` to the client. A database error contains the **full SQL and the bound values** (names, phone numbers). A JSON syntax error echoed part of the body. Proven with a probe. | Unknown errors return a fixed Thai 500 message. JSON errors return `400 INVALID_JSON`. The server logs only error type, PostgreSQL code and constraint name (`describeErrorForLog`). | `gate8` (5 tests) |
| B-2 | **Medium** | Failed-login audit rows stored the **typed username** as `targetId`. People type passwords there. Audit rows are permanent. | The key is now a peppered HMAC (`loginTargetKey`). The audit trail and the per-username rate limit still work. Nothing is deleted. | `gate8`: typed password absent from every audit column; 6th try still `429` |
| B-3 | Low | Operator scripts (`db:migrate`, `db:seed`, `db:bootstrap-admin`) printed raw errors (bound values possible). | Same safe describer. | `gate8` static guard |
| B-4 | Low | Validation errors returned library issue objects. | Only path and rule code are returned. | `gate9` |
| B-5 | **High** (dependency) | `zod` 3.x: memory exhaustion on oversized constrained collections (npm advisory). | Upgraded to 4.6.7. Two `z.record` calls adapted. | all suites |
| B-6 | Info | 4 moderate advisories, all in dev tooling (`drizzle-kit` → `esbuild`, dev-server request exposure). The offered fix is a downgrade to `drizzle-kit@0.18.1`. | **Not applied.** Dev tool only; never runs in production. Owner may accept the risk or ask me to evaluate a newer `drizzle-kit`. | n/a |

- **No finding:** no committed secret in the tree or in the git history (pattern scan for connection strings, JWTs, cloud and GitHub tokens, private keys, channel secrets). The only credential-like strings are the throwaway CI password, fake URLs in tests, and `.local` demo emails (never created in production).
- **Checked and correct:** LINE ID tokens are stored only as hashes; the LINE subject is never returned to reviewers; `actor.user` has no password hash; members' phone and email are masked for non-direct viewers; import issue text is PII-free (tested earlier); audit metadata holds ids only.
- **New guard:** a static test fails if a `console.*` call appears outside four allowed files, or logs a raw error, token, password, secret, connection string or LINE id.
- **Audit trail:** nothing was deleted or rewritten.

### C. API input limits (priority 3) — `organization` and `pastoral`, and every other route
- **Body size:** new `readJsonBody`: 64 KB default, 256 KB for reports, 8 MB for ingestion. Enforced **while reading**, so a missing or false `Content-Length` does not help. Counts bytes (Thai = 3 bytes). `413 PAYLOAD_TOO_LARGE`. Applied to **all** routes that read a body (also the anonymous login route).
- **Depth:** 20 levels, checked without recursion. `400 INPUT_TOO_DEEP`. A 30,000-level body does not crash.
- **Strings:** every text field in both routes has a maximum (names 120, notes 2000, reasons 500, phone 20, email 254, and so on). `targetAttendance` is capped at 1000 (an unbounded integer caused a database overflow, a `500`). `visitedOn` must be a date.
- **Login:** username max 80, password max 200. Before this, a huge password cost a full hash on an anonymous route.
- **Arrays:** the two routes take no arrays. Reports (300 attendance rows) and ingestion (500 groups, 20,000 members) kept their limits.
- **Pagination:** these two routes have no list endpoint. Lists in `workspace` are scoped; notifications are limited to 40. A paginated workspace is **not built** (pilot size is about 100 users).
- **Rate limit:** 30 writes per minute per user per route family (`429`). It is in memory of one server instance. On Vercel each instance counts alone, so it stops a runaway client, **not a distributed attack**. Use the Vercel Firewall for that (owner action).
- **Errors:** invalid JSON, wrong types, unknown actions: always `400`, never `500`, no echo.
- **Business logic:** unchanged. A valid create still returns `201`.
- **Tests:** `gate9-input-limits.test.ts`, 22 tests, through the real route handlers with a real session.

### D. Authorization matrix (priority 4)
`tests/gate10-authz-matrix.test.ts`: **28 tests** through the real route handlers with real sessions for nine demo roles (group leader ×3, body leader, supervisor, pastor, admin, super admin, no role). They cover:
- **Read:** reports (own group, other group, other body, no role, pastor), report lists, workspace (leader, body leader, no role, admin), growth (cross-body, pastor, no role), CSV exports, LINE registration list, ingestion, cares, field points.
- **Write:** save draft, review, approve, unblock, self-approval; create member, register visitor, convert visitor, update follow-up (cross-group, cross-body, pastor, no role); organization (create group, assign role, self-promotion, cross-body transfer, `body_leader` and `other_authorized` grants, account status, revoke); `generate_brief`; ingestion; cares; notifications.
- **Integrity:** CSRF missing on five write routes; foreign `Origin`.
- **Result: no authorization defect found.** Five first-run differences were test mistakes (field names; empty scoped lists instead of `403`; a scope check before an authority check). The tests now assert the real, safe behavior.
- Together with the 33 unauthenticated-route tests, the 14 legacy-route tests and the earlier LINE and growth tests, every listed route has unauthenticated, no-scope, cross-group, cross-body and role-escalation evidence. **Cross-care:** care routes return empty lists to unscoped users (tested); care steward scope is covered by `phase3b1` and `gate1` tests.
- The menu hiding in the app is **not** used as a control: every test calls the server.
- **Still open from earlier:** the 6 owner decisions on authorization (see round 3).

### E. LINE integration readiness (priority 5)
Full report: `FAITHMAP_LINE_MINIAPP_READINESS.md`. Summary:
- SDK `@line/liff` 2.32.0 (latest). No secret is needed for the ID-token flow. Audience = Channel ID `2012616582`. LIFF ID `2012616582-tsDHY0DR` matches the channel.
- **New:** `npm run check:line-config` (prints pass/fail only), `isAcceptableEndpointUrl` (refuses LINE default and LIFF URLs, `http`, fragments, credentials), replay-retry loop guard, `engines.node = 22.x`, `.env.example` notes.
- Official docs: each internal channel has its **own** Channel ID and LIFF ID, so Preview/Developing and Published need different values.
- `developers.line.biz` is **blocked** from this session. I used search excerpts only. Two points are **not verified**: who may open a Developing MINI App, and whether `localhost` works as an endpoint.
- **Vercel (read-only):** project `faithmap` exists; previews of this branch build and are READY; **no environment variables**; SSO protection **on**; no database. So a real LINE login **cannot work yet**.
- **High finding V-A:** an old deployment with target `production`, built from the **first** commit (before the security fixes), exists. It is hidden by Vercel Authentication only. See owner actions.
- Default Endpoint URL must **not** be used as a FaithMap endpoint (enforced by the checker). Candidate endpoint: the branch alias `/mini` (see the readiness document).

### F. Real device test readiness (priority 6)
`FAITHMAP_REAL_DEVICE_TEST_PLAN.md`: 18 cases for iPhone Safari, iPhone LINE, Android LINE. **Status: BLOCKED.** No device test was run. The 84 + 52 browser checks are desktop Chromium with the mock and do not count.

### G. Remaining blockers and risks
| ID | Level | Item |
|---|---|---|
| V-A | **High while reachable** | Old production deployment from the first commit. Protected only by Vercel Authentication. Do not disable that protection until it is removed. |
| E-1…E-4 | Blocker | Neon database, Vercel variables, protection decision, Endpoint URL (owner). |
| B-1 (Gate 0) | Blocker | Vercel Hobby written eligibility. |
| B-2 (Gate 0) | Blocker | Scheduler decision. |
| R-1 | Medium | In-memory rate limit does not stop a distributed attack. |
| R-2 | Medium | Older test files still run on PGlite only (CI runs the real-PostgreSQL file). |
| R-3 | ~~Low~~ Closed | Challenge cleanup built (Round 6). |
| R-4 | Low | GitHub Actions Node 20 runtime deprecation warning. |
| R-5 | Info | 4 moderate dev-tool advisories (B-6). |

### H. Owner actions (new)
1. **Decide on V-A:** remove the old production deployment (dashboard) or tell me to prepare a clean one. Keep Vercel Authentication on meanwhile.
2. Create the Neon project and `development` branch (free). Run `db:migrate` and `db:bootstrap-admin` yourself.
3. Set Vercel Preview variables: `AUTH_SESSION_PEPPER`, `CRON_SECRET` (sensitive, 32+ random characters), `APP_BASE_URL`, `LINE_LOGIN_CHANNEL_ID=2012616582`, `NEXT_PUBLIC_LIFF_ID=2012616582-tsDHY0DR`, `DATABASE_URL` (pooled). Never paste values in chat.
4. **Decide E-3:** turn Vercel Authentication off for Preview, or provide another way for the LINE browser to open the page.
5. Set the Endpoint URL in the LINE console to the FaithMap `/mini` URL (not the default URL).
6. Check in the console who can open the Developing app and whether `localhost` is accepted. Tell me the answers.
7. Get 2 or 3 church test LINE accounts and phones, then run the device plan.
8. Optional: add Vercel Firewall rate-limit rules on `/api/v1/auth` and `/api/v1/line`.

### I. Commits of round 5
`daadbb4` PII and secret fixes · zod upgrade commit · `77b8ff8` input limits · `d22f604` authorization matrix · `773dfb5` LINE config tools · `c7a135a` LINE and device documents · this status update (hash below).

---

## Round 4 — data integrity, immutable decisions, MINI report form, CI

### A. Duplicate review rule (owner decision 1) — done
- **Defect found:** only the first row of a cross-group duplicate set went to `pending_review`. The other rows stayed promotable, so the second person of a duplicate pair was created automatically.
- **Fix:** every row of the candidate set is `pending_review` and has its own issue. No row is promoted or merged by itself. A person decides each row.
- Two existing tests encoded the old behavior. I changed them to the new rule (`phase2-ingestion-and-flex`, `phase3b2-4-promotion-safeguards`).

### B. Growth columns Y–AD (owner decision 2) — BLOCKED
- Search for `*.xlsx`, `*.xls`, `*.xlsm` on this machine: **none found.** The mapping cannot be inspected.
- **Defect found:** the importer read column letters `Y` to `AD` as growth fields when no field name was given. That is an unverified guess.
- **Fix:** letter fallbacks removed. Growth fields come only from explicit fields or named headers. Raw cells stay stored in provenance. Test: a row with only `Y`–`AD` cells creates no growth record and keeps the raw cells.
- **Owner action:** send the original workbook (without personal data, or with names removed) and the header row of the growth sheet, through a channel you control.

### C. Immutable data-quality decisions (owner decision 3) — done
- New table `data_quality_decisions` (migrations `0002`, `0003`). Fields: issue, decision type (`approved_fix`, `rejected`, `resolved`, `deferred`, `reversed`), `supersedes_decision_id`, reason (not blank), actor, timestamp.
- **Append-only:** a database trigger blocks `UPDATE` and `DELETE`. Another trigger rejects a decision that supersedes a decision of a different issue.
- **Concurrency:** two partial unique indexes allow one first decision per issue and one successor per decision. A second concurrent decision fails with `409 DECISION_CONFLICT`. An optional `expectedDecisionId` gives `409 DECISION_STALE` for an old screen.
- **Reversal:** a `reversed` decision re-opens the issue and puts the staging row back to `pending_review`. Reversal with nothing to reverse gives `409 NOTHING_TO_REVERSE`.
- **Lock:** after the row becomes a member, a new decision gives `409 DECISION_LOCKED`.
- **Access:** same rule as before (admin; Body Leader only for groups in their Body). Reading the history uses the same rule.
- The `dq_issues` row keeps a projection of the latest decision for lists. The decision table is the record. Each decision also writes a security audit row.
- **Tests:** `tests/gate5-dq-decisions.test.ts` (chain, reversal, stale, reason, lock, scope, trigger with raw SQL, cross-issue chain) and a **real PostgreSQL race test**: two decisions at once leave one winner (twice).

### D. Rollback protection (priority 2) — 2 defects fixed
- A growth row added by a later batch to a member from an earlier batch stayed after rollback with no group. Rollback now removes the unreviewed (`RAW`, `INCOMPLETE`) growth rows of the rolled-back batch. Reviewed rows stay.
- A growth row of the batch that a person had already verified was deleted with its member. It now counts as history, so the batch is archived instead of deleted.
- Verified: promotion never updates an existing member. A reused member needs a person's approval first (`duplicate_existing_member`).

### E. MINI App weekly report form (priority 4) — built
- Files: `src/components/mini/MiniReport.tsx`, `src/lib/mini-report.ts`. It uses the existing `/api/v1/reports` contract. No server rule was copied or weakened.
- **Leader:** edit and send a new, draft or returned report. Draft save never sends it (CD-01). Submit needs two taps. Every member must be marked (present, absent, excused) before submit. Nobody is pre-marked. Member counts come from the marks.
- **Supervisor:** forward to the Body Leader, or send back with a reason. **Body Leader:** approve or send back. Approve is hidden before the supervisor reviews (DEC-04) and for the person who submitted (DEC-05). Approved is read-only. No automatic approval exists (CD-08).
- The screen hides actions by role. The server still enforces every rule.
- **Tests:** `tests/gate6-mini-report.test.ts` (16 tests: rules per role and status, validation, payload accepted by the real API schema). Browser: 52 of 52 checks (see test table). It uses the demo seed states: approved, draft, returned, submitted with and without a supervisor.
- **Not tested:** real LINE, real phone, concurrent edits from two phones in a browser (the server version check is tested in the service and on real PostgreSQL).
- **Not built:** offline draft, adding a visitor from the report screen.

### F. Route authorization sweep (priority 1) — done for the listed modules
- `tests/gate7-unauthenticated-routes.test.ts`: 33 tests. Every protected route and method returns 401 with no cookie and with a made-up cookie, and the body leaks no stack or SQL text.
- Public by design and not in that list: login, LINE challenge and login, passkey login, health, internal jobs (CRON_SECRET).
- The cross-group, no-scope and unauthorized-mutation tests are in `gate2-legacy-routes-authz`, `gate1-phase3b-review` and `gate4-mini-app` from earlier rounds.

### G. CI (priority 5) — written, not yet run on GitHub
- `.github/workflows/ci.yml`: `npm ci`, typecheck, `npm test`, `npm run build`. A PostgreSQL 16 service container runs the real-PostgreSQL tests with a throwaway password written in the workflow. No repository secret is used. Permissions: `contents: read`.
- **Risk:** the first GitHub run can differ from local (for example the schema reset inside the real-PostgreSQL test file). I will fix any difference after the first run.

### Remaining risks after round 4
- **No critical defect is known and open** in the code I reviewed. This is not a pass: PII-in-logs, input limits on two routes, older tests on real PostgreSQL, real LINE and real devices are not checked.
- Gate 0 blockers (B-1, B-2, no Vercel, Neon or LINE resources) still block any deploy.
- The 6 authorization decisions and the Gate 1 growth mapping are still with the owner.

---

## Gate 3 — LINE identity (BLOCKED on a real LINE channel)

Full evidence and design: `docs/FAITHMAP_LINE_AUTH_DESIGN.md`.
- **Incompatibility found:** my first design required a `nonce` claim. Official LINE docs show `liff.login()` has no nonce option, and the claim exists only if the authorization request had one. A real LIFF login would have been rejected.
- **Fix:** LIFF tokens are verified through LINE's verify endpoint (issuer, audience, subject, expiry, issued-at). Each token is single-use (`used_id_tokens`). Challenges stay for purpose and user binding. Strict nonce mode remains in the verifier for a future web authorization-code flow (not built).
- **Residual risk:** an unused stolen token works once within its 1-hour life.
- **Not tested:** any call to real LINE. Checks C1–C5 in the design document need your LINE channel.

## Gate 4 — MINI App (IN PROGRESS)

Built at `/mini`:
- Sign-in (LINE and password), registration request, "waiting for approval" screen.
- Role-aware home menu in simple Thai (`src/lib/mini-nav.ts`, tested).
- Reports list, group information, growth records (new scoped API `/api/v1/growth`, DEC-06 rules, tested), notifications with mark-as-read, super-admin approvals, account linking.
- **Mock LIFF adapter:** development only. Chosen only outside production and only if `NEXT_PUBLIC_FAITHMAP_MOCK_LIFF` is exactly `true` (tested). It returns a token starting with `MOCK`. The server rejects that token before any network call (tested). The mock code is absent from production builds (checked by `grep`). It cannot sign anyone in.
- **Browser results:** 84/84 checks at 360/768/1280 px: no horizontal scroll, every tap target ≥ 48 px, every text ≥ 16 px, visible focus, mock sign-in refused by the server, password sign-in reaches each screen. The status badge font was 14 px and was raised to 16 px for the whole app.
- `@line/liff` 2.32.0 added. It is governed by the **LINE Developers Agreement**. I could not read that agreement (host not allowed). I found no fee. **Owner: read the agreement.**

**Weekly report form:** built in round 4 (see Round 4, item D). **Not built:** member-only home content, Thai word-break tuning, offline draft support. **Not tested:** the real LIFF SDK, the LINE in-app browser, real phones.

## Gates 5–8
Not started. Reminder for Gate 5: do **not** set `LINE_OA_CHANNEL_ACCESS_TOKEN` before the quota guard exists.

---

## Environment variable names (names only)

| Name | Where | Note |
|---|---|---|
| `DATABASE_URL` | all | Use the Neon **pooled** host for the app, the **direct** host for migrations. |
| `DATABASE_POOL_MAX` | optional | Default 5, max 20. |
| `DATABASE_SSL_CA` | optional | Custom CA, if needed. |
| `APP_BASE_URL` | all | **Now required** for passkeys and the `Origin` check. |
| `AUTH_SESSION_PEPPER`, `CRON_SECRET` | production | 32+ characters, no defaults. |
| `FAITHMAP_DEMO_MODE` | local only | `true` enables demo switching. Never works in production. |
| `NEXT_PUBLIC_FAITHMAP_MOCK_LIFF` | local only | `true` enables the mock adapter. Never works in production. |
| `NEXT_PUBLIC_LIFF_ID` | production | From your LINE channel. |
| `LINE_LOGIN_CHANNEL_ID` | production | Must equal the `aud` of the ID token (check C1, C3). |
| `FAITHMAP_CONFIRM_MIGRATE_HOST` | migration command | Host name from the connection string. |
| `FAITHMAP_ALLOW_REMOTE_SEED` | staging only | Allows explicit seed on a remote database. |
| `FAITHMAP_BOOTSTRAP_USERNAME`, `_NAME`, `_PASSWORD` | local terminal | First super admin. |
| `FAITHMAP_TEST_DATABASE_URL` | tests | Database name must contain `faithmap_test`. |
| `LINE_LOGIN_CHANNEL_SECRET`, `LINE_OA_CHANNEL_ACCESS_TOKEN` | later | Not used by the new code. Do not set yet. |

## Files changed since `f7c65bd`

- **Schema and migrations:** `drizzle/` (new), `src/server/db/{schema,migrate,client,bootstrap,seed,run-migrate,run-seed,run-bootstrap-admin}.ts`
- **Identity and security:** `src/server/modules/identity/{service,crypto,bootstrap,passkeys}.ts`, `src/server/http/session.ts`, `src/server/modules/errors.ts`, `src/app/api/v1/{auth,line,passkeys}/route.ts`, `src/app/api/health/ready/route.ts`
- **LINE:** `src/server/modules/line-identity/{verifier,service}.ts`, `docs/FAITHMAP_LINE_AUTH_DESIGN.md`
- **Phase 3B:** `src/server/modules/{ingestion,cares,team-field-points,growth}/…`, `src/app/api/v1/{ingestion,growth}/route.ts`
- **MINI App:** `src/app/mini/page.tsx`, `src/components/mini/*`, `src/lib/liff/*`, `src/lib/mini-nav.ts`, `src/app/globals.css` (badge font)
- **Tests:** `tests/gate1-phase3b-review.test.ts`, `gate2-*.test.ts` (4 files), `gate3-line-identity.test.ts`, `gate4-mini-app.test.ts`, `real-postgres.test.ts`, `tests/helpers/software-authenticator.ts`, `scripts/e2e-mini.mjs`
- **Packages:** `@simplewebauthn/server`, `@line/liff` (both free)

## Breaking changes to review before any deploy

1. The demo switcher needs `FAITHMAP_DEMO_MODE=true`. It never works in production.
2. Production starts with an empty database. Run `db:migrate`, then `db:bootstrap-admin`.
3. Remote databases are never migrated by the app. The owner runs the command.
4. `APP_BASE_URL` must be set (passkeys and origin check).
5. Older inline-DDL local databases are not supported.
6. Field points, ingestion overview and growth records now require an organizational scope.

## External blockers (kept open)

| # | Blocker | Needed from |
|---|---|---|
| B-1 | Vercel Hobby written eligibility reply | Owner |
| B-2 | Scheduler decision | Owner |
| B-3 | Vercel and Neon project setup | Owner |
| B-4 | LINE Provider and Login channel | Owner |
| B-5 | LINE channel ID and LIFF ID | Owner |

## Owner actions

See `FAITHMAP_ACCOUNT_ACCESS_CHECKLIST.md`. New items from this round:
1. Read the LINE Developers Agreement (LIFF SDK).
2. Answer the 3 Gate 1 policy questions.
3. When the database exists: run `npm run db:migrate` (with `FAITHMAP_CONFIRM_MIGRATE_HOST`), then `npm run db:bootstrap-admin`, from your own terminal.
4. Run LINE checks C1–C5 in the design document once the channel exists.

## Free-tier cost and quota risks

- **Estimated monthly cost:** 0 THB if B-1 is confirmed. Otherwise unknown.
- **Neon Free:** 100 CU-hours and 0.5–1 GB per project (sources disagree). The app uses a pool of up to 5. Single-use token and challenge tables grow; add cleanup (G2-4).
- **Vercel Hobby:** 5,000 scheduled runs per period; sign-in and report traffic well below the 1,000,000 function-call limit for a pilot. No measurement exists yet.
- **LINE OA Free:** 300 messages per month (secondary sources). No message is sent by this work. A quota guard is still to build (Gate 5).
- **GitHub Free:** 2,000 Actions minutes (private repository; B-8 still open). One CI workflow exists. **Measured:** each job takes about 3 minutes, and each push runs it twice (push and pull request), so about 6 minutes per push. It runs on every push to `main` and `claude/**` and on pull requests.
- **New dependencies:** both free (`@simplewebauthn/server` MIT; `@line/liff` under the LINE Developers Agreement, no fee found).

## Next executable tasks (no owner input needed)

1. Run all older test files on real PostgreSQL (needs a test-runtime switch).
2. Update the workflow actions to Node 24 ready versions after checking the current majors.
3. Evaluate a newer `drizzle-kit` for the 4 moderate advisories.
