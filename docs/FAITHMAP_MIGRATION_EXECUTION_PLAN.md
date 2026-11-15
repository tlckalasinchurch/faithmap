# FaithMap — Migration Execution Plan (Phase A.4)

Date: 2026-11-15
Status: **PLAN ONLY. No migration ran on Neon.**
Target: Neon project `faithmap`, branch `development`, database `neondb` (PostgreSQL 18.7).
Related: `FAITHMAP_DATABASE_ROLE_DESIGN.md` (SQL files `01`–`07`), `FAITHMAP_NEON_SECURITY_AUDIT.md`.
This document holds no password or connection string. Evidence marks are the same as in the role design document.

## 1. Migration inventory (VERIFIED by reading the files)

| idx | File | Lines | SHA-256 (first 10) | Adds |
|---|---|---|---|---|
| 0 | `0000_baseline.sql` | 792 | 004099cf82 | 37 tables, 56 indexes, 79 foreign keys |
| 1 | `0001_immutable_triggers.sql` | 37 | 6c17355818 | 2 functions, 3 triggers (audit logs and meeting briefs) |
| 2 | `0002_data_quality_decisions.sql` | 17 | 058492b072 | 1 table, 3 indexes, 3 foreign keys |
| 3 | `0003_data_quality_decisions_immutable.sql` | 28 | f0ee434552 | 1 function, 2 triggers |

Result after all four: **38 tables, 3 functions, 5 triggers**, plus the Drizzle history table `drizzle.__drizzle_migrations`.

## 2. Safety review of the 4 migrations

| Check | Finding |
|---|---|
| Extensions | None. `gen_random_uuid()` is built in since PostgreSQL 13 (37 uses) |
| `CREATE ROLE`, `GRANT`, `REVOKE`, `OWNER TO` | None. The migrations are independent of role design |
| Superuser statements | None |
| Row-level security | None |
| Data changes (`INSERT`, `UPDATE`, `DELETE`) | None. Schema only |
| Destructive statements (`DROP`, `TRUNCATE`) | None |
| Schema qualification | Foreign keys name `"public".<table>`. Other objects use the first schema in `search_path` (`public`). Both roles set `search_path = public` |
| Transaction | Drizzle's migrator runs all pending migrations in one transaction (`session.transaction`, drizzle-orm 0.45.4, VERIFIED in source). A failure leaves the schema unchanged |
| Idempotence | Not idempotent by design. Drizzle skips applied entries by `created_at` and records each one |
| Trigger function body | PL/pgSQL only. No dynamic SQL. Error codes `42501` and `23514` |

## 3. Which role runs the migration

`faithmap_migrator`. It needs only:
- `CONNECT` and `CREATE` on the database. Drizzle runs `CREATE SCHEMA IF NOT EXISTS drizzle`. I granted `CREATE` for this reason. I did not test the migration without it.
- `USAGE` and `CREATE` on schema `public`.

Evidence: the migrator, with no other right, ran all 4 migrations on PG16 (TCP login) and on PG18.6 (PGlite). Result `migrations=4/4`.
Do **not** run the migration as `neondb_owner`. Tables would belong to `neondb_owner`. The runtime role design needs the migrator to own them.
Do **not** run it as `faithmap_app`. That role has no DDL rights, by design.

## 4. PostgreSQL 16 versus 18

Method: I ran the 4 migrations and the role scripts on PostgreSQL 16.15 and on 18.6. I then compared 6 catalog extracts (columns, indexes, constraints, triggers, function bodies by hash, table ACLs).

| Catalog extract | PG16 | PG18.6 | Same? |
|---|---|---|---|
| Columns (type, null, default) | 493 | 493 | Yes |
| Indexes (`indexdef`) | 112 | 112 | Yes |
| Constraints (PK, FK, UNIQUE, CHECK) | 183 | 183 | Yes |
| Triggers (definition, enabled flag) | 5 | 5 | Yes |
| Functions (name, hash of body) | 3 | 3 | Yes |
| Table ACLs | 38 | 38 | Yes, after the note below |

Differences found (both are PostgreSQL behaviour, not schema differences):

| ID | PG16 | PG18 | Effect on FaithMap |
|---|---|---|---|
| D-1 | `NOT NULL` is stored on the column only | `NOT NULL` is also a row in `pg_constraint` (299 extra rows with names like `<table>_<column>_not_null`) | None. Only catalog queries that count constraints see it. Use `contype <> 'n'` if a check counts constraints |
| D-2 | Owner ACL `arwdDxt` | Owner ACL `arwdDxtm`. The `m` is the MAINTAIN right (PostgreSQL 17 and later) | None. Comparison scripts must ignore `m` |

After I removed the 299 `NOT NULL` rows and the `m` flag from the PG18 extract, the two extracts were identical (0 diff lines).

