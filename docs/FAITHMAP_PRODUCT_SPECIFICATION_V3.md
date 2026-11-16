# FaithMap — Product Specification V3
**Document ID:** FM-13 · **Version:** 3.0 · **Status:** Draft for Owner Review
**Product:** FaithMap — ระบบบริหารและขับเคลื่อนพันธกิจคริสตจักร
**Supersedes:** Product scope and requirements in FM-02 v2 where they conflict with this specification. Existing security and reporting decisions remain in force unless explicitly revised here.

## 1. Product direction

FaithMap is a Ministry Management & Growth Platform. It connects people, ministry groups, strategic goals, plans, weekly evidence, follow-up, and leadership decisions in one governed system.

**Product promise:** Help church leaders understand the real situation, decide what to do next, support groups that need help, and learn from ministry outcomes.

### Confirmed Product Decisions
| ID | Decision | Owner choice |
|---|---|---|
| PD-01 | Success measures | Measure both ministry activity/output and people/group growth; keep the measures distinct |
| PD-02 | Strategy ownership | Pastor sets strategic direction and primary goals; lower leaders propose operational plans and report progress |
| PD-03 | Responsibility assignment | Flexible assignment per scope/group; do not require every group to have every leadership layer |
| PD-04 | Legacy approach | Full replacement: new product/domain model and implementation; inspect legacy data and plan controlled migration, never destructive reuse |
| PD-05 | Photo reporting channels | Support both LINE LIFF form uploads and photos sent directly to LINE OA chat |
| PD-06 | Shared evidence pipeline | Both channels create media records in one FaithMap evidence service and private storage boundary; channel-specific ingestion only |

## 2. Product outcomes

1. Every leader can see the work and decisions relevant to their responsibility.
2. The Pastor can set organization-wide ministry goals and review aggregate progress.
3. Body/Care/Group leaders can turn goals into plans and accountable actions.
4. Weekly reporting is simple, recoverable, and supported by photos/evidence.
5. Reports and chat-submitted photos are traceable to a group and reporting period.
6. Exceptions become follow-up work with an owner and resolution outcome.
7. Historical reporting remains stable when organizational assignments change.

## 3. Product principles

- People before process; avoid turning ministry into paperwork.
- One source of truth for people, groups, assignments, goals, reports, and evidence.
- Role and scope determine what a person can see and do.
- Flexible delegation with explicit accountability.
- Activity/output and growth/outcome are separate measurement dimensions.
- Evidence is not automatically proof of a completed report or successful outcome.
- Privacy by default, especially for member/visitor identity and photos.
- Thai-first, mobile-first, accessible to older and less technical users.
- No automatic approval of reports or automatic claims of ministry success.

## 4. Personas and workspaces

| Persona | Primary workspace | Main jobs |
|---|---|---|
| Group responsible person / coordinator | My Ministry | Submit weekly report, attach photos, maintain group/member details, complete assigned follow-ups |
| Care Leader | Care Overview | Monitor assigned groups, review/coach, identify gaps, coordinate support |
| Body Leader | Body Overview | Review reports within Body, final approval under existing governance, manage delegated assignments, monitor plans |
| Pastor / Mission Leader | Ministry Direction | Set strategic goals, review organization-wide aggregate progress, decide priorities; no access to restricted personal/free-text data under existing DEC-06/15/18 |
| Admin / Super Admin | System Governance | Identity, configuration, assignment administration, security/audit, operational recovery |

A person may hold multiple active assignments. Workspace composition is derived from active role assignments and authorized scopes, not a single hard-coded role.

## 5. Product modules

### M1. Organization, People & Responsibility
- Manage organization, Bodies, Care groupings, house mission groups, members, visitors, and lifecycle.
- Support active-dated responsibility assignments with scope, effective dates, primary/secondary designation, and audited end reason.
- Allow a group to be managed by a Body Leader, Care Leader, coordinator, or another explicitly authorized person according to owner policy.
- Do not assume that a group must have a Care Leader or coordinator.
- Retain historical scope snapshots for past periods.

