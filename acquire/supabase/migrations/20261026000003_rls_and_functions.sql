-- Acquire: row level security and server-side functions
--
-- Access model (a user reaches tenant data only through a membership row):
--   agency_admin       everything in the organization, incl. team, settings, erasure, audit log
--   campaign_manager   all leads, sources, stages, imports; assigns leads
--   sales_rep          leads assigned to them (create, update, notes, consent, opt-outs)
--   read_only          reads leads and reports; writes nothing
-- Platform admins get no tenant data through RLS; see admin_* functions below.
-- The service role (signed webhooks/jobs only) bypasses RLS.

grant usage on schema app to authenticated, service_role;

create or replace function app.member_role(p_org uuid) returns text
language sql stable security definer set search_path = public, auth as $$
  select m.role from public.memberships m
  where m.organization_id = p_org and m.user_id = auth.uid()
$$;

create or replace function app.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select app.member_role(p_org) is not null
$$;

create or replace function app.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce(app.member_role(p_org) = any (p_roles), false)
$$;

create or replace function app.is_manager(p_org uuid) returns boolean
language sql stable as $$ select app.has_role(p_org, array['agency_admin', 'campaign_manager']) $$;

create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- Can the caller see this lead? Managers and read-only see all; reps see their own.
create or replace function app.can_read_lead(p_org uuid, p_lead uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select app.has_role(p_org, array['agency_admin', 'campaign_manager', 'read_only'])
      or (app.has_role(p_org, array['sales_rep'])
          and exists (select 1 from public.leads l where l.id = p_lead and l.organization_id = p_org and l.owner_id = auth.uid()))
$$;

-- Can the caller change this lead's records (notes, consent, opt-outs)?
create or replace function app.can_write_lead(p_org uuid, p_lead uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select app.is_manager(p_org)
      or (app.has_role(p_org, array['sales_rep'])
          and exists (select 1 from public.leads l where l.id = p_lead and l.organization_id = p_org and l.owner_id = auth.uid()))
$$;

grant execute on all functions in schema app to authenticated, service_role;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'markets', 'organizations', 'roles', 'users', 'memberships', 'platform_admins', 'organization_settings',
    'plans', 'subscriptions', 'usage_records', 'audit_logs', 'pipeline_stages', 'lead_sources', 'leads',
    'lead_activities', 'consent_records', 'suppression_entries', 'lead_imports', 'saved_views'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Reference data
create policy markets_read on public.markets for select to authenticated using (true);
create policy roles_read on public.roles for select to authenticated using (true);
create policy plans_read on public.plans for select to authenticated using (true);

-- Organizations: created only through create_organization(); admins edit.
create policy org_read on public.organizations for select to authenticated using (app.is_member(id));
create policy org_update on public.organizations for update to authenticated
  using (app.has_role(id, array['agency_admin'])) with check (app.has_role(id, array['agency_admin']));

create policy users_read on public.users for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and theirs.user_id = public.users.id));
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy memberships_read on public.memberships for select to authenticated using (app.is_member(organization_id));
create policy memberships_admin_write on public.memberships for all to authenticated
  using (app.has_role(organization_id, array['agency_admin']))
  with check (app.has_role(organization_id, array['agency_admin']));

create policy platform_admins_self on public.platform_admins for select to authenticated using (user_id = auth.uid());

create policy settings_read on public.organization_settings for select to authenticated using (app.is_member(organization_id));
create policy settings_write on public.organization_settings for update to authenticated
  using (app.has_role(organization_id, array['agency_admin'])) with check (app.has_role(organization_id, array['agency_admin']));

-- Billing state is written by the billing webhook (service role) only.
create policy subscriptions_read on public.subscriptions for select to authenticated using (app.is_member(organization_id));
create policy usage_read on public.usage_records for select to authenticated using (app.is_member(organization_id));

create policy audit_read on public.audit_logs for select to authenticated
  using (app.has_role(organization_id, array['agency_admin']));

-- Configuration: all members read; managers write; stages are deleted only if unused (FK) and not system.
create policy stages_read on public.pipeline_stages for select to authenticated using (app.is_member(organization_id));
create policy stages_insert on public.pipeline_stages for insert to authenticated
  with check (app.is_manager(organization_id) and not is_system);
create policy stages_update on public.pipeline_stages for update to authenticated
  using (app.is_manager(organization_id)) with check (app.is_manager(organization_id));
create policy stages_delete on public.pipeline_stages for delete to authenticated
  using (app.is_manager(organization_id) and not is_system);

