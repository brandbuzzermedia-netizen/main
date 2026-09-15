# Architecture

## What this is

A multi-tenant AI social media operating system for a marketing agency. One
agency manages many clients; each client's data, accounts, brand voice,
research and automation are isolated from every other client's.

It is not a scheduler with AI bolted on. The scheduler is one stage in a loop:

```
social intelligence → trend detection → inspiration → content strategy
  → AI content creation → platform adaptation → brand safety
  → approval / autopilot → scheduling → publishing → verification
  → engagement opportunities → comment drafting → approval
  → performance data → analysis → strategy → next content
```

## Service layout

```
  Browser (SPA, web/)
        │  JSON over HTTPS, session cookie
        ▼
  ┌───────────────────────────────────────────────┐
  │ API (src/server.js)                           │
  │  auth → RBAC → tenancy → validation → handler │
  └───────────────────────────────────────────────┘
        │                              │
        │ enqueue                      │ read/write
        ▼                              ▼
  ┌──────────────┐              ┌──────────────┐
  │ Job queue    │◄─────────────│ Database     │
  │ (jobs/)      │              │ (db/)        │
  └──────────────┘              └──────────────┘
        │ claim
        ▼
  ┌───────────────────────────────────────────────┐
  │ Worker (src/worker.js) — three lanes          │
  │  1. scheduler tick                            │
  │  2. research / analysis jobs                  │
  │  3. publishing jobs                           │
  └───────────────────────────────────────────────┘
        │                    │                  │
        ▼                    ▼                  ▼
   Research engine      AI orchestration   Publishing engine
   (engines/)           (ai/agents/)       (services/publishing.js)
        │                                        │
        └──────────────► Platform adapters ◄─────┘
                         (platforms/)
                              │
                         Official platform APIs
```

**The API never does expensive work.** A request that would need research,
model calls or a platform round trip enqueues a job and returns immediately with
a job id. The only model calls inside a request are the ones a person is waiting
on and explicitly asked for — drafting replies, generating ideas, the assistant.

## Layers

| Layer | Path | Responsibility |
| --- | --- | --- |
| Core | `src/core/` | ids, errors, crypto, RBAC, tenancy, validation, audit, anti-spam, HTTP |
| Data | `src/db/` | connection, schema, tenant-scoped repository |
| Platforms | `src/platforms/` | one adapter per platform behind a single contract |
| AI | `src/ai/` | provider, versioned prompts, agent framework, the eight agents |
| Engines | `src/engines/` | trend scoring, engagement scoring, quality, safety, timing, hashtags, adaptation, research, analytics |
| Services | `src/services/` | credentials, approvals, publishing, content, engagement, notifications |
| Jobs | `src/jobs/` | queue, scheduler, handlers |
| API | `src/api/` | request context and route modules |
| Web | `web/` | the SPA |

Dependencies point downward. An engine never imports a route; a route never
talks to a platform directly.

## Tenant isolation

Two independent layers, because one is not enough:

1. **Repository.** Every query goes through `src/db/repo.js`, which requires an
   `agencyId` and refuses to build a query without the tenant predicate.
   `rawScoped` additionally refuses SQL that does not filter on `agency_id`.
2. **Request.** Every route that names a client passes it through
   `assertClientAccess`, which checks the agency boundary *and* the user's
   `client_scope`. A cross-tenant id returns 404, never 403 — a 403 would
   confirm the id exists somewhere else.

Tested in `test/tenancy.test.js`.

## Database

Dev and CI run on SQLite through Node's built-in `node:sqlite` driver, so the
platform has **no runtime dependencies**. The schema and every query are written
in the SQL subset shared with PostgreSQL.

To move to Postgres in production, `src/db/index.js` is the only file that
changes: swap `DatabaseSync` for a `pg` pool, and make `all`/`one`/`run`/`tx`
async. The repository layer, and therefore everything above it, is unaffected.
The one SQLite-specific construct in the schema is the partial unique index on
`job_queue.dedupe_key`, which Postgres supports with identical syntax.

At Postgres scale, also move the job queue to Redis or SQS by reimplementing the
four functions in `src/jobs/queue.js` (`enqueue`, `claim`, `complete`, `failJob`).

## Job queue

At-least-once delivery. Claims happen inside a transaction so two workers cannot
take the same job. Failures retry with exponential backoff (1, 2, 4, … capped at
60 minutes) and dead-letter after `max_attempts`. Jobs whose worker died are
reclaimed after 15 minutes. `dedupe_key` stops the same work being queued twice.

Publishing has its own lane so slow research never delays a post, and its own
retry classification: transient (retry), permanent (stop), manual-required
(surface to a person).

## Scheduled work

| Cadence | Job |
| --- | --- |
| every 15–60 min | trend detection |
| every 1–3 h | engagement discovery |
| daily | client briefing, recurring slots, learning loop |
| after publication | engagement research, metrics sync |
| weekly | competitor analysis |
| monthly | performance report |

A paused client or agency gets nothing enqueued — research is automation too.

## Failure handling

- **Transient** (429, 5xx, timeout): exponential backoff, floored by the
  platform's own `Retry-After`. Never retried faster than the platform asks.
- **Permanent** (400, 403, validation): stops immediately with the platform's
  own message.
- **Manual required**: the platform has no official API path. Status becomes
  `MANUAL_ACTION_REQUIRED` with instructions. No workaround is attempted.

## Observability

Structured JSON logs, one event per line, with a redaction filter that strips
anything matching `password|token|secret|_enc|authorization|cookie|api_key`.
Every request carries a request id. Every agent run is recorded in `agent_runs`
with its prompt version, model, duration and outcome. Every significant action
is in `audit_logs` with before/after values.

## Testing

`npm test` runs the suite on an in-memory database with the offline AI provider,
so it needs no network and no API key. Coverage focuses on the properties that
matter: tenant isolation, credential handling, RBAC, the scoring engines, the
adapter contract, and the approval/publishing gates.
