# FaithMap — API Contracts

**Document ID:** `FM-08` · **Version:** `2.0` · **Date:** `2026-11-14` · **Status:** `Approved Baseline (GATE-1)`  
**Product:** **FaithMap** (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`)

---

## 1. API Design Conventions

- **Runtime:** Next.js App Router Route Handlers (`/api/v1/*`) + `/api/internal/jobs/*` (Cron/QStash).
- **Schema Validation:** Shared Zod schemas generating OpenAPI 3.1 documentation.
- **Authentication & CSRF:** `__Host-faithmap_session` cookie + `X-FaithMap-CSRF` header on mutations.
- **Timezone:** `DateTime` fields serialize as ISO-8601 UTC (`...Z`); `Date` fields (`YYYY-MM-DD`) represent `Asia/Bangkok` calendar dates (`Monday–Sunday` weeks, `Sunday 20:00 ICT` deadline).
- **Concurrency & Idempotency:** Draft updates require `expectedVersion` (`409 CONFLICT` on mismatch); workflow transitions (`submit`, `resubmit`, `pass`, `request-revision`, `approve`) require `Idempotency-Key`.

---

## 2. Endpoint Surface by Bounded Context

### 2.1 Auth & Profile (`/api/v1/auth`, `/api/v1/me`)
| Method & Path | Purpose | Auth / Notes |
|---|---|---|
| `GET /api/v1/auth/line/start` | Initiate LINE Login OAuth2 + PKCE (`DEC-03`) | Public; sets state/nonce cookie |
| `GET /api/v1/auth/line/callback` | Exchange LINE code, verify `id_token`, create session | Public; links only pre-registered/confirmed users |
| `POST /api/v1/auth/login` | Fallback email/phone + Argon2id password login | Rate-limited |
| `POST /api/v1/auth/passkey/options` & `/verify` | WebAuthn Passkey sign-in fallback | Rate-limited |
| `POST /api/v1/auth/logout` | Revoke active session | Authenticated |
| `GET /api/v1/me` | Current user, role, active assignments, usable status | Authenticated |
| `POST /api/v1/me/line/link` | Explicit LINE identity linking under active session | Authenticated + explicit confirm |

### 2.2 Organization, Groups & Assignments
| Method & Path | Purpose | Scope Rule |
|---|---|---|
| `GET /api/v1/bodies` / `POST /api/v1/bodies` | List Bodies (scoped) / Create Body | `admin` / `super_admin` for write |
| `GET /api/v1/groups` / `POST /api/v1/groups` / `PATCH /api/v1/groups/:id` | Directory, details, coordinates, schedule | `admin` / `super_admin` for write |
| `POST /api/v1/groups/:groupId/transfer-body` | Transfer group to new Body with `effectiveOn` + `reason` | `admin` / `super_admin` |
| `GET /api/v1/assignments` | List active/historical assignments | Scoped |
| `POST /api/v1/assignments` | Create assignment (triggers Blocked/Unblock evaluation) | `admin` (all); `body_leader` (`group_leader`, `care_leader`, `coordinator` in own Body only `DEC-09`) |
| `POST /api/v1/assignments/:id/end` | End assignment with `effectiveTo` + `endedReason` | `admin` (all); `body_leader` (group-scoped in own Body `DEC-09`) |

### 2.3 People, Visitors & Follow-Ups
| Method & Path | Purpose | Scope & Privacy Rule |
|---|---|---|
| `GET /api/v1/groups/:groupId/roster` | Prefilled active member roster | Scoped; masks PII if excluded by `DEC-06` |
| `POST /api/v1/members` | Register new member | Scoped (`admin` / authorized leader) |
| `POST /api/v1/groups/:groupId/memberships` & `.../leave` | Manage group roster with `joinedOn` / `leftOn` | Scoped |
| `GET /api/v1/visitors` / `POST /api/v1/visitors` | List / register visitor | **Returns `400 VISITOR_CONSENT_REQUIRED` if phone provided without `consentForContact: true` (`DEC-10`)** |
| `PATCH /api/v1/visitors/:visitorId` | Update visitor follow-up status | Scoped |
| `GET /api/v1/follow-ups` / `POST /api/v1/follow-ups` / `PATCH /api/v1/follow-ups/:id` | List, create, update, or record outcome + complete | Scoped |

### 2.4 Weekly Reporting & Attendance
| Method & Path | Purpose | Key Contract Rules |
|---|---|---|
| `GET /api/v1/periods/current` | Current Monday–Sunday period (`Sun 20:00` deadline) + task summary | Authenticated |
| `GET /api/v1/periods/:periodId/groups/:groupId/report` | Get report for group + period | **Returns `not_submitted` projection if `status='draft'` and caller is not Group Leader** |
| `PUT /api/v1/periods/:periodId/groups/:groupId/draft` | Create/autosave `draft` (or edit `needs_revision`) + attendance rows | `group_leader` only; **never submits (`CD-01`)**; checks `expectedVersion` |
| `POST /api/v1/reports/:reportId/submit` | Explicit first submission (`Idempotency-Key`) | `group_leader` only; sets `first_submitted_at` & `is_late`; sets `requires_supervisor_review`; checks Blocked |
| `POST /api/v1/reports/:reportId/resubmit` | Explicit resubmit from `needs_revision` (`Idempotency-Key`) | `group_leader` only; updates `last_submitted_at`; preserves `first_submitted_at` & `is_late` |
| `POST /api/v1/reports/:reportId/review/start` | Mark `under_review` | Assigned Supervisor or fallback Body Leader |
| `POST /api/v1/reports/:reportId/review/pass` | Supervisor passes review (`supervisor_reviewed_at` set); re-evaluates Blocked (`CD-07`, `DEC-05`) | Assigned Supervisor |
| `POST /api/v1/reports/:reportId/request-revision` | Transition to `needs_revision` with mandatory `reason` | Assigned Supervisor or Body Leader |
| `POST /api/v1/reports/:reportId/approve` | Final approval (`status -> approved`) | **Only eligible `body_leader` of `body_id_snapshot`. Rejects `409 WORKFLOW_SUPERVISOR_REVIEW_REQUIRED` (`DEC-04`), `403 SELF_APPROVAL_FORBIDDEN` (`DEC-05`), `409 REPORT_WORKFLOW_BLOCKED` (`CD-07`)** |
| `GET /api/v1/reports/blocked` | List currently Blocked reports + `blocked_reason` | `admin` / `super_admin` / scoped `body_leader` |

### 2.5 Insights, Briefings, Notifications & Exports
| Method & Path | Purpose | Scope Rule |
|---|---|---|
| `GET /api/v1/dashboard/overview` | Canonical metrics computed from `PeriodGroupSnapshot` (`DEC-08`) | `mission_leader` / `admin` (all); `body_leader` (own Body) |
| `GET /api/v1/periods/:periodId/brief` | Fetch immutable Sunday `20:30` ICT 10-section Meeting Brief | `mission_leader` / `admin` (own Body slice for `body_leader`) |
| `GET /api/v1/notifications` / `POST /api/v1/notifications/:id/read` | In-app notification inbox & read receipt (`DEC-07`) | Recipient only |
| `POST /api/v1/exports` | Scoped CSV/XLSX/PDF export (omits masked PII per `DEC-06`) | Audited to `security_audit_logs` |
| `POST /api/internal/jobs/*` | Signed Cron/QStash endpoints (`open-period`, `send-reminders`, `generate-brief`, `detect-followups`) | `CRON_SECRET` / QStash signature required |
