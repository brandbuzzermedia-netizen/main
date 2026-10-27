# Acquire

Multi-tenant SaaS for real estate client acquisition: capture or import leads, see whom you may
contact and how, work them through a configurable pipeline, and (in later phases) run
consent-gated AI qualification, email/SMS/voice follow-up, booking and GoHighLevel sync.
"Acquire" is a working name.

It is a separate project from the agency site and from `finance-os/`, with its own dependencies,
database and Vercel project (Root Directory = `acquire`).

| Doc | What it covers |
|-----|----------------|
| [`docs/WORKFLOW.md`](docs/WORKFLOW.md) | The reference flowchart, interpreted; what is unreadable; where the platform deliberately differs |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Codebase audit, system design, data model, security model, AI design |
| [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) | The contact-eligibility engine and per-market rules |
| [`docs/PLAN.md`](docs/PLAN.md) | MVP, integration map, phases, risks and open decisions, env vars, testing, deployment |

## Status

| Phase | Scope | State |
|-------|-------|-------|
| 1 | Audit, workflow analysis, architecture, plan | Done |
| 2 | Auth, onboarding with market, tenants, roles, RLS, plans and limits, audit, app shell, settings, team | Done |
| 3 | Leads, import/export, dedupe, consent, suppression, erasure, eligibility panel, pipeline, overview | Done |
| 3b | Built-in CRM: deals, tasks, appointments, logged interactions, drag-and-drop boards, CRM dashboard | Done |
| 4 | Outreach: templates with approval, email (Resend) and SMS (Twilio), conversations, opt-out handling, usage quotas, AI lead assessment (Claude) | Done (needs provider keys) |
| 5 | Follow-up sequences with a scheduled runner (Day 0/1/3/5/7 style) | Done (sequences); visual workflow builder planned |
| 6 (part) | Web lead forms (hosted + embeddable, consent evidence, spam and rate limits); properties with tracked video-tour links | Done |
| 6–7 | Voice agents, calendar sync, GoHighLevel, licensed data, Stripe billing, analytics | Planned (need accounts) |

What works today:

- **Workspaces.**
  - Sign in by magic link or password. Create a workspace for a primary market (US, GB, AE, CA or AU), which sets the default time zone, currency and phone format.
  - Switch between workspaces.
  - Admins invite colleagues as agency admin, campaign manager, sales rep or read-only.
  - A trial plan is enforced in the database: 500 contacts and 3 seats.
- **Leads.**
  - Create and edit leads with buyer, seller, landlord, tenant or investor segments, budget, timeline, location, tags and notes.
  - Duplicates are rejected by normalised email or E.164 phone, with a link to the existing lead.
  - Sales reps see and work only their own leads.
- **List.**
  - Search by name, email, phone or location. Filter by stage, source, owner, segment or tag. Sort, paginate, and save views (personal or shared).
  - Bulk-assign leads, and export the current filter to CSV (formula-safe).
- **CSV import.**
  - Reads common header variants and keeps unknown columns as custom fields.
  - Validates every row, including in-file duplicates, then previews before anything is saved.
  - Duplicates can be skipped or used to update existing leads.
  - Consent columns are recorded only when the file states a source.
  - Lists the problems and lets you download them as a report.
  - Re-running an import is safe.
  - Suppressed people are imported but flagged and never get consent from a file.
- **Lead page.**
  - Timeline, maintained by database triggers, plus notes.
  - Stage and owner changes.
  - Append-only consent history with basis, source and evidence.
  - Opt-outs and suppressions.
  - Admin-only erasure, which deletes the lead, redacts the audit log and keeps a suppression entry.
  - **"Can we contact them?"** panel: for each channel, allowed, not now, needs review or blocked, with reasons, under the rules for the lead's country.
- **Built-in CRM.** The internal CRM is the system of record; GoHighLevel will sync to it later.
  - **Deals**: property value, expected commission, type, owner, expected close date and property reference. Seven default stages with win probabilities (editable in Settings → Pipeline). Closing a deal records when it closed; reopening clears it.
  - **Lead and deal boards** with drag and drop, plus a "Move to" menu on every card for keyboard and touch. Moves show instantly and roll back if the server refuses. Leads cannot be dragged into Opted out; that must go through a recorded opt-out.
  - **Tasks**: due date, priority and assignee, grouped into overdue, today, upcoming and no date. Completing a task on a lead adds it to the lead's timeline.
  - **Appointments**: viewings, valuations, calls and meetings, entered by your team. Booking one moves an early-stage lead to Appointment booked (never backwards). Record the outcome (held, no-show, cancelled) afterwards. Calendar sync is phase 6.
  - **Interaction log**: record calls, emails, SMS, WhatsApp and meetings with direction and outcome. Outbound contact sets "last contacted" and moves a new lead to Contacted. The form warns when that channel is blocked for the lead.
- **Dashboard.**
  - Six headline figures for the chosen range: new leads, leads contacted, appointments booked, appointments held (with no-show rate), deals won (with commission) and open pipeline (with weighted commission).
  - New leads per day chart, conversion (new leads reaching an appointment, win rate, days to close, won value).
  - My tasks due, upcoming appointments, leads by stage, deal value by stage, contact activity by type, lead sources, team leaderboard and items needing attention.
  - Every figure comes from stored data, the calculations are explained on the page, and money totals use the workspace currency only.
