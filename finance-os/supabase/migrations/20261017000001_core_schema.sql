-- GBS Finance OS: core schema
--
-- Conventions
--   * UUID primary keys, created_at/updated_at on every mutable table.
--   * Money is bigint minor units (paise), always next to an explicit currency.
--   * Every row carries organization_id. RLS (next migration) keys off it.
--   * Swipe stays the system of record for official invoices. This schema references them.

create extension if not exists pgcrypto;

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.billing_frequency as enum ('monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time');
create type public.service_status as enum ('onboarding', 'active', 'paused', 'suspended', 'offboarded');
create type public.contract_status as enum ('draft', 'active', 'expired', 'terminated');
create type public.source_channel as enum ('api', 'csv', 'manual');
create type public.sync_status as enum ('current', 'stale', 'error', 'manual');
create type public.invoice_status as enum ('issued', 'cancelled', 'disputed');
create type public.payment_source as enum ('gateway', 'bank_import', 'swipe', 'manual');
create type public.payment_method as enum ('upi', 'neft', 'rtgs', 'imps', 'cheque', 'card', 'cash', 'gateway', 'other');
create type public.payment_kind as enum ('receipt', 'refund');
create type public.verification_status as enum ('pending_verification', 'verified', 'rejected');
create type public.extension_status as enum ('active', 'revoked');
create type public.ad_platform as enum ('meta', 'google', 'linkedin', 'other');
create type public.ad_funding_model as enum ('client_direct', 'agency_pass_through');
create type public.ad_funding_status as enum ('not_requested', 'requested', 'partially_funded', 'funded', 'low', 'exhausted');
create type public.campaign_status as enum ('planned', 'active', 'paused', 'ended');
create type public.ad_funding_event_type as enum ('request', 'receipt', 'spend', 'balance_check', 'refund');
create type public.expense_category as enum ('salary', 'rent', 'software', 'contractor', 'tax', 'office', 'loan_repayment', 'other');
create type public.recurrence as enum ('none', 'monthly', 'quarterly', 'yearly');
create type public.expense_status as enum ('planned', 'paid', 'cancelled');
create type public.commitment_status as enum ('open', 'fulfilled', 'missed', 'cancelled');
create type public.reminder_stage as enum (
  'invoice_issued', 'pre_due', 'due', 'overdue', 'founder_escalation', 'formal_review',
  'commitment_missed', 'payment_received', 'ad_funds_low'
);
create type public.reminder_channel as enum ('email', 'whatsapp', 'internal');
create type public.reminder_status as enum ('claimed', 'sent', 'delivered', 'failed', 'skipped');
create type public.task_kind as enum (
  'overdue_escalation', 'commitment_missed', 'formal_review', 'suspension_decision',
  'automation_failed', 'sync_failed', 'reconciliation', 'ad_funds_low'
);
create type public.task_status as enum ('open', 'in_progress', 'resolved', 'dismissed');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.run_trigger as enum ('schedule', 'manual', 'webhook', 'upload');
create type public.run_status as enum ('running', 'succeeded', 'partial', 'failed');
create type public.event_status as enum ('received', 'processed', 'ignored', 'failed');

-- ---------------------------------------------------------------------------
-- Shared trigger: updated_at
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tenancy and people
-- ---------------------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  legal_name    text,
  gstin         text,
  base_currency char(3) not null default 'INR',
  timezone      text not null default 'Asia/Kolkata',
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.roles (
  key         text primary key,
  description text not null
);

insert into public.roles (key, description) values
  ('owner',           'Founder: full access, including destructive and approval actions'),
  ('finance',         'Finance staff: manage ledgers, imports and reminders'),
  ('account_manager', 'Read access to own clients; may log payment commitments'),
  ('viewer',          'Read-only access to finance data');

-- Profile mirror of auth.users (populated by trigger below).
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

