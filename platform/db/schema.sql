-- =============================================================================
-- AI Social Media Operating System — relational schema
--
-- Portability: written in the SQL subset shared by SQLite (dev/CI, via
-- node:sqlite) and PostgreSQL (production). TEXT is used for ids (ULID-ish),
-- timestamps (ISO-8601 UTC) and JSON payloads so the same DDL loads on both.
--
-- TENANCY RULE (enforced again in src/core/tenancy.js):
--   Every business row carries agency_id. Every client-owned row also carries
--   client_id. No query in the application layer may omit the agency_id
--   predicate; repositories refuse to build one that does.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- agency/auth
CREATE TABLE IF NOT EXISTS agencies (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  plan          TEXT NOT NULL DEFAULT 'starter',
  settings      TEXT NOT NULL DEFAULT '{}',          -- JSON: global settings
  automation_paused INTEGER NOT NULL DEFAULT 0,      -- global emergency stop
  paused_reason TEXT,
  paused_at     TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,                        -- scrypt, never plaintext
  role          TEXT NOT NULL,                        -- see core/rbac.js
  client_scope  TEXT NOT NULL DEFAULT '[]',           -- JSON array; [] = all clients
  notification_prefs TEXT NOT NULL DEFAULT '{}',
  last_login_at TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (agency_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id, status);

CREATE TABLE IF NOT EXISTS teams (
  id          TEXT PRIMARY KEY,
  agency_id   TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  member_ids  TEXT NOT NULL DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,                       -- opaque token hash
  agency_id   TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, status);

-- -------------------------------------------------------------------- clients
CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  company_name  TEXT,
  website       TEXT,
  industry      TEXT,
  location      TEXT,
  description   TEXT,
  products      TEXT NOT NULL DEFAULT '[]',
  target_audience TEXT,
  target_geography TEXT NOT NULL DEFAULT '[]',
  onboarding_step TEXT NOT NULL DEFAULT 'business',
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  automation_paused INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (agency_id, name)
);
CREATE INDEX IF NOT EXISTS idx_clients_agency ON clients(agency_id, status);

