# FaithMap — Deployment Compatibility (Phase A.4)

Date: 2026-11-15
Status: **PLAN ONLY. No Vercel setting, variable or deployment was changed.**
Scope: Node.js version, Vercel Preview configuration, security review of `development`.
Related: `FAITHMAP_DATABASE_ROLE_DESIGN.md`, `FAITHMAP_MIGRATION_EXECUTION_PLAN.md`, `FAITHMAP_NEON_SECURITY_AUDIT.md`.
This document holds no secret. Evidence marks: VERIFIED (a command or API response in this session), INFERRED, NOT VERIFIED.

## 1. Node.js compatibility

### 1.1 Facts

| Source | Value | Evidence |
|---|---|---|
| `package.json` on the PR branch | `engines.node = "22.x"` | VERIFIED |
| `package.json` on `main` | No `engines` field | VERIFIED (`git show origin/main:package.json`) |
| CI workflow | `node-version: 22` (`actions/setup-node@v7`) | VERIFIED. The commit title `def4e2f` says `node24`. The file says 22. The title is wrong, the file is right |
| CI database | `postgres:16` service | VERIFIED |
| Vercel project setting | `nodeVersion = 26.x` | VERIFIED (`get_project`) |
| Vercel docs | `engines.node` in `package.json` overrides the Project Settings value; Vercel picks the latest version that matches | VERIFIED (Vercel documentation search, page "Node.js versions") |
| Production deployment build log | No Node version line in the first 40 events | VERIFIED. Evidence of the used version is NOT available from the log |
| Preview deployment `dpl_8SztGAPMjPLRJstTPnnj51GbJuP1` (branch commit `57b74e2`) | State READY. Node version not reported by the API | VERIFIED state; version NOT VERIFIED |

### 1.2 Assessment

| Deployment source | Expected Node | Basis |
|---|---|---|
| PR branch (Preview) | 22.x | INFERRED: `engines` overrides the project setting |
| `main` (Production, e38a24e) | 26.x | INFERRED: no `engines`, so the project setting applies |

Result: **Preview and CI agree on Node 22. Production (`main`) differs until the PR merges or the project setting changes.** The mismatch has no effect on the Preview test. It matters for the first production release.
Vercel documentation shows `26.x` as a valid `engines` value. The Vercel MCP deployment tool lists versions only up to `24.x`. I could not confirm which versions the dashboard offers. NOT VERIFIED.

### 1.3 Proposal (not executed)

| Option | Action | Effect | Level |
|---|---|---|---|
| A (recommended) | Change **Node.js Version** to `22.x` in Vercel: Project → Settings → Build and Deployment. Alternative: Vercel MCP `update_project` with `nodeVersion: "22.x"` | Production and Preview use 22.x. `engines` and CI agree | YELLOW |
| B | Keep the project setting. Merge the PR so `main` has `engines` | Production changes on the merge. Merge needs separate approval | RED |
| C | Do nothing | Preview uses 22 through `engines`. Production keeps 26 | — |

Check after A: open the next Preview build log. It must show Node 22. Also run `get_project` and read `nodeVersion`.
Rollback of A: set the value back to `26.x` (the previous value is `26.x`).
Risk of A: a redeploy of Production on 22.x uses a different runtime from the one that built the current Production deployment. The app is the old `main` and holds no data. Risk is low. Do not redeploy Production in this phase.

## 2. Observations on the Vercel account (VERIFIED)

| ID | Observation | Meaning |
|---|---|---|
| V-1 | Every push to the PR branch builds a **Preview** of project `faithmap`. The push of commit `57b74e2` made `dpl_8SztGAPMjPLRJstTPnnj51GbJuP1` (READY). | That Preview has no `DATABASE_URL`. FaithMap answers `503` on purpose. Preview URLs are protected by Vercel login |
| V-2 | The Preview deployment has `alias: []` when read. No branch alias is listed. | The stable branch URL in section 3 is not confirmed |
| V-3 | The PR comment from the Vercel bot lists a **second project**, `faithmap.puntakit` (`prj_VoisCbisybpMCOCzQ1zhIthjC08s`), with a Preview built from the same branch. | The word `puntakit` matches the legacy system that `CD-09` forbids us to reuse. My Vercel connection cannot read this project (`404`) and `list_projects` does not show it. Its variables and database are unknown |
| V-4 | `vercel.json` does not exist in the repository. | No Vercel Cron job is configured. `CRON_SECRET` protects routes that something else must call. This matches open decision B-2 (scheduler) |
| V-5 | Production variables: only `PGUSER` and `PGPASSWORD`. Preview variables: the same two. | None of the 6 target variables exists anywhere. Preview and Production share no secret today |

## 3. Preview configuration plan

Rules:
- Target **Preview only**, scoped to the Git branch `claude/vigilant-noether-4fn1g1`. Never "All Environments". Never Production.
- Secrets use type `sensitive`. Nobody reads them back.
- The two random secrets come from `openssl rand -hex 32` (64 characters). The app needs at least 32 characters (`crypto.ts`, `cron-auth.ts`). Generate them on the machine that sets them. Do not print them. Do not store them in a file or in chat.
- Production secrets are generated later and are different from Preview secrets.

