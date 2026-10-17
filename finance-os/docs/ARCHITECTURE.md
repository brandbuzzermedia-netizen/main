# GBS Finance OS: architecture plan (Phase 1)

An internal accounts-receivable and cash-flow layer for Get Bee Seen. **Swipe remains the
system of record for official invoices.** This app references those invoices, tracks the
money against them, and automates follow-ups. It never issues an official invoice.

## 1. Repository inspection

This repository (`brandbuzzermedia-netizen/main`) contains only the static GBS marketing
site: six generated HTML pages, `styles.css`, `script.js`, `assets/` and `tools/build.py`.
It has no `package.json`, no backend, no database and no existing finance code.

Decision: the finance app lives in a self-contained `finance-os/` directory with its own
`package.json`, so it never touches the site build. The two deploy separately: the site
stays static, and `finance-os/` deploys to Vercel with **Root Directory = `finance-os`**.
The brand tokens (yellow and ink, the bee mark) are reused from `styles.css`.

## 2. System overview

```
               ┌──────────────────────── Vercel ────────────────────────┐
 Founder ────► │ Next.js (App Router, TS)                               │
 (browser)     │  • UI: server components + Tailwind + shadcn/ui        │
               │  • /api/webhooks/{payments,swipe,whatsapp,email}       │◄── providers (signed)
               │  • /api/jobs/{sync,reminders,commitments,forecast}     │◄── n8n (HMAC-signed)
               │  • domain/ (pure TS: balances, reminder rules,         │
               │    forecast)                                           │
               └──────────────┬─────────────────────────────────────────┘
                              │ service role (server only) / user JWT (RLS)
               ┌──────────────▼─────────────┐      ┌──────── n8n ────────┐
               │ Supabase Postgres + Auth   │      │ Cron (Asia/Kolkata) │
               │  • RLS on every table      │      │ → calls /api/jobs/* │
               │  • SQL views for balances  │      │ retries + alerts    │
               │  • unique keys = idempot.  │      └─────────────────────┘
               └────────────────────────────┘
 Outbound: Resend (email) · WhatsApp Cloud API / BSP · Swipe API (if enabled) · Razorpay (if used)
```

**Implementation notes (Phase 2).** Next.js 16.4 with `cacheComponents: false`: every page is
rendered per request, because finance figures must never come from a stale cache. Auth uses
`@supabase/ssr` cookies refreshed in `src/proxy.ts` (Next 16 renamed `middleware` to `proxy`).
Ledger columns (`amount_received_minor`, `credited_minor`, `allocated_minor`) are maintained by
triggers, and direct writes to them are rejected.

**Where the logic lives.** Every business rule (eligibility, balances, stage selection,
de-duplication) lives in the Next.js `domain/` layer and in Postgres constraints. n8n is
used **only as a durable scheduler and retry orchestrator**: it calls signed job endpoints
and alerts on failure. This keeps the rules versioned and testable, and keeps n8n
workflows thin enough that a broken workflow can't send a wrong message.
A Vercel Cron backup trigger is configured too. Because every job is idempotent, a
double trigger is harmless.

**Heartbeat.** Every job run writes an `integration_sync_runs` row. If no successful
reminder run is recorded within 26 hours, the dashboard shows a red "Automation stalled"
banner and n8n's error workflow emails the founder.

## 3. Money and ledger invariants

1. **Money is `bigint` paise** (integer minor units) with an explicit `currency char(3)
   default 'INR'`. No floats anywhere. Display formatting is Indian grouping (₹1,23,456.00).
2. **Four separate ledgers that never mix:**
   - *Service fees*: invoices, payments and allocations (agency revenue).
   - *Advertising funds*: `advertising_budgets` and `advertising_funding_events` (client money, not revenue).
   - *Expenses*: agency outflows.
   - *Cash*: derived from verified receipts and paid expenses only.
3. **Outstanding balance is derived, never typed:**
   `invoice_total − Σ allocations of verified payments − Σ credit notes`. It is exposed by
   the `invoice_balances` view. The stored `amount_received` and `outstanding` columns are a
   cache refreshed in the same transaction as each allocation change, and a check
   constraint plus a test prove the two agree.
