-- Multiple sending accounts per channel, per company or shared across the group, with each
-- platform's limits enforced: per-account daily caps (email warm-up), sending hours, and a
-- cross-channel cap on how often one person is contacted. Adds X (Twitter) as a channel.
--
-- Accounts are real mailboxes, business numbers, Pages and team members' own profiles. Secrets
-- (passwords, tokens) never live here; n8n holds them under the account's key.

create table public.sender_accounts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  family_group_id uuid references public.family_groups (id) on delete cascade,
  channel         text not null check (channel in ('email', 'whatsapp', 'linkedin', 'twitter', 'instagram', 'facebook', 'reddit')),
  kind            text not null check (kind in ('mailbox', 'business_number', 'page', 'business_account', 'personal_profile')),
  label           text not null check (length(trim(label)) between 1 and 80),
  address         text not null check (length(trim(address)) between 2 and 200),
  account_key     text not null check (account_key ~ '^[A-Z0-9_]{2,40}$'),
  operator_id     uuid references public.users (id) on delete set null,
  daily_limit     integer not null check (daily_limit between 1 and 1000),
  warmup_started  date,
  status          text not null default 'active' check (status in ('active', 'paused')),
  created_by      uuid default auth.uid() references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  check ((organization_id is null) <> (family_group_id is null)),
  -- A person's own profile is operated by that person; it is never a shared bulk sender.
  check (kind <> 'personal_profile' or operator_id is not null),
  -- Platform ceilings per account per day (conservative, inside each platform's published limits).
  check (daily_limit <= case channel when 'email' then 200 when 'whatsapp' then 1000 when 'linkedin' then 25
                                      when 'twitter' then 50 when 'instagram' then 50 when 'facebook' then 50 when 'reddit' then 10 end)
);
create unique index sender_accounts_key on public.sender_accounts (coalesce(organization_id, family_group_id), account_key);
alter table public.sender_accounts enable row level security;
create policy sender_accounts_read on public.sender_accounts for select to authenticated
  using ((organization_id is not null and app.has_permission(organization_id, 'crm.write'))
      or (family_group_id is not null and app.is_group_member(family_group_id)));
create policy sender_accounts_write_company on public.sender_accounts for all to authenticated
  using (organization_id is not null and app.has_permission(organization_id, 'crm.manage'))
  with check (organization_id is not null and app.has_permission(organization_id, 'crm.manage'));
create policy sender_accounts_write_group on public.sender_accounts for all to authenticated
  using (family_group_id is not null and app.is_group_owner(family_group_id))
  with check (family_group_id is not null and app.is_group_owner(family_group_id));
grant select, insert, update, delete on public.sender_accounts to authenticated;
grant all on public.sender_accounts to service_role;
create trigger sender_accounts_audit after insert or update or delete on public.sender_accounts for each row execute function app.audit_row();

/** Today's sending capacity: email accounts warm up from 10/day, +5 a day, to their limit. */
create or replace function app.account_capacity(a public.sender_accounts, p_today date) returns integer
language sql stable as $$
  select case when a.channel = 'email' and a.warmup_started is not null
              then least(a.daily_limit, 10 + 5 * greatest(p_today - a.warmup_started, 0))
              else a.daily_limit end
$$;

-- Every automated send is logged against the account it used, which is how caps are counted.
create table public.outreach_send_log (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  sender_account_id uuid references public.sender_accounts (id) on delete set null,
  contact_id        uuid,
  channel           text not null,
  sent_on           date not null,
  enrollment_id     uuid,
  created_at        timestamptz not null default now()
);
create index on public.outreach_send_log (sender_account_id, sent_on);
create index on public.outreach_send_log (contact_id, sent_on);
alter table public.outreach_send_log enable row level security;
create policy send_log_read on public.outreach_send_log for select to authenticated using (app.has_permission(organization_id, 'crm.write'));
grant select on public.outreach_send_log to authenticated;
grant all on public.outreach_send_log to service_role;

