-- Acquire: built-in CRM (deals, tasks, appointments, logged interactions) and the dashboard.
--
-- The internal CRM is the system of record. GoHighLevel (phase 6) syncs to it, never the reverse.
--
-- Rules guaranteed here (tested in supabase/tests/03_crm.sql):
--   * Deals record closed_at when they enter a won/lost stage and clear it when reopened.
--   * Owners and assignees must be members of the organization.
--   * Booking an appointment moves an early-stage lead to "Appointment booked".
--   * Logging an outbound interaction sets last_contacted_at and moves a "new" lead to "Contacted".
--   * Sales reps see deals, tasks and appointments on their own leads or assigned to them.

-- ---------------------------------------------------------------------------
-- Shared helper: is this user a member of the organization?
-- ---------------------------------------------------------------------------
create or replace function app.require_member(p_org uuid, p_user uuid, p_what text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_user is not null and not exists (select 1 from public.memberships where organization_id = p_org and user_id = p_user) then
    raise exception 'The % must be a member of this organization', p_what using errcode = 'foreign_key_violation';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Deal stages and deals
-- ---------------------------------------------------------------------------
create type public.deal_category as enum ('open', 'won', 'lost');

create table public.deal_stages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 60),
  category        public.deal_category not null,
  -- Chance of closing, used for the weighted pipeline value.
  probability     smallint not null check (probability between 0 and 100),
  position        smallint not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id),
  check (category = 'open' or probability = case category when 'won' then 100 else 0 end)
);

create or replace function app.seed_deal_stages(p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.deal_stages (organization_id, name, category, probability, position)
  select p_org, s.name, s.category::public.deal_category, s.p, s.pos
  from (values
    ('Qualified',            'open', 10,  10),
    ('Viewing / valuation',  'open', 25,  20),
    ('Offer made',           'open', 50,  30),
    ('Negotiation',          'open', 70,  40),
    ('Under contract',       'open', 90,  50),
    ('Closed won',           'won',  100, 60),
    ('Closed lost',          'lost', 0,   70)
  ) as s(name, category, p, pos)
  where not exists (select 1 from public.deal_stages where organization_id = p_org)
$$;

-- Existing organizations get the defaults too.
do $$ begin perform app.seed_deal_stages(id) from public.organizations; end $$;

create table public.deals (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  lead_id             uuid not null,
  title               text not null check (length(trim(title)) between 1 and 200),
  deal_type           text not null default 'purchase' check (deal_type in ('purchase', 'sale', 'rental', 'lease', 'investment', 'other')),
  -- Transaction value (price or annual rent) and the agency's expected commission.
  value_minor         bigint check (value_minor is null or value_minor >= 0),
  commission_minor    bigint check (commission_minor is null or commission_minor >= 0),
  currency            char(3) not null,
  stage_id            uuid not null,
  owner_id            uuid references public.users (id) on delete set null,
  expected_close_date date,
  closed_at           timestamptz,
  lost_reason         text,
  property_ref        text,
  notes               text,
  created_by          uuid references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete cascade,
  foreign key (organization_id, stage_id) references public.deal_stages (organization_id, id) on delete restrict,
  unique (organization_id, id)
);
create index on public.deals (organization_id, stage_id);
create index on public.deals (organization_id, owner_id);
create index on public.deals (lead_id);
create index on public.deals (organization_id, closed_at);

create or replace function app.deal_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_new public.deal_category;
  v_old public.deal_category;
begin
  perform app.require_member(new.organization_id, new.owner_id, 'deal owner');
  select category into v_new from public.deal_stages where id = new.stage_id;
  if tg_op = 'UPDATE' then
    select category into v_old from public.deal_stages where id = old.stage_id;
  end if;
  if v_new <> 'open' and (tg_op = 'INSERT' or v_old = 'open' or new.closed_at is null) then
    new.closed_at := coalesce(new.closed_at, now());
  elsif v_new = 'open' then
    new.closed_at := null;
    new.lost_reason := null;
  end if;
  return new;
end $$;

create trigger deal_before_write before insert or update of stage_id, owner_id on public.deals
  for each row execute function app.deal_before_write();

create or replace function app.deal_activity() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_stage text;
begin
  select name into v_stage from public.deal_stages where id = new.stage_id;
  if tg_op = 'INSERT' then
    insert into public.lead_activities (organization_id, lead_id, kind, summary, data, actor_id)
    values (new.organization_id, new.lead_id, 'deal', format('Deal opened: %s (%s)', new.title, v_stage), jsonb_build_object('deal_id', new.id), auth.uid());
  elsif new.stage_id is distinct from old.stage_id then
    insert into public.lead_activities (organization_id, lead_id, kind, summary, data, actor_id)
    values (new.organization_id, new.lead_id, 'deal', format('Deal %s moved to %s', new.title, v_stage), jsonb_build_object('deal_id', new.id), auth.uid());
  end if;
  return new;
end $$;

create trigger deal_activity after insert or update of stage_id on public.deals
  for each row execute function app.deal_activity();

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lead_id         uuid,
  deal_id         uuid,
  title           text not null check (length(trim(title)) between 1 and 200),
  notes           text,
  due_at          timestamptz,
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status          text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  assignee_id     uuid references public.users (id) on delete set null,
  completed_at    timestamptz,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete cascade,
  foreign key (organization_id, deal_id) references public.deals (organization_id, id) on delete cascade
);
create index on public.tasks (organization_id, assignee_id, status, due_at);
create index on public.tasks (lead_id);

