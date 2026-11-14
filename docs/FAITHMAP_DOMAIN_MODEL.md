# FaithMap — Domain Model

**Document ID:** `FM-03` · **Version:** `2.0` · **Date:** `2026-11-14` · **Status:** `Approved Baseline (GATE-1)`  
**Product:** **FaithMap** (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`)

---

## 1. Domain Modeling Principles

1. **Pure Domain Language:** Concepts map directly to church mission terminology—never legacy database artifacts.
2. **Flat Responsibility Over Deep Trees:** Organization depth is strictly `Organization -> Body -> House Mission Group`. Care Leaders and Coordinators are **Group Assignments**, not organizational levels.
3. **Explicit State Machines:** Reporting, review, blocking, follow-up, and visitor workflows enforce finite states, sequential review (`DEC-04`), non-self-approval (`DEC-05`), and auditable transitions.
4. **Asia/Bangkok Time Semantics (`DEC-01`, `DEC-02`):** Reporting weeks run **Monday–Sunday** in `Asia/Bangkok`; deadline is **Sunday `20:00` ICT**; immutable Meeting Brief generates **Sunday `20:30` ICT**.

---

## 2. Bounded Contexts

| Bounded Context | Core Responsibility | Key Aggregates |
|---|---|---|
| **1. Identity & Access** | LINE Login OIDC, Password/Passkey fallback, sessions, system roles | `UserAccount`, `AuthSession`, `ExternalIdentity`, `UserPasskey` |
| **2. Organization & Stewardship** | Bodies, House Mission Groups, Body transfers, Assignments | `Body`, `HouseMissionGroup`, `Assignment` |
| **3. People & Pastoral Care** | Members, Group Rosters, PDPA-consented Visitors, Follow-Up Actions | `Member`, `GroupMembership`, `Visitor`, `FollowUpItem` |
| **4. Weekly Mission Reporting** | Monday–Sunday Periods, Reports, Attendance, Sequential Review, Approval, Blocked | `ReportingPeriod`, `WeeklyReport`, `AttendanceRecord` |
| **5. Insights & Briefings** | Immutable Expected-Group Snapshots (`DEC-08`), Sunday `20:30` Briefs, Analytics | `PeriodGroupSnapshot`, `MeetingBrief` |
| **6. Engagement & Notifications** | In-App Notification Inbox, LINE OA Messaging dispatch (`DEC-07`) | `Notification`, `LineDispatch` |

---

## 3. Core Entities & Invariants

### 3.1 Identity & Access Context
- **`UserAccount`:** `id (UUID)`, `display_name`, `email?`, `phone_e164?`, `password_hash?`, `system_role (super_admin | admin | mission_leader | standard_user)`, `status (invited | active | suspended | deactivated)`, `linked_member_id?`, `last_login_at`.
  - *Invariant (`isUsableAccount`):* `status === 'active'` AND at least one active login credential exists (verified `ExternalIdentity` LINE link, active `UserPasskey`, or `password_hash`).
- **`ExternalIdentity`:** `id`, `user_id`, `provider ('line')`, `provider_subject_id`, `verified_at`, `linked_by_user_id`.
- **`UserPasskey`:** WebAuthn credential record for passwordless fallback (`DEC-03`).

### 3.2 Organization & Stewardship Context
- **`Body`:** `id`, `code`, `name`, `description`, `status (active | inactive)`.
- **`HouseMissionGroup`:** `id`, `code`, `body_id`, `name`, `meeting_day`, `meeting_time`, `address`, `geo_point`, `location_notes`, `photo_urls`, `started_on`, `status (active | paused | inactive)`.
- **`GroupBodyTransfer`:** `id`, `group_id`, `from_body_id`, `to_body_id`, `effective_on`, `reason`, `transferred_by`.
- **`Assignment`:** `id`, `member_id`, `scope_type ('body' | 'group')`, `body_id?`, `group_id?`, `responsibility ('body_leader' | 'care_leader' | 'coordinator' | 'group_leader')`, `is_primary (boolean)`, `effective_from`, `effective_to?`, `ended_reason?`, `created_by`.
  - *Invariant:* Body Leaders (`body_leader`) may create/end group-scoped assignments strictly within their assigned `body_id` (`DEC-09`); `body_leader` assignments are managed by `admin`/`super_admin` only.

### 3.3 People & Pastoral Care Context
- **`Member`:** `id`, `full_name`, `nickname`, `phone_e164`, `email?`, `photo_url?`, `address`, `joined_church_on`, `status (active | archived)`.
- **`GroupMembership`:** `id`, `group_id`, `member_id`, `joined_on`, `left_on?` (at most one open membership per `(group, member)`).
- **`Visitor`:** `id`, `full_name`, `nickname?`, `phone_e164?`, `first_visit_date`, `origin_group_id`, `welcomer_member_id?`, `followup_owner_user_id?`, `followup_status`, `consent_for_contact (boolean)`, `converted_member_id?`.
  - *Invariant (`DEC-10`):* `phone_e164` cannot be stored unless `consent_for_contact === true`.
- **`FollowUpItem`:** `id`, `source_type`, `source_dedup_key`, `group_id`, `member_id?`, `visitor_id?`, `title`, `description`, `owner_user_id?`, `priority`, `due_on`, `status`, `outcome_note?`, `completed_at?`, `completed_by?`.

### 3.4 Weekly Mission Reporting Context
- **`ReportingPeriod`:** `id`, `period_code`, `start_date (Monday)`, `end_date (Sunday)`, `opens_at (Mon 00:00 ICT)`, `deadline_at (Sun 20:00 ICT)`, `brief_scheduled_at (Sun 20:30 ICT)`, `status (scheduled | open | closed)`.
- **`WeeklyReport`:**
  - `status`: `draft | submitted | under_review | needs_revision | approved`
  - Sequential & routing state: `requires_supervisor_review (boolean)`, `supervisor_reviewed_by_user_id?`, `supervisor_reviewed_at?` (`DEC-04`)
  - Block state: `is_blocked (boolean)`, `blocked_reason ('no_usable_body_leader' | 'self_approval_forbidden_no_co_body_leader'?)`, `blocked_at?`, `unblocked_at?` (`CD-07`, `DEC-05`)
  - Timing: `submitted_by_user_id?`, `first_submitted_at?`, `last_submitted_at?`, `is_late (boolean)`
  - Approval: `approved_by_user_id?`, `approved_at?`
  - Optimistic lock: `version`

---

## 4. Weekly Report State Machine & Routing Rules

```text
                    +-------------------+
                    |   (No Record)     |
                    +---------+---------+
                              | Group Leader opens form / autosave
                              v
                    +-------------------+
         +--------->|       draft       | (Autosave updates content & version;
         |          +---------+---------+  NEVER submits; visible to Group Leader only)
         |                    |
         |                    | Explicit Submit (idempotent; sets first_submitted_at & is_late)
         |                    v
         |          +-------------------+
         |          |     submitted     |<------------------------------+
         |          +---------+---------+                               |
         |                    |                                         |
         |        +-----------+-----------+                             |
         |        |                       |                             |
         |  Usable Supervisor?      No usable Supervisor                |
         |       YES                (Fallback CD-03)                    |
         |        |                       |                             |
         |        v                       |                             |
         |  +---------------+             |                             |
         |  | under_review  |             |                             |
         |  +---+-------+---+             |                             |
         |      |       |                 |                             |
         |  Revision  Supervisor passes   |                             |
         |  Requested (sets reviewed_at)  |                             |
         |      |       |                 |                             |
         |      |       +--------+--------+                             |
         |      |                |                                      |
         |      |                v                                      |
         |      |     [Eligible Body Leader exists?                     |
         |      |      (usable AND user_id != submitted_by_user_id)]    |
         |      |         /              \                              |
         |      |       NO               YES                            |
         |      |       /                  \                            |
         |      |      v                    v                           |
         |      |  is_blocked=true     Eligible Body Leader approves    |
         |      |  (Notify Admins)          |                           |
         |      |      |                    v                           |
         |      |  (Unblocked when    +-----------+                     |
         |      |   eligible Body     | approved  | (Final; never auto) |
         |      |   Leader exists)    +-----------+                     |
         |      v                                                       |
         |  +----------------+  Group Leader edits (autosave)           |
         +--| needs_revision |  & clicks explicit Resubmit -------------+
            +----------------+
```

### Key Domain Invariants
1. **Never Auto-Approve (`CD-08`):** Zero automated or scheduled transitions into `approved`.
2. **Sequential Review Gate (`DEC-04`):** If `requires_supervisor_review === true` and `supervisor_reviewed_at IS NULL`, Body Leader `approve()` is rejected (`409 WORKFLOW_SUPERVISOR_REVIEW_REQUIRED`).
3. **Non-Self Approval (`DEC-05`):** `approve()` requires `actorUserId !== report.submitted_by_user_id`. If the Body has no usable `body_leader` other than `submitted_by_user_id`, the report enters `is_blocked = true` with `blocked_reason = 'self_approval_forbidden_no_co_body_leader'` and notifies System Administrators.
4. **Immutable Snapshot (`DEC-08`):** Expected groups for any `ReportingPeriod` come strictly from `PeriodGroupSnapshot` captured when the period opens.
5. **Immutable Late Flag:** `is_late = first_submitted_at > period.deadline_at` (`Sunday 20:00 ICT`). Resubmissions after `needs_revision` preserve `first_submitted_at` and `is_late`.