-- Company-level rule: how often one person may be contacted across all channels.
create table public.outreach_rules (
  organization_id        uuid primary key references public.organizations (id) on delete cascade,
  max_touches_per_week   integer not null default 3 check (max_touches_per_week between 1 and 14),
  send_window_start      smallint not null default 9 check (send_window_start between 0 and 23),
  send_window_end        smallint not null default 19 check (send_window_end between 1 and 24),
  updated_at             timestamptz not null default now(),
  check (send_window_end > send_window_start)
);
alter table public.outreach_rules enable row level security;
create policy outreach_rules_read on public.outreach_rules for select to authenticated using (app.has_permission(organization_id, 'crm.write'));
create policy outreach_rules_write on public.outreach_rules for all to authenticated
  using (app.has_permission(organization_id, 'crm.manage')) with check (app.has_permission(organization_id, 'crm.manage'));
grant select, insert, update on public.outreach_rules to authenticated;
grant all on public.outreach_rules to service_role;
insert into public.outreach_rules (organization_id) select id from public.organizations on conflict do nothing;
create or replace function app.default_outreach_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into public.outreach_rules (organization_id) values (new.id) on conflict do nothing; return new; end $$;
create trigger organizations_outreach_rules after insert on public.organizations for each row execute function app.default_outreach_rules();

-- X (Twitter) joins the channels.
alter table public.outreach_events drop constraint if exists outreach_events_kind_check;
alter table public.outreach_events add constraint outreach_events_kind_check
  check (kind in ('call', 'email', 'whatsapp', 'linkedin', 'facebook', 'instagram', 'twitter', 'reply', 'bounce', 'unsubscribe', 'note'));
alter table public.outreach_tasks drop constraint if exists outreach_tasks_channel_check;
alter table public.outreach_tasks add constraint outreach_tasks_channel_check
  check (channel in ('linkedin', 'facebook', 'instagram', 'twitter', 'reddit', 'email', 'whatsapp', 'call'));
alter table public.outreach_tasks add column sender_account_id uuid references public.sender_accounts (id) on delete set null;
alter table public.content_posts drop constraint if exists content_posts_channel_check;
alter table public.content_posts add constraint content_posts_channel_check check (channel in ('linkedin', 'facebook', 'instagram', 'twitter'));
alter table public.content_posts add column sender_account_id uuid references public.sender_accounts (id) on delete set null;
alter table public.contacts add column twitter_handle text check (twitter_handle is null or twitter_handle ~ '^[A-Za-z0-9_]{1,15}$');

/**
 * Picks the account for one send: the company's own active accounts first, then the group's
 * shared ones, choosing the one with the most capacity left today. Null when all are full.
 */
create or replace function app.pick_sender(p_org uuid, p_channel text, p_today date) returns uuid
language sql stable security definer set search_path = public as $$
  select a.id from public.sender_accounts a
  where a.status = 'active' and a.channel = p_channel
    and (a.organization_id = p_org or a.family_group_id = (select family_group_id from public.organizations where id = p_org))
    and a.kind <> 'personal_profile'
    and (select count(*) from public.outreach_send_log l where l.sender_account_id = a.id and l.sent_on = p_today) < app.account_capacity(a, p_today)
  order by (a.organization_id is null), app.account_capacity(a, p_today) - (select count(*) from public.outreach_send_log l where l.sender_account_id = a.id and l.sent_on = p_today) desc
  limit 1
$$;

/** Picks whose task a person-to-person step becomes: the operator with the fewest steps today. */
create or replace function app.pick_operator_account(p_org uuid, p_channel text, p_today date) returns uuid
language sql stable security definer set search_path = public as $$
  select a.id from public.sender_accounts a
  where a.status = 'active' and a.channel = p_channel and a.operator_id is not null
    and (a.organization_id = p_org or a.family_group_id = (select family_group_id from public.organizations where id = p_org))
    and (select count(*) from public.outreach_tasks t where t.sender_account_id = a.id and t.due_on = p_today) < a.daily_limit
  order by (select count(*) from public.outreach_tasks t where t.sender_account_id = a.id and t.due_on = p_today), a.created_at
  limit 1
$$;

