# FaithMap — Implementation Blueprint V3
**Document ID:** FM-14 · **Version:** 3.0 · **Status:** Draft for Architecture & Owner Approval
**Baseline inspected:** main at d528d3dfe718d080ed6d0dea442169a7c15b77fb (2026-11-16T16:19:54Z)
**Implementation branch:** product/ministry-management-v3-spec

## 1. Implementation mandate

Build a new FaithMap product aligned to Product Specification V3. This is a full replacement of the current application/domain implementation, not an incremental redesign of existing pages. Do not deploy, migrate production data, delete the old system, or change production infrastructure as part of this blueprint.

Retain useful business knowledge and owner-approved policies as requirements, not as a mandate to reuse old code/schema. Build new bounded contexts and a migration/cutover plan with reconciliation and rollback.

## 2. Evidence-based baseline audit

The following was inspected on the baseline branch:
- Product/governance docs: FAITHMAP_DECISION_REGISTER.md, FAITHMAP_PRD.md, FAITHMAP_DOMAIN_MODEL.md, FAITHMAP_SYSTEM_ARCHITECTURE.md, FAITHMAP_DATABASE_DESIGN.md, FAITHMAP_SECURITY_AND_PERMISSION_MODEL.md, FAITHMAP_API_CONTRACTS.md, FAITHMAP_UX_UI_SPECIFICATION.md, FAITHMAP_PHASED_IMPLEMENTATION_PLAN.md.
- Code: src/server/db/schema.ts, src/server/modules/authz/policy.ts, src/server/modules/cares/service.ts, src/server/modules/growth/service.ts, src/server/modules/insights/service.ts, src/components/LoginView.tsx, src/components/FaithMapApp.tsx, src/components/mini/MiniScreens.tsx, and governance UI components.

### 2.1 Existing capabilities/evidence
- Existing code has LINE Login/LIFF authentication adapter and a collapsed password fallback for admins (LoginView.tsx); this is authentication, not proof of LINE Messaging API photo ingestion.
- Existing mini experience has Home, Groups, Growth, and Notifications screens (MiniScreens.tsx).
- Existing schema includes organization/body/care/group structures, scoped assignments, member growth records, weekly reports, and reporting-related tables (src/server/db/schema.ts).
- Existing application has role-dependent navigation and tabs (FaithMapApp.tsx).
- Existing documents define weekly reporting Monday–Sunday in Asia/Bangkok, Sunday 20:00 deadline, sequential review/final approval, self-approval prohibition, and privacy restrictions.
- Existing PRD already mentions group/report photos, but Decision Register Q-16 says photo upload/storage is not implemented; schema has a group photo URL field but that is not a complete upload/evidence system.

### 2.2 Gaps and conflicts requiring V3
1. The current product is report/workspace-centric; it does not yet provide a full goal → plan → task → outcome operating loop.
2. Growth records are raw/member-centric and are not yet a governed dual-dimension KPI model (activity/output vs growth/outcome).
3. The approved Domain Model describes a flat Organization → Body → Group hierarchy and treats Care Leaders/Coordinators as group assignments, while code contains a cares table, house_mission_groups.care_id, care-scoped assignments, and Care services. This documentation/code mismatch must be reconciled before schema design. V3 must support the real owner-approved ministry structure without forcing every group to have every leadership layer.
4. Existing LINE Login/LIFF auth does not implement LINE OA chat webhook ingestion or message-image download.
5. No complete media storage, image metadata, evidence-link, deduplication, moderation/quarantine, or retention lifecycle was found in the inspected baseline.
6. Existing role navigation is UI gating; V3 must keep authorization server-enforced and scope-aware.
7. The previous UX audit identified role-inappropriate navigation, duplicate desktop/mobile navigation, small typography/touch targets, inconsistent dates, and misleading dashboard scope labels. V3 must treat these as design acceptance constraints, not as isolated cosmetic patches.

This is a source inspection, not a claim that all repository files or every runtime path were exhaustively tested. No production behavior, live LINE OA webhook, real storage provider, or live user flow was verified in this audit.

## 3. Target architecture

Use a modular monolith initially, with explicit bounded contexts and asynchronous workers for external/binary processing. Keep deployment topology simple until load justifies service extraction.

### 3.1 Bounded contexts
1. Identity & Access
2. Organization & Responsibility
3. Strategy & Goals
4. Plans & Tasks
5. Weekly Reporting & Review
6. Media & Evidence
7. Follow-up & Support
8. Analytics & Ministry Review
9. Notifications & LINE Integration
10. Audit & Compliance

