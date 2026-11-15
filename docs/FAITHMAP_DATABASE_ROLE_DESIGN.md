# FaithMap — Database Role Design (Phase A.4)

Date: 2026-11-15
Status: **DESIGN ONLY. Nothing in this document ran on Neon.**
Target: Neon project `faithmap` (`icy-violet-42450826`), branch `development` (`br-rough-pine-b3ze5x1g`), database `neondb`.
Related: `FAITHMAP_NEON_SECURITY_AUDIT.md`, `FAITHMAP_MIGRATION_EXECUTION_PLAN.md`, `FAITHMAP_DEPLOYMENT_COMPATIBILITY.md`.
This document holds no password, connection string or API key.

## 1. Evidence rules

| Mark | Meaning |
|---|---|
| VERIFIED | A command in this session produced the result. The test environment is named. |
| INFERRED | The result follows from verified data. No direct test. |
| NOT VERIFIED | No check ran. |

Test environments used in this phase (both local, both scratch, both deleted or stopped after use):
- **PG16:** PostgreSQL 16.15 server in a scratch cluster. Real TCP login as each role.
- **PG18.6:** PostgreSQL 18.6 in PGlite (WebAssembly, single session). PGlite checks table and schema privileges by the current role. A `SET ROLE` test is not valid there, because the session user is a superuser.
- **Neon:** NOT used for any change in this phase. The Neon `development` branch is PostgreSQL 18.7.

## 2. Design goals

1. The web app never owns a table. It cannot disable, drop or bypass an immutable trigger.
2. The web app cannot change the schema, create roles or read other roles' secrets.
3. Audit tables accept inserts only from the web app.
4. One role runs migrations. Only the owner uses it, from a terminal. It is never stored in Vercel.
5. A new table fails closed. The app has no right to it until the grants script runs.

## 3. Roles

| Property | `faithmap_migrator` | `faithmap_app` |
|---|---|---|
| Purpose | Runs `db:migrate`, grants, `db:bootstrap-admin` | Runtime of the web app and cron routes |
| Used by | Owner terminal only | Vercel Preview (`DATABASE_URL`) |
| LOGIN | Yes | Yes |
| SUPERUSER, CREATEDB, CREATEROLE, REPLICATION | No | No |
| BYPASSRLS | **No** | **No** |
| Role membership | None | None |
| Connection limit | 5 | 40 (the pool is 5 per instance by default, 20 at most) |
| Session settings | `search_path = public` | `search_path = public`, `statement_timeout = 30s`, `idle_in_transaction_session_timeout = 60s` |
| Owns | All tables, functions and triggers in `public`. Schema `drizzle` | Nothing |

BYPASSRLS: the 4 migrations contain no `ROW LEVEL SECURITY` and no `CREATE POLICY` (VERIFIED by grep). Both roles are `NOBYPASSRLS` so that any future policy applies to them. `04_verify_roles.sql` fails if either flag changes.

## 4. Privilege matrix

| Object | `faithmap_migrator` | `faithmap_app` | PUBLIC |
|---|---|---|---|
| Database `neondb` | CONNECT, CREATE | CONNECT | CONNECT, TEMP (PostgreSQL default, not removed) |
| Schema `public` | USAGE, CREATE | USAGE | none (removed) |
| Schema `drizzle` | owner | USAGE | none |
| `drizzle.__drizzle_migrations` | owner | SELECT only | none |
| 34 ordinary tables | owner (all rights) | SELECT, INSERT, UPDATE, DELETE | none |
| 4 append-only tables | owner | **SELECT, INSERT** | none |
| Sequences | owner | USAGE, SELECT (none exist today) | none |
| Functions in `public` (3 trigger functions) | owner | **no EXECUTE** | **no EXECUTE** (revoked) |
| TRUNCATE, REFERENCES, TRIGGER on any table | owner only | **never granted** | none |

Append-only tables (all four have an immutable trigger):

