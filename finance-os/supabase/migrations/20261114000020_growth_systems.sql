-- Growth systems for every company: channel connections, assisted social steps (LinkedIn,
-- Facebook, Instagram, Reddit), a content calendar with approval, Reddit listening, AI voice
-- calls that always disclose they are AI, sequence stepping (email and WhatsApp sends go to
-- n8n; platform steps become tasks), invoices from won deals, and payment reminders.
--
-- Additive: new columns are nullable, new tables are empty, and enqueue_scheduled_runs keeps
-- every earlier branch.

-- 1. Social handles on leads ------------------------------------------------------------------
alter table public.contacts
  add column linkedin_url text check (linkedin_url is null or linkedin_url ~* '^https://([a-z]+\.)?linkedin\.com/'),
  add column facebook_url text check (facebook_url is null or facebook_url ~* '^https://([a-z]+\.)?facebook\.com/'),
  add column instagram_handle text check (instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'),
  add column reddit_username text check (reddit_username is null or reddit_username ~ '^[A-Za-z0-9_-]{3,20}$');

-- 2. Which channel accounts each company has connected (status only; secrets live in n8n) ------
create table public.channel_accounts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel         text not null check (channel in ('email', 'whatsapp', 'linkedin', 'facebook', 'instagram', 'reddit', 'meta_ads', 'voice')),
  status          text not null default 'not_connected' check (status in ('not_connected', 'connected', 'needs_attention')),
  display_name    text check (display_name is null or length(display_name) <= 120),
  connected_at    timestamptz,
  updated_at      timestamptz not null default now(),
  unique (organization_id, channel)
);
alter table public.channel_accounts enable row level security;
create policy channel_accounts_read on public.channel_accounts for select to authenticated
  using (app.has_permission(organization_id, 'crm.write') or app.has_permission(organization_id, 'company.settings'));
create policy channel_accounts_write on public.channel_accounts for all to authenticated
  using (app.has_permission(organization_id, 'company.settings')) with check (app.has_permission(organization_id, 'company.settings'));

-- 3. Assisted steps: the OS plans and drafts, a person sends (platform rules) ----------------
create table public.outreach_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id      uuid,
  enrollment_id   uuid references public.outreach_enrollments (id) on delete set null,
  channel         text not null check (channel in ('linkedin', 'facebook', 'instagram', 'reddit', 'email', 'whatsapp', 'call')),
  step            text not null check (step in ('follow', 'comment', 'connect', 'message', 'follow_up', 'reply', 'call')),
  due_on          date not null,
  target_url      text check (target_url is null or target_url ~* '^https://'),
  draft           text check (draft is null or length(draft) <= 3000),
  status          text not null default 'open' check (status in ('open', 'done', 'skipped', 'replied')),
  assignee_id     uuid references public.users (id) on delete set null,
  done_at         timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade
);
create index on public.outreach_tasks (organization_id, status, due_on);
alter table public.outreach_tasks enable row level security;
create policy outreach_tasks_all on public.outreach_tasks for all to authenticated
  using (app.has_permission(organization_id, 'crm.write')) with check (app.has_permission(organization_id, 'crm.write'));

-- 4. Content calendar: posts publish only after approval ------------------------------------
create table public.content_posts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel         text not null check (channel in ('linkedin', 'facebook', 'instagram')),
  body            text not null check (length(trim(body)) between 1 and 3000),
  media_url       text check (media_url is null or media_url ~* '^https://'),
  scheduled_at    timestamptz not null,
  status          text not null default 'draft' check (status in ('draft', 'approved', 'published', 'failed', 'cancelled')),
  approved_by     uuid references public.users (id) on delete set null,
  approved_at     timestamptz,
  published_at    timestamptz,
  external_url    text,
  error           text,
  created_by      uuid default auth.uid() references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (channel <> 'instagram' or media_url is not null or status in ('draft', 'cancelled'))
);
alter table public.content_posts enable row level security;
create policy content_posts_read on public.content_posts for select to authenticated using (app.has_permission(organization_id, 'crm.write'));
create policy content_posts_insert on public.content_posts for insert to authenticated
  with check (app.has_permission(organization_id, 'crm.write') and status = 'draft');
create policy content_posts_update on public.content_posts for update to authenticated
  using (app.has_permission(organization_id, 'crm.write')) with check (app.has_permission(organization_id, 'crm.write'));

