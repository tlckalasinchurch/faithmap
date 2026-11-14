# FaithMap — Phased Implementation Plan

**Document ID:** `FM-11` · **Version:** `2.0` · **Date:** `2026-11-14` · **Status:** `GATE-0 & GATE-1 Approved — Pending GATE-2 (UX/UI Prototype)`  
**Product:** **FaithMap** (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`)

---

## 1. Execution Governance Rules

1. **Strict Gate Progression:** Every phase requires explicit verification evidence and **Owner Approval** before advancing.
2. **Current Gate Status (2026-11-14):**
   - `GATE-0` (Product Foundation): **Approved** (all `DEC-01`–`DEC-10` business rules locked).
   - `GATE-1` (New Architecture): **Approved** (`DEC-11` Next.js App Router on Vercel + Neon PostgreSQL + Drizzle ORM + Cron/QStash locked).
   - `GATE-2` (UX/UI Design & Prototype): **Next Active Gate** before creating the `faithmap` repository and starting Phase 3 code implementation.
3. **Puntakit Repository Boundary:** Zero edits to Puntakit; Phase 3 starts strictly in a brand-new `faithmap` repository (`DEC-12`).

---

## 2. Phase-by-Phase Master Plan (Phases 0–7)

### Phase 0 — Product Foundation *(Completed & Approved `GATE-0`)*
- **Objectives:** Establish FaithMap vision, PRD, canonical metrics, confirmed rules (`CD-01`–`CD-10`), and resolve business decisions (`DEC-01`–`DEC-10`).
- **Scope:** Product foundation documents with zero Puntakit technical inheritance.
- **Deliverables:** `FAITHMAP_PRODUCT_VISION.md`, `FAITHMAP_PRD.md`, `FAITHMAP_DECISION_REGISTER.md`.
- **Dependencies:** Owner selection of Option C (Clean Slate).
- **Risks:** Scope creep if non-goals (finance, chat, web push) are added mid-build.
- **Acceptance Criteria:** All confirmed rules & `DEC-01`–`DEC-10` recorded consistently; zero ambiguous metric definitions.
- **Verification Method:** Cross-document consistency check + Owner review.
- **Approval Gate (`GATE-0`):** **Approved by Owner (2026-11-14).**

---

### Phase 1 — New Architecture *(Completed & Approved `GATE-1`)*
- **Objectives:** Design FaithMap's domain model, Next.js + Neon PostgreSQL + Drizzle architecture, security/permission matrix, REST API v1 contracts, and DR strategy.
- **Scope:** Bounded contexts, PostgreSQL schema with `CHECK`/partial-unique constraints, LINE Login + Passkey/Password auth model, PII/PDPA controls, Vercel + Neon deployment plan.
- **Deliverables:** `FAITHMAP_DOMAIN_MODEL.md`, `FAITHMAP_SYSTEM_ARCHITECTURE.md`, `FAITHMAP_DATABASE_DESIGN.md`, `FAITHMAP_SECURITY_AND_PERMISSION_MODEL.md`, `FAITHMAP_API_CONTRACTS.md`, `FAITHMAP_DEPLOYMENT_AND_OPERATIONS.md`.
- **Dependencies:** `GATE-0` approved; `DEC-11`, `DEC-12`, `DEC-14` resolved.
- **Risks:** Serverless cron timeout if Sunday Meeting Brief generation is unoptimized; PII leakage across roles (`DEC-06`).
- **Acceptance Criteria:** Sequential review (`DEC-04`), non-self-approval (`DEC-05`), `PeriodGroupSnapshot` (`DEC-08`), and PDPA visitor consent (`DEC-10`) enforced at domain & DB layers.
- **Verification Method:** Architecture & security consistency review against `FM-02`.
- **Approval Gate (`GATE-1`):** **Approved by Owner (2026-11-14).**

---

### Phase 2 — UX/UI Design *(Next Active Phase)*
- **Objectives:** Finalize FaithMap's new design system (`DEC-13`), accessible Thai-first tokens, mobile 3-step Group Leader flow, and desktop leadership/review screens.
- **Scope:** `FAITHMAP_UX_UI_SPECIFICATION.md` + interactive clickable UI prototype (using FaithMap typographic wordmark & placeholder icons until final SVG assets arrive).
- **Deliverables:** Finalized UX/UI specification + clickable prototype covering Mobile 3-Step Report, LINE Login entry, Sequential Review, Blocked Banner, and Mission Overview.
- **Dependencies:** `GATE-1` approved; `DEC-13` strategy confirmed.
- **Risks:** Mobile cognitive friction for elderly Group Leaders; confusion between autosaved `draft` and submitted report.
- **Acceptance Criteria:** Touch targets `>= 48px`; `<= 3` steps to submit; WCAG 2.1 AA contrast; clear Thai autosave/not-submitted indicators; zero legacy branding.
- **Verification Method:** Accessibility contrast audit + walkthrough with representative elderly Group Leaders / Body Leaders.
- **Approval Gate (`GATE-2`):** **Owner explicitly approves UX/UI prototype before Phase 3 coding begins.**

---

### Phase 3 — Platform Foundation
- **Objectives:** Create the brand-new `faithmap` Git repository, Next.js App Router skeleton, Neon PostgreSQL database, LINE Login OIDC + Password/Passkey fallback auth, default-deny RBAC, audit logging, and CI/CD.
- **Scope:** New `faithmap` repo (`DEC-12`); Vercel + Neon setup (`DEC-11`); Drizzle migrations for `users`, `auth_sessions`, `external_identities`, `user_passkeys`, `organization_settings`, `security_audit_logs`; LINE Login OIDC (`DEC-03`); CSRF + rate limiting; CI test harness (`FAITHMAP_TEST_STRATEGY.md`).
- **Deliverables:** Running Staging skeleton with LINE Login + fallback auth, append-only audit log, and green CI pipeline.
- **Dependencies:** `GATE-2` approved; GitHub/Vercel/Neon/LINE Login Channel credentials provisioned.
- **Risks:** LINE OIDC callback misconfiguration across preview/staging URLs.
- **Acceptance Criteria:** Empty Neon DB initializes via Drizzle; LINE Login + fallback auth + CSRF + audit tests pass 100%; zero Puntakit dependencies.
- **Verification Method:** Automated CI run + Staging auth & security header verification.
- **Approval Gate (`GATE-3`):** Owner verifies live Staging authentication & foundation demo.

---

### Phase 4 — Organization and People
- **Objectives:** Implement Bodies, House Mission Groups, Body Transfers, Assignments (including Body Leader body-scoped management `DEC-09`), Members, PDPA-consented Visitors (`DEC-10`), and Follow-Ups.
- **Scope:** Domain modules & UI for directory, map picker, assignment history, member roster (`joined_on`/`left_on`), visitor consent gate, manual follow-ups, and `DEC-06` PII masking.
- **Deliverables:** Working Directory, Assignment Manager, Member/Visitor/Follow-Up pages & APIs in Staging.
- **Dependencies:** `GATE-3` approved.
- **Risks:** Unintended cross-Body assignment edits; PII exposure to `mission_leader` (`DEC-06`).
- **Acceptance Criteria:** Body Leaders can manage group assignments only in own Body (`403` across Bodies); visitor phone blocked without consent; PII masked for `mission_leader`.
- **Verification Method:** PostgreSQL integration & AuthZ matrix tests + Staging role-by-role UAT.
- **Approval Gate (`GATE-4`):** Owner validates directory, assignments, and people workflows in Staging.

---

### Phase 5 — Mission Operations
- **Objectives:** Implement Monday–Sunday Reporting Periods (`DEC-02`), `PeriodGroupSnapshot` (`DEC-08`), Attendance, Draft Autosave (`CD-01`), Submission (`Sunday 20:00 ICT`, `DEC-01`), Sequential Supervisor Review (`DEC-04`), Non-Self Body Leader Approval (`DEC-05`), Blocked Workflow (`CD-07`), and Consecutive-Absence/Visitor Follow-Up detection.
- **Scope:** Full 3-step mobile reporting UI with IndexedDB offline buffer; review/revision/approval queues; In-App Notification Inbox (`DEC-07`); signed Cron/QStash jobs; audit events.
- **Deliverables:** End-to-end Sunday reporting lifecycle operational in Staging.
- **Dependencies:** `GATE-4` approved.
- **Risks:** `Asia/Bangkok` boundary bugs; draft visibility leaks; edge-case deadlocks if sole Body Leader submits (`DEC-05`).
- **Acceptance Criteria:** `draft` hidden from supervisors/leaders; autosave never submits; sequential review & non-self-approval enforced at API & DB layers; Blocked triggers & clears cleanly; `100%` pass on concurrency/idempotency tests.
- **Verification Method:** Vitest state-machine & timezone suite + Playwright mobile 3-step E2E + Staging walkthrough of Held, Not Held, Revision, Fallback, and Blocked cases.
- **Approval Gate (`GATE-5`):** Owner verifies complete Sunday reporting workflow in Staging.

---

### Phase 6 — Management and Integration
- **Objectives:** Implement Mission Leadership Dashboard, Analytics, Immutable Sunday `20:30` ICT Meeting Brief (`DEC-01`), Scoped Exports, LINE LIFF mini-app, and LINE OA Messaging reminders (`DEC-07`).
- **Scope:** Role-scoped overview & drill-down, 10-section `meeting_briefs` snapshot job, CSV/XLSX/PDF exports (with `DEC-06` PII masking), LIFF Group Leader reporting entry, and LINE Messaging reminders/alerts.
- **Deliverables:** Leadership Overview, Meeting Brief viewer/exporter, LIFF flow, and LINE OA reminder dispatch in Staging.
- **Dependencies:** `GATE-5` approved; LINE OA & LIFF channel credentials provisioned.
- **Risks:** Metric mismatch between dashboard & stored brief; LINE Messaging rate limits.
- **Acceptance Criteria:** Dashboard & Meeting Brief numbers match `FM-02 §4` definitions; stored brief stays immutable after late submissions; LIFF verifies server-side OIDC token; exports write audit logs.
- **Verification Method:** Metric-parity tests + LINE sandbox end-to-end verification + export PII audit.
- **Approval Gate (`GATE-6`):** Owner approves dashboards, Sunday Meeting Brief, and LINE OA / LIFF behavior.

---

### Phase 7 — Quality and Production Launch
- **Objectives:** Complete full QA, security, accessibility, k6 load, and Neon PITR DR restore drills; swap in final FaithMap SVG brand assets (`DEC-13`); bootstrap empty Production DB; execute **100% clean-slate cutover** (`DEC-14`) and retire Puntakit.
- **Scope:** Full test pyramid (`FM-09`), Axe WCAG 2.1 AA audit, Staging DR drill, production domain TLS setup (`DEC-12`), clean onboarding of Bodies/Groups/Users, dry-run UAT, 100% FaithMap cutover + Puntakit archival, 2-Sunday hypercare.
- **Deliverables:** Signed QA & Security Report, Verified DR Drill Log, Live FaithMap Production Site, Archived Puntakit Confirmation.
- **Dependencies:** `GATE-6` approved; final SVG logo files (`DEC-13`) & domain DNS (`DEC-12`).
- **Risks:** Elderly login onboarding friction on launch Sunday if LINE accounts aren't pre-linked during UAT.
- **Acceptance Criteria:** `100%` CI & E2E green; `0` critical/serious accessibility or security findings; DR drill meets `RPO <= 15m` / `RTO <= 2h`; zero Puntakit data imported; clean onboarding verified.
- **Verification Method:** Executed test reports + DR sign-off + Staging UAT dry-run sign-off.
- **Approval Gate (`GATE-7`):** **Final Owner Production Launch & Legacy Puntakit Retirement Sign-Off.**