| Table | Trigger | Migration |
|---|---|---|
| `report_audit_events` | `trg_report_audit_immutable` | 0001 |
| `security_audit_logs` | `trg_security_audit_immutable` | 0001 |
| `meeting_briefs` | `trg_meeting_brief_immutable` | 0001 |
| `data_quality_decisions` | `trg_dq_decisions_immutable`, `trg_dq_decisions_chain` | 0003 |

Why `meeting_briefs` is insert-only for the app: the trigger blocks every update of a row with `is_immutable = true`. The app inserts every brief with `is_immutable = true` (`insights/service.ts`). No code path updates or deletes a brief (VERIFIED by grep). Insert-only matches `DEC-01`.

### Default privileges

| Setting (set by `faithmap_migrator`) | Effect |
|---|---|
| `ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` | New functions have no EXECUTE for PUBLIC |
| `ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC` | New tables give nothing to PUBLIC |
| `ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC` | New sequences give nothing to PUBLIC |
| No default grant to `faithmap_app` | **Fail closed.** A new table has no app rights until `03_post_migrate_grants.sql` runs |

Reason for no default grant: a default grant would give `UPDATE` and `DELETE` on a future audit table before anyone lists it as append-only. The trigger would still block the change, but the privilege layer would be open. The cost is one extra step after each migration. The verification query catches a missed step.

### Trigger and audit protection

| Attack by the app role | Result |
|---|---|
| `ALTER TABLE ... DISABLE TRIGGER` (one or ALL) | Denied: must be owner |
| `DROP TRIGGER`, `DROP FUNCTION`, `CREATE OR REPLACE FUNCTION` | Denied |
| `SET session_replication_role = replica` (skips triggers) | Denied: permission denied to set parameter |
| `TRUNCATE` an audit table (triggers do not fire on TRUNCATE) | Denied: no TRUNCATE right |
| `UPDATE` or `DELETE` an audit table | Denied at privilege level, before the trigger |
| Insert into `data_quality_decisions` (fires `trg_dq_decisions_chain`) | Trigger runs without EXECUTE on the function (VERIFIED on PG18.6, section 7) |

## 5. What the runtime role must not do — result

| Requirement | Test | Result |
|---|---|---|
| No CREATEROLE | `CREATE ROLE evil` | Denied (PG16, PG18.6) |
| No CREATEDB | Role flag in `pg_roles` | `false` (PG16, PG18.6) |
| No BYPASSRLS | Role flag; `ALTER ROLE ... BYPASSRLS` | `false`; denied |
| No REPLICATION | Role flag | `false` |
| No SUPERUSER | `ALTER ROLE ... SUPERUSER` | Denied |
| No DROP SCHEMA | `DROP SCHEMA public CASCADE` | Denied: must be owner |
| No ALTER TABLE | `ALTER TABLE members ADD COLUMN` | Denied: must be owner |
| No DDL | `CREATE TABLE`, `CREATE SCHEMA`, `CREATE INDEX` | Denied |
| No role switch | `SET ROLE faithmap_migrator`, `SET ROLE neondb_owner` | Denied (PG16 only; not valid in PGlite) |
| No file or program access | `COPY ... TO PROGRAM`, `COPY ... TO '/tmp/x'` | Denied |
| No self grant | `GRANT ALL ON ALL TABLES ... TO faithmap_app` | No effect: PostgreSQL reports "no privileges were granted" for all 38 tables, and the verification still passes |

## 6. Residual risks

