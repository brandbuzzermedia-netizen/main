# Diwani Parivaar OS: product architecture

Diwani Parivaar OS is a private, multi-company operating system for one family business group.
It grew out of the GBS Finance OS in this folder (see DECISIONS.md, D1): the same Next.js +
Supabase stack, the same ledger, now with a group layer and per-company workspaces on top.

## Phase 0 audit (12 Nov 2026)

| Area | Finding |
| --- | --- |
| Repository | Static Get Bee Seen marketing site at the root; `finance-os/` is the only application. |
| Stack | Next.js 16.4.2 (App Router, `proxy.ts`), React 19.3, TypeScript 5, Tailwind 4, Zod 4, Supabase (Postgres 15+, Auth, RLS) via `@supabase/ssr`, Vitest 5. CI: GitHub Actions with Postgres 16. |
| Working features | Magic-link/password sign-in; single-workspace finance: clients, Swipe invoice references and CSV import, payments with verification, allocations, bank statement import, promises, extensions, credit notes, Razorpay payment links with signed webhooks. |
| Baseline | Lint clean, typecheck clean, 85 unit tests and 6 SQL/RLS suites passing, production build passing. No known errors. |
| Gaps against the brief | No group or company registry; one organization per user in practice; four roles only; no CRM, meetings, tasks, rental, OCR, tax, automation or AI. |
| Multi-tenancy risks found | Membership writes were owner-only (fine) but there was no concept of group access, so "company membership must not imply group access" could not be expressed. `audit_logs` had no group scope. Existing RLS and anon lockdown were sound and are kept. |

## Layers

```
Browser ── Next.js server (RSC pages, server actions, route handlers)
              │  user's Supabase session (anon key + JWT)  → every query under RLS
              │  service role (server-only, webhooks/jobs) → never used by user routes
           Postgres (Supabase): schema, RLS, SECURITY DEFINER RPCs, audit triggers
```

* **Group shell** (`/group`): Command Centre, Businesses registry, People & access. Requires a
  group membership. Group roles show the registry only; figures come only from companies where
  the viewer also holds a company membership with the right permission.
* **Company workspace** (`/c/[slug]`): branded shell (sidebar colour, logo), module navigation
  built from the company's enabled modules *and* the viewer's permissions. Owners and company
  admins get the owner dashboard; everyone else gets an employee home of assigned work.
* **Finance ledger** (`/finance`, `/clients`, `/invoices`, `/payments`, `/tasks`): the original
  Finance OS pages, acting on the active company set through `/switch` (membership re-checked
  server-side, and again by RLS). Shown in that company's shell; refused without `finance.read`.

## Owner dashboard (company)

Matches the "Company OS" design: ownership/consolidation eyebrow, period tabs (this month, last
month, FY quarter, Indian FY), **Closer Desk** (meetings to prepare, hot deals, proposals awaiting
decision, overdue follow-ups, stalled deals, overdue collections; ranked by money at stake, each
deal counted once), **pipeline by stage**, KPI list (open pipeline + weighted forecast, won in
period, meetings this week, overdue tasks, and for finance roles invoiced/cash/receivables),
automation card and today's meetings. Every number is computed in `src/domain/dashboard.ts` from
rows RLS returned. Unbuilt areas say so ("Not connected", "Build phase 5"); nothing is estimated.

## Group Command Centre

KPI tiles, money (income/expenses/rental) and portfolio cards. Totals add **only** companies whose
consolidation is `consolidated` *and* that the viewer can read. Partner channels
(`commission_only`) are excluded and their open pipeline is shown as "Partner referrals (gross).
Not income". Joint ventures (`share_per_agreement`) and unconfirmed treatment are shown separately.
A "What these totals include" panel lists exactly which companies are in each total.

## Code map

| Path | Purpose |
| --- | --- |
| `supabase/migrations/20261112000008_group_foundation.sql` | Groups, registry, permissions, CRM tables, RPCs |
| `src/domain/registry.ts` | Module catalogue, ownership/consolidation vocabulary, the 11 workspace templates |
| `src/domain/periods.ts` | Month, FY quarter, Indian FY, assessment year, week ranges |
| `src/domain/dashboard.ts` | Pipeline summary, Closer Desk, finance metrics, group consolidation |
| `src/lib/workspace.ts` | Resolve user, company by slug (membership required), group context |
| `src/lib/dashboard-data.ts` | RLS-scoped loaders feeding the domain functions |
| `src/lib/nav.ts` | Company and group navigation, safe redirect paths |
| `src/app/group/*`, `src/app/c/[slug]/*` | Group and company pages and server actions |
| `src/components/shell/*`, `src/components/dashboard.tsx` | Shell, switcher, dashboard components |