4. **Only `verification_status = 'verified'` payments reduce a balance.** A promise,
   screenshot or WhatsApp message never does. The sources that may verify a payment are a
   signature-checked gateway webhook, a bank statement import, a Swipe payment record, or
   manual verification by the founder (audit logged with a reference).
5. **Allocations:** `Σ allocations ≤ payment.amount` (the rest is unallocated or advance),
   and `Σ allocations to an invoice ≤ invoice_total` (overpayment goes to unallocated
   credit). Both are enforced by a trigger inside a serializable transaction.
6. **Idempotency:** `payments (organization_id, source, transaction_reference)` is unique.
   `integration_events (provider, provider_event_id)` is unique. A duplicate webhook is a no-op.
7. **Expected collections are never cash.** The dashboard labels them "Expected
   (unconfirmed)" and keeps them out of the cash balance.

## 4. Reminder engine

The daily run happens at 09:30 IST (configurable). For each invoice with `outstanding > 0`:

```
eligible = status ∉ {cancelled, disputed, draft}
         ∧ outstanding > 0                        (recomputed now, not cached)
         ∧ no pending (unverified) payment ≥ outstanding
         ∧ no active approved extension          (if one exists, due_date := extension date)
         ∧ no active payment commitment whose date ≥ today
         ∧ client.communication_paused = false
stage   = pick from configured schedule by days relative to effective due date:
          T-3 friendly · T0 due · T+3 overdue · T+7 founder escalation · T+final formal review
```

- Each (invoice, stage, channel) is **claimed** with an `INSERT … ON CONFLICT DO NOTHING`
  into `reminder_events` with the unique key `(invoice_id, stage, channel, cycle)` before
  any provider call. A rerun finds the row already claimed and skips it. `cycle` bumps
  only when an extension or commitment resets the schedule.
- Message amounts always use the **current outstanding balance**. After a partial
  payment, the client is told only the remainder.
- The provider response, provider message ID, delivery status and error are stored on
  the event. A row is marked `delivered` only from a provider delivery callback. `sent`
  means only that the provider accepted it.
- Failures retry with exponential backoff (1 m, 5 m, 30 m, 2 h; at most 4 attempts). After
  that, an escalation task (`automation_failed`) is created and the founder can retry it.
- If WhatsApp is not configured or the client has no consent, the run falls back to email
  only. If email is not configured either, it creates a dashboard task.
- Stages T+7 and "final" create **founder tasks**. They never act automatically:
  suspension, campaign pauses and legal notices always need human approval.

**Commitments.** A missed commitment (date passed, no verified payment covering the promised
amount) creates exactly one escalation task and one follow-up. The unique key is
`(commitment_id, kind)`. It doesn't restart the normal sequence and increments
`clients.missed_commitments_count`.

## 5. Payments and reconciliation

| Source | Automation | Verifies payment? |
| --- | --- | --- |
| Payment gateway (Razorpay, recommended for India, if GBS adopts payment links) | Webhook with HMAC signature check | Yes |
| Bank statement CSV (HDFC, ICICI and similar formats) | Upload, then matched by reference, amount and payer name | Yes, after match review |
| Swipe payment records (API/CSV) | Sync | Yes, if the record has a reference |
| Founder manual entry | Form with mandatory UTR/reference | Yes, audit logged |
| Client screenshot or WhatsApp message | Logged as a note | **No.** Creates `pending_verification` |

Matching suggests allocations (exact amount first, then oldest due first, per client). The
founder confirms anything ambiguous. Unmatched credits sit in a "Needs allocation" queue.

## 6. Cash-flow forecast

```
current_cash  = opening_verified_cash + Σ verified receipts − Σ paid expenses
forecast(H)   = current_cash
              + Σ outstanding_i × p(bucket_i, commitment_i)      for due ≤ today+H
              − Σ unpaid expenses (incl. recurring expansions)  due ≤ today+H
```

The default probabilities (configurable in Settings and shown next to every forecast) are:
not yet due 0.9, 1–15 days overdue 0.7, 16–45 days 0.4, over 45 days 0.15, disputed 0. A
live commitment counts at 0.8 of its promised amount. Horizons are 7, 14 and 30 days.