| ID | Risk | Level | Mitigation |
|---|---|---|---|
| RR-1 | The owner (`faithmap_migrator`) can disable triggers and `TRUNCATE`. PostgreSQL gives these rights to every table owner. | Medium | Keep the migrator password out of Vercel and out of chat. Use it only from the owner terminal. Rotate it after each use on production. |
| RR-2 | `neondb_owner` and the Neon console user can still change anything. | Medium | Limit who owns the Neon account. Turn on branch protection for `main` (separate approval). |
| RR-3 | The app role can read PII tables (members, users). That is required. `DEC-06` limits PII by application rules, not by database rules. | Medium | Application authorization (the 28-test route matrix). No change in this phase. |
| RR-4 | Audit retention: the app cannot delete old audit rows. A retention job needs the migrator role or a new, approved role. | Low | Owner decision when a retention rule exists. `master status` documents the plan for `auth_sessions` only. |
| RR-5 | PUBLIC keeps CONNECT and TEMP on the database. I did not revoke them, because Neon internal roles may depend on PUBLIC rights. | Low | Optional hardening after a test on Neon. |
| RR-6 | The scripts ran on PostgreSQL 16.15 and PGlite 18.6. They did not run on Neon. Neon may add restrictions or default grants. | Medium | Run `04_verify_roles.sql` after step 1 of the plan. Stop if any check is false. |
| RR-7 | The full application test suite did not run under `faithmap_app`. I checked the code by grep (no UPDATE, DELETE, DDL or row lock on the 4 tables). A route may use a path that grep missed. | Medium | Smoke test on the Preview. Add a CI job later (needs approval, test code only). |
| RR-8 | `statement_timeout = 30s` may stop a long cron job. | Low | Raise it for the cron role only if a log shows a timeout. |

## 7. Test evidence

PG16 (real TCP, scratch cluster; the migrator and app logged in as themselves):

| Test | Result |
|---|---|
| `01` as owner, `02` as migrator | OK |
| `db:migrate` without `FAITHMAP_CONFIRM_MIGRATE_HOST` | Refused (the script prints only `{"type":"Error"}`; the message is hidden) |
| `db:migrate` with confirmation, as `faithmap_migrator` (no extra rights) | `migrations=4/4` |
| `03` grants | OK |
| `04` verification | 10 of 10 checks true |
| App role attack list (`05`) | 23 statements denied, 1 no-op (`GRANT`), all allowed statements ran |
| App role insert into `security_audit_logs`, then read | OK |
| Owner `UPDATE` and `DELETE` on `security_audit_logs` | Blocked by the trigger (`Audit table security_audit_logs is append-only and immutable`) |
| ACL of append-only tables | `faithmap_app=ar` (insert, select). Ordinary tables `faithmap_app=arwd` |
| Rollback `06`, `07`, then full re-run | Roles gone, 0 tables; re-run gives 10 of 10 |

PG18.6 (PGlite, same SQL files):

| Test | Result |
|---|---|
| Role design `01`, `02`, 4 migrations, `03` | Applied. `migrations applied: 4` |
| `04` verification | 10 of 10 true |
| App role attack list | 10 of 10 denied; 3 allowed statements ran |
| Trigger function without EXECUTE (test table) | Trigger fired and blocked the bad row |

Not tested: the same scripts on Neon (PostgreSQL 18.7).

## 8. SQL — full text

Run order: `01` (owner) → `02` (migrator) → migration (`FAITHMAP_MIGRATION_EXECUTION_PLAN.md`) → `03` (migrator) → `04` (any) → `05` (app, optional).
Run `psql` against the **direct** host (not the `-pooler` host) for `01`, `02`, `03`, `04`, `06`, `07`.

### 8.1 `01_owner_roles_and_schemas.sql` — as `neondb_owner`

Creates the two roles, sets limits, and sets database and schema rights.

