# FaithMap — Test Report (Q-5 to Q-9 round)

Date: 2026-11-15. Branch `claude/vigilant-noether-4fn1g1`. Base: `45cf05c` (CI passed). All results below come from commands run in this session on a scratch environment. No Neon database, no LINE, no Vercel Preview and no Production was used.

## 1. Results

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | exit 0 |
| Default suite (PGlite 18.6) | `npx vitest run` | 32 files passed, 1 skipped; **302 tests passed, 16 skipped** |
| Full suite on PostgreSQL 16.15 (same command as CI) | `FAITHMAP_TEST_ALL_POSTGRES=1 … npx vitest run --fileParallelism=false --exclude tests/real-postgres.test.ts` | 32 files, **302 passed, 0 failed** |
| Real PostgreSQL suite | `npx vitest run tests/real-postgres.test.ts` | 16 passed |
| Build | `npm run build` | exit 0 |
| Browser check of the admin screen "จุดลงพื้นที่" (Chromium, scratch demo database) | script in the session scratchpad | 360, 768, 1280 px: no horizontal scroll, controls at least 48 px high, text at least 16 px. One layout defect (select wider than its card at 360 px) was found and fixed, then the check passed again |
| GitHub CI | Actions | `45cf05c`: passed (push and pull request). The commit that holds this report: read after the push |

Not run: `npx impeccable detect` (tool not installed in the sandbox; the manual checks above replace it for this screen only), LINE, Preview, Neon, real devices.

## 2. New and changed tests

| File | Tests | Covers |
|---|---|---|
| `tests/gate16-q5-q9-scope.test.ts` | 20 | Q-5, Q-6 (pastor reads no `notHeldReason`, no `summaryNotes`); Q-7 (no follow-up title in stored brief or any view); Q-9 (admin, pastor, Body Leader of each Body, two roles, version 1 and version 2 briefs, no brief role, stored row unchanged by reads, source structure guard); Q-8 (migration 0004 is additive; old rows unmapped; assignment rules; incomplete mapping; complete mapping; change of coordinator; deleted coordinator account; deleted Body; inactive Body; revoked assignment; suspended coordinator; sync keeps links; audit holds ids only) |
| `tests/gate17-q8-q9-routes.test.ts` | 4 | Real route handlers with real sessions: only admin syncs or assigns; CSRF; input validation; no non-admin read before the mapping is complete; briefs in `/api/v1/workspace` per role; generate action is admin only |
| `tests/gate15`, `gate1`, `phase3b1`, `gate10` | unchanged except the earlier field-point rule | Still pass |

## 3. Mapping of requested cases to tests

| Case | Test |
|---|---|
| Mapping incomplete | `after the mapping is complete…` (first half) and `gate17` |
| Mapping complete | same (second half) |
| Change of coordinator | `change of coordinator…` |
| Deleted coordinator account | `a deleted coordinator account…` |
| Revoked coordinator assignment | `a deleted coordinator account clears the link… a revoked or suspended coordinator loses access` (`coordinatorEligible` false and 403) |
| Deleted Body | `a deleted Body unmaps…` |
| Source sync | `a sync of the source list keeps the mapping` |
| Invalid Body or coordinator | `validation…` |
| Brief versions 1 and 2 for every role | `Q-7 and Q-9: Meeting Brief by role and scope` (six tests) and `gate17` |

## 4. Limits of this evidence

- The route tests call the real handlers in the Node test process. They do not use a browser or the Vercel runtime.
- The pooler (PgBouncer) was not used. Migration 0004 ran on PGlite and PostgreSQL 16 only, not on Neon (PostgreSQL 18.7).
- The admin screen was checked on a scratch demo database. No real Body, user or field point exists yet.
