# FaithMap — Final Infrastructure Audit (Phase 1 of the completion mission)

Date: 2026-11-15 (about 14:00 UTC)
Mode: read-only. The only writes in this phase are code and test changes in the feature branch (section 6).
This document holds no secret, password or connection string.

Status words: **VERIFIED** (a command or API response in this session shows it), **NOT VERIFIED** (no check ran), **BLOCKED** (a check was tried and cannot run).

## 1. GitHub

| Item | Result | Status |
|---|---|---|
| Repository | `tlckalasinchurch/faithmap`; default branch `main` at `e38a24e` | VERIFIED |
| Feature branch | `claude/vigilant-noether-4fn1g1`, 28 commits ahead of `main`, 0 behind | VERIFIED |
| Pull request | #1, **draft**, open, `mergeable_state` clean, not merged | VERIFIED |
| Working tree at start | Clean. No stash. Local HEAD equals `origin` (`de41926`) | VERIFIED |
| CI (`verify`) on `de41926` | 2 runs, both `success` | VERIFIED |
| Package manager | **npm** (`package-lock.json`). There is no `pnpm-lock.yaml`. The mission text says `pnpm`. CI uses `npm`. I use `npm` | VERIFIED |
| Codex review bot | Failed: usage limit reached (PR comments) | VERIFIED. No review from that bot exists |

## 2. Vercel

| Item | Result | Status |
|---|---|---|
| Project `faithmap` | `prj_t1WwcIfp8ixXZOlEY5T3d1Il6Sfs`, team `tlckalasinchurch`, framework Next.js | VERIFIED |
| Git connection | Builds `main` (Production) and every branch push (Preview) | VERIFIED |
| Production deployments | 2, both from `main` `e38a24e` (before the PR work), state READY | VERIFIED |
| Preview deployments | 3 from the PR branch, all READY. Latest `dpl_6iQZjV3FSN1AQ19u1m9WB23FSEGg` (commit `de41926`). They have no `DATABASE_URL`, so they answer 503 by design | VERIFIED (state). Behaviour NOT VERIFIED: SSO blocks anonymous requests |
| Domains | `faithmap-indol.vercel.app` only (plus the `git-main` alias). No custom domain | VERIFIED |
| Node.js runtime | Project setting `26.x`. Branch `package.json`: `22.x`. `main`: no `engines` | VERIFIED |
| Deployment Protection | Vercel Authentication `all`; password off; trusted IPs off | VERIFIED |
| Environment variables | Only `PGUSER`, `PGPASSWORD` (Preview + Production). `PGPASSWORD` flagged `readable-secret`. None of the 6 required variables exists | VERIFIED |
| Project `faithmap.puntakit` | **Still exists and still builds.** The Vercel bot comment (updated 14:05:49Z, for commit `f72d22a`) lists it with a READY Preview built from this branch. My connection cannot read it (`404`; not in `list_projects`) | VERIFIED existence. Content **BLOCKED** (no access) |
| Build and runtime logs | Production build log read: no Node version line, no error | VERIFIED |

The statement "faithmap.puntakit was deleted" is **not true** at 13:47Z.

## 3. Neon

| Item | Result | Status |
|---|---|---|
| Organization | `Vercel: Tlckalasinchurch` (`org-tiny-heart-64270279`), Free plan | VERIFIED |
| Project | `faithmap` (`icy-violet-42450826`), `aws-ap-southeast-1`, PostgreSQL 18 | VERIFIED |
| Branches | `main` (default, **not protected**), `development` (child of `main`, not protected) | VERIFIED |
| Endpoints | One per branch, 0.25 CU fixed, idle. **Pooler off on both** | VERIFIED |
| Point-in-time history | 21 600 s (6 hours) | VERIFIED |
| Database and roles | `neondb`; role `neondb_owner` on both branches; passwords of the two branches differ | VERIFIED |
| `development` content | 0 FaithMap tables, no `drizzle` schema, no FaithMap roles (re-checked at 14:00Z). Only `neon_auth` (9 tables) | VERIFIED |
| `main` content | Read-only check at ~14:10Z (Y1 approved): PostgreSQL 18.7, database size 7 960 kB, schemas `neon_auth` and `public`. **0 FaithMap tables**, no `drizzle` schema (no migration metadata), 0 views, 0 functions, 0 triggers. `neon_auth`: 9 tables, 8 with 0 rows, `project_config` 1 row (count only, not read). Roles: Neon system roles, `neondb_owner`, `token_roles`. No personal data can exist in FaithMap tables because none exist | VERIFIED |
| Network restrictions (IP allow list) | Not read | NOT VERIFIED |
| Neon API key id 3540068 (account level) | Still valid at 14:00Z | VERIFIED. Owner has not revoked it yet |