```sql
-- 01_owner_roles_and_schemas.sql
-- Run as: neondb_owner, on database neondb, on branch development ONLY.
-- Passwords come from the shell of the person who runs this file. They never appear in the file.
--   (hex text is safe inside a connection URL)
--   export FAITHMAP_MIGRATOR_PW="$(openssl rand -hex 24)"
--   export FAITHMAP_APP_PW="$(openssl rand -hex 24)"
\set ON_ERROR_STOP on
\set migrator_pw `printenv FAITHMAP_MIGRATOR_PW`
\set app_pw `printenv FAITHMAP_APP_PW`

BEGIN;

-- Roles created with SQL do not join neon_superuser. They get no extra rights.
CREATE ROLE faithmap_migrator LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 5 PASSWORD :'migrator_pw';

CREATE ROLE faithmap_app LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 40 PASSWORD :'app_pw';

-- Runtime guard rails. They bound a stuck or abusive session.
ALTER ROLE faithmap_app SET statement_timeout = '30s';
ALTER ROLE faithmap_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE faithmap_app SET search_path = public;
ALTER ROLE faithmap_migrator SET search_path = public;

-- Database level
GRANT CONNECT ON DATABASE neondb TO faithmap_migrator, faithmap_app;
-- The migrator creates the drizzle schema itself (Drizzle runs CREATE SCHEMA IF NOT EXISTS).
-- That needs CREATE on the database. The app role does not get it.
GRANT CREATE ON DATABASE neondb TO faithmap_migrator;

-- Schema public: remove the implicit PUBLIC rights, then grant by role.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO faithmap_migrator;
GRANT USAGE ON SCHEMA public TO faithmap_app;

COMMIT;
```

### 8.2 `02_migrator_default_privileges.sql` — as `faithmap_migrator`

Sets default privileges for objects the migrator creates. Creates schema `drizzle` and lets the app read it.

```sql
-- 02_migrator_default_privileges.sql
-- Run as: faithmap_migrator, on database neondb. Run once, before the first migration.
-- ALTER DEFAULT PRIVILEGES without FOR ROLE applies to objects that the current role creates.
\set ON_ERROR_STOP on

-- New functions (including trigger functions) get no EXECUTE for PUBLIC.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- New tables and sequences give nothing to faithmap_app on their own.
-- The app gets rights only from 03_post_migrate_grants.sql. A new table fails closed.
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC;

-- Schema drizzle (migration history). The migrator owns it. The app can only read it.
CREATE SCHEMA IF NOT EXISTS drizzle;
GRANT USAGE ON SCHEMA drizzle TO faithmap_app;
```

### 8.3 `03_post_migrate_grants.sql` — as `faithmap_migrator`, after every migration

Resets and sets the app rights. Idempotent. It makes the 4 audit tables insert-only.

```sql
-- 03_post_migrate_grants.sql
-- Run as: faithmap_migrator, after EVERY successful db:migrate. The file is idempotent.
\set ON_ERROR_STOP on
BEGIN;

-- 1. Reset the app role in schema public, then grant the minimum.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC, faithmap_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, faithmap_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, faithmap_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO faithmap_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO faithmap_app;
-- No TRUNCATE, REFERENCES or TRIGGER is granted on any table.
-- No EXECUTE is granted on any function in public (trigger functions run without it).

-- 2. Append-only tables: the app can read and insert. It cannot update or delete.
REVOKE UPDATE, DELETE ON
  report_audit_events,
  security_audit_logs,
  data_quality_decisions,
  meeting_briefs
FROM faithmap_app;

-- 3. Migration history: the app can read it (assertMigrated). It cannot write it.
REVOKE ALL ON ALL TABLES    IN SCHEMA drizzle FROM PUBLIC, faithmap_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA drizzle FROM PUBLIC, faithmap_app;
GRANT SELECT ON drizzle."__drizzle_migrations" TO faithmap_app;

COMMIT;
```

When a future migration adds a table: add it to the append-only list in step 2 if it is an audit table. Then run the script.

### 8.4 `04_verify_roles.sql` — read-only; every row must show `t`

