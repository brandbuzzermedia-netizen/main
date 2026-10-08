# Database schema

PostgreSQL 15+ (Supabase-compatible). Source of truth:
`db/migrations/0001_schema.sql` (tables) and `db/migrations/0002_security.sql`
(RLS, grants, triggers). Apply with `npm run db:migrate`.

## Tenancy rules

1. **Every client-owned table has `organization_id` and `client_id`**, both
   `NOT NULL`, and
   `FOREIGN KEY (client_id, organization_id) REFERENCES clients (id, organization_id)`.
2. **Every client-owned parent has `UNIQUE (id, client_id)`** and children
   reference the pair, e.g. `FOREIGN KEY (campaign_id, client_id) REFERENCES campaigns (id, client_id)`.
   A cross-client reference is a constraint violation.
3. **Tenancy columns are immutable**: the `freeze_tenancy` trigger rejects any
   update that changes `organization_id` or `client_id`.
4. **RLS is enabled on every table** the app role can touch. Tables holding
   secrets (`oauth_tokens`, `oauth_states`, `sessions`, `rate_limits`) have RLS
   on and **no grants** to `gbs_app`.

Organisation-level tables (`organizations`, `users`) are scoped by
`organization_id`; `notifications` and `audit_logs` have a nullable
`client_id` because some events are organisation-wide.

## Tables

| Table | Purpose | Key columns |
| --- | --- | --- |
| `organizations` | Agency tenant (GBS); white-label branding and AI settings | `branding` jsonb (`brand_name`, `logo_url`, `primary_color`, `email_sender`, `custom_domain`), `ai_settings` jsonb |
| `users` | Every login: GBS staff and client users | `platform_role` (`super_admin` / `account_manager` / `client_user`), `password_hash` (scrypt; not readable by `gbs_app`), `status` |
| `sessions` | Opaque session tokens (SHA-256 stored) | `token_hash`, `expires_at` |
| `rate_limits` | Fixed-window counters | `key`, `window_start`, `count` |
| `clients` | The isolation boundary | `status`, `approval_mode` (`manual`/`gbs`/`dual`, default `manual`), `publish_on_approval` (default false), onboarding progress |
| `client_users` | Client portal membership | `role` (`owner`/`member`), `can_approve`, `can_edit`, `receives_approval_requests` |
| `account_managers` | GBS staff ↔ client assignment | `is_primary` |
| `social_accounts` | Connected platform accounts, one client each | `platform`, `external_account_id` (unique per organisation while connected), `status`, `scopes`, `metadata` |
| `oauth_tokens` | AES-256-GCM encrypted tokens bound to `client_id:social_account_id` | `access_token_enc`, `refresh_token_enc`, `key_version`, `expires_at` |
| `oauth_states` | Single-use OAuth `state` bound to user + client | `state_hash`, `code_verifier`, `expires_at` |
| `brand_profiles` | One per client | company facts, voice (`brand_personality`, `tone`, `language`, `comment_length`, `cta_style`, `emoji_policy`), guard-rails (`words_to_use`, `words_to_avoid`, `topics_to_avoid`, `competitors`, `claims_requiring_approval`), `keywords`, `hashtags` |
| `brand_documents` | Uploaded guidelines/profiles/catalogues as extracted text; AI context for that client only | `kind`, `content_text` |
| `audience_segments` | Unlimited per client | `industries`, `job_titles`, `locations`, `interests` |
| `audience_keywords` | Keywords, hashtags and negative keywords per segment | `kind`, `weight` |
| `target_profiles` | Accounts the client wants to engage with | `platform`, `handle`, `priority` |
| `campaigns` | One client, one or more segments and platforms | `keywords`, `hashtags`, `locations`, `daily_opportunity_limit`, `daily_publish_limit`, `min_score`, `approval_mode` override, `status` |
| `campaign_segments`, `campaign_target_profiles` | Campaign joins (composite FKs keep them in-client) | |
| `posts` | Content found for a client (stored per client, never shared) | author fields, `content`, `media`, `metrics`, `posted_at`, `source` (`api`/`manual`/`seed`) |
| `engagement_opportunities` | A post (or a comment in a thread) worth engaging with | `opportunity_type`, `publish_capability` (`api`/`manual`), `status`, `score`, `score_label`, `score_breakdown`, `explanation`, `topic` |
| `comment_generations` | One AI run (three variants) | `provider`, `model`, `prompt_version`, `context_hash`, tokens, `analysis` |
| `comments` | Each variant | `comment_type` (`insight`/`conversation`/`expert`), `original_text`, `current_text`, `is_edited`, `is_selected`, `status`, `quality_score`, `quality_passed`, `quality_report`, `embedding` |
| `comment_edits` | Edit history and team-member suggestions | `kind` (`edit`/`suggestion`), `previous_text`, `new_text`, `editor_id` |
| `comment_approvals` | One row per approving side | `approver_side` (`gbs`/`client`), `decision` |
| `publishing_jobs` | Queue | `status` (`queued`/`publishing`/`published`/`failed`/`cancelled`/`manual_required`), `scheduled_for`, `attempts`, `locked_at` |
| `publishing_results` | Each attempt's outcome | `success`, `method` (`api`/`manual`), `external_comment_id`, `error_*` |
| `engagement_metrics` | Per comment per day, or per account per day | `likes`, `replies`, `profile_visits`, `followers`, `leads`, `impressions` |
| `usage_limits` | Internal limits per client (`platform = 'all'` or a platform) | `daily_opportunity_limit`, `daily_publish_limit`, `min_minutes_between_comments`, `monthly_ai_generation_limit` |
| `usage_events` | Billing/usage meter | `kind`, `platform`, `quantity` |
| `notifications` | Per user, optionally per client | `kind`, `title`, `link`, `read_at` |
| `daily_reports` | Per client per day | `data` jsonb |
| `audit_logs` | Append-only trail | `actor_name`, `action`, `entity_type`, `entity_id`, `campaign_id`, `details` |