create or replace function app.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function app.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Clients, contacts, contracts
-- ---------------------------------------------------------------------------
create table public.clients (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete cascade,
  client_code              text not null check (client_code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
  legal_name               text not null check (length(trim(legal_name)) > 0),
  trading_name             text,
  gstin                    text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  -- Names this client appears under in Swipe exports, used for CSV matching.
  source_aliases           text[] not null default '{}',
  monthly_retainer_minor   bigint not null default 0 check (monthly_retainer_minor >= 0),
  currency                 char(3) not null default 'INR',
  billing_frequency        public.billing_frequency not null default 'monthly',
  invoice_day              smallint check (invoice_day between 1 and 28),
  payment_terms_days       integer not null default 7 check (payment_terms_days between 0 and 180),
  account_owner_id         uuid references public.users (id) on delete set null,
  service_status           public.service_status not null default 'active',
  communication_paused     boolean not null default false,
  missed_commitments_count integer not null default 0,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organization_id, client_code),
  unique (organization_id, id)
);
create index on public.clients (organization_id, service_status);
create index on public.clients (organization_id, lower(legal_name));

create table public.billing_contacts (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  client_id            uuid not null,
  name                 text not null,
  email                text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  whatsapp_e164        text check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  is_primary           boolean not null default false,
  receives_reminders   boolean not null default true,
  -- Evidence of WhatsApp opt-in is required before any WhatsApp message.
  whatsapp_consent_at  timestamptz,
  whatsapp_consent_note text,
  email_opt_out        boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  check (email is not null or whatsapp_e164 is not null)
);
create index on public.billing_contacts (client_id);
create unique index billing_contacts_one_primary on public.billing_contacts (client_id) where is_primary;

create table public.contracts (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete cascade,
  client_id               uuid not null,
  start_date              date not null,
  end_date                date,
  monthly_retainer_minor  bigint not null check (monthly_retainer_minor >= 0),
  currency                char(3) not null default 'INR',
  billing_frequency       public.billing_frequency not null default 'monthly',
  payment_terms_days      integer not null default 7 check (payment_terms_days between 0 and 180),
  -- Days after due date after which the founder reviews service suspension.
  final_deadline_days     integer not null default 21 check (final_deadline_days between 1 and 365),
  status                  public.contract_status not null default 'active',
  document_url            text,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  check (end_date is null or end_date >= start_date)
);
create index on public.contracts (client_id, status);

-- ---------------------------------------------------------------------------
-- Invoices (references to official Swipe invoices)
-- ---------------------------------------------------------------------------
create table public.invoices (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations (id) on delete cascade,
  client_id                   uuid not null,
  source_system               text not null default 'swipe',
  source_channel              public.source_channel not null,
  external_id                 text,
  invoice_number              text not null check (length(trim(invoice_number)) > 0),
  invoice_date                date not null,
  billing_period_start        date,
  billing_period_end          date,
  due_date                    date not null,
  due_date_derived            boolean not null default false,
  currency                    char(3) not null default 'INR',
  subtotal_minor              bigint check (subtotal_minor >= 0),
  tax_minor                   bigint not null default 0 check (tax_minor >= 0),
  total_minor                 bigint not null check (total_minor >= 0),
  -- Maintained only by triggers from verified payment allocations and credit notes.
  amount_received_minor       bigint not null default 0 check (amount_received_minor >= 0),
  credited_minor              bigint not null default 0 check (credited_minor >= 0),
  outstanding_minor           bigint generated always as (total_minor - amount_received_minor - credited_minor) stored,
  status                      public.invoice_status not null default 'issued',
  status_reason               text,
  pdf_url                     text,
  -- What the source system last said about payment. Informational only, never applied to the ledger.
  source_reported_status      text,
  source_reported_paid_minor  bigint,
  last_synced_at              timestamptz,
  sync_status                 public.sync_status not null default 'manual',
  last_reminder_stage         public.reminder_stage,
  next_reminder_date          date,
  notes                       text,
  created_by                  uuid references public.users (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict,
  unique (organization_id, source_system, invoice_number),
  unique (organization_id, id),
  check (due_date >= invoice_date),
  check (billing_period_end is null or billing_period_start is null or billing_period_end >= billing_period_start),
  check (amount_received_minor + credited_minor <= total_minor)
);
create unique index invoices_external_id_unique
  on public.invoices (organization_id, source_system, external_id) where external_id is not null;
create index on public.invoices (organization_id, due_date);
create index on public.invoices (client_id, invoice_date desc);
create index invoices_open_idx on public.invoices (organization_id, due_date)
  where status = 'issued' and outstanding_minor > 0;

create table public.invoice_line_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  invoice_id       uuid not null,
  position         integer not null default 0,
  description      text not null,
  hsn_sac          text,
  quantity         numeric(12, 3) not null default 1 check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  tax_rate_bp      integer not null default 0 check (tax_rate_bp between 0 and 10000),
  tax_minor        bigint not null default 0 check (tax_minor >= 0),
  amount_minor     bigint not null check (amount_minor >= 0),
  created_at       timestamptz not null default now(),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete cascade
);
create index on public.invoice_line_items (invoice_id);

