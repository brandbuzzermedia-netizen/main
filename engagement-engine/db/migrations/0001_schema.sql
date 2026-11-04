-- GBS Engagement Engine — core schema
-- Every client-owned table carries organization_id + client_id and references
-- clients(id, organization_id). Sibling references use (id, client_id) pairs so a
-- row can never point at another client's data.

create extension if not exists pgcrypto;

create schema if not exists app;

-- ───────────────────────────── Roles ─────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'gbs_app') then
    create role gbs_app nologin noinherit;
  end if;
end $$;

-- The connecting role must be able to SET ROLE gbs_app.
do $$
begin
  execute format('grant gbs_app to %I', current_user);
exception when others then null;
end $$;

-- ───────────────────────────── Organisations & users ─────────────────────────────
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  -- White-label: brand_name, logo_url, primary_color, email_sender, custom_domain
  branding      jsonb not null default '{}'::jsonb,
  -- AI settings: model, effort, max_documents_chars
  ai_settings   jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create table users (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  email            text not null,
  full_name        text not null,
  password_hash    text not null,
  platform_role    text not null check (platform_role in ('super_admin','account_manager','client_user')),
  status           text not null default 'active' check (status in ('active','disabled')),
  last_login_at    timestamptz,
  created_at       timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index users_email_key on users (lower(email));

create table sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

create table rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (key, window_start)
);

-- ───────────────────────────── Clients ─────────────────────────────
create table clients (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null,
  slug             text not null,
  industry         text,
  status           text not null default 'onboarding'
                   check (status in ('onboarding','active','paused','archived')),
  -- manual = client approves; gbs = GBS account manager approves; dual = both
  approval_mode    text not null default 'manual' check (approval_mode in ('manual','gbs','dual')),
  -- After approval, publish via the worker (true) or wait for a person to press Publish (false).
  publish_on_approval boolean not null default false,
  onboarding_step  integer not null default 1 check (onboarding_step between 1 and 12),
  onboarding_completed_steps integer[] not null default '{}',
  timezone         text not null default 'Asia/Kolkata',
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  archived_at      timestamptz,
  unique (id, organization_id),
  unique (organization_id, slug)
);

create table client_users (
  organization_id  uuid not null,
  client_id        uuid not null,
  user_id          uuid not null references users(id) on delete cascade,
  role             text not null check (role in ('owner','member')),
  can_approve      boolean not null default false,
  -- Owners always edit; members suggest edits unless granted can_edit.
  can_edit         boolean not null default false,
  receives_approval_requests boolean not null default true,
  created_at       timestamptz not null default now(),
  primary key (client_id, user_id),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);
create index client_users_user_idx on client_users (user_id);

create table account_managers (
  organization_id  uuid not null,
  client_id        uuid not null,
  user_id          uuid not null references users(id) on delete cascade,
  is_primary       boolean not null default false,
  created_at       timestamptz not null default now(),
  primary key (client_id, user_id),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);
create index account_managers_user_idx on account_managers (user_id);

-- ───────────────────────────── Social accounts & tokens ─────────────────────────────
create table social_accounts (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null,
  client_id            uuid not null,
  platform             text not null check (platform in ('instagram','facebook','linkedin','youtube','x','tiktok')),
  external_account_id  text not null,
  handle               text,
  display_name         text,
  account_type         text,          -- business | creator | page | organization | member | channel
  status               text not null default 'connected'
                       check (status in ('connected','expired','disconnected','error')),
  scopes               text[] not null default '{}',
  -- Platform-specific non-secret metadata (e.g. page id for an IG account, org URN).
  metadata             jsonb not null default '{}'::jsonb,
  connected_by         uuid references users(id) on delete set null,
  connected_at         timestamptz not null default now(),
  last_synced_at       timestamptz,
  last_published_at    timestamptz,
  unique (id, client_id),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);
-- One external account belongs to exactly one client in an organisation.
create unique index social_accounts_external_key
  on social_accounts (organization_id, platform, external_account_id)
  where status <> 'disconnected';

