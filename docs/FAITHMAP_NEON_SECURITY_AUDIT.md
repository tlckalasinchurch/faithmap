# FaithMap — Neon Security Audit (Phase A.3)

> **Note (2026-11-15).** This audit counts 4 migrations. The repository now has 6 (0000 to 0005). Role, privilege and catalog findings stay valid. The expected table, index and constraint counts changed; see `FAITHMAP_MIGRATION_EXECUTION_PLAN.md` addendum 2.


Date: 2026-11-15
Scope: Neon project `faithmap` (`icy-violet-42450826`), region `aws-ap-southeast-1`.
Mode: read-only. No role, branch, pooler, password, migration or Vercel setting changed.
This document holds no password, connection string or API key.

## 1. Evidence rules

| Mark | Meaning |
|---|---|
| VERIFIED | A system response in this session shows the fact. |
| INFERRED | The fact follows from verified data. No direct proof. |
| NOT VERIFIED | No check ran. |

Method: Neon API (GET only) and one read-only SQL session on `development`. The SQL session used the `Neon-Batch-Read-Only` header. The SQL queries read catalog metadata and `count(*)` values. No query read a row value.

## 2. Database content classification

| Item | `development` | `main` |
|---|---|---|
| PostgreSQL version | 18.7 (VERIFIED) | 18 (VERIFIED by project setting). Minor version NOT VERIFIED |
| Database | `neondb`, owner `neondb_owner` (VERIFIED) | same (VERIFIED) |
| FaithMap tables (`public`) | **0** (VERIFIED) | NOT VERIFIED |
| `drizzle.__drizzle_migrations` | **does not exist** (VERIFIED, error 42P01) | NOT VERIFIED |
| Triggers (non-internal) | 0 (VERIFIED) | NOT VERIFIED |
| Columns with PII-like names in `public` | 0 (VERIFIED) | NOT VERIFIED |
| Extensions | `plpgsql` only (VERIFIED) | NOT VERIFIED |
| Other schema | `neon_auth` (9 tables, 8 empty, `project_config` has 1 row) (VERIFIED) | INFERRED present (`development` copied `main` at creation) |
| Logical size | 32.2 MB | 32.2 MB (VERIFIED) |

Classification:
- `development`: **EMPTY for FaithMap.** No application data. No personal data. Class: safe for the first migration.
- `main`: **INFERRED EMPTY.** Its size equals `development`. The host of `main` is not in the network allow list, so no count ran. Do not treat this as proof.
- `neon_auth.project_config` has 1 row. I did not read it.

### Migration comparison (repository vs `development`)

| idx | Repository file | Hash (first 10) | Applied in `development` |
|---|---|---|---|
| 0 | `0000_baseline` | 004099cf82 | No |
| 1 | `0001_immutable_triggers` | 6c17355818 | No |
| 2 | `0002_data_quality_decisions` | 058492b072 | No |
| 3 | `0003_data_quality_decisions_immutable` | f0ee434552 | No |

Result: 0 of 4 migrations applied. The `drizzle` schema does not exist yet. `db:migrate` creates it. The app returns `503 DB_NOT_MIGRATED` until all 4 are applied.

## 3. Branch isolation

| Check | Result |
|---|---|
| `development` parent | `main` (`br-plain-feather-b3fxb30l`) (VERIFIED) |
| Endpoints | One read_write endpoint per branch. Hosts differ (VERIFIED) |
| `neondb_owner` password, `main` vs `development` | **Different.** Compared by SHA-256 hash. No value shown (VERIFIED) |
| Role name | Same name `neondb_owner` on both branches (VERIFIED) |
| `main` protected | **No** (VERIFIED) |
| `main` expiry | None (VERIFIED) |
| `development` protected / expiry | Not protected. Expiry NOT VERIFIED |
| Pooler | Off on both endpoints (VERIFIED) |
| Scale to zero | `suspend_timeout_seconds` is 0 on both endpoints (VERIFIED). Meaning of 0 NOT VERIFIED |

Conclusion: a `development` credential does not open `main`. The earlier concern about a shared password does not apply.
Residual risk: the Vercel `PG*` variables are set for Preview and Production. `PGPASSWORD` may match `main`. I did not decrypt it. NOT VERIFIED.

## 4. Role and permission matrix

All values come from `pg_roles` on `development` (VERIFIED).