create policy sources_read on public.lead_sources for select to authenticated using (app.is_member(organization_id));
create policy sources_write on public.lead_sources for all to authenticated
  using (app.is_manager(organization_id)) with check (app.is_manager(organization_id));

-- Leads. No delete policy: removal goes through erase_lead(), which also redacts the audit log.
create policy leads_read on public.leads for select to authenticated
  using (app.has_role(organization_id, array['agency_admin', 'campaign_manager', 'read_only'])
         or (app.has_role(organization_id, array['sales_rep']) and owner_id = auth.uid()));
create policy leads_insert on public.leads for insert to authenticated
  with check (app.is_manager(organization_id)
              or (app.has_role(organization_id, array['sales_rep']) and owner_id = auth.uid()));
create policy leads_update on public.leads for update to authenticated
  using (app.is_manager(organization_id)
         or (app.has_role(organization_id, array['sales_rep']) and owner_id = auth.uid()))
  with check (app.is_manager(organization_id)
              or (app.has_role(organization_id, array['sales_rep']) and owner_id = auth.uid()));

create policy activities_read on public.lead_activities for select to authenticated
  using (app.can_read_lead(organization_id, lead_id));
-- People may add notes; every other kind is written by triggers or the server.
create policy activities_note on public.lead_activities for insert to authenticated
  with check (kind = 'note' and actor_id = auth.uid() and app.can_write_lead(organization_id, lead_id));

create policy consent_read on public.consent_records for select to authenticated
  using (app.can_read_lead(organization_id, lead_id));
create policy consent_insert on public.consent_records for insert to authenticated
  with check (recorded_by = auth.uid() and app.can_write_lead(organization_id, lead_id));

-- Any writer may record an opt-out (a rep must be able to honour "stop calling me").
-- Only an admin may lift a suppression.
create policy suppression_read on public.suppression_entries for select to authenticated
  using (app.is_member(organization_id));
create policy suppression_insert on public.suppression_entries for insert to authenticated
  with check (created_by = auth.uid()
              and (app.is_manager(organization_id)
                   or (app.has_role(organization_id, array['sales_rep']) and lead_id is not null
                       and app.can_write_lead(organization_id, lead_id))));
create policy suppression_delete on public.suppression_entries for delete to authenticated
  using (app.has_role(organization_id, array['agency_admin']));

create policy imports_read on public.lead_imports for select to authenticated using (app.is_manager(organization_id));
-- Written by import_leads(), which runs as the caller.
create policy imports_insert on public.lead_imports for insert to authenticated
  with check (app.is_manager(organization_id) and created_by = auth.uid());
create policy imports_update on public.lead_imports for update to authenticated
  using (app.is_manager(organization_id) and created_by = auth.uid())
  with check (app.is_manager(organization_id) and created_by = auth.uid());

create policy views_read on public.saved_views for select to authenticated
  using (app.is_member(organization_id) and (user_id = auth.uid() or is_shared));
create policy views_write on public.saved_views for all to authenticated
  using (user_id = auth.uid() and app.is_member(organization_id))
  with check (user_id = auth.uid() and app.is_member(organization_id)
              and (not is_shared or app.is_manager(organization_id)));

-- System activity written on behalf of a caller who may change the lead. Server code uses
-- this for calls, messages and imports; users cannot insert these kinds directly.
create or replace function app.log_activity(p_org uuid, p_lead uuid, p_kind public.activity_kind, p_summary text, p_data jsonb default '{}')
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not app.can_write_lead(p_org, p_lead) then
    raise exception 'Not allowed to log activity on this lead' using errcode = 'insufficient_privilege';
  end if;
  insert into public.lead_activities (organization_id, lead_id, kind, summary, data, actor_id)
  values (p_org, p_lead, p_kind, p_summary, coalesce(p_data, '{}'), auth.uid());
end $$;
grant execute on function app.log_activity(uuid, uuid, public.activity_kind, text, jsonb) to authenticated, service_role;

-- Unsuppression leaves a timeline entry.
create or replace function app.on_unsuppression() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.lead_activities (organization_id, lead_id, kind, summary, actor_id)
  select old.organization_id, l.id, 'unsuppressed',
         format('Suppression lifted for %s (%s)', old.value_type, coalesce(old.channel::text, 'all channels')), auth.uid()
  from public.leads l
  where l.organization_id = old.organization_id
    and ((old.value_type = 'email' and l.email_normalized = old.value) or (old.value_type = 'phone' and l.phone_e164 = old.value));
  return old;
