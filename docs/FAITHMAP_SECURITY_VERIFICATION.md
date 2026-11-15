# FaithMap — Security Verification (Phase 2 review and DEC-06 analysis)

Date: 2026-11-15
Scope: server-side authorization and data exposure of the services `ingestion`, `cares`, `team-field-points`, `growth`, `line`, `passkeys`, plus the `DEC-06` analysis of three report text fields.
Evidence marks: VERIFIED (code read in this session and, where stated, a test run), NOT VERIFIED.
This document holds no secret.

## 1. Service review

Method: I read each route handler and the guard code of each service function. I ran the existing tests and the new regression tests (274 passed on PostgreSQL 16.15; 270 passed and 16 skipped on PGlite 18.6).

| Service / route | Server-side check found | Data exposure | Result |
|---|---|---|---|
| `ingestion` (`/api/v1/ingestion`) | All 12 routed functions start with `assertAdminOnly` or `assertCanDecideIssue` (admin rules). `previewImportPayload` has no guard but no route calls it; the route uses `previewImportForActor`, which checks admin | Overview is admin only | VERIFIED. No defect |
| `cares` | `listCares`: scoped to Body Leader bodies and assigned cares; global readers see all. Writes use `assertCanManageBodyScope` or admin | Items carry no phone, email or LINE id (grep) | VERIFIED. No defect |
| `team-field-points` | List needs a role (assignment or global reader). Sync is admin only | Phone shown raw to admin only; masked to others. Any assignment holder can list all points (coordinator names, masked phone). This matches the code comment; it is broader than "own group" | VERIFIED. **Owner question Q-3** |
| `growth` | Admin or `canViewUnmaskedGroupPii` per group; a filter on a group outside scope returns 403; limit 500 rows | Pastoral growth data for named people; pastors get 403 (matrix test) | VERIFIED. No defect |
| `line` | Login, register and challenge are unauthenticated by design. Each needs a one-time challenge and a LINE ID token that the server verifies with LINE: issuer `https://access.line.me`, audience = channel ID, subject present, `exp` in the future, `iat` not more than 120 s ahead; one use per token (replay table). Registration creates a pending request with no roles. Review and list are `super_admin` only. `Origin` is checked before parsing | The pending list omits the LINE subject | VERIFIED by code and by the `gate3` tests. Real LINE not tested |
| `passkeys` | Login options and verify are unauthenticated by design with one-time challenges. Register, list and revoke need a session and act on the caller's own passkeys only. Maximum 10 per user. `Origin` checked | List returns id, label and dates, not public keys | VERIFIED by code and `gate2-passkeys` |
| `auth` | Demo accounts are listed only when `FAITHMAP_DEMO_MODE=true` and `NODE_ENV` is not `production` | The `actor.user` object has explicit fields (no password hash; tested) | VERIFIED |
| Cookies and CSRF | `__Host-` prefix, `HttpOnly`, `Secure` (always in production), `SameSite=Lax`; CSRF token on cookie-authenticated writes | — | VERIFIED |

Defects found and fixed earlier in this mission (commit `f72d22a`): F-1 absence notes and F-2 follow-up notes shown to pastors; F-3 missing security headers. Regression tests: `tests/gate13-dec06-notes-masking.test.ts`, `tests/gate14-security-headers.test.ts`.
No new defect was found in this service review. No code changed in this step.

Not verified: behaviour with real LINE, real devices, and Neon. No mutation test hits a route with a stolen-but-valid LINE token from another channel (the audience check covers it by code).

## 2. DEC-06 analysis: three report text fields

Source of truth: `DEC-06` (decision register) limits **phone, address and restricted absence notes** to direct stewards, the Body Leader of the group and admins. A pastor (`mission_leader`) sees "aggregate metrics and non-PII summaries". The permission model also says the Meeting Brief is "Full, non-PII" for pastors.

### 2.1 What the code did before the owner decisions (VERIFIED at commit `f72d22a`)

