# FaithMap — Real Device Test Plan (LINE MINI App, Developing channel)

**Status: BLOCKED.** No device test can run until the blockers E-1 to E-4 in `FAITHMAP_LINE_MINIAPP_READINESS.md` are done and a tester has a phone with LINE. Nothing in this plan has been run. All earlier browser results (84 and 52 checks) are **desktop Chromium with the mock LIFF and demo data**. They are not device tests.

## Entry criteria
- Endpoint URL set in the Developing channel (HTTPS, FaithMap `/mini`).
- Neon development database migrated. One `super_admin` created by the owner.
- Vercel variables set. `npm run check:line-config` passes.
- Testers: 1 owner (super_admin), 1 LINE account with no role (new user), 1 LINE account for a Group Leader. Use church-owned test accounts. No real member data.
- **No real LINE message is sent in this plan.**

## Devices
| ID | Device | Browser |
|---|---|---|
| D1 | iPhone | Safari (open the Endpoint URL directly) |
| D2 | iPhone | LINE in-app browser (open the Developing LIFF URL) |
| D3 | Android | LINE in-app browser (open the Developing LIFF URL) |
| D4 | Android | Chrome (optional) |
Record: OS version, LINE version, screen size, date, tester, result, screenshot.

## Cases (run on D2 and D3; run the marked ones on D1)
| # | Case | Steps | Expected | D1 |
|---|---|---|---|---|
| T1 | Layout | Open `/mini`. Scroll every screen. Rotate. | No sideways scroll. All text ≥ 16 px. All buttons ≥ 48 px. Thai text does not break mid-word badly. | yes |
| T2 | LINE sign-in, unknown user | Tap "เข้าสู่ระบบด้วย LINE" with an unregistered LINE account. | Message says the account is not registered. Offer to register. No session. | |
| T3 | Registration | Tap register. Enter a name. Submit. | "ส่งคำขอแล้ว". Owner sees one pending request. **No account and no role is created.** | |
| T4 | Approval | Owner approves in the app. | New user exists with **no roles**. User sees "waiting for role" home. | |
| T5 | Sign-in, approved user | Re-open the app. Tap LINE sign-in. | Home appears. Menu has only "home" and "notifications". | |
| T6 | Role assignment | Owner assigns Group Leader of one group (in the web app). Re-open the app. | Menu shows reports, group, growth. Only that group appears. | |
| T7 | Account linking | Sign in by password (a seeded or owner-made account), open "เชื่อมบัญชีกับ LINE", link. Sign out. Sign in with LINE. | Same account opens. Linking a LINE ID already linked elsewhere is refused. | |
| T8 | Weekly report: draft | Open reports → start. Mark every member. Tap "บันทึกฉบับร่าง". Close LINE. Re-open. | Draft is back. Status "ฉบับร่าง (ยังไม่ส่ง)". Nothing was submitted. | |
| T9 | Weekly report: submit | Tap submit, then confirm. | "ส่งรายงานแล้ว". Form is read-only. No approve button for the leader. | |
| T10 | Revision | Reviewer sends back with a reason. Leader re-opens. | Reason is shown. Form is editable. Resubmit works. | |
| T11 | Approval | Supervisor (if any) forwards. Body Leader approves. | "อนุมัติแล้ว". No action buttons left. The submitter cannot approve. | |
| T12 | Poor network | Switch to airplane mode. Tap save. | A clear Thai error. No crash. No duplicate report after the network returns and the user taps again. | |
| T13 | Session expiry | Owner revokes the session (suspend the user, or wait for the 72-hour idle limit). Tap any action. | Returns to the sign-in screen with a Thai message. No data shown. | |
| T14 | Unauthorized access | As the Group Leader, open the Developing LIFF URL for another group's report (copy the API URL into Safari D1 while signed in). Try another group's ID. | `403`. No data of the other group. | yes |
| T15 | Logout and token reuse | Sign out. Sign in again at once with LINE. | Works. If LINE returns the same token, the app retries once, then shows a clear message (no loop). | |
| T16 | Cookie behavior | On D1 (Safari) sign in by password. Check the session survives a reload. Check that Safari blocks cross-site cookies without breaking the app. | Works as first-party. | yes |
| T17 | Back button and deep link | Use the system Back. Re-open a report from the LINE chat history. | App state is sensible. No leaked screen after sign-out. | |
| T18 | Large text setting | Set the phone to the largest text size. | Buttons remain tappable. Text is not cut off. | |

## Pass rule
A case passes only with a screenshot or a note from the tester on a real device. A case run on a desktop browser or with the mock does **not** count. Any failure in T2, T3, T4, T13 or T14 is a release blocker.

## Evidence to return (no secrets)
Per case: pass/fail, screenshot with member names hidden, LINE version, OS version. For T15 and the open checks C1–C5 in `FAITHMAP_LINE_AUTH_DESIGN.md`: the **names** of the ID token claims (never the values) and what LIFF does after logout.