/** True when this person has already been contacted the company's weekly maximum. */
create or replace function app.touch_capped(p_org uuid, p_contact uuid, p_today date) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.outreach_send_log l where l.contact_id = p_contact and l.sent_on > p_today - 7)
       + (select count(*) from public.outreach_tasks t where t.contact_id = p_contact and t.due_on > p_today - 7 and t.status <> 'skipped')
       >= coalesce((select max_touches_per_week from public.outreach_rules where organization_id = p_org), 3)
$$;

/** Pause or resume every campaign in one company, or across every company in the group. */
create or replace function public.set_outreach_paused(p_org uuid, p_group uuid, p_paused boolean)
returns integer
language plpgsql security definer set search_path = public, auth as $$
declare v int;
begin
  if p_org is not null then
    if not app.has_permission(p_org, 'crm.manage') then raise exception 'Not allowed' using errcode = 'insufficient_privilege'; end if;
    update public.outreach_sequences set status = case when p_paused then 'paused' else 'active' end
      where organization_id = p_org and status = case when p_paused then 'active' else 'paused' end;
  else
    if not app.is_group_owner(p_group) then raise exception 'Only a group owner can pause all companies' using errcode = 'insufficient_privilege'; end if;
    update public.outreach_sequences s set status = case when p_paused then 'paused' else 'active' end
      from public.organizations o where o.id = s.organization_id and o.family_group_id = p_group
        and s.status = case when p_paused then 'active' else 'paused' end;
  end if;
  get diagnostics v = row_count;
  return v;
end $$;

/** Copies a campaign into other companies of the same group (as paused drafts to review). */
create or replace function public.copy_campaign(p_sequence uuid, p_orgs uuid[])
returns integer
language plpgsql security definer set search_path = public, auth as $$
declare s public.outreach_sequences; o uuid; n int := 0;
begin
  select * into s from public.outreach_sequences where id = p_sequence;
  if s.id is null or not app.has_permission(s.organization_id, 'crm.write') then raise exception 'Not allowed' using errcode = 'insufficient_privilege'; end if;
  foreach o in array p_orgs loop
    if o = s.organization_id then continue; end if;
    if not app.has_permission(o, 'crm.manage') then continue; end if;
    if (select family_group_id from public.organizations where id = o) is distinct from (select family_group_id from public.organizations where id = s.organization_id) then continue; end if;
    insert into public.outreach_sequences (organization_id, name, steps, stop_on_reply, requires_approval, status)
    values (o, s.name, s.steps, s.stop_on_reply, true, 'paused');
    n := n + 1;
  end loop;
  return n;
end $$;

