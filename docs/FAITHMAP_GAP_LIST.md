# FaithMap — Traceable Gap List (baseline audit and result)

Date: 2026-11-15. Baseline: branch `claude/vigilant-noether-4fn1g1` at `a2c7caf` (PR #1 draft, CI passed on the heads checked).
Method: PRD (`FR-01` to `FR-13`) and Decision Register read against the code, the schema, the 6 migrations and the tests. Each gap has an ID, the evidence and the result. "Fixed" means a test or a build check fails without the fix.

## A. Defects and missing features found, and fixed in this round

| ID | Severity | Finding (evidence) | Fix | Test |
|---|---|---|---|---|
| G-01 | **Critical** | **No way to create a Body.** The only `insert(bodies)` was in the demo seed. A production database starts empty, groups need a Body, so no group could be created (FR-01.2) | `createBody`, `updateBody`, API actions, screen "จัดการบอดี้" | `gate19`, browser script |
| G-02 | **Critical (privacy)** | **23 real coordinator names and phone numbers were in the browser bundle.** The map screen imported the source list; the file `.next/static/chunks/*.js` held the numbers. This bypassed `DEC-06` and `DEC-17` for every role. `npm run check:bundle` found 25 hits on the old build | The map loads points from the server API, which applies the rules. Build check added to CI | `gate20`, `check:bundle` (25 hits before, 0 after) |
| G-03 | High | **A resubmit changed the late flag and the first submit time.** After a revision request the code set `is_late` from the new time and overwrote `submitted_at`. FR-07.6 and FR-08.3 say both stay (red test run before the fix) | Column `first_submitted_at`; resubmit keeps `is_late` and the first time | `gate21` |
| G-04 | High | **No automatic follow-ups** for 2 or 3 weeks of absence, or for a visitor who did not return (FR-06.4, FR-05.4) | `followup-automation.ts` | `gate18` |
| G-05 | High | Follow-up items could be completed with no outcome; no kind, priority or dedup key (FR-09.1, FR-09.2) | Columns, checks, unique index, outcome required | `gate18` |
| G-06 | Medium | Attendance used `excused`; PRD says `leave` and `online`. Member attendance was a typed number that could disagree with the marks (FR-06.1, FR-07.2) | Statuses aligned (`DEC-20`); member attendance derived from marks | `gate18` |
| G-07 | Medium | Visitor lifecycle and a way to record a return of an existing visitor were missing (FR-05.1, FR-05.3). Every "returning visitor" created a new visitor row | `followup_status`, `recordVisitorReturn`, `updateVisitorFollowupStatus` | `gate18` |
| G-08 | Medium | No weekend reminder (PRD 2.2 step 1, FR-11.2). Only the cutoff alert existed | `executeReminderJob`, job route `send_reminders` | `gate19` |
| G-09 | Medium | Report content fields of FR-07.2 (topic, scripture, activities, location, atmosphere, follow-up needs, next-week plan, support) were not stored | Columns, API, both forms (`DEC-23`) | `gate21` |
| G-10 | Medium | No roster actions: add an existing member to a group, end a membership (FR-04.2) | `addExistingMemberToGroup`, `endGroupMembership` | `gate19` |
| G-11 | Low | No duplicate warning for members (FR-04.3) | `findDuplicateMemberWarnings` (counts only) | `gate18` |
| G-15 | Medium | Desktop screens had text under 16 px and controls under 48 px (NFR). Map pins and map zoom buttons too | Sizes raised; CSS for map buttons | `scripts/e2e-admin-screens.mjs` (89 checks) |
| G-16 | Medium | Docs claimed states that are no longer true ("no Vercel project", "no pull request", 4 migrations) | State-correction boxes added (`FAITHMAP_MASTER_EXECUTION_STATUS.md`, `FAITHMAP_INFRASTRUCTURE_AUDIT.md`, `FAITHMAP_NEON_SECURITY_AUDIT.md`) | review |

## B. Open: needs an owner decision (the code shows the interim behavior)

| ID | Item | Interim behavior | Decision |
|---|---|---|---|
| Q-10 | Who may be a field point coordinator | Strict: usable account with an active assignment in the point's Body. **Not changed** | Owner |
| Q-11 | Absence streak and visitor rules (`DEC-21`) | As written in `DEC-21` | Owner |
| Q-12 | Body status rule (`DEC-22`) | Refuse inactive while an active group exists | Owner |
| Q-13 | Blocked report: automatic or manual resolve | Manual (admin) | Owner |
| Q-14 | XLSX and PDF export | CSV only | Owner (dependency) |
| Q-15 | Visibility of the new report content fields (`DEC-23`) | Free text and location restricted from the pastor | Owner |
| Q-16 | Photos (group, report) | Not implemented; no file storage | Owner |

## C. Open: known limits, no decision needed to start

| ID | Item | Note |
|---|---|---|
| G-12 | `organization_settings` is seeded but nothing reads it | Rules are constants as `DEC-01`, `DEC-02` lock them |
| G-13 | No screen buttons yet for: end membership, add existing member, manual visitor stage, duplicate warning text | The API and tests exist. The leader flows (report, follow-up, visitor) work |
| G-14 | `started_on` of a group is not stored (FR-02.2, "Active Groups" definition) | Period snapshots use the group status |
| G-17 | Scheduler absent (B-2). Brief, cutoff, reminders and cleanup jobs run only if something calls them | Vercel plan decision |
| G-18 | LINE push is simulated when no token is set | Real push not verified |
| G-19 | The repository holds real names and phone numbers of 23 field point coordinators in `src/lib/kalasin-field-points.ts` (git history too) | They no longer reach the browser. Owner should decide whether this file belongs in the repository |
| G-20 | No performance measurement, no contrast or screen reader audit | NFR not verified |
| G-21 | Third-party map attribution text is 12 px | The licence requires it to stay visible as is |

## D. Environment gates (not code)

Preview, Neon, LINE and Production were **not** verified. See `FAITHMAP_COMPLETION_REPORT.md` and `FAITHMAP_NEON_DEVELOPMENT_PLAN.md`.
