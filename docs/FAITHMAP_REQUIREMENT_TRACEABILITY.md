# FaithMap — Requirement-to-Code Traceability Matrix

Date: 2026-11-15. Source of truth: `FAITHMAP_PRD.md` (FR-01 to FR-13, section 4, section 5), `FAITHMAP_DECISION_REGISTER.md`, `FAITHMAP_DOMAIN_MODEL.md`.
Method: I read the code path for each requirement and found the test that fails when the behavior breaks. A row is **Verified (local)** only when such a test exists and passed in this session on PGlite and on PostgreSQL 16. "Local" means: scratch database and Node process. It does **not** mean Preview, Neon, LINE or Production.

Status words: **Verified (local)** · **Partial** (part is missing, see note) · **Not implemented** (open decision or limitation) · **Not verified** (needs an environment that was not used).

Code paths are under `src/server/modules/` unless a full path is shown. Tests are under `tests/`.

## FR-01 Organization and Body

| ID | Implementation | Test | Status |
|---|---|---|---|
| FR-01.1 organization settings (timezone, week, deadline, brief) | The rules are constants in `time/bangkok.ts` (locked by `DEC-01`, `DEC-02`). The table `organization_settings` exists and is seeded but **no code reads it** | `time-bangkok.test.ts` | **Partial.** Values are fixed, not configurable. This follows the locked decisions. The unused table is a known gap (G-12) |
| FR-01.2 create, view, update, archive Body | `organization/service.ts` `createBody`, `updateBody`, `listBodiesWithLeaders`; API `organization` actions `create_body`, `update_body`; screen `BodyManagementPanel` (Governance tab) | `gate19` (Body management, 3 tests); `scripts/e2e-admin-screens.mjs` | Verified (local). Before this round **no way existed to create a Body** in an empty production database (G-01) |
| FR-01.3 no delete of a Body with groups or reports | No delete path exists. `updateBody` refuses inactive or archived while an active group exists (`BODY_HAS_ACTIVE_GROUPS`). FK from groups to bodies restricts delete | `gate19` | Verified (local). Rule interpretation: `DEC-22` (Q-12 pending) |

## FR-02 House Mission Group

| ID | Implementation | Test | Status |
|---|---|---|---|
| FR-02.1 one Body per group | `houseMissionGroups.bodyId`; `createGroup` | `phase2`, `gate1` | Verified (local) |
| FR-02.2 attributes (code, name, Body, day/time, address, coordinates, notes, photo, start, status) | Schema `house_mission_groups`; `createGroup` | `phase3b2-1` | **Partial.** No photo upload (Q-16). `started_on` is not stored; the period snapshot uses the group status |
| FR-02.3 transfer with date, actor, reason, history | `organization/service.ts` `transferGroupToBody`; table `group_body_transfers` | `workflow-and-constraints`, `gate10` | Verified (local) |
| FR-02.4 list active groups without a Group Leader | `components/DashboardTab.tsx` (derived from the scoped group list) | `scripts/e2e-admin-screens.mjs` (layout only) | **Partial.** Shown on the dashboard; no server-side list or test of the rule itself |

## FR-03 Assignments

| ID | Implementation | Test | Status |
|---|---|---|---|
| FR-03.1 responsibility types and scope | `assignments` table with checks; `assignLeadershipRole` | `phase3a`, `gate1` | Verified (local) |
| FR-03.2 several assignments per person | Same; partial unique indexes allow it | `workflow-and-constraints` | Verified (local) |
| FR-03.3 effective dates, history kept | `effective_from`, `effective_to`; `revokeAssignment` ends the row | `gate2-legacy-routes-authz` | Verified (local) |
| FR-03.4 Body Leader scope (`DEC-09`) | `authz/policy.ts` `assertCanManageBodyScope`; `assignLeadershipRole` | `workflow-and-constraints`, `gate10` | Verified (local) |
| FR-03.5 usable account | `identity/service.ts` `isUsableAccount` | `api-and-security`, `gate1` | Verified (local) |

## FR-04 Users and members

| ID | Implementation | Test | Status |
|---|---|---|---|
| FR-04.1 members separate from user accounts | Tables `members`, `users`; `members` has no login | `phase2`, `gate2-auth-hardening` | Verified (local) |
| FR-04.2 roster with joined and left | `pastoral-care/service.ts` `createGroupMemberWithWarnings`, `addExistingMemberToGroup`, `endGroupMembership`; API `pastoral` | `gate19` (roster, 2 tests) | Verified (local). The roster screen has no "end membership" button yet (G-13) |
| FR-04.3 duplicate warning on name or phone | `findDuplicateMemberWarnings` (counts only, after the scope check) | `gate18` | Verified (local). The warning is returned by the API; no screen shows it yet (G-13) |

