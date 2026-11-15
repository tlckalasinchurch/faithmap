# FaithMap — Test Report (completion round)

Date: 2026-11-15. Branch `claude/vigilant-noether-4fn1g1`. Every result below comes from a command run in this session on a **scratch** environment (PGlite, a local PostgreSQL 16.15 server, a local Chromium and Node 22). **No Neon database, no Vercel Preview, no real LINE and no Production was used.**

## 1. Results

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | exit 0 |
| Default suite (PGlite 18.6) | `npx vitest run` | 36 files passed, 1 skipped; **329 tests passed, 16 skipped** |
| All suites on PostgreSQL 16.15 (the CI command) | `FAITHMAP_TEST_ALL_POSTGRES=1 … npx vitest run --fileParallelism=false --exclude tests/real-postgres.test.ts` | 36 files; **329 passed, 0 failed** |
| Real PostgreSQL suite | `npx vitest run tests/real-postgres.test.ts` | 16 passed |
| Build | `npm run build` | exit 0 |
| Browser files hold no field point phone numbers or names | `npm run check:bundle` | 0 hits (the build before the fix: 25 hits) |
| MINI app, 3 widths (Chromium, mock LIFF, demo database) | `node scripts/e2e-mini.mjs` | 84 of 84 |
| MINI report form, 3 widths | `node scripts/e2e-mini-report.mjs` | 52 of 52 (a first run found 5 failures: the new checkboxes were 28 px; fixed to 48 px) |
| Desktop screens, 3 widths | `node scripts/e2e-admin-screens.mjs` | 89 of 89 (first runs found text under 16 px, controls under 48 px, map pins and map buttons; fixed) |
| GitHub CI | Actions | Read after the push; see `FAITHMAP_COMPLETION_REPORT.md` |

Not run: `npx impeccable detect` (not installed in the sandbox), any test on a real phone, LINE, Preview, Neon, a pooled connection, Production, load or contrast tests.

## 2. Tests added or extended in this round

| File | Tests | Covers |
|---|---|---|
| `gate16-q5-q9-scope.test.ts` | 20 | Restricted text, count-only brief, brief per role, field point mapping |
| `gate17-q8-q9-routes.test.ts` | 4 | Real route handlers and sessions: field point assignment, brief per role |
| `gate18-followups-attendance-visitors.test.ts` | 13 | Absence streaks, visitor not returned, lifecycle, outcome, duplicate warning, attendance statuses, migration data-step order |
| `gate19-bodies-roster-reminders.test.ts` | 6 | Body management, roster, weekend reminders |
| `gate20-field-points-not-in-client.test.ts` | 2 | Source guard for the field point list (build check is separate) |
| `gate21-report-content.test.ts` | 6 | Report content and visibility, first submit time, late flag |

Red-before-green was run for: G-03 (late flag on resubmit: the test failed with the old line), G-02 (`check:bundle` 25 hits before, 0 after), Q-5 to Q-9 (earlier round).

## 3. Limits of this evidence

- Route tests call the real handlers in the Node test process. They do not use the Vercel runtime.
- Migration 0005 ran on empty PGlite and PostgreSQL 16 databases. Its data steps (`excused` to `leave`, outcome marker, `first_submitted_at` backfill) were checked as text and order, **not applied to old rows**.
- Migrations 0004 and 0005 ran on PGlite and PostgreSQL 16 only. Neon runs PostgreSQL 18.7 and was not used.
- The automatic follow-up rules follow `DEC-21`, which the owner has not confirmed.
- Browser checks use a mock LIFF and the demo database. They show layout, sizes and flows, not LINE behavior.
