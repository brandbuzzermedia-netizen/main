# Automation architecture (OS → n8n)

Status: **built; runs in mock mode until n8n credentials are set.** Implemented in
migrations 12 and 15, `src/integrations/n8n/*`, `/api/automation/dispatch` (cron) and
`/api/automation/callback` (signed). The company emergency stop blocks run requests and the
dispatcher skips stopped companies.

## How a run flows today

1. A person (or later a record trigger) calls `request_automation_run` with an idempotency key.
   Disabled workflows and emergency-stopped companies are refused; a repeated key returns the
   existing run.
2. Workflows needing approval wait in `pending_approval`; an owner decides with `decide_automation_run`.
3. Every 5 minutes Vercel Cron calls `/api/automation/dispatch` (Bearer `CRON_SECRET`). It claims
   queued runs (`claim_automation_runs`, `FOR UPDATE SKIP LOCKED`) and POSTs to
   `N8N_BASE_URL/webhook/<path>` with `x-dp-timestamp`, `x-dp-nonce`, `x-dp-signature` =
   HMAC-SHA256(secret, `timestamp.nonce.body`).
4. n8n calls `/api/automation/callback` the same way. The OS rejects stale (>5 min), replayed
   (nonce stored) or badly signed requests, validates the payload, checks the run belongs to the
   named company, and records a final result once.
5. Failures appear in the failure queue. Only idempotent, non-financial workflows offer Retry.
6. "Test run" creates a mock run, completes it in-app and labels it mock; nothing is sent.

In n8n, the first node of each workflow must verify the same signature (Function node with the
shared secret) before doing anything.

## Roles of each system

* **The OS** holds configuration, approvals, run history and permissions. It decides whether a run
  may happen.
* **n8n** executes workflow steps. It never holds the source of truth for business records and
  writes back only through authenticated OS endpoints.

## Planned tables

`automation_definitions` (company, template key, enabled, approval policy, input mapping),
`automation_versions` (immutable config snapshots), `automation_runs` (workflow id, n8n execution
id, trigger source, status, durations, safe log metadata, idempotency key), `webhook_events`
(provider, signature-verified flag, payload hash, received/processed), `approvals` (requested
action, requester, approver, decision, expiry), `integration_connections` (status only; secrets
live in server env or a vault, never in rows readable by users).

## Request flow

1. Trigger (schedule, record change, user action) creates a pending `automation_run` with an
   idempotency key derived from (definition, subject record, trigger time bucket).
2. Gate checks: definition enabled, company not emergency-stopped, environment matches
   (dev/staging/prod workflows are separate), approval granted when the policy requires one.
3. OS server POSTs to the n8n webhook with HMAC-SHA256 over `timestamp.body`, a nonce and the
   idempotency key. n8n rejects stale timestamps (>5 min) and seen nonces.
4. n8n calls back to `/api/automation/callback` with its own HMAC; the OS validates schema with
   Zod, checks the company scope matches the run, and records the result once.
5. Failures go to a failure queue with retry/backoff. Non-idempotent financial actions are never
   retried automatically; they become a human task.

## Rules carried from the brief

High-volume outreach, financial changes, refunds and irreversible operations always need
approval. Employees cannot edit shared credentials. Mock mode runs are labelled "Mock" in run
history and never call providers. Templates 1–15 from the brief ship disabled until credentials,
mappings and owner approval exist; restaurant and e-commerce sync only after a supported
integration is confirmed.