### M2. Strategy & Goals
- Pastor creates strategic priorities and organization-level goals with period, rationale, metric definition, target, and review cadence.
- Goals may be delegated to Bodies, Cares, or groups; delegated targets must reconcile to the parent goal or explicitly be marked as a contribution rather than additive allocation.
- Lower-level leaders propose action plans, milestones, and support needs; they do not silently rewrite the Pastor's approved goal.
- Track target, actual, variance, confidence/data completeness, and narrative context.
- Support quantitative and qualitative measures; do not collapse all ministry health into one score.

### M3. Ministry Plans & Tasks
- Convert approved goals into plans, milestones, tasks, owners, due dates, and status.
- Tasks can be assigned to a person or group with a clear scope.
- Status transitions are auditable; overdue or blocked work creates follow-up signals.
- A plan is not considered complete merely because its due date passed.

### M4. Weekly Ministry Reporting
- Weekly period is Monday–Sunday in Asia/Bangkok; existing Sunday 20:00 ICT deadline remains unless owner changes it.
- Draft autosave never submits.
- Report includes meeting held/not held, attendance and participation, visitors/new members, ministry activities, follow-up needs, next-week plan, and support needs subject to field-level privacy rules.
- Preserve existing sequential review and approval rules unless explicitly revised: assigned supervisor review where usable, then Body Leader final approval; fallback and self-approval restrictions remain.
- A photo-only submission does not complete a weekly report.

### M5. Photo & Evidence Reporting (LINE Dual Channel)

Two entry channels, one evidence domain.

**A. LINE LIFF**
1. User opens the FaithMap LIFF mini-app from the LINE OA rich menu or a supported LIFF entry point.
2. Server verifies the authenticated LINE identity and active assignments.
3. User selects or confirms the group and reporting week.
4. User completes the report and attaches one or more photos from camera/gallery.
5. UI shows previews, upload progress, retry, remove, and final confirmation.
6. Report submission and evidence linkage are persisted through the normal report workflow.

**B. LINE OA Chat**
1. User sends one or more image messages directly to the official LINE account.
2. LINE Messaging API sends a webhook event to FaithMap.
3. FaithMap verifies the webhook signature against the raw request body before processing.
4. The ingestion worker deduplicates the event/message, fetches the image binary from LINE using server-side credentials, validates it, and stores it in private object storage.
5. FaithMap resolves the sender through a previously linked LINE identity and active assignment(s).
6. If there is exactly one eligible group and one unambiguous current reporting context, attach the photo to a pending evidence bundle for that group/week.
7. If multiple groups, no active assignment, or ambiguous week/context exist, create an unassigned evidence inbox item and ask the sender to select/confirm the group and week through a LIFF link or supported chat interaction.
8. The image is never silently attached to an arbitrary group.

**Shared behavior**
- Both channels create the same MediaAsset and ReportEvidence domain records.
- Evidence can be pending, linked, rejected, quarantined, or deleted under retention policy.
- A user can see upload/ingestion status and retry safely.
- Multiple images are supported; exact count, per-file size, total request size, and retention period are operational configuration decisions pending capacity/security review.
- Preserve original binary only as required; generate safe thumbnails/derivatives asynchronously where supported.
- Store provider message IDs and event IDs for idempotency; do not use client filenames as identity.
- Chat images do not constitute a complete report. The user must complete/confirm the report in LIFF or another approved report UI.
- The UI labels evidence source (LIFF or LINE chat), sender, received time, group, and reporting period.

### M6. Follow-up & Support
- Create follow-ups from a report, review, plan, or explicit leader action.
- Every follow-up has owner, scope, reason/category, due date, status, and outcome note.
- Escalate unresolved needs to the next responsible leader without exposing restricted source text to unauthorized roles.
- Completion requires an outcome, not merely a status click.

### M7. Intelligence & Ministry Review
- Separate activity/output metrics (meetings held, attendance, visits, activities, reports, follow-ups) from growth/outcome metrics (member development, discipleship milestones, group continuity, goal progress).
- Show denominator, period, scope, data completeness, and freshness beside every metric.
- Missing report/unknown data must never be represented as zero or success.
- Pastor views organization-level aggregate metrics; Body/Care/Group views are scope-limited.
- Do not infer spiritual maturity or rank people/groups from a simplistic score.

### M8. Communication & Notifications
- In-app inbox and LINE OA messaging remain the supported notification channels; no Web Push unless separately approved.
- Notify about report deadlines, review results, blocked work, assigned tasks, and ambiguous/unassigned chat evidence.
- Avoid sending restricted report text or private member data in LINE notifications.

