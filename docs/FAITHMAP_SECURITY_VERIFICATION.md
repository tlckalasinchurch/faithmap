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

### 2.1 What the code does today (VERIFIED)

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

### 2.3 Proposed permission matrix (not implemented; needs owner approval)

Roles: GL = Group Leader of the group; CC = Care Leader or Coordinator assigned; BL = Body Leader of the body; PA = Pastor (`mission_leader`); AD = admin or `super_admin`; OT = other group or body.

| Item | GL | CC | BL | PA | AD | OT |
|---|---|---|---|---|---|---|
| Absence note (attendance) | Yes | Yes | Yes | **No** (done, F-1) | Yes | No |
| Follow-up notes | Yes | Yes | Yes | **No** (done, F-2) | Yes | No |
| `careNeedsNotes` | Yes | Yes | Yes | **No** (proposed) | Yes | No |
| `prayerRequests` (raw text) | Yes | Yes | Yes | **No** (proposed) | Yes | No |
| `summaryNotes` | Yes | Yes | Yes | Yes | Yes | No |
| `notHeldReason` | Yes | Yes | Yes | Yes | Yes | No |
| Brief section 9 (prayer and care) | — | — | Own body only | **Count of groups with a request** (proposed) | Full | No |
| Brief section 8 (follow-up titles) | — | — | Own body only | Count only (proposed) | Full | No |
| Report counts, attendance, late, blocked | Yes | Yes | Yes | Yes | Yes | No |

### 2.4 Options

| Option | Change | Effect on users | Effort and risk |
|---|---|---|---|
| A (recommended) | Apply the matrix above. Pastors see counts and `summaryNotes`, not `careNeedsNotes` or raw prayer text. Brief section 9 shows how many groups sent a prayer request. Add a short form hint: "ห้ามใส่ชื่อ เบอร์โทร หรือโรค" | Pastors lose the raw text. Body Leaders keep it | Small code change in `reporting` and `insights`, new regression tests. **Change in business behaviour of the brief: needs approval** |
| B | Keep the status quo. Add only the form hint | Pastors read all free text; the brief keeps raw prayer text | No code risk. Policy risk stays. Not recommended before the first production brief |
| C | A pastor-facing field: the Group Leader writes a separate "theme for the pastor" with no names | Best privacy; more steps for elderly users | New column and migration; against the "minimal steps" rule |

Timing: the first brief is generated on Sunday 20:30 ICT. Decide before the first real report is submitted, because a brief with raw text cannot be edited.

### 2.5 Owner questions

| ID | Question |
|---|---|
| Q-1 | Do `careNeedsNotes` and `prayerRequests` count as restricted data under `DEC-06`? |
| Q-2 | Should the Meeting Brief show raw prayer text (status quo), a count, or a curated theme? |
| Q-3 | May any person with a role list all team field points (coordinator names, masked phone), or only people of the same body? |
| Q-4 | Option A, B or C? |

I will not change these fields until the owner answers.

## 3. Residual items

| ID | Item | Level |
|---|---|---|
| R-1 | CSP is Report-Only except anti-framing. Move directives to enforced only after a real LIFF device test shows no console violation | Medium |
| R-2 | `insights` POST and `reports` POST have no per-user rate limit (other mutation routes do) | Low |
| R-3 | The account-level Neon API key id 3540068 remains valid until the owner revokes it | High until revoked |
