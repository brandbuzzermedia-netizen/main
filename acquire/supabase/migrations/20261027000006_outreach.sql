-- Acquire: outreach (templates, messages, sequences), usage metering and AI runs.
--
-- Rules guaranteed here (tested in supabase/tests/04_outreach.sql):
--   * Only approved templates can be used by a sequence or a send.
--   * A message is never "sent" unless its eligibility decision was "allow" (check constraint).
--   * Provider message ids are unique per organization, so retried webhooks are no-ops.
--   * An inbound reply stops the lead's active sequences (when the campaign says so).
--   * Usage is metered per message; plan quotas are checked before sending.

-- Per-organization sender details. CAN-SPAM requires a postal address in marketing email.
alter table public.organization_settings
  add column email_from_name   text,
  add column email_from_address text check (email_from_address is null or email_from_address ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column postal_address    text,
  add column sms_from_number   text check (sms_from_number is null or sms_from_number ~ '^\+[1-9][0-9]{6,14}$');
create unique index org_sms_number_unique on public.organization_settings (sms_from_number) where sms_from_number is not null;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
create table public.message_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 80),
  channel         text not null check (channel in ('email', 'sms')),
  subject         text check (subject is null or length(subject) <= 200),
  body            text not null check (length(trim(body)) between 1 and 10000),
  status          text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  approved_by     uuid references public.users (id) on delete set null,
  approved_at     timestamptz,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id),
  check (channel <> 'email' or subject is not null),
  check (channel <> 'sms' or length(body) <= 1600)
);

-- Editing an approved template sends it back to draft: content must be re-approved.
create or replace function app.template_before_write() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if tg_op = 'UPDATE' and (new.body is distinct from old.body or new.subject is distinct from old.subject) and new.status = 'approved' and old.status = 'approved' then
    new.status := 'draft';
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved') then
    new.approved_by := auth.uid();
    new.approved_at := now();
  elsif new.status <> 'approved' then
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end $$;
create trigger template_before_write before insert or update on public.message_templates
  for each row execute function app.template_before_write();

-- ---------------------------------------------------------------------------
-- Campaigns (follow-up sequences) and enrollments
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 80),
  status          text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  -- [{ "channel": "email"|"sms", "template_id": uuid, "delay_days": int }], at most 10 steps.
  steps           jsonb not null default '[]' check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 10),
  stop_on_reply   boolean not null default true,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id)
);

create or replace function app.campaign_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_step jsonb;
begin
  for v_step in select * from jsonb_array_elements(new.steps) loop
    if (v_step ->> 'channel') not in ('email', 'sms') or coalesce((v_step ->> 'delay_days')::int, -1) not between 0 and 90 then
      raise exception 'Each step needs a channel (email or sms) and a delay of 0-90 days' using errcode = 'check_violation';
    end if;
    if new.status = 'active' and not exists (
      select 1 from public.message_templates t
      where t.id = (v_step ->> 'template_id')::uuid and t.organization_id = new.organization_id
        and t.status = 'approved' and t.channel = v_step ->> 'channel') then
      raise exception 'Every step must use an approved % template before the campaign can run', v_step ->> 'channel' using errcode = 'check_violation';
    end if;
  end loop;
  if new.status = 'active' and jsonb_array_length(new.steps) = 0 then
    raise exception 'Add at least one step before activating' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger campaign_before_write before insert or update on public.campaigns
  for each row execute function app.campaign_before_write();

create table public.campaign_enrollments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id     uuid not null,
  lead_id         uuid not null,
  status          text not null default 'active' check (status in ('active', 'completed', 'stopped', 'held')),
  current_step    smallint not null default 0,
  next_run_at     timestamptz not null default now(),
  -- Claimed by a job run; prevents two runs sending the same step.
  locked_until    timestamptz,
  stop_reason     text,
  enrolled_by     uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, campaign_id) references public.campaigns (organization_id, id) on delete cascade,
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete cascade,
  unique (campaign_id, lead_id)
);
create index enrollments_due_idx on public.campaign_enrollments (next_run_at) where status = 'active';