| Field | Where it is written | Who can read it now | Notes |
|---|---|---|---|
| `summaryNotes` | Group Leader, report form | Every actor with group access to a **submitted** report: steward, care leader, Body Leader, admin, **pastor** | Free text, up to 4 000 characters |
| `prayerRequests` | same | same, **and** copied word for word into the Meeting Brief (`section9PrayerAndCareThemes`) | The brief is immutable by trigger and by rule `DEC-01`. A leak in a brief cannot be removed |
| `careNeedsNotes` | same | same as `summaryNotes` | Care needs usually name a person and a situation |
| `notHeldReason` | same | same | Short reason why a meeting did not happen |
| Open follow-up **titles** | Steward | Brief `section8OpenFollowUps` (first 10 titles) and the follow-up list | A title may carry a name |

Drafts are hidden from everyone but the Group Leader (`FR-07.5`), so the exposure starts when a report is submitted.

### 2.2 Risk

1. Free text has no structure. A leader can write a name, a phone number or a health reason in any of the three fields.
2. A pastor can read all three on every submitted report.
3. `prayerRequests` goes into the immutable brief for all pastors and Body Leaders. A name entered once is permanent in the brief.
4. The decision register does not list these fields as restricted. This is a **policy gap**, not a coding error. I did not change behaviour.

### 2.3 Owner decisions (2026-11-15) and what the code does now

| ID | Decision | Register | Code status |
|---|---|---|---|
| Q-1 | `careNeedsNotes` and `prayerRequests` are Restricted Data | `DEC-15` | **Done.** Removed from report list and detail for every viewer outside the group's stewards, the Body Leader of that Body and admins. Test `gate15` |
| Q-2 | Brief shows only the number of groups with a prayer request | `DEC-16` | **Done** for new briefs. Raw text is not copied. Test `gate15` (also checks that no seed prayer text appears) |
| Q-3 | Team field points only for the same Body, the assigned coordinator and admins; nobody else, masked or not | `DEC-17` | **Done as fail-closed**: admin only. The data has no Body link and no coordinator account link for a point, so no other person can be proven to qualify. Test `gate15`, `gate1`, `phase3b1` |
| Q-4 | Option A | — | Applied as above |

Fail-closed means a non-admin who should see a point (same Body, assigned coordinator) is refused until the data model links the point. That is stricter than the decision, on purpose. See Q-8.

### 2.4 Permission matrix (after the owner decisions)

Roles: GL = Group Leader of the group; CC = Care Leader or Coordinator assigned to the group; BL = Body Leader of the group's Body; PA = Pastor (`mission_leader`); AD = admin or `super_admin`; OT = any other user.

| Item | GL | CC | BL | PA | AD | OT | Status |
|---|---|---|---|---|---|---|---|
| Absence note (attendance) | Yes | Yes | Yes | No | Yes | No | Done (F-1) |
| Follow-up notes | Yes | Yes | Yes | No | Yes | No | Done (F-2) |
| `careNeedsNotes` | Yes | Yes | Yes | **No** | Yes | No | Done (`DEC-15`) |
| `prayerRequests` (raw text) | Yes | Yes | Yes | **No** | Yes | No | Done (`DEC-15`) |
| Brief section 9 | — | — | Count | Count | Count | No | Done (`DEC-16`). The brief is one immutable document, so every reader gets the same count |
| `summaryNotes` | Yes | Yes | Yes | **No** | Yes | No | Done (`DEC-18`, Q-6) |
| `notHeldReason` | Yes | Yes | Yes | **No** | Yes | No | Done (`DEC-18`, Q-5) |
| Brief section 8 (follow-up titles) | — | — | Count (own Body) | Count | Count | No | Done (`DEC-18`, Q-7) |
| Meeting Brief scope | — | — | Own Body slice | Organization numbers | Whole record | No | Done (`DEC-19`, Q-9) |
| Team field points | No | Assigned point only | Own Body points only | No | Yes | No | Code done (`DEC-17`, Q-8). Closed until an admin maps every point. Migration 0004 not run |
| Report counts, attendance numbers, late, blocked | Yes | Yes | Yes | Yes | Yes | No | Unchanged |

