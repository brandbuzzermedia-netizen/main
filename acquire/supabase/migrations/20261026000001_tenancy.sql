-- Acquire: tenancy, roles, plans, settings and audit
--
-- Conventions
--   * UUID primary keys, created_at/updated_at on every mutable table.
--   * Every tenant row carries organization_id. RLS (migration 3) keys off it.
--   * Money is bigint minor units next to an explicit ISO currency.
--   * Countries are ISO 3166-1 alpha-2 codes; time zones are IANA names.

create extension if not exists pgcrypto;
create schema if not exists app;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Markets: countries the product is configured for. Compliance rules live in
-- application code (src/domain/eligibility.ts) so they are versioned and tested.
-- ---------------------------------------------------------------------------
create table public.markets (
  code             char(2) primary key check (code ~ '^[A-Z]{2}$'),
  name             text not null,
  default_timezone text not null,
  default_currency char(3) not null
);
insert into public.markets (code, name, default_timezone, default_currency) values
  ('US', 'United States',        'America/New_York', 'USD'),
  ('GB', 'United Kingdom',       'Europe/London',    'GBP'),
  ('AE', 'United Arab Emirates', 'Asia/Dubai',       'AED'),
  ('CA', 'Canada',               'America/Toronto',  'CAD'),
  ('AU', 'Australia',            'Australia/Sydney', 'AUD');

-- ---------------------------------------------------------------------------
-- Organizations, people, memberships
-- ---------------------------------------------------------------------------
create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) between 2 and 120),
  primary_market   char(2) not null references public.markets (code),
  timezone         text not null,
  default_currency char(3) not null,
  status           text not null default 'active' check (status in ('active', 'suspended')),
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.roles (
  key         text primary key,
  rank        smallint not null,
  description text not null
);
insert into public.roles (key, rank, description) values
  ('agency_admin',     40, 'Manages the organization, users, billing, campaigns and all leads'),
  ('campaign_manager', 30, 'Creates campaigns and workflows, manages and assigns all leads'),
  ('sales_rep',        20, 'Works the leads assigned to them'),
  ('read_only',        10, 'Views records and reports; cannot change anything');

create table public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  role            text not null references public.roles (key),
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index on public.memberships (user_id);

-- Platform operators. Kept apart from memberships: being a platform admin does NOT
-- grant access to any tenant's leads. It only unlocks the admin console functions.
create table public.platform_admins (
  user_id    uuid primary key references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function app.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function app.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Per-organization policy settings
-- ---------------------------------------------------------------------------
create table public.organization_settings (
  organization_id          uuid primary key references public.organizations (id) on delete cascade,
  -- Local-time contact window applied on top of statutory hours (the stricter wins).
  contact_window_start     time not null default '09:00',
  contact_window_end       time not null default '20:00',
  -- When on, any automated action whose eligibility is "review" waits for a person.
  require_review_when_unsure boolean not null default true,
  -- Days of inactivity after which an implied-inquiry basis is treated as stale (CASL uses 6 months).
  implied_inquiry_days     integer not null default 180 check (implied_inquiry_days between 1 and 730),
  updated_at               timestamptz not null default now(),
  check (contact_window_end > contact_window_start)
);

-- ---------------------------------------------------------------------------
-- Plans, subscriptions, usage. Limits are enforced in the database.
-- ---------------------------------------------------------------------------
create table public.plans (
  key                      text primary key,
  name                     text not null,
  monthly_price_minor      bigint not null default 0 check (monthly_price_minor >= 0),
  currency                 char(3) not null default 'USD',
  max_contacts             integer not null check (max_contacts > 0),
  max_seats                integer not null check (max_seats > 0),
  max_workflows            integer not null check (max_workflows >= 0),
  monthly_messages         integer not null check (monthly_messages >= 0),
  monthly_emails           integer not null check (monthly_emails >= 0),
  monthly_ai_call_minutes  integer not null check (monthly_ai_call_minutes >= 0),
  is_public                boolean not null default true,
  created_at               timestamptz not null default now()
);
-- Placeholder commercial terms. Prices are 0 until pricing is decided (see docs/PLAN.md).
insert into public.plans (key, name, max_contacts, max_seats, max_workflows, monthly_messages, monthly_emails, monthly_ai_call_minutes, is_public) values
  ('trial',   'Trial',   500,    3,  2,  0,     500,    0,    false),
  ('starter', 'Starter', 5000,   5,  10, 2000,  20000,  300,  true),
  ('growth',  'Growth',  25000,  15, 50, 10000, 100000, 1500, true),
  ('scale',   'Scale',   100000, 50, 200, 50000, 500000, 6000, true);

create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null unique references public.organizations (id) on delete cascade,
  plan_key               text not null references public.plans (key),
  status                 text not null check (status in ('trialing', 'active', 'past_due', 'cancelled')),
  provider               text,           -- 'stripe' once billing is connected (Phase 7)
  provider_customer_id   text,
  provider_subscription_id text,
  current_period_start   timestamptz not null default now(),
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.usage_records (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  metric          text not null check (metric in ('sms', 'email', 'ai_call_minutes', 'ai_tokens', 'enrichment')),
  quantity        numeric(14, 4) not null check (quantity >= 0),
  cost_minor      bigint,
  currency        char(3),
  occurred_at     timestamptz not null default now(),
  -- Provider event id, so a retried webhook never double-counts usage.
  source_ref      text,
  created_at      timestamptz not null default now(),
  unique (organization_id, metric, source_ref)
);
create index on public.usage_records (organization_id, metric, occurred_at);

-- ---------------------------------------------------------------------------
-- Audit log (written by trigger; redacted on erasure)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid,
  actor_id        uuid,
  table_name      text not null,
  record_id       uuid,
  action          text not null check (action in ('INSERT', 'UPDATE', 'DELETE', 'ERASE')),
  old_data        jsonb,
  new_data        jsonb,
  created_at      timestamptz not null default now()
);
create index on public.audit_logs (organization_id, created_at desc);
create index on public.audit_logs (table_name, record_id);

create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if tg_op = 'UPDATE' and v_old - 'updated_at' = v_new - 'updated_at' then
    return new;
  end if;
  insert into public.audit_logs (organization_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (
    coalesce((v_row ->> 'organization_id')::uuid, case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid end),
    auth.uid(), tg_table_name, (v_row ->> 'id')::uuid, tg_op, v_old, v_new
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['organizations', 'users', 'organization_settings', 'subscriptions'] loop
    execute format('create trigger touch before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
  foreach t in array array['organizations', 'memberships', 'organization_settings', 'subscriptions'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit_row()', t);
  end loop;
end $$;
