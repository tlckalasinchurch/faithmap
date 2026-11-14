# FaithMap — Project Development & AI Engineering Standard

**Product:** FaithMap (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`)  
**Strategic Direction:** Option C — Clean Slate / 100% Full Replacement (`CD-09`, `DEC-14`)  
**Pilot Target:** Kalasin Province, Thailand (จังหวัดกาฬสินธุ์)  
**Timezone:** `Asia/Bangkok` (UTC+7) (`CD-05`)  
**Primary Stack:** Next.js (App Router, TypeScript) + Neon PostgreSQL 16+ + Drizzle ORM (`DEC-11`)

---

## 1. Core FaithMap Business Rules & Principles

1. **Flexible Leadership Structure:**
   - House mission groups can have multiple steward configurations (`group_leader`, `care_leader`, `coordinator`).
   - **Never enforce** every group to use an identical leadership structure.
   - Supervisor fallback: If no active Care Leader or Coordinator exists, submitted reports route directly to the Body Leader (`CD-03`).
2. **Report Lifecycle & Approval Rules:**
   - **Draft Autosave:** Autosave never submits a report and never changes status from `draft` (`CD-01`).
   - **Final Approver:** Only an active Body Leader can approve reports (`CD-02`).
   - **No Auto-Approval:** Never auto-approve any report under any condition (`CD-08`).
   - **No Self-Approval:** A user cannot approve their own submitted report (`DEC-05`).
   - **Weekly Cadence:** Reporting week is Monday 00:00 ICT to Sunday 23:59 ICT (`DEC-02`). Reporting deadline is **Sunday 20:00 ICT**, and immutable Meeting Brief generates **Sunday 20:30 ICT** (`DEC-01`).
3. **Accessibility for Elderly / Non-Technical Users:**
   - Prioritize simple everyday Thai vocabulary over technical jargon.
   - Large touch targets (minimum 48×48px), clear visual hierarchy, minimal steps.
   - LINE Login / LIFF as primary mobile entry point (`DEC-03`) with password/passkey fallback.
4. **Data Integrity & Governance:**
   - Option C Clean Slate: Zero reuse of legacy Puntakit code, database schemas, auth, or endpoints (`CD-09`).
   - PII protection: Member phone, address, and absence notes are strictly restricted to direct stewards and Body Leader (`DEC-06`).
   - Explicit consent required for visitor outreach (`DEC-10`).

---

## 2. AI Engineering Skills Ecosystem Integration

When operating in the `Faithmap` workspace, the agent MUST orchestrate the 5 installed tools across every phase of development:

### A. Superpowers — Engineering Discipline & Workflow
Use the corresponding Superpower skill at each phase of development:
- **Requirements & Clarification:** Invoke `brainstorming` before making architectural assumptions.
- **Planning:** Invoke `writing-plans` for any multi-step task or feature; invoke `executing-plans` for disciplined step-by-step execution.
- **Development:** Enforce `test-driven-development` for business logic and core rules.
- **Bug Fixing:** Enforce `systematic-debugging` (investigate root causes; never guess).
- **Code Review:** Invoke `requesting-code-review` and `receiving-code-review` with verified evidence.
- **Branch Management:** Use `using-git-worktrees` for isolated feature branches and `finishing-a-development-branch` upon completion.
- **Verification:** Always invoke `verification-before-completion` with proof of running tests and typechecks before reporting success.

### B. Claude-Mem — FaithMap Project Memory
- **Session Start:** Query memory (`claude-mem`) for FaithMap architecture decisions, schema definitions, and completed milestones before starting work.
- **Session Wrap:** Record new architectural choices, resolved issues, and pending tasks.
- **Zero Credentials Rule:** Never write passwords, tokens, API keys, or real personal information to memory.
- **Governance:** Approved project documents (`docs/*.md`) always supersede past auto-memory notes if conflicts arise.

### C. Impeccable — FaithMap UI/UX Standards
All frontend UI work must adhere to Impeccable standards:
- **Design Philosophy:** Modern Minimal, Premium Product Quality, Mobile-First, Highly Accessible.
- **Anti-AI-Slop:** Strict prohibition against generic purple gradients, gratuitous card nesting, arbitrary glow effects, or unreadable thin typography.
- **Typography & Touch:** Legible Thai fonts, minimum 16px body text, minimum 48px tap targets for elderly group leaders.
- **Verification:** Execute `npx impeccable detect` to verify UI compliance before concluding any frontend work.

### D. Task Observer — Continuous Improvement
- **Pinned Observation Root:** `C:\Users\Administrator\Desktop\Faithmap\skill-observations`
  - Observation log: `C:\Users\Administrator\Desktop\Faithmap\skill-observations\observation-log\`
  - Review tracker: `C:\Users\Administrator\Desktop\Faithmap\skill-observations\last-review-date.txt`
- **Session Start Protocol:** Before making the first tool call of any session, invoke the `task-observer` skill and execute its Session Start Protocol anchored to the pinned observation root above.
- **Observation Logging:** Log recurring friction, user corrections, and tool failure patterns into `skill-observations/observation-log/`.
- **Safety:** Do not alter business logic or create/modify skill files without explicit human approval.

### E. Skills.sh — Skill Discovery
- When specialized domain expertise is needed (e.g. Next.js App Router nuances, Drizzle ORM query tuning, PostGIS queries, LINE LIFF SDK), use `npx skills find <query>` to discover verified skills.
- Review source code and obtain explicit user approval before installing any new skill.

---

## 3. Mandatory 6-Phase Development Workflow

Every development task in FaithMap must follow these 6 phases:

```
[Phase 1: Understand] ──> [Phase 2: Analyze] ──> [Phase 3: Plan]
          │
          ▼
[Phase 4: Implement] ──> [Phase 5: Verify]  ──> [Phase 6: Learn]
```

1. **Phase 1 — Understand:** Read approved requirements in `docs/` (`FAITHMAP_PRD.md`, `FAITHMAP_DECISION_REGISTER.md`, `FAITHMAP_DOMAIN_MODEL.md`). Query `claude-mem`.
2. **Phase 2 — Analyze:** Evaluate dependencies, security/permission implications (`FAITHMAP_SECURITY_AND_PERMISSION_MODEL.md`), and identify regression risks.
3. **Phase 3 — Plan:** Formulate a structured implementation plan with clear acceptance criteria and test strategies (`FAITHMAP_TEST_STRATEGY.md`).
4. **Phase 4 — Implement:** Write clean, modular, typed TypeScript code. Enforce TDD for core state machines and business rules. No fabricated mock data.
5. **Phase 5 — Verify:** Run type checking, unit/integration tests, build verification, and Impeccable design audit. Verify with actual command outputs.
6. **Phase 6 — Learn:** Update documentation, record key decisions in `claude-mem`, and summarize observations via Task Observer.

---

## 4. Safety & Security Rules

- **Zero Data Loss:** Never drop, truncate, or overwrite production data or approved baseline specifications.
- **No Unverified Claims:** Never report a test as passed without running it in the current session.
- **No Secret Exposure:** Never commit `.env` secrets, credentials, or LINE channel secrets to Git.
- **Strict Scope Boundaries:** Modify only files within the authorized task scope.
