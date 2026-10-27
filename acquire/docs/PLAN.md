# Plan: MVP, integrations, phases, risks

## MVP definition

The MVP is the smallest product a brokerage would pay for: **import or capture leads, see whom
you may contact, run consent-gated email and SMS follow-up sequences, qualify replies with AI plus
human review, book calls, and sync interested leads to GoHighLevel.**

| In the MVP | Not in the MVP (later) |
|------------|------------------------|
| Multi-tenant workspaces, four roles, audit log | Visual drag-and-drop workflow canvas (MVP uses sequence templates) |
| Lead CRUD, CSV import/export, dedupe, tags, custom fields, saved views | Licensed data provider connectors |
| Consent, suppression and the per-market eligibility engine | AI voice calling (needs consent capture to work first) |
| Configurable pipeline, overview metrics | WhatsApp |
| Web-form lead capture with consent text | Revenue attribution |
| Email + SMS sequences (Day 0/1/3/5/7 template), stop on reply / opt-out | Scheduled reports |
| AI qualification of replies, scoring, human override | Self-serve billing (manual plan changes until then) |
| Calendar booking link + confirmed appointments | |
| GoHighLevel contact/opportunity sync | |

## Integration map

| Area | Provider (proposed) | Needed for | Account / setup the owner must create | Notes |
|------|---------------------|------------|----------------------------------------|-------|
| Database, auth | **Supabase** | Phase 2 (now) | Supabase project per environment | Pick the region for data residency |
| Hosting | **Vercel** | Phase 2 | Vercel project, Root Directory `acquire` | Same as Finance OS |
| Email | **Resend** (or SendGrid) | Phase 4 | Account, verified sending domain (SPF, DKIM, DMARC), webhook secret | Each tenant needs its own sending domain or subdomain |
| SMS / voice | **Twilio** | Phase 4 / 6 | Account, numbers per country, **US A2P 10DLC brand + campaign registration**, UK/AU sender IDs | 10DLC approval takes weeks; start early |
| AI model | **Claude (Anthropic API)** | Phase 4 | API key, spend limits | Per-task model config, cost logged per org |
| AI voice | Twilio Media Streams + realtime model, or a managed voice platform (Retell, Vapi) | Phase 6 | Vendor account; compare country coverage and per-minute cost | Pick after a 2-week spike |
| Calendar | **Google Calendar** / Microsoft Graph | Phase 6 | OAuth apps, Google verification for sensitive scopes | |
| CRM | **GoHighLevel API v2** | Phase 6 | GHL Marketplace app (OAuth client id/secret), a test sub-account | Scopes for contacts, opportunities and calendars. Verify each endpoint against current docs before building. |
| DNC screening | US DNC (SAN subscription), UK TPS, CA DNCL, AU DNCR, UAE DNCR, or an aggregator | Phase 6 | Subscriptions per market | Until then: review queue |
| Property data | MLS via RESO Web API (broker-authorised), ATTOM or similar | Phase 6 | Licence agreements | Replaces the "scrape Zillow" step |
| Billing | **Stripe** | Phase 7 | Stripe account, products and prices, webhook secret | Stripe Tax for VAT/GST |
| Jobs | Postgres queue + Vercel Cron (or Supabase cron) | Phase 5 | — | Revisit Inngest/Trigger.dev if load demands it |
| Errors | Sentry | Phase 5 | Project DSN | |
| Orchestration | n8n (optional) | Later | Self-hosted or cloud | Only for tenant-specific extras. Core state stays in the app database. |

## Phases

| Phase | Scope | State |
|-------|-------|-------|
| 1 | Audit, workflow interpretation, architecture, data model, compliance design, plan | **Done** |
| 2 | Foundation: auth, onboarding with market, organizations, four roles + platform admin, RLS, plans and limits, audit, app shell, settings, team invites | **Done** |
| 3 | Leads: CRUD, dedupe, CSV import (preview → commit, consent columns, custom fields, problem report), export, search/filter/sort/saved views, bulk assign, timeline, notes, consent, suppression, erasure, eligibility panel, pipeline board, overview metrics | **Done** |
| 3b | Built-in CRM: deals with stages and probabilities, tasks, manual appointments, interaction log, drag-and-drop boards, CRM dashboard | **Done** |
| 4 | **Done** (except per-state US rules and WhatsApp): AI qualification + messaging: provider interfaces; Claude tasks with schema output and run logging; templates with approval; Resend email and Twilio SMS with webhooks (delivery, replies, STOP/unsubscribe → suppression); usage metering; `contact_decisions`; web-form capture endpoint; conversations inbox | Next |
| 5 | **Sequences done** (claimed steps, waits, eligibility re-check, hold for review, stop on reply). Still planned: visual builder, branches, frequency caps, failure alerts. Workflow engine: versioned sequence definitions, Postgres job queue, waits, branches, stop conditions, retries with idempotency keys, frequency caps, pause/cancel, execution log UI, failure alerts | Planned |
| 6 | **Lead forms and properties done.** Still planned: Voice, calendar, CRM: AI voice calls (consent-gated, disclosure, transcript, handoff), Google/Microsoft calendars, GoHighLevel OAuth + sync + webhooks + reconciliation, DNC screening, properties and listing videos | Planned |
| 7 | Analytics (cost per lead/appointment, cohorts), Stripe billing and metering, scheduled reports, retention policies, per-person data export, load and security testing, launch runbook | Planned |

