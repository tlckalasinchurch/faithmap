# FaithMap — Decision Register

**Document ID:** `FM-12` · **Version:** `2.0` · **Date:** `2026-11-14` · **Status:** `Locked Governance Baseline (All DEC-01..DEC-14 Resolved)`  
**Product:** **FaithMap** (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`)

---

## 1. Governance Summary

All initial product, architecture, security, workflow, stack, and cutover decisions (`CD-01`–`CD-10` and `DEC-01`–`DEC-14`) were explicitly decided and confirmed by the Project Owner on **2026-11-14**.  
No legacy Puntakit code, database, auth, roles, or production data are reused (`CD-09`).

---

## 2. Core Confirmed Business Rules (`CD-01`–`CD-10`)

| ID | Decision | Rationale / Source |
|---|---|---|
| `CD-01` | **Draft uses Autosave.** Autosave never submits a report and never changes status from `draft`. | Protects elderly/non-technical leaders from losing work or accidentally sending incomplete reports. |
| `CD-02` | **Body Leader is the final approver.** Only an active, usable Body Leader assignment for the group's Body can approve. | Preserves pastoral accountability at the Body level. |
| `CD-03` | **Supervisor fallback to Body Leader.** If no usable active Care Leader or Coordinator exists for a group, submitted reports route to the Body Leader automatically. | Prevents reports from stalling when groups lack an assigned supervisor. |
| `CD-04` | **Weekly reporting deadline is Sunday.** | Aligns with weekly house mission cadence (time confirmed in `DEC-01`). |
| `CD-05` | **Canonical timezone is `Asia/Bangkok` (UTC+7).** | Eliminates midnight boundary errors across UTC servers and local devices. |
| `CD-06` | **Mission Leadership receives overview** across all Bodies and does not automatically replace Body Leader approval. | Separates executive oversight from operational Body approval. |
| `CD-07` | **Blocked workflow on missing usable Body Leader.** Mark workflow Blocked and notify System Administrators; never skip approval. | Guarantees accountability and visibility when leadership coverage breaks. |
| `CD-08` | **Never auto-approve a report** under any condition. | Preserves human pastoral verification. |
| `CD-09` | **Option C — Clean Slate / 100% Full Replacement.** Zero reuse of Puntakit source code, schema, auth, roles, endpoints, config, or production data. | Eliminates legacy technical debt and brittle assumptions. |
| `CD-10` | **Product identity is FaithMap** (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`). | Establishes one standalone product identity. |

---

## 3. Owner-Resolved Decisions (`DEC-01`–`DEC-14`, Locked 2026-11-14)

