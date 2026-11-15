# FaithMap — Account and Access Checklist (Owner Actions)

**Date:** 2026-11-14 · **Rule:** Enter every secret in the provider console or Vercel only. Never send secrets in chat, Git or documents. Mark each box when done and record the date.

## A. Accounts that exist (observed, read-only)

| Item | Status | Evidence | Risk | Owner approval needed |
|---|---|---|---|---|
| GitHub repository `tlckalasinchurch/faithmap` | Exists. `origin/main` = `e38a24e` | `git fetch` | Low | No |
| Vercel team `tlckalasinchurch` | Exists. Hobby plan. Status active. MFA on. | Vercel account data | Low | No |
| Vercel project `faithmap` | **Missing** | 0 matches in project list | High | Yes |
| Vercel projects `puntakit-kalasin`, `graceful-giving` | Exist in the same team | Project list | Medium | Yes (isolation decision) |
| Neon integration in Vercel | Installed. Free plan. No project linked. | Integration record | High | Yes |
| Supabase integration in Vercel | Installed. Free plan. No project linked. Not in architecture. | Integration record | Low | Yes (keep or remove) |
| Clerk integration in Vercel | Installed. Hobby. Not in architecture (`DEC-03` uses LINE Login). | Integration record | Low | Yes (keep or remove) |
| LINE Developers account | Unknown | Not checked | Medium | Yes |
| LINE Provider / channels / OA / LIFF | Not created by me. Existence unknown. | — | Medium | Yes |

## B. Decisions the owner must make first (Gate 0)

- [ ] **B-1** Ask Vercel in writing (vercel.com/help): does a church ministry app with no revenue qualify for Hobby? Terms say "personal or non-commercial use" and do not define it. Save the reply. (`Z-01`)
- [ ] **B-2** Decide scheduler. Legacy Cron on Hobby fails `DEC-01`. Vercel Schedules (beta) runs up to 15 minutes late. Accept the delay or choose another option. (`Z-02`)
- [ ] **B-2a** Turn off Model Training in the Vercel team settings. Hobby content may be used for AI training. (`Z-07`)
- [ ] **B-3** Provide the "ZERO-COST INFRASTRUCTURE POLICY" document. It is not in the repository.
- [ ] **B-4** Domain: use `*.vercel.app`, or give a free subdomain. (`Z-06`)
- [ ] **B-5** Backup method that costs 0 THB. (`D-09`)
- [ ] **B-6** Same Vercel team as Puntakit, or a separate team. (`V-03`)
- [ ] **B-7** Keep or remove Supabase and Clerk integrations.
- [ ] **B-8** Is the GitHub repository private or public? Record the answer. (Affects Actions minutes.)

### Text for B-1 (send from the Vercel account owner, at vercel.com/help)

> Our team is a church ministry (Kalasin, Thailand). We built an internal web app for volunteer group leaders to submit weekly reports. It has no ads, no sales and no revenue. About 100 volunteers will use it. Your Terms say the Hobby plan is for "personal or non-commercial use". Does this use qualify for the Hobby plan? Please reply in writing. If it does not qualify, please say so.

**Why:** the Terms do not define "non-commercial". **Free:** yes. **If not done:** the project can be removed by Vercel without notice, or the owner must choose another free host. **Return:** the reply text, saved in `docs/`.

### Other new owner actions (from the execution status)

- [ ] **N-1** Create the first super admin locally after the database exists: set the three `FAITHMAP_BOOTSTRAP_*` values in your own terminal (never in chat), set `DATABASE_URL` to the Neon **production** branch, run `npm run db:bootstrap-admin`. Free. If skipped: nobody can sign in to production.
- [ ] **N-2** Set `AUTH_SESSION_PEPPER` and `CRON_SECRET` in Vercel (Production, Preview) as sensitive values of 32+ random characters. Free. If skipped: production refuses to run.
- [ ] **N-3** Do **not** set `LINE_OA_CHANNEL_ACCESS_TOKEN` yet. A quota guard does not exist. Free. If set too early: real messages could be sent and use the free quota.

### Round 2 owner actions (from the master status)