CREATE TABLE IF NOT EXISTS brand_profiles (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id     TEXT NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  tone          TEXT,
  personality   TEXT,
  formality     TEXT NOT NULL DEFAULT 'balanced',
  language      TEXT NOT NULL DEFAULT 'en',
  preferred_vocabulary TEXT NOT NULL DEFAULT '[]',
  words_to_avoid TEXT NOT NULL DEFAULT '[]',
  emoji_preference TEXT NOT NULL DEFAULT 'sparing',   -- none|sparing|liberal
  cta_style     TEXT,
  comment_style TEXT,
  compliance_notes TEXT,                              -- e.g. medical claims rules
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_pillars (
  id          TEXT PRIMARY KEY,
  agency_id   TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,                          -- educational|promotional|...
  description TEXT,
  target_share INTEGER NOT NULL DEFAULT 0,            -- % of calendar
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pillars_client ON content_pillars(agency_id, client_id, status);

CREATE TABLE IF NOT EXISTS keywords (
  id          TEXT PRIMARY KEY,
  agency_id   TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  term        TEXT NOT NULL,
  kind        TEXT NOT NULL,                          -- primary|secondary|product|industry|location|competitor|hashtag
  weight      INTEGER NOT NULL DEFAULT 50,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (client_id, term, kind)
);
CREATE INDEX IF NOT EXISTS idx_keywords_client ON keywords(agency_id, client_id, kind, status);

CREATE TABLE IF NOT EXISTS competitors (
  id          TEXT PRIMARY KEY,
  agency_id   TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  website     TEXT,
  handles     TEXT NOT NULL DEFAULT '{}',             -- JSON {platform: handle}
  notes       TEXT,
  last_checked_at TEXT,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_competitors_client ON competitors(agency_id, client_id, status);

-- ------------------------------------------------------------ social accounts
CREATE TABLE IF NOT EXISTS social_accounts (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL,
  external_id    TEXT,
  handle         TEXT,
  display_name   TEXT,
  -- Secrets are AES-256-GCM sealed (src/core/crypto.js) and NEVER serialised
  -- to any API response. See docs/SECURITY.md.
  access_token_enc  TEXT,
  refresh_token_enc TEXT,
  token_expires_at  TEXT,
  scopes         TEXT NOT NULL DEFAULT '[]',
  connection_status TEXT NOT NULL DEFAULT 'disconnected', -- connected|expired|revoked|error|disconnected
  api_status     TEXT NOT NULL DEFAULT 'unknown',          -- ok|degraded|rate_limited|error|unknown
  last_error     TEXT,
  last_sync_at   TEXT,
  automation_paused INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (client_id, platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_accounts_client ON social_accounts(agency_id, client_id, status);

CREATE TABLE IF NOT EXISTS oauth_states (
  id          TEXT PRIMARY KEY,
  agency_id   TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,
  verifier    TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- --------------------------------------------------------------- intelligence
CREATE TABLE IF NOT EXISTS trending_topics (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id      TEXT REFERENCES clients(id) ON DELETE CASCADE, -- NULL = agency-wide
  topic          TEXT NOT NULL,
  classification TEXT NOT NULL,                       -- TREND|NEWS|VIRAL|...
  trend_score    INTEGER NOT NULL DEFAULT 0,
  score_breakdown TEXT NOT NULL DEFAULT '{}',         -- recency/velocity/engagement/relevance/cross_platform
  velocity_pct   INTEGER,
  urgency        TEXT NOT NULL DEFAULT 'normal',      -- low|normal|high|critical
  why_it_matters TEXT,
  platforms      TEXT NOT NULL DEFAULT '[]',
  sources        TEXT NOT NULL DEFAULT '[]',          -- [{title,url,platform,published_at}]
  detected_at    TEXT NOT NULL,
  expires_at     TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trends_client ON trending_topics(agency_id, client_id, status, trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_trends_detected ON trending_topics(agency_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS social_posts (
  -- Raw observed public posts (from official APIs) that feed inspiration and
  -- competitor intelligence. Kept separate from our own published content.
  id           TEXT PRIMARY KEY,
  agency_id    TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE CASCADE,
  competitor_id TEXT REFERENCES competitors(id) ON DELETE SET NULL,
  platform     TEXT NOT NULL,
  external_id  TEXT,
  url          TEXT,
  author       TEXT,
  content_format TEXT,
  caption      TEXT,
  thumbnail_url TEXT,
  posted_at    TEXT,
  metrics      TEXT NOT NULL DEFAULT '{}',            -- views/likes/comments/shares
  topics       TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (platform, external_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_social_posts_client ON social_posts(agency_id, client_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS inspiration_items (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  social_post_id TEXT REFERENCES social_posts(id) ON DELETE SET NULL,
  platform       TEXT NOT NULL,
  url            TEXT,
  creator        TEXT,
  thumbnail_url  TEXT,
  topic          TEXT,
  content_format TEXT,                                -- reel|carousel|video|text|discussion
  language       TEXT,
  geography      TEXT,
  posted_at      TEXT,
  views          INTEGER DEFAULT 0,
  likes          INTEGER DEFAULT 0,
  comments       INTEGER DEFAULT 0,
  shares         INTEGER DEFAULT 0,
  engagement_rate REAL DEFAULT 0,
  viral_score    INTEGER NOT NULL DEFAULT 0,
  relevance_score INTEGER NOT NULL DEFAULT 0,
  hook           TEXT,
  caption_structure TEXT,
  cta            TEXT,
  why_it_worked  TEXT,
  suggested_adaptation TEXT,                          -- original concept, never a copy
  saved          INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inspiration_client ON inspiration_items(agency_id, client_id, status, viral_score DESC);

CREATE TABLE IF NOT EXISTS engagement_opportunities (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL,
  external_id    TEXT,
  url            TEXT,
  author         TEXT,
  excerpt        TEXT NOT NULL,
  context        TEXT,                                -- subreddit / group / thread title
  posted_at      TEXT,
  relevance_score    INTEGER NOT NULL DEFAULT 0,
  brand_fit_score    INTEGER NOT NULL DEFAULT 0,
  conversation_quality_score INTEGER NOT NULL DEFAULT 0,
  promotional_risk_score     INTEGER NOT NULL DEFAULT 0,
  spam_risk_score            INTEGER NOT NULL DEFAULT 0,
  recommended_action TEXT NOT NULL DEFAULT 'review',  -- engage|review|ignore
  reasoning      TEXT,
  source_trend_id TEXT REFERENCES trending_topics(id) ON DELETE SET NULL,
  source_published_content_id TEXT,                   -- set by the post-publish loop
  status         TEXT NOT NULL DEFAULT 'new',         -- new|queued|engaged|dismissed|expired
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (client_id, platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_opps_client ON engagement_opportunities(agency_id, client_id, status, relevance_score DESC);

CREATE TABLE IF NOT EXISTS generated_comments (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL REFERENCES engagement_opportunities(id) ON DELETE CASCADE,
  variant        TEXT NOT NULL,                       -- professional|conversational|expert
  body           TEXT NOT NULL,
  quality_score  INTEGER NOT NULL DEFAULT 0,
  quality_report TEXT NOT NULL DEFAULT '{}',          -- per-check results
  blocked        INTEGER NOT NULL DEFAULT 0,
  prompt_version_id TEXT,
  model          TEXT,
  edited_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'draft',       -- draft|in_review|approved|rejected|published
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_opp ON generated_comments(agency_id, opportunity_id, status);

CREATE TABLE IF NOT EXISTS published_comments (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  comment_id     TEXT NOT NULL REFERENCES generated_comments(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL REFERENCES engagement_opportunities(id) ON DELETE CASCADE,
  social_account_id TEXT REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform       TEXT NOT NULL,
  external_id    TEXT,
  url            TEXT,
  body           TEXT NOT NULL,
  body_fingerprint TEXT NOT NULL,                     -- duplicate/similarity guard
  published_at   TEXT,
  metrics        TEXT NOT NULL DEFAULT '{}',
  publish_method TEXT NOT NULL DEFAULT 'official_api',
  status         TEXT NOT NULL DEFAULT 'published',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pubcomments_client ON published_comments(agency_id, client_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_pubcomments_fp ON published_comments(client_id, body_fingerprint);

-- ------------------------------------------------------------------- content
CREATE TABLE IF NOT EXISTS content_ideas (
  id          TEXT PRIMARY KEY,
  agency_id   TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  angle       TEXT,
  pillar_id   TEXT REFERENCES content_pillars(id) ON DELETE SET NULL,
  format      TEXT,                                   -- reel|carousel|image|video|text|story|document|link
  hook        TEXT,
  outline     TEXT,
  platforms   TEXT NOT NULL DEFAULT '[]',
  source_trend_id TEXT REFERENCES trending_topics(id) ON DELETE SET NULL,
  source_inspiration_id TEXT REFERENCES inspiration_items(id) ON DELETE SET NULL,
  priority    INTEGER NOT NULL DEFAULT 50,
  status      TEXT NOT NULL DEFAULT 'idea',           -- idea|in_review|approved|scheduled|rejected|archived
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ideas_client ON content_ideas(agency_id, client_id, status, priority DESC);

CREATE TABLE IF NOT EXISTS scheduled_content (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  idea_id        TEXT REFERENCES content_ideas(id) ON DELETE SET NULL,
  social_account_id TEXT REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform       TEXT NOT NULL,
  content_type   TEXT NOT NULL,
  caption        TEXT,
  hook           TEXT,
  cta            TEXT,
  hashtags       TEXT NOT NULL DEFAULT '[]',
  media          TEXT NOT NULL DEFAULT '[]',          -- [{url,type,alt}]
  link_url       TEXT,
  scheduled_for  TEXT,                                -- ISO-8601 UTC
  timezone       TEXT NOT NULL DEFAULT 'UTC',
  time_source    TEXT NOT NULL DEFAULT 'manual',      -- manual|best_time|recurring_rule
  time_confidence INTEGER,
  safety_report  TEXT NOT NULL DEFAULT '{}',
  approval_status TEXT NOT NULL DEFAULT 'pending',    -- pending|approved|rejected|auto_approved
  approved_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_at    TEXT,
  automation_rule_id TEXT,
  content_fingerprint TEXT,
  -- DRAFT|AI_GENERATED|IN_REVIEW|APPROVED|SCHEDULED|PUBLISHING|PUBLISHED|FAILED|MANUAL_ACTION_REQUIRED
  status         TEXT NOT NULL DEFAULT 'DRAFT',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_client ON scheduled_content(agency_id, client_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_content(status, scheduled_for);

CREATE TABLE IF NOT EXISTS published_content (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  scheduled_content_id TEXT REFERENCES scheduled_content(id) ON DELETE SET NULL,
  social_account_id TEXT REFERENCES social_accounts(id) ON DELETE SET NULL,
  platform       TEXT NOT NULL,
  content_type   TEXT NOT NULL,
  caption        TEXT,
  hashtags       TEXT NOT NULL DEFAULT '[]',
  external_post_id TEXT,
  url            TEXT,
  scheduled_for  TEXT,
  published_at   TEXT,
  publish_method TEXT NOT NULL DEFAULT 'official_api', -- official_api|manual
  api_response   TEXT,
  metrics        TEXT NOT NULL DEFAULT '{}',
  metrics_synced_at TEXT,
  status         TEXT NOT NULL DEFAULT 'published',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_published_client ON published_content(agency_id, client_id, published_at DESC);

-- ------------------------------------------------------- automation & queues
CREATE TABLE IF NOT EXISTS automation_rules (
  id           TEXT PRIMARY KEY,
  agency_id    TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,                         -- autopilot|recurring_slot|engagement|thresholds
  platform     TEXT,
  config       TEXT NOT NULL DEFAULT '{}',
  -- manual | approval_required | controlled_auto
  mode         TEXT NOT NULL DEFAULT 'approval_required',
  paused       INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rules_client ON automation_rules(agency_id, client_id, kind, status);

CREATE TABLE IF NOT EXISTS publishing_jobs (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id     TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  scheduled_content_id TEXT REFERENCES scheduled_content(id) ON DELETE CASCADE,
  comment_id    TEXT REFERENCES generated_comments(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  kind          TEXT NOT NULL,                        -- post|comment
  attempt       INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 5,
  run_after     TEXT NOT NULL,
  last_error    TEXT,
  error_class   TEXT,                                 -- transient|permanent|manual_required
  retry_history TEXT NOT NULL DEFAULT '[]',
  result        TEXT,
  -- queued|running|succeeded|failed|dead_letter|manual_action_required|cancelled
  status        TEXT NOT NULL DEFAULT 'queued',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pubjobs_due ON publishing_jobs(status, run_after);

CREATE TABLE IF NOT EXISTS job_queue (
  -- Generic background work queue (research, scoring, analytics, briefs).
  id           TEXT PRIMARY KEY,
  agency_id    TEXT REFERENCES agencies(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  payload      TEXT NOT NULL DEFAULT '{}',
  priority     INTEGER NOT NULL DEFAULT 50,
  attempt      INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after    TEXT NOT NULL,
  locked_by    TEXT,
  locked_at    TEXT,
  last_error   TEXT,
  dedupe_key   TEXT,
  status       TEXT NOT NULL DEFAULT 'queued',        -- queued|running|succeeded|failed|dead_letter
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobq_due ON job_queue(status, run_after, priority DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobq_dedupe ON job_queue(dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS approval_items (
  id           TEXT PRIMARY KEY,
  agency_id    TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,                         -- content|comment|auto_post|trending_post|engagement
  subject_type TEXT NOT NULL,                         -- table name of the subject
  subject_id   TEXT NOT NULL,
  platform     TEXT,
  title        TEXT NOT NULL,
  preview      TEXT,
  risk_flags   TEXT NOT NULL DEFAULT '[]',
  quality_score INTEGER,
  assigned_to  TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at   TEXT,
  decision_note TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',       -- pending|approved|rejected|edited|expired
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (subject_type, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_approvals_queue ON approval_items(agency_id, status, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS action_ledger (
  -- Anti-spam accounting: one row per outward platform action attempt.
  id           TEXT PRIMARY KEY,
  agency_id    TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,
  action       TEXT NOT NULL,                         -- publish_post|publish_comment
  target_author TEXT,
  fingerprint  TEXT,
  occurred_at  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'recorded',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_window ON action_ledger(client_id, platform, action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_author ON action_ledger(client_id, target_author, occurred_at DESC);

-- ---------------------------------------------------- analytics & assistance
CREATE TABLE IF NOT EXISTS analytics (
  id           TEXT PRIMARY KEY,
  agency_id    TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform     TEXT,
  subject_type TEXT NOT NULL,                         -- published_content|published_comment|account
  subject_id   TEXT,
  metric_date  TEXT NOT NULL,                         -- YYYY-MM-DD
  metrics      TEXT NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (subject_type, subject_id, metric_date, platform)
);
CREATE INDEX IF NOT EXISTS idx_analytics_client ON analytics(agency_id, client_id, metric_date DESC);

CREATE TABLE IF NOT EXISTS ai_recommendations (
  id           TEXT PRIMARY KEY,
  agency_id    TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,                         -- daily_brief|learning|strategy|competitor
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  payload      TEXT NOT NULL DEFAULT '{}',
  confidence   INTEGER,
  agent        TEXT,
  prompt_version_id TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recs_client ON ai_recommendations(agency_id, client_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  agency_id    TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES users(id) ON DELETE CASCADE, -- NULL = whole agency
  kind         TEXT NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'info',          -- info|warning|critical
  title        TEXT NOT NULL,
  body         TEXT,
  link         TEXT,
  read_at      TEXT,
  status       TEXT NOT NULL DEFAULT 'unread',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(agency_id, user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id           TEXT PRIMARY KEY,
  agency_id    TEXT REFERENCES agencies(id) ON DELETE CASCADE, -- NULL = system default
  client_id    TEXT REFERENCES clients(id) ON DELETE CASCADE,
  agent        TEXT NOT NULL,
  task         TEXT NOT NULL,
  platform     TEXT,
  key          TEXT NOT NULL,                         -- e.g. brand_comment_prompt
  version      INTEGER NOT NULL DEFAULT 1,
  template     TEXT NOT NULL,
  notes        TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (agency_id, client_id, key, platform, version)
);
CREATE INDEX IF NOT EXISTS idx_prompts_lookup ON prompt_versions(key, agency_id, client_id, is_active);

CREATE TABLE IF NOT EXISTS agent_runs (
  id           TEXT PRIMARY KEY,
  agency_id    TEXT REFERENCES agencies(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE CASCADE,
  agent        TEXT NOT NULL,
  prompt_version_id TEXT REFERENCES prompt_versions(id) ON DELETE SET NULL,
  model        TEXT,
  input        TEXT,
  output       TEXT,
  tokens_in    INTEGER,
  tokens_out   INTEGER,
  duration_ms  INTEGER,
  error        TEXT,
  status       TEXT NOT NULL DEFAULT 'succeeded',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_runs ON agent_runs(agency_id, agent, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  agency_id    TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_id    TEXT REFERENCES clients(id) ON DELETE CASCADE,
  actor_type   TEXT NOT NULL,                         -- user|agent|system
  actor_id     TEXT,
  actor_label  TEXT,
  action       TEXT NOT NULL,
  object_type  TEXT,
  object_id    TEXT,
  platform     TEXT,
  previous_value TEXT,
  new_value    TEXT,
  result       TEXT NOT NULL DEFAULT 'success',       -- success|failure|blocked
  error        TEXT,
  ip           TEXT,
  occurred_at  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_agency ON audit_logs(agency_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_object ON audit_logs(object_type, object_id);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL
);
