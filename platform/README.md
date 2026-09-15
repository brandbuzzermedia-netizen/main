# Social OS

A multi-tenant **AI social media operating system** for a marketing agency.
One agency, many clients, each fully isolated.

Not a scheduler. It continuously researches what is trending, finds content
worth learning from, identifies conversations worth joining, drafts content and
replies, checks them against brand and safety rules, routes them to a person for
approval, publishes through official APIs, and feeds the results back into the
next cycle.

```bash
cd platform
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # → CREDENTIAL_ENCRYPTION_KEY

npm run migrate
npm run seed      # demo agency with sample data
npm start         # http://localhost:4000
npm run worker    # in a second terminal
```

Sign in with `get-bee-seen` / `admin@getbeeseen.test` / the `DEMO_PASSWORD`.

**No dependencies, no build step.** Node 22.5+ only — the database is Node's
built-in `node:sqlite`, and the frontend is plain ES modules.

**No API key needed to try it.** Without `ANTHROPIC_API_KEY` the system runs on
a deterministic offline provider: every feature works, with heuristic copy
instead of model-written copy.

## What it does

| | |
| --- | --- |
| **Trend engine** | Scores signals 0-100 from recency, velocity, engagement, client relevance and cross-platform spread — and shows the breakdown, so a score can be argued with |
| **Inspiration engine** | Explains *why* public content performed, and proposes an original adaptation. Never a copy |
| **Engagement engine** | Finds conversations where the client genuinely has something to add, scored on relevance, brand fit, conversation quality, promotional risk and spam risk |
| **Comment writer** | Three alternatives per opportunity, each through ten quality checks before a person sees it |
| **Content engine** | "Plan next week's Instagram content" → trends → ideas → platform-specific copy → best posting time → safety gate → approval queue |
| **Publishing engine** | Official APIs only, with verification, retry classification and a full publishing log |
| **Post-publish loop** | Extracts topics, finds related conversations, drafts replies, tracks performance |
| **Learning loop** | Feeds the client's own results back into the next recommendation |
| **Approval centre** | The default path for everything. Bulk actions require explicit confirmation |
| **Emergency stop** | One button halts all automation everywhere. Deletes nothing |

## The rules it will not break

Official APIs only. No scraping of protected surfaces, no automated browser
sessions, no CAPTCHA handling, no undocumented endpoints, no rate-limit evasion,
no fake accounts, no impersonation, no manufactured engagement, no mass
commenting.

When a platform offers no official path, the system says
`MANUAL_ACTION_REQUIRED` and routes the work to a person. It does not build a
workaround. See [docs/SECURITY.md](docs/SECURITY.md#what-is-deliberately-not-implemented).

Human approval is the default for everything. "Controlled auto" is opt-in per
client and per platform, requires scores well above the review thresholds, and
is refused outright on Reddit and Quora.

## Layout

```
platform/
├── db/schema.sql        27 tables, tenant-scoped, Postgres-portable
├── src/
│   ├── core/            ids, errors, crypto, RBAC, tenancy, validation, audit, anti-spam
│   ├── db/              connection + the repository that enforces tenant scope
│   ├── platforms/       PlatformAdapter + 8 adapters
│   ├── ai/              provider, versioned prompts, agent framework, 8 agents
│   ├── engines/         trend, engagement, quality, safety, timing, hashtags, adaptation, research, analytics
│   ├── services/        credentials, approvals, publishing, content, engagement, notifications
│   ├── jobs/            queue, scheduler, handlers
│   ├── api/             request context + route modules
│   ├── server.js        HTTP API and static hosting
│   └── worker.js        background worker
├── web/                 the SPA
├── test/                71 tests, no network, no API key
└── docs/
```

## Documentation

| | |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | services, data flow, tenant isolation, queue, Postgres migration path |
| [SECURITY.md](docs/SECURITY.md) | credentials, auth, RBAC, validation, and what is deliberately not implemented |
| [PLATFORMS.md](docs/PLATFORMS.md) | the adapter contract, the capability matrix, adding a platform |
| [AGENTS.md](docs/AGENTS.md) | the eight agents, schemas, prompt management |
| [API.md](docs/API.md) | every endpoint |
| [OPERATIONS.md](docs/OPERATIONS.md) | running, monitoring, backup, the go-live checklist |
| [ROADMAP.md](docs/ROADMAP.md) | what is built, what is partial, and the known limits |

## Tests

```bash
npm test     # 71 tests: tenancy, credentials, RBAC, engines, adapters, workflow
```

They run on an in-memory database with the offline provider — no network, no key.
