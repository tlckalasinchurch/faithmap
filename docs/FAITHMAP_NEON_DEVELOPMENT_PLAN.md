# FaithMap — Neon Development Plan (Y2 to Y7)

Status: **PLAN ONLY. Nothing here is approved or run.** Date: 2026-11-15. Branch head when written: `45cf05c` plus the UI and validation commit that follows it.

Scope: the Neon branch `development` (`br-rough-pine-b3ze5x1g`, endpoint `ep-dark-shadow-b34nbg88`) and the Vercel **Preview** environment of project `faithmap`. Not in scope: Neon `main`, Vercel Production, the production domain, any merge.

Sources: `FAITHMAP_DATABASE_ROLE_DESIGN.md` (SQL 01 to 07), `FAITHMAP_MIGRATION_EXECUTION_PLAN.md`, `FAITHMAP_DEPLOYMENT_COMPATIBILITY.md`, `FAITHMAP_FINAL_INFRASTRUCTURE_AUDIT.md`.

## 1. Verified starting state (read-only checks, 2026-11-15)

| Item | State | Evidence |
|---|---|---|
| Neon `development` | 0 FaithMap tables, no `drizzle` schema, pooler off | Y1 result in the audit document |
| Neon `main` | 0 FaithMap tables | Same |
| Vercel Preview variables | None of the six variables below are set | Variable list checked earlier |
| Vercel Node setting | 26.x. `engines.node` in the branch is 22.x | `get_project` |
| Vercel Authentication | Blocks anonymous access to Preview. LINE users cannot pass it | Compatibility document, section 4 |
| Code | PR #1 draft, head `45cf05c`, CI passed | GitHub |
| Migrations | Five files, 0000 to 0005. Tested on PGlite 18.6 and PostgreSQL 16.15 | Test report |

## 2. Decisions the owner must make before approval

| ID | Decision | Recommendation |
|---|---|---|
| D-1 | Who sets secrets: the owner in the Vercel dashboard, or Claude through the Vercel tool | **Owner.** Claude then never holds a secret. Claude checks names, targets and types only |
| D-2 | Who runs the migration: owner terminal, or Claude from the sandbox | **Owner terminal.** The migrator password stays on the owner machine |
| D-3 | How LIFF reaches the Preview, given Vercel Authentication | Needs a separate RED approval (see Y5 note). Until then LIFF cannot be tested in LINE. Database and API checks do not need it |
| D-4 | Coordinator rule for field points (Q-10): require an active assignment in the same Body (now) or allow any active account | Keep the stricter rule until real data exists |
| D-5 | Restore point before Y6: child branch of `development`, or the Neon history window (6 hours) | Child branch. It needs its own approval |
| D-6 | LINE console values (channel ID `2012616582`, LIFF ID `2012616582-tsDHY0DR`) are for the developing channel and are correct | Owner confirms in the LINE console |

## 3. Order and gates

```
Y4 (Node) ─┐
Y2 (roles) ─┼─> Y6 (migration + grants) ─> verify ─> Y5 (variables) ─> redeploy ─> smoke test ─> Y7 (admin)
Y3 (pooler)─┘
```

Y2, Y3 and Y4 do not depend on each other. Y6 needs Y2. Y5 needs Y2, Y3 and Y6, because `DATABASE_URL` uses the runtime role and the pooled host. Y7 needs Y6 and a working Preview. Each step needs its own written approval. An approval for one step is not an approval for the next.

## 4. Steps

### Y2 — Database roles on `development` (RED)

| Field | Content |
|---|---|
| Action | Run `01_owner_roles_and_schemas.sql` as `neondb_owner` on the **direct** host. Then `02_migrator_default_privileges.sql` as `faithmap_migrator`. Creates roles `faithmap_migrator` and `faithmap_app` and schema `drizzle` |
| Reason | The runtime must not use `neondb_owner`. The runtime role must have no right to change tables or to turn off the immutable triggers |
| Impact | Two new roles on `development` only. No table, no row. `main` does not change |
| Needs from owner | Two new passwords made with `openssl rand -hex 24`, typed in the owner shell |
| Verification | `04_verify_roles.sql` after Y6 shows 10 rows, all `t`. Before Y6: `\du` shows both roles with NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS, NOREPLICATION |
| Rollback | `07_rollback_roles.sql` as `neondb_owner` (after `06` if tables exist). Tested on PostgreSQL 16 |
| Stop condition | Any SQL error. The script is one transaction, so nothing changes |
| Not tested | Execution on Neon (a hosted PostgreSQL 18.7) |

### Y3 — Connection pooler on the `development` endpoint (YELLOW)

| Field | Content |
|---|---|
| Action | Turn on the pooler for endpoint `ep-dark-shadow-b34nbg88` in the Neon console or API |
| Reason | Vercel functions open many short connections. The runtime `DATABASE_URL` uses the pooled host |
| Impact | A second host name (`-pooler`) appears. The direct host stays. Migration must keep using the direct host |
| Verification | Read the endpoint setting (read-only API). Later, `/api/health` through the pooled host returns 200 |
| Rollback | Turn the pooler off. Nothing else depends on it until Y5 |
| Risk | PgBouncer runs in transaction mode. The app must not use session state. Verified by grep of `src/`: no session-level `SET`, no `LISTEN`, no prepared-statement names. The only advisory lock is transaction-scoped (`pg_advisory_xact_lock`) in the bootstrap script, which uses the direct host. Not tested through a pooler |