## FR-05 Visitors

| ID | Implementation | Test | Status |
|---|---|---|---|
| FR-05.1 visit history | `registerVisitor`, `recordVisitorReturn`; table `visitor_visits` | `gate18` | Verified (local). Welcomer and follow-up owner fields are not stored |
| FR-05.2 consent gate (`DEC-10`) | DB check `visitors_pdpa_consent_chk`; service check `VISITOR_CONSENT_REQUIRED` | `db-schema`, `workflow-and-constraints` | Verified (local) |
| FR-05.3 lifecycle | `visitors.followup_status`; `updateVisitorFollowupStatus` (forward only); events set it | `gate18` | Verified (local). No screen button for manual moves (G-13) |
| FR-05.4 follow-up if a first-time visitor does not return | `pastoral-care/followup-automation.ts` | `gate18` (3 tests) | Verified (local). Rule interpretation: `DEC-21` (Q-11 pending) |
| FR-05.5 no login without consent and conversion | `convertVisitorToMember` | `workflow-and-constraints` | Verified (local) |

## FR-06 Attendance

| ID | Implementation | Test | Status |
|---|---|---|---|
| FR-06.1 statuses present, absent, leave, online | Schema check `attendance_status_chk`; `reports/schema.ts`; forms. Migration 0005 converts `excused` to `leave` | `gate18` | Verified (local) (`DEC-20`). The data step is tested as text order only, not on old rows |
| FR-06.2 one record per member per report | Unique index `attendance_records_report_member_uidx`; `assertAttendanceBelongsToGroup` | `gate2-legacy-routes-authz` | Verified (local) |
| FR-06.3 unknown is not absent | Missing groups are counted as missing, never as absent; automation treats a week without a report as a break | `workflow-and-constraints`, `gate16`, `gate18` | Verified (local) |
| FR-06.4 absence follow-ups | `followup-automation.ts` (2 weeks: Group Leader; 3 or more: Supervisor or Body Leader) | `gate18` (4 tests) | Verified (local). `DEC-21` pending (Q-11) |
| FR-06.5 never label a member inactive; note restricted | No such field; absence notes masked (`DEC-06`) | `gate13` | Verified (local) |

## FR-07 Weekly report

| ID | Implementation | Test | Status |
|---|---|---|---|
| FR-07.1 one report per group and period | Unique index `weekly_reports_period_group_uidx` | `real-postgres`, `gate2-legacy-routes-authz` | Verified (local, PostgreSQL 16) |
| FR-07.2 content and derived counts | Content columns and `contentFields` (`reporting/service.ts`); member attendance derived from marks (`normalizeCounts`) | `gate21`, `gate18` | **Partial.** Photos and "meeting leader" are not stored (Q-16). Visibility: `DEC-23` (Q-15 pending) |
| FR-07.3 autosave, offline buffer, indicator | `components/WeeklyReportTab.tsx`, `lib/offline-drafts.ts`; server `saveDraftReport` | `workflow-and-constraints` (server); `scripts/e2e-mini-report.mjs` (screen) | Verified (local). IndexedDB on a real phone was not tested |
| FR-07.4 draft across devices | Draft stored on the server | `workflow-and-constraints` | Verified (local) |
| FR-07.5 draft privacy | `maskDraftReportForViewer` | `workflow-and-constraints`, `gate21` | Verified (local) |
| FR-07.6 idempotent submit, lateness | `submitReport` (version guard); `is_late` from `deadline_at` | `api-and-security`, `gate2-legacy-routes-authz`, `real-postgres` | Verified (local, PostgreSQL 16). The PRD column `first_submitted_at` is `submitted_at` in code |
| FR-07.7 confirmed not held counts as submitted | `normalizeCounts`, metrics | `workflow-and-constraints` | Verified (local) |

## FR-08 Review, approval, blocked