create or replace function app.guard_content_post() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    if new.status = 'approved' and coalesce(current_setting('app.post_rpc', true), 'off') <> 'on' then
      raise exception 'Use approve_post to approve a post' using errcode = 'insufficient_privilege';
    end if;
    if new.status in ('published', 'failed') then
      raise exception 'Only the publisher records a post as published or failed' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if old.status in ('approved', 'published') and (new.body is distinct from old.body or new.media_url is distinct from old.media_url)
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'An approved post cannot be edited; cancel it and draft a new one' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger content_posts_guard before update on public.content_posts for each row execute function app.guard_content_post();

create or replace function public.approve_post(p_post uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare p public.content_posts;
begin
  select * into p from public.content_posts where id = p_post;
  if p.id is null or not app.has_permission(p.organization_id, 'automation.approve') then
    raise exception 'Only an approver can approve posts' using errcode = 'insufficient_privilege';
  end if;
  if p.status <> 'draft' then raise exception 'Only a draft can be approved' using errcode = 'check_violation'; end if;
  perform set_config('app.post_rpc', 'on', true);
  update public.content_posts set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_post;
  perform set_config('app.post_rpc', 'off', true);
end $$;

-- 5. Listening: Reddit keywords and the conversations found ---------------------------------
create table public.listen_keywords (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel         text not null default 'reddit' check (channel in ('reddit')),
  keyword         text not null check (length(trim(keyword)) between 2 and 80),
  subreddit       text check (subreddit is null or subreddit ~ '^[A-Za-z0-9_]{2,21}$'),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create unique index listen_keywords_unique on public.listen_keywords (organization_id, channel, lower(keyword), coalesce(lower(subreddit), ''));
alter table public.listen_keywords enable row level security;
create policy listen_keywords_all on public.listen_keywords for all to authenticated
  using (app.has_permission(organization_id, 'crm.write')) with check (app.has_permission(organization_id, 'crm.write'));

create table public.social_signals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel         text not null check (channel in ('reddit', 'facebook', 'instagram', 'linkedin')),
  kind            text not null default 'post' check (kind in ('post', 'comment', 'message')),
  source_url      text not null check (source_url ~* '^https://'),
  author          text check (author is null or length(author) <= 120),
  title           text check (title is null or length(title) <= 500),
  snippet         text check (snippet is null or length(snippet) <= 4000),
  matched_keyword text,
  status          text not null default 'new' check (status in ('new', 'drafted', 'replied', 'ignored', 'converted')),
  draft_reply     text check (draft_reply is null or length(draft_reply) <= 3000),
  contact_id      uuid,
  created_at      timestamptz not null default now(),
  unique (organization_id, source_url),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete set null
);
alter table public.social_signals enable row level security;
create policy social_signals_read on public.social_signals for select to authenticated using (app.has_permission(organization_id, 'crm.write'));
create policy social_signals_update on public.social_signals for update to authenticated
  using (app.has_permission(organization_id, 'crm.write')) with check (app.has_permission(organization_id, 'crm.write'));

-- 6. AI voice calls. Every call discloses that it is an AI; the column cannot be false. -------
create table public.voice_calls (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id      uuid not null,
  purpose         text not null check (purpose in ('qualify', 'follow_up', 'payment_reminder', 'meeting_reminder')),
  status          text not null default 'queued' check (status in ('queued', 'calling', 'completed', 'failed', 'no_answer', 'cancelled')),
  ai_disclosed    boolean not null default true check (ai_disclosed),
  outcome         text check (outcome is null or outcome in ('interested', 'not_interested', 'callback', 'meeting_booked', 'wrong_number', 'do_not_call')),
  summary         text check (summary is null or length(summary) <= 4000),
  recording_url   text check (recording_url is null or recording_url ~* '^https://'),
  scheduled_for   timestamptz not null default now(),
  started_at      timestamptz,
  ended_at        timestamptz,
  requested_by    uuid default auth.uid() references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete cascade
);
create index on public.voice_calls (organization_id, status, scheduled_for);
alter table public.voice_calls enable row level security;
create policy voice_calls_read on public.voice_calls for select to authenticated using (app.has_permission(organization_id, 'crm.write'));
create policy voice_calls_cancel on public.voice_calls for update to authenticated
  using (app.has_permission(organization_id, 'crm.write') and status = 'queued') with check (status = 'cancelled');

/** Queues an AI call only for a lead who may be called: lawful basis, not do-not-contact, not suppressed. */
create or replace function public.queue_voice_call(p_contact uuid, p_purpose text)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare c public.contacts; v_id uuid;
begin
  select * into c from public.contacts where id = p_contact;
  if c.id is null or not app.has_permission(c.organization_id, 'crm.write') then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if c.do_not_contact then raise exception 'This lead asked not to be contacted' using errcode = 'check_violation'; end if;
  if c.consent_basis = 'none' then raise exception 'No lawful basis recorded for calling this lead' using errcode = 'check_violation'; end if;
  if c.phone_e164 is null then raise exception 'This lead has no phone number' using errcode = 'check_violation'; end if;
  if app.is_suppressed(c.organization_id, null, c.phone_e164) then raise exception 'This number is on the do-not-contact list' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.organizations where id = c.organization_id and emergency_stop) then
    raise exception 'Emergency stop is on for this company' using errcode = 'check_violation';
  end if;
  insert into public.voice_calls (organization_id, contact_id, purpose) values (c.organization_id, c.id, p_purpose) returning id into v_id;
  return v_id;