```sql
-- 04_verify_roles.sql
-- Run as: neondb_owner or faithmap_migrator. Read-only. Every check must return ok = true.
SELECT 'app_role_flags' AS check, bool_and(
         NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) AS ok
  FROM pg_roles WHERE rolname IN ('faithmap_app','faithmap_migrator')
UNION ALL
SELECT 'no_role_memberships', count(*) = 0
  FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
 WHERE r.rolname IN ('faithmap_app','faithmap_migrator')
UNION ALL
SELECT 'app_owns_nothing', count(*) = 0
  FROM pg_class c WHERE c.relowner = 'faithmap_app'::regrole
UNION ALL
SELECT 'migrator_owns_all_public_tables', bool_and(c.relowner = 'faithmap_migrator'::regrole)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
UNION ALL
SELECT 'app_cannot_modify_protected', NOT bool_or(
         has_table_privilege('faithmap_app', t, 'UPDATE') OR has_table_privilege('faithmap_app', t, 'DELETE')
         OR has_table_privilege('faithmap_app', t, 'TRUNCATE') OR has_table_privilege('faithmap_app', t, 'TRIGGER'))
  FROM unnest(ARRAY['report_audit_events','security_audit_logs','data_quality_decisions','meeting_briefs']) AS t
UNION ALL
SELECT 'app_no_truncate_trigger_references_anywhere', NOT bool_or(
         has_table_privilege('faithmap_app', c.oid, 'TRUNCATE') OR has_table_privilege('faithmap_app', c.oid, 'TRIGGER')
         OR has_table_privilege('faithmap_app', c.oid, 'REFERENCES'))
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname IN ('public','drizzle') AND c.relkind = 'r'
UNION ALL
SELECT 'app_no_create_on_schemas', NOT (has_schema_privilege('faithmap_app','public','CREATE')
                                     OR has_schema_privilege('faithmap_app','drizzle','CREATE'))
UNION ALL
SELECT 'app_drizzle_read_only', has_table_privilege('faithmap_app','drizzle.__drizzle_migrations','SELECT')
        AND NOT has_table_privilege('faithmap_app','drizzle.__drizzle_migrations','INSERT')
UNION ALL
SELECT 'no_function_exec_for_app_in_public', NOT bool_or(has_function_privilege('faithmap_app', p.oid, 'EXECUTE'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
UNION ALL
SELECT 'immutable_triggers_enabled', count(*) = 5 AND bool_and(tgenabled = 'O')
  FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'trg\_%';
```

### 8.5 `05_app_attack_tests.sql` — as `faithmap_app`; optional

Every statement marked DENIED must fail. Run it only on `development`, because it inserts one row into `security_audit_logs`. That row cannot be deleted by the app (by design). Remove it with `06` (set the data-loss flag for that run).

```sql
-- 05_app_attack_tests.sql  (run as faithmap_app). Each statement must FAIL except the ones marked EXPECT OK.
\set ON_ERROR_STOP off
\echo '--- EXPECT OK: read migration history'
SELECT count(*) FROM drizzle."__drizzle_migrations";
\echo '--- EXPECT OK: insert into append-only table, then read it'
INSERT INTO security_audit_logs (action, target_type) VALUES ('role_test','test');
SELECT count(*) FROM security_audit_logs;
\echo '--- EXPECT DENIED: update / delete / truncate append-only table'
UPDATE security_audit_logs SET outcome = 'x';
DELETE FROM security_audit_logs;
TRUNCATE security_audit_logs;
\echo '--- EXPECT DENIED: disable or drop immutable triggers'
ALTER TABLE security_audit_logs DISABLE TRIGGER trg_security_audit_immutable;
ALTER TABLE security_audit_logs DISABLE TRIGGER ALL;
DROP TRIGGER trg_security_audit_immutable ON security_audit_logs;
CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;
DROP FUNCTION prevent_audit_mutation() CASCADE;
\echo '--- EXPECT DENIED: bypass triggers with session settings'
SET session_replication_role = replica;
\echo '--- EXPECT DENIED: DDL'
CREATE TABLE evil (id int);
ALTER TABLE members ADD COLUMN evil int;
DROP TABLE members;
DROP SCHEMA public CASCADE;
CREATE SCHEMA evil;
CREATE INDEX evil_idx ON members (id);
\echo '--- EXPECT DENIED: write migration history'
INSERT INTO drizzle."__drizzle_migrations" (hash, created_at) VALUES ('x', 1);
\echo '--- EXPECT DENIED: role and privilege escalation'
CREATE ROLE evil;
ALTER ROLE faithmap_app BYPASSRLS;
ALTER ROLE faithmap_app SUPERUSER;
SET ROLE faithmap_migrator;
SET ROLE neondb_owner;
GRANT ALL ON ALL TABLES IN SCHEMA public TO faithmap_app;
\echo '--- EXPECT DENIED: server side files and programs'
COPY members TO PROGRAM 'id';
COPY members TO '/tmp/x';
\echo '--- EXPECT OK: normal DML on an ordinary table'
SELECT count(*) FROM members;
DELETE FROM members WHERE false;
```

