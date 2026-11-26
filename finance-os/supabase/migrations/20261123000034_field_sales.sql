-- Field Sales: plan, navigate and log in-person sales visits. Additive only.
-- Leads stay in public.contacts (extended here); visits, route plans and delivery handoffs are new tables.
-- Google Maps Platform terms: only what a person enters is stored, plus place_id and coordinates for their own leads.

-- 1. Leads: field-sales columns on the existing contacts table. field_status is null for leads that are not field leads.
alter table public.contacts
  add column field_status text check (field_status in ('to_visit', 'owner_absent', 'demo_shown', 'interested', 'advance_paid', 'delivered', 'final_paid', 'lost')),
  add column field_segment text check (field_segment in ('car_detailing', 'used_car_dealer', 'garage', 'other')),
  add column whatsapp_e164 text check (whatsapp_e164 is null or whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  add column address text check (address is null or length(address) <= 500),
  add column area text check (area is null or length(area) <= 120),
  add column lat numeric(9, 6) check (lat between -90 and 90),
  add column lng numeric(9, 6) check (lng between -180 and 180),
  add column place_id text check (place_id is null or length(place_id) <= 300),
  add column next_follow_up_on date,
  add column owner_back_at timestamptz,
  add column notes text check (notes is null or length(notes) <= 4000),
  add column lost_reason text check (lost_reason is null or length(lost_reason) <= 300),
  add column field_updated_at timestamptz;
alter table public.contacts add constraint contacts_lat_lng_together check ((lat is null) = (lng is null));
create index contacts_field_status_idx on public.contacts (organization_id, field_status) where field_status is not null;
create index contacts_field_follow_up_idx on public.contacts (organization_id, next_follow_up_on) where field_status is not null;
create index contacts_org_phone_idx on public.contacts (organization_id, phone_e164) where phone_e164 is not null;

-- Field status drives the existing lead status, so the pipeline automations keep working:
-- Interested -> qualified (deal), Advance paid and later -> customer (client), Lost -> disqualified. Never moves a customer back.
create or replace function app.field_status_sync() returns trigger
language plpgsql as $$
begin
  if new.field_status is not distinct from old.field_status then return new; end if;
  new.field_updated_at := now();
  if new.field_status is null then return new; end if;
  if new.field_status in ('advance_paid', 'delivered', 'final_paid') then new.lead_status := 'customer';
  elsif old.lead_status = 'customer' then null;
  elsif new.field_status = 'lost' then new.lead_status := 'disqualified';
  elsif new.field_status = 'interested' then new.lead_status := 'qualified';
  elsif new.field_status in ('owner_absent', 'demo_shown') and new.lead_status in ('new', 'disqualified') then new.lead_status := 'contacted';
  end if;
  if new.field_status <> 'lost' then new.lost_reason := null; end if;
  return new;
end $$;
create trigger contacts_field_status_sync before update of field_status on public.contacts
  for each row execute function app.field_status_sync();

-- 2. Visits.
create table public.field_visits (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  contact_id       uuid not null,
  visited_at       timestamptz not null default now(),
  outcome          text not null check (outcome in ('owner_absent', 'demo_shown', 'interested', 'paid_advance', 'not_interested')),
  owner_back_at    timestamptz,
  amount_minor     bigint check (amount_minor is null or amount_minor >= 0),
  note             text check (note is null or length(note) <= 2000),
  lat              numeric(9, 6) check (lat between -90 and 90),
  lng              numeric(9, 6) check (lng between -180 and 180),
  accuracy_m       numeric(8, 1) check (accuracy_m is null or accuracy_m >= 0),
  created_by       uuid default auth.uid() references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade,
  check ((lat is null) = (lng is null))
);
create index on public.field_visits (organization_id, visited_at desc);
create index on public.field_visits (contact_id, visited_at desc);
alter table public.field_visits enable row level security;
create policy field_visits_read on public.field_visits for select to authenticated using (
  app.has_permission(organization_id, 'crm.read_all') or created_by = auth.uid()
  or exists (select 1 from public.contacts c where c.id = contact_id and c.owner_id = auth.uid()));
create policy field_visits_insert on public.field_visits for insert to authenticated with check (
  app.has_permission(organization_id, 'crm.write') and created_by = auth.uid()
  and exists (select 1 from public.contacts c where c.id = contact_id and c.organization_id = organization_id));
create policy field_visits_manage on public.field_visits for delete to authenticated using (app.has_permission(organization_id, 'crm.manage'));
grant select, insert, delete on public.field_visits to authenticated;
grant all on public.field_visits to service_role;

-- Every visit moves the lead: status (never backwards, except Not interested), next follow-up and owner-back time.
create or replace function app.field_visit_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rank constant text[] := array['to_visit', 'owner_absent', 'demo_shown', 'interested', 'advance_paid', 'delivered', 'final_paid'];
  cur text; target text; today date := (new.visited_at at time zone 'Asia/Kolkata')::date; follow date;
begin
  select field_status into cur from public.contacts where id = new.contact_id;
  target := case new.outcome when 'owner_absent' then 'owner_absent' when 'demo_shown' then 'demo_shown' when 'interested' then 'interested'
                             when 'paid_advance' then 'advance_paid' else 'lost' end;
  follow := case new.outcome
    when 'owner_absent' then coalesce((new.owner_back_at at time zone 'Asia/Kolkata')::date, today + 1)
    when 'demo_shown' then today + 2 when 'interested' then today + 1 when 'paid_advance' then today + 7 else null end;
  if target <> 'lost' and cur is not null and cur <> 'lost' and array_position(rank, cur) > array_position(rank, target) then
    target := cur; -- a later visit never moves a lead backwards
  end if;
  update public.contacts set
    field_status = target,
    next_follow_up_on = follow,
    owner_back_at = case when new.outcome = 'owner_absent' then new.owner_back_at else null end,
    lost_reason = case when target = 'lost' then left(coalesce(nullif(trim(new.note), ''), 'Not interested'), 300) else null end
  where id = new.contact_id;
  return new;
end $$;
create trigger field_visits_apply after insert on public.field_visits for each row execute function app.field_visit_apply();

-- 3. Today's route: up to 9 leads per person per day.
create table public.field_route_plans (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null default auth.uid() references public.users (id) on delete cascade,
  plan_date        date not null,
  contact_ids      uuid[] not null default '{}' check (cardinality(contact_ids) <= 9),
  updated_at       timestamptz not null default now(),
  unique (organization_id, user_id, plan_date)
);
alter table public.field_route_plans enable row level security;
create policy field_route_plans_own on public.field_route_plans for all to authenticated
  using (user_id = auth.uid() and app.has_permission(organization_id, 'company.view'))
  with check (user_id = auth.uid() and app.has_permission(organization_id, 'crm.write'));
grant select, insert, update, delete on public.field_route_plans to authenticated;
grant all on public.field_route_plans to service_role;

-- 4. Delivery handoff: who builds it and how fast.
create table public.field_sales_settings (
  organization_id       uuid primary key references public.organizations (id) on delete cascade,
  delivery_assignee_id  uuid references public.users (id) on delete set null,
  handoff_days          smallint not null default 7 check (handoff_days between 1 and 60),
  updated_at            timestamptz not null default now()
);
alter table public.field_sales_settings enable row level security;
create policy field_sales_settings_read on public.field_sales_settings for select to authenticated using (app.has_permission(organization_id, 'company.view'));
create policy field_sales_settings_write on public.field_sales_settings for all to authenticated
  using (app.has_permission(organization_id, 'company.settings')) with check (app.has_permission(organization_id, 'company.settings'));
grant select, insert, update on public.field_sales_settings to authenticated;
grant all on public.field_sales_settings to service_role;

create table public.delivery_handoffs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  contact_id       uuid not null,
  task_id          uuid references public.tasks (id) on delete set null,
  status           text not null default 'awaiting_details' check (status in ('awaiting_details', 'ready', 'in_progress', 'done')),
  due_on           date not null,
  services         text check (services is null or length(services) <= 2000),
  brand_colours    text check (brand_colours is null or length(brand_colours) <= 300),
  contact_name     text check (contact_name is null or length(contact_name) <= 200),
  contact_phone    text check (contact_phone is null or length(contact_phone) <= 40),
  contact_email    text check (contact_email is null or length(contact_email) <= 200),
  logo_path        text check (logo_path is null or length(logo_path) <= 400),
  photo_paths      text[] not null default '{}' check (cardinality(photo_paths) <= 12),
  notes            text check (notes is null or length(notes) <= 4000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (contact_id),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade
);
alter table public.delivery_handoffs enable row level security;
create policy delivery_handoffs_read on public.delivery_handoffs for select to authenticated using (app.has_permission(organization_id, 'company.view'));
create policy delivery_handoffs_write on public.delivery_handoffs for update to authenticated
  using (app.has_permission(organization_id, 'crm.write') or app.has_permission(organization_id, 'tasks.write'))
  with check (app.has_permission(organization_id, 'crm.write') or app.has_permission(organization_id, 'tasks.write'));
grant select, update on public.delivery_handoffs to authenticated;
grant all on public.delivery_handoffs to service_role;

-- Team notification kind for handoffs.
alter table public.activity_feed drop constraint if exists activity_feed_kind_check;
alter table public.activity_feed add constraint activity_feed_kind_check check (kind in ('deal_created', 'deal_won', 'proposal_sent', 'proposal_accepted',
  'meeting_booked', 'task_done', 'positive_reply', 'payment_received', 'member_joined', 'kudos', 'delivery_handoff'));

-- Advance paid -> a delivery task (due in 7 days by default), a handoff record for the brand details, and a team notification.
-- Runs once per lead; failures never block the status change.
create or replace function app.field_handoff() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.field_sales_settings; v_task uuid; v_due date; v_name text;
begin
  if new.field_status is distinct from 'advance_paid' or old.field_status is not distinct from 'advance_paid' then return new; end if;
  if exists (select 1 from public.delivery_handoffs where contact_id = new.id) then return new; end if;
  begin
    select * into s from public.field_sales_settings where organization_id = new.organization_id;
    v_due := (now() at time zone 'Asia/Kolkata')::date + coalesce(s.handoff_days, 7);
    v_name := coalesce(nullif(trim(new.company_name), ''), new.full_name);
    insert into public.tasks (organization_id, title, details, due_on, assignee_id, priority, deal_id, created_by)
    values (new.organization_id, left('Deliver: ' || v_name, 200),
            left(concat_ws(E'\n', 'Advance paid. Build and deliver within ' || coalesce(s.handoff_days, 7) || ' days.',
              'Contact: ' || new.full_name || coalesce(' · ' || new.phone_e164, ''), 'Brand details and uploads: Field sales -> Handoffs.'), 2000),
            v_due, app.member_or_null(new.organization_id, s.delivery_assignee_id), 'high', new.auto_deal_id, null)
    returning id into v_task;
    insert into public.delivery_handoffs (organization_id, contact_id, task_id, due_on, contact_name, contact_phone)
    values (new.organization_id, new.id, v_task, v_due, new.full_name, coalesce(new.whatsapp_e164, new.phone_e164));
    perform app.log_activity(new.organization_id, auth.uid(), 'delivery_handoff', 'team',
      'Advance paid: ' || v_name || '. Delivery task created, due ' || to_char(v_due, 'DD Mon'), null);
  exception when others then raise warning 'delivery handoff skipped: %', sqlerrm;
  end;
  return new;
end $$;
create trigger contacts_field_handoff after update of field_status on public.contacts
  for each row execute function app.field_handoff();

-- Private bucket for handoff uploads (logo, photos). Path: <organization id>/<handoff id>/<file>.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('handoffs', 'handoffs', false, 4194304, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do nothing;
    execute $p$create policy handoffs_object_read on storage.objects for select to authenticated
      using (bucket_id = 'handoffs' and app.has_permission(((storage.foldername(name))[1])::uuid, 'company.view'))$p$;
    execute $p$create policy handoffs_object_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'handoffs' and (app.has_permission(((storage.foldername(name))[1])::uuid, 'crm.write')
        or app.has_permission(((storage.foldername(name))[1])::uuid, 'tasks.write')))$p$;
    execute $p$create policy handoffs_object_delete on storage.objects for delete to authenticated
      using (bucket_id = 'handoffs' and (app.has_permission(((storage.foldername(name))[1])::uuid, 'crm.write')
        or app.has_permission(((storage.foldername(name))[1])::uuid, 'tasks.write')))$p$;
  end if;
end $$;

-- Audit trail like the rest of the app.
do $$
declare t text;
begin
  foreach t in array array['field_visits', 'delivery_handoffs', 'field_sales_settings'] loop
    if exists (select 1 from pg_proc where proname = 'audit_row' and pronamespace = 'app'::regnamespace) then
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()', t || '_audit', t);
    end if;
  end loop;
  foreach t in array array['delivery_handoffs', 'field_sales_settings', 'field_route_plans'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- Functions are for triggers only.
revoke execute on all functions in schema app from public, anon;