| Variable | Value source | Type | Check |
|---|---|---|---|
| `DATABASE_URL` | `faithmap_app` on branch `development`. Use the **pooled** host (`-pooler`). Not the migrator. Not `neondb_owner`. Not `main` | sensitive | Host starts with `ep-dark-shadow-b34nbg88` and has `-pooler`. Role is `faithmap_app` |
| `AUTH_SESSION_PEPPER` | New random 64 hex characters | sensitive | Length ≥ 32 |
| `CRON_SECRET` | New random 64 hex characters | sensitive | Length ≥ 32, different from the pepper |
| `APP_BASE_URL` | Exact https origin of the Preview that LIFF will open (section 3.1) | plain | `https`, no path, no trailing slash, not localhost (`check-line-config`) |
| `LINE_LOGIN_CHANNEL_ID` | Owner. Developing channel. Public ID | plain | 9–12 digits |
| `NEXT_PUBLIC_LIFF_ID` | Owner. Developing channel. Public ID | plain | Number before the dash equals the channel ID |

Do **not** set: `PGUSER`, `PGPASSWORD`, `PGHOST`, `FAITHMAP_DEMO_MODE`, `NEXT_PUBLIC_FAITHMAP_MOCK_LIFF`, `LINE_OA_CHANNEL_ACCESS_TOKEN` (stays unset until the quota guard exists), `LINE_LOGIN_CHANNEL_SECRET` (not used), `DATABASE_SSL_CA` (not needed for Neon).

`NEXT_PUBLIC_LIFF_ID` is read at **build time**. Set it before the build that LIFF will use. A redeploy is needed after every variable change.

`PG*` variables: the app reads only `DATABASE_URL`. No file in `src/`, `scripts/`, `tests/` or the config files uses `PG*` (VERIFIED by grep). The `pg` library may fill an unset connection field from `PGPORT` and similar variables; `PGPORT` is not set. The two `PG*` variables are still injected in every Preview. Removal needs approval and is a later step.

### 3.1 `APP_BASE_URL` and the Preview URL

| Candidate | Value | Status |
|---|---|---|
| Branch alias | `https://faithmap-git-claude-vigilant-noether-4fn1g1-tlckalasinchurch.vercel.app` | INFERRED from the existing alias `faithmap-git-main-tlckalasinchurch.vercel.app`. The label has 60 characters (limit 63), so Vercel should not shorten it. The project `faithmap.puntakit` shows a shortened label with a hash, because its name is longer. Not seen in the API (`alias: []`). NOT VERIFIED |
| Deployment URL | `https://faithmap-j1b5l0xks-tlckalasinchurch.vercel.app` | VERIFIED. Changes with each push. Do not use it as `APP_BASE_URL` |

The app compares the `Origin` header with `APP_BASE_URL` (`session.ts`). Passkeys use it as the relying party (`passkeys.ts`). The LIFF **Endpoint URL** in the LINE console must use the same origin. So the origin must be stable.
Plan: after the first Preview that has the variables, read the real alias from the deployment (`alias` field or the Vercel dashboard). Set `APP_BASE_URL` to that origin. Redeploy. Then give the same URL to the LIFF Endpoint URL setting. A fixed custom domain (section 4, option 1) avoids this step.

### 3.2 Order of actions

| Step | Level | Action | Check |
|---|---|---|---|
| 1 | YELLOW | Set Node to 22.x (section 1.3, option A) | `get_project` shows 22.x |
| 2 | RED | Database steps 1–5 (`FAITHMAP_MIGRATION_EXECUTION_PLAN.md`) | `04` shows 10 true |
| 3 | YELLOW | Set `AUTH_SESSION_PEPPER`, `CRON_SECRET`, `LINE_LOGIN_CHANNEL_ID`, `NEXT_PUBLIC_LIFF_ID` (Preview, branch) | Variable list shows names, targets and types only |
| 4 | YELLOW | Set `DATABASE_URL` (`faithmap_app`, pooled) | Same |
| 5 | YELLOW | Push or redeploy the branch. Read the alias. Set `APP_BASE_URL`. Redeploy | Deployment READY. `npm run check:line-config` logic passes (run it with the same variables in the owner shell) |
| 6 | GREEN | HTTP check, runtime logs, `/api/health` | 200 and no `permission denied` in logs |
| 7 | RED | `db:bootstrap-admin` | One `super_admin` |
| 8 | YELLOW | Set the LIFF Endpoint URL in the LINE console (owner) | Login opens in LINE |

### 3.3 Rollback

| Change | Rollback |
|---|---|
| Preview variable | Delete the variable (Vercel MCP `remove` or dashboard). Nothing else depends on it. Redeploy |
| Node setting | Set back to `26.x` |
| `DATABASE_URL` wrong | Delete it. The app returns `503` again. No data risk |
| Preview with wrong role | Delete `DATABASE_URL`. Run `06`, `07` if the roles must go |

