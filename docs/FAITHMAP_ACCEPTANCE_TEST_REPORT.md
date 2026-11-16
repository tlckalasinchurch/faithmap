# FAITHMAP — END-TO-END WORKFLOW ACCEPTANCE & DEFECT REMEDIATION REPORT

**Test & Remediation Verification Date:** `2026-11-16` (VM clock: `13:53–14:02 UTC` / `20:53–21:02 ICT`, Monday of open period `2026-W47`)  
**Target Branch / Codebase:** Local working tree of `/home/antigravity/tlckalasinchurch/faithmap`  
**Environment Mode:** Isolated synthetic PGlite PostgreSQL instances (`FAITHMAP_DEMO_MODE=true`), headless Chromium (`1280×800` Desktop, `390×844` Mobile & `/mini` LIFF), and direct Next.js Route Handler integration harness (`CRON_SECRET=test-cron-secret`).  
**Remediation Status:** **ALL APPROVED DEFECTS (#1–#5) & FINDING #6 REMEDIATED AND 100% VERIFIED** (`18/18 PASS`).

---

## 1. Environment & Isolation Attestation

1. **Zero Production / Neon Database Access:** All browser, API, and unit test suites executed strictly against disposable local PGlite directories cloned from a clean synthetic seed snapshot (`/tmp/faithmap-seed-snapshot` → `/tmp/faithmap-acceptance-browser-pg` and `/tmp/faithmap-neg-*`). `DATABASE_URL` never pointed to Neon or any external host.
2. **Zero Real Member PII Used:** Only synthetic pilot/demo accounts and synthetic Thai test records (`wichai_nonthan`, `malee_huaisithon`, `prapasri_care`, `narong_coord`, `somchai_body_n`, `kanya_standby`, `pastor_suda`, `admin_kanok`, `wichian_suspended`) were exercised.
3. **Strict Scope Discipline & Zero Scope Creep:** Only approved Defects #1–#5 and Finding #6 from the initial acceptance audit were remediated. Business logic outside the approved scope (specifically Finding #7 / Defect #6: `supportNeededText` clearing on `meetingHeld=false` and `Q-13` manual Admin unblock) was strictly preserved untouched per church owner direction.
4. **Wall Clock vs. Simulated Clock Discipline (`DEC-01`):**
   - Live browser and HTTP route tests ran at real VM wall clock (`Mon 2026-11-16 20:53–21:02 ICT`), where current period `2026-W47` (`2026-11-16` to `2026-11-22`, deadline `Sun 20:00 ICT`, brief `Sun 20:30 ICT`) is `open`.
   - Live brief generation for `2026-W47` correctly enforces `409 BRIEF_TOO_EARLY` (`TC-E6`), while historical immutable brief viewing (`2026-W46`) ran against the live server (`TC-R4`) and Sunday `20:30 ICT` snapshot brief generation (`2026-11-22T13:30:05Z`) was separately executed in an explicit clock-injected test (`TC-EXTRA-REV-FIRST-SUBMIT-AND-BRIEF-2030`) without conflating real-clock vs. simulated-clock behavior.

### Baseline Governing Specifications Audited Against
- [FAITHMAP_PRD.md](file:///home/antigravity/tlckalasinchurch/faithmap/docs/FAITHMAP_PRD.md) (`FR-01`–`FR-13`, Canonical Metrics §4, NFR §5)
- [FAITHMAP_DECISION_REGISTER.md](file:///home/antigravity/tlckalasinchurch/faithmap/docs/FAITHMAP_DECISION_REGISTER.md) (`CD-01`–`CD-10`, `DEC-01`–`DEC-23`, Open Questions `Q-10`–`Q-16`)
- [FAITHMAP_DOMAIN_MODEL.md](file:///home/antigravity/tlckalasinchurch/faithmap/docs/FAITHMAP_DOMAIN_MODEL.md)
- [FAITHMAP_SECURITY_AND_PERMISSION_MODEL.md](file:///home/antigravity/tlckalasinchurch/faithmap/docs/FAITHMAP_SECURITY_AND_PERMISSION_MODEL.md)

### Runtime Telemetry & Verification Counts
- **Vitest Unit & Integration Suite:** **38 test files passed (338 tests passed, 16 skipped for real-postgres)** in `352.7s`.
- **TypeScript Typecheck (`npm run typecheck`):** **0 errors**.
- **Production Build (`npm run build`):** **0 errors** (Next.js Turbopack build succeeded cleanly).
- **PII Safeguards Check (`npm run check:safeguards`):** **0 prohibited hashes or coordinator personal data detected**.
- **Bundle Size Check (`npm run check:bundle`):** **0 bundle budget violations**.
- **Negative & Boundary API Harness (`scratch/verify-negative-and-api-e2e.ts`):** **10/10 test cases passed**.
- **Playwright Chromium E2E Browser Suite (`scratch/run-e2e-acceptance.mjs`):** **11/11 browser test scenarios passed** across 5 roles, Desktop (`1280×800`) and Mobile (`390×844`) viewports.
- **Unhandled Browser Exceptions (`pageerror`):** **0**.
- **Horizontal Layout Overflow:** **0 px** across all tested Desktop and Mobile pages.

---

## 2. Executive Summary & Acceptance Matrix (Before vs. After Remediation)

| Category | Test Case ID | Scope / Role | Pre-Remediation Status | Post-Remediation Status | Verification Summary |
|---|---|---|---|---|---|
| **Role 1** | `TC-R1-DESKTOP` | Group Leader Desktop (`malee_huaisithon`) | `PASS` *(with Defect #3 side effect)* | **`PASS`** | PDPA gate (`400`→`201`), quick visitor registration retains unsaved Step 2 attendance marks, draft reload persists topic & summary, submit locks form (`200`), follow-up transitions to `in_progress`. |
| **Role 1** | `TC-R1-MINI` | Group Leader `/mini` LIFF (`wichai_nonthan`) | `PASS` | **`PASS`** | Password fallback login on `/mini`, report detail opens in strict read-only mode for `under_review` report, `0 px` overflow. |
| **Role 2** | `TC-R2-DESKTOP-MOBILE` | Care Leader / Coordinator (`prapasri_care`, `narong_coord`) | `PASS` | **`PASS`** | Empty revision note guard, revision request (`200`), mobile GL resubmit (`200`), care & coordinator forward to `under_review` (`200`), `0 px` overflow. |
| **Role 3** | `TC-R3-DESKTOP-MOBILE` | Body Leader (`somchai_body_n`) | `PASS` *(with Finding #6 clipping)* | **`PASS`** | Approvals for `nonthan` & `huaisithon` (`200`), intra-Body `care_leader` assignment (`201`), mobile `<select>` clipping eliminated (`0 px` overflow, clip-free). |
| **Role 4** | `TC-R4-DESKTOP-MOBILE` | Pastor (`pastor_suda`) Desktop & Mobile | `PASS` *(with Defect #4 & Finding #5 leaks)* | **`PASS`** | Draft masking (`not_submitted`), all 9 restricted fields + `revisionReason` + `supervisorNotes` + attendance notes nulled, masked phones, dead CTAs & write buttons hidden, `organization_aggregate` brief view. |
| **Role 5** | `TC-R5-DESKTOP-MOBILE` | Admin (`admin_kanok`) + Co-BL (`kanya_standby`) | `PASS` | **`PASS`** | Blocked alert banner, Body South `body_leader` assign (`201`), group create (`201`), manual unblock (`200`), `kanya_standby` mobile approve (`200`), audited CSV export excluding draft. |
| **Neg 1a** | `TC-E1-MINI-CLIENT` | `/mini` Client Validation (`somchai_body_n`) | `PASS` | **`PASS`** | `/mini` UI blocks submit when any active member lacks attendance mark (`• ยังไม่ได้เช็คชื่อสมาชิก 1 คน`). |
| **Neg 1b** | `TC-E1-EMPTY-ATTENDANCE-API` | Incomplete Attendance API (`malee_huaisithon`) | `FAIL` *(Defect #1)* | **`PASS`** | API rejects `submit` with `attendance: []` on held meeting (`400 ATTENDANCE_INCOMPLETE`). Partial drafts remain permissive (`CD-01`). |
| **Neg 1c** | `TC-E1-PARTIAL-AND-INVALID-ATTENDANCE-API` | Partial & Invalid Attendance API (`malee_huaisithon`) | `FAIL` *(Defect #1)* | **`PASS`** | Rejects duplicate member (`400 ATTENDANCE_DUPLICATE_MEMBER`), foreign member (`400 MEMBER_NOT_IN_GROUP`), and partial 1/2 roster (`400 ATTENDANCE_INCOMPLETE`). |
| **Neg 2** | `TC-E2-DUPLICATE-SUBMIT` | Group Leader (`malee_huaisithon`) | `PASS` | **`PASS`** | First submit succeeds (`200`), identical idempotent replay succeeds (`200`, `replayed=true`), altered payload rejects (`409 IDEMPOTENCY_CONFLICT`), second submit rejects (`409 INVALID_STATE_TRANSITION`), `+1` audit event. |
| **Neg 3** | `TC-E3-SELF-APPROVAL` / `TC-E3-UI-SELF-APPROVAL` | Sole BL + GL (`somchai_body_n`) + Co-BL (`kanya_standby`) | `PASS` | **`PASS`** | Auto-blocked on submit (`ONLY_SUBMITTER_IS_BODY_LEADER`), UI hides approve button, API returns `403 SELF_APPROVAL_FORBIDDEN` before & after Admin unblock; Co-BL approves (`200`). |
| **Neg 4** | `TC-E4-UNAUTHORIZED-API-MATRIX` | 12 Unauthorized Access Vectors | `PASS` | **`PASS`** | Unauthenticated (`401`), missing CSRF (`403`), Pastor mutations (`403`), cross-group/cross-body (`403`), GL/Care approve (`403`), bad Cron (`401`), suspended login (`403`); 0 DB mutations. |
| **Neg 5** | `TC-E5-SKIP-SUPERVISOR-REVIEW` / `PRE-E5-UI*` | Body Leader (`somchai_body_n`) | `PASS` *(with Finding #5d button enabled)* | **`PASS`** | Body Leader skipping supervisor review rejected with `409 WORKFLOW_SUPERVISOR_REVIEW_REQUIRED`; UI disables approve button with DEC-04 notice prior to supervisor review. |
| **Neg 6** | `TC-E6-NON-APPROVED-ISOLATION` | Pastor / Admin / BL / Cron | `PASS` | **`PASS`** | Drafts shown as `not_submitted` & excluded from metrics/CSV, attendance notes & supervisor text redacted, pre-20:30 manual brief returns `409 BRIEF_TOO_EARLY`, cron brief skips cleanly (`generated=0`). |
| **Neg 7** | `TC-E7-EDIT-AFTER-SUBMIT` | Group Leaders (`wichai`, `arunee`, `somchai`) | `PASS` | **`PASS`** | Edit attempts blocked (`409 INVALID_STATE_TRANSITION`) in `submitted`, `under_review`, `approved`; stale version blocked (`409 VERSION_CONFLICT`). Precedence over attendance validation preserved. |
| **Neg 8** | `TC-E8-OFFLINE` | Offline Draft Save & Full Recovery (`somchai_body_n`) | `FAIL` *(Defect #2)* | **`PASS`** | Losslessly recovers all 15+ draft fields, preserves `'online'` status without collapsing to `'present'`, restores counters & prayer/care text, warns on version conflict, prevents overwriting locked reports. |
| **Extra A** | `TC-EXTRA-NOT-HELD-AND-FOLLOWUP` | `meetingHeld=false` (`malee_huaisithon`) | `PASS` | **`PASS`** | Missing not-held reason rejected (`400 NOT_HELD_REASON_REQUIRED`); valid reason accepted (`200`, counts zeroed, `status=submitted`); `supportNeededText` clearing preserved per scope. |
| **Extra B** | `TC-EXTRA-REV-FIRST-SUBMIT-AND-BRIEF-2030` | Sunday `20:30 ICT` Brief + `first_submitted_at` | `PASS` | **`PASS`** | Resubmit preserves original `firstSubmittedAt` and resets `supervisorReviewedAt`; simulated Sunday 20:30 ICT brief creates immutable snapshot scoped across org detail, org aggregate, and body; brief CSV `200`. |
| **External** | Live LINE OAuth / LIFF SDK, Live LINE OA Push, Live Vercel Cron Wall-Clock, Neon DB | Production External Integrations | `NOT TESTED` | **`NOT TESTED`** | Excluded by design in isolated VM sandbox without external internet or production credentials. |

**Final Verification Tally:** **`18` PASS · `0` FAIL · `0` BLOCKED · `1` Suite NOT TESTED**.

---

## 3. Remediated Defects & Improvements Log

### Defect #1 — Attendance API & UI Roster Completeness Enforcement
- **Problem:** Submitting a report with `meetingHeld=true` and empty attendance (`attendance: []`) or partial active roster (1 of 2 members) returned HTTP `200` and moved the report to `submitted`, silently omitting active members.
- **Remediation Implemented:**
  - In [src/server/modules/reporting/service.ts](file:///home/antigravity/tlckalasinchurch/faithmap/src/server/modules/reporting/service.ts#L529-L595):
    - Added [`assertAttendanceBelongsToGroup`](file:///home/antigravity/tlckalasinchurch/faithmap/src/server/modules/reporting/service.ts#L529-L569) to validate that submitted attendance IDs belong to the group, contain no duplicates (`400 ATTENDANCE_DUPLICATE_MEMBER`), and correspond to active group memberships (`400 MEMBER_NOT_IN_GROUP`).
    - Added [`assertCompleteAttendanceForSubmit`](file:///home/antigravity/tlckalasinchurch/faithmap/src/server/modules/reporting/service.ts#L572-L595) to enforce that when `meetingHeld=true`, every active member in `group_memberships` must have an explicit attendance record (`present`, `absent`, `leave`, or `online`), returning `400 ATTENDANCE_INCOMPLETE` if any member is omitted.
    - Preserved `CD-01`: `saveDraftReport` remains permissive, allowing partial drafts to be saved at any time.
    - Preserved state machine precedence: `INVALID_STATE_TRANSITION` and `VERSION_CONFLICT` (`409`) are evaluated before attendance validation so locked reports return `409` rather than `400`.
  - In [src/app/api/v1/reports/schema.ts](file:///home/antigravity/tlckalasinchurch/faithmap/src/app/api/v1/reports/schema.ts#L18-L23): Validated `offeringAmountThb` to reject malformed decimal strings (`400 INVALID_DECIMAL`).
  - In [src/components/WeeklyReportTab.tsx](file:///home/antigravity/tlckalasinchurch/faithmap/src/components/WeeklyReportTab.tsx#L353-L386) and [src/components/mini/MiniReport.tsx](file:///home/antigravity/tlckalasinchurch/faithmap/src/components/mini/MiniReport.tsx#L253-L264): Filtered attendance maps to active group members only.
- **Verification:** Unit tests in [tests/acceptance-defect-remediation.test.ts](file:///home/antigravity/tlckalasinchurch/faithmap/tests/acceptance-defect-remediation.test.ts), API harness (`TC-E1-EMPTY-ATTENDANCE-API`, `TC-E1-PARTIAL-AND-INVALID-ATTENDANCE-API`), and browser tests all passed cleanly.

### Defect #2 — Lossless Offline Draft Recovery
- **Problem:** Upon reconnecting and reloading after an offline save, `WeeklyReportTab.tsx` only restored `summaryNotes` and `totalAttendees`, silently wiping `prayerRequests`, `careNeedsNotes`, `teachingTopic`, `newVisitorsCount`, `meetingDate`, and resetting `'online'` attendance marks back to `'present'`.
- **Remediation Implemented:**
  - In [src/lib/offline-drafts.ts](file:///home/antigravity/tlckalasinchurch/faithmap/src/lib/offline-drafts.ts#L150-L255): Implemented [`extractOfflineDraftState`](file:///home/antigravity/tlckalasinchurch/faithmap/src/lib/offline-drafts.ts#L150-L255) to parse and validate all 15+ draft fields losslessly, converting attendance arrays back to status maps with strict status validation (`present`, `absent`, `leave`, `online`).
  - In [src/components/WeeklyReportTab.tsx](file:///home/antigravity/tlckalasinchurch/faithmap/src/components/WeeklyReportTab.tsx#L297-L347):
    - Hydrated all fields from the offline draft payload into component state (`meetingHeld`, `notHeldReason`, `meetingDate`, `memberAttendees`, `newVisitorsCount`, `returningVisitorsCount`, `childrenCount`, `offeringAmountThb`, `prayerRequests`, `careNeedsNotes`, `teachingTopic`, `scriptureRef`, `activities`, and all content fields).
    - Preserved member attendance statuses exactly as saved (`'online'` status retained).
    - Added version conflict warning banner if `offlinePayload.expectedVersion !== serverReport.version`.
    - Added guard preventing offline drafts from overwriting locked server reports (`submitted`, `under_review`, `approved`).
- **Verification:** Chromium E2E `TC-E8-OFFLINE` passed; post-browser DB dump confirmed `buengwichai` report (`00000011-0000-4000-8000-000000000004`) has `attendance_records` for `m1Somchai` as `'online'`, `new_visitors_count=2`, `total_attendees=3`, and all notes intact.

### Defect #3 — Roster Sync & Form State Preservation on Inline Visitor Add / Save
- **Problem:** Registering a new visitor inline via `+ ลงทะเบียนผู้เยี่ยมใหม่` called `onRefresh()`, which replaced `workspace.members`. Because the `groupMembers` memo dependency changed, `loadGroupReport()` re-ran, wiping unsaved Step 2 attendance marks (e.g., reverting `นางเตือนใจ` from `'leave'` back to `'present'`).
- **Remediation Implemented:**
  - In [src/components/WeeklyReportTab.tsx](file:///home/antigravity/tlckalasinchurch/faithmap/src/components/WeeklyReportTab.tsx#L150-L195):
    - Implemented additive roster synchronization: when new members or visitors are loaded, new entries are merged into the existing attendance map with default `'present'` without altering any existing attendance marks.
    - Used `loadedKeyRef` and `groupMembersRef` so `loadGroupReport()` only triggers when the selected group or reporting period actually changes, not on background workspace refreshes.
- **Verification:** Chromium E2E `TC-R1-DESKTOP` passed; verified that `นางเตือนใจ` remained `'leave'` after visitor registration and page reload, and post-browser DB dump recorded `attendance_status: "leave"` for `m11Tueanjai` on report `00000011-0000-4000-8000-000000000003`.

### Defect #4 — Privacy Redaction of Supervisor Text for Pastor (`mission_leader`)
- **Problem:** When Pastor (`mission_leader`) queried reports via `GET /api/v1/reports`, supervisor free-text feedback in `revisionReason` was exposed, violating the privacy model (`DEC-06`/`DEC-18`).
- **Remediation Implemented:**
  - In [src/server/modules/reporting/service.ts](file:///home/antigravity/tlckalasinchurch/faithmap/src/server/modules/reporting/service.ts#L279-L317, L420-L435):
    - Updated [`redactRestrictedReportText`](file:///home/antigravity/tlckalasinchurch/faithmap/src/server/modules/reporting/service.ts#L279-L317) to nullify `revisionReason` and `supervisorNotes` whenever `!canViewUnmaskedGroupPii(...)`.
    - In `getReportDetailForGroup`: Redacted `reason` and `metadata.supervisorNotes` on non-`workflow_blocked` audit events for users without unmasked PII access, keeping system `workflow_blocked` reasons visible.
- **Verification:** Unit test in [tests/acceptance-defect-remediation.test.ts](file:///home/antigravity/tlckalasinchurch/faithmap/tests/acceptance-defect-remediation.test.ts#L180-L245) and E2E `TC-R4-DESKTOP-MOBILE` passed; verified `allPastorRestrictedNull: true` in `scratch/browser-e2e-results.json`.

### Finding #5 — UI Permission Alignment Across Roles
- **Problem:** Frontend controls were visible to roles that lacked backend permissions, resulting in dead clicks or unexpected `HTTP 403` errors.
- **Remediation Implemented:**
  - **Dashboard CTAs & Group Cards:** In [src/components/DashboardTab.tsx](file:///home/antigravity/tlckalasinchurch/faithmap/src/components/DashboardTab.tsx#L157-L180, L406-L440), gated `+ ส่งรายงานสัปดาห์นี้ทันที` and group card navigation behind `canOpenReport` (stewards, body leaders, admins). Pastor sees read-only row cards.
  - **Kalasin Map CTAs:** In [src/components/KalasinMapTab.tsx](file:///home/antigravity/tlckalasinchurch/faithmap/src/components/KalasinMapTab.tsx#L701-L710, L835-L843), gated both `เปิดหน้ารายงานกลุ่มนี้` and the unlocated group card `ส่งรายงาน` button behind `canOpenReport`.
  - **Pastoral Care Actions:** In [src/components/PastoralCareTab.tsx](file:///home/antigravity/tlckalasinchurch/faithmap/src/components/PastoralCareTab.tsx#L377-L793), gated visitor registration, follow-up mutations, member addition, and end-membership behind `editableGroupIds.length > 0` or `canWriteAnyGroup`.
  - **Meeting Brief Generation:** In [src/components/MeetingBriefTab.tsx](file:///home/antigravity/tlckalasinchurch/faithmap/src/components/MeetingBriefTab.tsx#L24-L26), aligned `canGenerate` to `admin` / `super_admin` only (matching backend `canTriggerBrief`).
  - **Approval Queue Review Guard & Note Focus:** In [src/components/ApprovalQueueTab.tsx](file:///home/antigravity/tlckalasinchurch/faithmap/src/components/ApprovalQueueTab.tsx#L342-L362, L387), disabled `อนุมัติรายงาน` when `report.requiresSupervisorReview && !report.supervisorReviewedAt` with DEC-04 notice badge, and auto-focused the revision note textarea when clicking revision request.
- **Verification:** Chromium E2E `TC-R4-DESKTOP-MOBILE` verified `hiddenControls: { reportCta: false, groupBtns: 0, mapOpenReport: false, unlocatedBtn: false, visitorForm: false, followUpBtns: false, endMember: false, genBrief: false }`. `PRE-E5-UI-BUTTON` verified DEC-04 disabled button state.

### Finding #6 — Mobile Select Overflow & Demo Switch Tab Reset
- **Problem:** Mobile `<select>` dropdowns in `GovernanceTab` lacked `min-w-0 w-full`, causing borders to clip against card edges. Switching demo accounts preserved active tab and stale alert banners.
- **Remediation Implemented:**
  - In [src/app/globals.css](file:///home/antigravity/tlckalasinchurch/faithmap/src/app/globals.css) and [src/components/GovernanceTab.tsx](file:///home/antigravity/tlckalasinchurch/faithmap/src/components/GovernanceTab.tsx#L192-L248): Added `min-width: 0; max-width: 100%;` and `w-full min-w-0` on form controls, plus `shrink-0` on header icons.
  - In [src/components/FaithMapApp.tsx](file:///home/antigravity/tlckalasinchurch/faithmap/src/components/FaithMapApp.tsx#L147-L161, L373-L445): Reset active tab to `'dashboard'` on demo user switch and keyed child tab components with `actorKey` to reset component state cleanly.
- **Verification:** Chromium E2E verified `mobileSelectClipFree: true`, `mobileOverflow: 0 px`, and `demoSwitchResetTab: true`.

---

## 4. Post-Remediation Database Verification & Delta Audit

Database state dumped to `scratch/after-browser-db.json` after running the complete Chromium acceptance workflow confirms clean data integrity:

| Table | Snapshot Baseline | Post-Acceptance DB | Verified Data Integrity & Semantic State |
|---|---|---|---|
| `reporting_periods` | `2` | `2` | Untouched (`2026-W46:brief_published`, `2026-W47:open`). |
| `bodies` | `2` | `2` | Untouched (`BODY-KSN-N`, `BODY-KSN-S`). |
| `house_mission_groups` | `5` | `6` | `+1` (`GRP-KAMALASAI` created by `admin_kanok`). |
| `users` | `12` | `12` | Untouched (`wichian_suspended` remained suspended). |
| `assignments` | `9` | `11` | `+2` (`care_leader` on `nongkung`; `body_leader` on `BODY-KSN-S`). |
| `weekly_reports` | `6` | `6` | `nonthan`: `approved (v6)`<br>`huaisithon`: `approved (v6)`<br>`yangtalat`: `approved (v4)`<br>`buengwichai`: `submitted (blocked: ONLY_SUBMITTER_IS_BODY_LEADER, v2)`<br>`nongkung` & `2026-W46`: untouched. |
| `attendance_records` | `5` | `8` | `+2` on `huaisithon`: `m5Malee='present'`, `m11Tueanjai='leave'` (Defect #3 fix verified).<br>`+1` on `buengwichai`: `m1Somchai='online'` (Defect #2 fix verified: `'online'` preserved, not collapsed to `'present'`). |
| `visitors` | `2` | `3` | `+1` (`นายสมปอง ทดสอบพีดีพีเอ`, `consent_for_contact=true`). |
| `visitor_visits` | `2` | `3` | `+1` (new visitor visit linked to `huaisithon`). |
| `follow_up_items` | `2` | `3` | `+1` auto-created with visitor, updated to `in_progress`. |
| `report_audit_events` | `4` | `14` | `+10` audit events covering all lifecycle actions. |
| `notifications` | `3` | `16` | `+13` in-app notifications dispatched. |
| `line_dispatches` | `1` | `13` | `+12` simulated LINE dispatches recorded. |
| `security_audit_logs` | `1` | `26` | `+25` audit entries covering logins, assignments, group creation, unblocks, and CSV exports. |
| `idempotency_keys` | `0` | `3` | `+3` idempotency records from successful browser submits. |
| `meeting_briefs` | `1` | `1` | Existing `2026-W46` brief preserved; `2026-W47` protected prior to Sunday 20:30 ICT. |

---

## 5. Visual Artifacts & Screenshot Registry

All screenshots captured during the acceptance run are stored in `scratch/screenshots_acceptance/`:

- [00_body_leader_queue_initial.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/00_body_leader_queue_initial.png) — Body Leader Approval Queue showing disabled `อนุมัติรายงาน` button with DEC-04 notice prior to Care Leader review.
- [01_r1_pdpa_consent_rejected.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/01_r1_pdpa_consent_rejected.png) — Group Leader Step 2 visitor modal blocking submission without PDPA consent (`400 VISITOR_CONSENT_REQUIRED`).
- [02_r1_draft_saved_desktop.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/02_r1_draft_saved_desktop.png) — Step 3 draft save confirmation toast.
- [03_r1_submitted_locked_desktop.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/03_r1_submitted_locked_desktop.png) — Locked submit state (`ส่งรายงานแล้ว`).
- [04_r1_pastoral_care_desktop.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/04_r1_pastoral_care_desktop.png) — Pastoral Care tab showing new visitor follow-up item updated to `กำลังติดตาม`.
- [05_r2_care_requested_revision.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/05_r2_care_requested_revision.png) — Care Leader revision request prompt with validation.
- [06_r2_mobile_gl_resubmitted.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/06_r2_mobile_gl_resubmitted.png) — Mobile Group Leader viewing revision banner and resubmitting.
- [07_r2_mobile_care_forwarded.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/07_r2_mobile_care_forwarded.png) — Mobile Care Leader forwarding report to Body Leader.
- [08_r1_mini_reports_mobile.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/08_r1_mini_reports_mobile.png) — `/mini` mobile list view with status pills.
- [09_r1_mini_report_readonly.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/09_r1_mini_report_readonly.png) — `/mini` read-only banner on submitted report.
- [10_r3_body_leader_approved_desktop.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/10_r3_body_leader_approved_desktop.png) — Body Leader approving reviewed reports.
- [11_r3_mobile_body_leader_governance.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/11_r3_mobile_body_leader_governance.png) — Mobile Governance form showing clip-free `<select>` elements (`min-w-0 w-full`).
- [12_r5_admin_dashboard_blocked_alert.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/12_r5_admin_dashboard_blocked_alert.png) — Admin Dashboard blocked report warning strip.
- [13_r5_admin_assigned_south_leader.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/13_r5_admin_assigned_south_leader.png) — Admin assigning South Body Leader.
- [14_r5_admin_unblocked_yangtalat.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/14_r5_admin_unblocked_yangtalat.png) — Admin manual unblock confirmation toast.
- [15_r5_mobile_kanya_approved_yangtalat.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/15_r5_mobile_kanya_approved_yangtalat.png) — Newly assigned South Body Leader approving unblocked report on mobile.
- [16_r5_mobile_admin_governance_audit.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/16_r5_mobile_admin_governance_audit.png) — Mobile Admin audit trail and CSV export confirmation.
- [17_r4_pastor_dashboard_desktop.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/17_r4_pastor_dashboard_desktop.png) — Pastor Dashboard with 4 permitted tabs, non-clickable group rows, and report CTA hidden.
- [18_r4_pastor_pastoral_pii_masked.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/18_r4_pastor_pastoral_pii_masked.png) — Pastor Pastoral Care view with PII masked and visitor/member mutation forms hidden.
- [19_r4_pastor_brief_aggregate.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/19_r4_pastor_brief_aggregate.png) — Pastor Meeting Brief showing `organization_aggregate` view without group names or raw text, and `ออกรายงานสรุป` button hidden.
- [20_r4_pastor_mobile_brief.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/20_r4_pastor_mobile_brief.png) — Pastor Mobile Meeting Brief with `0 px` overflow.
- [21_e8_offline_draft_saved.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/21_e8_offline_draft_saved.png) — Offline draft save toast while disconnected.
- [22_e8_after_reconnect_reload_recovery.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/22_e8_after_reconnect_reload_recovery.png) — Full offline draft recovery banner with all fields, counters, and `'online'` attendance mark restored.
- [23_e3_buengwichai_submitted_blocked_sole_leader.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/23_e3_buengwichai_submitted_blocked_sole_leader.png) — Auto-blocked submission by sole Body Leader (`ONLY_SUBMITTER_IS_BODY_LEADER`).
- [24_e3_self_approval_blocked_queue.png](file:///home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/f6d24352-5332-4a56-aa36-9297181e905d/scratch/screenshots_acceptance/24_e3_self_approval_blocked_queue.png) — Approval Queue showing self-approval forbidden notice instead of approve button.

---

## 6. Scope Boundaries & Untested External Integrations

### Preserved Logic (Explicitly Excluded from Remediation Scope)
1. **`supportNeededText` Clearing on `meetingHeld=false`:** In `src/server/modules/reporting/service.ts:contentFields`, `supportNeededText` is cleared to `null` when `meetingHeld=false`. This was confirmed as intentional design pending future church leadership review and was left untouched.
2. **Manual Admin Unblock (`Q-13`):** In `src/server/modules/reporting/service.ts:unblockReportByAdmin`, reports blocked under `ONLY_SUBMITTER_IS_BODY_LEADER` remain blocked until explicitly unblocked by an Admin via `POST /api/v1/reports action="unblock"`, rather than automatically unblocking upon co-leader assignment. This preserves church governance oversight and remains untouched.

### Untested External Integrations
The following services interact with live external third-party infrastructure and are marked **`NOT TESTED`** in accordance with isolated sandbox constraints:
- **Live LINE Login OAuth & LINE LIFF SDK in Mobile LINE App:** Production LINE Client ID, Channel Secret, and LINE LIFF SDK communication require registered production redirect URIs and mobile LINE application webviews.
- **Live LINE Official Account Push Dispatches:** Production LINE Messaging API push requires valid church LINE OA channel access tokens and real recipient LINE UIDs. Dispatches are verified via local in-memory/PGlite `line_dispatches` queue simulation.
- **Production Neon PostgreSQL:** All tests ran against synthetic PGlite instances. Neon serverless branching and production connections were strictly avoided.
- **Live Vercel Cron Wall-Clock Scheduling:** Vercel Cron scheduling was verified via direct internal route invocation with `CRON_SECRET` authorization (`/api/internal/jobs/[jobName]`), rather than waiting for production Vercel infrastructure triggers.

---

## 7. Conclusion & Release Readiness

With the remediation and verification of approved Defects #1–#5 and Finding #6:
- All core church business rules (`CD-01`–`CD-10`, `DEC-01`–`DEC-23`) are fully enforced.
- Complete active roster attendance is strictly validated on report submission without impeding partial offline drafts.
- Offline draft storage and recovery operates losslessly across all form fields and attendance marks.
- Pastor privacy boundaries strictly prevent accidental leakage of PII, restricted notes, supervisor review comments, and group identities.
- Frontend controls match backend role authorizations across Desktop and Mobile viewports.
- FaithMap is **fully verified and ready for controlled Preview deployment**.