## 7. Integrations (adapter pattern)

Each external system sits behind an interface in `src/integrations/*`, with a `Null`
implementation used when it isn't configured. The UI shows such a system as
"Not connected", never as a fake success.

| Integration | Adapter(s) | Phase-1 decision |
| --- | --- | --- |
| Swipe | `SwipeApiSource`, `SwipeCsvSource`, `ManualEntrySource` | See `SWIPE_INTEGRATION.md`. CSV and manual first, API after a live key test |
| Email | `ResendEmailProvider` | Resend. Requires a verified sending domain (getbeeseen domain DNS) |
| WhatsApp | `MetaCloudWhatsAppProvider` (direct WhatsApp Business Platform), BSP-swappable | Templates submitted for Meta approval. Opt-in recorded per contact |
| Payments | `RazorpayGateway` (optional), `BankCsvImporter` | Payment links are only shown if a real link exists |
| Ads | Manual funding entries first. Meta and Google balance reads later | Balances are labelled with their "last verified" time |

## 8. Security

- Supabase Auth with email magic link and an optional password. Roles: `owner` (founder),
  `finance`, `account_manager` (read-only on their own clients), `viewer`.
- **RLS on every table**, keyed on `organization_id` through `memberships`. Writes to
  ledgers go through server actions that use the user's JWT, so RLS still applies. The
  service role is used only by job and webhook routes, never in the browser bundle.
- Webhook routes verify provider signatures. Job routes require an HMAC header plus a
  timestamp, and requests older than 5 minutes are rejected.
- `audit_logs` is written by triggers on ledger tables (who, what, before/after).
- Secrets are kept only in Vercel and n8n environment variables. `.env.example` lists names, never values.

## 9. Database (tables, Phase 2 migrations)

`organizations`, `users` (profile mirror of `auth.users`), `roles`, `memberships`,
`clients`, `billing_contacts`, `contracts`, `invoices`, `invoice_line_items`,
`credit_notes`, `payments`, `payment_allocations`, `payment_extensions`,
`advertising_budgets`, `advertising_funding_events`, `expenses`,
`payment_commitments`, `reminder_events`, `escalation_tasks`, `integration_sync_runs`,
`integration_events`, `app_settings`, `audit_logs`. Views: `invoice_balances`,
`client_balances`, `ageing_buckets`, `cash_position`.

All tables use UUID primary keys and `created_at`/`updated_at`, plus the indexes that the
dashboard filters need: due date, status, client, and partial indexes on open invoices.

## 10. Phases

| Phase | Scope | Exit check |
| --- | --- | --- |
| 1 ✅ | Repo inspection, Swipe research, this plan | Founder answers the Swipe checklist |
| 2 ✅ | Next.js + Supabase scaffold, migrations + RLS, auth, clients, invoice ledger, CSV import + manual entry | Migrations apply on local Supabase. RLS tests pass. CSV re-import creates 0 duplicates |
| 3 | Payments, allocations, reconciliation, balance views | Scenarios 4–7 pass as automated tests |
| 4 | Dashboard, expenses, forecast | Every figure is traced to a SQL query in tests |
| 5 | Reminder engine, Resend, WhatsApp, n8n workflows | Scenarios 1–3 and 8–12 pass with mocked providers, then a sandbox send |
| 6 | Escalations, logs, retries, alerting, hardening | A rerun of every job is a no-op (tested) |
| 7 | Full test suite (15 scenarios), docs, deploy guide | Green CI and a staging deploy |

## 11. Decisions needed from the founder

1. Results of the Swipe checklist (`SWIPE_INTEGRATION.md`), which decide the first sync adapter.
2. WhatsApp: direct Meta Cloud API (cheapest, needs a Meta Business verification) or a BSP
   such as Interakt, AiSensy or Gupshup (faster onboarding, monthly fee)?
3. Does GBS want payment links (Razorpay) on reminders, or bank transfer/UPI details only?
4. Do ad funds ever pass through the GBS account, or do clients always fund Meta and Google
   directly? This decides whether a pass-through ledger with GST treatment is needed.
5. Sending domain for email, for example `billing@getbeeseen.com`.
