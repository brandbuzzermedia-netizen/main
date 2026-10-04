# Implementation plan

## MVP scope

Multi-client management · client login (portal) · brand profiles · audience
segments · campaigns · Instagram/Facebook (Meta) where supported · LinkedIn
where supported · AI comment generation · quality checks · approval dashboard ·
publishing queue · client analytics · GBS master analytics.

YouTube has a working adapter but is switched off in the MVP
(`ENABLED_PLATFORMS`). X and TikTok are declared adapters whose engagement
capabilities are `unsupported`/`prohibited` (see `platform-capabilities.md`), so
they can be enabled later without changing the engine.

## Sequence and status

| # | Module | Delivered (all modules built) | Verification |
| --- | --- | --- | --- |
| 1 | Authentication | Email/password (scrypt), DB sessions, secure cookies, login rate limit, `proxy.ts` redirect | unit: password hashing, session token hashing |
| 2 | Multi-tenant database | `0001_schema.sql`, composite FKs, immutability triggers | db tests: migrations apply cleanly on an empty DB |
| 3 | Client management | `/clients` table, create, archive/restore, delete (super admin) | db tests: only super admin inserts clients |
| 4 | Roles / permissions | `lib/auth/permissions.ts` + RLS helpers | db tests: per-role access matrix |
| 5 | Client switcher | Sidebar switcher; keeps the current page when switching clients | manual/browser |
| 6 | Brand profiles | Full profile form, voice, guard-rails, document upload (text formats) | unit: context loader isolation |
| 7 | Audience segments | Segments with industries, titles, locations, keywords, hashtags, negatives; target profiles | db tests |
| 8 | Campaigns | Create/edit/pause, segments, platforms, limits, approval override | db tests: cross-client segment link rejected |
| 9 | Social integrations | Adapter interface + Instagram, Facebook, LinkedIn, YouTube, X, TikTok; Meta, LinkedIn, Google OAuth; encrypted tokens | unit: adapters with mocked `fetch`, AAD-bound encryption |
| 10 | Opportunity engine | Discovery via adapters, manual intake, scoring + explanation, daily limits | unit: scoring |
| 11 | AI generation | Claude structured output, 3 variants, isolated context, offline provider for development | unit: prompt contains one client only |
| 12 | Quality engine | 7 checks, embeddings-based duplicate detection scoped to the client | unit: each check |
| 13 | Approval system | manual / gbs / dual, single + bulk approve with confirmation, edit history, suggestions, reject, regenerate | db tests: trigger enforcement |
| 14 | Publishing queue | Queue page, worker with `SKIP LOCKED`, retries, manual-action path, spacing + daily limits | unit + db tests |
| 15 | Analytics | Client analytics, master analytics with filters, comparison, workload, usage | manual/browser |
| 16 | Notifications | In-app notifications fanned out to that client's users only; daily report | db tests: client receives only own notifications |
| 17 | Security hardening | CSP + headers, CSRF origin checks, rate limits, audit log | unit |
| 18 | Testing | `npm test` (unit), `npm run test:db` (needs `TEST_DATABASE_URL`) | CI-ready |

Verified at the end of this iteration: `npm run typecheck` and `npm run lint` clean,
60 tests passing (40 unit, 20 database), `next build` succeeding, every page loaded as
each role (super admin, two account managers, client owner, team member, another
client's owner) with the expected 200/404 matrix, and a browser run through sign-in,
manual intake, generation, submission, bulk approval with confirmation, dual approval
and the phone-width layout.

## After each module

`npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`
(migrations + RLS) and a browser check at phone/tablet/desktop widths.

## Deliberately deferred

* Email delivery of notifications and daily reports (the `email_sender` field
  in organisation branding is ready; plug in a provider).
* PDF/DOCX text extraction for brand documents. The MVP accepts `.txt`,
  `.md`, `.csv` and `.json`, and pasted text.
* Live verification of the platform adapters against real Meta, LinkedIn and
  Google apps. They are built from the documented endpoints and tested with mocked
  responses; they need real app credentials and approved permissions to exercise.
* Billing. `usage_events` is the meter; connect a billing provider later.
* SSO / Supabase Auth. Sessions are behind `lib/auth/session.ts` (see
  `architecture.md` §9).
* Platform app review. Meta and LinkedIn permissions listed in
  `platform-capabilities.md` must be approved for the GBS developer apps before
  production use.

## Running hundreds of clients

* All hot queries are indexed on `(client_id, status, created_at)`.
* Discovery is per campaign and bounded by daily limits; the worker processes
  campaigns in batches and jobs with `SKIP LOCKED`, so several workers can run
  at once.
* RLS helper functions are `STABLE` and index-backed (primary keys on
  `client_users` / `account_managers`).