- **Settings.** Workspace and contact window, team, pipeline, lead sources with provenance, audit log.
- **Billing** shows the plan and its enforced limits. **Integrations** lists what is not connected yet.
- **Platform admin console** (`/admin`). Lists organizations and lets you suspend them, with no access to their leads.

- **Outreach.**
  - **Templates** for email and SMS with `{{first_name}}`-style variables. A manager approves each one; editing approved text sends it back to draft.
  - **Send from a lead** (template or your own words). Eligibility is checked at the moment of sending; a blocked or needs-review message is recorded but never leaves the platform.
  - **Sequences** (Campaigns): up to 10 email/SMS steps with day delays. A runner every 15 minutes sends due steps and re-checks each one: outside contact hours waits, needs-review pauses that lead for a person ("Reviewed, resume"), blocked skips the step. Replies stop the sequence.
  - **Conversations** inbox with unread replies first.
  - **Opt-outs are automatic**: SMS STOP replies, email unsubscribe links (page and RFC 8058 one-click), bounces and complaints all become suppressions.
  - Every email carries your postal address and an unsubscribe link; every SMS identifies the sender and the STOP route.
  - **Usage is metered** per message and the plan quota is enforced before the provider is called.
- **AI lead assessment** (Claude): intent, readiness, financing, a 0–100 score from a fixed rubric, a summary, questions still to ask, and exact quotes as evidence. It sees no email or phone, treats lead text as data, and changes nothing until a person clicks Apply. Every run is logged with model and tokens.

- **Lead forms** (Settings → Lead forms) for the inbound funnel: a hosted page per form for ads, QR codes and social posts, plus an embeddable HTML/JSON endpoint. Submissions create or update the lead, assign it, add a timeline note, and record consent only for ticked boxes, with the exact wording, its version hash and the submission id. Honeypot, per-IP and per-form rate limits; IPs are stored only as a daily-salted hash.
- **Properties** with price, details, photo, listing link and video tour. **Share a property** from a lead's page by email or SMS (through the same eligibility check): the message carries a personal signed link, and the lead page shows when they opened it. Mark interested or not.

Each provider stays off until its keys are set; Integrations shows what is connected. Voice agents,
calendar sync and GoHighLevel are still to come and are visibly labelled with their phase.

## Verification done

- **56 unit tests** (`npm test`) on eligibility rules, normalisation, money, labels, import planning, templates, opt-out keywords, webhook signatures (Twilio, Resend/Svix), unsubscribe tokens, sequence decisions, form validation, signed property links and IP hashing.
- **5 SQL suites, 167 assertions** (`npm run test:db`), run against PostgreSQL 16 with all migrations applied. They cover:
  - isolation and permissions: tenant isolation, each role, platform admins, anon;
  - plan limits: seats and contacts;
  - lead data: dedupe, triggers, consent immutability, suppression;
  - workflows: import idempotency and erasure;
  - outreach: template approval, the no-send-without-allow guard, duplicate webhooks, replies stopping sequences, quotas and metering idempotency;
  - forms and properties: exact-wording consent, suppression, rate limits, view tracking, catalogue permissions;
  - CRM: deal close dates, appointment and interaction stage moves, rep visibility of deals, tasks and appointments, and dashboard figures.
- `npm run lint`, `npm run typecheck` and `npm run build` are clean.
- Production server smoke test:
  - every app route redirects to `/login` when signed out;
  - security headers are present;
  - the login page renders at 1280 px and at 390 px in dark mode, with no overflow and no console errors.
- **Not yet done:** no real email, SMS or AI call has been made (no provider keys here). The Twilio signature check follows Twilio's documented algorithm and matches an independently computed value, but has not been checked against a live Twilio request. Also not done: a browser walkthrough of the signed-in pages against a live Supabase stack.
  This container had no Docker, so Supabase Auth and PostgREST could not run here. The database
  logic is tested directly in SQL, but the pages themselves have only been type-checked and built.
  Do the walkthrough below before relying on them.

## Local development

Requirements: Node 20.9+, Docker, and the Supabase CLI (`npx supabase`).

```bash
cd acquire
npm install
npx supabase start          # Postgres, Auth, Mailpit on ports 553xx (no clash with finance-os)
cp .env.example .env.local  # paste the API URL, anon key and service_role key that `supabase start` printed
npm run dev                 # http://localhost:3000
```

Sign in with any email. Magic links arrive in Mailpit at http://127.0.0.1:55324. In development,
the onboarding screen can also create a **demo workspace** with labelled, made-up leads.

```bash
npm test                    # unit tests
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55322/postgres npm run test:db   # drops/recreates acquire_test
npm run lint && npm run typecheck && npm run build
```

### Suggested first walkthrough

1. Sign in and create a workspace.
2. Download the import template, add rows, and import them. Then re-import the same file and confirm nothing is duplicated.
3. Open a lead, record SMS consent with express written basis, and watch the eligibility panel change.
4. Record an opt-out. The lead moves to *Opted out* and every channel shows *Blocked*.
5. Invite a second user as a sales rep, assign them one lead, and sign in as them: they see only that lead.
6. Erase a lead and check that the audit log shows it as redacted.
7. Log a call on a new lead (it moves to Contacted), book a viewing (it moves to Appointment booked), open a deal, drag it to Closed won, and check the dashboard.
8. Set Settings → Sending, add the provider keys, approve a template, build a sequence, enroll a lead with recorded consent and run `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/jobs/run`.
