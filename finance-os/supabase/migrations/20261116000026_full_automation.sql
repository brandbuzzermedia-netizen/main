-- Full automation, safely.
--  1. Approve once: an owner or admin approves a campaign's wording once; its daily sends then
--     queue without per-run approval. Editing the steps withdraws the approval.
--  2. AI reply assistant: per-company switch, channels, what it may say (knowledge) and an audit
--     row for every incoming message it handled (replied or handed to a person).

alter table public.outreach_sequences add column approved_at timestamptz, add column approved_by uuid references public.users (id) on delete set null;

create or replace function app.withdraw_campaign_approval() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.approved_at := null; new.approved_by := null;  -- new and copied campaigns always start unapproved
    return new;
  end if;
  if new.steps is distinct from old.steps and new.approved_at is not distinct from old.approved_at then
    new.approved_at := null; new.approved_by := null;
  end if;
  if new.approved_at is distinct from old.approved_at and new.approved_at is not null
     and coalesce(current_setting('app.approve_rpc', true), '') <> 'on' then
    raise exception 'Use approve_campaign to approve a campaign' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger outreach_sequences_approval before insert or update on public.outreach_sequences
  for each row execute function app.withdraw_campaign_approval();

create or replace function public.approve_campaign(p_sequence uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.outreach_sequences where id = p_sequence;
  if v_org is null or not app.has_permission(v_org, 'dashboard.owner') then
    raise exception 'Only an owner or company admin can approve campaigns' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('app.approve_rpc', 'on', true);
  update public.outreach_sequences set approved_at = case when p_approve then now() end, approved_by = case when p_approve then auth.uid() end where id = p_sequence;
  perform set_config('app.approve_rpc', 'off', true);
end $$;
revoke all on function public.approve_campaign(uuid, boolean) from public, anon;
grant execute on function public.approve_campaign(uuid, boolean) to authenticated;

alter table public.growth_settings
  add column ai_reply_enabled  boolean not null default false,
  add column ai_reply_channels text[] not null default '{email,whatsapp}' check (ai_reply_channels <@ array['email', 'whatsapp']),
  add column ai_knowledge      text check (ai_knowledge is null or length(ai_knowledge) <= 8000),
  add column ai_daily_limit    smallint not null default 3 check (ai_daily_limit between 1 and 10);

create table public.ai_replies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id      uuid,
  channel         text not null check (channel in ('email', 'whatsapp')),
  inbound_text    text not null,
  action          text not null check (action in ('replied', 'handed_over', 'skipped')),
  reply_text      text,
  interest        text check (interest in ('hot', 'warm', 'cold', 'not_interested')),
  reason          text,
  model           text,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade
);
create index on public.ai_replies (organization_id, created_at desc);
create index on public.ai_replies (contact_id, created_at desc);
alter table public.ai_replies enable row level security;
create policy ai_replies_read on public.ai_replies for select to authenticated using (app.has_permission(organization_id, 'crm.read_all'));
grant select on public.ai_replies to authenticated;
grant all on public.ai_replies to service_role;

alter table public.ai_usage_log drop constraint if exists ai_usage_log_purpose_check;
alter table public.ai_usage_log add constraint ai_usage_log_purpose_check
  check (purpose in ('bill_extraction', 'follow_up_draft', 'meeting_brief', 'summary', 'auto_reply', 'other'));

create or replace function public.enqueue_scheduled_runs(p_today date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  d record; e record; st jsonb;
  v_summary jsonb; v_new integer := 0; v_id uuid; v_items jsonb; v_next jsonb; v_acct uuid;
  v_keys text[] := array['daily_summary', 'rent_overdue_escalation', 'bill_ocr_review',
                         'payment_reminders', 'sequence_sends', 'social_publish', 'voice_calls', 'reddit_listen', 'apollo_search'];
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
      if e.consent_basis <> 'none' and ((st ->> 'channel' = 'email' and e.email is not null) or (st ->> 'channel' = 'whatsapp' and e.phone_e164 is not null and e.consent_basis = 'consent')) then
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
      v_summary := jsonb_build_object('company', (select name from public.organizations where id = d.organization_id), 'date', p_today, 'sends', v_items,
        'booking_url', (select g.booking_url from public.growth_settings g where g.organization_id = d.organization_id));
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
        'calling_window', '09:00-21:00 Asia/Kolkata', 'calls', v_items,
        'booking_url', (select g.booking_url from public.growth_settings g where g.organization_id = d.organization_id));
    elsif d.template_key = 'reddit_listen' then
      select coalesce(jsonb_agg(jsonb_build_object('keyword', k.keyword, 'subreddit', k.subreddit)), '[]') into v_items
      from public.listen_keywords k where k.organization_id = d.organization_id and k.active;
      if jsonb_array_length(v_items) = 0 then continue; end if;
      v_summary := jsonb_build_object('company', (select name from public.organizations where id = d.organization_id), 'date', p_today, 'keywords', v_items);
    elsif d.template_key = 'apollo_search' then
      select coalesce(jsonb_agg(jsonb_build_object('search_id', s.id, 'name', s.name, 'titles', s.titles, 'locations', s.locations,
             'keywords', s.keywords, 'employee_ranges', s.employee_ranges, 'per_run', s.per_run)), '[]') into v_items
      from public.lead_searches s where s.organization_id = d.organization_id and s.provider = 'apollo' and s.active;
      if jsonb_array_length(v_items) = 0 then continue; end if;
      v_summary := jsonb_build_object('company', (select name from public.organizations where id = d.organization_id), 'date', p_today,
        'only_verified_emails', true, 'searches', v_items);
    end if;
    if v_summary is null then continue; end if;

    insert into public.automation_runs (organization_id, definition_id, idempotency_key, trigger_source, status, is_mock, payload_summary, requested_by)
    values (d.organization_id, d.id, d.template_key || ':' || p_today, 'schedule',
            case when d.requires_approval and not (d.template_key = 'sequence_sends' and not exists (
              select 1 from pg_temp.sends s join public.outreach_enrollments en on en.id = (s.item ->> 'enrollment_id')::uuid
              join public.outreach_sequences q on q.id = en.sequence_id
              where s.organization_id = d.organization_id and q.approved_at is null))
                 then 'pending_approval' else 'queued' end, false, v_summary, null)
    on conflict (organization_id, idempotency_key) do nothing
    returning id into v_id;
    if v_id is not null then v_new := v_new + 1; v_id := null; end if;
  end loop;
  return v_new;
end $$;

revoke execute on function public.enqueue_scheduled_runs(date) from public, anon, authenticated;
grant execute on function public.enqueue_scheduled_runs(date) to service_role;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