| Role | Login | Superuser | CREATEROLE | CREATEDB | BYPASSRLS | REPLICATION | Use |
|---|---|---|---|---|---|---|---|
| `neondb_owner` | Yes | No | **Yes** | **Yes** | **Yes** | **Yes** | Owner of DB. Only role for Vercel `PGUSER` |
| `neon_superuser` | No | No | Yes | Yes | Yes | Yes | Neon group role |
| `cloud_admin` | Yes | Yes | Yes | Yes | Yes | Yes | Neon internal |
| `neon_service` | Yes | No | Yes | Yes | Yes | Yes | Neon internal |
| `neon_auth` | Yes | No | No | No | No | No | Neon Auth feature |
| `token_roles` | No | No | No | No | No | No | Neon Auth feature |

Findings:
1. The app would connect as `neondb_owner`. That role owns every table. It can run `ALTER TABLE ... DISABLE TRIGGER`. It can drop the immutable-audit triggers (`0001`, `0003`). It bypasses row-level security. This weakens the append-only rule for audit logs and meeting briefs.
2. No table-level grants to other roles exist (VERIFIED, 0 rows).
3. `neon_auth` objects exist. FaithMap uses its own auth (`CD-09`, `DEC-03`). The `neon_auth` schema has no use in FaithMap. Reason it exists: NOT VERIFIED. It may come from a Neon Auth setting in the project.

## 5. Proposed role split (not executed)

| Role | Purpose | Rights |
|---|---|---|
| `faithmap_migrator` | Runs `db:migrate` and `db:bootstrap-admin`. Owns tables. | Create on schema `public` and `drizzle`. No superuser. No BYPASSRLS. Used from the owner terminal only. |
| `faithmap_app` | Runtime role for Vercel (`DATABASE_URL`). | `CONNECT`, `USAGE` on schema. `SELECT, INSERT, UPDATE, DELETE` on tables. `USAGE` on sequences. **Not owner.** No DDL. Cannot disable triggers. No BYPASSRLS. |

Create both with SQL (`CREATE ROLE ... LOGIN`). Roles created in the Neon console become members of `neon_superuser`. Do not use the console for these two roles. Set `ALTER DEFAULT PRIVILEGES FOR ROLE faithmap_migrator` so new tables grant DML to `faithmap_app`.
Check before use: the app code does not run DDL at request time (`prepareSchema` only counts migrations). NOT VERIFIED against every route.
Apply the same split on `main` later. Use different passwords per branch.

## 6. Protection for `main` (proposal, not executed)

1. Set `main` as a protected branch. Availability on the Free plan: NOT VERIFIED. Check in the Neon console first.
2. Do not add the `main` host to any sandbox allow list.
3. Do not place a `main` credential in Vercel Preview.
4. Take a restore point (Neon branch or PITR) before the first production migration.
5. Reset the `neondb_owner` password of `main` after the role split. Store it only in Vercel (Production target, sensitive).

## 7. PostgreSQL compatibility (18 vs 16)

| Item | Finding |
|---|---|
| CI | `postgres:16` service. All suites run on 16 (`.github/workflows/ci.yml`) |
| Local | PostgreSQL 16.15 only. No PostgreSQL 18 server in the sandbox |
| Neon | 18.7 |
| SQL scan of 4 migrations | `CREATE TABLE` x38, `CREATE INDEX` x38, `CREATE UNIQUE INDEX` x21, `CREATE TRIGGER` x5, `gen_random_uuid` x37, 3 `plpgsql` functions |
| Extensions needed | None |
| Role or `GRANT` statements | None |
| Driver | `pg` with `rejectUnauthorized: true` for remote hosts |

Assessment: INFERRED low risk. The migrations use core SQL only. `gen_random_uuid` is built in since PostgreSQL 13. I know of no change in 17 or 18 that affects these statements. I did not check the release notes in this session. No migration or test ran on 18. **Compatibility is NOT VERIFIED.**

Risks before the first migration:
1. Behaviour of the app tests on 18 is unknown. CI covers 16 only.
2. A Neon `development` reset or a restore is the rollback. Both need approval.
3. If `db:migrate` fails halfway, the `drizzle` schema may hold a partial state. Drizzle runs the migrations in one transaction per run. NOT VERIFIED on 18.

Recommendation: add a PostgreSQL 18 job to CI (or run the Neon `development` migration first). The `development` database is empty, so a failed run loses no data.

## 8. Vercel and source checks

| Check | Result |
|---|---|
| `PGUSER`, `PGPASSWORD`, `PGHOST`, `PGDATABASE` in `src/`, `scripts/`, `tests/`, `drizzle.config.ts`, `next.config.mjs` | **No use found** (VERIFIED by grep) |
| `PGUSER` value | `neondb_owner` (decrypted on request, role name only) |
| `PGPASSWORD` | Not decrypted. Vercel flags it `readable-secret` |
| `PG*` targets | Preview and Production. `configurationId` is null (not from the Neon integration) |
| App database setting | Reads `DATABASE_URL` only |
| Node in `package.json` | `engines.node = 22.x` |
| Node in CI | `node-version: 22` in the workflow file. The commit title says `node24`, which does not match the file |
| Node in Vercel | **`26.x`** project setting |
| SSO protection | On for all deployments. Password protection off |

