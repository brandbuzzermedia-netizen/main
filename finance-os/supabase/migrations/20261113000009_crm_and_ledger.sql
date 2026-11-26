-- Diwani Parivaar OS, Phases 3 and 4: CRM records and the shared finance ledger.

-- ===========================================================================
-- Phase 3: contacts/leads, consent, suppression, outreach sequences, handover
-- ===========================================================================
create table public.contacts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  full_name        text not null check (length(trim(full_name)) between 1 and 200),
  company_name     text check (company_name is null or length(company_name) <= 200),
  email            text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone_e164       text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  country          char(2) check (country is null or country ~ '^[A-Z]{2}$'),
  timezone         text,
  language         text,
  source           text check (source is null or length(source) <= 80),
  lead_status      text not null default 'new' check (lead_status in ('new', 'contacted', 'qualified', 'disqualified', 'customer')),
  score            smallint check (score between 0 and 100),
  -- Lawful basis for outreach. 'none' blocks every outreach enrollment.
  consent_basis    text not null default 'none' check (consent_basis in ('consent', 'contract', 'legitimate_interest', 'none')),
  consent_at       timestamptz,
  consent_note     text,
  do_not_contact   boolean not null default false,
  nda_restricted   boolean not null default false,
  owner_id         uuid references public.users (id) on delete set null,
  created_by       uuid default auth.uid() references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, id),
  check (consent_basis = 'none' or consent_at is not null)
);
-- Duplicate detection: one contact per email and per phone within a company.
create unique index contacts_email_unique on public.contacts (organization_id, lower(email)) where email is not null;
create unique index contacts_phone_unique on public.contacts (organization_id, phone_e164) where phone_e164 is not null;
create index on public.contacts (organization_id, lead_status);

create table public.suppression_records (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  channel          text not null check (channel in ('email', 'phone', 'whatsapp', 'linkedin', 'all')),
  value_normalized text not null check (length(value_normalized) between 3 and 320),
  reason           text not null check (reason in ('unsubscribed', 'requested', 'bounced', 'complaint', 'legal', 'other')),
  note             text,
  created_by       uuid default auth.uid() references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (organization_id, channel, value_normalized)
);

create table public.outreach_sequences (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  name              text not null check (length(trim(name)) between 1 and 120),
  -- [{"channel":"email|whatsapp|linkedin_task|call_task","delay_days":0,"template":"..."}]
  steps             jsonb not null default '[]' check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 20),
  stop_on_reply     boolean not null default true,
  -- Bulk or AI-drafted messages need a human approval before anything is sent.
  requires_approval boolean not null default true,
  status            text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  created_by        uuid default auth.uid() references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.outreach_enrollments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  sequence_id      uuid not null,
  contact_id       uuid not null,
  status           text not null default 'active' check (status in ('active', 'paused', 'completed', 'stopped_reply', 'stopped_suppressed', 'stopped_manual')),
  current_step     smallint not null default 0,
  next_step_at     timestamptz,
  created_by       uuid default auth.uid() references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (organization_id, sequence_id) references public.outreach_sequences (organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade,
  unique (sequence_id, contact_id)
);

create table public.outreach_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  contact_id       uuid not null,
  enrollment_id    uuid references public.outreach_enrollments (id) on delete set null,
  kind             text not null check (kind in ('call', 'email', 'whatsapp', 'linkedin', 'reply', 'bounce', 'unsubscribe', 'note')),
  outcome          text check (outcome in ('connected', 'no_answer', 'voicemail', 'positive', 'objection', 'not_now', 'referral', 'wrong_contact', 'out_of_office', 'sent', 'failed', 'other')),
  notes            text,
  occurred_at      timestamptz not null default now(),
  created_by       uuid default auth.uid() references public.users (id) on delete set null,
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade
);
create index on public.outreach_events (organization_id, occurred_at desc);

-- Setter → closer handover on deals.
alter table public.deals
  add column contact_id     uuid,
  add column setter_id      uuid references public.users (id) on delete set null,
  add column handed_over_at timestamptz,
  add constraint deals_contact_fk foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete set null (contact_id);