-- ---------------------------------------------------------------------------
-- Messages (the conversation history)
-- ---------------------------------------------------------------------------
create table public.messages (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  lead_id             uuid,
  channel             text not null check (channel in ('email', 'sms')),
  direction           text not null check (direction in ('outbound', 'inbound')),
  to_address          text not null,
  from_address        text,
  subject             text,
  body                text not null,
  -- outbound: blocked/held never leave the platform; queued → sent → delivered | failed | bounced
  status              text not null check (status in ('blocked', 'held', 'queued', 'sent', 'delivered', 'failed', 'bounced', 'received')),
  -- The eligibility result used for this send: decision, reasons, ruleset version.
  decision            jsonb,
  provider            text,
  provider_message_id text,
  error               text,
  template_id         uuid,
  enrollment_id       uuid references public.campaign_enrollments (id) on delete set null,
  step_index          smallint,
  sent_at             timestamptz,
  read_at             timestamptz,
  created_by          uuid references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete cascade,
  check (direction = 'inbound' or decision is not null),
  check (status not in ('queued', 'sent', 'delivered') or decision ->> 'decision' = 'allow'),
  check ((direction = 'inbound') = (status = 'received'))
);
create unique index messages_provider_unique on public.messages (organization_id, provider, provider_message_id) where provider_message_id is not null;
create index on public.messages (lead_id, created_at desc);
create index on public.messages (organization_id, created_at desc);
create index messages_unread_idx on public.messages (organization_id) where direction = 'inbound' and read_at is null;

-- Timeline entries, last-contacted, stage moves and reply handling.
create or replace function app.message_effects() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_contacted uuid;
  v_category  public.stage_category;
begin
  if new.lead_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' and new.direction = 'inbound' then
    insert into public.lead_activities (organization_id, lead_id, kind, summary, data, actor_id)
    values (new.organization_id, new.lead_id, new.channel::public.activity_kind, left(format('Reply: %s', new.body), 500),
            jsonb_build_object('source', 'provider', 'direction', 'inbound', 'message_id', new.id), null);
    -- A reply stops sequences that should stop on reply.
    update public.campaign_enrollments e set status = 'stopped', stop_reason = 'replied'
    from public.campaigns c
    where e.campaign_id = c.id and e.lead_id = new.lead_id and e.status in ('active', 'held') and c.stop_on_reply;
  elsif new.direction = 'outbound' and new.status = 'sent' and (tg_op = 'INSERT' or old.status <> 'sent') then
    insert into public.lead_activities (organization_id, lead_id, kind, summary, data, actor_id)
    values (new.organization_id, new.lead_id, new.channel::public.activity_kind,
            left(coalesce('Sent: ' || new.subject, 'Sent: ' || new.body), 500),
            jsonb_build_object('source', 'provider', 'direction', 'outbound', 'message_id', new.id), new.created_by);
    update public.leads set last_contacted_at = greatest(coalesce(last_contacted_at, now()), now()) where id = new.lead_id;
    select s.category into v_category from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.id = new.lead_id;
    select id into v_contacted from public.pipeline_stages where organization_id = new.organization_id and key = 'contacted';
    if v_category = 'new' and v_contacted is not null then
      update public.leads set stage_id = v_contacted where id = new.lead_id;
    end if;
  end if;
  return new;
end $$;
create trigger message_effects after insert or update of status on public.messages
  for each row execute function app.message_effects();

