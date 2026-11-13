# Automation architecture (OS → n8n)

Status: **design only. Nothing runs automatically yet.** Build phase 8. What exists today is the
company **emergency stop** flag (`organizations.emergency_stop`, set via `set_emergency_stop`,
audited) which every future run must check first.

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
