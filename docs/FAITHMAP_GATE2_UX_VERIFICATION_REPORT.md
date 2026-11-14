# FaithMap — GATE-2 UX Verification & Review Report

**Date:** `2026-11-14` · **Product:** **FaithMap** (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`) · **Scope:** จังหวัดกาฬสินธุ์ · **Mode:** Option C — Clean Slate (100% Full Replacement)  
**Interactive Prototype:** [FAITHMAP_GATE2_PROTOTYPE.html](../prototype/FAITHMAP_GATE2_PROTOTYPE.html)

---

## 1. Phase A — Document Audit & Resolution Summary

- **Documents Audited (12/12):** `FAITHMAP_DECISION_REGISTER.md`, `FAITHMAP_PRODUCT_VISION.md`, `FAITHMAP_PRD.md`, `FAITHMAP_DOMAIN_MODEL.md`, `FAITHMAP_SYSTEM_ARCHITECTURE.md`, `FAITHMAP_DATABASE_DESIGN.md`, `FAITHMAP_SECURITY_AND_PERMISSION_MODEL.md`, `FAITHMAP_API_CONTRACTS.md`, `FAITHMAP_UX_UI_SPECIFICATION.md`, `FAITHMAP_TEST_STRATEGY.md`, `FAITHMAP_DEPLOYMENT_AND_OPERATIONS.md`, `FAITHMAP_PHASED_IMPLEMENTATION_PLAN.md`.
- **Decisions Checked:** `CD-01`–`CD-10` and `DEC-01`–`DEC-14`.
- **Conflict Identified & Resolved Before Prototyping:**
  1. **Role Label & `DEC-06` PII Alignment:** In `FM-02` / `FM-06` / `FM-12`, `mission_leader` (`หัวหน้าทีม ศบ.`) denoted the top-level **Pastor** role (PII masked), while the weekly report submitter was `group_leader` (`ผู้รับผิดชอบกลุ่ม`). The GATE-2 brief labeled the Pastor role `ศิษยาภิบาล (Pastor)` and the group reporter `ผู้รับผิดชอบกลุ่มพันธกิจบ้าน (Mission Leader)`. The Owner confirmed (`2026-11-14`): **ศิษยาภิบาล (Pastor)** has PII restricted (`DEC-06`), while **ผู้รับผิดชอบกลุ่มพันธกิจบ้าน** retains member contact visibility strictly within their own group for pastoral follow-up.
  2. **Coordinator (`ผู้ประสานงาน`) Behavior:** Owner confirmed that a Coordinator can submit reports or perform supervisor review depending on their assigned responsibility on that group.
  3. **Touch Target Baseline:** `FM-07` specifies `>= 48px` while GATE-2 brief specifies `>= 44px`; the prototype implements `>= 48px` primary interactive buttons (satisfying both).

---

## 2. Phase B — UX Architecture & Screen Hierarchy

- **Navigation Strategy:**
  - **Mobile (`<= 820px` / Mobile Preview):** Sticky clean header (`FaithMap DEMO` + Inbox badge) + 3-button bottom bar (`52px` height) tailored per role.
  - **Desktop (`> 820px`):** Dedicated left sidebar (`268px`) tailored per role + header Notification Inbox trigger.
- **Screen Map Implemented (Screens A–G):**
  1. **A. Authentication:** `LINE Login (หลัก)`, `LINE LIFF Entry`, `Password / Passkey Fallback` (explicitly no legacy PIN), `Login Error`, `Session Expired`.
  2. **B. ผู้รับผิดชอบกลุ่ม / ผู้ประสานงาน (`Mission/Group Leader` Mobile Report):**
     - Supports 4 distinct group setups: (1) Normal with Supervisor (`กลุ่มบ้านโนนทัน`), (2) No Supervisor Fallback (`กลุ่มบ้านหนองกุง`), (3) Coordinator acting for leader (`กลุ่มบ้านห้วยสีทน`, starting in `needs_revision`), (4) Body without usable Body Leader (`กลุ่มบ้านยางตลาด`).
     - Step 1 (`การเข้าร่วม` + `มีการประชุม / ไม่ได้ประชุม` + PDPA consent-gated visitor form) → Step 2 (`กิจกรรมพันธกิจ` + Autosave status chip) → Step 3 (`ตรวจสอบและส่ง` + validation + post-`20:00` late simulation + success view).
  3. **C. หัวหน้าแคร์ / ผู้ประสานงาน (`Supervisor Review`):** Draft isolation (`draft` renders as `ยังไม่ส่งรายงาน`), report inspection, `ส่งกลับเพื่อแก้ไข` (mandatory reason), `รับรองการตรวจสอบ` (unlocks Body Leader approval per `DEC-04`).
  4. **D. หัวหน้าบอดี้ (`Body Leader`):** Body KPIs (`PeriodGroupSnapshot`), sequential approval lock (`DEC-04`), non-self-approval lock (`DEC-05` on `กลุ่มบ้านบึงวิชัย`), direct fallback approval (`กลุ่มบ้านหนองกุง` `CD-03`), and Body-scoped Assignment Management (`DEC-09`).
  5. **E. ศิษยาภิบาล (`Pastor Dashboard & Meeting Brief`):** Cross-Body Kalasin KPIs (draft counted as Missing, never Submitted), masked PII column (`DEC-06`), and 10-section immutable Sunday `20:30` ICT Meeting Brief (`DEC-01`) + PDF DEMO export feedback.
  6. **F. Admin:** User/role table (zero PIN), Blocked Queue resolution (interactive assignment of usable Body Leader / Co-Body Leader to unblock `grp-4` & `grp-5`), Org/Group overview, Locked DEC settings, and live append-only Audit Log.
  7. **G. Notification Inbox:** Available across every signed-in role with `All / Unread` filter, read/unread toggle, detail card, and LINE OA delivery status badge (zero Web Push).

---

## 3. Phase C — Demo Dataset Summary (`100% DEMO`)

- **Bodies (2 DEMO):** `บอดี้ กาฬสินธุ์เหนือ (DEMO)`, `บอดี้ กาฬสินธุ์ใต้ (DEMO — ไม่มีหัวหน้าบอดี้ที่ใช้งานได้)`.
- **Groups (5 DEMO):** `กลุ่มบ้านโนนทัน`, `กลุ่มบ้านหนองกุง` (No Supervisor), `กลุ่มบ้านห้วยสีทน` (Coordinator + Revision Requested), `กลุ่มบ้านบึงวิชัย` (Submitted by sole Body Leader — tests `DEC-05` self-approval block), `กลุ่มบ้านยางตลาด` (No Body Leader — tests `CD-07` block).
- All names, phone numbers (`081-000-xxxx (DEMO)`), and events are synthetic `DEMO` data with zero connection to Puntakit or production databases.

---

## 4. Phase D — UX Verification Results (Observed Checks Only)

| Verification Area | Method Observed | Result |
|---|---|---|
| **JS Execution & All Views (`64` render combinations)** | Executed [verify_proto.mjs](../prototype/verify_proto.mjs) in Node.js across all 6 role views × all tabs × all 4 UI states (`normal`, `loading`, `empty`, `error`) | **PASS** (`0` runtime errors, `0` empty screens, `0` `undefined`/`NaN`/`${` leaks) |
| **End-to-End Report Workflow (`Submit -> Supervisor Pass -> Body Leader Approve`)** | Scripted state transition test in `verify_proto.mjs` on `grp-1` | **PASS** (`submitted` → `supervisorReviewedAt` set → `approved`) |
| **Blocked Resolution (`DEC-05` / `CD-07`)** | Scripted `resolveBlocked('body-north')` test in `verify_proto.mjs` on `grp-4` | **PASS** (`isBlocked` cleared while original submitter `usr-prayut` remains blocked from self-approving) |
| **Handler Integrity & Dead Buttons** | Inspected all `onclick`/`onchange`/`oninput` bindings across `FAITHMAP_GATE2_PROTOTYPE.html` (fixed 1 local `rep.` reference on line 1210 during check) | **PASS** (`0` dead buttons or dangling handlers) |
| **Critical Business Rules (`1–15`)** | Audited prototype logic against `CD-01`–`CD-10` and `DEC-01`–`DEC-14` | **PASS** (Mon–Sun, `Asia/Bangkok`, `20:00`/`20:30`, sequential review, fallback, non-self-approval, Blocked, snapshot, Body Leader assignments, Pastor PII masking, Visitor PDPA gate, In-App+LINE OA, no Web Push, no PIN) |
| **Real Browser Visual / Screen-Reader Check** | *Not run in a live Chrome/iOS/Android device in this step* | **Unverified visually on physical devices** — recommended for Owner click-through in browser |

---

## 5. Phase E — Limitations, Recommendations & GATE-2 Approval Checklist

### 5.1 Limitations of This Static Prototype
- Browser-less Node verification confirmed logic, rendering, and state transitions, while **visual layout and touch ergonomics on real iOS/Android phones** should be clicked through directly by opening `FAITHMAP_GATE2_PROTOTYPE.html` in Chrome/Safari mobile view.
- Data resets on browser page reload (in-memory DEMO state only—no database/API by design).

### 5.2 Recommendations Before Phase 3 Build
1. Have 1–2 elderly Group Leaders test Step 1–3 on a mobile phone using `FAITHMAP_GATE2_PROTOTYPE.html` to confirm Thai font size and button spacing feel comfortable.
2. Confirm GitHub organization access (`tlckalasinchurch/faithmap`), Vercel/Neon accounts, and LINE Login Channel credentials (`DEC-03`, `DEC-11`, `DEC-12`) prior to Phase 3 kickoff.

### 5.3 GATE-2 Approval Checklist (For Owner Sign-Off)
- [ ] **All 5 Roles + Auth + Inbox verified** (`Auth`, `ผู้รับผิดชอบกลุ่ม/ผู้ประสานงาน`, `Supervisor`, `Body Leader`, `Pastor`, `Admin`, `Notification Inbox`)
- [ ] **3-Step Mobile Reporting + Autosave + Validation + PDPA Visitor Consent approved**
- [ ] **Sequential Supervisor Review, Fallback (`CD-03`), Non-Self-Approval (`DEC-05`), and Blocked Recovery (`CD-07`) approved**
- [ ] **Pastor PII Masking (`DEC-06`) & Immutable Sunday `20:30` Meeting Brief approved**
- [ ] **Explicit Owner Approval to close `GATE-2` and begin Phase 3 (`faithmap` new repository creation)**
