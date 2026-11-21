-- Team activity feed and notifications, for every company and the group view.
-- Rows are written by triggers on the work itself; a failure here never blocks that work.
-- Visibility (scope):
--   team    : everyone in the company (wins without client names, completed follow-ups, new teammates)
--   crm     : people who can read every deal, plus the person who did it (deal names, meetings, proposals, replies)
--   finance : people with finance access (payments received)

create table public.activity_feed (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id        uuid references public.users (id) on delete set null,
  kind            text not null check (kind in ('deal_created', 'deal_won', 'proposal_sent', 'proposal_accepted', 'meeting_booked',
                                                'task_done', 'positive_reply', 'payment_received', 'member_joined')),
  scope           text not null default 'team' check (scope in ('team', 'crm', 'finance')),
  title           text not null check (length(title) <= 300),
  amount_minor    bigint,
  created_at      timestamptz not null default now()
);
create index on public.activity_feed (organization_id, created_at desc);
alter table public.activity_feed enable row level security;
create policy activity_feed_read on public.activity_feed for select to authenticated using (
  app.has_permission(organization_id, 'company.view') and (
    scope = 'team'
    or (scope = 'crm' and (app.has_permission(organization_id, 'crm.read_all') or actor_id = auth.uid()))
    or (scope = 'finance' and app.has_permission(organization_id, 'finance.read'))));
grant select on public.activity_feed to authenticated;
grant all on public.activity_feed to service_role;

-- When each person last opened their notifications.
create table public.activity_seen (
  user_id uuid primary key references public.users (id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.activity_seen enable row level security;
create policy activity_seen_own on public.activity_seen for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.activity_seen to authenticated;
grant all on public.activity_seen to service_role;

create or replace function app.log_activity(p_org uuid, p_actor uuid, p_kind text, p_scope text, p_title text, p_amount bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_feed (organization_id, actor_id, kind, scope, title, amount_minor)
  values (p_org, p_actor, p_kind, p_scope, left(p_title, 300), p_amount);
exception when others then raise warning 'activity not logged: %', sqlerrm;
end $$;

create or replace function app.activity_deals() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kind text; v_old text;
begin
  select kind into v_kind from public.pipeline_stages where id = new.stage_id;
  if tg_op = 'INSERT' then
    perform app.log_activity(new.organization_id, coalesce(auth.uid(), new.owner_id), 'deal_created', 'crm', 'added a deal: ' || new.title, new.value_minor);
    if v_kind = 'won' then perform app.log_activity(new.organization_id, new.owner_id, 'deal_won', 'team', 'won a deal', new.value_minor); end if;
  elsif new.stage_id is distinct from old.stage_id and v_kind = 'won' then
    select kind into v_old from public.pipeline_stages where id = old.stage_id;
    if v_old is distinct from 'won' then perform app.log_activity(new.organization_id, coalesce(new.owner_id, auth.uid()), 'deal_won', 'team', 'won a deal', new.value_minor); end if;
  end if;
  return new;
end $$;
create trigger deals_activity after insert or update of stage_id on public.deals for each row execute function app.activity_deals();

create or replace function app.activity_proposals() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_total bigint := round(new.amount_minor * (1 + new.gst_bp / 10000.0));
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    perform app.log_activity(new.organization_id, coalesce(auth.uid(), new.owner_id), 'proposal_sent', 'crm', format('sent proposal %s to %s', new.number, new.client_name), v_total);
  elsif new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    perform app.log_activity(new.organization_id, coalesce(new.owner_id, auth.uid()), 'proposal_accepted', 'crm', format('got proposal %s accepted by %s', new.number, new.client_name), v_total);
  end if;
  return new;
end $$;
create trigger proposals_activity after insert or update of status on public.proposals for each row execute function app.activity_proposals();

create or replace function app.activity_meetings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.log_activity(new.organization_id, coalesce(new.owner_id, auth.uid()), 'meeting_booked', 'crm', 'booked a meeting: ' || new.title, null);
  return new;
end $$;
create trigger meetings_activity after insert on public.meetings for each row execute function app.activity_meetings();

create or replace function app.activity_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    perform app.log_activity(new.organization_id, coalesce(auth.uid(), new.assignee_id), 'task_done', 'team', 'completed a follow-up', null);
  end if;
  return new;
end $$;
create trigger tasks_activity after update of status on public.tasks for each row execute function app.activity_tasks();

create or replace function app.activity_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.outcome = 'positive' and new.created_by is not null then
    select full_name into v_name from public.contacts where id = new.contact_id;
    perform app.log_activity(new.organization_id, new.created_by, 'positive_reply', 'crm', format('got a positive %s from %s', replace(new.kind, '_', ' '), coalesce(v_name, 'a lead')), null);
  end if;
  return new;
end $$;
create trigger outreach_events_activity after insert on public.outreach_events for each row execute function app.activity_events();

create or replace function app.activity_payments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'receipt' and new.verification_status = 'verified' and (tg_op = 'INSERT' or old.verification_status is distinct from 'verified') then
    perform app.log_activity(new.organization_id, coalesce(new.verified_by, auth.uid()), 'payment_received', 'finance',
      'recorded a payment' || coalesce(' from ' || new.payer_name, ''), new.amount_minor);
  end if;
  return new;
end $$;
create trigger payments_activity after insert or update of verification_status on public.payments for each row execute function app.activity_payments();

create or replace function app.activity_members() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.log_activity(new.organization_id, new.user_id, 'member_joined', 'team', 'joined the team', null);
  return new;
end $$;
create trigger memberships_activity after insert on public.memberships for each row execute function app.activity_members();

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