### 8.6 Rollback

See section 9.

## 9. Rollback plan

| Situation | Action | Data loss |
|---|---|---|
| `01` fails | It runs in one transaction. PostgreSQL rolls it back. No role exists. Fix the cause and run again. | None |
| `02` fails | Nothing from `02` has an effect except default privileges. Run `06` then `07`. | None |
| Migration fails | Drizzle runs all pending migrations in one transaction (`session.transaction` in drizzle-orm 0.45.4, VERIFIED in source). The schema stays unchanged. | None |
| Grants wrong | Run `03` again. It resets the app rights first. | None |
| Roles must go | Run `06` (migrator) then `07` (owner). | **All FaithMap tables on the branch** |
| Whole branch bad | Reset `development` from its parent in the Neon console, or restore a point in time. Needs separate approval. | Branch only |

`06` refuses to run if any table holds a row. To continue, the person sets `PGOPTIONS="-c faithmap.allow_data_loss=yes"` for that run. Use this only on a database that holds no real data.
`07` restores the default `USAGE` right for PUBLIC on schema `public`.

### 9.1 `06_rollback_schema.sql` — as `faithmap_migrator`, `development` only

```sql
-- 06_rollback_schema.sql
-- Run as: faithmap_migrator, on the development branch ONLY.
-- Removes every FaithMap table, function and the drizzle schema. DESTRUCTIVE.
-- The guard stops the script if any table holds data. Use it only on an empty or disposable database.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE r record; total bigint := 0; n bigint;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tablename) INTO n;
    total := total + n;
  END LOOP;
  IF total > 0 AND current_setting('faithmap.allow_data_loss', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Refusing rollback: % rows exist. Set faithmap.allow_data_loss = yes to continue.', total;
  END IF;
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP TABLE public.%I CASCADE', r.tablename);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace AND p.proowner = current_user::regrole LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END $$;
DROP SCHEMA IF EXISTS drizzle CASCADE;
-- Restore the PostgreSQL default for new functions. This removes the default-privilege entry
-- that would block DROP ROLE in 07_rollback_roles.sql.
ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
COMMIT;
```

### 9.2 `07_rollback_roles.sql` — as `neondb_owner`, after `06`

```sql
-- 07_rollback_roles.sql
-- Run as: neondb_owner, AFTER 06_rollback_schema.sql. Removes the two roles and their grants.
\set ON_ERROR_STOP on
BEGIN;
REVOKE ALL ON SCHEMA public FROM faithmap_migrator, faithmap_app;
REVOKE ALL ON DATABASE neondb FROM faithmap_migrator, faithmap_app;
-- Give the public schema its original PUBLIC rights back (PostgreSQL 15+ default).
GRANT USAGE ON SCHEMA public TO PUBLIC;
DROP ROLE faithmap_app;
DROP ROLE faithmap_migrator;
COMMIT;
```

Tested on PG16: guard refused with data present; `06` and `07` removed everything; `01`, `02`, migration and `03` then ran again with 10 of 10 checks true.

## 10. Open items (all need owner approval)

1. Run `01` and `02` on `development` (RED).
2. Decide if `main` gets the same split before any production use.
3. Decide the audit retention rule (RR-4).
4. Approve a CI job that runs the test suite under `faithmap_app` (RR-7).

