# FaithMap — AI Engineering Skills Ecosystem Standard

**Document ID:** `FM-STD-01`  
**Version:** `1.0.0`  
**Target Project:** FaithMap (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`)  
**Workspace Path:** `C:\Users\Administrator\Desktop\Faithmap`  
**Strategic Mode:** Option C — Clean Slate / 100% Full Replacement (`CD-09`, `DEC-14`)  
**Pilot Target:** Kalasin Province, Thailand (จังหวัดกาฬสินธุ์)  
**Date:** 2026-11-14

---

## 1. Skills Integration Architecture

This standard integrates five foundational AI Engineering tools into FaithMap's development lifecycle:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      FaithMap Agent Environment                        │
│                                                                        │
│   ┌─────────────────┐   ┌─────────────────┐   ┌───────────────────┐    │
│   │   Superpowers   │   │   Claude-Mem    │   │    Impeccable     │    │
│   │   (Workflows)   │   │(Episodic Memory)│   │  (UI/UX Standards)│    │
│   └────────┬────────┘   └────────┬────────┘   └─────────┬─────────┘    │
│            │                     │                      │              │
│            ▼                     ▼                      ▼              │
│   ┌───────────────────────────────────────────────────────────────┐    │
│   │              Mandatory 6-Phase Engineering Lifecycle          │    │
│   │   Understand ──> Analyze ──> Plan ──> Implement ──> Verify    │    │
│   └──────────────────────────────┬────────────────────────────────┘    │
│                                  │                                     │
│            ┌─────────────────────┴───────────────────────┐             │
│            ▼                                             ▼             │
│   ┌─────────────────┐                           ┌──────────────────┐   │
│   │  Task Observer  │                           │    Skills.sh     │   │
│   │(Self-Reflection)│                           │ (Skill Discovery)│   │
│   └─────────────────┘                           └──────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

### Component Roles & Responsibilities

1. **Superpowers (v7.0.1):** Development methodology, rigor, and execution discipline. Enforces brainstorming before assumptions, phased verifiable planning, test-driven logic implementation, systematic debugging, structured code review, and independent verification before completion.
2. **Claude-Mem (v15.18.3):** Persistent context and episodic memory. Stores architecture decisions, data model contracts, business rules, solved bugs, and completed milestones across sessions. Zero credential policy.
3. **Impeccable (v4.9.1 / Engine v0.1.23):** UI/UX quality control. Enforces modern minimal, mobile-first design, accessible Thai typography, and large touch targets (min 48×48px) for elderly church leaders; eliminates AI slop, gratuitous card nesting, and meaningless gradients.
4. **Task Observer (v3.9.0):** Continuous learning and quality feedback loop. Executes the Session Start Protocol, monitors tool usage, logs friction and corrections, and extracts recurring engineering patterns into reusable skills.
5. **Skills.sh:** On-demand skill discovery for specialized domain extensions (React, Drizzle ORM, Neon PostgreSQL, LINE LIFF SDK, PostGIS) under strict security and user-approval governance.

---

## 2. Project Instructions Structure

FaithMap implements a clean, layered instructions hierarchy:

```
Faithmap/
├── CLAUDE.md                    # Primary project-level agent instructions
├── .claude/
│   ├── settings.json            # Project-level skill overrides and agent configuration
│   ├── skills/                  # Local project skill extensions
│   └── rules/                   # Modular rules parsed by coding agents
│       ├── 01-engineering-workflow.md
│       ├── 02-faithmap-business-rules.md
│       ├── 03-ui-ux-design-standards.md
│       └── 04-memory-and-continuous-learning.md
└── docs/
    ├── AI_ENGINEERING_SKILLS_SETUP.md      # Ecosystem installation & security report
    ├── FAITHMAP_AI_ENGINEERING_STANDARD.md # This operational standard
    ├── FAITHMAP_PRD.md                     # Product Requirements Document
    ├── FAITHMAP_DECISION_REGISTER.md       # Locked Decisions CD-01..CD-10 & DEC-01..DEC-14
    └── ...                                 # Approved architectural specifications
```

---

## 3. Skill Activation Rules

When an agent opens `Faithmap`, skills are activated according to the following trigger table:

| Lifecycle Trigger | Skill to Activate | Action Required |
|---|---|---|
| **Session Start / First Turn** | `task-observer` | Execute Session Start Protocol; check observation storage; query `claude-mem` for FaithMap context |
| **New Requirement / Ambiguity** | `brainstorming` | Ask clarifying questions; check `FAITHMAP_DECISION_REGISTER.md`; do not assume unstated requirements |
| **Multi-step Feature Task** | `writing-plans` | Author phased implementation plan with explicit test criteria; await approval before execution |
| **Executing a Plan** | `executing-plans` | Follow steps sequentially; verify each milestone before proceeding |
| **Business Logic / State Machine** | `test-driven-development` | Write failing automated tests (Vitest/Jest) before writing domain logic; pass; refactor |
| **Unexpected Bug / Failure** | `systematic-debugging` | Formulate hypothesis with evidence; inspect logs; never apply random patches |
| **Frontend UI Modification** | `impeccable` | Follow mobile-first rules; test 360px viewport; run `npx impeccable detect` |
| **Before Closing a Task** | `verification-before-completion` | Run typecheck, lint, and automated test suite; demonstrate evidence of passing |
| **Session Wrap / Handover** | `claude-mem` | Summarize architectural decisions and pending work; persist to local memory database |

---

## 4. Development Workflow (Mandatory 6 Phases)

Every code change in FaithMap must transition through the 6 disciplined phases:

### Phase 1 — Understand
- Review approved baseline documentation in `docs/` (`FAITHMAP_PRODUCT_VISION.md`, `FAITHMAP_PRD.md`, `FAITHMAP_DECISION_REGISTER.md`).
- Query `claude-mem` for historical context and past architectural constraints.
- Differentiate approved decisions from open operational queries.

### Phase 2 — Analyze
- Evaluate downstream impact on the database schema (`FAITHMAP_DATABASE_DESIGN.md`).
- Verify role permissions and access control constraints (`FAITHMAP_SECURITY_AND_PERMISSION_MODEL.md`).
- Ensure no legacy Puntakit patterns or code are reintroduced (`CD-09`).

### Phase 3 — Plan
- Create an implementation plan detailing files to create/modify.
- Define explicit verification commands and acceptance criteria.
- Invoke `writing-plans` for any task spanning multiple files or architectural layers.

### Phase 4 — Implement
- Write typed, modular TypeScript code conforming to the Next.js App Router architecture (`DEC-11`).
- Apply TDD for core state transitions (draft autosave, approval routing, supervisor fallback).
- Strictly adhere to approved schemas; never fabricate mock data to bypass test gates.

### Phase 5 — Verify
- Run `npm run type-check` (or `tsc --noEmit`).
- Run automated unit and integration tests (`npm run test`).
- Execute `npx impeccable detect` on any modified frontend components.
- Verify actual outputs in the session transcript before declaring completion.

### Phase 6 — Learn
- Record significant decisions and new constraints into `claude-mem`.
- Use `task-observer` to log insights, user feedback, or friction points.
- If repeated tasks emerge, evaluate whether a custom skill should be proposed.

---

## 5. UI/UX Standards (FaithMap Heuristics)

FaithMap is purpose-built for church stewards, including senior citizens and users with low digital literacy in Kalasin:

1. **Large Touch Targets:** Minimum 48×48px interactive bounding boxes for all buttons, toggles, form fields, and list items.
2. **Accessible Thai Typography:** High contrast, legible font family, minimum 16px body font size, 18px–20px form labels, and clear line height (1.5+).
3. **No AI Slop:**
   - No gratuitous purple SaaS gradients or decorative glassmorphism.
   - No deeply nested cards inside cards.
   - Clean, functional cards with purposeful borders and subtle shadows.
4. **Intuitive Vocabulary:** Everyday church terminology in Thai (`กลุ่มพันธกิจบ้าน`, `หัวหน้าบอดี้`, `หัวหน้าแคร์`, `ผู้ประสานงาน`, `รายงานประจำสัปดาห์`) instead of developer jargon.
5. **Autosave Visibility:** Clear visual indicators for draft autosave status (`บันทึกร่างอัตโนมัติแล้ว`) without requiring manual save clicks (`CD-01`).

---

## 6. Security Rules & Data Integrity

1. **Clean Slate Boundary (`CD-09`):** Absolutely no legacy Puntakit code, database tables, auth tokens, or endpoints are permitted in the codebase.
2. **Privacy & PDPA Compliance (`DEC-06`, `DEC-10`):**
   - Member personal information (phone numbers, physical addresses, sensitive pastoral absence notes) is restricted to direct group stewards and the Body Leader.
   - General mission leadership and pastoral oversight view aggregate statistics and non-PII summaries.
   - Visitor phone numbers require explicit opt-in consent (`consent_for_contact = true`).
3. **Credential Security:**
   - Zero hardcoded secrets, API keys, or LINE Channel Secrets in source code or documentation.
   - All environment variables managed via `.env.local` (git-ignored) and verified via type-safe schema validation.
4. **Zero Self-Approval (`DEC-05`):** Leaders cannot approve reports they submitted. If no co-leader exists, route to Blocked status with admin alert.

---

## 7. Memory Strategy (`Claude-Mem`)

- **Scope:** FaithMap project memory is tagged with the project identifier `faithmap` and links directly to documentation IDs (`FM-01`..`FM-12`).
- **Retention Items:**
  - Database schema evolution (tables, indexes, relations).
  - Business rule edge cases (supervisor fallback, Sunday 20:00 ICT deadline mechanics).
  - API contracts and LIFF authentication flows.
  - Resolved bugs and verification benchmarks.
- **Query Method:** `npx claude-mem search "faithmap <topic>"`
- **Prohibited Items:** Credentials, personal phone numbers, member names, or production database connection strings.

---

## 8. Testing & Quality Assurance Strategy

Conforming to `FAITHMAP_TEST_STRATEGY.md` (`FM-09`):

- **Unit Testing:** Domain models, state machines (report submission, supervisor fallback, approval flow), and date/timezone boundary calculations (`Asia/Bangkok`).
- **Integration Testing:** Drizzle ORM database operations against PostgreSQL, API route handlers, and LINE webhook verifiers.
- **UI Component Testing:** Testing form inputs, autosave debounce, touch target dimensions, and Thai accessibility labels.
- **Verification Criterion:** A task is NOT complete until all relevant test commands have been executed and the terminal output confirms zero errors and zero warnings.

---

## 9. Troubleshooting & Operational Guide

| Symptom | Probable Cause | Corrective Action |
|---|---|---|
| `claude-mem: Worker is not running` | Background process stopped or port 37709 inactive | Run `npx claude-mem start`, then verify with `npx claude-mem status` |
| `Claude Code: Unknown skill` | Skill not indexed in current scope | Confirm skill exists in `~/.claude/skills/` or `~/.agents/skills/`; run `npx skills list -g` |
| `Impeccable: Engine executable missing` | Binary not found on PATH or permissions issue | Run `npx impeccable install -y --global` to re-deploy the platform binary |
| `Task Observer: Protocol skipped` | Agent bypassed Session Start check | Re-invoke `task-observer` and execute the 7-item startup checklist manually |
| `Autosave accidentally triggers report submission` | Code violates `CD-01` | Enforce state invariant: Autosave mutation must never alter `status = 'draft'` |

---

## 10. Acceptance Test Results

All five ecosystem components and project configuration files were tested and validated in the active workspace:

| Verification Item | Tested Command / Path | Evidence / Outcome | Status |
|---|---|---|---|
| **Project Instructions** | `C:\Users\Administrator\Desktop\Faithmap\CLAUDE.md` | Created with business rules, 6-phase workflow, and skills mapping | **PASS** |
| **Project Settings** | `C:\Users\Administrator\Desktop\Faithmap\.claude\settings.json` | Skill overrides explicitly enabled (`brainstorming`, `tui`, `impeccable`, etc.) | **PASS** |
| **Modular Rules** | `C:\Users\Administrator\Desktop\Faithmap\.claude\rules\*.md` | 4 modular governance rules created (workflow, business, UI/UX, memory) | **PASS** |
| **Superpowers Skills** | `~/.claude/plugins/cache/` & `~/.agents/skills/` | All 14 engineering skills available globally and locally | **PASS** |
| **Claude-Mem Service** | `npx claude-mem doctor` & `npx claude-mem status` | Worker ready on port 37709, Bun runtime v1.4.3, local SQLite db verified | **PASS** |
| **Impeccable Engine** | `npx impeccable --version` | v4.9.1 engine installed and hooks registered | **PASS** |
| **Task Observer** | `~/.agents/skills/task-observer/` & `~/.claude/skills/` | Complete skill bundle with references, scripts, and activation block | **PASS** |
| **Skills.sh Discovery** | `npx skills find react / postgres / security` | CLI search functional; domain recommendations documented | **PASS** |

**Conclusion:**  
FaithMap now possesses a fully integrated, self-reinforcing AI Engineering Skills Ecosystem. Any AI coding agent opening this workspace will immediately discover the project standards, enforce rigorous development discipline, maintain persistent context, and safeguard UI/UX quality.
