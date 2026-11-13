# Implementation roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Repository audit, architecture docs | **Done** |
| 1 | Shell, auth (existing), group/company registry, switcher, roles and permissions, company-scoped routing, audit, demo seed, cross-company tests | **Mostly done** (see below) |
| 2 | Group Command Centre, company owner and employee dashboards, period filters, empty states | **Started**: owner dashboard, Command Centre and employee home built; KPI drill-down to source rows pending |
| 3 | Contacts, leads, consent, outreach, setter→closer handover, import/export, duplicates | Deals, meetings, tasks foundation built |
| 4 | Finance ledgers, cash vs accrual, FY reports, approvals, transfers, commissions | Existing receivables ledger reused; expenses/transfers next |
| 5 | Rental (Salon, Tower, configurable units) | Planned |
| 6 | Document vault and bill OCR with review | Planned |
| 7 | Tax-ready books and accountant access | Planned |
| 8 | n8n automation platform | Designed (AUTOMATION_ARCHITECTURE.md) |
| 9 | Claude assistant (server-side, draft-and-approve) | Planned |
| 10 | Business-specific modules | Planned |
| 11 | Hardening and deployment | Planned |

## Phase 1: done

* Migration `20261112000008_group_foundation.sql` with RLS, RPCs and audit.
* Group shell, company shell with brand colours/logos, workspace switcher via `/switch`.
* 12 company roles + 3 group roles, permission catalogue, guarded membership management.
* Add people by email (after their first sign-in), change roles, remove members.
* Registry: set up the 11 named workspaces from templates, add a custom business, attach the
  original GBS Finance workspace without touching its data, edit ownership/consolidation.
* Emergency stop with reason and audit.
* Dev-only `[DEMO]` group seed.
* Tests: 29 new unit tests; SQL acceptance suite `07_group_foundation.sql`.

## Phase 1: remaining

1. Email invitations for people who have not signed in (Supabase admin invite from a server
   route using the service role, restricted to `members.manage`).
2. Deactivate (rather than delete) memberships; revoke sessions.
3. Enforce MFA for owners and finance roles.
4. Move finance routes under `/c/[slug]/finance/*` so the active company is always in the URL.
5. Playwright end-to-end tests against a local Supabase stack (CI job with `supabase start`).

## Next increment (recommended)

Phase 2 completion (drill-down from each KPI to its rows, group pipeline page) then Phase 4
(expenses and transfers), because the Command Centre's income/expense cards depend on them.