end $$;

create trigger suppression_lifted after delete on public.suppression_entries
  for each row execute function app.on_unsuppression();

-- ---------------------------------------------------------------------------
-- Views (security_invoker: callers see only rows RLS allows)
-- ---------------------------------------------------------------------------
create view public.lead_consent_latest with (security_invoker = true) as
select distinct on (lead_id, channel)
  lead_id, organization_id, channel, status, basis, source, captured_at, expires_at
from public.consent_records
order by lead_id, channel, captured_at desc, created_at desc;

-- ---------------------------------------------------------------------------
-- create_organization: the only way to create a tenant. The caller becomes agency_admin.
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text, p_market char(2), p_timezone text default null, p_is_demo boolean default false
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_market public.markets;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;
  select * into v_market from public.markets where code = upper(p_market);
  if not found then
    raise exception 'Unsupported market %', p_market using errcode = 'check_violation';
  end if;
  if p_timezone is not null and not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown time zone %', p_timezone using errcode = 'check_violation';
  end if;
  insert into public.users (id, email)
  select u.id, u.email from auth.users u where u.id = v_uid
  on conflict (id) do nothing;

  insert into public.organizations (name, primary_market, timezone, default_currency, is_demo)
  values (trim(p_name), v_market.code, coalesce(p_timezone, v_market.default_timezone), v_market.default_currency, p_is_demo)
  returning id into v_org;
  insert into public.memberships (organization_id, user_id, role) values (v_org, v_uid, 'agency_admin');
  insert into public.organization_settings (organization_id) values (v_org);
  insert into public.subscriptions (organization_id, plan_key, status, current_period_end)
  values (v_org, 'trial', 'trialing', now() + interval '14 days');
  perform app.seed_pipeline_stages(v_org);
  insert into public.lead_sources (organization_id, name, kind) values
    (v_org, 'Manual entry', 'manual'),
    (v_org, 'CSV import', 'csv_import');
  return v_org;
end $$;

-- ---------------------------------------------------------------------------
-- add_member: an admin adds an existing user (by id) to the organization, within seat limits.
-- The app invites unknown emails through Supabase Auth first, then calls this.
-- ---------------------------------------------------------------------------
create or replace function public.add_member(p_org uuid, p_user uuid, p_role text) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_seats integer;
  v_max integer;
begin
  if not app.has_role(p_org, array['agency_admin']) then
    raise exception 'Only an agency admin can add members' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into v_seats from public.memberships where organization_id = p_org;
  select p.max_seats into v_max from public.subscriptions s join public.plans p on p.key = s.plan_key where s.organization_id = p_org;
  if v_seats >= coalesce(v_max, 0) then
    raise exception 'Seat limit reached (% of %). Upgrade the plan to add more people.', v_seats, coalesce(v_max, 0)
      using errcode = 'check_violation';
  end if;
  insert into public.memberships (organization_id, user_id, role) values (p_org, p_user, p_role)
  on conflict (organization_id, user_id) do update set role = excluded.role;
end $$;

-- Keep at least one agency_admin in every organization.
create or replace function app.keep_an_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org uuid := coalesce(old.organization_id, new.organization_id);
begin
  if exists (select 1 from public.organizations where id = v_org)
     and not exists (select 1 from public.memberships where organization_id = v_org and role = 'agency_admin') then
    raise exception 'An organization must keep at least one agency admin' using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger keep_an_admin after update or delete on public.memberships
  deferrable initially immediate
  for each row execute function app.keep_an_admin();