| ID | Decision Topic | Confirmed Owner Decision | Impacted Docs |
|---|---|---|---|
| `DEC-01` | **Sunday deadline & Meeting Brief time (`Asia/Bangkok`)** | Weekly reporting deadline is **Sunday 20:00 ICT** (`20:00`). Immutable Meeting Brief generates **Sunday 20:30 ICT** (`20:30`). | `FM-02`, `FM-03`, `FM-04`, `FM-05`, `FM-07`, `FM-11` |
| `DEC-02` | **Reporting week boundaries** | **Monday–Sunday** (`Monday 00:00 ICT` to `Sunday 23:59 ICT`). | `FM-02`, `FM-03`, `FM-05`, `FM-11` |
| `DEC-03` | **Primary authentication method** | **LINE Login / LIFF as primary sign-in** for elderly/non-technical Group Leaders, plus **Password / Passkey fallback** for System Admins, desktop users, and users without LINE. | `FM-04`, `FM-05`, `FM-06`, `FM-07`, `FM-08`, `FM-11` |
| `DEC-04` | **Body Leader approval before Supervisor review** | **Strictly sequential:** When a group has a usable assigned Supervisor, Body Leader may give final approval **only after** Supervisor review passes (fallback applies when no usable Supervisor exists per `CD-03`). | `FM-02`, `FM-03`, `FM-06`, `FM-08`, `FM-09` |
| `DEC-05` | **Self-approval rule** | **Self-approval is forbidden.** A user may not approve a report they submitted. If a co-Body Leader exists in that Body, the co-Body Leader approves; if no other usable Body Leader exists, the report marks **Blocked** and notifies Admins. | `FM-02`, `FM-03`, `FM-05`, `FM-06`, `FM-08`, `FM-09` |
| `DEC-06` | **PII & sensitive absence-note visibility** | Member phone, address, and restricted absence notes are visible **only** to direct group stewards (`group_leader` / `ผู้รับผิดชอบกลุ่มพันธกิจบ้าน`, assigned `care_leader`/`coordinator`), the group's `body_leader`, and `admin`/`super_admin`. **ศิษยาภิบาล (`Pastor` / `mission_leader` oversight)** sees aggregate metrics & non-PII summaries (clarified 2026-11-14). `coordinator` acts as group reporter or supervisor according to their active group assignment. | `FM-02`, `FM-06`, `FM-08`, `FM-09` |
| `DEC-07` | **Notification delivery channels** | **In-App Notification Inbox + LINE OA Messaging** only. **No Web Push (VAPID)** to avoid iOS/Android browser fragility for elderly users. | `FM-02`, `FM-04`, `FM-05`, `FM-06`, `FM-07`, `FM-11` |
| `DEC-08` | **Historical expected-group list** | **Immutable `PeriodGroupSnapshot`** captured at period open. Past completion metrics never shift when groups later pause or transfer Bodies. | `FM-02`, `FM-03`, `FM-04`, `FM-05`, `FM-09` |
| `DEC-09` | **Body Leader assignment management** | **Allowed inside own Body:** Body Leaders may create/end `group_leader`, `care_leader`, and `coordinator` assignments for groups in their own Body (audited). `body_leader` assignments remain Admin-only. | `FM-02`, `FM-06`, `FM-07`, `FM-08`, `FM-09` |
| `DEC-10` | **Visitor PDPA consent** | Mandatory explicit consent (`consent_for_contact = true`) required before recording visitor phone/contact details for outreach. | `FM-02`, `FM-05`, `FM-06`, `FM-07`, `FM-08` |
| `DEC-11` | **Technology stack & hosting** | **Next.js (App Router, TypeScript) Full-stack on Vercel + Neon PostgreSQL 16+ + Drizzle ORM + Job Scheduler (Vercel Cron / QStash or isolated worker).** | `FM-04`, `FM-05`, `FM-08`, `FM-09`, `FM-10`, `FM-11` |
| `DEC-12` | **Repository & domain strategy** | Brand-new Git repository named **`faithmap`** and a **dedicated new FaithMap domain** separate from Puntakit. | `FM-01`, `FM-04`, `FM-10`, `FM-11` |
| `DEC-13` | **Brand & visual assets** | Completely new FaithMap design system using a **typographic wordmark + clean placeholder icons in Phases 2–3**, swapped to final owner-provided SVG logo/icons before Phase 7 launch. | `FM-01`, `FM-07`, `FM-11` |
| `DEC-14` | **Legacy Puntakit cutover** | **100% clean-slate cutover:** After Phase 7 verification & clean onboarding, switch fully to FaithMap and archive/retire Puntakit completely. | `FM-01`, `FM-10`, `FM-11` |
| `DEC-15` | **Restricted report text (2026-11-15, owner Q-1, Q-4)** | `care_needs_notes` and `prayer_requests` of a weekly report are **Restricted Data** like `DEC-06`. Only the group's stewards (`group_leader`, assigned `care_leader`/`coordinator`), the `body_leader` of the group's Body and `admin`/`super_admin` read them. `mission_leader` (Pastor) does not. Server code removes them from the report list and detail for any other viewer. `not_held_reason` and `summary_notes` follow the same rule (`DEC-18`). | `FM-02`, `FM-06`, `FM-08` |
| `DEC-16` | **Meeting Brief carries no raw prayer text (2026-11-15, owner Q-2)** | The immutable Meeting Brief (`DEC-01`) stores only the **number of groups** that sent a prayer request (`section9GroupsWithPrayerRequests`). It never copies `prayer_requests` text. Reason: a brief cannot be edited after it is made. | `FM-02`, `FM-08` |
| `DEC-17` | **Team field point visibility (2026-11-15, owner Q-3, Q-8)** | Names and phones of team field points are visible to `admin`/`super_admin` (all points, raw phone, mapping), to the `body_leader` of the point's Body (masked phone), and to the coordinator account assigned to that point (own phone). No other role, a pastor too. Each point has `body_id` and `coordinator_user_id` (migration `0004`, both nullable). NULL matches nobody. The system never guesses a link. An admin sets the links (`assign_point`, audited). Gate: while one point has `body_id` NULL, no non-admin reads any point. A sync from the source list keeps the links. | `FM-02`, `FM-06` |
| `DEC-18` | **Restricted free text, count-only brief (2026-11-15, owner Q-5, Q-6, Q-7)** | `not_held_reason` and `summary_notes` are Restricted Data like `DEC-15`. A pastor sees the meeting status (held or not held) and the numbers, not the text. If a pastor needs a text summary later, propose a separate structured, sanitized summary. Do not show the free text with a form warning only. Meeting Brief section 8 shows only the number of open follow-ups. No follow-up title is stored in a brief. | `FM-02`, `FM-08` |
| `DEC-19` | **Body-scoped Meeting Brief (2026-11-15, owner Q-9)** | The stored brief is one immutable organization-wide record (version 2 adds one numeric slice per Body). The API builds the response for the caller: admin reads the whole record with group names; pastor reads organization-wide numbers only (no group names); Body Leader reads only the slice of the led Body. A person with several roles gets the union. Other users get 403. A brief made before version 2 has no slices: a Body Leader gets no numbers (fail closed). No stored brief is changed. | `FM-02`, `FM-08` |
| `DEC-20` | **Attendance statuses follow the PRD (2026-11-15, completion round)** | Attendance status is one of `present`, `absent`, `leave`, `online` (PRD FR-06.1). The older value `excused` meant `leave` and is converted by migration `0005`. Member attendance of a report is derived from the marks: `present` and `online` count (PRD section 4). A typed number cannot disagree with the marks. Reason: the approved PRD is authoritative over the older code value. | `FM-02`, `FM-04` |
| `DEC-21` | **Automatic follow-ups: interpretation of FR-06.4, FR-05.4, FR-09 (2026-11-15). PENDING OWNER CONFIRMATION (Q-11)** | A week counts as absent only when the group sent a submitted report, the meeting was held and the member is marked `absent`. A week without a report or without a meeting is unknown and breaks the streak (FR-06.3). 2 consecutive weeks: one item for the Group Leader. 3 or more: one more high priority item for the Supervisor, else the Body Leader. A first-time visitor with no visit in the next period gets one item if the group held a meeting that period. Each cause has a dedup key and never makes a second item. Titles name no person (DEC-06). An item is completed only with an outcome note. This creates fewer items than a looser reading, never more. | `FM-02`, `FM-06` |
| `DEC-22` | **Body management rule (2026-11-15). PENDING OWNER CONFIRMATION (Q-12)** | Only an admin creates, renames or changes the status of a Body. A Body is never deleted. A Body with an active group cannot be set to inactive or archived (FR-01.3): transfer the groups first. Reason: the PRD forbids deleting a Body with groups or reports, and an inactive Body would leave reports without an approver. | `FM-02` |
| `DEC-23` | **Report content fields and their visibility (2026-11-15). PENDING OWNER CONFIRMATION (Q-15)** | PRD FR-07.2 content is stored: teaching topic, scripture, activity flags (`prayer`, `fellowship`, `other`), meeting location, atmosphere, follow-up needs, next-week plan, support needed. A meeting that was not held stores none of them. Topic, scripture and activity flags are not personal data and follow the report. **Meeting location (an address) and the four free text fields are Restricted Data like `summary_notes` (`DEC-18`)**: stewards, the Body Leader and admins read them; a pastor does not. The PRD did not state a visibility rule; this is the conservative reading of `DEC-06` and `DEC-18` | `FM-02`, `FM-06` |