## 4. Vercel ↔ Neon link

| Item | Result | Status |
|---|---|---|
| Neon integration | Installed in the team, `projects: []` (no project linked) | VERIFIED |
| `PG*` variables | Not created by the integration (`configurationId` null). Not read by the app (grep) | VERIFIED |
| Which branch `PGPASSWORD` opens | Unknown. I did not decrypt it | NOT VERIFIED |

## 5. Local environment

| Item | Result |
|---|---|
| Node | v22.23.4 (matches `engines`) |
| `npm run typecheck` | exit 0 |
| `npx vitest run` (PGlite, PostgreSQL 18.6) | 270 passed, 16 skipped, 0 failed (before the new header test) |
| All suites on real PostgreSQL 16.15 (CI parity) | **274 passed**, 0 failed |
| `tests/real-postgres.test.ts` | 16 passed |
| `npm run build` | exit 0 |
| `next start` live headers | Present (section 6) |

## 6. Phase 2 findings and fixes (code, feature branch)

| ID | Finding | Severity | Fix | Evidence |
|---|---|---|---|---|
| F-1 | `getReportDetailForGroup` returned every **absence note** (`attendance_records.notes`, for example a health reason) to a pastor (`mission_leader`). `DEC-06` allows only stewards, the Body Leader and admins | High | Notes set to `null` unless `canViewUnmaskedGroupPii` | Test `gate13` failed before the fix (red), passes after |
| F-2 | `listScopedFollowUps` returned follow-up **notes** to a pastor | High | Same rule | Same test |
| F-3 | The app sent **no security headers**. The security model lists CSP, HSTS, nosniff | Medium | `next.config.mjs` `headers()`: enforced `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`, `form-action`; HSTS; nosniff; `X-Frame-Options`; Referrer-Policy; Permissions-Policy. Full CSP in **Report-Only** (LINE hosts not yet checked on a device) | Test `gate14` (4 tests); live `curl` on `next start` shows all headers |

Open policy question (not changed): the weekly report fields `careNeedsNotes`, `prayerRequests` and `summaryNotes` are visible to a pastor on submitted reports. `DEC-06` says a pastor sees "non-PII summaries". The owner must say if these fields count as restricted.

Checked and found correct (existing tests plus code reading): server-side `requireAuth` on every `/api/v1` route, CSRF token for cookie sessions, `Origin` check against `APP_BASE_URL`, notification scoping by user id, visitor and member masking, CSV export masking, request limits, 28-case route authorization matrix.
Not yet reviewed in depth: `ingestion`, `cares`, `team-field-points`, `growth`, `line`, `passkeys` route services (covered by existing matrix tests; no new line-by-line review yet).

## 7. Blockers and owner actions

| ID | Item | Needed from |
|---|---|---|
| B-1 | `faithmap.puntakit` still builds this repository. State what it is. If it is the legacy system, disconnect it from this repository. I cannot read or change it | Owner |
| B-2 | ~~`main` branch content unknown~~ **Resolved by Y1**: `main` has no FaithMap table. The `main` endpoint host stays in the sandbox allow list until the owner removes it | Owner (cleanup) |
| B-3 | Vercel Authentication `all` blocks LINE users on every `*.vercel.app` URL | Owner decision (see `FAITHMAP_DEPLOYMENT_COMPATIBILITY.md`, section 4) |
| B-4 | Roles, migration, Preview variables, Node setting, pooler: all YELLOW or RED. Plan is in the three Phase A.4 documents | Owner approval |
| B-5 | Revoke Neon API key 3540068 when discovery ends | Owner |
| B-6 | Real LINE device test needs a Preview that LINE users can open (B-3) | Owner |
