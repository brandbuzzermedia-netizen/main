# Deployment runbook

Supabase project + Vercel project (Root Directory `finance-os`). Initial setup is in
`DEPLOYMENT.md`; this runbook covers releases, including the Diwani Parivaar OS migration.

## Before every release

1. CI green: lint, typecheck, unit tests, SQL migration + RLS suite, build.
2. Read new migrations. They must be additive or carry a written rollback.
3. Back up production: Supabase Dashboard → Database → Backups (or `pg_dump` with the
   connection string) immediately before migrating.

## Applying migrations

```bash
supabase link --project-ref <ref>
```

```bash
supabase db push
```

Apply to staging first, sign in, open `/group`, a company home and `/finance`, then production.

## Release 20261112000008 (group foundation)

* Additive: new tables, new columns with defaults, new functions and policies. Existing
  finance rows are untouched; existing workspaces get a generated slug.
* After deploy, the founder signs in, goes to `/onboarding`, creates the family group, then on
  **Businesses** attaches the existing GBS Finance workspace as "Get Bee Seen" and creates the
  other workspaces they want.
* Rollback: redeploy the previous app build. The schema can stay (old code ignores new tables;
  the one behavioural change for old code is that `organizations.slug` is now required, which
  the updated `create_organization` fills). Do not drop tables holding entered data.

## Environment

No new environment variables in this release. Never expose `SUPABASE_SERVICE_ROLE_KEY` with a
`NEXT_PUBLIC_` prefix. Restrict sign-in with Supabase Auth settings (disable public sign-ups)
and `AUTH_ALLOWED_EMAILS`.

## Monitoring (to add in Phase 11)

Error tracking for server actions and route handlers, uptime check on `/login`, alert on failed
webhook verification and automation failures.

## Releases 09–15 (Phases 3–11)

All additive. Apply in order with `supabase db push`. Migration 11 creates the private
`documents` Storage bucket and its object policies on Supabase (skipped on plain PostgreSQL).

New server environment variables (Vercel → Settings → Environment Variables; none are
`NEXT_PUBLIC_`): `ANTHROPIC_API_KEY`, `N8N_BASE_URL`, `N8N_SIGNING_SECRET`, `N8N_ENVIRONMENT`,
`CRON_SECRET`. `vercel.json` schedules the automation dispatcher every 5 minutes. Without these
the app runs: AI and automation stay in clearly labelled mock mode.

## Backup and restore

* Supabase daily backups (Pro plan) plus point-in-time recovery for production. Before each
  migration, also take a logical dump:

```bash
pg_dump "$PRODUCTION_DB_URL" --format=custom --file="dpos-$(date +%F).dump"
```

* Storage: originals live in the `documents` bucket; replicate it weekly with the Supabase CLI or
  S3-compatible sync to a private bucket you control.
* Restore drill (quarterly): restore the latest dump into a scratch project, run
  `npm run test:db` against it, open three random bills and confirm their originals load.

```bash
pg_restore --clean --no-owner --dbname="$SCRATCH_DB_URL" dpos-YYYY-MM-DD.dump
```

## Monitoring and alerts

* Vercel: enable error notifications for the project; watch function errors on `/api/*`.
* Daily checks the Command Centre already shows: automation failures, bills waiting, overdue
  filings, overdue rent. Add the "Failed workflow → alert admin" template once n8n is connected.
* Supabase: enable log drains or alerts for auth failures and 5xx on PostgREST.
* Webhooks: 401 responses on `/api/automation/callback` or `/api/webhooks/razorpay` mean a bad
  or replayed signature; investigate before rotating secrets.

## Rollback

Redeploy the previous Vercel build. Migrations 09–15 only add objects; old code ignores them. Do
not drop tables that hold entered data. To pause everything at once for one company, use its
emergency stop.

## User acceptance checklist (staging, before production)

Sign in as each test user (owner, company admin, finance, sales rep, partner, accountant) and tick:

- [ ] Owner sees the Command Centre; sales rep lands on the company employee home; menus differ.
- [ ] GBS sales rep cannot open Vyra Studio (`/c/vyra-studio` gives 404) or any finance page.
- [ ] Company admin cannot grant owner or any group role.
- [ ] Partner sees only the shared deal; accountant sees only the granted FY.
- [ ] Ledger: a finance user's entry needs the owner's approval; report totals match the drill-down rows.
- [ ] An unpaid approved invoice/expense shows in booked but not in cash.
- [ ] Internal transfer between two companies does not change group income.
- [ ] Rental: Salon and Tower added; a lease generates charges once; a part-payment leaves arrears; deposit shows as liability.
- [ ] Bill: upload a phone photo and a PDF; original opens; low-confidence fields need "checked"; duplicate warning appears on re-upload; nothing posts until approved.
- [ ] Tax: GST months added; "filed" impossible without an acknowledgement; registers download and every row has a ledger id.
- [ ] Automation: test run shows "mock"; approval-required run waits; emergency stop blocks runs.
- [ ] Assistant: draft appears only with AI on; approving creates a task; nothing is sent.
- [ ] Tan O' Fun: a BIS toy cannot be listed until verified; B2B order cannot reach supplier PO without 50%.
- [ ] Real estate: property ad cannot be approved without verified K-RERA.
- [ ] Phone width: Command Centre, bill upload (camera) and call queue are usable.