### 3.2 Logical architecture

    Web / PWA / LINE LIFF
             | authenticated HTTPS
             v
    FaithMap App + API (modular monolith)
      | Identity & Authorization
      | Organization / Goals / Plans
      | Reports / Reviews
      | Media Evidence Service
      | Analytics / Follow-up
      | Notification Orchestrator
             |
             +------ PostgreSQL (domain metadata, state, audit, outbox)
             |
             +------ Private Object Storage (image binaries/derivatives)
             |
             +------ Job Queue / Worker
             |          | image validation/thumbnail
             |          | LINE message content retrieval
             |          | notification delivery
             |          | metric aggregation
             |
    LINE OA Messaging API
             |
             v
    Public Webhook endpoint
      verify X-Line-Signature over raw body
      persist event + dedupe
      enqueue processing

### 3.3 Technology decision handling
The existing baseline selected Next.js App Router, TypeScript, Vercel, Neon PostgreSQL, and Drizzle ORM. Re-evaluate this stack against V3 non-functional requirements, especially secure private object storage and asynchronous webhook/media processing. Do not silently change the stack. Record a short ADR before implementation. Keep the database and storage provider behind interfaces so provider changes do not leak into domain services.

## 4. Proposed domain model

### 4.1 Organization and assignment
- Organization, Body, Care, MinistryGroup
- Person, UserIdentity, GroupMembership
- ResponsibilityAssignment: person/user, role type, scope type/id, is_primary, effective_from/to, status, created_by, ended_reason, audit metadata.
- Assignment scope must support organization/body/care/group as required by approved governance.
- Do not infer group responsibility solely from hierarchy; query active assignments and explicit delegation.
- Preserve historical assignment snapshots for period/report interpretation.

**Open modeling gate:** Confirm whether Care is a required organizational node (Organization → Body → Care → Group) or an optional grouping under Body. Current docs and code disagree. The schema must support optional Care membership without requiring every group to belong to a Care until the owner confirms the rule.

### 4.2 Strategy, goals, plans
- StrategicGoal: owner scope, title, rationale, period, status, approval state.
- MetricDefinition: metric key, dimension (activity_output | growth_outcome), unit, aggregation, source, missing-data semantics.
- GoalTarget: goal, scope, target value, period, contribution mode (additive | contributory), approved_by.
- GoalProgress: actual, numerator/denominator, completeness, measured_at, source reference.
- ActionPlan, Milestone, Task, TaskAssignment.
- Use explicit contribution rules to prevent parent/child double-counting.

### 4.3 Reporting and review
- ReportingPeriod, PeriodGroupSnapshot, WeeklyReport, AttendanceMark, ReportReview, ReportTransition.
- Maintain draft autosave/versioning, idempotent submission, sequential review, non-self-approval, and blocked states.
- Keep restricted free text and PII in separately authorized fields or DTO projections.

### 4.4 Media and evidence
- MediaAsset: id, storage_key, provider, content_type_detected, byte_size, checksum_sha256, width, height, processing_status, scan_status, created_at, created_by_identity, retention_state.
- MediaSource: media_asset_id, channel (liff | line_chat), line_message_id nullable, line_webhook_event_id nullable, source_actor_id, received_at, idempotency_key.
- ReportEvidence: media_asset_id, report_id nullable, group_id nullable, reporting_period_id nullable, link_status (pending | linked | needs_confirmation | rejected | quarantined), linked_by, linked_at, consent_basis_ref.
- LineWebhookEvent: provider_event_id, webhook_delivery_context, signature_verified, received_at, processing_status, retry_count, error_code; unique dedupe key.
- PendingEvidenceContext: sender identity, candidate groups, reporting period, expiry, confirmation state.
- Do not store public object URLs as permanent authorization. Store opaque object keys and issue short-lived authorized access.
- Store LINE message IDs/event IDs uniquely to make webhook retries safe.
- Avoid retaining LINE access tokens or webhook secrets in event rows/logs.

### 4.5 Follow-up and audit
- FollowUp, FollowUpEvent, AuditEvent, OutboxEvent.
- Follow-up completion requires an outcome note.
- Audit security-sensitive changes, assignment changes, goal approval, report transitions, evidence linkage/deletion, exports, and access to sensitive media where appropriate.

## 5. LINE dual-channel technical flow

### 5.1 LIFF upload
1. LIFF obtains/uses the authenticated session established by the existing LINE Login/OIDC flow; backend verifies session and linked LINE identity.
2. Client requests an upload intent for an authorized draft/report.
3. Backend validates scope, file count/size/type policy, and issues a short-lived upload capability for a private object.
4. Client uploads binary directly to storage where supported; otherwise streams through a dedicated upload endpoint with strict limits.
5. Backend finalizes upload, computes/validates checksum and detected MIME, queues malware/content scanning and thumbnail generation.
6. Create MediaAsset and ReportEvidence; link only to a draft/report the actor may edit.
7. Report submit endpoint validates required fields and evidence state, then performs idempotent workflow transition.