Production: **none of these steps touches Production.** Every variable has the Preview target and a branch scope. The Production project setting changes only if the owner approves option 2 of section 4.

## 4. Deployment Protection (blocks LIFF)

Current setting: Vercel Authentication `ssoProtection.deploymentType = all` (VERIFIED). Password protection is off.
Effect: a LINE user has no Vercel session. LIFF cannot open any `*.vercel.app` URL of this project. The first Preview request returns the Vercel login page, not FaithMap.

Vercel documents these Vercel Authentication modes (VERIFIED, documentation search): `all` (all deployments), `all_except_custom_domains` ("Standard Protection": generated URLs protected, custom domains public), `prod_deployment_urls_and_all_previews` (legacy), `preview` (legacy; previews only).

| Option | How | Effect | Level |
|---|---|---|---|
| 1 (recommended if the owner has a domain) | Add a custom domain (for example `test.<owner domain>`) and attach it to the Preview branch. Change protection to `all_except_custom_domains`. | The custom domain is public. Every `*.vercel.app` URL, including the Production URLs, stays protected. `APP_BASE_URL` and the LIFF Endpoint URL use the custom domain (stable) | RED (security policy). The owner decides. I do not change it |
| 2 | Keep `all`. Test LIFF later. | No LIFF test now. A developer with a Vercel login can open the page | — |
| 3 | Bypass token in the LIFF URL | **Forbidden** by the project rules | — |
| 4 | Password protection | Still blocks LINE users. Needs a paid plan | — |

I did not verify that the owner has a domain. I did not check `list_domains`. No Vercel setting changes in this phase.
Risk of option 1: a custom domain makes the Preview public. The Preview then serves FaithMap with the `development` database. Keep the database empty of real members until the owner approves real data. The first admin must use a strong password. LINE login creates a pending request only (`FAITHMAP_LINE_AUTH_DESIGN.md`). Remove the domain after the test.

## 5. Security review: `development` holds no production data

| Check | Result | Evidence |
|---|---|---|
| FaithMap tables on `development` | 0 | VERIFIED (Phase A.3, SQL catalog query) |
| Rows with personal data | None. No `public` table exists | VERIFIED |
| Origin of `development` | Child of `main`, created 2026-11-15 07:46Z from a project created at 07:41Z. `main` held only the `neon_auth` schema then | INFERRED from creation times and equal sizes |
| `neon_auth.project_config` | 1 row. I did not read it | VERIFIED count, content NOT read |
| `main` content | Not checked. Its host is not in the sandbox allow list | NOT VERIFIED |
| Credentials | `neondb_owner` passwords of `main` and `development` differ | VERIFIED (hash comparison) |
| Production Vercel secrets reused in Preview | None. Production has only `PGUSER` and `PGPASSWORD` | VERIFIED |
| `PGPASSWORD` target | Preview and Production, flagged `readable-secret`. It may open `main` | NOT VERIFIED which branch. I did not decrypt it |
| Legacy Puntakit | Project `faithmap.puntakit` exists in the team and builds this branch. Its variables are unknown | VERIFIED existence (PR comment). Content NOT VERIFIED |
| Mock or demo data | Not seeded. `db:seed` refuses remote databases (PR #1) | Code review |

Conclusion: `development` is safe to receive the first migration. It holds no production data and no personal data.

### 5.1 Risks

| ID | Risk | Level | Action |
|---|---|---|---|
| C-1 | The project `faithmap.puntakit` builds the FaithMap branch. If it holds legacy Puntakit variables or database credentials, a FaithMap build could reach a legacy database. This conflicts with `CD-09`. | High until checked | **Owner:** state what the project is. If legacy, disconnect it from this repository or remove its variables. I did not touch it and cannot read it |
| C-2 | Every push builds a Preview without a database. Harmless (503). Each push still uses build capacity. The plan limits are NOT VERIFIED. | Low | None |
| C-3 | `PGPASSWORD` in Production and Preview is unused by code and flagged. | Medium | Owner approves removal after the Preview works |
| C-4 | Node mismatch between `main` (26.x) and the branch (22). | Low | Section 1.3 |
| C-5 | Option 1 of section 4 makes a Preview public. | Medium | Keep the database empty of real members. Use a strong admin password. Remove the domain after the test |
| C-6 | Branch alias is not confirmed (V-2). | Low | Section 3.1 |
| C-7 | The migrator password must exist in the owner shell. | Medium | Role design RR-1 |

## 6. Open decisions for the owner

1. What is the project `faithmap.puntakit`? Disconnect it? (C-1)
2. Set Node to 22.x in Vercel? (section 1.3)
3. Protection: option 1 (custom domain) or option 2? (section 4)
4. Approve the Preview variable plan (section 3)?
5. Give the LINE Developing channel ID and LIFF ID.
