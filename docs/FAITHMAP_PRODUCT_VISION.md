# FaithMap — Product Vision

**Document ID:** `FM-01` · **Version:** `2.0` · **Date:** `2026-11-14` · **Status:** `Approved Baseline (GATE-0)`  
**Product Name:** **FaithMap** · **Thai Name:** **ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน**  
**Strategic Mode:** **Option C — Clean Slate / 100% Full Replacement**

---

## 1. Executive Vision Statement

FaithMap is a brand-new, greenfield church mission management and weekly house-mission reporting platform built from the ground up to give church leadership an accurate, real-time, and compassionate view of every house mission group, member, visitor, and follow-up commitment—while making weekly reporting effortless for elderly and non-technical group leaders on mobile devices and LINE.

FaithMap is **not** a rebrand, fork, modernization, or database migration of Puntakit. It is an independent product with its own repository (`faithmap`), Next.js + Neon PostgreSQL architecture, LINE Login / Passkey authentication, scoped authorization, brand identity, user experience, and dedicated production domain.

---

## 2. Core Problem Statement

Church mission work happens in homes every week, yet leadership lacks a reliable, single source of truth that answers four essential questions each week:

1. **Who is responsible?** Which person currently leads, supervises, or coordinates each house mission group—including temporary coverage and historical changes?
2. **What happened this week?** Did each expected group meet, confirm "not held", submit late (after Sunday `20:00` ICT), or miss reporting altogether (distinguishing an unsubmitted draft from a submitted report)?
3. **Who needs pastoral care?** Which members missed two or more consecutive weeks, which first-time visitors have not returned, and which follow-up tasks remain open without an owner?
4. **Where is workflow stalled?** Which submitted reports are awaiting supervisor review, returned for revision, awaiting final Body Leader approval, or **Blocked** because a Body has no usable non-conflicting Body Leader account?

---

## 3. Clean-Slate Policy & Legacy Exclusion

Per Owner Decision **CD-09 (Option C — Clean Slate / 100% Full Replacement)** and **DEC-14 (100% Clean-Slate Cutover)**:

| Excluded Legacy Asset | Policy in FaithMap |
|---|---|
| Puntakit Source Code (Frontend & Backend) | **Excluded.** Zero files copied, forked, imported, or adapted. |
| Puntakit Database & Schema | **Excluded.** FaithMap starts with a brand-new, empty Neon PostgreSQL database. |
| Puntakit Production Data, Users, & Members | **Excluded.** No automated data migration. All initial users, bodies, groups, and members enter via approved FaithMap workflows. |
| Puntakit Auth, PINs, Roles, & Internal IDs | **Excluded.** New LINE Login + Password/Passkey authentication and RBAC+scope authorization systems. |
| Puntakit Business Logic & Deployment Config | **Excluded.** Fresh domain services, fresh CI/CD, fresh Vercel + Neon hosting, and dedicated domain. |

Existing Puntakit requirements and confirmed church business rules are retained strictly as **domain knowledge**, never as inherited code or schema. Upon FaithMap launch (`DEC-14`), Puntakit is retired completely and archived separately as a read-only historical reference.

---

## 4. Target Product Identity

| Identity Dimension | FaithMap Specification |
|---|---|
| **English Product Name** | **FaithMap** |
| **Thai Product Name** | **ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน** |
| **Brand Personality** | Trustworthy, warm, calm, pastoral, clear—designed for multi-generational church leaders rather than enterprise IT specialists. |
| **Visual & Brand System** | Completely new typographic wordmark and clean icon set in Phases 2–3, upgraded to final owner-supplied SVG logo/icons before Phase 7 launch (`DEC-13`). Zero Puntakit visual inheritance. |
| **Digital Channels** | Next.js Responsive Web Application + Installable PWA + **LINE Login / LIFF** (primary sign-in from Phase 3; full LIFF workflows & LINE OA reminders in Phase 6). No Web Push (`DEC-07`). |
| **Repository & Domain** | Dedicated Git repository (`faithmap`) and dedicated FaithMap domain (`DEC-12`), fully decoupled from Puntakit URLs. |

