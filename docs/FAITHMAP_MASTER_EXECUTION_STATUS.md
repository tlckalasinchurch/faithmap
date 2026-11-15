# FaithMap — Master Execution Status

**Updated:** 2026-11-15 (round 3: authorization review) · **Branch:** `claude/vigilant-noether-4fn1g1` · **`main` is unchanged (`e38a24e`).**
**Budget:** 0 THB/month. No paid service was used, created or enabled.
**Push / merge / deploy:** the feature branch was pushed after the tests above passed (round-2 Git rules). `main` was not touched. No pull request was opened. Nothing was deployed.

## Gate overview

| Gate | Status | Reason |
|---|---|---|
| 0 Infrastructure readiness | **NEEDS OWNER APPROVAL** | B-1 (Vercel Hobby reply) and B-2 (scheduler) are open. No Vercel project, Neon project or LINE channel exists. |
| 1 Phase 3B verification | **READY FOR OWNER REVIEW. Item 2 BLOCKED** | 8 + 2 defects fixed. Your 3 decisions are applied (see "Round 4"). Growth columns Y–AD stay unmapped: the source workbook is not available. |
| 2 Database and security hardening | **IN PROGRESS** | All 9 listed blockers are done. Older routes reviewed (10 defects fixed). Every protected route has a 401 test. PII-in-logs scan and input limits on `organization` and `pastoral` remain. |
| 3 LINE identity and authentication | **BLOCKED** | Server side is built and checked against official docs. Real LINE cannot be tested without a channel. |
| 4 LINE MINI App | **IN PROGRESS** | Screens and the weekly report form are built and browser-tested with the mock and local demo data. No real LINE, no real phone. |
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
| `npx vitest run` | **22 files passed, 1 skipped; 178 tests passed, 15 skipped** (skipped = the real-PostgreSQL file, which needs a database URL) |
| `FAITHMAP_TEST_DATABASE_URL=postgres://…@127.0.0.1:5432/faithmap_test_a npx vitest run tests/real-postgres.test.ts` | **1 file passed; 15 tests passed** on local PostgreSQL 16.15 (adds the concurrent-decision race) |
| `npx next build` | exit 0. Routes include `/mini`, `/api/v1/line`, `/api/v1/passkeys`, `/api/v1/growth` |
| `npx next build` with `NEXT_PUBLIC_FAITHMAP_MOCK_LIFF=true` | exit 0. `grep` finds no mock token or mock label in `.next` (mock is not shipped) |
| `npm ci --dry-run` | succeeds (lock file repaired) |
| `node scripts/e2e-mini-report.mjs` (Chromium, dev server, mock LIFF, demo data, fresh `.data`) | **52 of 52 checks passed** (report form at 360, 768, 1280 px, plus the draft, submit, revision, supervisor and approval flows) |
| `node scripts/e2e-mini.mjs` (re-run after the Reports screen change) | **84 of 84 checks passed** |
| `.github/workflows/ci.yml` | YAML parses. **Not run on GitHub yet** (it runs when you push this branch with Actions enabled). The same commands pass locally. |
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
| G2-4 | Medium | `auth_challenges` rows are never cleaned up. `used_id_tokens` is cleaned when a new token is saved. Add a scheduled cleanup (Gate 6). |
| G2-5 | Medium | No session revocation on password change (no password-change feature exists yet). |
| G2-6 | Medium | Logs and error text were not scanned for PII. Also not done: a review of input limits on `organization` and `pastoral` routes. (Report and ingestion routes have limits.) |
| G2-7 | Medium | `ensureSeeded` and demo accounts still exist for local use. The default password `FaithMap2026!` is public in the source. They never run in production. |
| G2-8 | Low | Older inline-DDL databases (local `.data`) cannot be upgraded. Delete `.data` and start again. No other database exists. |

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
- **GitHub Free:** 2,000 Actions minutes (private repository; B-8 still open). One CI workflow now exists. Each run is about 3–5 minutes (estimate, not measured). It runs on every push to `main` and `claude/**` and on pull requests.
- **New dependencies:** both free (`@simplewebauthn/server` MIT; `@line/liff` under the LINE Developers Agreement, no fee found).

## Next executable tasks (no owner input needed)

1. Run all older test files on real PostgreSQL (needs a test-runtime switch).
2. Add input limits to the `organization` and `pastoral` routes and scan logs for PII (G2-6).
3. Add challenge cleanup (G2-4).
4. Watch the first GitHub Actions run and fix any difference from local.