Limits of this evidence:
- PG18.6 ran inside PGlite (WebAssembly, single session). It is not Neon's server (18.7) and not a network login.
- I did not read the PostgreSQL 17 and 18 release notes in this session (the host is not in the sandbox allow list). I do not claim a complete list of changes.
- The application tests ran on PGlite 18.6 before this phase (103 passed, 13 skipped in the PR description) and on PG16 in CI. They did not run on Neon.

## 5. Preconditions (check before step 1)

| # | Check | How |
|---|---|---|
| P-1 | Owner approved this plan in writing | Chat |
| P-2 | Branch is `development` (`br-rough-pine-b3ze5x1g`) and not `main` | Host name in the Neon console |
| P-3 | Repository at `def4e2f` or later; `npm ci` done; Node 22 | `node -v` shows v22 |
| P-4 | Roles `01` and `02` done and `04` was not run yet | Section 6, steps 1–2 |
| P-5 | `development` still has 0 FaithMap tables | `\dt` shows no rows |
| P-6 | Connection string for the **direct** host (no `-pooler`) built in the owner shell | Neon console, "Connection details", unpooled |
| P-7 | A restore point exists: Neon "restore window" or a child branch of `development` | Neon console. Needs approval to create |

## 6. Execution steps

Every step needs owner approval first. The owner runs steps that use a password. Values come from the owner shell. Do not paste them into chat.

| Step | Level | Who | Action | Pass condition |
|---|---|---|---|---|
| 1 | RED | Owner | Run `01_owner_roles_and_schemas.sql` as `neondb_owner` (direct host) | No error. Two new roles |
| 2 | RED | Owner | Run `02_migrator_default_privileges.sql` as `faithmap_migrator` | No error. Schema `drizzle` exists |
| 3 | RED | Owner | Run the migration (section 6.1) | `FaithMap schema ready (driver=postgres, migrations=4/4).` |
| 4 | RED | Owner | Run `03_post_migrate_grants.sql` as `faithmap_migrator` | No error |
| 5 | GREEN | Owner or Claude | Run `04_verify_roles.sql` | 10 rows, all `t` |
| 6 | GREEN | Owner or Claude | Run the content check (section 6.2) | Numbers match the table |
| 7 | RED | Owner | Run `db:bootstrap-admin` (section 6.3) | `Super admin created: <username>` |

### 6.1 Migration command

```bash
# In the owner shell, inside the repository. Values stay in the shell. Nothing is echoed.
export DATABASE_URL='postgresql://faithmap_migrator:<MIGRATOR_PASSWORD>@<DEVELOPMENT_DIRECT_HOST>/neondb'
export FAITHMAP_CONFIRM_MIGRATE_HOST='<DEVELOPMENT_DIRECT_HOST>'   # host name only, as in the URL
npm ci
npm run db:migrate
unset DATABASE_URL FAITHMAP_CONFIRM_MIGRATE_HOST
```

Rules:
- Use the direct host. A pooled host (`-pooler`) runs PgBouncer in transaction mode. A migration needs one session.
- The password must be URL-safe. Use hex from `openssl rand -hex 24`.
- `db:migrate` refuses a remote host unless `FAITHMAP_CONFIRM_MIGRATE_HOST` equals the URL host. If the host differs, the script prints only `Migration failed: {"type":"Error"}`. The refusal text is not shown (observed on PG16 test). This is a usability gap. Fixing it is a code change and needs separate approval.
- The app TLS check is strict for remote hosts (`rejectUnauthorized: true`). Neon certificates verify with the default store.
- No application process may run migrations. The app only counts them (`assertMigrated`).

### 6.2 Content check (read-only, as `faithmap_migrator`)

```sql
SELECT 'public_tables'      AS check, count(*)::text AS value, '38' AS expected FROM pg_tables WHERE schemaname = 'public'
UNION ALL SELECT 'migrations',        count(*)::text, '4'   FROM drizzle."__drizzle_migrations"
UNION ALL SELECT 'indexes',           count(*)::text, '112' FROM pg_indexes WHERE schemaname = 'public'
UNION ALL SELECT 'constraints (not NOT NULL)', count(*)::text, '183'
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype <> 'n'
UNION ALL SELECT 'triggers',          count(*)::text, '5'   FROM pg_trigger WHERE NOT tgisinternal
UNION ALL SELECT 'functions',         count(*)::text, '3'   FROM pg_proc WHERE pronamespace = 'public'::regnamespace
UNION ALL SELECT 'total_rows',
  (SELECT sum((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', tablename), false, true, '')))[1]::text::bigint)
     FROM pg_tables WHERE schemaname = 'public')::text, '0';
```

The query reads counts only. It reads no row value. Compare the migration hashes with the repository: the `drizzle.__drizzle_migrations.hash` column holds the SHA-256 of each file. The first 10 characters must equal the inventory in section 1.

### 6.3 Bootstrap admin (RED)

