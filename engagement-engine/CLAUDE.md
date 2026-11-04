@AGENTS.md

# GBS Engagement Engine — notes for agents

- Read `docs/architecture.md` first. Client isolation is the core invariant.
- Every client-owned table has `organization_id` + `client_id`, a composite FK to
  `clients (id, organization_id)`, and sibling references by `(id, client_id)`.
  New tables must follow this and get RLS policies in a new migration.
- Request code reads/writes through `withUser` / `inClient` (RLS as `gbs_app`).
  `withSystem` is only for auth, tokens, notifications and background jobs, and
  must filter by `client_id` explicitly.
- AI context comes only from `loadClientAiContext` (`src/lib/ai/context.ts`).
- Platform adapters implement only official API capabilities; never add scraping
  or browser automation. Unsupported → `ManualActionRequired` / `UnsupportedCapabilityError`.
- Approval is enforced in the database (`comments_guard`, `publishing_jobs_guard`).
  Don't add any path that publishes an unapproved comment.
- Never edit an applied migration; add `db/migrations/NNNN_*.sql`.
- Checks: `npm run typecheck && npm run lint && TEST_DATABASE_URL=… npm test`.
