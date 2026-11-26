-- Diwani Parivaar OS, Phases 7-9: tax readiness, automation control, AI usage.

-- ===========================================================================
-- Phase 7: tax periods and accountant access
-- ===========================================================================
create table public.tax_periods (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  legal_entity_id  uuid not null,
  kind             text not null check (kind in ('gst_monthly', 'gst_quarterly', 'gst_annual', 'itr', 'tds_quarterly', 'advance_tax', 'other')),
  label            text not null check (length(trim(label)) between 1 and 80),
  period_start     date not null,
  period_end       date not null,
  due_on           date,
  status           text not null default 'not_started' check (status in ('not_started', 'preparing', 'in_review', 'ready_to_file', 'filed')),
  accountant_id    uuid references public.users (id) on delete set null,
  ack_reference    text,
  filed_on         date,
  filed_recorded_by uuid references public.users (id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, legal_entity_id, kind, period_start),
  foreign key (organization_id, legal_entity_id) references public.legal_entities (organization_id, id) on delete restrict,
  check (period_end >= period_start),
  -- "Filed" only with a real acknowledgement reference and date.
  check (status <> 'filed' or (length(trim(coalesce(ack_reference, ''))) >= 5 and filed_on is not null and filed_recorded_by is not null))
);

create table public.accountant_grants (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  legal_entity_id  uuid not null,
  user_id          uuid not null references public.users (id) on delete cascade,
  period_start     date not null,
  period_end       date not null,
  granted_by       uuid default auth.uid() references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, legal_entity_id) references public.legal_entities (organization_id, id) on delete cascade,
  check (period_end >= period_start)
);

create or replace function app.accountant_can_read(p_org uuid, p_entity uuid, p_date date) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.accountant_grants g join public.memberships m on m.organization_id = g.organization_id and m.user_id = g.user_id
                 where g.organization_id = p_org and g.user_id = auth.uid() and g.legal_entity_id = p_entity
                   and p_date between g.period_start and g.period_end)
$$;

-- Accountants read only the entities and periods granted to them.
create policy ledger_read_accountant on public.ledger_entries for select to authenticated
  using (app.accountant_can_read(organization_id, legal_entity_id, txn_date));
create policy legal_entities_read_accountant on public.legal_entities for select to authenticated
  using (exists (select 1 from public.accountant_grants g where g.legal_entity_id = id and g.user_id = auth.uid()));

-- Recording a filing: only someone who may approve finance, and only with an acknowledgement.
create or replace function public.record_filing(p_period uuid, p_ack text, p_filed_on date)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.tax_periods where id = p_period;
  if v_org is null or not app.has_permission(v_org, 'finance.approve') then
    raise exception 'Only an authorised person can mark a return as filed' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('app.filing_rpc', 'on', true);
  update public.tax_periods set status = 'filed', ack_reference = trim(p_ack), filed_on = p_filed_on, filed_recorded_by = auth.uid() where id = p_period;
  perform set_config('app.filing_rpc', 'off', true);
end $$;

-- Direct status changes can move a period through preparation but never to "filed".
create or replace function app.guard_tax_status() returns trigger
language plpgsql as $$
begin
  if new.status = 'filed' and (tg_op = 'INSERT' or old.status <> 'filed') and current_setting('app.filing_rpc', true) is distinct from 'on' then
    raise exception 'Use record_filing with the acknowledgement reference' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and old.status = 'filed' then
    raise exception 'A filed period is locked' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger tax_periods_guard before insert or update on public.tax_periods for each row execute function app.guard_tax_status();

-- ===========================================================================
-- Phase 8: automation (configuration and run history; n8n executes)
-- ===========================================================================
insert into public.permissions (key, description, sensitive) values
  ('automation.manage', 'Configure, enable and pause automations', true),
  ('automation.approve', 'Approve automation runs that need sign-off', true)
on conflict do nothing;
insert into public.role_permissions (role, permission) values
  ('owner', 'automation.manage'), ('owner', 'automation.approve'), ('company_admin', 'automation.manage')
on conflict do nothing;

