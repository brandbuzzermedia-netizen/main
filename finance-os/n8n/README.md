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