| ID | Implementation | Test | Status |
|---|---|---|---|
| FR-08.1 statuses and flags | Schema checks `wr_*_chk` | `db-schema`, `real-postgres` | Verified (local) |
| FR-08.2 sequential supervisor review | `reviewReportBySupervisor`, `evaluateRequiresSupervisorReview`; DB check `wr_sequential_review_chk` | `workflow-and-constraints`, `gate6` | Verified (local) |
| FR-08.3 revision loop | `submitReport` on `needs_revision` | `workflow-and-constraints` | Verified (local) |
| FR-08.4 final approval, no self approval | `approveReportByBodyLeader`; DB check `wr_no_self_approval_chk` | `workflow-and-constraints`, `db-schema` | Verified (local) |
| FR-08.5 blocked handling | Block and admin alert on submit; `unblockReportByAdmin` | `workflow-and-constraints` | **Partial.** Unblock is manual; the PRD also says it resolves automatically (Q-13 pending) |
| FR-08.6 immutable audit | Tables `report_audit_events`, `security_audit_logs` with triggers | `db-schema`, `real-postgres`, `gate5` | Verified (local) |

## FR-09 Follow-ups

| ID | Implementation | Test | Status |
|---|---|---|---|
| FR-09.1 kinds, priority, owner, status | Columns `source_type`, `priority`; `followup-automation.ts` | `gate18` | Verified (local) |
| FR-09.2 idempotent, outcome required | Dedup key and partial unique index; `OUTCOME_REQUIRED`; DB check | `gate18` | Verified (local). Screen asks for the outcome |

## FR-10 to FR-13

| ID | Implementation | Test | Status |
|---|---|---|---|
| FR-10.1 role-scoped dashboards | `insights/service.ts` `getDashboardOverview`; tabs | `gate10`, `workflow-and-constraints` | Verified (local) |
| FR-10.2 canonical metrics | `generateMeetingBriefForPeriod`, `getDashboardOverview` | `workflow-and-constraints`, `gate16` | Verified (local) |
| FR-10.3 immutable brief at Sunday 20:30 | `generateMeetingBriefForPeriod`; job route `generate_meeting_brief`; role views (`DEC-19`) | `gate2-legacy-routes-authz`, `gate16`, `gate17` | Verified (local). **No scheduler exists** (open decision B-2), so the brief is not made automatically in any environment |
| FR-11.1 in-app inbox and LINE OA | `notifications/service.ts` | `api-and-security` | **Partial.** Inbox verified (local). LINE push is **simulated** when no token is set. Real LINE push is **Not verified** |
| FR-11.2 triggers | Submit, review, approve, blocked, follow-up assigned, cutoff, weekend reminder (`executeReminderJob`) | `api-and-security`, `gate18`, `gate19` | Verified (local). Reminder and cutoff jobs need a scheduler (B-2) |
| FR-12.1 scoped CSV, XLSX, PDF; audit | `insights/service.ts` `exportScopedCsvData` (CSV, audited) | `gate10` | **Partial.** CSV only (Q-14) |
| FR-13.1 LINE Login | `line-identity/*`, `/api/v1/line` | `gate3`, `gate4`, `gate11`, `gate12` | Verified (local, with a mock verifier and the mock LIFF). **Not verified with real LINE** |
| FR-13.2 LIFF mini-app and LINE messaging | `/mini`, `components/mini/*` | `gate4`, `gate6`, `scripts/e2e-mini*.mjs` (84 and 52 checks) | **Not verified** on a real device or in LINE |

## Non-functional (PRD section 5) and privacy

| Requirement | Evidence | Status |
|---|---|---|
| Tap targets 48 px, text 16 px | `scripts/e2e-mini.mjs` (84 checks), `e2e-mini-report.mjs` (52), `e2e-admin-screens.mjs` (89), at 360, 768, 1280 px, Chromium. Third-party map attribution text (12 px, licence requires it) is excluded | Verified (local). Not tested on real phones |
| Default-deny authorization | `gate7` (every route 401), `gate10` (matrix), `gate16` to `gate19` | Verified (local) |
| DEC-06 PII isolation | `gate8`, `gate13`, `gate15`, `gate16`, `gate20`; build check `npm run check:bundle` | Verified (local). A leak of 23 real field point phone numbers into the browser bundle was found and fixed in this round (G-02) |
| Append-only audit | DB triggers; `real-postgres` | Verified (local, PostgreSQL 16) |
| P95 API under 300 ms; mobile load under 2.5 s on 4G | No measurement | **Not verified** |
| WCAG 2.1 AA | Size and scroll checks only. No contrast or screen reader audit | **Not verified** |