end $$;

-- 7. Invoices from won deals ----------------------------------------------------------------
alter table public.deals add column invoice_id uuid;

/**
 * Raises an invoice for a won deal: finds or creates the client from the account name, numbers
 * the invoice per company and financial year, and links it to the deal. The GST rate is chosen
 * by the person (the OS never decides tax treatment).
 */
create or replace function public.invoice_from_deal(p_deal uuid, p_tax_rate_bp integer, p_due_days integer, p_description text)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  d public.deals; o public.organizations; v_client uuid; v_inv uuid; v_name text; v_tax bigint; v_no text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_fy int;
begin
  select * into d from public.deals where id = p_deal;
  if d.id is null or not app.can_write(d.organization_id) then raise exception 'Only finance can raise invoices' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.pipeline_stages s where s.id = d.stage_id and s.kind = 'won') then
    raise exception 'Only a won deal can be invoiced' using errcode = 'check_violation';
  end if;
  if d.invoice_id is not null then raise exception 'This deal already has an invoice' using errcode = 'unique_violation'; end if;
  if d.value_minor <= 0 then raise exception 'Set the deal value before invoicing' using errcode = 'check_violation'; end if;
  if p_tax_rate_bp not in (0, 500, 1200, 1800, 2800) then raise exception 'Choose a GST rate: 0, 5, 12, 18 or 28%%' using errcode = 'check_violation'; end if;
  if p_due_days not between 0 and 120 then raise exception 'Due in 0 to 120 days' using errcode = 'check_violation'; end if;
  select * into o from public.organizations where id = d.organization_id;
  v_name := coalesce(nullif(trim(d.account_name), ''), d.title);
  select id into v_client from public.clients where organization_id = d.organization_id and lower(legal_name) = lower(v_name) limit 1;
  if v_client is null then
    insert into public.clients (organization_id, client_code, legal_name)
    values (d.organization_id, left(upper(regexp_replace(v_name, '[^A-Za-z0-9]', '', 'g')) || 'X', 10) || '-' || upper(substr(md5(random()::text), 1, 4)), v_name)
    returning id into v_client;
  end if;
  v_fy := case when extract(month from v_today) >= coalesce(o.fy_start_month, 4) then extract(year from v_today)::int else extract(year from v_today)::int - 1 end;
  v_no := upper(coalesce(o.short_name, left(regexp_replace(o.name, '[^A-Za-z0-9]', '', 'g'), 4))) || '/' || v_fy || '-' || lpad(((v_fy + 1) % 100)::text, 2, '0') || '/' ||
          lpad((select count(*) + 1 from public.invoices i where i.organization_id = d.organization_id and i.source_system = 'os')::text, 4, '0');
  v_tax := round(d.value_minor * p_tax_rate_bp / 10000.0);
  insert into public.invoices (organization_id, client_id, source_system, source_channel, invoice_number, invoice_date, due_date, currency, subtotal_minor, tax_minor, total_minor)
  values (d.organization_id, v_client, 'os', 'manual', v_no, v_today, v_today + p_due_days, d.currency, d.value_minor, v_tax, d.value_minor + v_tax)
  returning id into v_inv;
  insert into public.invoice_line_items (organization_id, invoice_id, description, quantity, unit_price_minor, tax_rate_bp, tax_minor, amount_minor)
  values (d.organization_id, v_inv, left(coalesce(nullif(trim(p_description), ''), d.title), 500), 1, d.value_minor, p_tax_rate_bp, v_tax, d.value_minor + v_tax);
  update public.deals set invoice_id = v_inv where id = d.id;
  return v_inv;
