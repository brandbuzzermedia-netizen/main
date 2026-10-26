-- Acquire: leads, pipeline, sources, activity, consent and suppression
--
-- Rules this schema guarantees (tested in supabase/tests):
--   * One lead per normalized email and per E.164 phone inside an organization.
--   * Consent records are append-only. The newest record per (lead, channel) is the state.
--   * Suppression is keyed by the contact value, not the lead, so it survives lead deletion
--     and catches re-imports of the same person.
--   * Activity rows for creation, stage changes and assignment are written by triggers,
--     so the timeline cannot silently miss a change made from any code path.
--   * The plan's contact limit is checked once per insert statement.

create type public.lead_segment as enum ('buyer', 'seller', 'landlord', 'tenant', 'investor', 'other');
create type public.lead_timeline as enum ('immediate', 'within_3_months', 'within_6_months', 'within_12_months', 'over_12_months', 'unknown');
create type public.stage_category as enum ('new', 'working', 'qualified', 'won', 'lost', 'opted_out');
create type public.source_kind as enum ('manual', 'csv_import', 'web_form', 'ad_platform', 'data_provider', 'referral', 'crm_sync', 'other');
create type public.contact_channel as enum ('email', 'sms', 'phone_call', 'ai_voice_call', 'whatsapp');
create type public.consent_status as enum ('granted', 'withdrawn');
create type public.consent_basis as enum (
  'express_written',              -- signed/recorded written agreement naming the seller (e.g. TCPA PEWC)
  'express',                      -- clear affirmative opt-in (checkbox, reply YES, verbal on a recorded call)
  'implied_existing_relationship',-- e.g. CASL existing business relationship, PECR soft opt-in
  'implied_inquiry',              -- the person enquired recently (time-limited)
  'legitimate_interest',          -- documented LIA (UK/EU GDPR); not a PECR basis for email/SMS
  'none_recorded'                 -- used only with status = withdrawn
);
create type public.suppression_reason as enum ('opt_out', 'unsubscribe', 'do_not_call', 'registry_match', 'bounce', 'complaint', 'manual', 'erasure');
create type public.activity_kind as enum (
  'created', 'imported', 'updated', 'stage_changed', 'assigned', 'note',
  'consent_recorded', 'consent_withdrawn', 'suppressed', 'unsuppressed',
  'call', 'sms', 'email', 'appointment', 'workflow'
);

-- ---------------------------------------------------------------------------
-- Pipeline stages (configurable lead statuses)
-- ---------------------------------------------------------------------------
create table public.pipeline_stages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key             text not null check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name            text not null check (length(trim(name)) between 1 and 60),
  category        public.stage_category not null,
  position        smallint not null default 0,
  -- System stages ('new', 'opted_out') are used by automation and cannot be deleted.
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, key),
  unique (organization_id, id)
);

