# FaithMap — LINE Authentication Design and Evidence

**Date:** 2026-11-15 · **Status:** Server side implemented and unit/integration tested with a fake LINE verifier. **Not tested with real LINE.**

## 1. Facts (official LINE documentation, read 2026-11-15)

| # | Fact | Source |
|---|---|---|
| F1 | ID token payload has `iss` (`https://access.line.me`), `sub`, `aud` (Channel ID), `exp`, `iat`, optional `nonce`. | developers.line.biz/en/docs/line-login/verify-id-token/ |
| F2 | `nonce`: "The nonce value specified in the authorization URL. Not included if the nonce value was not specified in the authorization request." | same page; LINE Login API reference, Verify ID token |
| F3 | Verify endpoint: `POST https://api.line.me/oauth2/v2.1/verify`, form fields `id_token` and `client_id` (required), `nonce` and `user_id` (optional). Errors: expired, invalid audience, invalid nonce, invalid issuer. | developers.line.biz/en/reference/line-login/ |
| F4 | Algorithm: ES256 for native apps, LINE SDK and **LIFF apps**. HS256 for web login (key = channel secret). | verify-id-token page |
| F5 | `liff.login(loginConfig)` takes only `loginConfig.redirectUri`. The LIFF reference has **no mention of "nonce"** (0 matches in 65,775 characters). | developers.line.biz/en/reference/liff/ |
| F6 | `liff.getIDToken()`: ID token is valid for one hour after issue. Needs the `openid` scope on the LIFF app. | LIFF reference |
| F7 | Web login (authorization-code flow) accepts an optional `nonce` and a required `state` on the authorize URL. | developers.line.biz/en/docs/line-login/integrate-line-login/ |
| F8 | `sub` is issued per provider. | third-party article (secondary, not official) |

## 2. Incompatibility in the first design

The first design (commit `f7c65bd`) required a `nonce` claim that equals a server challenge. By F2 and F5, a LIFF or MINI App developer cannot set a nonce. A LIFF ID token therefore has no nonce claim. The first design would **reject every real LIFF login**. Tests passed only because the fake LINE verifier added a nonce.

Evidence limit: F5 shows no nonce option. F2 says the claim is absent without one. I did not decode a real LIFF token. A LINE sandbox test must confirm it.

## 3. Secure alternative (implemented)

For tokens from LIFF / MINI App:
1. The server still calls LINE's verify endpoint (checks signature and expiry) and then checks issuer, audience, subject, expiry and `iat` (not in the future).
2. **Single-use tokens.** The server stores a keyed hash of each accepted ID token until it expires. A token seen before is rejected (`LINE_TOKEN_REPLAYED`). Replay of a stolen token needs the thief to act before the real user.
3. **One-time challenge.** Still required. It binds the request to a purpose (login, link, register) and, for linking, to the signed-in user. It also limits request rate. It is **not** cryptographically bound to the ID token. This is the weakness compared with a nonce.
4. The client never sends a LINE user ID. The server reads `sub` from the verified token.
5. Strict nonce mode stays in the verifier (default `requireNonce: true`) for a future web authorization-code flow (F7). That flow is **not implemented**. It needs the channel secret and a callback URL.

**Residual risk:** an attacker who steals a fresh, unused LIFF ID token (device compromise or TLS break) can use it within one hour. Single use only blocks the second use. Accepted for a church pilot. Mitigations: TLS only, short token lifetime (1 hour, set by LINE), audit log, super_admin approval for new accounts, no roles granted on registration.

**UX effect:** the LIFF SDK may return the same cached token after a logout within one hour. The second login then fails with `LINE_TOKEN_REPLAYED`. The client must call `liff.logout()` then `liff.login()` to get a new token. **Not verified against real LIFF.**

## 4. Open checks that need a real LINE channel (owner action)

| # | Check | Why |
|---|---|---|
| C1 | Decode one real LIFF ID token. Confirm there is no `nonce` and that `aud` equals the channel ID set in `LINE_LOGIN_CHANNEL_ID`. | Confirms section 2. |
| C2 | Confirm the verify endpoint accepts ES256 LIFF tokens with only `id_token` and `client_id`. | F3, F4 |
| C3 | Confirm which channel type issues MINI App tokens and which Channel ID is the `aud`. | Not verified. The MINI App documentation was not read. |
| C4 | Confirm behavior of `liff.getIDToken()` after `liff.logout()` / `liff.login()`. | Replay UX in section 3. |
| C5 | Confirm that `sub` from the Login channel equals the user ID that the Messaging API needs (same provider). | Gate 5 push. |

## 5. Code map

`src/server/modules/line-identity/verifier.ts` (verification) · `service.ts` (challenges, link, login, registration, review) · `src/app/api/v1/line/route.ts` (HTTP). Tests: `tests/gate3-line-identity.test.ts`, `tests/real-postgres.test.ts`.
