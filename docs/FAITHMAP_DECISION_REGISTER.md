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

---

## 4. Open Pre-Build Operational Inputs (Non-Architectural)

While all architecture and business-rule decisions are locked, Phase 3 / Phase 6 / Phase 7 execution still requires provisioning credentials/assets from the Owner/Church at the corresponding gate:
1. **Phase 3:** GitHub organization access to create the `faithmap` repository, Vercel + Neon project provisioning, and LINE Login Channel ID/Secret (`DEC-03`).
2. **Phase 6:** LINE OA Messaging Channel & LIFF App registration credentials (`DEC-07`).
3. **Phase 7:** Final FaithMap SVG logo files (`DEC-13`), production domain DNS (`DEC-12`), and verified clean church roster for initial onboarding.