### 2.5 Consistency check: `notHeldReason`, F-1 and `DEC-06`

The earlier matrix (section 2.3 of the first version) let a pastor read `notHeldReason`. That conflicts with F-1 and with `DEC-06`:
- `DEC-06` protects "restricted absence notes". `notHeldReason` is the reason a whole meeting did not happen. Real reasons are often a leader's illness, a death or an accident. That is the same kind of content as an absence note, for one person instead of one member.
- F-1 hides a member's absence note from a pastor. Showing `notHeldReason` to the same pastor is inconsistent.
- The brief only needs the count of confirmed not-held meetings (`confirmedNotHeld`), which it already stores. The reason text is not needed in any aggregate.

Recommendation (Q-5): treat `notHeldReason` as restricted, like `careNeedsNotes`. A pastor sees only that the meeting was not held. I did **not** change the code, because the owner decision names only `careNeedsNotes` and `prayerRequests`.

Other matrix conflicts found:
1. Brief readers. The permission model says a Body Leader reads a "Own Body slice" of the brief. The code returns the whole brief to every Body Leader (`listMeetingBriefs`). The brief holds organization-wide aggregates and names of late or missing groups, no personal data. Low risk. Open decision Q-9.
2. The first version of this matrix gave a Body Leader the full follow-up titles in the brief and a pastor only a count. One immutable document cannot give two different texts to two readers unless the code filters at read time. Q-7 asks for one rule.

### 2.6 Owner questions that remain

| ID | Question | Recommendation |
|---|---|---|
| Q-5 | Is `notHeldReason` restricted like an absence note? | Yes |
| Q-6 | Is `summaryNotes` free text allowed for a pastor? | Yes, with a form hint that tells leaders not to write names, phones or illnesses. Revisit after the first weeks of real reports |
| Q-7 | Brief section 8: first 10 follow-up titles (may contain names) | Replace with the count (`openFollowUps`) |
| Q-8 | How should the data link a team field point to a Body and a coordinator account? | Add `body_id` and `coordinator_user_id` columns to `team_field_points` (new migration `0004`), set by an admin action. Then allow the same-Body and assigned-coordinator rule |
| Q-9 | Should a Body Leader read the whole brief or only the slice of their Body? | Whole brief (no personal data), and update the permission model text |

### 2.7 Meeting Brief of Sunday 15 November 2026, 20:30 ICT (checked 21:23 ICT)

| Check | Result | Evidence |
|---|---|---|
| Was the brief generated? | **No brief can exist in any known database** | Neon `main` and `development`: 0 FaithMap tables, no `drizzle` schema, no `meeting_briefs` table (counts at about 14:22Z, VERIFIED) |
| How would a brief start? | Only through the job route with `CRON_SECRET`, or by an admin who is logged in | `generate_meeting_brief` job. The repository has no `vercel.json` (no Vercel Cron). Vercel has no `CRON_SECRET` and no `DATABASE_URL` (VERIFIED). Production code answers `503` without a database |
| Real reports or user accounts? | **None** in Neon. No FaithMap user, report or brief table exists | Same counts |
| Runtime log of the last hours | Not readable. The Hobby plan keeps 1 hour of logs only | NOT VERIFIED by logs. The database evidence is stronger |
| Other databases | The Vercel project `faithmap.puntakit` builds this repository. I cannot read its variables or database | **NOT VERIFIED.** If it has its own `DATABASE_URL`, a brief could exist there |
| Immutable briefs touched | No. I did not edit or delete any brief | — |
| Personal-data risk from a brief | **None found** in any database I can read. The risk exists only if `faithmap.puntakit` has a database | Owner must check that project |

Because no brief exists, the format change (`DEC-16`) needs no clean-up. The next brief (Sunday 22 November 2026, 20:30 ICT) will use the count-only format if this code is deployed before then.

## 3. Residual items

| ID | Item | Level |
|---|---|---|
| R-1 | CSP is Report-Only except anti-framing. Move directives to enforced only after a real LIFF device test shows no console violation | Medium |
| R-2 | `insights` POST and `reports` POST have no per-user rate limit (other mutation routes do) | Low |
| R-3 | The account-level Neon API key id 3540068 remains valid until the owner revokes it | High until revoked |


