# FaithMap — LINE MINI App Integration Readiness

**Date:** 2026-11-15 · **Scope:** the Developing channel only. No MINI App review, no publish, no real LINE message, no production change.

## 1. Configuration given by the owner (not verified in the LINE console by me)

| Item | Value | Secret? | Verified |
|---|---|---|---|
| Channel ID (Developing) | `2012616582` | No | Owner statement only. I cannot open the console. |
| Developing LIFF URL | `https://miniapp.line.me/2012616582-tsDHY0DR` | No | Owner statement only |
| LIFF ID (from the URL) | `2012616582-tsDHY0DR` | No | The number before the dash equals the Channel ID (checked by `npm run check:line-config`) |
| Region | Thailand | No | Owner statement only |
| Scopes | `openid` on, `profile` on, `chat_message.write` off | No | Owner statement only |
| Add friend option | Off | No | Owner statement only |
| Endpoint URL | LINE Default URL | No | Owner statement only |

**Documentation check.** `developers.line.biz` is blocked from this session (DNS fails). I used web search excerpts of the official pages. They say:
- Each internal channel (Developing, Review, Published) has its **own LIFF ID and endpoint URL** ([Console Guide for LINE MINI App](https://developers.line.biz/en/docs/line-mini-app/discover/console-guide/)). **Consequence:** the Channel ID and LIFF ID in FaithMap must change per environment. The Published channel will have different values.
- The LIFF ID is the path in the `miniapp.line.me` URL (same page).
- The endpoint must be `https` with no fragment ([Adding a LIFF app](https://developers.line.biz/en/docs/liff/registering-liff-apps/)).
- The server verifies the ID token with `POST https://api.line.me/oauth2/v2.1/verify` using `id_token` and `client_id` (= Channel ID) ([LINE Login v2.1 reference](https://developers.line.biz/en/reference/line-login/)). ID tokens live 1 hour ([LIFF API reference](https://developers.line.biz/en/reference/liff/)).
- A wrong LIFF ID in `liff.init()` is a common launch failure (Console Guide).
- Search snippets were partly old. **Not verified from the primary page:** who may open a Developing MINI App; whether `http://localhost` is allowed as a Developing endpoint. **Owner: read these in the console.**

## 2. What the code does today (checked by reading code and by tests)

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | LIFF SDK version | `@line/liff` 2.32.0. `npm view` shows 2.32.0 is the latest. | `package.json`, `npm view` |
| 2 | Authentication flow | `liff.init({liffId})` → if not logged in `liff.login()` → `liff.getIDToken()` → server challenge → server verifies the token → server creates its own session. The browser never sends a user ID or a role. | `src/lib/liff/*`, `src/server/modules/line-identity/*` |
| 3 | ID token verification | Server calls LINE verify. Then checks issuer `https://access.line.me`, audience, subject, expiry, issued-at. A token that starts with `MOCK` is refused before any network call. | `verifier.ts`, `gate4`, `gate3` tests (fake LINE response) |
| 4 | Channel ID and audience | Audience must equal `LINE_LOGIN_CHANNEL_ID`. Missing value → `503 LINE_NOT_CONFIGURED`. For this channel it must be `2012616582`. | `verifier.ts`; `check:line-config` |
| 5 | Expiry and replay | `exp` and `iat` checked. Each token is single-use: only its hash is stored (`used_id_tokens`). A replay gives `LINE_TOKEN_REPLAYED`. The client retries once after sign-out, **now with a loop guard** (one automatic retry per 5 minutes). | `gate3` tests; `gate11` guard tests |
| 6 | Session creation | Same server session as password login: random token, hashed with a server pepper, 7-day absolute and 72-hour idle limit, max 10 sessions, `HttpOnly` and `Secure` cookies in production, CSRF token. | `gate2-session-tls-login` |
| 7 | Account linking | Needs an existing signed-in session and a fresh `line_link` challenge. One LINE identity links to one account only. Unlink is refused if it would remove the last sign-in method. | `gate3` tests |
| 8 | Pending registration | A new LINE user creates a **pending request only**: no account, no role, no session. Only `super_admin` approves. Approval creates a `standard_user` with **no roles**. | `gate3`, `gate10` tests |
| 9 | Error handling | Thai messages. No SQL, no stack, no token in responses (new). LINE outage → `503 LINE_UNAVAILABLE`. | `gate8` tests |
| 10 | Endpoint URL | See section 3. | `isAcceptableEndpointUrl`, `gate11` tests |

**Not tested:** any call to real LINE. All LINE tests use a fake verify response. The nonce-less LIFF token behavior is taken from the official documentation (see `FAITHMAP_LINE_AUTH_DESIGN.md`, checks C1–C5).

## 3. Endpoint URL for development

**Rule:** the Endpoint URL must be a FaithMap HTTPS address, never the LINE Default URL, never a `miniapp.line.me` or `liff.line.me` address. FaithMap's page is `/mini`. The checker `isAcceptableEndpointUrl` enforces this.

**Candidate (free):** the stable branch alias of the existing Vercel project:
`https://faithmap-git-claude-vigilant-noether-4fn1g1-tlckalasinchurch.vercel.app/mini`
(Observed read-only in Vercel. It exists and its last build is READY.)

**This candidate cannot work yet. Blockers, in order:**

| # | Blocker | Owner action | Free? |
|---|---|---|---|
| E-1 | **No database.** The project has no `DATABASE_URL`. A Vercel build runs with `NODE_ENV=production`. FaithMap then answers `503` on purpose. | Create the Neon project and the `development` branch. Put the **pooled** URL in Vercel (Preview). Then run `npm run db:migrate` and `npm run db:bootstrap-admin` from your own terminal. | Yes |
| E-2 | **No environment variables.** The project has none (checked by name). Production code refuses to start without `AUTH_SESSION_PEPPER` and `CRON_SECRET` (32+ random characters each). | Set in Vercel (Preview): `AUTH_SESSION_PEPPER`, `CRON_SECRET` as sensitive; `APP_BASE_URL` = the exact origin; `LINE_LOGIN_CHANNEL_ID=2012616582`; `NEXT_PUBLIC_LIFF_ID=2012616582-tsDHY0DR`. `NEXT_PUBLIC_*` values are built into the page, so redeploy after setting. | Yes |
| E-3 | **Vercel Authentication (SSO) is ON** for `*.vercel.app` (`all_except_custom_domains`). The LINE in-app browser has no Vercel login, so it cannot open the page. | **Your decision:** (a) turn Vercel Authentication off for Preview. The app has its own sign-in, and the dev database holds no real data. (b) Use a Vercel bypass feature if your plan has it (I could not verify this). (c) A custom domain is exempt but costs money: do not buy. | (a) Yes |
| E-4 | Set the Endpoint URL in the LINE console. | In the Developing channel, set Endpoint URL to the candidate above. Save. | Yes |
| E-5 | Passkeys use the page origin as RP ID. A new origin means new passkeys. | None. Information only. | Yes |

**If E-3 option (a) is chosen:** the preview URL is public. Rate limits, CSRF and the pending-registration rule apply. Keep real member data out of the dev database.

**Mock cannot ship:** `NEXT_PUBLIC_FAITHMAP_MOCK_LIFF` is ignored in production and absent from production bundles (earlier `grep` check; production builds on Vercel always have `NODE_ENV=production`).

## 4. Secrets

**No secret is needed for the LIFF ID-token flow.** The Channel ID and LIFF ID are public. Do not enter the Channel Secret anywhere for now. If a later step needs a secret, set it only in Vercel (sensitive) or the LINE console, never in chat or Git. `LINE_OA_CHANNEL_ACCESS_TOKEN` must stay **unset** until the quota guard exists (Gate 5).

## 5. Findings on the existing Vercel project (read-only)

| ID | Severity | Finding | Owner action |
|---|---|---|---|
| V-A | **High (while reachable)** | A deployment with target `production` exists. It was built from commit `e99e936`, which is the **first** commit of this branch: it contains the application **before** the security fixes (demo and LINE takeover paths, unverified LINE login). | Vercel Authentication currently hides it from the public. Keep that protection on until this deployment is removed or replaced. I did not change anything. Ask me to prepare a clean production plan, or remove that deployment in the Vercel dashboard. |
| V-B | Low | Project Node version is `26.x`; CI and local use 22. | Done in code: `engines.node = 22.x` in `package.json`. |
| V-C | Info | A second project `faithmap.puntakit` exists in the same team. | Decision B-6 still open. |

## 6. Remaining blockers for real LINE login

1. E-1 database, E-2 variables, E-3 protection decision, E-4 endpoint (owner).
2. Checks C1–C5 on a real phone (see `FAITHMAP_LINE_AUTH_DESIGN.md`).
3. LINE Developers Agreement review (R2-1).
4. A tester account with a role in the Developing channel (documented as required; not verified).