create or replace function app.is_suppressed(p_org uuid, p_email text, p_phone text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.suppression_records s where s.organization_id = p_org and (
           (s.channel in ('email', 'all') and p_email is not null and s.value_normalized = lower(trim(p_email)))
        or (s.channel in ('phone', 'whatsapp', 'all') and p_phone is not null and s.value_normalized = p_phone)))
$$;

-- No outreach without a lawful basis, to a do-not-contact person, or to a suppressed address.
create or replace function app.guard_enrollment() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.contacts;
begin
  if new.status <> 'active' then return new; end if;
  select * into c from public.contacts where id = new.contact_id;
  if c.do_not_contact then raise exception 'This contact is marked do-not-contact' using errcode = 'check_violation'; end if;
  if c.consent_basis = 'none' then raise exception 'Record a lawful basis (consent, contract or legitimate interest) before outreach' using errcode = 'check_violation'; end if;
  if app.is_suppressed(c.organization_id, c.email, c.phone_e164) then
    raise exception 'This contact is on the suppression list' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.organizations where id = new.organization_id and emergency_stop) then
    raise exception 'Emergency stop is on for this company' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger outreach_enrollments_guard before insert or update on public.outreach_enrollments
  for each row execute function app.guard_enrollment();

-- Recording an unsubscribe suppresses the contact and stops their sequences immediately.
create or replace function app.on_unsubscribe() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.contacts;
begin
  if new.kind not in ('unsubscribe', 'reply', 'bounce') then return new; end if;
  select * into c from public.contacts where id = new.contact_id;
  if new.kind = 'unsubscribe' then
    update public.contacts set do_not_contact = true where id = c.id;
    if c.email is not null then
      insert into public.suppression_records (organization_id, channel, value_normalized, reason, created_by)
      values (c.organization_id, 'email', lower(c.email), 'unsubscribed', auth.uid()) on conflict do nothing;
    end if;
    update public.outreach_enrollments set status = 'stopped_suppressed', next_step_at = null where contact_id = c.id and status = 'active';
  elsif new.kind = 'reply' then
    update public.outreach_enrollments e set status = 'stopped_reply', next_step_at = null
    from public.outreach_sequences s where s.id = e.sequence_id and s.stop_on_reply and e.contact_id = c.id and e.status = 'active';
  elsif new.kind = 'bounce' and c.email is not null then
    insert into public.suppression_records (organization_id, channel, value_normalized, reason, created_by)
    values (c.organization_id, 'email', lower(c.email), 'bounced', auth.uid()) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger outreach_events_unsubscribe after insert on public.outreach_events
  for each row execute function app.on_unsubscribe();

-- Bulk import with duplicate detection. Runs as the caller (RLS applies).
create or replace function public.import_contacts(p_org uuid, p_rows jsonb)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_row jsonb; v_inserted int := 0; v_dupes int := 0; v_errors jsonb := '[]'; v_n int := 0;
begin
  if not app.has_permission(p_org, 'crm.write') then
    raise exception 'Not allowed to import contacts' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Send an array of at most 5000 rows' using errcode = 'invalid_parameter_value';
  end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    begin
      if exists (select 1 from public.contacts c where c.organization_id = p_org and (
           (nullif(v_row ->> 'email', '') is not null and lower(c.email) = lower(v_row ->> 'email'))
        or (nullif(v_row ->> 'phone_e164', '') is not null and c.phone_e164 = v_row ->> 'phone_e164'))) then
        v_dupes := v_dupes + 1;
        continue;
      end if;
      insert into public.contacts (organization_id, full_name, company_name, email, phone_e164, country, source, owner_id)
      values (p_org, v_row ->> 'full_name', nullif(v_row ->> 'company_name', ''), nullif(v_row ->> 'email', ''),
              nullif(v_row ->> 'phone_e164', ''), nullif(upper(v_row ->> 'country'), ''), coalesce(nullif(v_row ->> 'source', ''), 'Import'), auth.uid());
      v_inserted := v_inserted + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', v_n, 'message', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'duplicates', v_dupes, 'errors', v_errors);
end $$;