-- ---------------------------------------------------------------------------
-- import_leads: idempotent bulk import. Runs as the caller, so RLS applies.
--
-- p_rows: array of objects already validated and normalized by the app:
--   row_number, full_name, email, phone_e164, country, timezone, segment, property_interest,
--   property_type, preferred_location, budget_min_minor, budget_max_minor, currency, timeline,
--   tags (array), notes, custom_fields (object), consent (array of {channel, basis, source})
-- Matching: normalized email first, then phone. Suppressed values are imported (so the
-- history is kept) but flagged, and no consent from the file overrides a suppression.
-- ---------------------------------------------------------------------------
create or replace function public.import_leads(
  p_org          uuid,
  p_rows         jsonb,
  p_source       uuid,
  p_on_duplicate text default 'skip',
  p_file_name    text default null,
  p_file_sha256  text default null,
  p_owner        uuid default null
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_import    uuid;
  v_stage     uuid;
  v_row       jsonb;
  v_existing  uuid;
  v_id        uuid;
  v_email     text;
  v_phone     text;
  v_suppressed boolean;
  v_results   jsonb := '[]'::jsonb;
  v_created   integer := 0;
  v_updated   integer := 0;
  v_skipped   integer := 0;
  v_supp      integer := 0;
  v_consent   jsonb;
begin
  if not app.is_manager(p_org) then
    raise exception 'Your role is not allowed to import leads' using errcode = 'insufficient_privilege';
  end if;
  if p_on_duplicate not in ('skip', 'update') then
    raise exception 'on_duplicate must be skip or update' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 10000 then
    raise exception 'Rows must be an array of at most 10000 items' using errcode = 'check_violation';
  end if;
  select id into v_stage from public.pipeline_stages where organization_id = p_org and key = 'new';

  insert into public.lead_imports (organization_id, source_id, file_name, file_sha256, on_duplicate, total_rows, created_by)
  values (p_org, p_source, p_file_name, p_file_sha256, p_on_duplicate, jsonb_array_length(p_rows), auth.uid())
  returning id into v_import;
  perform set_config('app.import_id', v_import::text, true);

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_email := nullif(lower(trim(v_row ->> 'email')), '');
    v_phone := nullif(v_row ->> 'phone_e164', '');
    select id into v_existing from public.leads
      where organization_id = p_org
        and ((v_email is not null and email_normalized = v_email) or (v_phone is not null and phone_e164 = v_phone))
      order by (email_normalized = v_email) desc nulls last
      limit 1;
    v_suppressed := exists (
      select 1 from public.suppression_entries s
      where s.organization_id = p_org and s.channel is null
        and ((s.value_type = 'email' and s.value = v_email) or (s.value_type = 'phone' and s.value = v_phone)));

    if v_existing is not null and p_on_duplicate = 'skip' then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object('row', v_row -> 'row_number', 'outcome', 'duplicate_skipped', 'lead_id', v_existing);
      continue;
    end if;

    begin
      if v_existing is not null then
        update public.leads set
          full_name          = coalesce(nullif(v_row ->> 'full_name', ''), full_name),
          email              = coalesce(v_email, email),
          phone_e164         = coalesce(v_phone, phone_e164),
          country            = coalesce(v_row ->> 'country', country),
          timezone           = coalesce(v_row ->> 'timezone', timezone),
          segment            = coalesce((v_row ->> 'segment')::public.lead_segment, segment),
          property_interest  = coalesce(v_row ->> 'property_interest', property_interest),
          property_type      = coalesce(v_row ->> 'property_type', property_type),
          preferred_location = coalesce(v_row ->> 'preferred_location', preferred_location),
          budget_min_minor   = coalesce((v_row ->> 'budget_min_minor')::bigint, budget_min_minor),
          budget_max_minor   = coalesce((v_row ->> 'budget_max_minor')::bigint, budget_max_minor),
          currency           = coalesce(v_row ->> 'currency', currency),
          timeline           = case when v_row ->> 'timeline' is null or v_row ->> 'timeline' = 'unknown' then timeline
                                    else (v_row ->> 'timeline')::public.lead_timeline end,
          tags               = (select coalesce(array_agg(distinct t), '{}') from unnest(tags || coalesce(array(select jsonb_array_elements_text(v_row -> 'tags')), '{}')) t),
          custom_fields      = custom_fields || coalesce(v_row -> 'custom_fields', '{}'::jsonb)
        where id = v_existing
        returning id into v_id;
        if v_id is null then
          raise exception 'not allowed to update this lead';
        end if;
        perform app.log_activity(p_org, v_id, 'imported', 'Updated from a file', jsonb_build_object('import_id', v_import, 'file', p_file_name));
        v_updated := v_updated + 1;
      else
        insert into public.leads (
          organization_id, full_name, email, phone_e164, country, timezone, segment, property_interest,
          property_type, preferred_location, budget_min_minor, budget_max_minor, currency, timeline,
          stage_id, owner_id, source_id, tags, custom_fields, notes, created_by)
        values (
          p_org, v_row ->> 'full_name', v_email, v_phone, v_row ->> 'country', v_row ->> 'timezone',
          coalesce((v_row ->> 'segment')::public.lead_segment, 'buyer'), v_row ->> 'property_interest',
          v_row ->> 'property_type', v_row ->> 'preferred_location', (v_row ->> 'budget_min_minor')::bigint,
          (v_row ->> 'budget_max_minor')::bigint, v_row ->> 'currency',
          coalesce((v_row ->> 'timeline')::public.lead_timeline, 'unknown'),
          v_stage, p_owner, p_source,
          coalesce(array(select jsonb_array_elements_text(v_row -> 'tags')), '{}'),
          coalesce(v_row -> 'custom_fields', '{}'::jsonb), v_row ->> 'notes', auth.uid())
        returning id into v_id;
        v_created := v_created + 1;
      end if;
    exception
      when unique_violation or check_violation or invalid_text_representation then
        v_skipped := v_skipped + 1;
        v_results := v_results || jsonb_build_object('row', v_row -> 'row_number', 'outcome', 'error', 'message', sqlerrm);
        continue;
    end;

    -- Consent captured in the file, unless the person is suppressed.
    if not v_suppressed then
      for v_consent in select * from jsonb_array_elements(coalesce(v_row -> 'consent', '[]'::jsonb)) loop
        insert into public.consent_records (organization_id, lead_id, channel, status, basis, source, captured_at, recorded_by)
        values (p_org, v_id, (v_consent ->> 'channel')::public.contact_channel, 'granted',
                (v_consent ->> 'basis')::public.consent_basis,
                left(format('%s (imported from %s)', v_consent ->> 'source', coalesce(p_file_name, 'file')), 500),
                coalesce((v_consent ->> 'captured_at')::timestamptz, now()), auth.uid());
      end loop;
    else
      v_supp := v_supp + 1;
    end if;

    v_results := v_results || jsonb_build_object(
      'row', v_row -> 'row_number',
      'outcome', case when v_existing is null then 'created' else 'updated' end,
      'lead_id', v_id, 'suppressed', v_suppressed);
  end loop;

  -- The per-statement limit trigger is skipped during an import; check once here instead.
  -- Raising rolls back the whole import.
  perform app.check_contact_limit(p_org);

  update public.lead_imports set created_count = v_created, updated_count = v_updated, skipped_count = v_skipped,
    suppressed_count = v_supp, results = v_results
  where id = v_import;
  perform set_config('app.import_id', '', true);

  return jsonb_build_object('import_id', v_import, 'created', v_created, 'updated', v_updated,
                            'skipped', v_skipped, 'suppressed', v_supp, 'results', v_results);
end $$;

-- ---------------------------------------------------------------------------
-- erase_lead: right-to-erasure. Deletes the lead and its activity and consent history,
-- redacts the audit trail, and (by default) keeps a suppression entry so the person is
-- not re-contacted after a future import. Agency admins only.
-- ---------------------------------------------------------------------------
create or replace function public.erase_lead(p_org uuid, p_lead uuid, p_keep_suppression boolean default true)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_lead public.leads;
begin
  if not app.has_role(p_org, array['agency_admin']) then
    raise exception 'Only an agency admin can erase a lead' using errcode = 'insufficient_privilege';
  end if;
  select * into v_lead from public.leads where id = p_lead and organization_id = p_org;
  if not found then
    raise exception 'Lead not found' using errcode = 'no_data_found';
  end if;

  if p_keep_suppression then
    if v_lead.email_normalized is not null then
      insert into public.suppression_entries (organization_id, value_type, value, reason, source, created_by)
      values (p_org, 'email', v_lead.email_normalized, 'erasure', 'Erasure request', auth.uid())
      on conflict do nothing;
    end if;
    if v_lead.phone_e164 is not null then
      insert into public.suppression_entries (organization_id, value_type, value, reason, source, created_by)
      values (p_org, 'phone', v_lead.phone_e164, 'erasure', 'Erasure request', auth.uid())
      on conflict do nothing;
    end if;
  end if;

  perform set_config('app.erasing', 'on', true);
  delete from public.leads where id = p_lead;
  perform set_config('app.erasing', '', true);
  update public.suppression_entries set lead_id = null where organization_id = p_org and lead_id = p_lead;

  -- Redact personal data from the audit trail for the lead and its children.
  update public.audit_logs set old_data = null, new_data = null
  where organization_id = p_org
    and (record_id = p_lead or (table_name = 'consent_records' and (coalesce(old_data, new_data) ->> 'lead_id')::uuid = p_lead));
  insert into public.audit_logs (organization_id, actor_id, table_name, record_id, action)
  values (p_org, auth.uid(), 'leads', p_lead, 'ERASE');
end $$;

-- ---------------------------------------------------------------------------
-- lead_metrics: dashboard figures, computed from stored data only. security invoker,
-- so a sales rep's dashboard counts only their own leads.
-- ---------------------------------------------------------------------------
create or replace function public.lead_metrics(p_org uuid, p_from timestamptz, p_to timestamptz, p_today_start timestamptz)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with l as (
    select l.*, s.category, s.key as stage_key from public.leads l
    join public.pipeline_stages s on s.id = l.stage_id
    where l.organization_id = p_org
  )
  select jsonb_build_object(
    'total',            (select count(*) from l),
    'new_today',        (select count(*) from l where created_at >= p_today_start),
    'created_in_range', (select count(*) from l where created_at >= p_from and created_at < p_to),
    'contacted',        (select count(*) from l where last_contacted_at is not null),
    'qualified',        (select count(*) from l where category in ('qualified', 'won')),
    'interested',       (select count(*) from l where stage_key in ('interested', 'appointment_booked', 'converted')),
    'appointment_booked', (select count(*) from l where stage_key = 'appointment_booked'),
    'converted',        (select count(*) from l where category = 'won'),
    'opted_out',        (select count(*) from l where category = 'opted_out'),
    'unassigned',       (select count(*) from l where owner_id is null and category not in ('won', 'lost', 'opted_out')),
    'follow_ups_due',   (select count(*) from l where next_follow_up_at < now() and category not in ('won', 'lost', 'opted_out')),
    'by_stage', coalesce((
      select jsonb_agg(jsonb_build_object('stage_id', s.id, 'name', s.name, 'category', s.category, 'count', coalesce(c.n, 0)) order by s.position)
      from public.pipeline_stages s
      left join (select stage_id, count(*) n from l group by stage_id) c on c.stage_id = s.id
      where s.organization_id = p_org), '[]'::jsonb),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object('source_id', x.source_id, 'name', x.name, 'count', x.n,
                                          'qualified', x.q) order by x.n desc)
      from (select l.source_id, coalesce(src.name, 'No source') as name, count(*) n,
                   count(*) filter (where l.category in ('qualified', 'won')) q
            from l left join public.lead_sources src on src.id = l.source_id
            where l.created_at >= p_from and l.created_at < p_to
            group by l.source_id, src.name) x), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------