Node: Vercel may prefer `engines` over the project setting. NOT VERIFIED. The three values do not match. Align the project setting to `22.x`.

### Preview setup proposal (not executed)

Set each variable on target `preview` with `gitBranch = claude/vigilant-noether-4fn1g1`. Do not use All Environments. Do not edit Production.

| Variable | Source | Type |
|---|---|---|
| `DATABASE_URL` | `faithmap_app` on `development`. Use the pooled host after the pooler is on | sensitive |
| `AUTH_SESSION_PEPPER` | New random 32 bytes. Never shown | sensitive |
| `CRON_SECRET` | New random 32 bytes. Never shown | sensitive |
| `APP_BASE_URL` | URL of the branch Preview. Confirm after the first deploy | plain |
| `LINE_LOGIN_CHANNEL_ID` | Owner (public ID) | plain |
| `NEXT_PUBLIC_LIFF_ID` | Owner (public ID) | plain |

Do not delete or edit `PG*` in this phase. After the Preview works, ask the owner to approve removal of `PGPASSWORD` from Production, since the app does not read it.

## 9. API key security

| Item | Result |
|---|---|
| Personal API keys in the account | **1.** Name `Claude`, id 3540068, created 2026-11-15 13:28Z (VERIFIED) |
| Organization API keys | 0 (VERIFIED) |
| Scope | A personal key has account-level reach. It can create and delete projects and branches |
| Where stored | As a network secret on the cloud environment `faithmap`. The environment is shared by every session that uses it |
| Network change this phase | Added one allowed host: the `development` endpoint. The `main` host is not allowed |

Owner action after Discovery ends:
1. Revoke key id 3540068 in the Neon console (Account settings, API keys).
2. Delete the `console.neon.tech` network secret from the environment `faithmap`.
3. Remove the `development` endpoint host from the environment allow list.
4. For later work, create a key that is project-scoped, with a short life.

## 10. Security risks

| ID | Risk | Level | Status |
|---|---|---|---|
| R-1 | App would run as `neondb_owner` (owner, BYPASSRLS, can drop triggers). Weakens audit immutability | High | Open. Fix: role split (section 5) |
| R-2 | `main` is not protected | Medium | Open |
| R-3 | Account-level API key exists and the environment is shared | High | Open until the owner revokes it |
| R-4 | `PGPASSWORD` in Production and Preview, flagged `readable-secret`, unused by code | Medium | Open. Branch of origin NOT VERIFIED |
| R-5 | PostgreSQL 18 untested. CI covers 16 | Medium | Open |
| R-6 | Node mismatch: Vercel 26.x, package 22.x, CI 22 | Low | Open |
| R-7 | SSO protection blocks LINE users on Preview | High for LIFF test | Owner decision open |
| R-8 | Pooler off. Many instances can exhaust connections | Low | Open |
| R-9 | `neon_auth` schema and roles are not used by FaithMap | Low | Open |
| R-10 | `main` content not counted | Low | Open |

## 11. Recommended execution plan

Every step needs owner approval. Run in this order.

| Step | Level | Action | Check after |
|---|---|---|---|
| 1 | Owner | Revoke the API key (section 9) or approve a scoped key | Key list is empty |
| 2 | RED | Create `faithmap_migrator` and `faithmap_app` on `development` with SQL | `pg_roles` shows both, no extra flags |
| 3 | RED | Enable the pooler on the `development` endpoint | Endpoint `pooler_enabled = true` |
| 4 | YELLOW | Set Vercel Node to `22.x` | `get_project` shows 22.x |
| 5 | YELLOW | Set the 6 Preview variables for the one branch (section 8) | Variable list shows names and targets only |
| 6 | RED | Run `db:migrate` on `development` as `faithmap_migrator`, with `FAITHMAP_CONFIRM_MIGRATE_HOST` set | 4 of 4 migrations, 38 tables, 5 triggers |
| 7 | RED | Run `db:bootstrap-admin` from the owner terminal | One `super_admin` row |
| 8 | YELLOW | Decide the SSO Protection option for the Preview | LIFF opens in LINE |
| 9 | YELLOW | Deploy the Preview. Check HTTP, runtime logs, `/api/health` | Responses and logs |
| 10 | RED | Protect `main`. Apply the role split on `main` later, before production | Branch shows protected |

Stop points: steps 2, 3, 6, 7 and 10 change Neon or the database. I do not run them without a separate approval for each.