end $$;

-- 8. Scheduled work: everything above is queued once a day per company, idempotently ---------
create or replace function public.enqueue_scheduled_runs(p_today date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  d record; e record; st jsonb;
  v_summary jsonb; v_new integer := 0; v_id uuid; v_items jsonb; v_next jsonb;
  v_keys text[] := array['daily_summary', 'rent_overdue_escalation', 'bill_ocr_review',
                         'payment_reminders', 'sequence_sends', 'social_publish', 'voice_calls', 'reddit_listen'];
begin
  -- Sequence stepping first: platform steps become tasks; email/WhatsApp sends are collected below.
  create temp table if not exists pg_temp.sends (organization_id uuid, item jsonb) on commit drop;
  truncate pg_temp.sends;
  for e in
    select en.*, s.steps, c.full_name, c.company_name, c.email, c.phone_e164, c.linkedin_url, c.facebook_url, c.instagram_handle,
           c.do_not_contact, c.consent_basis, c.owner_id
    from public.outreach_enrollments en
    join public.outreach_sequences s on s.id = en.sequence_id and s.status = 'active'
    join public.contacts c on c.id = en.contact_id
    join public.organizations o on o.id = en.organization_id and not o.emergency_stop
    where en.status = 'active' and coalesce(en.next_step_at, now()) <= (p_today + 1)::timestamptz
  loop
    if e.do_not_contact or app.is_suppressed(e.organization_id, e.email, e.phone_e164) then
      update public.outreach_enrollments set status = 'stopped_suppressed' where id = e.id; continue;
    end if;
    st := e.steps -> e.current_step;
    if st is null then update public.outreach_enrollments set status = 'completed' where id = e.id; continue; end if;
    if st ->> 'channel' in ('email', 'whatsapp') then
      if e.consent_basis <> 'none' and ((st ->> 'channel' = 'email' and e.email is not null) or (st ->> 'channel' = 'whatsapp' and e.phone_e164 is not null)) then
        insert into pg_temp.sends values (e.organization_id, jsonb_build_object('enrollment_id', e.id, 'channel', st ->> 'channel',
          'to', case when st ->> 'channel' = 'email' then e.email else e.phone_e164 end, 'name', e.full_name, 'company', e.company_name,
          'template', st ->> 'template', 'step', e.current_step));
      end if;
    else
      insert into public.outreach_tasks (organization_id, contact_id, enrollment_id, channel, step, due_on, target_url, draft, assignee_id)
      values (e.organization_id, e.contact_id, e.id,
        case when st ->> 'channel' in ('linkedin', 'linkedin_task') then 'linkedin' when st ->> 'channel' = 'call_task' then 'call' else coalesce(st ->> 'channel', 'linkedin') end,
        coalesce(st ->> 'action', case when st ->> 'channel' = 'call_task' then 'call' else 'message' end), p_today,
        case when st ->> 'channel' in ('linkedin', 'linkedin_task') then e.linkedin_url when st ->> 'channel' = 'facebook' then e.facebook_url
             when st ->> 'channel' = 'instagram' and e.instagram_handle is not null then 'https://instagram.com/' || e.instagram_handle end,
        replace(replace(coalesce(st ->> 'template', ''), '{{first_name}}', split_part(e.full_name, ' ', 1)), '{{company}}', coalesce(e.company_name, '')),
        e.owner_id);
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
      select coalesce(jsonb_agg(jsonb_build_object('post_id', p.id, 'channel', p.channel, 'body', p.body, 'media_url', p.media_url, 'scheduled_at', p.scheduled_at)), '[]') into v_items
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

revoke all on function public.approve_post(uuid), public.queue_voice_call(uuid, text), public.invoice_from_deal(uuid, integer, integer, text) from public, anon;
grant execute on function public.approve_post(uuid), public.queue_voice_call(uuid, text), public.invoice_from_deal(uuid, integer, integer, text) to authenticated;
grant select, insert, update, delete on public.channel_accounts, public.outreach_tasks, public.content_posts, public.listen_keywords to authenticated;
grant select, update on public.social_signals, public.voice_calls to authenticated;
grant all on public.channel_accounts, public.outreach_tasks, public.content_posts, public.listen_keywords, public.social_signals, public.voice_calls to service_role;

do $$
declare t text;
begin
  foreach t in array array['channel_accounts', 'outreach_tasks', 'content_posts', 'listen_keywords', 'social_signals', 'voice_calls'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()', t || '_audit', t);
  end loop;
end $$;
