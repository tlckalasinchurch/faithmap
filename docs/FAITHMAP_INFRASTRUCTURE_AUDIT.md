# FaithMap — Infrastructure Audit (Phase 0, Read-Only)

**Date:** 2026-11-14 · **Auditor:** Claude Code (read-only) · **Budget rule:** 0 THB/month
**Audited commit:** `e38a24e29c4c2b1663de9713f084d2ccf0c3b20c`

## 0. Summary

**Overall status: NOT READY for LINE integration.** Do not start Phase 1.

| Area | Status |
|---|---|
| Git | OK. HEAD equals origin/main. Working tree was clean. |
| Vercel | **No FaithMap project exists. No deployment exists.** |
| Database | **No Neon project is linked.** No Dev/Preview/Production separation exists. |
| Environment | No Vercel environment exists to inspect. Code has unsafe default secrets. |
| Zero-cost | **Not confirmed.** Two Vercel Hobby items are unverified (eligibility, cron). |
| LINE | Nothing is created. Server-side LINE Login verification is not in the code. |

Estimated cost if all conditions hold: **0 THB/month**. Two conditions are unproven (see Z-01, Z-02).

**Blockers to report (not resolved, no architecture change made):**
- **B-1.** Vercel Hobby may not allow this use. I could not read the official terms (Z-01).
- **B-2.** Hobby cron may not run at Sunday 20:00 and 20:30 ICT (Z-02). The product rule `DEC-01` needs these times.

**Method limits.** `vercel.com`, `neon.com` and `www.lycbiz.com` did not resolve from this session. I did not retry other hosts. GitHub pricing was read from github.com. Neon and LINE figures come from search results and the Vercel integration record. These are secondary sources. Each is marked.

**Evidence note.** I did not run tests, builds or migrations. I did not read any environment value. I did not call any write tool.

---

## 1. Git

### G-01 — HEAD matches origin/main
- Evidence: `git rev-parse HEAD` and `git rev-parse origin/main` both return `e38a24e29c4c2b1663de9713f084d2ccf0c3b20c`, after `git fetch origin main`.
- Actual status: Match. Current branch is `claude/vigilant-noether-4fn1g1`, not `main`. It points to the same commit.
- Risk: Low.
- Required action: None.
- Owner approval: No.

### G-02 — Phase 3B commit content
- Evidence: `git show --stat e38a24e`. 13 files, +2364/−60. Changes: 3 API routes, `authz/policy.ts`, `cares`, `identity`, `ingestion`, `team-field-points` services, 5 test files.
- Actual status: No change to `schema.ts`, `migrate.ts`, `drizzle.config.ts` or any environment file. No change to infrastructure files.
- Risk: Low.
- Required action: None.
- Owner approval: No.

### G-03 — Working tree clean
- Evidence: `git status --short` returned no lines before I wrote the reports.
- Actual status: Clean. The three report files in `docs/` are now untracked. I did not stage or commit them.
- Risk: Low.
- Required action: Owner decides when to commit the reports.
- Owner approval: Yes (commit decision).

### G-04 — No CI workflow
- Evidence: `git ls-files` shows no `.github/` directory. `FM-10` states "GitHub Actions" for CI.
- Actual status: Absent. Tests run only on a local machine.
- Risk: Medium.
- Required action: Add a workflow in a later, approved phase. GitHub Free gives 2,000 Actions minutes per month for private repositories (Z-04).
- Owner approval: Yes.

---

## 2. Vercel

### V-01 — No FaithMap project
- Evidence: `list_teams` returns one team, `tlckalasinchurch` (Hobby plan, status active, MFA on). `list_projects` for that team returns two projects: `puntakit-kalasin` and `graceful-giving`. A search for "faithmap" returns zero projects.
- Actual status: **Missing.** Framework, build settings and production aliases cannot be inspected.
- Risk: **High** (blocks all deployment and LINE callback setup).
- Required action: Owner creates the project (see account checklist).
- Owner approval: Yes.

### V-02 — Latest commit did not trigger a deployment
- Evidence: `list_deployments` filtered by SHA `e38a24e…` returns 0 results for the team.
- Actual status: No deployment. No Git connection exists for this repository.
- Risk: High.
- Required action: Connect the GitHub repository to a new Vercel project.
- Owner approval: Yes.

