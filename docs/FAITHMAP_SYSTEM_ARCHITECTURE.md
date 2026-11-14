# FaithMap — System Architecture

**Document ID:** `FM-04` · **Version:** `2.0` · **Date:** `2026-11-14` · **Status:** `Approved Baseline (GATE-1)`  
**Product:** **FaithMap** (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`)

---

## 1. Architectural Principles

1. **100% Greenfield Clean Slate:** Zero shared libraries, schemas, build scripts, auth providers, or deployment pipelines from Puntakit.
2. **Modular Monolith on Next.js App Router:** Clean server-side domain modules (`src/server/modules/*`) invoked by Route Handlers (`/api/v1/*`) and Server Components—maintaining strict bounded-context isolation inside one cohesive TypeScript codebase.
3. **Database-Enforced Integrity:** Business invariants (uniqueness, sequential review flags, non-self-approval checks, PDPA consent, optimistic locking) are enforced at both domain service and Neon PostgreSQL constraint layers.
4. **Offline-Resilient Mobile First:** Draft autosave pairs local IndexedDB persistence with idempotent `/api/v1/.../draft` endpoints so spotty 3G/4G connections never lose a Group Leader's work.
5. **Asia/Bangkok Canonical Time (`DEC-01`, `DEC-02`):** Reporting weeks run **Monday–Sunday**; deadline is **Sunday `20:00` ICT**; Meeting Brief generates **Sunday `20:30` ICT**.

---

## 2. Confirmed Technology Stack (`DEC-11`)

| Layer | Confirmed Choice | Architectural Rationale |
|---|---|---|
| **Full-Stack Framework** | **Next.js (App Router, TypeScript 5.x)** | Unified full-stack React UI, PWA shell, LIFF pages, and `/api/v1/*` Route Handlers with end-to-end TypeScript + Zod validation. |
| **Hosting Runtime** | **Vercel** | Zero-ops global edge/serverless delivery, preview deployments per PR, seamless Next.js App Router integration. |
| **Database** | **Neon PostgreSQL 16+** | Serverless/pooled PostgreSQL with branching for isolated preview/staging tests, `TIMESTAMPTZ`, partial unique indexes, and PITR. |
| **ORM / Migrations** | **Drizzle ORM (`drizzle-kit`)** | Lightweight SQL-first TypeScript ORM ideal for serverless cold starts (zero Rust engine overhead) and deterministic SQL migrations. |
| **Background Jobs & Scheduler** | **Vercel Cron + Upstash QStash (or isolated worker)** | Signed HTTP job triggers (`/api/internal/jobs/*`) for Sunday `20:30` ICT Meeting Brief, period open snapshots, reminders, and retryable LINE OA dispatches—avoiding serverless timeout failures. |
| **Authentication (`DEC-03`)** | **LINE Login OIDC (Primary) + Argon2id Password & WebAuthn Passkeys (Fallback)** | Frictionless one-tap entry for elderly LINE users, paired with secure password/passkey fallback for desktop admins and non-LINE users. |
| **Notifications (`DEC-07`)** | **In-App Inbox + LINE Messaging API (OA)** | Reliable delivery without fragile browser Web Push / VAPID permissions. |
| **Object Storage** | **S3-compatible Storage (Cloudflare R2 / Vercel Blob / S3)** | Pre-signed uploads for meeting photos and stored exports without bloating Neon PostgreSQL. |

---

## 3. High-Level System Architecture

```text
+-------------------------------------------------------------------------+
|                           CLIENTS (TLS 1.3)                             |
|  +---------------------------+     +---------------------------------+  |
|  | FaithMap Web / PWA        |     | LINE LIFF Mini-App              |  |
|  | (Next.js Client + IDB     |     | (Group Leader Mobile Reporting) |  |
|  |  Offline Draft Buffer)    |     |                                 |  |
|  +-------------+-------------+     +----------------+----------------+  |
+----------------|------------------------------------|-------------------+
                 | HTTPS (Session Cookie + CSRF)      |
                 v                                    v
+-------------------------------------------------------------------------+
|                NEXT.JS APP ROUTER ON VERCEL (`faithmap`)                |
|  +-------------------+  +-------------------+  +---------------------+  |
|  | Auth & Session    |  | Scope & Policy    |  | Zod Schema          |  |
|  | Guard             |  | Guard (PII/Scope) |  | Validation          |  |
|  +---------+---------+  +---------+---------+  +----------+----------+  |
|            |                      |                       |             |
|  +---------v----------------------v-----------------------v----------+  |
|  |             Domain Modules (`src/server/modules/*`)               |  |
|  |  [identity] [organization] [pastoral-care] [reporting]            |  |
|  |  [insights] [notifications] [audit]                               |  |
|  +---------+----------------------------------------------+----------+  |
+------------|----------------------------------------------|-------------+
             |                                              |
             v                                              v
+-------------------------+                    +--------------------------+
| Neon PostgreSQL 16+     |                    | External Services        |
| - Domain Tables         |                    | - LINE Login / Messaging |
| - Immutable Audit Logs  |                    | - S3/R2 Object Storage   |
| - Period Snapshots      |                    | - QStash / Vercel Cron   |
+-------------------------+                    +--------------------------+
```

---

## 4. Module Boundaries & Dependency Rules

Inside `src/server/modules/`:
1. `identity`: LINE Login OIDC, Password/Passkey auth, sessions, usable-account evaluation.
2. `organization`: Bodies, House Mission Groups, Body transfers, Assignments (including Body Leader body-scoped assignment checks `DEC-09`).
3. `pastoral-care`: Members, Group Memberships, PDPA-consented Visitors (`DEC-10`), Follow-Up items.
4. `reporting`: Monday–Sunday Reporting Periods, Draft Autosave (`CD-01`), Submission, Sequential Supervisor Review (`DEC-04`), Non-Self Body Leader Approval (`DEC-05`), Blocked Workflow (`CD-07`).
5. `insights`: `PeriodGroupSnapshot` (`DEC-08`), Sunday `20:30` ICT Meeting Brief (`DEC-01`), PII-masked Analytics & Exports (`DEC-06`).
6. `notifications`: In-App Notification Inbox + LINE OA Messaging (`DEC-07`).
7. `audit`: Append-only security and report audit event writer.

---

## 5. Key Architectural Mechanisms

### 5.1 Draft Autosave & Idempotent Submission
- Group Leader edits send `PUT /api/v1/periods/:periodId/groups/:groupId/draft` with `expectedVersion`.
- Offline edits queue safely in IndexedDB and sync automatically on reconnect.
- Explicit `POST /api/v1/reports/:reportId/submit` requires an `Idempotency-Key` header persisted in `idempotency_keys`.

### 5.2 Deterministic Blocked State & Recovery (`CD-07`, `DEC-05`)
- `evaluateBodyApprovalReadiness(bodyId, excludeUserId)` checks whether >= 1 active `body_leader` assignment exists for `bodyId` whose linked user has `isUsableAccount === true` **and** `userId !== report.submitted_by_user_id`.
- If false when Body Leader approval is needed, `is_blocked = true` is persisted with the specific `blocked_reason`, and System Administrators receive an In-App + LINE OA alert.

### 5.3 Scheduled Jobs (`Asia/Bangkok`, Vercel Cron / QStash)
All `/api/internal/jobs/*` endpoints verify `CRON_SECRET` / QStash cryptographic signature and execute idempotently:
1. **Monday `00:05` ICT:** Provision `ReportingPeriod` + capture immutable `PeriodGroupSnapshot` (`DEC-02`, `DEC-08`).
2. **Saturday & Sunday Pre-`20:00` ICT:** Dispatch unsubmitted reminders via In-App + LINE OA (`DEC-07`).
3. **Sunday `20:30` ICT (`DEC-01`):** Generate and persist the immutable 10-section `MeetingBrief` inside a `REPEATABLE READ` transaction.
4. **Monday Post-Close Check:** Detect non-returning first-time visitors and 2+/3+ consecutive absences into deduplicated `FollowUpItem` records.

---

## 6. Observability & Disaster Recovery

- **Structured Logging:** JSON logs (no PII fields such as phone/address) with `request_id` and `user_id`.
- **Health Checks:** `/api/health/live` and `/api/health/ready` (Neon DB ping).
- **Backup & DR:** Neon automated PITR (`RPO <= 15 minutes`) + daily encrypted logical dump (`pg_dump`) archived to secondary object storage (`RTO <= 2 hours`).