- [ ] **R2-1** Read the **LINE Developers Agreement** (https://terms2.line.me/LINE_Developers_Agreement). Using the LIFF SDK means you accept it. I could not read it. **Free:** no fee found. **If not done:** unknown terms apply to the app.
- [ ] **R2-2** Answer the 3 Gate 1 questions in `FAITHMAP_MASTER_EXECUTION_STATUS.md` (duplicate names across groups, growth column letters Y–AD, locking decided issues).
- [ ] **R2-3** After Neon exists, from your own terminal, in this order: `FAITHMAP_CONFIRM_MIGRATE_HOST=<host> DATABASE_URL=<direct url> npm run db:migrate`, then `npm run db:bootstrap-admin`. Use the Neon **direct** host for migrations and the **pooled** host in Vercel. **Free:** yes. **If skipped:** production shows "database not ready".
- [ ] **R2-4** Set `APP_BASE_URL` (exact production origin, https) in Vercel. **If not set:** passkeys and the origin check do not work.
- [ ] **R2-5** After the LINE channel exists, run checks C1–C5 in `FAITHMAP_LINE_AUTH_DESIGN.md` with a real phone. Return: the decoded token claim names (not values), and what the LIFF app does after logout and login.

## C. Vercel (after Gate 0)

- [ ] C-1 Create project `faithmap`. Import `tlckalasinchurch/faithmap`.
- [ ] C-2 Production branch `main`. Framework Next.js. Pin Node version.
- [ ] C-3 Do not add a payment card. Do not start a trial of a paid plan.
- [ ] C-4 Set Production variables **before first deploy**: `FAITHMAP_DEMO_MODE=false`, `CRON_SECRET`, `AUTH_SESSION_PEPPER`. Mark as sensitive.
- [ ] C-5 Record the production URL (for LINE callback).
- [ ] C-6 Enable spend and usage notifications if the dashboard offers them.

## D. Neon

- [ ] D-1 Create one Free project. Do not add a card.
- [ ] D-2 Create branches `production`, `staging`, `development`.
- [ ] D-3 Copy the **pooled** connection string of each branch into the matching Vercel environment. Do not paste it in chat.
- [ ] D-4 Confirm Free limits on the Neon dashboard. Write the storage limit (0.5 GB or 1 GB) in the decision register.
- [ ] D-5 Confirm the Free restore window length. Write it in the decision register.

## E. GitHub

- [ ] E-1 Confirm owner and a second admin have access. Enable 2FA for admins.
- [ ] E-2 Allow Claude Code limited write access to branch `claude/*` only. Keep `main` protected.
- [ ] E-3 Do not enable paid GitHub features.

## F. LINE (Gate 5 and Gate 6 only. Do not start earlier.)

- [ ] F-1 Create a LINE Developers account. Use a church-owned LINE account, not a personal one if possible.
- [ ] F-2 Create one Provider named `FaithMap`.
- [ ] F-3 Create one LINE Login channel. Add the Vercel callback URL. Record Channel ID in the decision register (the ID is not a secret).
- [ ] F-4 Enter the Login channel secret in Vercel Production only.
- [ ] F-5 Create or confirm the LINE Official Account on the **Free** plan. Do not buy a paid plan.
- [ ] F-6 Read the Free message quota and over-quota rule in LINE Official Account Manager. Write both in the decision register.
- [ ] F-7 Create the Messaging API channel. Link it to the OA.
- [ ] F-8 Enter the channel secret and access token in Vercel Production only.
- [ ] F-9 Create the LIFF app in the Login channel. Record the LIFF ID.
- [ ] F-10 Count Group Leaders and planned reminders per month. Keep total under 250.
- [ ] F-11 Do not create a LINE MINI App.

## G. Access I need from the owner for later phases

| Access | Why | When |
|---|---|---|
| Vercel project visible to the connected Vercel tool | Read deployments and variable names | Gate 1 |
| Neon `development` connection string in a local environment variable | Run schema tests | Gate 3 |
| Test LINE account on the owner's phone | Login test | Gate 5 |
| One LINE test recipient who gave consent | Push test | Gate 6 |

## H. Never share

Passwords, channel secrets, access tokens, database URLs, private keys, member phone numbers, addresses or absence notes.

## I. Sign-off

| Item | Owner name | Date |
|---|---|---|
| Section B complete | | |
| Sections C–E complete | | |
| Section F complete | | |