-- The daily scheduler, now account- and limit-aware (all earlier branches unchanged).
create or replace function public.enqueue_scheduled_runs(p_today date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  d record; e record; st jsonb;
  v_summary jsonb; v_new integer := 0; v_id uuid; v_items jsonb; v_next jsonb; v_acct uuid;
  v_keys text[] := array['daily_summary', 'rent_overdue_escalation', 'bill_ocr_review',
                         'payment_reminders', 'sequence_sends', 'social_publish', 'voice_calls', 'reddit_listen'];
begin
  -- Sequence stepping first: platform steps become tasks; email/WhatsApp sends are collected below.
  create temp table if not exists pg_temp.sends (organization_id uuid, item jsonb) on commit drop;
  truncate pg_temp.sends;
  for e in
    select en.*, s.steps, c.full_name, c.company_name, c.email, c.phone_e164, c.linkedin_url, c.facebook_url, c.instagram_handle,
           c.do_not_contact, c.consent_basis, c.owner_id, c.twitter_handle
    from public.outreach_enrollments en
    join public.outreach_sequences s on s.id = en.sequence_id and s.status = 'active'
    join public.contacts c on c.id = en.contact_id
    join public.organizations o on o.id = en.organization_id and not o.emergency_stop
    where en.status = 'active' and coalesce(en.next_step_at, now()) <= (p_today + 1)::timestamptz
  loop
    if e.do_not_contact or app.is_suppressed(e.organization_id, e.email, e.phone_e164) then
      update public.outreach_enrollments set status = 'stopped_suppressed' where id = e.id; continue;
    end if;
    -- Respect the company's weekly contact limit: try again tomorrow.
    if app.touch_capped(e.organization_id, e.contact_id, p_today) then
      update public.outreach_enrollments set next_step_at = (p_today + 1)::timestamptz where id = e.id; continue;
    end if;
    st := e.steps -> e.current_step;
    if st is null then update public.outreach_enrollments set status = 'completed' where id = e.id; continue; end if;
    if st ->> 'channel' in ('email', 'whatsapp') then
      if e.consent_basis <> 'none' and ((st ->> 'channel' = 'email' and e.email is not null) or (st ->> 'channel' = 'whatsapp' and e.phone_e164 is not null)) then
        v_acct := app.pick_sender(e.organization_id, st ->> 'channel', p_today);
        if v_acct is null then
          -- Every account for this channel is at today's limit (or none is set up): send tomorrow.
          update public.outreach_enrollments set next_step_at = (p_today + 1)::timestamptz where id = e.id; continue;
        end if;
        insert into public.outreach_send_log (organization_id, sender_account_id, contact_id, channel, sent_on, enrollment_id)
        values (e.organization_id, v_acct, e.contact_id, st ->> 'channel', p_today, e.id);
        insert into pg_temp.sends select e.organization_id, jsonb_build_object('enrollment_id', e.id, 'channel', st ->> 'channel',
          'to', case when st ->> 'channel' = 'email' then e.email else e.phone_e164 end, 'name', e.full_name, 'company', e.company_name,
          'template', st ->> 'template', 'step', e.current_step, 'from', a.address, 'account_key', a.account_key)
          from public.sender_accounts a where a.id = v_acct;
      end if;
    else
      v_acct := app.pick_operator_account(e.organization_id,
        case when st ->> 'channel' in ('linkedin', 'linkedin_task') then 'linkedin' else st ->> 'channel' end, p_today);
      insert into public.outreach_tasks (organization_id, contact_id, enrollment_id, channel, step, due_on, target_url, draft, assignee_id, sender_account_id)
      values (e.organization_id, e.contact_id, e.id,
        case when st ->> 'channel' in ('linkedin', 'linkedin_task') then 'linkedin' when st ->> 'channel' = 'call_task' then 'call' else coalesce(st ->> 'channel', 'linkedin') end,
        coalesce(st ->> 'action', case when st ->> 'channel' = 'call_task' then 'call' else 'message' end), p_today,
        case when st ->> 'channel' in ('linkedin', 'linkedin_task') then e.linkedin_url when st ->> 'channel' = 'facebook' then e.facebook_url
             when st ->> 'channel' = 'twitter' and e.twitter_handle is not null then 'https://x.com/' || e.twitter_handle
             when st ->> 'channel' = 'instagram' and e.instagram_handle is not null then 'https://instagram.com/' || e.instagram_handle end,
        replace(replace(coalesce(st ->> 'template', ''), '{{first_name}}', split_part(e.full_name, ' ', 1)), '{{company}}', coalesce(e.company_name, '')),
        coalesce((select operator_id from public.sender_accounts where id = v_acct), e.owner_id), v_acct);
    end if;
    v_next := e.steps -> (e.current_step + 1);
    update public.outreach_enrollments set current_step = current_step + 1,
      status = case when v_next is null then 'completed' else status end,
      next_step_at = case when v_next is null then null else (p_today + coalesce((v_next ->> 'delay_days')::int, 1))::timestamptz end
    where id = e.id;
  end loop;

  for d in
    select ad.* from public.automation_definitions ad
    join public.organizations o on o.id = ad.organization_id
    where ad.enabled and not o.emergency_stop and ad.template_key = any (v_keys)
  loop
    v_summary := null;
    if d.template_key = 'daily_summary' then
      v_summary := jsonb_build_object(
        'company', (select name from public.organizations where id = d.organization_id), 'date', p_today,
        'open_deals', (select count(*) from public.deals x join public.pipeline_stages s on s.id = x.stage_id where x.organization_id = d.organization_id and s.kind not in ('won', 'lost')),
        'open_pipeline_minor', (select coalesce(sum(x.value_minor), 0) from public.deals x join public.pipeline_stages s on s.id = x.stage_id where x.organization_id = d.organization_id and s.kind not in ('won', 'lost') and x.currency = 'INR'),
        'meetings_today', (select count(*) from public.meetings m where m.organization_id = d.organization_id and (m.starts_at at time zone 'Asia/Kolkata')::date = p_today and m.status = 'scheduled'),
        'tasks_overdue', (select count(*) from public.tasks t where t.organization_id = d.organization_id and t.status = 'open' and t.due_on < p_today),
        'ledger_awaiting_approval', (select count(*) from public.ledger_entries l where l.organization_id = d.organization_id and l.status = 'pending_approval'),
        'bills_awaiting_review', (select count(*) from public.ocr_extractions x where x.organization_id = d.organization_id and x.status in ('extracted', 'failed')),
        'outstanding_minor', (select coalesce(sum(i.outstanding_minor), 0) from public.invoices i where i.organization_id = d.organization_id and i.status = 'issued'),
        'outreach_tasks_today', (select count(*) from public.outreach_tasks t where t.organization_id = d.organization_id and t.status = 'open' and t.due_on <= p_today));
    elsif d.template_key = 'bill_ocr_review' then
      v_summary := jsonb_build_object('company', (select name from public.organizations where id = d.organization_id), 'date', p_today,
        'bills_awaiting_review', (select count(*) from public.ocr_extractions x where x.organization_id = d.organization_id and x.status in ('extracted', 'failed')),
        'oldest_waiting_days', (select coalesce(max(p_today - (x.created_at at time zone 'Asia/Kolkata')::date), 0) from public.ocr_extractions x where x.organization_id = d.organization_id and x.status in ('extracted', 'failed')));
      if (v_summary ->> 'bills_awaiting_review')::int = 0 then continue; end if;
    elsif d.template_key = 'rent_overdue_escalation' then
      v_summary := jsonb_build_object('company', (select name from public.organizations where id = d.organization_id), 'date', p_today,
        'overdue', coalesce((select jsonb_agg(jsonb_build_object('unit', u.label, 'due_on', c.due_on, 'outstanding_minor', c.amount_minor - c.received_minor, 'days_overdue', p_today - c.due_on) order by c.due_on)
          from public.rent_charges c join public.leases l on l.id = c.lease_id join public.rental_units u on u.id = l.unit_id
          where c.organization_id = d.organization_id and c.status in ('open', 'partially_paid') and c.due_on < p_today), '[]'::jsonb));
      if jsonb_array_length(v_summary -> 'overdue') = 0 then continue; end if;
      insert into public.tasks (organization_id, title, due_on, priority, created_by)
      select d.organization_id, left(format('Rent overdue: %s (due %s)', u.label, to_char(c.due_on, 'DD Mon YYYY')), 200), p_today, 'high', null
      from public.rent_charges c join public.leases l on l.id = c.lease_id join public.rental_units u on u.id = l.unit_id
      where c.organization_id = d.organization_id and c.status in ('open', 'partially_paid') and c.due_on < p_today
        and not exists (select 1 from public.tasks t where t.organization_id = d.organization_id and t.title = left(format('Rent overdue: %s (due %s)', u.label, to_char(c.due_on, 'DD Mon YYYY')), 200));
    elsif d.template_key = 'payment_reminders' then
      -- 3 days before, on the day, then 3, 7, 15 and 30 days after; stops when paid.
      select coalesce(jsonb_agg(jsonb_build_object(
          'invoice_id', i.id, 'invoice_number', i.invoice_number, 'client', cl.legal_name, 'outstanding_minor', i.outstanding_minor, 'currency', i.currency,
          'due_date', i.due_date, 'stage', case when i.due_date > p_today then 'pre_due' when i.due_date = p_today then 'due' else 'overdue' end,
          'days_overdue', greatest(p_today - i.due_date, 0),
          'pay_url', (select pl.short_url from public.payment_links pl where pl.invoice_id = i.id and pl.status in ('created', 'partially_paid') order by pl.created_at desc limit 1),
          'emails', (select coalesce(jsonb_agg(bc.email), '[]') from public.billing_contacts bc where bc.client_id = i.client_id and bc.receives_reminders and not bc.email_opt_out and bc.email is not null),
          'whatsapp', (select coalesce(jsonb_agg(bc.whatsapp_e164), '[]') from public.billing_contacts bc where bc.client_id = i.client_id and bc.receives_reminders and bc.whatsapp_consent_at is not null and bc.whatsapp_e164 is not null))), '[]')
        into v_items
      from public.invoices i join public.clients cl on cl.id = i.client_id
      where i.organization_id = d.organization_id and i.status = 'issued' and i.outstanding_minor > 0
        and (i.due_date - p_today) in (3, 0, -3, -7, -15, -30);
      if jsonb_array_length(v_items) = 0 then continue; end if;
      v_summary := jsonb_build_object('company', (select name from public.organizations where id = d.organization_id), 'date', p_today, 'invoices', v_items);
    elsif d.template_key = 'sequence_sends' then
      select coalesce(jsonb_agg(item), '[]') into v_items from pg_temp.sends where organization_id = d.organization_id;
      if jsonb_array_length(v_items) = 0 then continue; end if;
      v_summary := jsonb_build_object('company', (select name from public.organizations where id = d.organization_id), 'date', p_today, 'sends', v_items);
    elsif d.template_key = 'social_publish' then
      select coalesce(jsonb_agg(jsonb_build_object('post_id', p.id, 'channel', p.channel, 'body', p.body, 'media_url', p.media_url, 'scheduled_at', p.scheduled_at, 'account_key', (select a.account_key from public.sender_accounts a where a.id = p.sender_account_id))), '[]') into v_items
      from public.content_posts p where p.organization_id = d.organization_id and p.status = 'approved' and p.scheduled_at < (p_today + 1)::timestamptz;
      if jsonb_array_length(v_items) = 0 then continue; end if;
      v_summary := jsonb_build_object('company', (select name from public.organizations where id = d.organization_id), 'date', p_today, 'posts', v_items);
    elsif d.template_key = 'voice_calls' then
      select coalesce(jsonb_agg(jsonb_build_object('call_id', v.id, 'purpose', v.purpose, 'to', c.phone_e164, 'name', c.full_name, 'company', c.company_name)), '[]') into v_items
      from public.voice_calls v join public.contacts c on c.id = v.contact_id
      where v.organization_id = d.organization_id and v.status = 'queued' and v.scheduled_for < (p_today + 1)::timestamptz
        and not c.do_not_contact and c.consent_basis <> 'none' and not app.is_suppressed(v.organization_id, null, c.phone_e164);
      if jsonb_array_length(v_items) = 0 then continue; end if;
      v_summary := jsonb_build_object('company', (select name from public.organizations where id = d.organization_id), 'date', p_today,
        'disclosure', format('Hi, this is an AI assistant calling on behalf of %s.', (select name from public.organizations where id = d.organization_id)),
        'calling_window', '09:00-21:00 Asia/Kolkata', 'calls', v_items);
    elsif d.template_key = 'reddit_listen' then
      select coalesce(jsonb_agg(jsonb_build_object('keyword', k.keyword, 'subreddit', k.subreddit)), '[]') into v_items
      from public.listen_keywords k where k.organization_id = d.organization_id and k.active;
      if jsonb_array_length(v_items) = 0 then continue; end if;
      v_summary := jsonb_build_object('company', (select name from public.organizations where id = d.organization_id), 'date', p_today, 'keywords', v_items);
    end if;
    if v_summary is null then continue; end if;

    insert into public.automation_runs (organization_id, definition_id, idempotency_key, trigger_source, status, is_mock, payload_summary, requested_by)
    values (d.organization_id, d.id, d.template_key || ':' || p_today, 'schedule',
            case when d.requires_approval then 'pending_approval' else 'queued' end, false, v_summary, null)
    on conflict (organization_id, idempotency_key) do nothing
    returning id into v_id;
    if v_id is not null then v_new := v_new + 1; v_id := null; end if;
  end loop;
  return v_new;
end $$;

revoke all on function public.set_outreach_paused(uuid, uuid, boolean), public.copy_campaign(uuid, uuid[]) from public, anon;
grant execute on function public.set_outreach_paused(uuid, uuid, boolean), public.copy_campaign(uuid, uuid[]) to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