create or replace function app.task_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_member(new.organization_id, new.assignee_id, 'assignee');
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger task_before_write before insert or update on public.tasks
  for each row execute function app.task_before_write();

create or replace function app.task_activity() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if new.lead_id is not null and new.status = 'done' and old.status <> 'done' then
    insert into public.lead_activities (organization_id, lead_id, kind, summary, data, actor_id)
    values (new.organization_id, new.lead_id, 'task', format('Task done: %s', new.title), jsonb_build_object('task_id', new.id), auth.uid());
  end if;
  return new;
end $$;

create trigger task_activity after update of status on public.tasks
  for each row execute function app.task_activity();

-- ---------------------------------------------------------------------------
-- Appointments (entered by people now; calendar-confirmed bookings arrive in phase 6)
-- ---------------------------------------------------------------------------
create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lead_id         uuid not null,
  deal_id         uuid,
  kind            text not null default 'viewing' check (kind in ('viewing', 'valuation', 'call', 'meeting', 'other')),
  title           text not null check (length(trim(title)) between 1 and 200),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  location        text,
  status          text not null default 'scheduled' check (status in ('scheduled', 'completed', 'no_show', 'cancelled')),
  assigned_to     uuid references public.users (id) on delete set null,
  -- 'manual' = a person entered it; 'calendar' = confirmed by a calendar provider (phase 6).
  source          text not null default 'manual' check (source in ('manual', 'calendar')),
  external_id     text,
  notes           text,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete cascade,
  foreign key (organization_id, deal_id) references public.deals (organization_id, id) on delete set null (deal_id),
  check (ends_at > starts_at and ends_at <= starts_at + interval '24 hours')
);
create index on public.appointments (organization_id, starts_at);
create index on public.appointments (lead_id);
create unique index appointments_external_unique on public.appointments (organization_id, source, external_id) where external_id is not null;

create or replace function app.appointment_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_member(new.organization_id, new.assigned_to, 'appointment owner');
  return new;
end $$;

create trigger appointment_before_write before insert or update of assigned_to on public.appointments
  for each row execute function app.appointment_before_write();

create or replace function app.appointment_effects() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_booked uuid;
  v_lead   record;
begin
  if tg_op = 'INSERT' then
    insert into public.lead_activities (organization_id, lead_id, kind, summary, data, actor_id)
    values (new.organization_id, new.lead_id, 'appointment',
            format('%s booked: %s', initcap(new.kind), to_char(new.starts_at at time zone (select timezone from public.organizations where id = new.organization_id), 'DD Mon YYYY HH24:MI')),
            jsonb_build_object('appointment_id', new.id), auth.uid());
    -- Move early-stage leads forward; never move a lead backwards or out of won/lost/opted-out.
    select id into v_booked from public.pipeline_stages where organization_id = new.organization_id and key = 'appointment_booked';
    select l.stage_id, s.category, s.key, s.position into v_lead
    from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.id = new.lead_id;
    if v_booked is not null and new.status = 'scheduled'
       and (v_lead.category in ('new', 'working') or v_lead.key in ('qualified', 'interested')) then
      update public.leads set stage_id = v_booked where id = new.lead_id;
    end if;
  elsif new.status is distinct from old.status then
    insert into public.lead_activities (organization_id, lead_id, kind, summary, data, actor_id)
    values (new.organization_id, new.lead_id, 'appointment',
            format('%s %s', initcap(new.kind), replace(new.status, '_', '-')), jsonb_build_object('appointment_id', new.id), auth.uid());
  end if;
  return new;