create or replace function app.seed_pipeline_stages(p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.pipeline_stages (organization_id, key, name, category, position, is_system)
  select p_org, s.key, s.name, s.category::public.stage_category, s.pos, s.sys
  from (values
    ('new',                'New',                'new',       10,  true),
    ('uncontacted',        'Uncontacted',        'new',       20,  false),
    ('contacting',         'Contacting',         'working',   30,  false),
    ('contacted',          'Contacted',          'working',   40,  false),
    ('engaged',            'Engaged',            'working',   50,  false),
    ('qualified',          'Qualified',          'qualified', 60,  false),
    ('interested',         'Interested',         'qualified', 70,  false),
    ('appointment_booked', 'Appointment booked', 'qualified', 80,  false),
    ('nurturing',          'Nurturing',          'working',   90,  false),
    ('converted',          'Converted',          'won',       100, false),
    ('unqualified',        'Unqualified',        'lost',      110, false),
    ('lost',               'Lost',               'lost',      120, false),
    ('opted_out',          'Opted out',          'opted_out', 130, true)
  ) as s(key, name, category, pos, sys)
  on conflict (organization_id, key) do nothing
$$;

-- ---------------------------------------------------------------------------
-- Lead sources
-- ---------------------------------------------------------------------------
create table public.lead_sources (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 80),
  kind            public.source_kind not null default 'other',
  -- Where the data came from and on what terms (licence, form URL, provider contract).
  provenance_note text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index lead_sources_name_unique on public.lead_sources (organization_id, lower(name));

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  full_name            text not null check (length(trim(full_name)) between 1 and 200),
  email                text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  email_normalized     text generated always as (lower(trim(email))) stored,
  phone_e164           text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  country              char(2) check (country is null or country ~ '^[A-Z]{2}$'),
  timezone             text,
  segment              public.lead_segment not null default 'buyer',
  property_interest    text,
  property_type        text,
  preferred_location   text,
  budget_min_minor     bigint check (budget_min_minor is null or budget_min_minor >= 0),
  budget_max_minor     bigint check (budget_max_minor is null or budget_max_minor >= 0),
  currency             char(3),
  timeline             public.lead_timeline not null default 'unknown',
  stage_id             uuid not null,
  owner_id             uuid references public.users (id) on delete set null,
  source_id            uuid,
  tags                 text[] not null default '{}',
  custom_fields        jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_fields) = 'object'),
  -- Qualification score 0-100 (Phase 4). Null until a qualification has run or a person sets it.
  score                smallint check (score between 0 and 100),
  last_contacted_at    timestamptz,
  next_follow_up_at    timestamptz,
  notes                text,
  created_by           uuid references public.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (organization_id, stage_id) references public.pipeline_stages (organization_id, id) on delete restrict,
  foreign key (organization_id, source_id) references public.lead_sources (organization_id, id) on delete restrict,
  unique (organization_id, id),
  check (email is not null or phone_e164 is not null),
  check (budget_min_minor is null or budget_max_minor is null or budget_max_minor >= budget_min_minor),
  check ((budget_min_minor is null and budget_max_minor is null) or currency is not null)
);
create unique index leads_email_unique on public.leads (organization_id, email_normalized) where email_normalized is not null;
create unique index leads_phone_unique on public.leads (organization_id, phone_e164) where phone_e164 is not null;
create index on public.leads (organization_id, created_at desc);
create index on public.leads (organization_id, stage_id);
create index on public.leads (organization_id, owner_id);
create index on public.leads (organization_id, source_id);
create index leads_tags_idx on public.leads using gin (tags);
create index leads_name_idx on public.leads (organization_id, lower(full_name));

-- ---------------------------------------------------------------------------
-- Activity timeline
-- ---------------------------------------------------------------------------
create table public.lead_activities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lead_id         uuid not null,
  kind            public.activity_kind not null,
  summary         text not null,
  data            jsonb not null default '{}'::jsonb,
  actor_id        uuid references public.users (id) on delete set null,
  occurred_at     timestamptz not null default now(),
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete cascade
);
create index on public.lead_activities (lead_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Consent (append-only) and suppression
-- ---------------------------------------------------------------------------
create table public.consent_records (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lead_id         uuid not null,
  channel         public.contact_channel not null,
  status          public.consent_status not null,
  basis           public.consent_basis not null,
  -- How and where it was captured: form URL and wording version, call recording id, etc.
  source          text not null check (length(trim(source)) between 3 and 500),
  evidence_url    text,
  captured_at     timestamptz not null default now(),
  expires_at      timestamptz,
  recorded_by     uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete cascade,
  check (status = 'withdrawn' or basis <> 'none_recorded'),
  check (expires_at is null or expires_at > captured_at),
  check (captured_at <= now() + interval '5 minutes')
);
create index on public.consent_records (lead_id, channel, captured_at desc);

create table public.suppression_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  value_type      text not null check (value_type in ('email', 'phone')),
  -- Normalized: lowercased email, or E.164 phone.
  value           text not null,
  -- Null means every channel for that value.
  channel         public.contact_channel,
  reason          public.suppression_reason not null,
  source          text,
  lead_id         uuid,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  check ((value_type = 'email' and value = lower(trim(value)) and value like '%@%')
      or (value_type = 'phone' and value ~ '^\+[1-9][0-9]{6,14}$'))
);
-- NULLS NOT DISTINCT: one all-channel entry per value, plus one per specific channel.
create unique index suppression_unique on public.suppression_entries
  (organization_id, value_type, value, channel) nulls not distinct;
