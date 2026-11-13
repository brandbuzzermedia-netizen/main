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