### V-03 — Legacy Puntakit project in the same team
- Evidence: Project `puntakit-kalasin` (created 2026-09, updated recently) sits in the same Vercel team.
- Actual status: Shared team. Hobby limits apply to the whole account. `CD-09` and `DEC-12` require isolation from Puntakit.
- Risk: Medium. A usage spike in one project can affect the others.
- Required action: Owner decides: same team with strict separate project, or a separate team. A new team may also need its own Hobby plan.
- Owner approval: Yes.

### V-04 — No Vercel configuration in the repository
- Evidence: No `vercel.json`, `vercel.ts` or `.vercel/`. `.vercel/` is in `.gitignore`.
- Actual status: Absent. No cron schedule exists. `next.config.mjs` lists `pg` and `@electric-sql/pglite` as server external packages.
- Risk: Medium.
- Required action: Add cron configuration in an approved phase (see V-05, Z-02).
- Owner approval: Yes.

### V-05 — Cron route method mismatch
- Evidence: Vercel documentation says cron sends an HTTP GET with `Authorization: Bearer <CRON_SECRET>`. The route `src/app/api/internal/jobs/[jobName]/route.ts` exports `POST` only. It also accepts a header `x-cron-secret`.
- Actual status: A Vercel cron call would return 405. The jobs `cutoff_check` and `generate_meeting_brief` would not run.
- Risk: **High** (the Sunday 20:00 and 20:30 rules `DEC-01` would not execute).
- Required action: Add a GET handler or change the schedule method. This is a code change. It is out of scope for Phase 0.
- Owner approval: Yes.

### V-06 — Build and framework (expected, not observable)
- Evidence: `package.json` has Next.js `^16.4.6`, React `^19.3.1`, scripts `build`, `start`. No `engines` field.
- Actual status: Framework would be detected as Next.js. No build has run on Vercel. Node version is not pinned.
- Risk: Low.
- Required action: Pin the Node version at project creation.
- Owner approval: No.

---

## 3. Database

### D-01 — No production database exists
- Evidence: The team has the Neon integration installed (plan "Free", payment method not required). Its `projects` list is empty. The Supabase integration (Free) is also installed with no projects.
- Actual status: **No Neon database is linked to any project.** No connection exists.
- Risk: High.
- Required action: Owner creates one Neon project (see checklist). Owner removes or ignores the unused Supabase integration.
- Owner approval: Yes.

### D-02 — Connection architecture
- Evidence: `src/server/db/client.ts`. If `DATABASE_URL` starts with `postgres://` or `postgresql://`, the app uses `pg` `Pool` (max 10) with Drizzle `node-postgres`. Otherwise it uses PGlite on a local folder. No `@neondatabase/serverless` package.
- Actual status: Local runs use PGlite. Remote runs use a TCP pool. Each serverless instance can open up to 10 connections.
- Risk: Medium. Many instances can exhaust Neon connections. Use the Neon pooled host name.
- Required action: Use the pooled connection string. Reduce pool `max` in an approved code change.
- Owner approval: Yes.

### D-03 — TLS check disabled for Neon
- Evidence: `client.ts:44` sets `ssl: { rejectUnauthorized: false }` when the URL contains `neon.tech`.
- Actual status: The server does not verify the certificate chain. A network attacker could intercept the connection.
- Risk: Medium.
- Required action: Remove this option in an approved code change. Neon certificates verify with default settings.
- Owner approval: Yes.

### D-04 — No Drizzle migration history
- Evidence: `drizzle.config.ts` sets `out: './drizzle'`. The `drizzle/` folder does not exist. `git ls-files` shows no `.sql` file. Schema is one string `SCHEMA_DDL` in `src/server/db/migrate.ts` (811 lines, 34 `CREATE TABLE IF NOT EXISTS`, 34 `ALTER TABLE … ADD COLUMN IF NOT EXISTS`). `FM-10` states `drizzle-kit migrate` for release.
- Actual status: Migrations are idempotent inline DDL. There is no version table, no ordered history and no rollback.
- Risk: **High** for production. A schema change cannot be reviewed or reverted as a unit.
- Required action: Owner chooses: keep inline DDL with a version table, or adopt `drizzle-kit generate` history. Update `FM-10` to match.
- Owner approval: Yes.

