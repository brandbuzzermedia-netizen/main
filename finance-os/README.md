# GBS Finance OS

Get Bee Seen's internal accounts-receivable and cash-flow app. **Swipe remains the system of
record for official invoices.** This app keeps references to those invoices, tracks the money
against them, and (in later phases) automates the follow-ups.

It is a separate project from the marketing site in the repo root, with its own dependencies
and its own Vercel project (Root Directory = `finance-os`).

| Doc | What it covers |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, ledger invariants, reminder engine, phases |
| [`docs/SWIPE_INTEGRATION.md`](docs/SWIPE_INTEGRATION.md) | What Swipe's API documents, what is unverified, and the founder checklist |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Supabase + Vercel setup, step by step |

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Architecture, Swipe research | Done |
| 2 | Schema + RLS, auth, clients, invoice ledger, Swipe CSV import, manual entry | Done |
| 3 | Payments, allocations, bank statement reconciliation, promises, extensions, credit notes | **Done** (this build) |
| 4 | Dashboard completion, expenses, ad budgets, cash-flow forecast | Next |
| 5 | Reminder engine, Resend email, WhatsApp, n8n | Planned |
| 6 | Escalations, retries, alerting | Planned |
| 7 | Full scenario suite, deployment hardening | Planned |

What works today:

- Magic-link or password sign-in (Supabase Auth). First sign-in creates the GBS workspace, and you become its owner.
- **Clients**: billing identity, GSTIN, retainer, terms, account owner, contract, multiple billing
  contacts with recorded WhatsApp opt-in evidence, and "Names in Swipe" aliases for matching.
- **Invoice ledger**: references to Swipe invoices with derived outstanding balance, IST ageing,
  extensions, disputes, sync source and freshness.
- **Swipe CSV import**: upload, server-side validation, preview, then an idempotent import.
  Re-importing never duplicates. Swipe's "Paid" never marks anything paid; a mismatch opens a
  reconciliation task instead.
- **Manual entry**: for invoices raised in Swipe that you are not importing. It uses the same import path.
- **Overview**: contracted MRR, invoiced this month, verified cash, outstanding and overdue,
  due in 7/14/30 days (labelled unconfirmed), overdue clients. Every figure comes from the database.
- **Payments** (Phase 3):
  - Record receipts and refunds with a mandatory UTR, UPI RRN or cheque reference.
  - A payment stays *awaiting verification*, and doesn't reduce any balance, until someone
    records where they saw the money.
  - The allocation editor splits one payment across invoices, suggests an exact match first
    and then oldest-due-first, and keeps any remainder as an unallocated advance.
- **Bank statement import**:
  - Reads HDFC, ICICI and SBI style CSVs, including preamble lines and single-amount Dr/Cr
    columns. It imports credits only.
  - Pulls the UTR or RRN out of the narration and matches clients by name or alias.
  - Allocates automatically only when exactly one open invoice has exactly that amount.
  - A statement line verifies a matching *pending* manual entry instead of duplicating it.
  - References are unique across sources, so overlapping statements never double-count.
- **Payment promises**:
  - Logged against an invoice or the whole account. Account managers can log them for their
    own clients.
  - A promise is marked kept automatically when verified money dated on or after the promise
    covers it.
  - `process_missed_commitments` marks overdue promises as missed. It creates exactly one
    founder task, counts the client's missed promises, treats an approved extension as
    superseding the promise, and is safe to run repeatedly. Phase 5 schedules it daily.
- **Extensions** (only one active per invoice, history kept) and **credit notes** (recorded
  after issuing them in Swipe).
- **Tasks**: exceptions that need a person: reconciliation differences and missed promises.
- **Integrations**: what is and isn't connected, plus the run history. A stale-data warning shows
  whenever Swipe data is old or the last import failed.

## Verification done for Phase 2

- 77 unit tests and 5 SQL suites (`npm test`, `npm run test:db`). Together they cover
  test scenarios 4–10 from the brief: full, partial and unmatched payments, duplicate events,
  missed promises, extensions and disputes.
- Migrations applied to a real local Supabase stack (Postgres 17, GoTrue, PostgREST) with
  `supabase start` and `supabase db reset`.