Each phase ships as a vertical slice with migrations, RLS tests, unit tests, UI, docs, and a green
CI run before the next phase starts.

## Risks, dependencies and open decisions

**Decisions for the owner.** These change cost, architecture or the business model.

1. **The outbound "cold AI call" funnel.** As drawn, it is not lawful in the US without prior
   express written consent (see WORKFLOW.md). Choose one:
   - inbound-first: ads plus forms that capture consent, then AI follow-up;
   - human-dialled outbound with DNC screening, and AI calls only after opt-in;
   - both, per market.
   The platform supports all three. Marketing claims ("no need for your efforts") should follow
   that decision.
2. **Launch market.** US, UK, UAE, Canada and Australia each need different registries, sender
   registrations and counsel review. Recommendation: launch in one market first. The US has the
   largest market but the strictest calling rules; the UK or UAE may be faster.
3. **GoHighLevel's role.** *Decided: the built-in CRM is the system of record; GoHighLevel is an optional sync.* Options were:
   - optional sync, where the internal CRM is the system of record (current design);
   - GHL as the system of record, which would make this a GHL Marketplace app.
   This changes onboarding and pricing.
4. **Pricing and plan limits.** The plans in the database have placeholder limits and $0 prices.
5. **Product name and brand.** "Acquire" is a working name.
6. **Data residency.** One region for everyone, or EU/UK tenants on a separate deployment?

**Technical risks**
- *A2P 10DLC and sender registration lead times* can stall SMS launch. Start registration in phase 4.
- *AI voice quality and latency* vary by provider and country. Spike before committing (phase 6).
- *GHL API limits and permissions* vary by plan and agency setup. Build reconciliation jobs, not
  only webhooks.
- *Cost runaway* from AI and telephony. Plan quotas are enforced server-side, every run records
  its cost, and there is a per-org kill switch (phase 4).
- *Deliverability.* Shared sending domains hurt every tenant. Each tenant uses its own domain.
- *Prompt injection* through lead replies (see ARCHITECTURE.md §5).

**Dependencies**
- A Supabase project.
- Twilio and Resend accounts.
- An Anthropic API key.
- A GoHighLevel developer account and sandbox sub-account.
- Counsel review per launch market.

## Environment variables and accounts

The current phase needs only Supabase. See `.env.example`.

| Variable | Phase | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 2 | Client and server access under RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | 2 | Server-only: user lookup and invites |
| `APP_URL` | 2 | Links in sign-in and invite emails |
| `AUTH_ALLOWED_EMAILS` | 2 | Optional sign-in allowlist |
| `ANTHROPIC_API_KEY` | 4 | AI tasks |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | 4 | Email |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` | 4 | SMS, later voice |
| `JOBS_HMAC_SECRET` | 5 | Signed job triggers |
| `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 6 | OAuth apps |
| `CREDENTIALS_ENCRYPTION_KEY` | 6 | Encrypts stored OAuth tokens |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | 7 | Billing |

## Testing strategy

| Layer | Tool | Covers today |
|-------|------|--------------|
| Domain unit tests | Vitest (`npm test`) | Eligibility by market, channel, hours and consent age; phone/email/country normalisation; money parsing; import planning (header variants, duplicates, consent evidence, warnings) |
| Database tests | SQL suites on plain Postgres (`npm run test:db`) | Tenant isolation, every role's read/write limits, platform admin isolation, anon lockout, seat and contact limits, dedupe, triggers (timeline, opted out), append-only consent, suppression rules, import idempotency and suppression handling, erasure and audit redaction, metrics |
| Static | ESLint, `tsc` | — |
| End to end | Playwright against a local Supabase stack | Planned for phase 4 CI. Phase 3 was checked by build, route-protection and login-page rendering only (see README). |
| Provider adapters (phase 4+) | Contract tests against recorded fixtures plus sandbox accounts | Webhook signature checks, duplicate delivery, retries |
| AI tasks (phase 4+) | Eval sets (golden transcripts → expected structured output), run in CI on prompt changes | Regression on qualification accuracy and refusal to invent facts |

CI: `.github/workflows/acquire.yml` runs lint, typecheck, unit tests, the SQL suite against
Postgres 16, and a production build.

## Deployment

1. Create a Supabase project and apply the migrations: `npx supabase link`, then
   `npx supabase db push`.
2. In Supabase Auth settings:
   - set the Site URL and redirect URLs (`<APP_URL>/auth/callback`);
   - turn off public sign-ups if access should be invite-only;
   - configure SMTP for production email.
3. Create a Vercel project with Root Directory `acquire`, set the environment variables from
   `.env.example`, and deploy.
4. To make yourself a platform admin, run this as the database owner:
   `insert into public.platform_admins (user_id) select id from public.users where email = '…';`
5. To change a tenant's plan before Stripe exists, run this as the database owner:
   `update public.subscriptions set plan_key = 'growth', status = 'active' where organization_id = '…';`
