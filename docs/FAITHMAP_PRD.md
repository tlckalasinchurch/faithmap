# FaithMap — Product Requirements Document (PRD)

**Document ID:** `FM-02` · **Version:** `2.0` · **Date:** `2026-11-14` · **Status:** `Approved Baseline (GATE-0)`  
**Product:** **FaithMap** (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`)

---

## 1. Confirmed Business Rules (Locked Baseline)

All requirements in this PRD enforce the owner-confirmed rules below (`CD-01`–`CD-10` and `DEC-01`–`DEC-14`):

| ID | Rule |
|---|---|
| `CD-01` | **Draft uses Autosave.** Autosave persists work in progress and **never** submits a report or changes its status from `draft`. |
| `CD-02` | **Body Leader is the final approver.** Only a user holding an active Body Leader assignment for the group's Body may approve its weekly report. |
| `CD-03` | **Supervisor fallback.** If a group has no usable assigned Supervisor (Care Leader or Coordinator with an active assignment and usable user account), submitted reports route directly to the Body Leader. |
| `CD-04` / `DEC-01` | **Weekly reporting deadline is Sunday `20:00` ICT.** Immutable Meeting Brief generates Sunday **`20:30` ICT**. |
| `CD-05` / `DEC-02` | **Timezone is `Asia/Bangkok` (UTC+7); reporting week is Monday–Sunday.** |
| `CD-06` | **Mission Leadership receives overview** across all Bodies and does **not** automatically replace Body Leader approval. |
| `CD-07` | **Blocked workflow.** If no usable non-conflicting Body Leader exists for a group's Body when final approval is needed, the workflow is marked **Blocked** and System Administrators are notified. |
| `CD-08` | **Never auto-approve a report** under any condition (including missed deadlines or missing leaders). |
| `CD-09` | **Clean Slate (Option C).** Zero legacy code, schema, auth, roles, or production data from Puntakit. |
| `CD-10` | **FaithMap identity only.** English: `FaithMap`; Thai: `ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`. |
| `DEC-04` | **Sequential Supervisor Review.** When a usable Supervisor exists, the Body Leader may approve **only after** Supervisor review passes. |
| `DEC-05` | **No Self-Approval.** A user cannot approve a report they submitted. A co-Body Leader approves; if none exists, the report marks **Blocked** and Admins are notified. |
| `DEC-06` | **PII Isolation.** Phone numbers, addresses, and sensitive absence notes are restricted to direct group stewards, that group's Body Leader, and Admins. |
| `DEC-07` | **Notification Channels.** In-App Notification Inbox + LINE OA Messaging only (no Web Push). |
| `DEC-08` | **Period Snapshot.** Expected-group list is frozen via `PeriodGroupSnapshot` at period open. |
| `DEC-09` | **Body Leader Assignment Scope.** Body Leaders may manage `group_leader`, `care_leader`, and `coordinator` assignments within their own Body. |
| `DEC-10` | **Visitor PDPA Consent.** Explicit consent checkbox required before storing visitor phone/contact details. |

---

## 2. User Personas & Core Journeys

### 2.1 Personas

| Persona | Profile & Constraints | Primary Device | Key Success Metric |
|---|---|---|---|
| **Group Leader (`ผู้รับผิดชอบกลุ่ม`)** | Often elderly, low digital confidence; runs weekly house meeting | Smartphone (LINE Login / LIFF / PWA) | Completes attendance + weekly report in `<= 3` guided steps with zero lost drafts. |
| **Assigned Supervisor (`หัวหน้าแคร์ / ผู้ประสานงาน`)** | Supervises 1–N assigned groups via active assignments | Smartphone or Desktop | Reviews assigned reports before passing to Body Leader (`DEC-04`). |
| **Body Leader (`หัวหน้าบอดี้`)** | Accountable for all groups in one Body; sole final approver | Desktop or Tablet | Manages Body assignments (`DEC-09`), reviews fallback reports, and approves non-self reports (`DEC-05`). |
| **Mission Leadership (`หัวหน้าทีม ศบ.`)** | Senior pastoral/mission team overseeing all Bodies | Desktop | Reads immutable Sunday `20:30` Meeting Brief and cross-Body metrics without PII leakage (`DEC-06`). |
| **System Administrator (`ผู้ดูแลระบบ`)** | Technical/office steward | Desktop | Resolves Blocked states, manages users/`body_leader` assignments, verifies backups & audit logs. |

### 2.2 End-to-End Weekly Journey

1. **Period Open (Monday `00:00` ICT, `DEC-02`):** Reporting period opens (`Monday–Sunday`); immutable `PeriodGroupSnapshot` captures expected active groups (`DEC-08`); Saturday/Sunday reminders dispatch via In-App + LINE OA (`DEC-07`).
2. **Meeting & Drafting:** Group Leader signs in via LINE Login (`DEC-03`), opens prefilled group screen, marks attendance, logs visitors (with PDPA consent `DEC-10`), activity, and notes. Autosave persists draft cleanly across devices without submitting (`CD-01`).
3. **Explicit Submission (Target: Sunday before `20:00` ICT `DEC-01`):** Group Leader clicks explicit **Submit Report** action (idempotent; double-tap protected). `first_submitted_at` is locked permanently; if `first_submitted_at > Sunday 20:00 ICT`, `is_late = true` permanently.
4. **Routing & Review:**
   - If usable assigned Supervisor exists → routed to Supervisor (`submitted` → `under_review`). Supervisor passes to Body Leader or requests revision (`needs_revision` with mandatory reason). Body Leader cannot approve before Supervisor passes (`DEC-04`).
   - If no usable Supervisor exists → routed directly to Body Leader (`CD-03`).
   - If no usable non-conflicting Body Leader exists (`CD-07`, `DEC-05`) → workflow flagged **Blocked** and System Administrators notified.
5. **Final Approval:** An eligible Body Leader (who is **not** the report submitter per `DEC-05`) reviews and approves (`approved`) with actor + timestamp (`CD-02`, `CD-08`).
6. **Meeting Brief & Overview (Sunday `20:30` ICT `DEC-01`):** FaithMap generates and stores an immutable 10-section **Weekly Meeting Brief** reflecting point-in-time state. Later report submissions do not mutate stored snapshot briefs (`CD-06`).

---

## 3. Functional Requirements

### FR-01: Organization & Body Management
- `FR-01.1` Support top-level Organization configuration (church name, `Asia/Bangkok` timezone, Monday–Sunday period, Sunday `20:00` deadline, Sunday `20:30` brief).
- `FR-01.2` Create, view, update, and archive/deactivate Bodies (`บอดี้`), each with name, description, status (`active`, `inactive`), and Body Leader assignments.
- `FR-01.3` Prevent deletion of Bodies with active groups or historical reports; use soft-deactivation/archival with audit trail.

### FR-02: House Mission Group Management
- `FR-02.1` Create and manage House Mission Groups (`กลุ่มพันธกิจบ้าน`) belonging to exactly one Body at any point in time.
- `FR-02.2` Store group attributes: unique code/ID, name, Body reference, meeting day/time, physical address, map coordinates, location notes, photos, start date, and status (`active`, `paused`, `inactive`).
- `FR-02.3` Support transferring a group between Bodies with effective date, actor, reason, and preserved transfer history.
- `FR-02.4` Identify and list active groups lacking any active Group Leader assignment.

### FR-03: Flexible Group Assignments
- `FR-03.1` Assign Members/Users with responsibility type: `group_leader`, `care_leader`, `coordinator` (Group scope; optional `is_primary`), and `body_leader` (Body scope).
- `FR-03.2` A single person may hold multiple active assignments across groups or responsibilities, enforced by `DEC-05` non-self-approval rules during reporting.
- `FR-03.3` Assignments carry `effective_from` and `effective_to` dates. Modifying an assignment ends the old record and inserts a new record—history is never overwritten.
- `FR-03.4` Body Leaders may create and end `group_leader`, `care_leader`, and `coordinator` assignments within their own Body (`DEC-09`); `body_leader` assignments require `admin`/`super_admin`.
- `FR-03.5` "Usable account": linked User record is `active`, not locked, and has >= 1 active login credential (LINE Login, Passkey, or Password per `DEC-03`).

### FR-04: User & Member Management
- `FR-04.1` Clean separation between **Member/Person Directory** (pastoral profile) and **User Account** (LINE Login / Password / Passkey identity + `system_role`).
- `FR-04.2` Group Member Roster tracks `joined_on` and `left_on` dates per group without destroying historical attendance.
- `FR-04.3` Duplicate detection warnings on phone/full-name during member registration.

### FR-05: Visitor Management (PDPA Compliant)
- `FR-05.1` Record first-time and returning visitors per group meeting: name, first visit date, welcoming group, welcomer, follow-up owner, and visit history.
- `FR-05.2` **Consent Gate (`DEC-10`):** Phone/contact fields may only be saved when `consent_for_contact = true` is explicitly confirmed by the recorder.
- `FR-05.3` Visitor follow-up lifecycle: `first_visit` → `awaiting_followup` → `contacted` → `returned` → `ongoing_care` → `completed`.
- `FR-05.4` Automatically generate one deduplicated follow-up item if a first-time visitor does not return in the subsequent reporting period.
- `FR-05.5` Visitors never receive login accounts without explicit consent and conversion to Member/User.

### FR-06: Attendance Management
- `FR-06.1` Record attendance per `(group, reporting_period, member)` with statuses: `present`, `absent`, `leave`, `online`.
- `FR-06.2` Enforce uniqueness: one attendance record per member per group per period.
- `FR-06.3` Distinguish `"unknown"` (no submitted report) from `"absent"` (explicitly marked absent).
- `FR-06.4` Consecutive absence tracking:
  - 1 week absent → visual indicator only.
  - 2 consecutive weeks absent → create one deduplicated follow-up item assigned to Group Leader (or Supervisor).
  - 3+ consecutive weeks absent → escalate visibility/assignment to responsible Supervisor.
- `FR-06.5` Never auto-label a member as inactive; optional absence reason is stored under `DEC-06` PII restriction.

### FR-07: Weekly Mission Reporting & Draft Autosave
- `FR-07.1` One weekly report record per `(group, reporting_period)`.
- `FR-07.2` Report captures: `meeting_held`, `not_held_reason`, meeting date/location/leader, teaching topic, optional scripture passage, prayer/fellowship/other activity flags, atmosphere, photos, follow-up needs, next-week plan, support requested, and derived attendance + visitor counts.
- `FR-07.3` **Autosave (`CD-01`):** Server autosave + offline IndexedDB fallback; displays `"บันทึกอัตโนมัติแล้ว HH:MM (ยังไม่ส่ง)"`; never submits.
- `FR-07.4` Cross-device draft continuity for the group's authorized Group Leader(s).
- `FR-07.5` **Draft privacy:** `draft` is visible **only** to Group Leader(s) of that group; Supervisors, Body Leaders, and Mission Leadership see `not_submitted`.
- `FR-07.6` **Idempotent Submission:** Explicit Submit locks against double-tap, sets `first_submitted_at` and `last_submitted_at`, and computes `is_late` (`first_submitted_at > Sunday 20:00 ICT`).
- `FR-07.7` **Confirmed Not Held:** Submitting with `meeting_held = false` counts as a **submitted** report.

### FR-08: Review, Revision, Approval & Blocked Workflow
- `FR-08.1` Stored report statuses: `draft`, `submitted`, `under_review`, `needs_revision`, `approved`, plus `is_blocked` operational flag and `supervisor_reviewed_at`.
- `FR-08.2` **Sequential Supervisor Review (`CD-03`, `DEC-04`):** When a usable Supervisor exists, Supervisor reviews (`under_review`), either requests revision (`needs_revision` with mandatory reason) or passes review (`supervisor_reviewed_at` set) to unlock Body Leader approval. When no usable Supervisor exists, report routes directly to Body Leader (`CD-03`).
- `FR-08.3` **Revision Loop:** In `needs_revision`, Group Leader edits (autosave keeps status `needs_revision`) and clicks **Resubmit** (`status -> submitted`, clears `supervisor_reviewed_at` if supervisor exists so review restarts, preserves `first_submitted_at` and `is_late`).
- `FR-08.4` **Final Approval (`CD-02`, `CD-08`, `DEC-05`):** Only an active usable Body Leader of `body_id_snapshot` who is **not** `submitted_by_user_id` (and after Supervisor pass if `DEC-04` applies) may approve (`approved`).
- `FR-08.5` **Blocked Handling (`CD-07`, `DEC-05`):** If no usable non-conflicting Body Leader exists for that Body, `is_blocked = true` and Administrators receive an immediate alert. Resolves automatically once an eligible Body Leader is usable/assigned.
- `FR-08.6` Full immutable audit history of every status transition, actor, timestamp, and diff.

### FR-09: Follow-Up & Action Tracking
- `FR-09.1` Manage follow-up items (`manual`, `absent_2_weeks`, `absent_3plus_weeks`, `visitor_not_returned`, `report_support`) with priority, due date, owner, status (`open`, `in_progress`, `completed`, `cancelled`), and outcome note.
- `FR-09.2` Automatic follow-ups are idempotent; explicit outcome recording is required to complete.

### FR-10: Dashboard, Analytics & Meeting Brief
- `FR-10.1` Role-scoped landing dashboards with drill-down: `Organization -> Body -> Group -> Weekly Report -> Attendance -> Follow-Up`.
- `FR-10.2` Every metric displays its reporting period and obeys canonical definitions (`§4`).
- `FR-10.3` **Weekly Meeting Brief (`DEC-01`):** Scheduled job at **Sunday `20:30` ICT** creates and stores an immutable 10-section brief. Later submissions never mutate stored snapshots.

### FR-11: Notifications (`DEC-07`)
- `FR-11.1` Persistent In-App Notification Inbox + LINE OA Messaging (`Phase 6` for automated LINE push; In-App active from Phase 4/5). Zero Web Push.
- `FR-11.2` Triggers: period open / Sunday reminder, revision requested, blocked alert (Admins), follow-up assigned, report approved.

### FR-12: Export
- `FR-12.1` Scoped CSV / XLSX / PDF-printable exports for period summaries, attendance logs, and Meeting Briefs, omitting restricted PII for roles excluded by `DEC-06` and logging every export to `security_audit_logs`.

### FR-13: LINE Login (Phase 3) & LIFF / Messaging (Phase 6)
- `FR-13.1` **Phase 3:** Server-verified LINE Login OIDC as primary sign-in (`DEC-03`) + explicit account linking under an active session.
- `FR-13.2` **Phase 6:** LIFF mini-app streamlined mobile reporting UI + LINE Messaging API scheduled reminders and status alerts (`DEC-07`).

---

## 4. Canonical Metric Definitions

| Metric | Canonical Definition |
|---|---|
| **Active Bodies** | Bodies with `status = 'active'`. |
| **Active Groups** | House Mission Groups with `status = 'active'` and `started_on <= period.end_date`. |
| **Expected Reports** | Count of `period_group_snapshots` with `expected_to_report = true` for that period (`DEC-08`). |
| **Submitted Reports** | Expected Groups whose report has `status IN ('submitted', 'under_review', 'needs_revision', 'approved')`. **`draft` is excluded.** |
| **Missing Reports** | `Expected Reports - Submitted Reports`. A group with only a `draft` is **Missing**. |
| **Held Meetings** | Submitted/approved reports with `meeting_held = true`. |
| **Confirmed Not Held** | Submitted/approved reports with `meeting_held = false`. |
| **Late Reports** | Submitted/approved reports where `first_submitted_at > Sunday 20:00 ICT`. |
| **Blocked Reports** | Submitted/under_review/needs_revision reports where `is_blocked = true`. |
| **Period Attendance** | Sum of `present + online` across submitted/approved reports with `meeting_held = true`. Missing groups are excluded and marked `"unknown"`. |
| **New Visitors** | Visitors with `first_visit_date` inside `[Monday, Sunday]` of the period. |
| **Returning Visitors** | Visitors attending inside the period whose `first_visit_date < period.start_date`. |
| **Open Follow-Ups** | Follow-up items with `status IN ('open', 'in_progress')` at query time. |

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Usability & Accessibility** | WCAG 2.1 AA; Thai body `>= 16px` (`18px+` on mobile leader forms); touch targets `>= 48x48px`. |
| **Reliability & Autosave** | Debounced server autosave + IndexedDB local buffer + clear Thai sync indicator. |
| **Security & Privacy** | Default-deny RBAC + scope + `DEC-06` PII masking + `DEC-10` PDPA consent + TLS 1.2+. |
| **Auditability** | Append-only audit logs for auth, assignments, report transitions, Body transfers, and exports. |
| **Performance** | P95 API response `< 300ms`; Group Leader mobile load `< 2.5s` on 4G. |