-- ---------------------------------------------------------------------------
-- AI runs (qualification); every run is logged with tokens and cost.
-- ---------------------------------------------------------------------------
create table public.ai_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lead_id         uuid,
  task            text not null check (task in ('qualify_lead')),
  model           text not null,
  prompt_version  text not null,
  status          text not null check (status in ('succeeded', 'failed', 'rejected')),
  output          jsonb,
  error           text,
  input_tokens    integer,
  output_tokens   integer,
  latency_ms      integer,
  -- Set when a person accepts the suggestion (score applied to the lead).
  applied_by      uuid references public.users (id) on delete set null,
  applied_at      timestamptz,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete cascade
);
create index on public.ai_runs (lead_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['message_templates', 'campaigns', 'campaign_enrollments', 'messages'] loop
    execute format('create trigger touch before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
  foreach t in array array['message_templates', 'campaigns'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit_row()', t);
  end loop;
  foreach t in array array['message_templates', 'campaigns', 'campaign_enrollments', 'messages', 'ai_runs'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

grant select, insert, update, delete on public.message_templates, public.campaigns, public.campaign_enrollments, public.messages, public.ai_runs to authenticated;
grant all on public.message_templates, public.campaigns, public.campaign_enrollments, public.messages, public.ai_runs to service_role;
revoke all on public.message_templates, public.campaigns, public.campaign_enrollments, public.messages, public.ai_runs from anon;
-- Messages and AI runs are evidence: people never edit or delete them (status updates come from the server).
revoke delete on public.messages, public.ai_runs from authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
create policy templates_read on public.message_templates for select to authenticated using (app.is_member(organization_id));
create policy templates_write on public.message_templates for all to authenticated
  using (app.is_manager(organization_id)) with check (app.is_manager(organization_id));

create policy campaigns_read on public.campaigns for select to authenticated using (app.is_member(organization_id));
create policy campaigns_write on public.campaigns for all to authenticated
  using (app.is_manager(organization_id)) with check (app.is_manager(organization_id));

create policy enrollments_read on public.campaign_enrollments for select to authenticated
  using (app.can_read_lead(organization_id, lead_id));
create policy enrollments_write on public.campaign_enrollments for all to authenticated
  using (app.can_write_lead(organization_id, lead_id)) with check (app.can_write_lead(organization_id, lead_id));

create policy messages_read on public.messages for select to authenticated
  using (lead_id is not null and app.can_read_lead(organization_id, lead_id));
-- People create outbound messages (the server then sends them); inbound comes from webhooks only.
create policy messages_insert on public.messages for insert to authenticated
  with check (direction = 'outbound' and created_by = auth.uid() and lead_id is not null and app.can_write_lead(organization_id, lead_id));
-- Only the read marker and send results; the content is fixed once written.
create policy messages_update on public.messages for update to authenticated
  using (lead_id is not null and app.can_write_lead(organization_id, lead_id))
  with check (lead_id is not null and app.can_write_lead(organization_id, lead_id));

create policy ai_runs_read on public.ai_runs for select to authenticated
  using (lead_id is not null and app.can_read_lead(organization_id, lead_id));
create policy ai_runs_insert on public.ai_runs for insert to authenticated
  with check (created_by = auth.uid() and lead_id is not null and app.can_write_lead(organization_id, lead_id));
create policy ai_runs_update on public.ai_runs for update to authenticated
  using (lead_id is not null and app.can_write_lead(organization_id, lead_id))
  with check (lead_id is not null and app.can_write_lead(organization_id, lead_id));

-- Content columns are immutable for people.
create or replace function app.message_content_fixed() returns trigger
language plpgsql as $$
begin
  if current_user = 'authenticated' and (new.body is distinct from old.body or new.subject is distinct from old.subject
     or new.to_address is distinct from old.to_address or new.decision is distinct from old.decision
     or new.direction is distinct from old.direction or new.lead_id is distinct from old.lead_id) then
    raise exception 'Message content cannot be changed' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger message_content_fixed before update on public.messages
  for each row execute function app.message_content_fixed();

-- ---------------------------------------------------------------------------
-- Usage metering and quotas
-- ---------------------------------------------------------------------------
create or replace function public.usage_this_period(p_org uuid, p_metric text) returns numeric
language sql stable security definer set search_path = public, auth as $$
  select case when app.is_member(p_org) or auth.uid() is null then
    coalesce((select sum(u.quantity) from public.usage_records u
              join public.subscriptions s on s.organization_id = u.organization_id
              where u.organization_id = p_org and u.metric = p_metric and u.occurred_at >= s.current_period_start), 0)
  end
$$;

-- Records one unit of usage, idempotent on the provider reference, and enforces the plan quota.
create or replace function public.meter_usage(p_org uuid, p_metric text, p_quantity numeric, p_ref text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_limit integer;
begin
  if auth.uid() is not null and not app.has_role(p_org, array['agency_admin', 'campaign_manager', 'sales_rep']) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  select case p_metric when 'sms' then p.monthly_messages when 'email' then p.monthly_emails when 'ai_call_minutes' then p.monthly_ai_call_minutes end
    into v_limit
  from public.subscriptions s join public.plans p on p.key = s.plan_key
  where s.organization_id = p_org and s.status in ('trialing', 'active', 'past_due');
  if v_limit is not null and public.usage_this_period(p_org, p_metric) + p_quantity > v_limit then
    raise exception 'Plan limit reached for % this period (% allowed). Upgrade the plan to send more.', p_metric, v_limit
      using errcode = 'check_violation';
  end if;
  insert into public.usage_records (organization_id, metric, quantity, source_ref)
  values (p_org, p_metric, p_quantity, p_ref)
  on conflict (organization_id, metric, source_ref) do nothing;
end $$;

revoke execute on all functions in schema public from anon, public;
revoke execute on all functions in schema app from anon, public;
grant execute on all functions in schema app to authenticated, service_role;
grant execute on function public.usage_this_period(uuid, text), public.meter_usage(uuid, text, numeric, text) to authenticated, service_role;
