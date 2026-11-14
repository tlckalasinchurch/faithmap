# FaithMap — Test Strategy

**Document ID:** `FM-09` · **Version:** `2.0` · **Date:** `2026-11-14` · **Status:** `Approved Baseline (GATE-1)`  
**Product:** **FaithMap** (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`)

---

## 1. Quality & Isolation Principles

1. **Zero Production Test Leakage:** All test fixtures and synthetic accounts run strictly against isolated Neon ephemeral branches or local Docker PostgreSQL—never production.
2. **Real PostgreSQL Integration:** Integration tests execute against PostgreSQL 16+ so `CHECK` constraints (`DEC-04`, `DEC-05`, `DEC-10`), partial unique indexes, and `Asia/Bangkok` timestamps are verified directly.
3. **Positive & Negative AuthZ Coverage:** Every API Route Handler has tests verifying both authorized access and `401`/`403` rejection across roles and Bodies.

---

## 2. Testing Pyramid & Mandatory Suites

### 2.1 Unit Tests (Vitest)
- State machine & domain invariants:
  - Draft autosave never submits (`CD-01`).
  - `Monday–Sunday` period math, `Sunday 20:00` ICT late cutoff, and `Sunday 20:30` ICT brief schedule (`DEC-01`, `DEC-02`).
  - `first_submitted_at` and `is_late` immutability across revision/resubmit loops.
  - Sequential Supervisor gate (`DEC-04`) and Body Leader fallback (`CD-03`).
  - Non-self-approval rule & Blocked trigger when sole Body Leader submitted (`DEC-05`, `CD-07`).
  - Zero auto-approval invariants (`CD-08`).

### 2.2 Integration & Route Handler Tests (Vitest + PostgreSQL 16 / Neon Branch)
- Zod request/response validation on Next.js App Router `/api/v1/*` handlers.
- Optimistic concurrency (`expectedVersion -> 409`) and `Idempotency-Key` deduplication.
- **Database Constraint Checks:**
  - `visitors` insert with phone and `consent_for_contact = false` rejected (`DEC-10`).
  - `weekly_reports` `approved_by = submitted_by` rejected (`DEC-05`).
  - `weekly_reports` approved with `requires_supervisor_review = true` and `supervisor_reviewed_at IS NULL` rejected (`DEC-04`).
  - Append-only `security_audit_logs` rejects `UPDATE`/`DELETE` from app DB role.
- Internal job signature verification (`/api/internal/jobs/*` rejects missing/invalid `CRON_SECRET` or QStash signature).

### 2.3 Authorization, PII & Security Suite
- **Draft Isolation:** Non-Group-Leader roles receive `not_submitted` for `draft` reports.
- **PII Masking (`DEC-06`):** `mission_leader` responses and exports strip member phone, address, and `restricted_absence_note`.
- **Body Leader Assignment Scope (`DEC-09`):** Body Leader succeeds creating/ending `group_leader`/`care_leader`/`coordinator` in own Body; fails `403` for another Body or for `body_leader` assignments.
- **LINE OIDC Auth (`DEC-03`):** Rejects forged/tampered `id_token` or unconfirmed account linking.

### 2.4 E2E (Playwright) & Accessibility Tests
- **Mobile 3-Step Flow (375px):** LINE Login mock → prefilled roster → Visitor PDPA consent check → offline IndexedDB buffer → reconnect sync → explicit submit → supervisor pass → Body Leader approve.
- **Sunday `20:30` ICT Brief Snapshot:** Generate brief → submit late report at `20:45` → confirm stored brief remains unchanged and expected-group denominator matches `PeriodGroupSnapshot` (`DEC-08`).
- **Accessibility Gate:** `@axe-core/playwright` (`0` critical/serious WCAG 2.1 AA violations) + `>= 48px` mobile touch target verification.

### 2.5 Performance & Disaster Recovery Verification
- Load test (k6) simulating Sunday `19:30–20:30` ICT peak traffic (API P95 `< 300ms`).
- Staging PITR restore drill (`RPO <= 15m`, `RTO <= 2h`) required before `GATE-7`.

---

## 3. CI/CD Quality Gates (`faithmap` Repo)

Every PR must pass: `tsc --noEmit`, ESLint, Vitest unit + PostgreSQL integration + AuthZ/PII matrix, `next build`, and Playwright + Axe E2E on Vercel/Neon preview branches.
