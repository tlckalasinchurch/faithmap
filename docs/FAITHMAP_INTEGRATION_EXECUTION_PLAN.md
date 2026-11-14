# FaithMap — Integration Execution Plan (Proposal, Not Started)

**Date:** 2026-11-14 · **Status:** DRAFT for owner review. No step has started.
**Budget rule:** 0 THB/month. Every step has a cost check.
**Source:** `FAITHMAP_INFRASTRUCTURE_AUDIT.md` (finding IDs in brackets).

## 0. Rules for this plan

1. Each gate needs written owner approval before the next step starts.
2. No step adds a paid service or paid dependency.
3. If a cost check fails, stop and report. Do not change the architecture without approval.
4. No secret value enters chat, Git, documents or memory. Owner enters values in provider consoles.
5. Follow the 6-phase workflow in `CLAUDE.md`. Business logic uses test-first development.

## Gate 0 — Resolve blockers (owner)

| # | Action | Closes | Pass condition |
|---|---|---|---|
| 0.1 | Ask Vercel in writing (vercel.com/help) if a church ministry app with no revenue qualifies for Hobby ("personal or non-commercial use"). Keep the reply. Turn off Model Training in team settings. | Z-01, Z-07 / B-1 | Written confirmation from Vercel. Model Training off. |
| 0.2 | Decide the scheduler. Legacy Cron fails `DEC-01` on Hobby (daily, ±59 min). Vercel Schedules (beta) runs 0–15 min late. Choose: accept 15 min delay (and record it in the decision register), or approve another option. | Z-02 / B-2 | Decision recorded |
| 0.3 | Supply the "ZERO-COST INFRASTRUCTURE POLICY" document. | L-04 | File added to `docs/` |
| 0.4 | Decide domain: `*.vercel.app` or free church subdomain. | Z-06 | Decision recorded in the decision register |
| 0.5 | Decide backup method within 0 THB. | D-09 | Decision recorded |
| 0.6 | Decide Vercel team: same team as Puntakit or separate. | V-03 | Decision recorded |

**If 0.1 or 0.2 fails:** stop. Owner chooses among options. I list them only; I do not choose:
- Ask Vercel for a written exception.
- Use another free host for the app (architecture change `DEC-11`).
- Use a free external scheduler to call the job route (needs a secret-safe design).

## Gate 1 — Create accounts and projects (owner, console only)

Steps are in `FAITHMAP_ACCOUNT_ACCESS_CHECKLIST.md`.

1. Create Vercel project `faithmap` from `tlckalasinchurch/faithmap`. Production branch: `main`. Framework: Next.js. Pin Node.
2. Create one Neon Free project. Region: closest to Thailand that Neon offers. Create branches `production`, `staging`, `development`.
3. Owner sets variables in Vercel (names in section 3). Owner types the values.
4. **Before the first request:** set `FAITHMAP_DEMO_MODE=false`, `CRON_SECRET` and `AUTH_SESSION_PEPPER` in Production [D-06, E-01].

**Cost check:** Vercel plan shows Hobby. Neon plan shows Free. No card is added.
**Exit evidence:** Vercel project URL. Neon project name. No secret values in the report.

## Gate 2 — Pre-LINE remediation (code, needs approval, test-first)

These changes were out of scope for Phase 0. I propose them as one approved phase. Each item has a test written first.

| # | Change | Finding |
|---|---|---|
| 2.1 | Fail startup in production if `CRON_SECRET` or `AUTH_SESSION_PEPPER` is missing. Remove default strings. | E-01 |
| 2.2 | Disable demo seed and demo switch when `NODE_ENV=production`. Add explicit bootstrap command for the first `super_admin`. | D-05, D-06 |
| 2.3 | Gate runtime `ensureSchema` behind an explicit flag. Add a schema version table. | D-04, D-05 |
| 2.4 | Add `vercel.json` schedules (`timezone: Asia/Bangkok`, `requestMethod: POST`, jitter 15) for the approved scheduler. Keep Bearer check. Remove header `x-cron-secret` fallback. Cutoff logic uses the 20:00 deadline, not job start time. | V-04, V-05, Z-02 |
| 2.5 | Remove `rejectUnauthorized: false`. Use pooled Neon host. Lower pool `max`. | D-02, D-03 |
| 2.6 | Disable the `line_oidc` action until server-side verification exists. | L-02 |
| 2.7 | Add GitHub Actions workflow: typecheck and tests. | G-04 |

**Gate 2 exit:** typecheck, test suite and build pass with real command output. Reports attached.

