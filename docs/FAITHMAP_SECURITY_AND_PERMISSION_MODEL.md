# FaithMap — Security and Permission Model

**Document ID:** `FM-06` · **Version:** `2.0` · **Date:** `2026-11-14` · **Status:** `Approved Baseline (GATE-1)`  
**Product:** **FaithMap** (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`)

---

## 1. Clean-Slate Security Posture

FaithMap introduces a completely new authentication, session, and scoped authorization architecture. It reuses **zero** Puntakit auth code, PIN hashing schemes, cookie names, or flat role assumptions.

Core principles:
1. **Default Deny:** Every `/api/v1/*` route (except `/api/health/*` and auth login endpoints) requires a valid session and passes explicit authorization policy checks.
2. **Server-Side Scope & PII Enforcement:** Clients hide restricted controls for UX clarity, while Next.js Route Handlers enforce scope, workflow order (`DEC-04`), non-self-approval (`DEC-05`), and PII masking (`DEC-06`) on every request.
3. **Zero Trust for External Inputs:** Client-supplied LINE user IDs, cron headers, or role claims are never trusted without server-side cryptographic verification.

---

## 2. Authentication & Session Design (`DEC-03`)

- **Primary Sign-In (Group Leaders & Mobile Users):** **LINE Login (OIDC / LIFF)** verified server-side against LINE (`https://api.line.me/oauth2/v2.1/verify` / OAuth2 token exchange with `state` + `nonce` PKCE).
- **Fallback Sign-In (Desktop Admins, Supervisors, Non-LINE Users):** Email/Phone + **Argon2id Password** and/or **WebAuthn Passkey** (`user_passkeys`). No legacy Puntakit PIN auth is inherited.
- **Session Mechanics:**
  - Server-side opaque session token (256-bit CSPRNG, stored as SHA-256 hash in `auth_sessions`).
  - `HttpOnly`, `Secure`, `SameSite=Lax` cookie (`__Host-faithmap_session`).
  - CSRF header (`X-FaithMap-CSRF`) required on all state-changing requests.
  - Sliding idle expiry (`7 days`) + absolute lifetime (`30 days`) + immediate revocation on logout, role change, or suspension.
- **Scheduled Job Protection:** `/api/internal/jobs/*` endpoints require valid `Authorization: Bearer <CRON_SECRET>` or verified Upstash QStash cryptographic signature.
- **Account Linking:** Linking a LINE identity (`POST /api/v1/me/line/link`) requires an active authenticated session plus explicit user confirmation.

---

## 3. Authorization Model: System Role + Active Assignment Scope

### 3.1 System Roles (`users.system_role`)
| Role | Global Capabilities |
|---|---|
| `super_admin` | Technical governance, admin management, security audit logs, system settings. Cannot approve reports (`CD-02`). |
| `admin` | User accounts, Bodies, Groups, all Assignments (`body_leader` + group), Blocked intervention alerts. Cannot approve reports (`CD-02`). |
| `mission_leader` | Read-only organization-wide overview, Sunday `20:30` Meeting Briefs, non-PII analytics (`CD-06`, `DEC-06`). Cannot approve reports unless also holding an eligible `body_leader` assignment. |
| `standard_user` | Zero global access. Permissions derive strictly from active `assignments`. |

### 3.2 Scoped Responsibilities (`assignments`)
- `body_leader` (Body scope): Operational & final approval authority for all groups in their assigned `body_id` (`CD-02`), plus creating/ending group-level assignments inside their own `body_id` (`DEC-09`).
- `care_leader` / `coordinator` (Group scope): Supervises assigned `group_id`(s); performs sequential review (`DEC-04`), requests revisions, manages follow-ups.
- `group_leader` (Group scope): Writes autosaved drafts, marks attendance, logs PDPA-consented visitors, submits/resubmits reports for assigned `group_id`(s).

---

## 4. Permission Matrix

| Capability / Resource | `group_leader` (own group) | `care_leader` / `coordinator` (assigned group) | `body_leader` (own Body) | `mission_leader` (all Bodies) | `admin` / `super_admin` |
|---|---|---|---|---|---|
| View Body / Group directory | Own group(s) | Assigned group(s) | Own Body | All | All |
| Create/Edit Group or transfer Body | No | No | No | No | Yes |
| Manage `group_leader` / `care_leader` / `coordinator` assignments | No | No | **Yes (own Body only `DEC-09`)** | No | Yes |
| Manage `body_leader` assignments | No | No | No | No | Yes |
| View restricted PII (phone, address, absence note `DEC-06`) | **Own group** | **Assigned groups** | **Own Body** | **No (Masked)** | **Yes** |
| View restricted report text (`care_needs_notes`, `prayer_requests`, `DEC-15`) | **Own group** | **Assigned groups** | **Own Body** | **No** | **Yes** |
| Meeting Brief prayer data (`DEC-16`) | — | — | Count only | Count only | Count only |
| View Team Field Points: names and phones (`DEC-17`) | No (until linked) | Only the point assigned to them (when linked) | Same Body only (when linked) | **No** | **Yes** |
| View/Edit `draft` report | **Yes** | **No** (`not_submitted`) | **No** (`not_submitted`) | **No** (`not_submitted`) | **No** |
| Submit / Resubmit report | **Yes** | No (unless also leader) | No | No | No |
| Review / Request Revision | No | **Yes** (assigned groups) | **Yes** (fallback `CD-03` or after Supervisor `DEC-04`) | No | No |
| **Final Approve report** | **No** | **No** | **Yes — only after Supervisor review (`DEC-04`) AND never self-submitted (`DEC-05`)** | **No (`CD-06`)** | **No** |
| View Blocked alerts | No | No | Own Body status | Overview count | **Yes (Actionable alert)** |
| Read Sunday `20:30` Meeting Brief | No | No | Own Body slice | **Yes (Full, non-PII)** | Yes |
| Read Security Audit Logs | No | No | No | No | Yes |

---

## 5. Privacy, PDPA & Data Protection Controls

1. **Draft Privacy Isolation (`CD-01`):** Queries for Supervisors, Body Leaders, Mission Leadership, and Admins never expose `draft` report contents.
2. **PII Projection Masking (`DEC-06`):** DTO serializers strip `phone_e164`, `address`, and `restricted_absence_note` whenever the caller lacks direct group stewardship, owning Body Leader scope, or Admin role.
3. **Visitor Consent Gate (`DEC-10`):** API and PostgreSQL `CHECK` constraint reject storing `visitors.phone_e164` unless `consent_for_contact === true`.
4. **No Web Push Attack Surface (`DEC-07`):** Because Web Push is excluded, FaithMap stores zero browser push endpoints/URLs (eliminating push endpoint SSRF vectors).
5. **Input & Output Hardening:** Zod validation, Drizzle parameterized queries, CSP, HSTS, `X-Content-Type-Options: nosniff`, sanitized Thai error responses.

---

## 6. Immutable Audit Logging

- Application DB role has `INSERT` + `SELECT` only on `security_audit_logs` and `report_audit_events`.
- Audited actions include: LINE/Password/Passkey login events, assignment changes (including `body_leader` actions under `DEC-09`), Body transfers, report submissions/reviews/revisions/approvals, Blocked triggers, and scoped exports.