create table public.automation_definitions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  template_key      text not null,
  name              text not null,
  trigger_kind      text not null check (trigger_kind in ('schedule', 'record_change', 'manual', 'webhook')),
  trigger_detail    text,
  enabled           boolean not null default false,
  requires_approval boolean not null default true,
  is_financial      boolean not null default false,
  idempotent        boolean not null default true,
  environment       text not null default 'development' check (environment in ('development', 'staging', 'production')),
  n8n_workflow_id   text,
  input_mapping     jsonb not null default '{}' check (jsonb_typeof(input_mapping) = 'object'),
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, template_key),
  -- A financial action is never auto-approved.
  check (not is_financial or requires_approval)
);

create table public.automation_runs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  definition_id     uuid not null,
  idempotency_key   text not null check (length(idempotency_key) between 8 and 200),
  trigger_source    text not null,
  status            text not null default 'queued' check (status in ('pending_approval', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'needs_attention')),
  is_mock           boolean not null default false,
  n8n_execution_id  text,
  attempts          smallint not null default 0,
  last_error        text,
  payload_summary   jsonb not null default '{}',
  requested_by      uuid default auth.uid() references public.users (id) on delete set null,
  approved_by       uuid references public.users (id) on delete set null,
  approved_at       timestamptz,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (organization_id, definition_id) references public.automation_definitions (organization_id, id) on delete cascade,
  unique (organization_id, idempotency_key)
);
create index on public.automation_runs (organization_id, created_at desc);

-- Replay protection for signed callbacks.
create table public.webhook_nonces (
  nonce        text primary key,
  received_at  timestamptz not null default now()
);

create or replace function public.request_automation_run(p_definition uuid, p_idempotency_key text, p_source text, p_summary jsonb default '{}', p_mock boolean default false)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare d public.automation_definitions; v_run uuid;
begin
  select * into d from public.automation_definitions where id = p_definition;
  if d.id is null or not (app.has_permission(d.organization_id, 'automation.manage') or app.has_permission(d.organization_id, 'automation.approve')) then
    raise exception 'Not allowed to run automations in this company' using errcode = 'insufficient_privilege';
  end if;
  if not d.enabled and not p_mock then raise exception 'This automation is disabled' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.organizations where id = d.organization_id and emergency_stop) then
    raise exception 'Emergency stop is on for this company' using errcode = 'check_violation';
  end if;
  -- Duplicate events return the existing run instead of executing twice.
  select id into v_run from public.automation_runs where organization_id = d.organization_id and idempotency_key = p_idempotency_key;
  if v_run is not null then return v_run; end if;
  insert into public.automation_runs (organization_id, definition_id, idempotency_key, trigger_source, status, is_mock, payload_summary)
  values (d.organization_id, d.id, p_idempotency_key, p_source,
          case when d.requires_approval and not p_mock then 'pending_approval' else 'queued' end, p_mock, coalesce(p_summary, '{}'))
  returning id into v_run;
  return v_run;
end $$;

create or replace function public.decide_automation_run(p_run uuid, p_approve boolean)
returns text
language plpgsql security definer set search_path = public, auth as $$
declare r public.automation_runs;
begin
  select * into r from public.automation_runs where id = p_run for update;
  if r.id is null or not app.has_permission(r.organization_id, 'automation.approve') then
    raise exception 'Not allowed to approve automation runs' using errcode = 'insufficient_privilege';
  end if;
  if r.status <> 'pending_approval' then raise exception 'This run is not waiting for approval' using errcode = 'check_violation'; end if;
  update public.automation_runs set status = case when p_approve then 'queued' else 'cancelled' end,
    approved_by = auth.uid(), approved_at = now() where id = p_run returning status into r.status;
  return r.status;
end $$;