-- ===========================================================================
-- Phase 4: legal entities and the ledger
-- ===========================================================================
insert into public.permissions (key, description, sensitive) values
  ('finance.approve', 'Approve, void and reverse ledger entries (maker-checker)', true),
  ('finance.sensitive', 'See tax identifiers and bank details', true)
on conflict do nothing;
insert into public.role_permissions (role, permission) values
  ('owner', 'finance.approve'), ('owner', 'finance.sensitive'), ('finance', 'finance.sensitive')
on conflict do nothing;

alter table public.app_settings
  add column self_approval_limit_minor bigint not null default 0 check (self_approval_limit_minor >= 0);

create table public.legal_entities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 200),
  kind            text not null check (kind in ('private_limited', 'llp', 'partnership', 'proprietorship', 'individual', 'huf', 'trust', 'foreign_company', 'other')),
  -- Masked for display; full identifiers belong in an encrypted store (see docs).
  pan_masked      text check (pan_masked is null or pan_masked ~ '^[A-Z]{5}[0-9X]{4}[A-Z]$'),
  gstin           text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  base_currency   char(3) not null default 'INR',
  fy_start_month  smallint not null default 4 check (fy_start_month between 1 and 12),
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index legal_entities_one_default on public.legal_entities (organization_id) where is_default;

-- Every organization gets a default legal entity named after it (configure the real details).
insert into public.legal_entities (organization_id, name, kind, is_default)
select id, coalesce(legal_name, name), 'other', true from public.organizations;
create or replace function app.default_legal_entity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.legal_entities (organization_id, name, kind, is_default) values (new.id, coalesce(new.legal_name, new.name), 'other', true);
  return new;
end $$;
create trigger organizations_default_entity after insert on public.organizations
  for each row execute function app.default_legal_entity();

create type public.ledger_type as enum (
  'income',            -- operating revenue (accrual when approved, cash when settled)
  'commission_income', -- contracted commission only, never partner gross value
  'other_income',      -- interest etc.
  'expense',
  'refund_out',        -- refund to a customer (reduces income)
  'credit_note',       -- reduces income
  'write_off',         -- bad debt
  'transfer_in', 'transfer_out',          -- internal, never income/expense
  'loan_in', 'loan_repayment',            -- financing, never operating
  'capital_in', 'owner_withdrawal',       -- equity, never operating
  'deposit_received', 'deposit_refunded', -- refundable deposits: liabilities
  'pass_through_in', 'pass_through_out',  -- client ad spend held/spent: never agency revenue
  'tax_payment'
);
create type public.ledger_status as enum ('draft', 'pending_approval', 'approved', 'partially_settled', 'settled', 'void', 'reversed');

create table public.ledger_entries (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  legal_entity_id       uuid not null,
  entry_type            public.ledger_type not null,
  category              text not null check (length(trim(category)) between 1 and 60),
  subcategory           text check (subcategory is null or length(subcategory) <= 60),
  description           text not null check (length(trim(description)) between 1 and 300),
  counterparty          text check (counterparty is null or length(counterparty) <= 200),
  txn_date              date not null,
  accounting_date       date,
  due_on                date,
  amount_minor          bigint not null check (amount_minor > 0),
  currency              char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  -- Foreign currency: rate and its date are stored; the converted value is a booked figure only when a rate is recorded.
  fx_rate               numeric(18, 8) check (fx_rate is null or fx_rate > 0),
  fx_rate_date          date,
  base_amount_minor     bigint check (base_amount_minor is null or base_amount_minor > 0),
  tax_minor             bigint not null default 0 check (tax_minor >= 0),
  status                public.ledger_status not null default 'draft',
  settled_minor         bigint not null default 0 check (settled_minor >= 0),
  settled_on            date,
  payment_method        text,
  payment_reference     text,
  transfer_group_id     uuid,
  reverses_entry_id     uuid references public.ledger_entries (id) on delete restrict,
  source_document_id    uuid,
  rental_unit_id        uuid,
  memo                  text,
  created_by            uuid default auth.uid() references public.users (id) on delete set null,
  submitted_at          timestamptz,
  approved_by           uuid references public.users (id) on delete set null,
  approved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, legal_entity_id) references public.legal_entities (organization_id, id) on delete restrict,
  check (settled_minor <= amount_minor),
  check (currency = 'INR' or (fx_rate is null) = (base_amount_minor is null)),
  check (fx_rate is null or fx_rate_date is not null),
  check (entry_type not in ('transfer_in', 'transfer_out') or transfer_group_id is not null)
);
create index on public.ledger_entries (organization_id, txn_date);
create index on public.ledger_entries (organization_id, status);
create index on public.ledger_entries (transfer_group_id) where transfer_group_id is not null;

