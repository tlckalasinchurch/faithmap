# FaithMap — Decision Register

**Document ID:** FM-12 · **Version:** 3.0 · **Date:** 2026-11-17 · **Status:** V2 baseline retained; V3 product decisions added
**Product:** FaithMap (ระบบบริหารและขับเคลื่อนพันธกิจคริสตจักร)

---

## 1. Governance summary

The decisions below preserve previously confirmed security, reporting, privacy, and operational rules unless a later owner decision explicitly supersedes them. Product V3 is a full replacement of the current application/domain implementation. It does not authorize destructive deletion of historical data or production services. Data migration and cutover require separate verification and owner approval.

## 2. Confirmed V3 Product Decisions (2026-11-17)

| ID | Decision | Confirmed owner choice | Product impact |
|---|---|---|---|
| PD-01 | Ministry success measures | Measure both activity/output and people/group growth/outcomes as distinct dimensions | Metric catalog, goals, analytics |
| PD-02 | Strategic goal ownership | Pastor sets strategic direction and primary goals | Strategy, goal approval, governance |
| PD-03 | Responsibility assignment | Flexible responsibility assignment by scope/group; no mandatory leadership layer for every group | Organization, authorization, routing |
| PD-04 | Legacy approach | Full replacement of the old product implementation; inspect and plan migration, do not reuse old code/schema by default or destroy source data | Architecture, cutover |
| PD-05 | Photo reporting channels | Support both LINE LIFF uploads and direct image messages to LINE OA chat | Reporting, LINE integration, media |
| PD-06 | Shared photo evidence | Both channels feed one FaithMap media/evidence pipeline and shared private storage boundary | Media domain, evidence, audit |

## 3. Existing locked business/security decisions retained

The previously approved CD-01–CD-10 and DEC-01–DEC-20 remain in force unless they conflict with a later explicit owner decision. In particular:
- Draft autosave never submits a report.
- Weekly reporting period is Monday–Sunday, Asia/Bangkok; Sunday 20:00 ICT deadline and 20:30 meeting brief remain.
- Body Leader remains final approver under the existing sequential review, fallback, and non-self-approval rules.
- Default-deny, scope-aware authorization and existing PII/restricted-text rules remain.
- Visitor contact details require explicit consent.
- In-app inbox and LINE OA messaging remain the approved notification channels.
- Full replacement does not authorize immediate production cutover.

## 4. Supersession and reconciliation notes

1. V3 supersedes V2 product scope where V2 is limited to weekly reporting and current workspace tabs.
2. V3 adds Strategy & Goals, Plans & Tasks, Follow-up & Support, dual-dimension analytics, and dual-channel photo evidence.
3. V2 Domain Model says Organization → Body → House Mission Group and describes Care Leaders/Coordinators as group assignments. The inspected code contains a cares table, house_mission_groups.care_id, care-scoped assignments, and Care services. This docs/code mismatch must be resolved in the V3 domain gate. Flexible assignment is confirmed; whether Care is a required or optional structural node remains open.
4. V2 PRD mentions photos, but Q-16 in the previous register states that a complete upload/storage workflow is not implemented. PD-05/PD-06 decide the channels and common evidence architecture, but do not yet approve exact file limits, retention period, consent wording, or storage vendor.
5. The prior Q-16 is partially resolved: channel scope and common evidence architecture are confirmed. The operational policy and provider selection remain open for Phase 0/1 ADR approval.

## 5. Open decisions and required inputs

| ID | Question | Required before |
|---|---|---|
| V3-Q01 | Is Care a required node under Body, or an optional grouping? | Domain model / schema |
| V3-Q02 | Approve canonical metric catalog, goal contribution rules, and target periods | Strategy implementation |
| V3-Q03 | Confirm exact role/scope combinations that may create, delegate, review, and complete plans/tasks | Permission matrix |
| V3-Q04 | Approve photo consent/notice, visitor/minor handling, retention period, deletion request process | Production photo intake |
| V3-Q05 | Select private object-storage provider and configure image count/size/format limits | Media implementation |
| V3-Q06 | Define chat photo context behavior when sender has multiple groups or sends images outside a reporting period | LINE chat UX |
| V3-Q07 | Confirm whether LINE OA chat should accept only photos or also captions/text as report fields | LINE chat UX |
| V3-Q08 | Confirm rollout/pilot scope and historical data migration policy | Cutover |

## 6. Decision governance

- New decisions require an ID, owner confirmation, date, rationale, and impacted documents.
- Engineering assumptions must be labeled as proposals, not owner decisions.
- A product decision does not imply production deployment or data migration approval.
- No destructive action or cutover without a reviewed runbook and explicit owner approval.
