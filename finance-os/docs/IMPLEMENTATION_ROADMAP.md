# Implementation status

Status as of 13 Nov 2026. "Built" means: migration with RLS, server-side permission checks,
validation, UI with empty/error states, and automated tests for the phase's acceptance criteria.
What could **not** be verified in this build environment is listed at the end.

| Phase | Scope | Status | Tests |
| --- | --- | --- | --- |
| 0 | Audit and architecture docs | Built | — |
| 1 | Group/company registry, switcher, 12 company + 3 group roles, permission catalogue, guarded grants, audit, emergency stop | Built | `07_group_foundation.sql`, `nav.test.ts` |
| 2 | Command Centre, company owner dashboard, employee home, KPI drill-down, period filters | Built | `dashboard.test.ts` |
| 3 | Contacts/leads with duplicate detection, consent and lawful basis, suppression, sequences, call queue, outcomes, unsubscribe auto-stop, setter→closer handover, import RPC, CSV export | Built | `08_crm_and_ledger.sql` |
| 4 | Legal entities, maker-checker ledger (18 entry types), cash vs accrual, monthly and Indian FY reports, drill-down, settlements, reversals, internal transfers, FX with booked rate | Built | `08_crm_and_ledger.sql`, `ledger.test.ts` |
| 5 | Rental units (Salon, Tower, more), tenants, leases with escalation, idempotent rent charges, receipts, arrears, deposit liability ledger, unit expenses | Built | `09_rental.sql`, `rental.test.ts` |
| 6 | Private vault, bill upload (camera/PDF), file-signature check, SHA-256 duplicates, OCR via Claude with field confidence, side-by-side review, duplicate bill warnings, approval before posting | Built | `10_documents_ocr.sql`, `files.test.ts` |
| 7 | Tax periods, filing calendar, filing only with acknowledgement, accountant entity+period grants, registers and GST summary CSV with ledger and document ids | Built | `11_tax_automation_ai.sql` |
| 8 | Automation definitions, 15 templates (disabled), approvals, idempotency, retry rules, failure queue, mock test runs, signed n8n dispatch and callback, replay protection, emergency stop | Built | `11_tax_automation_ai.sql`, `n8n-signing.test.ts` |
| 9 | Server-side Claude provider, structured outputs, draft-and-approve, NDA exclusion, per-company toggle and token budget, usage log | Built | `11_tax_automation_ai.sql` |
| 10 | Products/SKUs with BIS gate, suppliers, orders with B2B advance gate, commission agreements and receivables gate, properties with K-RERA ad gate, site visits, ad approvals, outlet daily sales | Built | `12_business_modules.sql` |
| 11 | CSP/HSTS, audited exports, error boundaries, cron dispatcher, runbook (backup, restore, monitoring, UAT) | Built (see below) | `11_tax_automation_ai.sql` |

Totals: 146 unit tests, 12 SQL suites (all passing against PostgreSQL 16), lint, typecheck, production build.

## Needs credentials or confirmation before it is live

| Item | Needs | Until then |
| --- | --- | --- |
| Claude bill OCR and drafting | `ANTHROPIC_API_KEY`, then each company switches AI on in Settings | Bills are typed by hand beside the original; drafting is off |
| n8n workflows | `N8N_BASE_URL`, `N8N_SIGNING_SECRET`, `CRON_SECRET`, workflows built in n8n that verify the signature | Test runs are mock and labelled; nothing is sent |
| Email / WhatsApp / LinkedIn sending | An approved provider wired in n8n, WhatsApp templates and opt-ins | Outreach is logged by hand; drafts become tasks |
| Calendar sync | Google/Outlook connection via n8n | Meetings are entered by hand |
| Shopify (IYP, Vyra) | Store app credentials | Orders entered by hand |
| Petpooja / Zomato / Swiggy (La Pino'z) | Confirmed outlet access and a supported API | Daily sales entered by hand |
| Swipe API (GBS) | Plan-level API access (see SWIPE_INTEGRATION.md) | CSV import |
| Supabase Storage bucket | Applied automatically by migration 11 on Supabase | — |

## Not verified in this environment

There was no Docker, so a full Supabase stack (Auth + PostgREST + Storage) could not run here.
Database rules were tested against real PostgreSQL 16; TypeScript was typechecked, unit tested
and built; the production server was started and its pages and headers checked. **Signed-in
end-to-end flows (upload to Storage, server actions against PostgREST) still need a pass on a
staging Supabase project** using the UAT checklist in DEPLOYMENT_RUNBOOK.md, and a Playwright
end-to-end suite should be added to CI with `supabase start`.

## Next increments

1. Staging deployment and the UAT checklist.
2. Playwright E2E in CI against `supabase start`.
3. Email invitations for people who have never signed in; deactivate instead of delete; MFA for owners and finance.
4. Move the receivables pages under `/c/[slug]/…`.
5. n8n workflow JSON for the first low-risk templates (daily summary, bill OCR queue, rent overdue task).