create index on public.suppression_entries (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Imports and saved views
-- ---------------------------------------------------------------------------
create table public.lead_imports (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  source_id        uuid,
  file_name        text,
  file_sha256      text,
  on_duplicate     text not null check (on_duplicate in ('skip', 'update')),
  total_rows       integer not null default 0,
  created_count    integer not null default 0,
  updated_count    integer not null default 0,
  skipped_count    integer not null default 0,
  suppressed_count integer not null default 0,
  -- Per-row outcome for the downloadable report: [{row, outcome, lead_id?, message?}]
  results          jsonb not null default '[]'::jsonb,
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, source_id) references public.lead_sources (organization_id, id) on delete set null (source_id)
);
create index on public.lead_imports (organization_id, created_at desc);

create table public.saved_views (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 60),
  -- URL query string of the leads list (filters + sort), validated by the app.
  query           text not null check (length(query) <= 1000),
  is_shared       boolean not null default false,
  created_at      timestamptz not null default now()
);
create index on public.saved_views (organization_id, user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Timeline entries for creation, stage change and assignment.
create or replace function app.lead_activity_trigger() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_from text;
  v_to   text;
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities (organization_id, lead_id, kind, summary, actor_id)
    values (new.organization_id, new.id,
            case when current_setting('app.import_id', true) is not null and current_setting('app.import_id', true) <> '' then 'imported' else 'created' end::public.activity_kind,
            case when current_setting('app.import_id', true) is not null and current_setting('app.import_id', true) <> '' then 'Imported from a file' else 'Lead created' end,
            auth.uid());
    return new;
  end if;
  if new.stage_id is distinct from old.stage_id then
    select name into v_from from public.pipeline_stages where id = old.stage_id;
    select name into v_to   from public.pipeline_stages where id = new.stage_id;
    insert into public.lead_activities (organization_id, lead_id, kind, summary, data, actor_id)
    values (new.organization_id, new.id, 'stage_changed', format('Stage: %s → %s', v_from, v_to),
            jsonb_build_object('from', old.stage_id, 'to', new.stage_id), auth.uid());
  end if;
  if new.owner_id is distinct from old.owner_id then
    insert into public.lead_activities (organization_id, lead_id, kind, summary, data, actor_id)
    values (new.organization_id, new.id, 'assigned',
            coalesce('Assigned to ' || (select coalesce(full_name, email) from public.users where id = new.owner_id), 'Unassigned'),
            jsonb_build_object('from', old.owner_id, 'to', new.owner_id), auth.uid());
  end if;
  return new;
end $$;

create trigger lead_activity after insert or update of stage_id, owner_id on public.leads
  for each row execute function app.lead_activity_trigger();

-- Plan contact limit, checked once per statement (cheap for single inserts). import_leads()
-- sets app.import_id and checks once at the end instead of after every row.
create or replace function app.check_contact_limit(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_total integer;
  v_max   integer;
begin
  select p.max_contacts into v_max
  from public.subscriptions s join public.plans p on p.key = s.plan_key
  where s.organization_id = p_org and s.status in ('trialing', 'active', 'past_due');
  if v_max is null then
    raise exception 'This organization has no active plan' using errcode = 'check_violation';
  end if;
  select count(*) into v_total from public.leads where organization_id = p_org;
  if v_total > v_max then
    raise exception 'Plan contact limit reached (% of % contacts). Upgrade the plan or remove leads.', v_total, v_max
      using errcode = 'check_violation';
  end if;
end $$;

create or replace function app.enforce_contact_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  if coalesce(current_setting('app.import_id', true), '') <> '' then
    return null;
  end if;
  for v_org in select distinct organization_id from new_rows loop
    perform app.check_contact_limit(v_org);
  end loop;
  return null;
end $$;

create trigger leads_contact_limit after insert on public.leads
  referencing new table as new_rows
  for each statement execute function app.enforce_contact_limit();

-- A lead's owner must be a member of the lead's organization.
create or replace function app.check_lead_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null and not exists (
    select 1 from public.memberships where organization_id = new.organization_id and user_id = new.owner_id) then
    raise exception 'The owner must be a member of this organization' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create trigger lead_owner_check before insert or update of owner_id on public.leads
  for each row execute function app.check_lead_owner();

-- A consent record or suppression must belong to the same organization as its lead
-- (composite FKs cover consent; suppression's lead_id is optional and checked here).
create or replace function app.check_suppression_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null and not exists (
    select 1 from public.leads where id = new.lead_id and organization_id = new.organization_id) then
    raise exception 'Lead does not belong to this organization' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create trigger suppression_lead_check before insert or update on public.suppression_entries
  for each row execute function app.check_suppression_lead();

-- Suppressing a value moves matching leads to the system "opted_out" stage (for an
-- all-channel opt-out) and writes a timeline entry. Unsuppressing does not move them back.
create or replace function app.on_suppression() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_lead record;
  v_stage uuid;
begin
  select id into v_stage from public.pipeline_stages where organization_id = new.organization_id and key = 'opted_out';
  for v_lead in
    select id, stage_id from public.leads
    where organization_id = new.organization_id
      and ((new.value_type = 'email' and email_normalized = new.value)
        or (new.value_type = 'phone' and phone_e164 = new.value))
  loop
    insert into public.lead_activities (organization_id, lead_id, kind, summary, data, actor_id)
    values (new.organization_id, v_lead.id, 'suppressed',
            format('Suppressed %s for %s (%s)', new.value_type, coalesce(new.channel::text, 'all channels'), new.reason),
            jsonb_build_object('suppression_id', new.id), auth.uid());
    if new.channel is null and new.reason in ('opt_out', 'unsubscribe', 'do_not_call', 'erasure') then
      update public.leads set stage_id = v_stage where id = v_lead.id and stage_id <> v_stage;
    end if;
  end loop;
  return new;
end $$;

create trigger suppression_effects after insert on public.suppression_entries
  for each row execute function app.on_suppression();

create or replace function app.on_consent() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.lead_activities (organization_id, lead_id, kind, summary, data, actor_id)
  values (new.organization_id, new.lead_id,
          case new.status when 'granted' then 'consent_recorded' else 'consent_withdrawn' end::public.activity_kind,
          case new.status
            when 'granted' then format('Consent recorded: %s (%s)', replace(new.channel::text, '_', ' '), replace(new.basis::text, '_', ' '))
            else format('Consent withdrawn: %s', replace(new.channel::text, '_', ' ')) end,
          jsonb_build_object('consent_id', new.id, 'source', new.source), auth.uid());
  return new;
end $$;

create trigger consent_activity after insert on public.consent_records
  for each row execute function app.on_consent();

-- Consent history is evidence: it is never edited or deleted (except by erasure).
create or replace function app.consent_immutable() returns trigger
language plpgsql as $$
begin
  if current_setting('app.erasing', true) = 'on' then
    return old;
  end if;
  raise exception 'Consent records are append-only. Record a new entry instead.' using errcode = 'insufficient_privilege';
end $$;

create trigger consent_no_update before update or delete on public.consent_records
  for each row execute function app.consent_immutable();

do $$
declare t text;
begin
  foreach t in array array['pipeline_stages', 'lead_sources', 'leads'] loop
    execute format('create trigger touch before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
  foreach t in array array['pipeline_stages', 'lead_sources', 'leads', 'consent_records', 'suppression_entries'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit_row()', t);
  end loop;
end $$;