create or replace function public.retry_automation_run(p_run uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare r public.automation_runs; d public.automation_definitions;
begin
  select * into r from public.automation_runs where id = p_run for update;
  select * into d from public.automation_definitions where id = r.definition_id;
  if r.id is null or not app.has_permission(r.organization_id, 'automation.manage') then
    raise exception 'Not allowed to retry automation runs' using errcode = 'insufficient_privilege';
  end if;
  if r.status not in ('failed', 'needs_attention') then raise exception 'Only failed runs can be retried' using errcode = 'check_violation'; end if;
  if d.is_financial or not d.idempotent then
    raise exception 'This automation is not safe to retry automatically. Check what happened and handle it by hand.' using errcode = 'check_violation';
  end if;
  update public.automation_runs set status = 'queued', last_error = null where id = p_run;
end $$;

-- ===========================================================================
-- Phase 9: AI usage and budgets
-- ===========================================================================
alter table public.app_settings
  add column ai_enabled boolean not null default false,
  add column ai_monthly_token_limit integer not null default 500000 check (ai_monthly_token_limit >= 0);

create table public.ai_usage_log (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid default auth.uid() references public.users (id) on delete set null,
  purpose          text not null check (purpose in ('bill_extraction', 'follow_up_draft', 'meeting_brief', 'summary', 'other')),
  model            text not null,
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  is_mock          boolean not null default false,
  refused          boolean not null default false,
  -- What happened to the output: drafts stay drafts until a person approves them.
  outcome          text not null default 'draft' check (outcome in ('draft', 'approved', 'discarded', 'error')),
  created_at       timestamptz not null default now()
);
create index on public.ai_usage_log (organization_id, created_at desc);

create or replace function public.ai_budget_remaining(p_org uuid) returns integer
language sql stable security definer set search_path = public, auth as $$
  select case when not app.is_member(p_org) then 0 else greatest(0,
    (select ai_monthly_token_limit from public.app_settings where organization_id = p_org)
    - coalesce((select sum(input_tokens + output_tokens) from public.ai_usage_log
                where organization_id = p_org and created_at >= date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'), 0))::int end
$$;

-- ===========================================================================
-- RLS
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array['tax_periods', 'accountant_grants', 'automation_definitions', 'automation_runs', 'ai_usage_log', 'webhook_nonces'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
  foreach t in array array['tax_periods', 'accountant_grants', 'automation_definitions', 'automation_runs', 'ai_usage_log'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()', t || '_audit', t);
  end loop;
  foreach t in array array['tax_periods', 'automation_definitions', 'automation_runs'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

create policy tax_read on public.tax_periods for select to authenticated
  using (app.can_read_finance(organization_id) or accountant_id = auth.uid()
      or app.accountant_can_read(organization_id, legal_entity_id, period_start));
create policy tax_write on public.tax_periods for all to authenticated
  using (app.can_write(organization_id)) with check (app.can_write(organization_id));
-- An assigned accountant may move their period through review (never to filed: see trigger).
create policy tax_accountant_update on public.tax_periods for update to authenticated
  using (accountant_id = auth.uid() and app.is_member(organization_id)) with check (accountant_id = auth.uid() and status <> 'filed');

create policy grants_read on public.accountant_grants for select to authenticated using (app.can_read_finance(organization_id) or user_id = auth.uid());
create policy grants_write on public.accountant_grants for all to authenticated
  using (app.has_permission(organization_id, 'finance.approve')) with check (app.has_permission(organization_id, 'finance.approve'));

create policy automation_defs_read on public.automation_definitions for select to authenticated
  using (app.has_permission(organization_id, 'automation.manage') or app.has_permission(organization_id, 'automation.approve'));
create policy automation_defs_write on public.automation_definitions for all to authenticated
  using (app.has_permission(organization_id, 'automation.manage')) with check (app.has_permission(organization_id, 'automation.manage'));
create policy automation_runs_read on public.automation_runs for select to authenticated
  using (app.has_permission(organization_id, 'automation.manage') or app.has_permission(organization_id, 'automation.approve'));
-- Runs change only through the RPCs above or the signed callback (service role).
revoke insert, update, delete on public.automation_runs from authenticated;

create policy ai_usage_read on public.ai_usage_log for select to authenticated
  using (app.has_permission(organization_id, 'audit.read') or user_id = auth.uid());
create policy ai_usage_insert on public.ai_usage_log for insert to authenticated
  with check (app.is_member(organization_id) and user_id = auth.uid());
create policy ai_usage_update on public.ai_usage_log for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke delete on public.ai_usage_log from authenticated;

revoke all on function public.record_filing(uuid, text, date), public.request_automation_run(uuid, text, text, jsonb, boolean),
  public.decide_automation_run(uuid, boolean), public.retry_automation_run(uuid), public.ai_budget_remaining(uuid) from public, anon;
grant execute on function public.record_filing(uuid, text, date), public.request_automation_run(uuid, text, text, jsonb, boolean),
  public.decide_automation_run(uuid, boolean), public.retry_automation_run(uuid), public.ai_budget_remaining(uuid) to authenticated;
revoke execute on all functions in schema app from anon, public;
grant execute on all functions in schema app to authenticated, service_role;