---

## 4. Open Pre-Build Operational Inputs (Non-Architectural)

While all architecture and business-rule decisions are locked, Phase 3 / Phase 6 / Phase 7 execution still requires provisioning credentials/assets from the Owner/Church at the corresponding gate:
1. **Phase 3:** GitHub organization access to create the `faithmap` repository, Vercel + Neon project provisioning, and LINE Login Channel ID/Secret (`DEC-03`).
2. **Phase 6:** LINE OA Messaging Channel & LIFF App registration credentials (`DEC-07`).
3. **Phase 7:** Final FaithMap SVG logo files (`DEC-13`), production domain DNS (`DEC-12`), and verified clean church roster for initial onboarding.


---

## 5. Open decisions (not approved; the code shows the interim behavior)

| ID | Question | Interim behavior in code | Options |
|---|---|---|---|
| **Q-10** | Who may be linked as coordinator of a team field point? (`DEC-17`) | **Strict.** The account must be usable (active, has a login method) and hold an active assignment in the point's Body. Access ends when that assignment ends. This is fail closed and was chosen by the engineer, not by the owner | S (current): strict. R: any usable account. The owner decides. Until then nobody gains access by this rule; only fewer accounts can be linked |
| **Q-11** | Confirm `DEC-21` (absence streak and visitor rules) | As `DEC-21` | Confirm, or give another rule (for example, count a week without a report as absent) |
| **Q-12** | Confirm `DEC-22` (Body status rule) | As `DEC-22` | Confirm, or allow inactive with active groups |
| **Q-13** | The PRD has two rules for a Blocked report. FR-08.5 says it resolves automatically when an eligible Body Leader exists. The Admin persona and CD-07 say an admin resolves it | **Manual.** An admin unblocks (`unblockReportByAdmin`). Nothing changes by itself | Keep manual, or add automatic unblock when a Body Leader is assigned or reactivated. Approval itself is never automatic (CD-08) |
| **Q-14** | PRD FR-12.1 names CSV, XLSX and PDF-printable exports | CSV only (scoped, audited) | Approve a dependency for XLSX, and decide the print layout for PDF |
| **Q-15** | Confirm `DEC-23` (visibility of the new report content fields) | As `DEC-23`: free text and location restricted from the pastor | Confirm, or open selected fields (for example the next-week plan) to the pastor |
| **Q-16** | PRD FR-02.2 and FR-07.2 name group and report photos | **Not implemented.** The system has no file storage. One URL column exists for a group photo; nothing uploads | Decide the storage (for example Vercel Blob), size limits, consent and who may see photos (faces are personal data) |