end $$;

create trigger appointment_effects after insert or update of status on public.appointments
  for each row execute function app.appointment_effects();

do $$
declare t text;
begin
  foreach t in array array['deal_stages', 'deals', 'tasks', 'appointments'] loop
    execute format('create trigger touch before update on public.%I for each row execute function app.touch_updated_at()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit_row()', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

grant select, insert, update, delete on public.deal_stages, public.deals, public.tasks, public.appointments to authenticated;
grant all on public.deal_stages, public.deals, public.tasks, public.appointments to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
create or replace function app.reads_all(p_org uuid) returns boolean
language sql stable as $$ select app.has_role(p_org, array['agency_admin', 'campaign_manager', 'read_only']) $$;

create or replace function app.owns_lead(p_lead uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.leads where id = p_lead and owner_id = auth.uid())
$$;

create policy deal_stages_read on public.deal_stages for select to authenticated using (app.is_member(organization_id));
create policy deal_stages_write on public.deal_stages for all to authenticated
  using (app.is_manager(organization_id)) with check (app.is_manager(organization_id));

create policy deals_read on public.deals for select to authenticated
  using (app.reads_all(organization_id)
         or (app.has_role(organization_id, array['sales_rep']) and (owner_id = auth.uid() or app.owns_lead(lead_id))));
create policy deals_write on public.deals for all to authenticated
  using (app.is_manager(organization_id)
         or (app.has_role(organization_id, array['sales_rep']) and app.owns_lead(lead_id)))
  with check (app.is_manager(organization_id)
              or (app.has_role(organization_id, array['sales_rep']) and app.owns_lead(lead_id) and owner_id = auth.uid()));

create policy tasks_read on public.tasks for select to authenticated
  using (app.reads_all(organization_id)
         or (app.has_role(organization_id, array['sales_rep']) and (assignee_id = auth.uid() or (lead_id is not null and app.owns_lead(lead_id)))));
create policy tasks_write on public.tasks for all to authenticated
  using (app.is_manager(organization_id)
         or (app.has_role(organization_id, array['sales_rep']) and (assignee_id = auth.uid() or (lead_id is not null and app.owns_lead(lead_id)))))
  with check (app.is_manager(organization_id)
              or (app.has_role(organization_id, array['sales_rep']) and assignee_id = auth.uid()
                  and (lead_id is null or app.owns_lead(lead_id))));

create policy appointments_read on public.appointments for select to authenticated
  using (app.reads_all(organization_id)
         or (app.has_role(organization_id, array['sales_rep']) and (assigned_to = auth.uid() or app.owns_lead(lead_id))));
create policy appointments_write on public.appointments for all to authenticated
  using (app.is_manager(organization_id)
         or (app.has_role(organization_id, array['sales_rep']) and app.owns_lead(lead_id)))
  with check (app.is_manager(organization_id)
              or (app.has_role(organization_id, array['sales_rep']) and app.owns_lead(lead_id) and assigned_to = auth.uid()));
-- Calendar-confirmed appointments (phase 6) are written by the server only.
create policy appointments_no_fake_calendar on public.appointments as restrictive for all to authenticated
  using (true) with check (source = 'manual' and external_id is null);

-- ---------------------------------------------------------------------------
-- Organization setup also seeds deal stages.
-- ---------------------------------------------------------------------------
create or replace function app.after_org_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.seed_deal_stages(new.id);
  return new;
end $$;

create trigger seed_deal_stages after insert on public.organizations
  for each row execute function app.after_org_created();

-- ---------------------------------------------------------------------------
-- log_interaction: a person records a call, email, message or meeting that happened.
-- Outbound contact updates last_contacted_at and moves a "new" lead to "Contacted".
-- ---------------------------------------------------------------------------
create or replace function public.log_interaction(
  p_org         uuid,
  p_lead        uuid,
  p_kind        text,
  p_direction   text,
  p_outcome     text,
  p_summary     text,
  p_occurred_at timestamptz default now()
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_id        uuid;
  v_contacted uuid;
  v_category  public.stage_category;
begin
  if not app.can_write_lead(p_org, p_lead) then
    raise exception 'Not allowed to log activity on this lead' using errcode = 'insufficient_privilege';
  end if;
  if p_kind not in ('call', 'email', 'sms', 'whatsapp', 'meeting') or p_direction not in ('outbound', 'inbound') then
    raise exception 'Unknown interaction type' using errcode = 'check_violation';
  end if;
  if p_occurred_at > now() + interval '5 minutes' or p_occurred_at < now() - interval '365 days' then
    raise exception 'The time must be within the last year and not in the future' using errcode = 'check_violation';
  end if;
  if coalesce(length(trim(p_summary)), 0) = 0 or length(p_summary) > 5000 or length(coalesce(p_outcome, '')) > 60 then
    raise exception 'Write a short summary (up to 5000 characters)' using errcode = 'check_violation';
  end if;

  insert into public.lead_activities (organization_id, lead_id, kind, summary, data, actor_id, occurred_at)
  values (p_org, p_lead, p_kind::public.activity_kind, trim(p_summary),
          jsonb_build_object('source', 'manual', 'direction', p_direction, 'outcome', nullif(p_outcome, '')),
          auth.uid(), p_occurred_at)
  returning id into v_id;

  if p_direction = 'outbound' or p_kind = 'meeting' then
    update public.leads set last_contacted_at = greatest(coalesce(last_contacted_at, p_occurred_at), p_occurred_at) where id = p_lead;
    select s.category into v_category from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.id = p_lead;
    select id into v_contacted from public.pipeline_stages where organization_id = p_org and key = 'contacted';
    if v_category = 'new' and v_contacted is not null then
      update public.leads set stage_id = v_contacted where id = p_lead;
    end if;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- crm_dashboard: everything the dashboard shows, from stored rows only. security invoker,
-- so a sales rep's dashboard covers only what they can see. Money totals are in the
-- organization's default currency; deals in other currencies are counted separately.
-- ---------------------------------------------------------------------------
create or replace function public.crm_dashboard(p_org uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_tz  text;
  v_cur char(3);
  v_out jsonb;
begin
  select timezone, default_currency into v_tz, v_cur from public.organizations where id = p_org;
  if v_tz is null then
    raise exception 'Organization not found' using errcode = 'no_data_found';
  end if;

  with
  l as (select * from public.leads where organization_id = p_org),
  d as (select d.*, s.category, s.probability, s.name as stage_name, s.position
        from public.deals d join public.deal_stages s on s.id = d.stage_id where d.organization_id = p_org),
  a as (select * from public.appointments where organization_id = p_org),
  i as (select * from public.lead_activities
        where organization_id = p_org and kind in ('call', 'email', 'sms', 'whatsapp', 'meeting')
          and occurred_at >= p_from and occurred_at < p_to),
  days as (select generate_series(date_trunc('day', p_from at time zone v_tz), date_trunc('day', (p_to - interval '1 second') at time zone v_tz), interval '1 day')::date as day),
  cohort as (select id from l where created_at >= p_from and created_at < p_to)
  select jsonb_build_object(
    'currency', v_cur,
    'leads_created', (select count(*) from cohort),
    'leads_series', (select coalesce(jsonb_agg(jsonb_build_object('day', days.day, 'count', coalesce(c.n, 0)) order by days.day), '[]')
                     from days left join (select (created_at at time zone v_tz)::date as day, count(*) n from l
                                          where created_at >= p_from and created_at < p_to group by 1) c on c.day = days.day),
    'contacted_leads', (select count(distinct lead_id) from i where data ->> 'direction' = 'outbound' or kind = 'meeting'),
    'interactions', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind::text, count(*) n from i group by kind) x),
    'cohort_with_appointment', (select count(distinct a.lead_id) from a join cohort c on c.id = a.lead_id where a.status <> 'cancelled'),
    'appointments_booked', (select count(*) from a where created_at >= p_from and created_at < p_to),
    'appointments_held', (select count(*) from a where status = 'completed' and starts_at >= p_from and starts_at < p_to),
    'appointments_no_show', (select count(*) from a where status = 'no_show' and starts_at >= p_from and starts_at < p_to),
    'appointments_upcoming', (select count(*) from a where status = 'scheduled' and starts_at >= now()),
    'open_deals', (select count(*) from d where category = 'open'),
    'pipeline_value', (select coalesce(sum(value_minor), 0) from d where category = 'open' and currency = v_cur),
    'weighted_commission', (select coalesce(sum(commission_minor * probability / 100), 0) from d where category = 'open' and currency = v_cur),
    'open_commission', (select coalesce(sum(commission_minor), 0) from d where category = 'open' and currency = v_cur),
    'won_count', (select count(*) from d where category = 'won' and closed_at >= p_from and closed_at < p_to),
    'won_value', (select coalesce(sum(value_minor), 0) from d where category = 'won' and closed_at >= p_from and closed_at < p_to and currency = v_cur),
    'won_commission', (select coalesce(sum(commission_minor), 0) from d where category = 'won' and closed_at >= p_from and closed_at < p_to and currency = v_cur),
    'lost_count', (select count(*) from d where category = 'lost' and closed_at >= p_from and closed_at < p_to),
    'avg_days_to_close', (select round(avg(extract(epoch from closed_at - created_at) / 86400)::numeric, 1) from d
                          where category = 'won' and closed_at >= p_from and closed_at < p_to),
    'other_currency_deals', (select count(*) from d where currency <> v_cur and (category = 'open' or closed_at >= p_from)),
    'deals_by_stage', (select coalesce(jsonb_agg(jsonb_build_object('stage_id', s.id, 'name', s.name, 'category', s.category,
                                                 'count', coalesce(x.n, 0), 'value', coalesce(x.v, 0)) order by s.position), '[]')
                       from public.deal_stages s
                       left join (select stage_id, count(*) n, sum(value_minor) filter (where currency = v_cur) v from d group by stage_id) x on x.stage_id = s.id
                       where s.organization_id = p_org and s.category = 'open'),
    'tasks_overdue', (select count(*) from public.tasks where organization_id = p_org and status = 'open' and due_at < now()),
    'leaderboard', (select coalesce(jsonb_agg(row_to_json(r) order by r.won_commission desc, r.interactions desc), '[]') from (
                      select m.user_id,
                             coalesce(u.full_name, u.email) as name,
                             (select count(*) from l join public.pipeline_stages s on s.id = l.stage_id
                              where l.owner_id = m.user_id and s.category not in ('won', 'lost', 'opted_out')) as open_leads,
                             (select count(*) from i where i.actor_id = m.user_id) as interactions,
                             (select count(*) from a where a.assigned_to = m.user_id and a.status = 'completed' and a.starts_at >= p_from and a.starts_at < p_to) as appointments_held,
                             (select count(*) from d where d.owner_id = m.user_id and d.category = 'won' and d.closed_at >= p_from and d.closed_at < p_to) as deals_won,
                             (select coalesce(sum(commission_minor), 0) from d where d.owner_id = m.user_id and d.category = 'won' and d.closed_at >= p_from and d.closed_at < p_to and d.currency = v_cur) as won_commission
                      from public.memberships m join public.users u on u.id = m.user_id
                      where m.organization_id = p_org and m.role in ('agency_admin', 'campaign_manager', 'sales_rep')) r)
  ) into v_out;
  return v_out;
end $$;

-- Lock down: these follow the same rules as the earlier migrations.
revoke execute on all functions in schema public from anon, public;
revoke execute on all functions in schema app from anon, public;
grant execute on all functions in schema app to authenticated, service_role;
grant execute on function
  public.log_interaction(uuid, uuid, text, text, text, text, timestamptz),
  public.crm_dashboard(uuid, timestamptz, timestamptz)
to authenticated;
revoke all on public.deal_stages, public.deals, public.tasks, public.appointments from anon;
