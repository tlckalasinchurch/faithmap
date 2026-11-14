# FaithMap — UX & UI Specification

**Document ID:** `FM-07` · **Version:** `2.0` · **Date:** `2026-11-14` · **Status:** `Proposed — Pending GATE-2 Approval`  
**Product:** **FaithMap** (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`)

---

## 1. New Brand & Design Identity

FaithMap establishes a **brand-new visual system** independent of Puntakit—no inherited CSS tokens, icons, colors, or component styling:

- **Wordmark & Logo System (`DEC-13`):** Clean geometric typographic wordmark (`FaithMap` + `ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`) and clean placeholder icons in Phases 2–3, replaced seamlessly with owner-supplied SVG logo and PWA icon files before Phase 7 launch.
- **Color Tokens (Accessible Pastoral Palette):**
  - Primary Accent: Deep Sanctuary Teal / Slate Indigo (contrast >= 4.5:1 on light surfaces).
  - Surface Hierarchy: Warm Paper (`#FAF9F6`), Card White (`#FFFFFF`), Subtle Border (`#E4E2DC`), Primary Ink (`#1C242B`), Muted Ink (`#52606D`).
  - Semantic Status Tokens (icon + Thai text + color): `Not Submitted`, `Draft (ฉบับร่าง — ยังไม่ส่ง)`, `Activity Held / Approved`, `Confirmed Not Held`, `Needs Revision`, `Blocked`.
- **Thai-First Typography:** `IBM Plex Sans Thai` / `Noto Sans Thai` (`line-height: 1.6`); minimum `16px` desktop body and `18px` on elderly-facing mobile reporting screens.

---

## 2. Accessibility & Elderly-User Ergonomics

1. **Large Touch Targets:** All interactive controls are `>= 48px × 48px` with `>= 8px` spacing.
2. **One-Tap LINE Login Entry (`DEC-03`):** Mobile sign-in highlights a large green **"เข้าสู่ระบบด้วย LINE"** button for elderly Group Leaders, with a subtle secondary link **"เข้าสู่ระบบด้วยรหัสผ่าน / Passkey"** for desktop leaders and administrators.
3. **Guided 3-Step Reporting:** Plain Thai labels; zero complex charts on mobile leader views; explicit `"ปิดรับรายงานวันอาทิตย์ 20:00 น."` banner.
4. **Forgiving Autosave & Offline Clarity (`CD-01`):** Persistent status chip (`บันทึกอัตโนมัติแล้ว HH:MM — ยังไม่ส่ง` or `ออฟไลน์ — เก็บไว้ในเครื่องแล้ว`) with zero discarded input on network drops.
5. **Double-Tap Prevention & WCAG 2.1 AA:** Confirmation sheet before submit, `Idempotency-Key`, full keyboard focus rings, and `aria-live="polite"` status announcements.

---

## 3. Information Architecture & Role-Based Navigation

- **Mobile (Group Leader & Supervisor):** `หน้าหลัก (My Tasks)` · `กลุ่มของฉัน (My Groups)` · `แจ้งเตือน (In-App Inbox)`. *(Zero browser Web Push permission popups per `DEC-07`.)*
- **Desktop Sidebar (Body Leader, Mission Leadership, Admin):**
  - `ภาพรวมพันธกิจ (Overview)`
  - `ตรวจและอนุมัติรายงาน (Review & Approval Queue)`
  - `สรุปประชุมวันอาทิตย์ 20:30 น. (Meeting Brief)`
  - `บอดี้และกลุ่มพันธกิจ (Bodies & Groups)` — Body Leaders can manage `group_leader` / `care_leader` / `coordinator` assignments within their own Body (`DEC-09`).
  - `สมาชิก ผู้มาใหม่ และการติดตาม (People & Follow-Ups)` — PII fields hidden for `mission_leader` (`DEC-06`).
  - `ตั้งค่าและความปลอดภัย (Admin Only)` — Blocked queue, user management, audit logs.

---

## 4. Core User Journeys

### 4.1 Group Leader Weekly Report (3 Guided Steps on Mobile)
- **Step 1 — สถานะการประชุมและเช็คชื่อ:** Choose `มีการประชุม` vs `ไม่ได้ประชุม (งด/เลื่อน)`. Prefilled member roster (`มา`, `ขาด`, `ลา`, `ออนไลน์`) + Visitor form requiring explicit PDPA consent checkbox (`"ผู้มาใหม่ยินยอมให้เก็บเบอร์ติดต่อเพื่อการติดตาม"` per `DEC-10`) before phone input activates.
- **Step 2 — กิจกรรมและสิ่งที่ต้องติดตาม:** Meeting date/location/leader, topic, optional passage, activity flags, atmosphere, photo upload, follow-up needs, next-week plan.
- **Step 3 — ตรวจสอบและส่งรายงาน:** Plain-language summary + explicit **ยืนยันส่งรายงาน** button (notes if past Sunday `20:00` ICT).

### 4.2 Sequential Review, Non-Self Approval & Blocked UX
- **Sequential Gate (`DEC-04`):** When a group has an active usable Supervisor, Body Leader view clearly shows `"รอ Supervisor ตรวจก่อนอนุมัติ"` until Supervisor forwards it.
- **Non-Self Approval (`DEC-05`):** If the signed-in Body Leader was the report's submitter, the Approve button is disabled with clear explanation (`"ไม่สามารถอนุมัติรายงานที่ตนเองส่งได้ — ต้องให้หัวหน้าบอดี้อีกคนอนุมัติ"`).
- **Blocked Banner (`CD-07`):** Displays `"ติดขัด: ต้องให้ผู้ดูแลระบบตั้งค่าหัวหน้าบอดี้ที่มีบัญชีใช้งานได้และไม่ซ้ำกับผู้ส่งรายงาน"`.

---

## 5. PWA & LINE LIFF Considerations

- **Next.js App Router PWA:** Brand-new `manifest.webmanifest` (`FaithMap`), network-first HTML shell, versioned icon paths (`DEC-13`).
- **LIFF Compact Mode:** Suppresses redundant browser chrome inside LINE WebView while sharing the exact same 3-step reporting screens.
