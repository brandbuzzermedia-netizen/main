# n8n workflows

Three starter workflows for the low-risk templates. Each file ships **inactive** and holds no
credentials.

| File | Template | What it does |
| --- | --- | --- |
| `dp-daily-summary.json` | Daily business summary → owner notification | Emails the owner today's counts: open deals and INR pipeline, meetings, overdue tasks, ledger entries and bills waiting |
| `dp-bill-ocr-review.json` | New bill uploaded → OCR → review queue | Emails the owner when bills are waiting for a person to check the extracted fields. Sent only when there are some |
| `dp-rent-overdue-escalation.json` | Rent overdue → escalation task | The OS creates one high-priority task per overdue charge; n8n emails the owner the list. Nothing goes to tenants |

## How a run flows

1. Every 5 minutes the cron dispatcher (`/api/automation/dispatch`, `Authorization: Bearer CRON_SECRET`)
   calls `enqueue_scheduled_runs(today)`. That queues at most one run per company per template per
   day, and only for templates switched on in that company's **Automation** screen. Companies under
   emergency stop are skipped.
2. It sends each queued run to `N8N_BASE_URL/webhook/dp-<template>`, signed with
   `HMAC-SHA256(N8N_SIGNING_SECRET, "<timestamp>.<nonce>.<body>")`.
3. The workflow checks the signature and its age (5 minutes), then replies `202` or `401`. It
   composes the message from the run summary only and emails the owner.
4. It reports `succeeded` or `failed` to `DP_APP_URL/api/automation/callback`, signed the same
   way. The OS records the result once and refuses a reused nonce.

## Setting up

1. In n8n, set these environment variables:

   | Variable | Value |
   | --- | --- |
   | `DP_SIGNING_SECRET` | Same value as `N8N_SIGNING_SECRET` in the OS |
   | `DP_APP_URL` | The OS address, e.g. `https://os.example.com` |
   | `DP_OWNER_EMAIL` | Who receives the messages |
   | `DP_FROM_EMAIL` | Sender address allowed by your SMTP provider |
   | `NODE_FUNCTION_ALLOW_BUILTIN` | `crypto` |
   | `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `false` |

2. **Workflows → Import from file**, one file at a time. Recent n8n versions need the UI or REST
   import: the `n8n import:workflow` CLI does not create the version history that activation
   needs.
3. Open **Email the owner**, attach an SMTP credential, save, then **Activate**.
4. In the OS, set `N8N_BASE_URL` (https only), `N8N_SIGNING_SECRET` and `CRON_SECRET`. Schedule
   the dispatcher, for example with Vercel Cron every 5 minutes.
5. In each company's **Automation** screen, switch on the templates it should run.

## Verified

On 13 Nov 2026 these files were imported into n8n 1.123.4 with a local SMTP catcher and run
against a local Supabase stack. Results:

- Both signed runs were accepted (`202`).
- A forged request was refused (`401`).
- The owner emails arrived.
- The signed callbacks marked both runs `succeeded` in the OS.

`tests/unit/n8n-workflows.test.ts` runs the workflows' own JavaScript against the OS signing code
on every test run.

## Growth systems (added 14 Nov 2026)

| File | Switch in Automation | What it does |
| --- | --- | --- |
| `dp-payment-reminders.json` | Invoice due → payment reminder with pay link | Emails each billing contact 3 days before, on the day, and 3/7/15/30 days after the due date with the Razorpay link; WhatsApp template to contacts who opted in. Stops once paid. |
| `dp-sequence-sends.json` | Sequence steps → email and WhatsApp sends | Sends due email steps and WhatsApp template steps from sequences. Needs approval per run. |
| `dp-social-publish.json` | Approved posts → LinkedIn, Facebook, Instagram | Publishes approved posts on their day through each network's official API and reports each result. |
| `dp-voice-calls.json` | AI voice calls (always says it is an AI) | Starts ElevenLabs outbound calls between 09:00 and 21:00 IST. The first sentence is always the AI disclosure. |
| `dp-reddit-listen.json` | Reddit listening | Searches Reddit daily for each watched keyword and sends new posts to Outreach → Reddit. |
| `dp-payment-hold-alerts.json` | Payment overdue past the limit → stop work, alert the team | Emails the company's owners, finance, account and operations managers when a client goes on hold. |
| `dp-meta-leads.json` | (relay, always on) | Meta lead forms → new leads in the right company. Register `…/webhook/dp-meta-leads?org=<company id>`. |
| `dp-elevenlabs-results.json` | (relay, always on) | ElevenLabs post-call results → the call record and the lead's history. Register `…/webhook/dp-elevenlabs-results?org=<company id>`. |

Extra n8n environment variables (set only the ones for channels you use):

| Variable | For |
| --- | --- |
| `DP_WA_PHONE_NUMBER_ID`, `DP_WA_LANG`, `DP_WA_PAYMENT_TEMPLATE` | WhatsApp Cloud API number and approved template names (token in an HTTP header credential) |
| `DP_LINKEDIN_TOKEN`, `DP_LINKEDIN_ORG_URN`, `DP_LINKEDIN_VERSION` | LinkedIn Company Page posting (approved LinkedIn app) |
| `DP_FB_PAGE_ID`, `DP_FB_PAGE_TOKEN`, `DP_IG_USER_ID`, `DP_META_VERIFY_TOKEN` | Facebook Page, Instagram business account, Meta lead webhook |
| `DP_ELEVENLABS_AGENT_ID`, `DP_ELEVENLABS_PHONE_ID` | ElevenLabs agent and its Twilio number (API key in an HTTP header credential) |
| `DP_REDDIT_CLIENT_ID`, `DP_REDDIT_CLIENT_SECRET`, `DP_REDDIT_USER_AGENT` | Reddit API app (script type, read-only search) |

Rules built in: AI calls always disclose they are AI and only reach leads with a lawful basis, no
do-not-contact flag and no suppression; WhatsApp uses approved templates only; posts publish only
after an approver approves them; LinkedIn, Facebook and Instagram person-to-person steps are
drafted for a person to send (the platforms do not allow automated messaging).

## Multiple accounts per channel (added 14 Nov 2026)

Each company (and the group, for shared accounts) lists its sending accounts in Settings → Sending
accounts. Every account has a key (shown in the list, e.g. `SALES_MAILBOX_2_AB12`). Bulk sends are
spread across accounts with capacity left today; each send carries `from` and `account_key`.

Give each account its own secrets in n8n using the key as a suffix; the workflows fall back to the
unsuffixed variable when an account-specific one is missing:

| Channel | n8n variables per account |
| --- | --- |
| Email | One SMTP credential per mailbox; the From address is the account's address |
| WhatsApp | `DP_WA_PHONE_<KEY>` (phone number ID) |
| Facebook / Instagram | `DP_FB_PAGE_ID_<KEY>`, `DP_FB_PAGE_TOKEN_<KEY>`, `DP_IG_USER_ID_<KEY>` |
| LinkedIn Page | `DP_LINKEDIN_TOKEN_<KEY>`, `DP_LINKEDIN_ORG_URN_<KEY>` |
| X (Twitter) | `DP_X_TOKEN_<KEY>` (OAuth 2.0 user token with tweet.write) |

Platform limits are enforced in the database: per-account daily ceilings (email 200, WhatsApp 1,000,
LinkedIn 25, X/Instagram/Facebook 50, Reddit 10), new mailboxes warm up from 10 a day (+5 a day),
and each company's weekly cap on contacting the same person across all channels (default 3).
Personal profiles never send automatically: their steps become tasks for the profile's owner.