### D-05 — Schema and seed run on the first request
- Evidence: `src/server/db/bootstrap.ts` calls `ensureSchema` then `ensureSeeded` on the first request. `/api/health/ready` triggers this.
- Actual status: A deployed instance with an empty database creates all tables on its own.
- Risk: High (uncontrolled migration in production; conflicts with the `FM-10` "admin bootstrap" plan).
- Required action: Gate runtime migration behind an explicit flag. Approved code change.
- Owner approval: Yes.

### D-06 — Demo seed with a fixed password on an empty database
- Evidence: `src/server/db/seed.ts:61-67`. If `organization_settings` is empty, `ensureSeeded` inserts demo data. It hashes the fixed password in the source file. `switchDemoAccount` blocks only when `FAITHMAP_DEMO_MODE === 'false'`.
- Actual status: If production starts with an empty database and `FAITHMAP_DEMO_MODE` is unset, the app creates demo accounts with a known password. Demo account switching stays enabled.
- Risk: **High** (account takeover; PDPA exposure `DEC-06`).
- Required action: Set `FAITHMAP_DEMO_MODE=false` in Production before the first request. Better: remove auto-seed in production. Approved code change.
- Owner approval: Yes.

### D-07 — PostgreSQL compatibility
- Evidence: DDL uses `gen_random_uuid()`, `TIMESTAMPTZ`, `JSONB`, `CHECK` constraints and partial syntax that PostgreSQL 13 and later support. Tests run on PGlite only. `FM-10` requires PostgreSQL 16.
- Actual status: **Not proven on real PostgreSQL 16.** I did not connect to any database.
- Risk: Medium.
- Required action: In an approved phase, run `ensureSchema` against an empty Neon branch (Development). Then run the test suite against it.
- Owner approval: Yes (first database connection).

### D-08 — Environment separation
- Evidence: No Neon project. No Vercel project. No custom environments.
- Actual status: Development uses local PGlite. Preview and Production have no database. Separation is a plan only.
- Risk: High.
- Required action: One Neon project with branches `production`, `staging`, `development` (see plan). Free plan allows 10 branches per project (Z-03).
- Owner approval: Yes.

### D-09 — Backup plan conflicts with 0 THB
- Evidence: `FM-10 §3.1` requires PITR with RPO ≤ 15 minutes, daily encrypted `pg_dump` to S3/R2, and S3/R2 storage for meeting photos.
- Actual status: Neon Free restore window length is not verified. No object storage account exists. S3/R2 may need a payment card.
- Risk: High.
- Required action: Owner decides backup method within 0 THB. Do not add paid storage.
- Owner approval: Yes.

---

## 4. Environment variables (names only)

No Vercel project exists. I read no values. I did not call the environment-variable tool.

| Name | In `.env.example` | Used in code | Needed for |
|---|---|---|---|
| `DATABASE_URL` | Yes | Yes | Database |
| `APP_BASE_URL` | Yes | **No** | LINE Login callback |
| `FAITHMAP_DEMO_MODE` | Yes | Yes | Demo switch |
| `LINE_LOGIN_CHANNEL_ID` | Yes | **No** | LINE Login |
| `LINE_LOGIN_CHANNEL_SECRET` | Yes | **No** | LINE Login |
| `LINE_OA_CHANNEL_ACCESS_TOKEN` | Yes | Yes | LINE push |
| `CRON_SECRET` | Yes | Yes | Cron auth |
| `AUTH_SESSION_PEPPER` | Yes | Yes | Session hashing |

### E-01 — Unsafe default secrets in source
- Evidence: `route.ts` for jobs uses `process.env.CRON_SECRET || '<default string>'`. `identity/crypto.ts:4` uses `process.env.AUTH_SESSION_PEPPER || '<default string>'`. Both defaults are in the public-readable repository history.
- Actual status: If either variable is missing in Production, the app runs with a known secret.
- Risk: **High.**
- Required action: Fail startup when these are missing in production. Approved code change. Set both variables before deploy.
- Owner approval: Yes.

### E-02 — Missing variables for planned LINE features
- Evidence: Grep of `src` finds no `LIFF_ID`, no Messaging API channel secret (webhook signature) and no read of `APP_BASE_URL` or `LINE_LOGIN_*`.
- Actual status: Missing names: `NEXT_PUBLIC_LIFF_ID`, `LINE_MESSAGING_CHANNEL_SECRET`. Three listed names exist in the example file but code does not read them.
- Risk: Medium.
- Required action: Define names in the integration plan. Create no values now.
- Owner approval: Yes.