create table public.credit_notes (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  invoice_id         uuid not null,
  credit_note_number text not null,
  issued_on          date not null,
  amount_minor       bigint not null check (amount_minor > 0),
  reason             text,
  created_by         uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete restrict,
  unique (organization_id, credit_note_number)
);
create index on public.credit_notes (invoice_id);

create table public.payment_extensions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  invoice_id       uuid not null,
  new_due_date     date not null,
  reason           text not null,
  status           public.extension_status not null default 'active',
  approved_by      uuid references public.users (id) on delete set null,
  approved_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete cascade
);
create unique index payment_extensions_one_active on public.payment_extensions (invoice_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Payments and allocations (service-fee ledger)
-- ---------------------------------------------------------------------------
create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  client_id             uuid,               -- null = received but not yet matched to a client
  source                public.payment_source not null,
  transaction_reference text not null check (length(trim(transaction_reference)) > 0),
  payment_date          date not null,
  amount_minor          bigint not null check (amount_minor > 0),
  currency              char(3) not null default 'INR',
  method                public.payment_method not null default 'other',
  kind                  public.payment_kind not null default 'receipt',
  payer_name            text,
  verification_status   public.verification_status not null default 'pending_verification',
  verified_by           uuid references public.users (id) on delete set null,
  verified_at           timestamptz,
  allocated_minor       bigint not null default 0 check (allocated_minor >= 0),
  unallocated_minor     bigint generated always as (amount_minor - allocated_minor) stored,
  reconciliation_notes  text,
  created_by            uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict,
  -- Idempotency: one row per transaction reference per source.
  unique (organization_id, source, transaction_reference),
  unique (organization_id, id),
  check (allocated_minor <= amount_minor),
  check (verification_status <> 'verified' or verified_at is not null)
);
create index on public.payments (organization_id, payment_date desc);
create index on public.payments (client_id);
create index payments_unallocated_idx on public.payments (organization_id) where unallocated_minor > 0;

create table public.payment_allocations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  payment_id       uuid not null,
  invoice_id       uuid not null,
  amount_minor     bigint not null check (amount_minor > 0),
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, payment_id) references public.payments (organization_id, id) on delete cascade,
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete restrict,
  unique (payment_id, invoice_id)
);
create index on public.payment_allocations (invoice_id);