### Y4 — Node.js runtime on Vercel (YELLOW)

| Field | Content |
|---|---|
| Action | Set Node.js Version to `22.x` for project `faithmap` |
| Reason | CI, `engines` and all tests use Node 22. The project setting is 26.x |
| Impact | The setting is project-wide. It also applies to Production builds made later. No Production deployment is made now |
| Verification | `get_project` shows `22.x`. The next Preview build log shows Node 22 |
| Rollback | Set back to `26.x` |

### Y5 — Preview environment variables (YELLOW)

| Variable | Source | Type | Scope |
|---|---|---|---|
| `DATABASE_URL` | `faithmap_app`, pooled host of `development` | sensitive | Preview, branch `claude/vigilant-noether-4fn1g1` |
| `AUTH_SESSION_PEPPER` | new random, 64 hex | sensitive | same |
| `CRON_SECRET` | new random, 64 hex, different | sensitive | same |
| `APP_BASE_URL` | the Preview origin that LIFF opens | plain | same |
| `LINE_LOGIN_CHANNEL_ID` | owner, public ID | plain | same |
| `NEXT_PUBLIC_LIFF_ID` | owner, public ID | plain | same |

Rules: never "All Environments". Never Production. Do not set `PG*`, `FAITHMAP_DEMO_MODE`, `NEXT_PUBLIC_FAITHMAP_MOCK_LIFF` or a LINE messaging token. No bypass token in any URL.

| Field | Content |
|---|---|
| Reason | The app needs these to start with a real database and real LINE login |
| Impact | Preview deployments of this branch only |
| Verification | Variable list shows names, targets and types, never values. After redeploy: `/api/health` 200; runtime log has no `permission denied`; `check:line-config` passes with the same values in the owner shell |
| Rollback | Delete the variables. The app returns 503 again. No data risk |
| Order inside Y5 | Set all except `APP_BASE_URL`. Redeploy. Read the real alias. Set `APP_BASE_URL`. Redeploy again |
| Note on LIFF | Vercel Authentication blocks LINE users on a Preview URL. Opening it to LINE needs a Protection change on Vercel. That is a separate RED decision (D-3). Do not use a bypass token in the LIFF URL |

### Y6 — Migration 0000 to 0005 and grants on `development` (RED)

| Field | Content |
|---|---|
| Action | (1) Restore point (D-5). (2) Owner runs `npm run db:migrate` as `faithmap_migrator` on the direct host with `FAITHMAP_CONFIRM_MIGRATE_HOST` set. (3) `03_post_migrate_grants.sql`. (4) `04_verify_roles.sql` |
| Reason | The branch is empty. The app needs 38 tables, 5 triggers and 3 functions |
| Impact | Writes the schema to `development`. No row is inserted. `0004` adds nullable columns only. `0005` adds columns, checks and an index and runs two data steps that change 0 rows on an empty database. `main` does not change |
| Expected result | `FaithMap schema ready (driver=postgres, migrations=6/6).` Counts: 38 tables, 6 migration rows, 115 indexes, 191 constraints (not NOT NULL), 5 triggers, 3 functions, 0 rows in all tables |
| Verification | Content check in the migration plan, section 6.2. Migration hashes equal the repository files. `04` shows 10 of 10 `t`. The runtime role can SELECT and INSERT on append-only tables and cannot UPDATE or DELETE them (attack tests `05`) |
| Rollback | A failed step 2 rolls back by itself. After success: `06_rollback_schema.sql`, then `07_rollback_roles.sql`. Or restore from the restore point |
| Stop condition | Any error. Report the full error text without the connection string |

### Y7 — Bootstrap Super Admin on `development` (RED)

| Field | Content |
|---|---|
| Action | Owner runs `npm run db:bootstrap-admin` with username and name chosen by the owner and a password typed with `read -rs` |
| Reason | Without a Super Admin nobody can approve a LINE registration or assign a role |
| Impact | One row in `users` and its login method. Runs once (advisory lock) |
| Verification | Output `Super admin created: <username>`. Login through the Preview works. `SELECT count(*)` of `super_admin` is 1 |
| Rollback | `06` with `faithmap.allow_data_loss=yes` (deletes the admin row; owner must approve) |
| After Y7 | (1) The admin creates the Bodies in the screen "องค์กร & สิทธิ์" > "จัดการบอดี้". The database has no Body until then. (2) The admin creates groups and assigns leaders. (3) The admin maps every team field point to a Body and a coordinator in the screen "จุดลงพื้นที่". Until every point has a Body, no other person can read a field point |

## 5. After Y7: checks that stay open

| Check | Who | Status |
|---|---|---|
| Preview smoke test (health, login, workspace, report flow) | Claude, GREEN, after Y5 | Not done |
| LINE login through LIFF | Owner and Claude | Needs D-3 |
| Brief generation on a real period (Sunday 20:30 ICT) | Cron needs `CRON_SECRET` and a scheduler. No `vercel.json` cron exists. Hobby plan limits cron | Decision B-2 still open |
| Remove sandbox access to the Neon hosts and revoke Neon API key id 3540068 | Owner | Not done |
| `faithmap.puntakit` project | Owner | Not verified |

## 6. What this plan does not do

It does not touch Neon `main`, Vercel Production, the production domain or any Production variable. It does not merge PR #1. It does not delete a deployment. It does not change Deployment Protection.