### 5.2 LINE OA chat ingestion
1. Expose a dedicated HTTPS webhook route for LINE Messaging API.
2. Verify X-Line-Signature using HMAC-SHA256 over the exact raw request body and channel secret; reject invalid signatures before business processing.
3. Persist the event and unique message/event identifier, then acknowledge quickly. Do not download image binaries synchronously inside the webhook request.
4. Worker retrieves image content from LINE Messaging API using server-side channel credentials.
5. Validate allowed message type, detected MIME, size, checksum, image decode, and malware/content scan; quarantine invalid/unsupported content.
6. Resolve LINE user identity only through the verified linked identity table. A LINE sender ID is not a group authorization.
7. Determine eligible groups from active ResponsibilityAssignments. If one unambiguous group/context exists, create pending evidence for that group and current period; otherwise request confirmation through LIFF/LINE interaction and place it in an unassigned evidence inbox.
8. On confirmation, re-check active assignment and report scope, then link to draft/report.
9. Acknowledge status to sender without exposing another group's information.

### 5.3 Reliability and concurrency
- Webhook event handling is at-least-once; make all handlers idempotent.
- Unique constraint on provider + webhook event/message ID.
- Worker uses lease/claim with bounded retries and dead-letter/quarantine state.
- Do not process the same message twice even if LINE retries webhook delivery.
- Use report version/optimistic locking when attaching evidence to a draft.
- Prevent concurrent duplicate uploads by checksum + actor + target context policy; checksum alone must not merge evidence across different consent/ownership contexts.
- Use transactional outbox for post-commit notifications and downstream processing.
- Never mark a report submitted based on an image webhook alone.

## 6. API contract outline

### Media / LIFF
- POST /api/v1/media/upload-intents — authorize target + return upload intent.
- POST /api/v1/media/{mediaId}/complete — finalize and validate uploaded object.
- DELETE /api/v1/media/{mediaId} — remove pending/unlinked media if authorized and retention policy permits.
- GET /api/v1/reports/{reportId}/evidence — authorized evidence metadata and short-lived viewing URLs.
- POST /api/v1/reports/{reportId}/evidence — link eligible media to report with idempotency key.

### LINE Messaging
- POST /api/v1/integrations/line/webhook — signature-verified webhook intake; persist/dedupe/enqueue only.
- POST /api/v1/integrations/line/evidence/{evidenceId}/confirm — confirm group/week from authenticated LIFF session.
- GET /api/v1/integrations/line/evidence/inbox — authorized pending/unassigned evidence queue.

### Strategy and plans
- POST /api/v1/goals, PATCH /api/v1/goals/{id}, POST /api/v1/goals/{id}/approve
- POST /api/v1/goals/{id}/targets
- POST /api/v1/plans, POST /api/v1/plans/{id}/tasks
- PATCH /api/v1/tasks/{id}, POST /api/v1/tasks/{id}/complete
- All routes enforce role + scope + state + optimistic concurrency on the server.

Endpoint names are proposed contracts, not implemented routes. Generate final OpenAPI/Zod definitions only after domain/API review.

## 7. Storage and operational policy

- Choose a private object-storage provider through ADR; compare Vercel Blob private access, S3-compatible storage, and operational fit before locking.
- No public bucket or guessable permanent URL.
- Configure max image count, per-image bytes, aggregate bytes, accepted formats, retention period, derivative policy, and deletion workflow as deployment settings after capacity and legal review.
- Initial allowlist should be conservative (JPEG, PNG, WebP); reject SVG and arbitrary documents in photo intake unless a separate requirement is approved.
- Verify actual bytes and decode, not only extension or client MIME.
- Strip GPS/EXIF metadata from derivatives by default; preserve original only if a documented operational need and consent/legal basis exist.
- Generate thumbnails asynchronously; never block webhook acknowledgement on image processing.
- Storage and database writes require reconciliation jobs for orphan objects and missing objects.
- Back up metadata and define object versioning/retention recovery.

## 8. Security and privacy gates