-- ---------------------------------------------------------------------------
-- Advertising budgets (client money: a separate ledger, never agency revenue)
-- ---------------------------------------------------------------------------
create table public.advertising_budgets (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations (id) on delete cascade,
  client_id                   uuid not null,
  platform                    public.ad_platform not null,
  funding_model               public.ad_funding_model not null default 'client_direct',
  ad_account_ref              text,
  period_start                date not null,
  period_end                  date,
  currency                    char(3) not null default 'INR',
  approved_budget_minor       bigint not null default 0 check (approved_budget_minor >= 0),
  funding_requested_minor     bigint not null default 0 check (funding_requested_minor >= 0),
  funding_received_minor      bigint not null default 0 check (funding_received_minor >= 0),
  platform_spend_minor        bigint not null default 0 check (platform_spend_minor >= 0),
  platform_balance_minor      bigint,      -- null = not verifiable
  low_balance_threshold_minor bigint not null default 0 check (low_balance_threshold_minor >= 0),
  funding_status              public.ad_funding_status not null default 'not_requested',
  campaign_status             public.campaign_status not null default 'planned',
  last_verified_at            timestamptz,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete restrict,
  unique (organization_id, id),
  check (period_end is null or period_end >= period_start)
);
create index on public.advertising_budgets (client_id, period_start desc);

create table public.advertising_funding_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  budget_id       uuid not null,
  event_type      public.ad_funding_event_type not null,
  amount_minor    bigint not null check (amount_minor >= 0),
  occurred_on     date not null,
  reference       text,
  source          text not null default 'manual',
  notes           text,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, budget_id) references public.advertising_budgets (organization_id, id) on delete cascade
);
create index on public.advertising_funding_events (budget_id, occurred_on desc);

-- ---------------------------------------------------------------------------
-- Expenses (agency outflows)
-- ---------------------------------------------------------------------------
create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  category          public.expense_category not null,
  description       text not null,
  payee             text,
  amount_minor      bigint not null check (amount_minor > 0),
  currency          char(3) not null default 'INR',
  due_date          date not null,
  recurrence        public.recurrence not null default 'none',
  recurrence_end    date,
  status            public.expense_status not null default 'planned',
  paid_on           date,
  paid_amount_minor bigint check (paid_amount_minor > 0),
  reference         text,
  notes             text,
  created_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (status <> 'paid' or (paid_on is not null and paid_amount_minor is not null))
);
create index on public.expenses (organization_id, due_date);

-- ---------------------------------------------------------------------------
-- Collections workflow
-- ---------------------------------------------------------------------------
create table public.payment_commitments (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  client_id             uuid not null,
  invoice_id            uuid,
  promised_amount_minor bigint not null check (promised_amount_minor > 0),
  commitment_date       date not null,
  promised_on           date not null default current_date,
  promised_by           text not null,
  notes                 text,
  status                public.commitment_status not null default 'open',
  resolved_at           timestamptz,
  recorded_by           uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete cascade
);
create index on public.payment_commitments (organization_id, status, commitment_date);

create table public.reminder_events (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  -- Deterministic key, e.g. 'inv:<id>:overdue:email:c0'. Claiming it first makes reruns no-ops.
  dedupe_key          text not null,
  invoice_id          uuid,
  client_id           uuid not null,
  commitment_id       uuid references public.payment_commitments (id) on delete set null,
  stage               public.reminder_stage not null,
  channel             public.reminder_channel not null,
  cycle               integer not null default 0,
  status              public.reminder_status not null default 'claimed',
  recipient           text,
  template_key        text,
  amount_minor        bigint,
  provider            text,
  provider_message_id text,
  provider_response   jsonb,
  error               text,
  attempt_count       integer not null default 0,
  next_attempt_at     timestamptz,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete cascade,
  unique (organization_id, dedupe_key)
);
create index on public.reminder_events (invoice_id, created_at desc);
create index reminder_events_retry_idx on public.reminder_events (next_attempt_at) where status = 'failed';
create unique index reminder_events_provider_msg on public.reminder_events (provider, provider_message_id)
  where provider_message_id is not null;

