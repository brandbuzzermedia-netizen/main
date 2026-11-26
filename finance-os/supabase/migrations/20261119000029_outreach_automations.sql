-- Outreach automations, per company, switched on in Outreach:
--  1. Follow-up after a touch with no answer / voicemail / not now / out of office (task in N days).
--  2. Interested lead -> a deal in the pipeline plus a "book a meeting" task (once).
--  3. Converted lead -> a client record for invoicing (once).
--  4. New lead from a source -> enrolled in that source's campaign (consent and suppression still apply).
--  5. Lead left "on the list" for N days -> a task for its owner (daily, from the dispatcher).
-- Every action is written to outreach_rule_log. None of these can block the change that triggered it.

create table public.outreach_automation (
  organization_id  uuid primary key references public.organizations (id) on delete cascade,
  followup_on      boolean not null default true,
  followup_days    smallint not null default 2 check (followup_days between 1 and 30),
  interested_deal  boolean not null default true,
  converted_client boolean not null default true,
  stale_on         boolean not null default true,
  stale_days       smallint not null default 7 check (stale_days between 2 and 60),
  updated_at       timestamptz not null default now()
);
alter table public.outreach_automation enable row level security;
create policy outreach_automation_read on public.outreach_automation for select to authenticated using (app.has_permission(organization_id, 'crm.write'));
create policy outreach_automation_write on public.outreach_automation for all to authenticated
  using (app.has_permission(organization_id, 'crm.manage')) with check (app.has_permission(organization_id, 'crm.manage'));
grant select, insert, update on public.outreach_automation to authenticated;
grant all on public.outreach_automation to service_role;

create table public.outreach_source_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_match    text not null check (length(trim(source_match)) between 2 and 80),
  sequence_id     uuid not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, sequence_id) references public.outreach_sequences (organization_id, id) on delete cascade
);
create index on public.outreach_source_rules (organization_id) where active;
alter table public.outreach_source_rules enable row level security;
create policy outreach_source_rules_read on public.outreach_source_rules for select to authenticated using (app.has_permission(organization_id, 'crm.write'));
create policy outreach_source_rules_write on public.outreach_source_rules for all to authenticated
  using (app.has_permission(organization_id, 'crm.manage')) with check (app.has_permission(organization_id, 'crm.manage'));
grant select, insert, update, delete on public.outreach_source_rules to authenticated;
grant all on public.outreach_source_rules to service_role;

create table public.outreach_rule_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  rule            text not null check (rule in ('followup', 'interested_deal', 'converted_client', 'source_campaign', 'stale')),
  contact_id      uuid references public.contacts (id) on delete cascade,
  detail          text check (detail is null or length(detail) <= 300),
  created_at      timestamptz not null default now()
);
create index on public.outreach_rule_log (organization_id, created_at desc);
create index on public.outreach_rule_log (contact_id, rule, created_at desc);
alter table public.outreach_rule_log enable row level security;
create policy outreach_rule_log_read on public.outreach_rule_log for select to authenticated using (app.has_permission(organization_id, 'crm.write'));
grant select on public.outreach_rule_log to authenticated;
grant all on public.outreach_rule_log to service_role;

alter table public.contacts add column auto_deal_id uuid, add column auto_client_id uuid;

-- Settings with defaults when a company has not saved any yet.
create or replace function app.outreach_settings(p_org uuid) returns public.outreach_automation
language sql stable security definer set search_path = public as $$
  select coalesce((select a from public.outreach_automation a where a.organization_id = p_org),
                  row(p_org, true, 2, true, true, true, 7, now())::public.outreach_automation)
$$;