---

## 5. Target Users & Value Proposition

| Persona | Primary Context | Core Value Delivered by FaithMap |
|---|---|---|
| **Group Leader (`ผู้รับผิดชอบกลุ่ม`)** | Often elderly or non-technical; LINE & smartphone user | One-tap LINE Login (`DEC-03`), prefilled group & member roster, large Thai text, 48px+ touch targets, automatic draft saving (never lost, never prematurely submitted), and 3-step Sunday report submission before `20:00` ICT. |
| **Assigned Supervisor — Care Leader / Coordinator (`หัวหน้าแคร์ / ผู้ประสานงาน`)** | Mobile or desktop; oversees 1–N assigned groups | Focused inbox of assigned group reports, sequential review before Body Leader approval (`DEC-04`), revision request with reason, and absentee/visitor follow-up visibility. |
| **Body Leader (`หัวหน้าบอดี้`)** | Desktop or tablet/mobile; oversees one Body | Body-scoped operational command view, supervisor fallback handling, sole final approval authority (`CD-02`), Body-scoped assignment management (`DEC-09`), and weekly Body summary readiness. |
| **Mission Leadership (`หัวหน้าทีม ศบ.`)** | Desktop; weekly leadership meetings | Organization-wide overview across all Bodies, immutable Sunday `20:30` ICT Meeting Brief (10 sections), late/missing/blocked visibility, and follow-up accountability—without overriding Body Leader approval or reading restricted PII (`DEC-06`). |
| **System Administrator (`ผู้ดูแลระบบ`)** | Desktop; governance & operations | User lifecycle, role/assignment governance, Blocked-workflow intervention alerts, audit log inspection, and backup/restore verification. |

---

## 6. Organizational Philosophy

FaithMap models church mission structure around **flexible people assignments**, not rigid multi-tier organizational trees:

```text
Church / Mission Leadership (Oversight across all Bodies)
  └── Body (บอดี้) — Final approval boundary; led by Body Leader(s)
        └── House Mission Group (กลุ่มพันธกิจบ้าน) — Weekly reporting unit
              ├── Group Leader assignment(s)
              ├── Supervisor assignment(s): Care Leader or Coordinator (0..N, optional primary)
              └── Members & Visitors
```

- **No third organizational level:** Care Leader and Coordinator are **responsibilities assigned to people** on specific groups with start/end dates and full audit history—not sub-containers between Body and Group.

---

## 7. Product Scope & Non-Goals

### 7.1 In Scope (Phases 0–7)
- Organization, Body, and House Mission Group management (with map coordinates, schedule, photos, and Body transfer history).
- Time-bounded Group Assignments (Group Leader, Care Leader, Coordinator, Body Leader) with full history.
- Clean-slate User & Member management (LINE Login + Password/Passkey) and PDPA-consented Visitor registration/tracking.
- Group-scoped Attendance recording (`present`, `absent`, `leave`, `online`) and consecutive-absence detection.
- Weekly Mission Reporting (`Monday–Sunday`, deadline `Sunday 20:00 ICT`) with server-synced Draft Autosave, explicit Submission, sequential Supervisor Review, Revision Request loop, non-self Body Leader Final Approval, and **Blocked** workflow alerting.
- Follow-up action tracking (manual, absentee-triggered, and non-returning visitor-triggered).
- Immutable Sunday `20:30` ICT Meeting Brief and Mission Leadership Analytics Dashboard.
- Notifications (In-App Inbox + LINE OA Messaging; no Web Push) and scoped Export.
- LINE Login (Phase 3) and LIFF / LINE OA Messaging Integration (Phase 6).

### 7.2 Explicit Non-Goals
- Social networking, group chat, or public community feeds.
- Church financial accounting, tithes, or donation processing.
- Scoring or quantifying personal spiritual maturity/faith.
- Replacing the church's public marketing website.
- Web Push / VAPID browser notifications (`DEC-07`).
- Automatic account creation for visitors without consent and confirmation (`DEC-10`).
- Automated migration or synchronization with Puntakit databases (`CD-09`).