create table public.escalation_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  dedupe_key      text not null,
  kind            public.task_kind not null,
  priority        public.task_priority not null default 'normal',
  status          public.task_status not null default 'open',
  title           text not null,
  details         text,
  client_id       uuid,
  invoice_id      uuid,
  commitment_id   uuid references public.payment_commitments (id) on delete set null,
  assigned_to     uuid references public.users (id) on delete set null,
  due_on          date,
  resolution      text,
  resolved_by     uuid references public.users (id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete cascade,
  unique (organization_id, dedupe_key)
);
create index on public.escalation_tasks (organization_id, status, priority);

-- ---------------------------------------------------------------------------
-- Integrations
-- ---------------------------------------------------------------------------
create table public.integration_sync_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  integration     text not null,          -- 'swipe', 'resend', 'whatsapp', 'jobs'
  job             text not null,          -- 'invoice_import', 'reminders', ...
  channel         public.source_channel,
  trigger         public.run_trigger not null,
  status          public.run_status not null default 'running',
  idempotency_key text,
  file_name       text,
  stats           jsonb not null default '{}'::jsonb,
  error           text,
  triggered_by    uuid references public.users (id) on delete set null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index on public.integration_sync_runs (organization_id, integration, job, started_at desc);
create index on public.integration_sync_runs (organization_id, idempotency_key);

