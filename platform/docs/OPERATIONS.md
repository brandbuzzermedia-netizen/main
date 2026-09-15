# Operations

## Running it

```bash
cd platform
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # → CREDENTIAL_ENCRYPTION_KEY

npm run migrate     # apply the schema, seed system prompts
npm run seed        # optional: a demo agency with sample data
npm start           # API + web on :4000
npm run worker      # background worker — a separate process
```

Both processes are needed. The API enqueues; the worker does the work.

## Processes

| Process | Command | Scale |
| --- | --- | --- |
| API | `npm start` | horizontally, behind a load balancer |
| Worker | `npm run worker` | horizontally — claims are transactional, so workers never collide |

Give each worker a distinct `WORKER_ID`.

## The CLI

```bash
node src/cli.js migrate         # apply schema + seed system prompts (idempotent)
node src/cli.js seed --reset    # rebuild the demo agency
node src/cli.js tick            # run one scheduler tick by hand
node src/cli.js queue           # queue depth and dead-lettered jobs
```

## Health and monitoring

- `GET /api/health` — liveness, public.
- `GET /api/system/status` — AI provider, thresholds, limits, capability matrix,
  queue depth, dead-letter list. Requires `automation:read`.

Watch for:

| Signal | Means |
| --- | --- |
| `job_dead_lettered` | a job exhausted its retries — read `last_error` |
| `publishing_retry` rising | a platform is degraded or throttling |
| `token_refresh` failures | accounts need reconnecting |
| `automation_paused` notification | the abnormal-activity breaker fired |
| dead-letter count climbing | something systemic; check the platform status page |

Logs are JSON, one event per line, with secrets redacted by key name.

## The emergency stop

`POST /api/automation/pause-all`, or the red button in the sidebar. It stops
scheduled publishing, automated engagement, AI publishing jobs and queued
automation actions. **It deletes nothing** — scheduled content stays scheduled
and resumes where it left off.

Narrower controls: pause one client, one platform, or one content type.

## Backup and recovery

Back up the database. On SQLite that is the `.db` file plus its `-wal` and
`-shm` siblings; take it with `VACUUM INTO` or while the app is stopped, not
with a plain copy of a live WAL database.

The audit log and publishing log are the recovery record: after an incident they
show exactly what was published, when, by whom or by which agent, and what the
platform returned.

## Key rotation

Rotating `CREDENTIAL_ENCRYPTION_KEY` invalidates every stored token. Treat it as
a re-consent exercise: rotate, then have each client reconnect their accounts.
There is deliberately no automatic re-encryption path, because that would
require holding both keys at once.

## Deployment shape

```
        ┌──────────────┐
        │ Load balancer│  TLS terminates here
        └──────┬───────┘
               │
      ┌────────┴────────┐
      │  API  (n≥2)     │   stateless
      └────────┬────────┘
               │
        ┌──────┴──────┐
        │  Database   │   Postgres in production
        └──────┬──────┘
               │
      ┌────────┴────────┐
      │ Worker (n≥1)    │   needs outbound HTTPS to platform APIs
      └─────────────────┘
```

Requirements: outbound HTTPS from workers to the platform APIs and to the AI
provider; a stable `BASE_URL`, because it forms the OAuth redirect URIs
registered with each platform.

## Before going live

- [ ] `CREDENTIAL_ENCRYPTION_KEY` set from a secret manager, not a file
- [ ] `BASE_URL` matches the redirect URIs registered with every platform app
- [ ] `NODE_ENV=production` (session cookies become `Secure`)
- [ ] TLS terminating in front of the API
- [ ] Database backups running and *restored at least once* as a test
- [ ] Anti-spam ceilings reviewed against each platform's current published limits
- [ ] Every client's automation mode confirmed — `approval_required` is the default and should stay that way unless a client has explicitly asked otherwise
- [ ] `REDDIT_USER_AGENT` identifies your app and a contact account
- [ ] The demo agency removed (`DELETE FROM agencies WHERE slug = 'get-bee-seen'`)
