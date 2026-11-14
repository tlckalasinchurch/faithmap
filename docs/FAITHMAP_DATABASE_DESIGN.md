# FaithMap — Database Design

**Document ID:** `FM-05` · **Version:** `2.0` · **Date:** `2026-11-14` · **Status:** `Approved Baseline (GATE-1)`  
**Product:** **FaithMap** (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`)

---

## 1. Clean-Slate Database Policy

- FaithMap uses a **brand-new Neon PostgreSQL 16+ database** provisioned specifically for FaithMap.
- **Zero Puntakit tables, columns, IDs, or records** are copied or imported.
- Primary keys are `UUID` with strict foreign keys (`ON DELETE RESTRICT` for historical integrity).
- Timestamps use `TIMESTAMPTZ` (UTC); calendar dates use `DATE` interpreted in `Asia/Bangkok`.

---

## 2. Entity-Relationship Overview

```text
users 1---0..1 members
  |              |
  |              +---< group_memberships >--- house_mission_groups >--- bodies
  |              |                                     |
  +--------------+<--- assignments --------------------+ (group_id OR body_id)
  |
  +---< auth_sessions
  +---< external_identities (LINE Login)
  +---< user_passkeys (WebAuthn Fallback)

bodies 1---< house_mission_groups 1---< weekly_reports >--- reporting_periods
                                              |
                                              +---< attendance_records >--- members
                                              +---< report_audit_events
                                              +---< follow_up_items

visitors >--- house_mission_groups
reporting_periods 1---0..1 meeting_briefs
reporting_periods 1---< period_group_snapshots >--- house_mission_groups
```

---

## 3. Core Tables & Constraints

### 3.1 Identity & Access (`DEC-03`)

#### `users`
| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PK` | Clean-slate UUID |
| `display_name` | `TEXT` | `NOT NULL` | Display name |
| `email` | `TEXT` | `UNIQUE` (case-insensitive functional index, nullable) | Optional if LINE-only |
| `phone_e164` | `TEXT` | `UNIQUE` (nullable) | Normalized `+66...` |
| `password_hash` | `TEXT` | Nullable | Argon2id fallback credential |
| `system_role` | `TEXT` | `NOT NULL CHECK (system_role IN ('super_admin','admin','mission_leader','standard_user'))` | Global role only |
| `status` | `TEXT` | `NOT NULL CHECK (status IN ('invited','active','suspended','deactivated'))` | Usable requires `active` + credential |
| `member_id` | `UUID` | `FK -> members(id) UNIQUE` (nullable) | Links login account to person record |
| `last_login_at` | `TIMESTAMPTZ` | Nullable | |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | |

#### `auth_sessions`, `external_identities`, & `user_passkeys`
- `auth_sessions`: `id (UUID PK)`, `user_id (FK -> users.id NOT NULL)`, `token_hash (TEXT UNIQUE NOT NULL)`, `csrf_secret_hash (TEXT NOT NULL)`, `expires_at (TIMESTAMPTZ NOT NULL)`, `revoked_at (TIMESTAMPTZ)`, `created_at`.
- `external_identities`: `id (UUID PK)`, `user_id (FK -> users.id NOT NULL)`, `provider (TEXT NOT NULL CHECK (provider IN ('line')))`, `provider_subject_id (TEXT NOT NULL)`, `linked_at (TIMESTAMPTZ NOT NULL)`, `linked_by_user_id (FK -> users.id NOT NULL)`, `revoked_at (TIMESTAMPTZ)`. Partial unique index: `UNIQUE (provider, provider_subject_id) WHERE revoked_at IS NULL`.
- `user_passkeys`: `id (UUID PK)`, `user_id (FK -> users.id NOT NULL)`, `credential_id (TEXT UNIQUE NOT NULL)`, `public_key (BYTEA NOT NULL)`, `counter (BIGINT NOT NULL)`, `device_name (TEXT)`, `created_at`, `last_used_at`.

---

### 3.2 Organization & Stewardship

#### `organization_settings`
- `id (UUID PK)`, `organization_name (TEXT NOT NULL)`, `timezone (TEXT NOT NULL DEFAULT 'Asia/Bangkok')`, `week_start_weekday (SMALLINT NOT NULL DEFAULT 1)` *(1 = Monday per `DEC-02`)*, `deadline_weekday (SMALLINT NOT NULL DEFAULT 0)` *(0 = Sunday)*, `deadline_time_local (TIME NOT NULL DEFAULT '20:00:00')` *(`DEC-01`)*, `brief_time_local (TIME NOT NULL DEFAULT '20:30:00')` *(`DEC-01`)*.

#### `bodies`, `house_mission_groups`, `group_body_transfers`
- `bodies`: `id (UUID PK)`, `code (TEXT UNIQUE NOT NULL)`, `name (TEXT NOT NULL)`, `description (TEXT)`, `status (TEXT NOT NULL CHECK (status IN ('active','inactive')))`, `created_at`, `updated_at`.
- `house_mission_groups`: `id (UUID PK)`, `code (TEXT UNIQUE NOT NULL)`, `body_id (UUID FK -> bodies.id NOT NULL)`, `name (TEXT NOT NULL)`, `meeting_day (SMALLINT CHECK (meeting_day BETWEEN 0 AND 6))`, `meeting_time_local (TIME)`, `address (TEXT)`, `latitude (NUMERIC(9,6))`, `longitude (NUMERIC(9,6))`, `location_notes (TEXT)`, `photo_urls (JSONB NOT NULL DEFAULT '[]')`, `started_on (DATE NOT NULL)`, `status (TEXT NOT NULL CHECK (status IN ('active','paused','inactive')))`, `created_at`, `updated_at`.
- `group_body_transfers`: `id (UUID PK)`, `group_id (FK -> house_mission_groups.id NOT NULL)`, `from_body_id (FK -> bodies.id NOT NULL)`, `to_body_id (FK -> bodies.id NOT NULL)`, `effective_on (DATE NOT NULL)`, `reason (TEXT NOT NULL)`, `transferred_by_user_id (FK -> users.id NOT NULL)`, `created_at`.

#### `assignments`
- `id (UUID PK)`, `member_id (FK -> members.id NOT NULL)`, `scope_type (TEXT NOT NULL CHECK (scope_type IN ('body','group')))`, `body_id (FK -> bodies.id)`, `group_id (FK -> house_mission_groups.id)`, `responsibility (TEXT NOT NULL CHECK (responsibility IN ('body_leader','care_leader','coordinator','group_leader')))`, `is_primary (BOOLEAN NOT NULL DEFAULT false)`, `effective_from (DATE NOT NULL)`, `effective_to (DATE)`, `ended_reason (TEXT)`, `created_by_user_id (FK -> users.id NOT NULL)`, `created_at`.
- **Checks & Partial Unique Indexes:**
  - Scope/responsibility consistency check; `effective_to IS NULL OR effective_to >= effective_from`.
  - One active `is_primary = true` supervisor per group.
  - No duplicate active identical `(member_id, body_id/group_id, responsibility)` where `effective_to IS NULL`.

---

### 3.3 People & Pastoral Care

- `members`: `id (UUID PK)`, `full_name (TEXT NOT NULL)`, `nickname (TEXT)`, `phone_e164 (TEXT)`, `email (TEXT)`, `photo_url (TEXT)`, `address (TEXT)`, `joined_church_on (DATE)`, `status (TEXT NOT NULL CHECK (status IN ('active','archived')))`, `created_at`, `updated_at`.
- `group_memberships`: `id (UUID PK)`, `group_id`, `member_id`, `joined_on (DATE NOT NULL)`, `left_on (DATE)`, `UNIQUE (group_id, member_id) WHERE left_on IS NULL`.
- `visitors`: `id (UUID PK)`, `full_name (TEXT NOT NULL)`, `nickname (TEXT)`, `phone_e164 (TEXT)`, `first_visit_date (DATE NOT NULL)`, `origin_group_id`, `welcomer_member_id`, `followup_owner_user_id`, `followup_status`, `consent_for_contact (BOOLEAN NOT NULL DEFAULT false)`, `converted_member_id`, `created_at`, `updated_at`.
  - **PDPA Check Constraint (`DEC-10`):** `CHECK (phone_e164 IS NULL OR consent_for_contact = true)`.
- `visitor_visits`: `id (UUID PK)`, `visitor_id`, `weekly_report_id`, `group_id`, `visit_date`, `is_first_visit`, `UNIQUE (visitor_id, weekly_report_id)`.
- `follow_up_items`: `id (UUID PK)`, `source_type`, `source_dedup_key`, `group_id`, `member_id`, `visitor_id`, `title`, `description`, `owner_user_id`, `priority`, `due_on`, `status`, `outcome_note`, `completed_by_user_id`, `completed_at`, `created_by_user_id`, `created_at`, `updated_at`.
  - **Partial Unique Index:** `UNIQUE (source_dedup_key) WHERE source_dedup_key IS NOT NULL AND status IN ('open','in_progress')`.

---

### 3.4 Weekly Mission Reporting

- `reporting_periods`: `id (UUID PK)`, `period_code (TEXT UNIQUE NOT NULL)`, `start_date (DATE NOT NULL)`, `end_date (DATE NOT NULL)`, `opens_at (TIMESTAMPTZ NOT NULL)`, `deadline_at (TIMESTAMPTZ NOT NULL)`, `brief_scheduled_at (TIMESTAMPTZ NOT NULL)`, `status (TEXT NOT NULL CHECK (status IN ('scheduled','open','closed')))`.
- `weekly_reports`:
  - Identity: `id (UUID PK)`, `reporting_period_id`, `group_id`, `body_id_snapshot`, `UNIQUE (reporting_period_id, group_id)`.
  - Workflow: `status (TEXT NOT NULL CHECK (status IN ('draft','submitted','under_review','needs_revision','approved')))`, `requires_supervisor_review (BOOLEAN NOT NULL DEFAULT false)`, `supervisor_reviewed_by_user_id (FK -> users.id)`, `supervisor_reviewed_at (TIMESTAMPTZ)`.
  - Block (`CD-07`, `DEC-05`): `is_blocked (BOOLEAN NOT NULL DEFAULT false)`, `blocked_reason (TEXT CHECK (blocked_reason IS NULL OR blocked_reason IN ('no_usable_body_leader','self_approval_forbidden_no_co_body_leader')))`, `blocked_at`, `unblocked_at`.
  - Content & Timing: `meeting_held`, `not_held_reason`, `meeting_date`, `location_text`, `leader_member_id`, `teaching_topic`, `scripture_ref`, `activities_json`, `atmosphere_notes`, `followup_needs_text`, `next_week_plan`, `support_needed_text`, `photo_urls`, `author_user_id`, `submitted_by_user_id`, `first_submitted_at`, `last_submitted_at`, `is_late`, `revision_reason`, `approved_by_user_id`, `approved_at`, `version (INTEGER NOT NULL DEFAULT 1)`.
  - **DB Integrity Checks:**
    - `status = 'approved' IMPLIES (approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND is_blocked = false)`
    - **No Self-Approval Check (`DEC-05`):** `approved_by_user_id IS NULL OR approved_by_user_id <> submitted_by_user_id`
    - **Sequential Review Check (`DEC-04`):** `status <> 'approved' OR requires_supervisor_review = false OR supervisor_reviewed_at IS NOT NULL`
    - `status = 'needs_revision' IMPLIES (revision_reason IS NOT NULL AND length(trim(revision_reason)) > 0)`
- `attendance_records`: `id (UUID PK)`, `weekly_report_id`, `reporting_period_id`, `group_id`, `member_id`, `attendance_status`, `restricted_absence_note`, `recorded_by_user_id`, `updated_at`, `UNIQUE (reporting_period_id, group_id, member_id)`.
- `report_audit_events` & `security_audit_logs`: Append-only audit tables (`INSERT`/`SELECT` only for app DB role).

---

### 3.5 Snapshots, Briefings & Notifications (`DEC-07`, `DEC-08`)

- `period_group_snapshots`: `id (UUID PK)`, `reporting_period_id`, `group_id`, `body_id`, `expected_to_report (BOOLEAN NOT NULL)`, `captured_at`, `UNIQUE (reporting_period_id, group_id)`.
- `meeting_briefs`: `id (UUID PK)`, `reporting_period_id (UNIQUE NOT NULL)`, `generated_at`, `sections_json (JSONB NOT NULL)`, `metrics_snapshot_json (JSONB NOT NULL)`.
- `notifications`: `id (UUID PK)`, `recipient_user_id`, `category`, `title`, `body`, `link_path`, `related_entity_type`, `related_entity_id`, `read_at`, `created_at`.
- `line_dispatches`: `id (UUID PK)`, `notification_id (FK -> notifications.id)`, `recipient_user_id`, `line_user_id`, `status (queued | sent | failed)`, `provider_response`, `sent_at`, `created_at`. *(Zero Web Push subscription tables.)*
- `idempotency_keys`: `id (UUID PK)`, `actor_user_id`, `key`, `route`, `response_status`, `response_body`, `expires_at`, `UNIQUE (actor_user_id, key, route)`.