create table public.integration_events (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid references public.organizations (id) on delete cascade,
  provider          text not null,
  provider_event_id text not null,
  event_type        text not null,
  signature_valid   boolean not null,
  payload           jsonb not null,
  status            public.event_status not null default 'received',
  error             text,
  received_at       timestamptz not null default now(),
  processed_at      timestamptz,
  unique (provider, provider_event_id)
);
create index on public.integration_events (organization_id, received_at desc);

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table public.app_settings (
  organization_id          uuid primary key references public.organizations (id) on delete cascade,
  -- Offsets in days relative to the effective due date. Configurable defaults, not contract terms.
  reminder_schedule        jsonb not null default
    '{"pre_due": -3, "due": 0, "overdue": 3, "founder_escalation": 7}'::jsonb,
  reminder_send_time       time not null default '09:30',
  -- Probability weights for expected collections by ageing bucket.
  forecast_probabilities   jsonb not null default
    '{"not_due": 0.9, "overdue_1_15": 0.7, "overdue_16_45": 0.4, "overdue_45_plus": 0.15, "disputed": 0, "commitment": 0.8}'::jsonb,
  stale_after_hours_api    integer not null default 6,
  stale_after_hours_manual integer not null default 168,
  opening_cash_minor       bigint,
  opening_cash_date        date,
  email_from               text,
  payment_instructions     text,
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid,
  actor_id        uuid,
  table_name      text not null,
  record_id       uuid,
  action          text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
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
    (v_row ->> 'organization_id')::uuid,
    auth.uid(),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    tg_op, v_old, v_new
  );
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- Ledger integrity: invoice.amount_received / credited and payment.allocated
-- are recomputed from source rows inside the same transaction.
-- ---------------------------------------------------------------------------
create or replace function app.refresh_invoice_totals(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.invoices i set
    amount_received_minor = coalesce((
      select sum(a.amount_minor)
      from public.payment_allocations a
      join public.payments p on p.id = a.payment_id
      where a.invoice_id = i.id
        and p.verification_status = 'verified'
        and p.kind = 'receipt'
    ), 0),
    credited_minor = coalesce((
      select sum(c.amount_minor) from public.credit_notes c where c.invoice_id = i.id
    ), 0)
  where i.id = p_invoice_id;
end $$;

create or replace function app.refresh_payment_allocated(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.payments p set
    allocated_minor = coalesce((select sum(a.amount_minor) from public.payment_allocations a where a.payment_id = p.id), 0)
  where p.id = p_payment_id;
end $$;

create or replace function app.on_allocation_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_payment public.payments;
  v_invoice public.invoices;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    select * into v_payment from public.payments where id = new.payment_id for update;
    select * into v_invoice from public.invoices where id = new.invoice_id for update;
    if v_payment.kind <> 'receipt' then
      raise exception 'Only receipts can be allocated to invoices' using errcode = 'check_violation';
    end if;
    if v_payment.client_id is distinct from v_invoice.client_id then
      raise exception 'Payment and invoice belong to different clients' using errcode = 'check_violation';
    end if;
    if v_payment.currency <> v_invoice.currency then
      raise exception 'Currency mismatch between payment and invoice' using errcode = 'check_violation';
    end if;
    if v_invoice.status = 'cancelled' then
      raise exception 'Cannot allocate to a cancelled invoice' using errcode = 'check_violation';
    end if;
    perform app.refresh_payment_allocated(new.payment_id);
    perform app.refresh_invoice_totals(new.invoice_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform app.refresh_payment_allocated(old.payment_id);
    perform app.refresh_invoice_totals(old.invoice_id);
  end if;
  return null;
end $$;

create trigger payment_allocations_refresh
  after insert or update or delete on public.payment_allocations
  for each row execute function app.on_allocation_change();

create or replace function app.on_payment_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_invoice_id uuid;
begin
  for v_invoice_id in select invoice_id from public.payment_allocations where payment_id = new.id loop
    perform app.refresh_invoice_totals(v_invoice_id);
  end loop;
  return null;
end $$;

create trigger payments_refresh_invoices
  after update of verification_status, kind, amount_minor on public.payments
  for each row execute function app.on_payment_status_change();

create or replace function app.on_credit_note_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.refresh_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
    perform app.refresh_invoice_totals(old.invoice_id);
  end if;
  return null;
end $$;

create trigger credit_notes_refresh
  after insert or update or delete on public.credit_notes
  for each row execute function app.on_credit_note_change();

-- Ledger-derived columns must not be written directly by clients.
create or replace function app.guard_invoice_ledger_columns() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() = 1 and (
       new.amount_received_minor is distinct from old.amount_received_minor
    or new.credited_minor is distinct from old.credited_minor) then
    raise exception 'amount_received_minor and credited_minor are derived from allocations and credit notes'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger invoices_guard_ledger
  before update on public.invoices
  for each row execute function app.guard_invoice_ledger_columns();

create or replace function app.guard_invoice_ledger_insert() returns trigger
language plpgsql as $$
begin
  if new.amount_received_minor <> 0 or new.credited_minor <> 0 then
    raise exception 'New invoices start with zero received and credited amounts'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger invoices_guard_ledger_insert
  before insert on public.invoices
  for each row execute function app.guard_invoice_ledger_insert();

create or replace function app.guard_payment_allocated() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() = 1 and new.allocated_minor is distinct from old.allocated_minor then
    raise exception 'allocated_minor is derived from payment_allocations' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and new.verification_status = 'verified' and old.verification_status <> 'verified'
     and new.verified_at is null then
    new.verified_at := now();
  end if;
  return new;
end $$;

create trigger payments_guard_allocated
  before update on public.payments
  for each row execute function app.guard_payment_allocated();

-- ---------------------------------------------------------------------------
-- updated_at and audit triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'users', 'clients', 'billing_contacts', 'contracts', 'invoices',
    'payment_extensions', 'payments', 'advertising_budgets', 'expenses', 'payment_commitments',
    'reminder_events', 'escalation_tasks', 'app_settings'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()',
                   t || '_touch', t);
  end loop;

  foreach t in array array[
    'clients', 'billing_contacts', 'contracts', 'invoices', 'invoice_line_items', 'credit_notes',
    'payment_extensions', 'payments', 'payment_allocations', 'advertising_budgets',
    'advertising_funding_events', 'expenses', 'payment_commitments', 'escalation_tasks',
    'memberships', 'app_settings'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()',
                   t || '_audit', t);
  end loop;
end $$;