-- Platform admin console. These return organization-level facts only, never leads.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_organizations()
returns table (id uuid, name text, primary_market char(2), status text, is_demo boolean, created_at timestamptz,
               plan_key text, subscription_status text, members bigint, leads bigint)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Platform admins only' using errcode = 'insufficient_privilege';
  end if;
  return query
  select o.id, o.name, o.primary_market, o.status, o.is_demo, o.created_at, s.plan_key, s.status,
         (select count(*) from public.memberships m where m.organization_id = o.id),
         (select count(*) from public.leads l where l.organization_id = o.id)
  from public.organizations o left join public.subscriptions s on s.organization_id = o.id
  order by o.created_at desc;
end $$;

create or replace function public.admin_set_organization_status(p_org uuid, p_status text) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Platform admins only' using errcode = 'insufficient_privilege';
  end if;
  update public.organizations set status = p_status where id = p_org;
end $$;

-- ---------------------------------------------------------------------------
-- Lock down: anon gets nothing, now or from later migrations.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
revoke execute on all functions in schema app from anon, public;
grant execute on all functions in schema app to authenticated, service_role;
grant execute on function
  public.create_organization(text, char, text, boolean),
  public.add_member(uuid, uuid, text),
  public.import_leads(uuid, jsonb, uuid, text, text, text, uuid),
  public.erase_lead(uuid, uuid, boolean),
  public.lead_metrics(uuid, timestamptz, timestamptz, timestamptz),
  public.admin_list_organizations(),
  public.admin_set_organization_status(uuid, text)
to authenticated;
grant select on public.lead_consent_latest to authenticated, service_role;
revoke insert, update, delete, truncate, references, trigger on public.lead_consent_latest from authenticated;
-- Billing and usage are written by the service role only.
revoke insert, update, delete on public.subscriptions, public.usage_records, public.plans, public.markets,
  public.roles, public.platform_admins, public.audit_logs from authenticated;
revoke delete on public.lead_imports from authenticated;
-- Evidence tables: users append, never edit. (A trigger also blocks the service role.)
revoke update, delete on public.lead_activities, public.consent_records from authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
alter default privileges in schema app revoke execute on functions from anon, public;