```bash
export DATABASE_URL='postgresql://faithmap_migrator:<MIGRATOR_PASSWORD>@<DEVELOPMENT_DIRECT_HOST>/neondb'
export FAITHMAP_CONFIRM_MIGRATE_HOST='<DEVELOPMENT_DIRECT_HOST>'
export FAITHMAP_BOOTSTRAP_USERNAME='<chosen by owner>'
export FAITHMAP_BOOTSTRAP_NAME='<chosen by owner>'
read -rs FAITHMAP_BOOTSTRAP_PASSWORD && export FAITHMAP_BOOTSTRAP_PASSWORD   # typed by the owner, not echoed
npm run db:bootstrap-admin
unset DATABASE_URL FAITHMAP_CONFIRM_MIGRATE_HOST FAITHMAP_BOOTSTRAP_USERNAME FAITHMAP_BOOTSTRAP_NAME FAITHMAP_BOOTSTRAP_PASSWORD
```

The script uses an advisory lock and creates the first `super_admin` only once (`bootstrap.ts`). Claude does not create or see the admin password. I did not test this script in Phase A.4.

## 7. Risks and stop conditions

| ID | Risk | Level | Stop condition |
|---|---|---|---|
| M-1 | Neon runs 18.7. I tested 18.6 in PGlite and 16.15 in a real server. | Medium | Any error in step 3. Run the rollback and report the full error text (without the connection string) |
| M-2 | Neon may reject a statement in `01`, such as `REVOKE ALL ON SCHEMA public FROM PUBLIC`. | Medium | Any error in step 1. The script is one transaction, so nothing changes |
| M-3 | A SQL-created role on Neon may get extra rights. | Medium | Step 5 shows any `f` |
| M-4 | A pooled host or the wrong branch host is used. | High | P-2 fails. Do not continue |
| M-5 | The connection URL contains a character that needs encoding. | Low | Login fails in step 3. Create a new password with hex |
| M-6 | Migration uses a long transaction on a 0.25 CU compute. | Low | Timeout. Run again after the compute is awake |
| M-7 | The app finds a missing grant at runtime (`permission denied`). | Medium | Preview smoke test shows a 500. Read the runtime log. Add the missing grant to `03` after owner approval |

## 8. Rollback plan

| Point | Action | Data loss |
|---|---|---|
| Step 3 fails | Automatic. One transaction. Schema unchanged | None |
| After step 3, before step 7 | Run `06_rollback_schema.sql` as `faithmap_migrator`. Then `07_rollback_roles.sql` as `neondb_owner` | Empty database only |
| After step 7 | Same, with `PGOPTIONS="-c faithmap.allow_data_loss=yes"`. This deletes the admin row. Owner must approve | Admin row |
| Wrong branch used | Stop. Reset the branch in the Neon console from its parent, or restore a point in time. Needs approval | Branch only |
| Grants wrong | Run `03` again | None |

Tested on PG16: `06` refused with data present, then removed all objects with the flag; `07` removed both roles; steps 1–5 ran again with 10 of 10 checks true.
Not tested: rollback on Neon.

## 9. Approval gates

| Gate | Needs approval | Not in this phase |
|---|---|---|
| G-1 | Steps 1, 2 (create roles) | Yes, not run |
| G-2 | Step 3 (write schema) | Yes, not run |
| G-3 | Step 4 (grants) | Yes, not run |
| G-4 | Step 7 (create admin) | Yes, not run |
| G-5 | Create a restore point or child branch (P-7) | Yes, not run |
| G-6 | Any run on `main` | Not planned |

## Addendum: migration 0004 (prepared, not run)

File: `drizzle/0004_team_field_points_scope.sql`. Owner decision Q-8 (2026-11-15).

| Item | Value |
|---|---|
| Change | 4 nullable columns on `team_field_points` (`body_id`, `coordinator_user_id`, `assigned_by_user_id`, `assigned_at`), 3 foreign keys (`ON DELETE SET NULL`), 2 indexes |
| Data change | None. No backfill. Old rows keep NULL |
| Destructive | No. No DROP, no NOT NULL, no default |
| Run by | `faithmap_migrator`, after 0000 to 0003, in the same approved Y6 step. Not run on Neon yet |
| Grants | `faithmap_app` already holds table-level SELECT/INSERT/UPDATE/DELETE on this table. No grant change |
| Legacy NULL rows | Match nobody. Only admins read them until an admin maps each point (`assign_point`). The system does not infer links from names or phones |
| Mapping gate | No non-admin reads any point while one point has `body_id` NULL |
| Rollback | Before any mapping: `ALTER TABLE team_field_points DROP COLUMN` for the four columns (drops indexes and keys). After mapping, the links are lost. Take a Neon branch restore point first |
| Verification | After Y6: count columns, count NULL rows (all rows), confirm a non-admin gets 403 |