### 2.8 Owner decisions Q-5 to Q-9 (2026-11-15): implementation

| ID | Status | Evidence |
|---|---|---|
| Q-5 | Done | `redactRestrictedReportText` nulls `notHeldReason`. Test `gate16` |
| Q-6 | Done | Same function nulls `summaryNotes`. Test `gate16`, route test `gate17` |
| Q-7 | Done | Brief stores `section8OpenFollowUpsCount` and a count line. Test checks that no follow-up title is in the stored record or in any view (version 1 and 2) |
| Q-8 | Code, screen and migration `0004` ready. **Not run on Neon** | `drizzle/0004_team_field_points_scope.sql`. `assignTeamFieldPoint`, `assign_point` action, screen "จุดลงพื้นที่" (admin only), mapping gate. Tests `gate16`, `gate17` |
| Q-9 | Done | `src/server/modules/insights/brief-view.ts`. Only `insights/service.ts` reads `meeting_briefs`. The generate action returns the built view. Structure test and route tests |

#### 2.8.1 Field point rules in code

| Rule | Where | Test |
|---|---|---|
| Only an admin assigns | `assignTeamFieldPoint`, route schema `assign_point` | `gate16`, `gate17` (403 for Body Leader, pastor, group leader) |
| Body must exist and be `active` | `assignTeamFieldPoint` (`BODY_INVALID`) | `gate16` |
| Coordinator needs a Body on the point (`COORDINATOR_NEEDS_BODY`) | same | `gate16` |
| Coordinator account must be usable: `active` and has a login method (`COORDINATOR_INVALID`) | `isUsableAccount` | `gate16` (unknown id, suspended account) |
| Coordinator must hold an active assignment in the point's Body (`COORDINATOR_OUT_OF_SCOPE`) | `bodiesWithActiveAssignment` | `gate16` |
| A refused call writes nothing | validation runs before the update | `gate16` |
| Read gate: no non-admin reads while one point has `body_id` NULL | `getFieldPointMappingStatus` | `gate16`, `gate17` |
| Body Leader reads only points of an `active` Body that the person leads | `listTeamFieldPoints` | `gate16` (inactive Body test) |
| Coordinator reads a point only while the account holds an active assignment in the point's Body | same | `gate16` (revoked assignment test) |
| Change of coordinator moves access at once | same | `gate16` |
| Deleted coordinator account: foreign key sets the link to NULL, Body link stays, nobody gains access | schema `ON DELETE SET NULL` | `gate16` |
| Deleted Body: its points become unmapped, the gate closes for every non-admin | schema `ON DELETE SET NULL` | `gate16` |
| Sync from the source list keeps the links | upsert does not write the link columns | `gate16` |
| Audit record holds ids only, no phone number | `recordSecurityAudit` metadata | `gate16` |

Side effect to know: deleting a Body (or clearing the Body of one point) closes the gate for every non-admin until an admin maps the point again. This is fail closed on purpose.

#### 2.8.2 Meeting Brief per role

| Brief | Admin | Pastor | Body Leader | Pastor who also leads a Body | Other |
|---|---|---|---|---|---|
| Version 2 | Whole record, group names | Organization numbers, no group names | Numbers and names of the led Body | Organization numbers, plus names of the led Body | 403 |
| Version 1 (made before Q-9) | Stored numbers and lists as they are, follow-up count only | Organization numbers, counts instead of lists | No numbers. A notice tells the person to ask an admin | Organization numbers, counts instead of lists | 403 |

Known limits: the demo seed brief is version 1. The first real brief made after this code is version 2. Blocked-group notes in a brief hold a system reason code, not user text.

#### 2.8.3 Open point Q-10 (new)

The coordinator rule (active assignment in the same Body) is stricter than the owner decision. A coordinator of a field point who holds no church role in the Body cannot be assigned. Owner can relax it. See `FAITHMAP_NEON_DEVELOPMENT_PLAN.md`, D-4.