-- Base amount: INR rows are their own base; foreign rows use the recorded rate.
create or replace function app.ledger_base_amount() returns trigger
language plpgsql as $$
begin
  if new.currency = 'INR' then new.base_amount_minor := new.amount_minor; end if;
  return new;
end $$;
create trigger ledger_entries_base before insert or update on public.ledger_entries
  for each row execute function app.ledger_base_amount();

-- Approved rows are immutable except through the RPCs below (settle, void, reverse).
create or replace function app.guard_ledger_update() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 or current_setting('app.ledger_rpc', true) = 'on' then return new; end if;
  if old.status not in ('draft', 'pending_approval') then
    raise exception 'Approved ledger entries cannot be edited. Reverse or void them instead.' using errcode = 'insufficient_privilege';
  end if;
  if new.status not in ('draft', 'pending_approval') or new.approved_by is distinct from old.approved_by or new.settled_minor <> old.settled_minor then
    raise exception 'Approval and settlement go through the approval functions' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger ledger_entries_guard before update on public.ledger_entries
  for each row execute function app.guard_ledger_update();

create or replace function app.guard_ledger_insert() returns trigger
language plpgsql as $$
begin
  if current_setting('app.ledger_rpc', true) = 'on' then return new; end if;
  if new.status not in ('draft', 'pending_approval') or new.settled_minor <> 0 or new.approved_by is not null then
    raise exception 'New ledger entries start as draft or pending approval' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger ledger_entries_guard_insert before insert on public.ledger_entries
  for each row execute function app.guard_ledger_insert();

create or replace function app.guard_ledger_delete() returns trigger
language plpgsql as $$
begin
  if old.status not in ('draft') then
    raise exception 'Only drafts can be deleted; void or reverse the entry instead' using errcode = 'insufficient_privilege';
  end if;
  return old;
end $$;
create trigger ledger_entries_guard_delete before delete on public.ledger_entries
  for each row execute function app.guard_ledger_delete();

-- Maker-checker approval. The approver must differ from the creator unless the amount is
-- within the company's self-approval limit (default 0: always a second person).
create or replace function public.approve_ledger_entry(p_entry uuid, p_approve boolean, p_note text default null)
returns public.ledger_status
language plpgsql security definer set search_path = public, auth as $$
declare e public.ledger_entries; v_limit bigint;
begin
  select * into e from public.ledger_entries where id = p_entry for update;
  if e.id is null or not app.has_permission(e.organization_id, 'finance.approve') then
    raise exception 'Not allowed to approve entries in this company' using errcode = 'insufficient_privilege';
  end if;
  if e.status <> 'pending_approval' then raise exception 'Only entries pending approval can be decided' using errcode = 'check_violation'; end if;
  select self_approval_limit_minor into v_limit from public.app_settings where organization_id = e.organization_id;
  if p_approve and e.created_by = auth.uid() and e.amount_minor > coalesce(v_limit, 0) then
    raise exception 'Someone other than the creator must approve this entry' using errcode = 'insufficient_privilege';
  end if;
  if p_approve and e.currency <> 'INR' and e.fx_rate is null then
    raise exception 'Record the FX rate and its date before approving a foreign-currency entry' using errcode = 'check_violation';
  end if;
  perform set_config('app.ledger_rpc', 'on', true);
  update public.ledger_entries set
    status = case when p_approve then 'approved'::public.ledger_status else 'draft'::public.ledger_status end,
    approved_by = case when p_approve then auth.uid() end,
    approved_at = case when p_approve then now() end,
    memo = coalesce(nullif(trim(p_note), ''), memo)
  where id = p_entry returning status into e.status;
  perform set_config('app.ledger_rpc', 'off', true);
  return e.status;