- A scripted browser walkthrough against that stack:
  1. Sign in, create the workspace, create two clients.
  2. Import a Swipe-style CSV that has an unknown customer and an invalid date.
  3. Re-import the same file: nothing is duplicated.
  4. Add a manual invoice, then dispute it and resolve the dispute.
  5. Create the demo workspace and confirm cross-tenant isolation.
  6. Phase 3: record a pending payment and confirm the invoice stays open. Import an HDFC-style
     statement; it verifies that payment, auto-allocates an exact UPI match and leaves a cash
     deposit unmatched. Assign the deposit and allocate it with *Suggest*. Then log a promise,
     approve an extension and record a credit note. The final database balances were checked
     by hand.
  7. Check at a 390 px mobile width (no horizontal scroll).
  8. No browser console errors and no duplicate element ids on any page.
- **Not yet tested against Swipe itself.** No Swipe account or API key was available. The CSV
  importer accepts common header variants, so check your real export's preview before the first import.

## Local development

Requirements: Node 20.9+, Docker (for the local Supabase stack), and the Supabase CLI (`npx supabase`).

```bash
cd finance-os
npm install
npx supabase start          # Postgres, Auth and Mailpit on localhost; applies supabase/migrations
cp .env.example .env.local  # paste the API URL, anon key and service_role key that `supabase start` printed
npm run dev                 # http://localhost:3000
```

Sign in with any email. Local magic-link emails arrive in Mailpit at http://127.0.0.1:54324.
On the onboarding screen in development you can also **create a demo workspace**: a separate
organization with made-up `[DEMO]` clients and invoices, shown with a demo banner on every page.
Demo data is never created in production builds.

Useful commands:

```bash
npm test            # unit tests: money, dates, CSV parsing, Swipe mapping, client matching, schemas
npm run test:db     # applies every migration to a scratch Postgres and runs the SQL suite
npm run lint
npm run typecheck
npm run build
npx supabase db reset   # rebuild the local database from migrations
```

`npm run test:db` needs `TEST_DATABASE_URL` pointing at a **disposable** PostgreSQL 16+ server.
It drops and recreates a database called `gbs_finance_test`:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres npm run test:db
```

The SQL suite (`supabase/tests/`) covers:

- tenant isolation and roles (owner, finance, viewer, account manager, anon);
- audit logging;
- ledger integrity: pending payments don't count, verification settles, partial payments,
  one payment across invoices, over-allocation, cross-client allocation, duplicate transaction
  references, refunds, credit notes, and directly typed balances being rejected;
- import idempotency, disputes, cancellations and Swipe paid mismatches;
- IST ageing and extensions.

CI runs all of it in `.github/workflows/finance-os.yml`.

## Importing from Swipe

1. In Swipe, export your invoices (Excel/CSV). If you get an `.xlsx`, open it and use
   *File → Save As → CSV UTF-8*.
2. **Invoices → Import from Swipe**, choose the file, then **Check file**.
3. Review the column mapping, any rows with problems, and customers that match no client.
   Fix unmatched customers by creating the client or adding the Swipe name under
   *Names in Swipe* on the client. Then check the file again.
4. **Import**. Run it again with the same or a newer export at any time; it only adds or updates.

Accepted headers include common Swipe/Tally variants such as *Invoice No.*, *Invoice Date*,
*Due Date*, *Customer Name*, *GSTIN*, *Taxable Amount*, *Total Tax* and *Grand Total*. Download the
exact template from the import page. Dates are read day-first (DD-MM-YYYY). If there is no due
date, it is set from the client's payment terms and marked "(from terms)".

## Recording payments

- **Bank statement (preferred).** *Payments → Import bank statement*. Download the current
  account statement as CSV from net banking. Re-import overlapping periods freely.
- **One-off.** *Payments → Record payment*. Tick *verified* only if you have seen the money in
  the bank or a settlement report. A client's screenshot or message is not proof.
- Unmatched credits wait under *Payments → Needs attention*. Assign the client, then allocate.

## Security model

- Every table has RLS keyed on organization membership and role. Account managers see only
  the clients they own, and viewers cannot write.
- The `anon` role holds no grants on any table, view or function, and default privileges
  stop later migrations from granting it any. This was checked against a real local Supabase
  stack: anonymous REST calls get `permission denied`.
- Balances are computed by database triggers from verified payment allocations and credit
  notes. Typing them in directly is rejected by the database.
- The service-role key is read only in `src/lib/supabase/admin.ts`, which imports
  `server-only`. It is not used by any user-facing route.
- Ledger tables are audit-logged with the acting user.