create table oauth_tokens (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  client_id           uuid not null,
  social_account_id   uuid not null,
  -- AES-256-GCM, AAD = client_id:social_account_id
  access_token_enc    text not null,
  refresh_token_enc   text,
  key_version         integer not null default 1,
  expires_at          timestamptz,
  refresh_expires_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (social_account_id),
  foreign key (social_account_id, client_id) references social_accounts(id, client_id) on delete cascade,
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

create table oauth_states (
  state_hash       text primary key,
  organization_id  uuid not null,
  client_id        uuid not null,
  user_id          uuid not null references users(id) on delete cascade,
  platform         text not null,
  code_verifier    text,
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

-- ───────────────────────────── Brand ─────────────────────────────
create table brand_profiles (
  id                         uuid primary key default gen_random_uuid(),
  organization_id            uuid not null,
  client_id                  uuid not null unique,
  company_name               text not null default '',
  website                    text,
  industry                   text,
  description                text,
  products                   text[] not null default '{}',
  services                   text[] not null default '{}',
  usp                        text,
  target_market              text,
  location                   text,
  business_model             text not null default 'b2b' check (business_model in ('b2b','b2c','both')),
  brand_personality          text[] not null default '{}',
  tone                       text[] not null default '{}',
  language                   text not null default 'English',
  comment_length             text not null default 'medium' check (comment_length in ('short','medium','long')),
  cta_style                  text not null default 'none' check (cta_style in ('none','soft','direct')),
  emoji_policy               text not null default 'sparing' check (emoji_policy in ('none','sparing','allowed')),
  words_to_use               text[] not null default '{}',
  words_to_avoid             text[] not null default '{}',
  topics_to_avoid            text[] not null default '{}',
  competitors                text[] not null default '{}',
  claims_requiring_approval  text[] not null default '{}',
  keywords                   text[] not null default '{}',
  hashtags                   text[] not null default '{}',
  updated_by                 uuid references users(id) on delete set null,
  updated_at                 timestamptz not null default now(),
  unique (id, client_id),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

create table brand_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  client_id        uuid not null,
  kind             text not null check (kind in ('brand_guidelines','company_profile','product_catalog','marketing')),
  title            text not null,
  file_name        text not null,
  mime_type        text not null,
  size_bytes       integer not null,
  content_text     text not null,
  uploaded_by      uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (id, client_id),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

-- ───────────────────────────── Audience ─────────────────────────────
create table audience_segments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  client_id        uuid not null,
  name             text not null,
  description      text,
  industries       text[] not null default '{}',
  job_titles       text[] not null default '{}',
  locations        text[] not null default '{}',
  interests        text[] not null default '{}',
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, client_id),
  unique (client_id, name),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

create table audience_keywords (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  client_id        uuid not null,
  segment_id       uuid not null,
  keyword          text not null,
  kind             text not null default 'keyword' check (kind in ('keyword','hashtag','negative')),
  weight           numeric(3,2) not null default 1.0,
  unique (segment_id, kind, keyword),
  foreign key (segment_id, client_id) references audience_segments(id, client_id) on delete cascade,
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

create table target_profiles (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  client_id        uuid not null,
  segment_id       uuid,
  platform         text not null check (platform in ('instagram','facebook','linkedin','youtube','x','tiktok')),
  handle           text not null,
  display_name     text,
  profile_url      text,
  external_id      text,
  notes            text,
  priority         integer not null default 2 check (priority between 1 and 3),
  created_at       timestamptz not null default now(),
  unique (id, client_id),
  unique (client_id, platform, handle),
  foreign key (segment_id, client_id) references audience_segments(id, client_id) on delete set null (segment_id),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

-- ───────────────────────────── Campaigns ─────────────────────────────
create table campaigns (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null,
  client_id                 uuid not null,
  name                      text not null,
  objective                 text,
  platforms                 text[] not null default '{}',
  keywords                  text[] not null default '{}',
  hashtags                  text[] not null default '{}',
  locations                 text[] not null default '{}',
  daily_opportunity_limit   integer not null default 30 check (daily_opportunity_limit between 0 and 500),
  daily_publish_limit       integer not null default 5 check (daily_publish_limit between 0 and 100),
  min_score                 integer not null default 55 check (min_score between 0 and 100),
  -- null = use client approval mode
  approval_mode             text check (approval_mode in ('manual','gbs','dual')),
  status                    text not null default 'paused' check (status in ('active','paused','archived')),
  last_discovery_at         timestamptz,
  created_by                uuid references users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (id, client_id),
  unique (client_id, name),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

create table campaign_segments (
  organization_id  uuid not null,
  client_id        uuid not null,
  campaign_id      uuid not null,
  segment_id       uuid not null,
  primary key (campaign_id, segment_id),
  foreign key (campaign_id, client_id) references campaigns(id, client_id) on delete cascade,
  foreign key (segment_id, client_id) references audience_segments(id, client_id) on delete cascade,
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

create table campaign_target_profiles (
  organization_id    uuid not null,
  client_id          uuid not null,
  campaign_id        uuid not null,
  target_profile_id  uuid not null,
  primary key (campaign_id, target_profile_id),
  foreign key (campaign_id, client_id) references campaigns(id, client_id) on delete cascade,
  foreign key (target_profile_id, client_id) references target_profiles(id, client_id) on delete cascade,
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

-- ───────────────────────────── Posts & opportunities ─────────────────────────────
-- Posts are stored per client: the same public post found for two clients is two rows.
create table posts (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  client_id           uuid not null,
  platform            text not null,
  external_post_id    text not null,
  url                 text,
  author_handle       text,
  author_name         text,
  author_external_id  text,
  author_bio          text,
  author_followers    integer,
  author_is_business  boolean,
  content             text not null default '',
  media               jsonb not null default '[]'::jsonb,
  metrics             jsonb not null default '{}'::jsonb,   -- likes, comments, shares, views
  posted_at           timestamptz,
  source              text not null default 'api' check (source in ('api','manual','seed')),
  fetched_at          timestamptz not null default now(),
  unique (id, client_id),
  unique (client_id, platform, external_post_id),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

create table engagement_opportunities (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null,
  client_id             uuid not null,
  campaign_id           uuid not null,
  post_id               uuid not null,
  segment_id            uuid,
  social_account_id     uuid,
  platform              text not null,
  opportunity_type      text not null default 'third_party_post'
                        check (opportunity_type in ('third_party_post','own_post_comment','mention','manual')),
  -- External id of the comment being replied to, when replying inside a thread.
  reply_to_external_id  text,
  reply_to_text         text,
  reply_to_author       text,
  publish_capability    text not null default 'manual' check (publish_capability in ('api','manual')),
  status                text not null default 'discovered'
                        check (status in ('discovered','analyzed','comment_generated','pending_approval',
                                          'approved','queued','published','rejected','dismissed','failed')),
  score                 integer check (score between 0 and 100),
  score_label           text,
  score_breakdown       jsonb not null default '{}'::jsonb,
  explanation           text,
  topic                 text,
  audience_match        text,
  brand_relevance       text,
  discovered_at         timestamptz not null default now(),
  analyzed_at           timestamptz,
  updated_at            timestamptz not null default now(),
  unique (id, client_id),
  foreign key (campaign_id, client_id) references campaigns(id, client_id) on delete cascade,
  foreign key (post_id, client_id) references posts(id, client_id) on delete cascade,
  foreign key (segment_id, client_id) references audience_segments(id, client_id) on delete set null (segment_id),
  foreign key (social_account_id, client_id) references social_accounts(id, client_id) on delete set null (social_account_id),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);
create unique index opportunities_unique_target
  on engagement_opportunities (campaign_id, post_id, coalesce(reply_to_external_id, ''));
create index opportunities_client_status_idx on engagement_opportunities (client_id, status, discovered_at desc);

-- ───────────────────────────── Comments ─────────────────────────────
create table comment_generations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  client_id         uuid not null,
  campaign_id       uuid not null,
  opportunity_id    uuid not null,
  provider          text not null,
  model             text not null,
  prompt_version    text not null,
  context_hash      text not null,
  input_tokens      integer,
  output_tokens     integer,
  analysis          jsonb not null default '{}'::jsonb,
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (id, client_id),
  foreign key (campaign_id, client_id) references campaigns(id, client_id) on delete cascade,
  foreign key (opportunity_id, client_id) references engagement_opportunities(id, client_id) on delete cascade,
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

create table comments (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null,
  client_id            uuid not null,
  campaign_id          uuid not null,
  opportunity_id       uuid not null,
  generation_id        uuid,
  social_account_id    uuid,
  platform             text not null,
  comment_type         text not null check (comment_type in ('insight','conversation','expert')),
  ai_reasoning         text,
  original_text        text not null,
  current_text         text not null,
  is_edited            boolean not null default false,
  is_selected          boolean not null default false,
  status               text not null default 'generated'
                       check (status in ('generated','pending_approval','approved','rejected','superseded',
                                         'queued','publishing','published','failed')),
  quality_score        integer check (quality_score between 0 and 100),
  quality_passed       boolean not null default false,
  quality_report       jsonb not null default '[]'::jsonb,
  embedding            real[],
  embedding_model      text,
  approved_at          timestamptz,
  approved_by          uuid references users(id) on delete set null,
  rejected_at          timestamptz,
  rejected_by          uuid references users(id) on delete set null,
  rejection_reason     text,
  published_at         timestamptz,
  external_comment_id  text,
  external_url         text,
  created_by           uuid references users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, client_id),
  foreign key (campaign_id, client_id) references campaigns(id, client_id) on delete cascade,
  foreign key (opportunity_id, client_id) references engagement_opportunities(id, client_id) on delete cascade,
  foreign key (generation_id, client_id) references comment_generations(id, client_id) on delete set null (generation_id),
  foreign key (social_account_id, client_id) references social_accounts(id, client_id) on delete set null (social_account_id),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);
create index comments_client_status_idx on comments (client_id, status, created_at desc);
create index comments_opportunity_idx on comments (opportunity_id);

create table comment_edits (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  client_id        uuid not null,
  comment_id       uuid not null,
  kind             text not null check (kind in ('edit','suggestion')),
  previous_text    text not null,
  new_text         text not null,
  note             text,
  suggestion_status text check (suggestion_status in ('open','accepted','dismissed')),
  editor_id        uuid references users(id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (comment_id, client_id) references comments(id, client_id) on delete cascade,
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);
create index comment_edits_client_idx on comment_edits (client_id, created_at desc);

create table comment_approvals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  client_id        uuid not null,
  comment_id       uuid not null,
  approver_id      uuid not null references users(id) on delete cascade,
  approver_side    text not null check (approver_side in ('gbs','client')),
  decision         text not null check (decision in ('approved','rejected')),
  note             text,
  created_at       timestamptz not null default now(),
  unique (comment_id, approver_side, decision),
  foreign key (comment_id, client_id) references comments(id, client_id) on delete cascade,
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

-- ───────────────────────────── Publishing ─────────────────────────────
create table publishing_jobs (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  client_id          uuid not null,
  comment_id         uuid not null unique,
  social_account_id  uuid,
  platform           text not null,
  status             text not null default 'queued'
                     check (status in ('queued','publishing','published','failed','cancelled','manual_required')),
  scheduled_for      timestamptz not null default now(),
  attempts           integer not null default 0,
  max_attempts       integer not null default 3,
  last_error         text,
  locked_at          timestamptz,
  locked_by          text,
  approved_by        uuid references users(id) on delete set null,
  created_by         uuid references users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, client_id),
  foreign key (comment_id, client_id) references comments(id, client_id) on delete cascade,
  foreign key (social_account_id, client_id) references social_accounts(id, client_id) on delete set null (social_account_id),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);
create index publishing_jobs_due_idx on publishing_jobs (status, scheduled_for);

create table publishing_results (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null,
  client_id            uuid not null,
  job_id               uuid not null,
  comment_id           uuid not null,
  success              boolean not null,
  method               text not null default 'api' check (method in ('api','manual')),
  external_comment_id  text,
  external_url         text,
  error_code           text,
  error_message        text,
  recorded_by          uuid references users(id) on delete set null,
  created_at           timestamptz not null default now(),
  foreign key (job_id, client_id) references publishing_jobs(id, client_id) on delete cascade,
  foreign key (comment_id, client_id) references comments(id, client_id) on delete cascade,
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

-- ───────────────────────────── Metrics, usage, notifications, reports ─────────────────────────────
create table engagement_metrics (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  client_id          uuid not null,
  comment_id         uuid,
  social_account_id  uuid,
  platform           text not null,
  metric_date        date not null default current_date,
  likes              integer not null default 0,
  replies            integer not null default 0,
  profile_visits     integer,
  followers          integer,
  leads              integer,
  impressions        integer,
  source             text not null default 'api' check (source in ('api','manual','seed')),
  collected_at       timestamptz not null default now(),
  foreign key (comment_id, client_id) references comments(id, client_id) on delete cascade,
  foreign key (social_account_id, client_id) references social_accounts(id, client_id) on delete cascade,
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);
create unique index engagement_metrics_comment_day on engagement_metrics (comment_id, metric_date) where comment_id is not null;
create unique index engagement_metrics_account_day on engagement_metrics (social_account_id, metric_date) where comment_id is null and social_account_id is not null;
create index engagement_metrics_client_idx on engagement_metrics (client_id, metric_date);

create table usage_limits (
  id                           uuid primary key default gen_random_uuid(),
  organization_id              uuid not null,
  client_id                    uuid not null,
  platform                     text not null default 'all',
  daily_opportunity_limit      integer not null default 30 check (daily_opportunity_limit >= 0),
  daily_publish_limit          integer not null default 5 check (daily_publish_limit >= 0),
  min_minutes_between_comments integer not null default 10 check (min_minutes_between_comments >= 0),
  monthly_ai_generation_limit  integer not null default 2000 check (monthly_ai_generation_limit >= 0),
  updated_at                   timestamptz not null default now(),
  unique (client_id, platform),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

create table usage_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  client_id        uuid not null,
  kind             text not null check (kind in ('ai_generation','ai_analysis','opportunity_analyzed','comment_generated',
                                                 'comment_published','api_call','hashtag_query','social_account_connected')),
  platform         text,
  quantity         integer not null default 1,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);
create index usage_events_client_idx on usage_events (client_id, kind, created_at);

create table notifications (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  client_id        uuid,
  user_id          uuid not null references users(id) on delete cascade,
  kind             text not null check (kind in ('opportunities_found','approval_required','comment_published',
                                                 'publishing_failed','oauth_expired','integration_disconnected',
                                                 'campaign_paused','daily_limit_reached','daily_report','manual_action_required')),
  title            text not null,
  body             text,
  link             text,
  read_at          timestamptz,
  created_at       timestamptz not null default now(),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);
create index notifications_user_idx on notifications (user_id, read_at, created_at desc);

create table daily_reports (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  client_id        uuid not null,
  report_date      date not null,
  data             jsonb not null,
  created_at       timestamptz not null default now(),
  unique (client_id, report_date),
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete cascade
);

create table audit_logs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  client_id        uuid,
  campaign_id      uuid,
  actor_id         uuid references users(id) on delete set null,
  actor_name       text not null,
  action           text not null,
  entity_type      text not null,
  entity_id        uuid,
  details          jsonb not null default '{}'::jsonb,
  ip               text,
  created_at       timestamptz not null default now(),
  -- Audit history outlives a deleted client: only client_id is cleared.
  foreign key (client_id, organization_id) references clients(id, organization_id) on delete set null (client_id)
);
create index audit_logs_client_idx on audit_logs (client_id, created_at desc);
create index audit_logs_org_idx on audit_logs (organization_id, created_at desc);