end $$;

-- Record cash against an approved entry (full or partial).
create or replace function public.settle_ledger_entry(p_entry uuid, p_amount_minor bigint, p_on date, p_method text, p_reference text)
returns public.ledger_status
language plpgsql security definer set search_path = public, auth as $$
declare e public.ledger_entries; v_total bigint;
begin
  select * into e from public.ledger_entries where id = p_entry for update;
  if e.id is null or not app.has_permission(e.organization_id, 'finance.write') then
    raise exception 'Not allowed to record settlements in this company' using errcode = 'insufficient_privilege';
  end if;
  if e.status not in ('approved', 'partially_settled') then raise exception 'Only approved entries can be settled' using errcode = 'check_violation'; end if;
  if p_amount_minor <= 0 then raise exception 'Settlement amount must be positive' using errcode = 'check_violation'; end if;
  if coalesce(length(trim(p_reference)), 0) = 0 then raise exception 'A payment reference is required' using errcode = 'check_violation'; end if;
  v_total := e.settled_minor + p_amount_minor;
  if v_total > e.amount_minor then raise exception 'Settlement exceeds the entry amount' using errcode = 'check_violation'; end if;
  perform set_config('app.ledger_rpc', 'on', true);
  update public.ledger_entries set settled_minor = v_total, settled_on = p_on, payment_method = p_method,
    payment_reference = trim(p_reference),
    status = case when v_total = amount_minor then 'settled'::public.ledger_status else 'partially_settled'::public.ledger_status end
  where id = p_entry returning status into e.status;
  perform set_config('app.ledger_rpc', 'off', true);
  return e.status;
end $$;

-- Reverse an approved entry: it stays in the ledger (and audit log) marked reversed and drops out of every report.
create or replace function public.reverse_ledger_entry(p_entry uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare e public.ledger_entries; v_new uuid;
begin
  select * into e from public.ledger_entries where id = p_entry for update;
  if e.id is null or not app.has_permission(e.organization_id, 'finance.approve') then
    raise exception 'Not allowed to reverse entries in this company' using errcode = 'insufficient_privilege';
  end if;
  if e.status not in ('approved', 'partially_settled', 'settled') then raise exception 'Only approved entries can be reversed' using errcode = 'check_violation'; end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'Give a reason for the reversal' using errcode = 'check_violation'; end if;
  perform set_config('app.ledger_rpc', 'on', true);
  update public.ledger_entries set status = 'reversed', memo = concat_ws(' · ', memo, 'Reversed: ' || trim(p_reason)) where id = p_entry;
  perform set_config('app.ledger_rpc', 'off', true);
  return p_entry;
end $$;

-- Internal transfer between two companies/entities in the same group: both legs in one transaction.
create or replace function public.record_internal_transfer(p_from_org uuid, p_to_org uuid, p_amount_minor bigint, p_on date, p_reference text, p_description text)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare v_group uuid := gen_random_uuid();
begin
  if not (app.has_permission(p_from_org, 'finance.write') and app.has_permission(p_to_org, 'finance.write')) then
    raise exception 'You need finance access in both companies' using errcode = 'insufficient_privilege';
  end if;
  if (select family_group_id from public.organizations where id = p_from_org) is distinct from (select family_group_id from public.organizations where id = p_to_org) then
    raise exception 'Both companies must be in the same group' using errcode = 'check_violation';
  end if;
  insert into public.ledger_entries (organization_id, legal_entity_id, entry_type, category, description, txn_date, amount_minor, payment_reference, transfer_group_id, status)
  values
    (p_from_org, (select id from public.legal_entities where organization_id = p_from_org and is_default), 'transfer_out', 'Internal transfer', p_description, p_on, p_amount_minor, p_reference, v_group, 'pending_approval'),
    (p_to_org, (select id from public.legal_entities where organization_id = p_to_org and is_default), 'transfer_in', 'Internal transfer', p_description, p_on, p_amount_minor, p_reference, v_group, 'pending_approval');
  return v_group;
end $$;

-- ===========================================================================
-- RLS and grants
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array['contacts', 'suppression_records', 'outreach_sequences', 'outreach_enrollments', 'outreach_events', 'legal_entities', 'ledger_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()', t || '_audit', t);
  end loop;
  foreach t in array array['contacts', 'outreach_sequences', 'outreach_enrollments', 'legal_entities', 'ledger_entries'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;
create trigger contacts_guard_people before insert or update on public.contacts for each row execute function app.guard_crm_people();

create policy contacts_read on public.contacts for select to authenticated
  using (app.has_permission(organization_id, 'crm.read_all')
      or (owner_id = auth.uid() and app.has_permission(organization_id, 'crm.read_assigned')));
create policy contacts_insert on public.contacts for insert to authenticated with check (app.can_write_owned(organization_id, owner_id));
create policy contacts_update on public.contacts for update to authenticated
  using (app.can_write_owned(organization_id, owner_id)) with check (app.can_write_owned(organization_id, owner_id));
create policy contacts_delete on public.contacts for delete to authenticated using (app.has_permission(organization_id, 'crm.manage'));

-- Suppression is readable by anyone doing outreach (so they can honour it); only managers remove entries.
create policy suppression_read on public.suppression_records for select to authenticated using (app.has_permission(organization_id, 'crm.write'));
create policy suppression_insert on public.suppression_records for insert to authenticated with check (app.has_permission(organization_id, 'crm.write'));
create policy suppression_delete on public.suppression_records for delete to authenticated using (app.has_permission(organization_id, 'crm.manage'));

create policy sequences_read on public.outreach_sequences for select to authenticated using (app.has_permission(organization_id, 'crm.write'));
create policy sequences_write on public.outreach_sequences for all to authenticated
  using (app.has_permission(organization_id, 'crm.manage')) with check (app.has_permission(organization_id, 'crm.manage'));

create policy enrollments_read on public.outreach_enrollments for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id));
create policy enrollments_write on public.outreach_enrollments for all to authenticated
  using (app.has_permission(organization_id, 'crm.write') and exists (select 1 from public.contacts c where c.id = contact_id))
  with check (app.has_permission(organization_id, 'crm.write') and exists (select 1 from public.contacts c where c.id = contact_id));