-- A user who is still a member of the company, else null (records are never given to outsiders).
create or replace function app.member_or_null(p_org uuid, p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p_user where p_user is not null and exists (select 1 from public.memberships m where m.organization_id = p_org and m.user_id = p_user)
$$;

-- 1. Follow-up after an unanswered touch.
create or replace function app.outreach_followup() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.outreach_automation; c record; v_title text;
begin
  if new.kind not in ('call', 'email', 'whatsapp', 'linkedin', 'facebook', 'instagram', 'twitter')
     or coalesce(new.outcome, '') not in ('no_answer', 'voicemail', 'not_now', 'out_of_office') then return new; end if;
  s := app.outreach_settings(new.organization_id);
  if not s.followup_on then return new; end if;
  begin
    select full_name, owner_id, do_not_contact into c from public.contacts where id = new.contact_id;
    if c.full_name is null or c.do_not_contact then return new; end if;
    v_title := left(format('Follow up: %s (%s)', c.full_name, replace(new.kind, '_', ' ')), 200);
    if exists (select 1 from public.tasks t where t.organization_id = new.organization_id and t.title = v_title and t.status in ('open', 'in_progress')) then return new; end if;
    insert into public.tasks (organization_id, title, details, due_on, assignee_id, priority, created_by)
    values (new.organization_id, v_title, format('Last touch: %s, outcome %s.', new.kind, replace(new.outcome, '_', ' ')),
            (now() at time zone 'Asia/Kolkata')::date + s.followup_days,
            coalesce(app.member_or_null(new.organization_id, c.owner_id), app.member_or_null(new.organization_id, new.created_by)), 'normal', null);
    insert into public.outreach_rule_log (organization_id, rule, contact_id, detail)
    values (new.organization_id, 'followup', new.contact_id, format('%s in %s days', v_title, s.followup_days));
  exception when others then raise warning 'outreach follow-up skipped: %', sqlerrm;
  end;
  return new;
end $$;
create trigger outreach_events_followup after insert on public.outreach_events for each row execute function app.outreach_followup();

-- 2 and 3. Interested -> deal; Converted -> client.
create or replace function app.outreach_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.outreach_automation; v_stage uuid; v_deal uuid; v_client uuid; v_owner uuid; v_name text; v_code text;
begin
  if new.lead_status is not distinct from old.lead_status then return new; end if;
  s := app.outreach_settings(new.organization_id);
  v_owner := app.member_or_null(new.organization_id, new.owner_id);
  if new.lead_status = 'qualified' and s.interested_deal and new.auto_deal_id is null then
    begin
      select id into v_stage from public.pipeline_stages where organization_id = new.organization_id and kind not in ('won', 'lost') order by position limit 1;
      if v_stage is not null then
        insert into public.deals (organization_id, title, account_name, stage_id, owner_id, source, next_action, next_action_on, created_by)
        values (new.organization_id, left(new.full_name || coalesce(' · ' || new.company_name, ''), 200), new.company_name, v_stage, v_owner, left(new.source, 80),
                'Book a meeting', (now() at time zone 'Asia/Kolkata')::date + 1, null)
        returning id into v_deal;
        update public.contacts set auto_deal_id = v_deal where id = new.id;
        insert into public.tasks (organization_id, title, due_on, assignee_id, priority, deal_id, created_by)
        values (new.organization_id, left('Book a meeting: ' || new.full_name, 200), (now() at time zone 'Asia/Kolkata')::date + 1, v_owner, 'high', v_deal, null);
        insert into public.outreach_rule_log (organization_id, rule, contact_id, detail) values (new.organization_id, 'interested_deal', new.id, 'Deal created and a meeting task added');
      end if;
    exception when others then raise warning 'interested deal skipped: %', sqlerrm;
    end;
  elsif new.lead_status = 'customer' and s.converted_client and new.auto_client_id is null then
    begin
      v_name := coalesce(nullif(trim(new.company_name), ''), new.full_name);
      v_code := left(upper(regexp_replace(v_name, '[^A-Za-z0-9]', '', 'g')), 8);
      if length(v_code) < 2 then v_code := 'CL'; end if;
      v_code := v_code || '-' || upper(substr(md5(new.id::text), 1, 4));
      select id into v_client from public.clients where organization_id = new.organization_id and lower(legal_name) = lower(v_name) limit 1;
      if v_client is null then
        insert into public.clients (organization_id, client_code, legal_name, account_owner_id, notes)
        values (new.organization_id, v_code, v_name, v_owner, format('Created from lead %s when it converted.', new.full_name))
        returning id into v_client;
      end if;
      update public.contacts set auto_client_id = v_client where id = new.id;
      if new.auto_deal_id is not null then update public.deals set client_id = v_client where id = new.auto_deal_id and client_id is null; end if;
      insert into public.outreach_rule_log (organization_id, rule, contact_id, detail) values (new.organization_id, 'converted_client', new.id, 'Client ready for invoicing: ' || v_name);
    exception when others then raise warning 'converted client skipped: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
create trigger contacts_outreach_status after update of lead_status on public.contacts for each row execute function app.outreach_status_change();

-- 4. New lead from a source -> that source's campaign.
create or replace function app.outreach_source_enrol() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.source is null or new.do_not_contact or new.consent_basis = 'none' then return new; end if;
  for r in select sr.sequence_id, sr.source_match from public.outreach_source_rules sr
           join public.outreach_sequences q on q.id = sr.sequence_id and q.status <> 'archived'
           where sr.organization_id = new.organization_id and sr.active and position(lower(sr.source_match) in lower(new.source)) > 0 loop
    begin
      insert into public.outreach_enrollments (organization_id, sequence_id, contact_id, next_step_at) values (new.organization_id, r.sequence_id, new.id, now())
      on conflict (sequence_id, contact_id) do nothing;
      insert into public.outreach_rule_log (organization_id, rule, contact_id, detail) values (new.organization_id, 'source_campaign', new.id, 'Source "' || r.source_match || '" → campaign');
    exception when others then raise warning 'source campaign skipped: %', sqlerrm;
    end;
  end loop;
  return new;
end $$;
create trigger contacts_outreach_source after insert on public.contacts for each row execute function app.outreach_source_enrol();

-- 5. Leads left on the list: one reminder per lead per waiting period. Called daily by the dispatcher.
create or replace function public.run_outreach_rules(p_today date) returns integer
language plpgsql security definer set search_path = public as $$
declare c record; v_n int := 0; s public.outreach_automation;
begin
  for c in
    select ct.id, ct.organization_id, ct.full_name, ct.owner_id
    from public.contacts ct join public.organizations o on o.id = ct.organization_id and not o.emergency_stop
    where ct.lead_status = 'new' and not ct.do_not_contact
  loop
    s := app.outreach_settings(c.organization_id);
    if not s.stale_on then continue; end if;
    if exists (select 1 from public.contacts x where x.id = c.id and x.created_at > (p_today - s.stale_days)::timestamptz) then continue; end if;
    if exists (select 1 from public.outreach_events e where e.contact_id = c.id and e.occurred_at > (p_today - s.stale_days)::timestamptz) then continue; end if;
    if exists (select 1 from public.outreach_rule_log l where l.contact_id = c.id and l.rule = 'stale' and l.created_at > (p_today - s.stale_days)::timestamptz) then continue; end if;
    begin
      insert into public.tasks (organization_id, title, due_on, assignee_id, priority, created_by)
      values (c.organization_id, left(format('Reach out: %s has waited %s+ days on the list', c.full_name, s.stale_days), 200), p_today, app.member_or_null(c.organization_id, c.owner_id), 'normal', null);
      insert into public.outreach_rule_log (organization_id, rule, contact_id, detail) values (c.organization_id, 'stale', c.id, format('On the list for %s+ days', s.stale_days));
      v_n := v_n + 1;
    exception when others then raise warning 'stale lead reminder skipped: %', sqlerrm;
    end;
  end loop;
  return v_n;
end $$;
revoke all on function public.run_outreach_rules(date) from public, anon, authenticated;
grant execute on function public.run_outreach_rules(date) to service_role;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
