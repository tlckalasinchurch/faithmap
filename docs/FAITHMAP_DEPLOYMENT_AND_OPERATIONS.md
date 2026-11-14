# FaithMap — Deployment and Operations Plan

**Document ID:** `FM-10` · **Version:** `2.0` · **Date:** `2026-11-14` · **Status:** `Approved Baseline (GATE-1)`  
**Product:** **FaithMap** (`ระบบบริหารพันธกิจคริสตจักรและรายงานพันธกิจบ้าน`)

---

## 1. Infrastructure Isolation (Clean-Slate Guarantee)

FaithMap runs on **100% isolated infrastructure** from Puntakit (`CD-09`, `DEC-11`, `DEC-12`):
- **New Git Repository:** Dedicated repository **`faithmap`** (`DEC-12`)—never a branch inside Puntakit.
- **New Database:** Brand-new **Neon PostgreSQL 16+** project/database, completely disconnected from Puntakit's database.
- **New Hosting & Storage:** Dedicated **Vercel** project, fresh environment secrets, S3/R2 object storage bucket, and LINE Login / OA Messaging credentials.
- **Dedicated Domain (`DEC-12`):** New FaithMap domain/subdomain separate from Puntakit URLs.

---

## 2. Environments & CI/CD Pipeline

| Environment | Hosting & Database | Data Policy | Trigger |
|---|---|---|---|
| **Local / CI** | GitHub Actions + Ephemeral Neon Branch / Docker Postgres | Isolated test fixtures only | Every commit / PR |
| **Staging** | Vercel Preview/Staging + Isolated Neon Staging Branch | Synthetic UAT accounts only | Merge to `main` |
| **Production** | Vercel Production + Dedicated Neon Production Branch | Brand-new empty DB initialized via admin bootstrap | Owner-approved release tag |

### Release Controls
- Drizzle SQL migrations (`drizzle-kit migrate`) execute against a verified Neon pre-migration snapshot/branch restore point before routing production traffic.
- Automated post-deploy smoke test (`/api/health/ready`, auth check, `reporting_periods` check) with instant Vercel deployment rollback.

---

## 3. Backup, Restore & Disaster Recovery (DR)

### 3.1 FaithMap Production Backup Policy
- **Neon PITR (Point-in-Time Recovery):** Continuous WAL history (`RPO <= 15 minutes`).
- **Daily Encrypted Off-Site Export:** Automated daily `pg_dump` encrypted and stored in secondary object storage alongside versioned S3/R2 meeting photos (`RTO <= 2 hours`).

### 3.2 Mandatory Restore Verification Runbook
Before Phase 7 production launch (and quarterly thereafter):
1. Restore Neon PITR / encrypted `pg_dump` into a clean isolated staging branch.
2. Verify foreign keys, row counts, `security_audit_logs` integrity, and `meeting_briefs` JSONB completeness.
3. Boot Staging Next.js app against restored branch and run read-only smoke verification.
4. Record measured `RTO` and sign off in operations log.

### 3.3 Legacy Puntakit Archival (`DEC-14`)
- Legacy Puntakit repository, database backups, and configs are never modified or imported into FaithMap.
- On FaithMap launch day (`DEC-14`), capture a final verified encrypted archive dump of Puntakit in cold storage and retire Puntakit from active service.

---

## 4. 100% Clean-Slate Cutover Plan (`DEC-14`)

Per Owner Decision **DEC-14**, FaithMap performs a **100% full replacement cutover** after passing Phase 7 QA & DR gates:
1. **Empty Production Bootstrap:** Run Drizzle migrations on empty Neon Production DB; initialize first `super_admin` account via secure one-time bootstrap CLI.
2. **Clean Org & User Registration:** Administrators register verified Bodies, House Mission Groups, Assignments, and Members through approved FaithMap Admin workflows (ensuring LINE Login linkage readiness).
3. **Pre-Launch Readiness Rehearsal (Staging UAT):** Representative Group Leaders, Supervisors, Body Leaders, and Mission Leadership complete a full dry-run Sunday cycle (`20:00` deadline → `20:30` Meeting Brief).
4. **100% Cutover Day:** Enable production FaithMap domain, open first live Monday–Sunday reporting period, and **retire Puntakit completely** (archiving legacy Puntakit read-only).
5. **Post-Launch Hypercare (First 2 Sundays):** Live admin support during Sunday `15:00–22:00` ICT to assist elderly Group Leaders with LINE Login and verify `20:00`/`20:30` automated schedules.