### E-03 — Per-environment configuration gaps
- Evidence: No environments exist. `APP_BASE_URL` needs one value per environment. `FAITHMAP_DEMO_MODE` needs `false` in Production.
- Actual status: Matrix not yet possible. Planned matrix is in the execution plan.
- Risk: Medium.
- Required action: Follow the matrix when the owner creates the project.
- Owner approval: Yes.

---

## 5. Zero-cost compliance

| Service | Plan | Est. monthly cost | Source quality |
|---|---|---|---|
| Vercel | Hobby (account `hobby`, status active) | 0 THB **if eligible** | Account data: verified. Terms: **not verified** |
| Neon | Free | 0 THB | Search results and Vercel integration data. Not read from neon.com |
| GitHub | Free organization | 0 THB | Read from github.com/pricing |
| LINE OA Thailand | Free plan | 0 THB | Search results only. Not read from LINE |
| LINE Login, LIFF, Messaging API | — | 0 THB (expected) | Not verified |

### Z-01 — Vercel Hobby eligibility (BLOCKER B-1, unresolved)
- Evidence: Account billing plan is `hobby`. I could not read `vercel.com/legal/terms` or the Hobby plan page (`ENOTFOUND vercel.com`). The documentation search tool returned no text about commercial-use limits.
- Actual status: **Unverified.** I will not state the rule from memory.
- Risk: **High.** If Hobby bans this use, the project cannot stay at 0 THB on Vercel.
- Required action: Owner reads the current Hobby terms and decides whether a church ministry tool qualifies. If unclear, the owner asks Vercel support in writing and stores the answer. I do not replace Vercel.
- Owner approval: Yes.

### Z-02 — Vercel Hobby cron (BLOCKER B-2, unresolved)
- Evidence: Two documentation searches returned cron syntax and `CRON_SECRET` examples. They returned no Hobby frequency limit. I could not read the usage page.
- Actual status: **Unverified.** `DEC-01` needs a job at Sunday 20:00 ICT (13:00 UTC) and a job at 20:30 ICT (13:30 UTC). If Hobby limits cron frequency or precision, these times fail.
- Risk: **High.**
- Required action: Owner or a later session reads the cron usage page when `vercel.com` is reachable. Alternative schedulers are architecture changes and need owner approval.
- Owner approval: Yes.

### Z-03 — Neon Free limits
- Evidence (search results, Neon FAQ updated 2026-10-01): 100 projects, 10 branches per project, 100 CU-hours per project per month, 1 GB storage per project, 5 GB public network transfer. Neon does not bill overages on Free. Writes fail when storage passes 1 GB. Vercel integration record shows 0.5 GB in one field and 1 GB in another.
- Actual status: Limits conflict between sources (0.5 GB vs 1 GB). Use 0.5 GB for planning.
- Risk: Medium. Compute budget and scale-to-zero cold starts affect response time.
- Required action: Owner confirms limits on neon.com. Add a storage alert at 70%.
- Owner approval: No (monitoring), Yes (limit sign-off).

### Z-04 — GitHub Free
- Evidence (github.com/pricing): Free organization has unlimited public and private repositories, 2,000 CI/CD minutes per month, 500 MB Packages storage. Nonprofits can request a discounted organization.
- Actual status: Meets 0 THB. Repository visibility is not known to me.
- Risk: Low.
- Required action: None.
- Owner approval: No.

### Z-05 — LINE Official Account (Thailand)
- Evidence (search results; not read from LINE): Free ฿0 with 300 messages per month. Basic ฿1,280 (15,000 messages). Pro ฿1,780 (35,000 messages). Prices exclude 7% VAT. A LINE notice dated 2026-10-30 says that from 2027-02-01 Reply API messages above 25,000 per month need a paid plan. Sources disagree on some numbers.
- Actual status: Free plan can meet 0 THB for a small pilot. Push reminders count against the 300 quota. Estimate: recipients × reminders per month. One weekly reminder to 60 leaders ≈ 260 messages per month. 70 leaders or two reminders per week exceeds 300.
- Risk: **Medium–High.** Over-quota behavior on Free is unverified. Messages may stop or may cost money.
- Required action: Owner confirms quota rules in LINE Official Account Manager. Count leaders and reminder types before Phase 6. Keep message count under 250 per month.
- Owner approval: Yes.