## Gate 3 — First real database connection (Development branch only)

1. Owner gives the `development` branch connection string to the local environment (not to chat).
2. Run `ensureSchema` on the empty `development` branch.
3. Run the full test suite against it.
4. Record row counts and constraint checks.

**Pass condition:** no DDL error on PostgreSQL 16 [D-07].
**Rollback:** delete and recreate the `development` branch.
**Cost check:** Neon dashboard shows compute and storage below 50% of limits.

## Gate 4 — Staging deploy

1. Deploy Preview to the `staging` branch database.
2. Smoke tests: `/api/health/live`, `/api/health/ready`, login with a synthetic account, one report cycle.
3. Trigger cron routes once with the Bearer secret. Check results.
4. Confirm Production has no demo accounts.

**Cost check:** Vercel usage page shows no overage notice. Neon shows no paid items.

## Gate 5 — LINE Login (Phase 1 of LINE work)

Starts only after Gates 0–4 pass and the owner approves.

Owner actions (console):
1. Create a LINE Developers account and one Provider (name proposed: `FaithMap`).
2. Create one LINE Login channel. Add the Vercel production callback URL.
3. Enter Channel ID and Secret into Vercel variables.

Code actions (test-first):
1. `GET /api/v1/auth/line/start`: PKCE, state, nonce, cookies.
2. Callback: exchange code, verify ID token, check nonce and audience.
3. Link `external_identities` only under an active session, or by admin invitation.
4. Tests: wrong state, wrong nonce, expired token, replay, unlinked user.

**Exit evidence:** test output. Login on a real phone by the owner with one test account.

## Gate 6 — LIFF and LINE OA (Phase 6 of the product plan)

Owner actions:
1. Create or confirm the LINE Official Account on the Free plan.
2. Create the Messaging API channel under the same Provider and link it to the OA.
3. Create the LIFF app inside the LINE Login channel. Add the endpoint URL.
4. Check the Free message quota in LINE Official Account Manager. Write the number in the decision register.

Code actions:
1. Webhook route with signature check using the channel secret.
2. Consent and linking flow before any push (`DEC-10`, PDPA).
3. Message budget guard: stop push when the monthly count reaches 250. Log the stop.
4. Reminder jobs. No auto-approval anywhere (`CD-08`).

**Cost check:** monthly message estimate ≤ 250. If higher, stop and ask the owner.

## 3. Environment matrix (names only)

| Name | Development | Preview / Staging | Production |
|---|---|---|---|
| `DATABASE_URL` | Neon `development` (pooled) | Neon `staging` (pooled) | Neon `production` (pooled) |
| `APP_BASE_URL` | local URL | Preview URL | Production URL |
| `FAITHMAP_DEMO_MODE` | `true` | `true` (synthetic data only) | **`false`** |
| `CRON_SECRET` | unique value | unique value | unique value |
| `AUTH_SESSION_PEPPER` | unique value | unique value | unique value |
| `LINE_LOGIN_CHANNEL_ID` | — | test channel or same channel | Login channel |
| `LINE_LOGIN_CHANNEL_SECRET` | — | as above | Login channel |
| `NEXT_PUBLIC_LIFF_ID` (new) | — | LIFF app | LIFF app |
| `LINE_MESSAGING_CHANNEL_SECRET` (new) | — | — | Messaging channel |
| `LINE_OA_CHANNEL_ACCESS_TOKEN` | — | — | Messaging channel |

Rules: each environment has its own secret values. Mark secrets as sensitive in Vercel. Never reuse a Production value in Preview.

## 4. Risks and rollback

| Risk | Control |
|---|---|
| Neon storage reaches limit | Alert at 70%. Writes fail at the limit. Archive old data per retention policy. |
| Vercel limit reached | Hobby behavior at limit is unverified. Owner reads it at Gate 0. |
| LINE quota exceeded | Budget guard at 250. Weekly count report. |
| Bad schema change | Test on `development` first. Restore by branch recreate. Production restore window to be confirmed. |
| Secret leak | Rotate in the provider console. Redeploy. Record in the audit log. |
| Cold start delay (scale to zero) | Test on a phone. Accept or ask the owner for a decision. |

## 5. Not in this plan

- No MINI App. LINE MINI App needs separate review of Thai requirements and cost.
- No paid domain, paid storage or paid plan.
- No change to `DEC-11` stack without owner approval.

## 6. Approval record

| Gate | Owner approval (name, date) |
|---|---|
| 0 | |
| 1 | |
| 2 | |
| 3 | |
| 4 | |
| 5 | |
| 6 | |