create policy events_read on public.outreach_events for select to authenticated
  using (exists (select 1 from public.contacts c where c.id = contact_id));
create policy events_insert on public.outreach_events for insert to authenticated
  with check (app.has_permission(organization_id, 'crm.write') and exists (select 1 from public.contacts c where c.id = contact_id));

create policy legal_entities_read on public.legal_entities for select to authenticated using (app.can_read_finance(organization_id));
create policy legal_entities_write on public.legal_entities for all to authenticated
  using (app.has_permission(organization_id, 'finance.approve')) with check (app.has_permission(organization_id, 'finance.approve'));

create policy ledger_read on public.ledger_entries for select to authenticated using (app.can_read_finance(organization_id));
create policy ledger_insert on public.ledger_entries for insert to authenticated with check (app.can_write(organization_id));
create policy ledger_update on public.ledger_entries for update to authenticated
  using (app.can_write(organization_id)) with check (app.can_write(organization_id));
create policy ledger_delete on public.ledger_entries for delete to authenticated using (app.can_write(organization_id));

revoke all on function public.import_contacts(uuid, jsonb), public.approve_ledger_entry(uuid, boolean, text),
  public.settle_ledger_entry(uuid, bigint, date, text, text), public.reverse_ledger_entry(uuid, text),
  public.record_internal_transfer(uuid, uuid, bigint, date, text, text) from public, anon;
grant execute on function public.import_contacts(uuid, jsonb), public.approve_ledger_entry(uuid, boolean, text),
  public.settle_ledger_entry(uuid, bigint, date, text, text), public.reverse_ledger_entry(uuid, text),
  public.record_internal_transfer(uuid, uuid, bigint, date, text, text) to authenticated;
revoke execute on all functions in schema app from anon, public;
grant execute on all functions in schema app to authenticated, service_role;