## 6. Core workflows

### W1. Strategy cascade
Pastor defines strategic goal → approves organization target → Body leaders propose contribution/plan → Care/group leaders propose tasks and owners → authorized leader reviews plan → execution → progress updates → periodic review and next-cycle adjustment.

### W2. Weekly report
Group responsible person creates draft → autosave → enters report and evidence → submits → assigned supervisor review (when available) → Body Leader final approval → report appears in authorized dashboards and immutable period summaries.

### W3. LINE chat photo intake
LINE image event → signature verification → deduplication → binary retrieval → validation/quarantine → private storage → sender/group resolution → pending evidence or unassigned inbox → confirmation/linkage → visible in report review.

### W4. Support escalation
Report/plan signal → follow-up assigned to responsible person → care/body escalation if overdue or blocked → support action → outcome note → close and feed into review.

## 7. Measurement model

Every KPI must define:
- metric_key, human-readable definition, dimension (activity/output or growth/outcome), unit, aggregation method, period, scope, numerator/denominator where relevant, source, missing-data rule, owner, and target.
- Target and actual are never mixed with forecasts.
- Organization goals may have child contributions. The system must prevent double counting when parent and child values are rolled up.
- Qualitative outcomes require structured rubric and evidence; they must not be converted to pseudo-precise numeric scores without owner approval.

## 8. Access, privacy and governance

- Default-deny server-side authorization on every read/write.
- Active role assignment and scope are checked at request time; client-supplied group IDs are not authorization.
- Existing DEC-06, DEC-10, DEC-15, DEC-16, DEC-17, DEC-18, and DEC-19 restrictions remain applicable unless superseded by an explicit owner decision.
- Photo access follows the linked report's scope and field-level policy; private storage only, short-lived authorized download URLs or authenticated proxy.
- Face images are personal data. The product must show a clear notice/purpose and establish an approved consent/legal basis and retention policy before production photo intake. Do not assume report-submission consent automatically authorizes public sharing or unrelated reuse.
- LINE webhook signature verification, replay/deduplication, secret rotation, rate limiting, malware/content validation, and audit events are mandatory.
- Never trust LINE display name, client-submitted user ID, filename, or message text as authorization proof.

## 9. Non-functional requirements

- Thai-first, mobile-first; body text >=16px, primary mobile form text >=18px, touch targets >=48x48px.
- WCAG 2.2 AA target for new experiences.
- Draft autosave with explicit saved/syncing/offline/error state.
- Idempotent report submission, image ingestion, and webhook handling.
- P95 API target <300ms for ordinary metadata requests; image transfer is measured separately.
- Uploads use streaming/multipart or direct-to-storage flow; do not route large binary payloads through serverless functions unnecessarily.
- Image upload and LINE webhook processing are asynchronous where appropriate.
- Logs must not contain raw image bytes, access tokens, secrets, or restricted personal content.
- Backups, object retention, deletion, and disaster recovery cover both database metadata and stored binaries.

## 10. Out of scope for this release
- Public social feed or public photo gallery.
- Facial recognition, face matching, or automatic identification.
- AI evaluation/ranking of people or spiritual growth.
- General-purpose chat/messaging between members.
- Finance/accounting, giving, and unrelated church administration modules.

## 11. Acceptance criteria

1. Pastor can create an organization-level goal and review aggregate progress.
2. A goal can be delegated to Body/Care/group scopes without double-counting.
3. Responsible people can be assigned flexibly with effective dates and audit history.
4. Weekly reports distinguish draft, submitted, review, revision, approved, and blocked states.
5. Users can attach multiple images from LIFF and see per-file status.
6. Users can send images to LINE OA chat and those images enter the same evidence pipeline.
7. Invalid webhook signatures are rejected; duplicate webhook events do not duplicate assets or links.
8. Ambiguous LINE senders/groups/weeks are held for confirmation, never guessed.
9. Photos are private and only retrievable by authorized users.
10. Photo-only messages do not mark reports submitted.
11. Activity/output and growth/outcome metrics remain distinct and show scope, period, and data completeness.
12. All core workflows are auditable and accessible on mobile.