### Z-06 — Items in the architecture that can cost money
- Evidence: `FM-10` lists a dedicated domain (`DEC-12`), S3/R2 storage and daily off-site export.
- Actual status: A custom domain costs money. A `*.vercel.app` name costs 0 THB.
- Risk: Medium.
- Required action: Owner decides: use `*.vercel.app` for the pilot, or provide a free subdomain from an existing church domain.
- Owner approval: Yes.

---

## 6. LINE readiness

### L-01 — No LINE objects exist
- Evidence: I created nothing. No LINE credentials are in the repository (`.gitignore` excludes `.env*`).
- Actual status: No Provider, Login channel, Messaging API channel, OA, LIFF app or MINI App is known to exist.
- Risk: Medium.
- Required action: See account checklist.
- Owner approval: Yes.

### L-02 — Server-side LINE Login verification missing
- Evidence: `src/app/api/v1/auth/route.ts:39` accepts action `line_oidc` with a `lineSubject` string from the request body. Grep of `src` for `access.line.me`, `api.line.me/oauth2` and `liff` finds no verification call. `docs/FAITHMAP_SECURITY_AND_PERMISSION_MODEL.md` requires server-side verification of the ID token. `FR-13.1` and the API contract list `GET /api/v1/auth/line/start`. This route is not in the code.
- Actual status: The route trusts a client-supplied identifier. Verify this in code review before any real LINE credential is stored.
- Risk: **High** (account impersonation if a real mapping to `line_user_id` exists).
- Required action: Implement OIDC code exchange with PKCE, state, nonce and ID-token verification in Phase 1, test-first. Disable the `line_oidc` action in Production until then.
- Owner approval: Yes.

### L-03 — LINE push is implemented
- Evidence: `notifications/service.ts:59-100`. It posts to `https://api.line.me/v2/bot/message/push` when `LINE_OA_CHANNEL_ACCESS_TOKEN` is set. Without the token it logs `simulated_sent`. It writes to `line_dispatches` with a dedupe key.
- Actual status: Ready for a token. No recipient consent flow or `line_user_id` linking flow exists. No webhook route exists for follow and unfollow events.
- Risk: Medium.
- Required action: Add a webhook route with signature check in Phase 6.
- Owner approval: Yes.

### L-04 — Documentation of LINE architecture
- Evidence: `DEC-03`, `DEC-07`; `FM-10`; `FAITHMAP_PHASED_IMPLEMENTATION_PLAN.md` (Phase 3 Login, Phase 6 LIFF and OA). Decision register lists owner actions: "LINE Login Channel ID/Secret" and "LINE OA Messaging Channel & LIFF App registration credentials".
- Actual status: The docs do not name a LINE Provider structure, a callback URL, or a policy on MINI App. No document named "FAITHMAP — ZERO-COST INFRASTRUCTURE POLICY" exists in the repository (search for "zero-cost" and "0 THB" in `*.md` found nothing).
- Risk: Medium.
- Required action: Owner supplies the zero-cost policy document. Plan defines the LINE structure for approval.
- Owner approval: Yes.

### L-05 — LINE Login channel needs a stable HTTPS callback
- Evidence: `.env.example` comment says `APP_BASE_URL` is "used for LINE Login OIDC callback". No deployed URL exists (V-01).
- Actual status: LINE setup cannot be completed until the Vercel production URL is known.
- Risk: Medium.
- Required action: Create the Vercel project first.
- Owner approval: Yes.

---

## 7. Findings by risk

| Risk | IDs |
|---|---|
| High | V-01, V-02, V-05, D-01, D-04, D-05, D-06, D-08, D-09, E-01, Z-01, Z-02, Z-05, L-02 |
| Medium | G-04, V-03, V-04, D-02, D-03, D-07, E-02, E-03, Z-03, Z-06, L-01, L-03, L-04, L-05 |
| Low | G-01, G-02, G-03, V-06, Z-04 |

## 8. Stop condition

Phase 0 ends here. Phase 1 and LINE work do not start until the owner reviews this audit and approves the next phase in writing.