- Verify LINE webhook signature over raw bytes; rotate channel secret and access token.
- Rate-limit webhook and upload endpoints; protect against oversized payloads, decompression bombs, malformed images, and content-type spoofing.
- Encrypt in transit and at rest; use least-privilege storage credentials.
- Signed view URLs must be short-lived and issued only after authorization.
- Enforce existing PII and restricted report field policies. Pastor-level aggregate visibility does not imply access to member faces or restricted evidence.
- Establish clear notice and consent/legal basis for identifiable photos, including visitors/minors; provide correction/removal and retention handling.
- Audit upload, view, download, link, unlink, quarantine, and deletion.
- Do not expose LINE user IDs, storage keys, or signed URLs in analytics/logs.

## 9. Implementation phases and gates

### Phase 0 — Reconcile and approve product/domain
Deliver: approved V3 Product Specification, resolve Care structural ambiguity, confirm metric definitions/goal cascade, approve photo consent and retention principles, approve storage ADR.
Exit: no unresolved blocker affecting schema or privacy.

### Phase 1 — Domain and architecture foundation
Deliver: updated Domain Model, ERD, ADRs, threat model, permission matrix, API/OpenAPI contracts, migration/cutover plan.
Exit: architecture review and owner approval.

### Phase 2 — Identity, organization, assignments
Deliver: auth/session, LINE identity link, Organization/Body/Care/Group, flexible active-dated assignments, admin governance, audit.
Exit: authorization matrix tests for single and multiple assignments.

### Phase 3 — Strategy, goals, plans and tasks
Deliver: Pastor goal creation/approval, scoped targets, plan proposals, milestones/tasks, progress definitions.
Exit: no double-counting tests; scope and role tests pass.

### Phase 4 — Reporting and evidence foundation
Deliver: reporting periods, draft autosave, report form, review/approval workflow, private media service, LIFF multi-image upload.
Exit: offline/retry/idempotency and privacy tests pass.

### Phase 5 — LINE OA chat photo intake
Deliver: webhook signature verification, event dedupe, queue/worker, image retrieval, validation/quarantine, identity/group resolution, confirmation flow, shared evidence inbox.
Exit: replay, duplicate, ambiguous group, invalid signature, and worker retry tests pass.

### Phase 6 — Follow-up, analytics, notifications
Deliver: follow-up lifecycle, support escalation, separate activity/growth dashboards, LINE OA notifications, scheduled aggregation.
Exit: metric reconciliation and role-scoped data tests pass.

### Phase 7 — Migration, pilot and cutover
Deliver: source data inventory, mapping, cleansing, dry-run, reconciliation report, user onboarding, parallel verification, rollback plan, production readiness.
Exit: explicit owner approval. Do not retire old production service until data and user acceptance gates pass.

## 10. Test strategy and acceptance evidence

- Unit: domain rules, goal cascade, metric aggregation, assignment resolution, MIME detection, checksum, state machines.
- Integration: DB constraints, transactional outbox, storage adapter, LINE API client, webhook signature, worker retries.
- Security: unauthorized scope, PII/photo access, forged webhook, replay, upload abuse, signed URL expiry, IDOR.
- Contract: Zod/OpenAPI, LIFF API, webhook payload fixtures, LINE message content retrieval.
- E2E: leader LIFF report with multiple images; chat image intake with unique group; ambiguous multi-group confirmation; supervisor/body review; Pastor aggregate dashboard.
- Accessibility: keyboard/screen reader labels, 48px targets, Thai typography, mobile 360–390px.
- Migration: source-to-target counts, rejected rows, duplicate review, photo link reconciliation, rollback rehearsal.
- Evidence must include commands, environment, commit SHA, pass/fail counts, and artifacts. Never claim a test passed unless executed.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| LINE sender belongs to multiple groups | Require explicit confirmation; never guess |
| Webhook retries create duplicate evidence | Unique event/message key + idempotent worker |
| Photo privacy/consent unclear | Block production intake until policy/notice/retention approved |
| Storage provider cannot support private delivery | ADR and proof-of-concept before schema/API lock |
| Goal roll-up double-counts child targets | Explicit additive/contributory semantics and reconciliation tests |
| Existing Care docs/code disagree | Resolve organizational semantics before migration/schema |
| New scope becomes too broad | Gate modules; deliver operational/reporting foundation before analytics expansion |
| Full replacement loses historical context | Inventory, mapping, dry-run, reconciliation, rollback; no destructive cutover |

## 12. Definition of Ready for implementation

No feature implementation begins until:
- Product Specification V3 is approved.
- Care organizational semantics are confirmed.
- Goal/metric catalog and roll-up rules are defined.
- Assignment scope and delegation policy are approved.
- Photo consent, retention, access, and storage provider ADR are approved.
- Domain model, ERD, permission matrix, API contracts, and threat model are reviewed.
- Acceptance tests are written for critical workflows.