## RLS helper functions (`app` schema)

| Function | True when the current user… |
| --- | --- |
| `app.uid()` | (returns `app.user_id` from the transaction) |
| `app.current_org()` | (returns the user's organisation) |
| `app.is_super_admin()` / `app.is_staff()` | has that platform role and is active |
| `app.is_gbs_manager(client)` | is a super admin of the client's organisation, or an account manager assigned to it |
| `app.can_access_client(client)` | is a GBS manager of it, or a member of it |
| `app.can_manage_client(client)` | is a GBS manager of it, or its owner |
| `app.can_approve_gbs(client)` | is a GBS manager of it |
| `app.can_approve_client(client)` | is its owner, or a member with `can_approve` |
| `app.can_edit_comments(client)` | is a GBS manager, the owner, or a member with `can_edit` |

## Policy summary

| Table(s) | Read | Write |
| --- | --- | --- |
| `clients` | `can_access_client` | insert/delete: super admin; update: `can_manage_client` (approval mode, status and publishing behaviour are GBS-only via trigger) |
| configuration (`brand_*`, `audience_*`, `target_profiles`, `campaigns*`, `social_accounts`) | `can_access_client` | `can_manage_client` |
| engine (`posts`, `engagement_opportunities`, `comment_generations`, `engagement_metrics`, `daily_reports`) | `can_access_client` | `can_manage_client` |
| `comments` | `can_access_client` | insert: `can_manage_client`; update: editors and approvers (trigger enforces transitions) |
| `comment_edits` | `can_access_client` | suggestions: anyone on the client; edits: `can_edit_comments` |
| `comment_approvals` | `can_access_client` | insert only, as yourself, on a side you are entitled to |
| `publishing_jobs` | `can_access_client` | approvers (trigger: comment must be approved) |
| `usage_limits` | `can_access_client` | GBS managers |
| `notifications` | own rows only | mark read / delete own |
| `audit_logs` | super admin, or managers of that client | insert as yourself; never update/delete |
| `oauth_tokens`, `oauth_states`, `sessions`, `rate_limits` | — | — (service connection only) |

## Integrity triggers

| Trigger | Rule |
| --- | --- |
| `comments_guard` | Legal status transitions only. `→ approved` requires `app.comment_fully_approved()` for the effective approval mode. `queued`/`publishing`/`published` require `approved_at`. Text edits only before approval; an edit sets `is_edited` and deletes existing approvals. Only approvers can reject. |
| `comments_insert_guard` | New comments are always unapproved drafts. |
| `comment_approvals_guard` | Approvals only on comments pending approval. |
| `publishing_jobs_guard` | A job can only be created for an approved comment of the same client and platform. |
| `clients_guard` | Only GBS managers change `approval_mode`, `status`, `publish_on_approval`. |
| `audit_logs_immutable` | No updates or deletes (except clearing `client_id` when a client is deleted). |
| `*_freeze_tenancy` | `organization_id` and `client_id` never change. |

## Connection model

```ts
await client.query("begin");
await client.query("select set_config('app.user_id', $1, true)", [userId]);
await client.query("set local role gbs_app");
// … all request queries, filtered by RLS …
await client.query("commit");
```

The service connection (used for login, OAuth token storage, the publishing
worker and notifications) runs without `SET ROLE`. In production, give it a
dedicated login role that owns the schema and is a member of `gbs_app`, not a
superuser.
