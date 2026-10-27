-- Acquire: properties (listings and videos), lead–property interest, and public lead forms.
--
-- Rules guaranteed here (tested in supabase/tests/05_properties_forms.sql):
--   * A shared property link records a view once per share and logs it on the lead's timeline.
--   * Form submissions are rate-limited per form and per IP hash.
--   * Consent from a form keeps the exact wording shown, its version hash and the submission id.

alter type public.activity_kind add value if not exists 'property';

-- ---------------------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------------------
create table public.properties (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title           text not null check (length(trim(title)) between 1 and 200),
  reference       text check (reference is null or length(reference) <= 60),
  address         text,
  city            text,
  country         char(2) check (country is null or country ~ '^[A-Z]{2}$'),
  property_type   text,
  listing_type    text not null default 'sale' check (listing_type in ('sale', 'rent', 'off_plan')),
  price_minor     bigint check (price_minor is null or price_minor >= 0),
  currency        char(3) not null,
  bedrooms        smallint check (bedrooms is null or bedrooms between 0 and 50),
  bathrooms       smallint check (bathrooms is null or bathrooms between 0 and 50),
  area_sqm        numeric(10, 2) check (area_sqm is null or area_sqm > 0),
  status          text not null default 'available' check (status in ('draft', 'available', 'under_offer', 'sold', 'let', 'withdrawn')),
  description     text check (description is null or length(description) <= 10000),
  listing_url     text check (listing_url is null or listing_url ~ '^https://'),
  video_url       text check (video_url is null or video_url ~ '^https://'),
  image_url       text check (image_url is null or image_url ~ '^https://'),
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id)
);
create index on public.properties (organization_id, status);
create unique index properties_reference_unique on public.properties (organization_id, lower(reference)) where reference is not null;

create table public.lead_property_interests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lead_id         uuid not null,
  property_id     uuid not null,
  status          text not null default 'shared' check (status in ('suggested', 'shared', 'viewed', 'interested', 'not_interested')),
  shared_at       timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at  timestamptz,
  view_count      integer not null default 0,
  message_id      uuid references public.messages (id) on delete set null,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, lead_id) references public.leads (organization_id, id) on delete cascade,
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete cascade,
  unique (lead_id, property_id)
);
create index on public.lead_property_interests (property_id);

-- Called (service role) when a lead opens a shared property link.
create or replace function public.record_property_view(p_org uuid, p_lead uuid, p_property uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_first boolean;
  v_title text;
begin
  update public.lead_property_interests set
    view_count = view_count + 1,
    last_viewed_at = now(),
    first_viewed_at = coalesce(first_viewed_at, now()),
    status = case when status in ('suggested', 'shared') then 'viewed' else status end
  where organization_id = p_org and lead_id = p_lead and property_id = p_property
  returning view_count = 1 into v_first;
  if v_first then
    select title into v_title from public.properties where id = p_property;
    insert into public.lead_activities (organization_id, lead_id, kind, summary, data)
    values (p_org, p_lead, 'property', format('Opened the property link: %s', v_title), jsonb_build_object('property_id', p_property));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Public lead forms
-- ---------------------------------------------------------------------------
create table public.lead_forms (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 80),
  -- Public identifier used in the form URL; not a secret, but unguessable.
  public_key      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  source_id       uuid,
  headline        text not null default 'Tell us what you are looking for',
  intro           text,
  segment         public.lead_segment not null default 'buyer',
  ask_budget      boolean not null default true,
  ask_location    boolean not null default true,
  -- Exact consent wording shown next to each checkbox. Null = channel not offered.
  consent_email   text,
  consent_sms     text,
  consent_call    text,
  privacy_url     text check (privacy_url is null or privacy_url ~ '^https://'),
  thank_you       text not null default 'Thank you. We will be in touch shortly.',
  assign_to       uuid references public.users (id) on delete set null,
  is_active       boolean not null default true,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, source_id) references public.lead_sources (organization_id, id) on delete set null (source_id)
);

create table public.lead_form_submissions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  form_id         uuid not null references public.lead_forms (id) on delete cascade,
  lead_id         uuid,
  outcome         text not null check (outcome in ('created', 'updated', 'suppressed', 'rejected', 'rate_limited', 'spam')),
  -- SHA-256 of IP + daily salt: enough for rate limiting, not a stored IP address.
  ip_hash         text,
  user_agent      text,
  payload         jsonb,
  created_at      timestamptz not null default now()
);
create index on public.lead_form_submissions (form_id, created_at desc);
create index on public.lead_form_submissions (form_id, ip_hash, created_at desc);

create or replace function app.form_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_member(new.organization_id, new.assign_to, 'form assignee');
  return new;
end $$;
create trigger form_before_write before insert or update of assign_to on public.lead_forms
  for each row execute function app.form_before_write();

do $$
declare t text;
begin
  foreach t in array array['properties', 'lead_property_interests', 'lead_forms'] loop
    execute format('create trigger touch before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
  foreach t in array array['properties', 'lead_forms'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit_row()', t);
  end loop;
  foreach t in array array['properties', 'lead_property_interests', 'lead_forms', 'lead_form_submissions'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

grant select, insert, update, delete on public.properties, public.lead_property_interests, public.lead_forms to authenticated;
grant select on public.lead_form_submissions to authenticated;
grant all on public.properties, public.lead_property_interests, public.lead_forms, public.lead_form_submissions to service_role;
revoke all on public.properties, public.lead_property_interests, public.lead_forms, public.lead_form_submissions from anon;

create policy properties_read on public.properties for select to authenticated using (app.is_member(organization_id));
create policy properties_write on public.properties for all to authenticated
  using (app.is_manager(organization_id)) with check (app.is_manager(organization_id));

create policy interests_read on public.lead_property_interests for select to authenticated
  using (app.can_read_lead(organization_id, lead_id));
create policy interests_write on public.lead_property_interests for all to authenticated
  using (app.can_write_lead(organization_id, lead_id)) with check (app.can_write_lead(organization_id, lead_id));

create policy forms_read on public.lead_forms for select to authenticated using (app.is_member(organization_id));
create policy forms_write on public.lead_forms for all to authenticated
  using (app.is_manager(organization_id)) with check (app.is_manager(organization_id));

create policy submissions_read on public.lead_form_submissions for select to authenticated using (app.is_manager(organization_id));

-- ---------------------------------------------------------------------------
-- submit_lead_form: the whole public submission in one transaction (service role only).
-- p_data: { full_name, email, phone_e164, country, timezone, message, budget_max_minor, currency,
--           preferred_location, consent: [{ channel, text }] }  (validated by the app)
-- ---------------------------------------------------------------------------
create or replace function public.submit_lead_form(
  p_key text, p_data jsonb, p_ip_hash text, p_user_agent text, p_ip_limit integer default 5, p_form_limit integer default 200
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_form    public.lead_forms;
  v_lead    uuid;
  v_stage   uuid;
  v_email   text := nullif(lower(trim(p_data ->> 'email')), '');
  v_phone   text := nullif(p_data ->> 'phone_e164', '');
  v_sub     uuid;
  v_outcome text;
  v_supp    boolean;
  v_c       jsonb;
begin
  select * into v_form from public.lead_forms where public_key = p_key and is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'form_not_found');
  end if;
  if (select count(*) from public.lead_form_submissions where form_id = v_form.id and ip_hash = p_ip_hash and created_at > now() - interval '10 minutes') >= p_ip_limit
     or (select count(*) from public.lead_form_submissions where form_id = v_form.id and created_at > now() - interval '1 hour') >= p_form_limit then
    insert into public.lead_form_submissions (organization_id, form_id, outcome, ip_hash, user_agent)
    values (v_form.organization_id, v_form.id, 'rate_limited', p_ip_hash, left(p_user_agent, 300));
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  v_supp := exists (select 1 from public.suppression_entries s where s.organization_id = v_form.organization_id and s.channel is null
                    and ((s.value_type = 'email' and s.value = v_email) or (s.value_type = 'phone' and s.value = v_phone)));
  select id into v_lead from public.leads where organization_id = v_form.organization_id
    and ((v_email is not null and email_normalized = v_email) or (v_phone is not null and phone_e164 = v_phone))
    order by (email_normalized = v_email) desc nulls last limit 1;

  if v_lead is null then
    select id into v_stage from public.pipeline_stages where organization_id = v_form.organization_id and key = 'new';
    insert into public.leads (organization_id, full_name, email, phone_e164, country, timezone, segment, preferred_location,
                              budget_max_minor, currency, stage_id, owner_id, source_id, notes)
    values (v_form.organization_id, p_data ->> 'full_name', v_email, v_phone, p_data ->> 'country', p_data ->> 'timezone', v_form.segment,
            nullif(p_data ->> 'preferred_location', ''), (p_data ->> 'budget_max_minor')::bigint,
            case when p_data ->> 'budget_max_minor' is not null then p_data ->> 'currency' end,
            v_stage, v_form.assign_to, v_form.source_id, nullif(p_data ->> 'message', ''))
    returning id into v_lead;
    v_outcome := case when v_supp then 'suppressed' else 'created' end;
  else
    update public.leads set
      email = coalesce(email, v_email), phone_e164 = coalesce(phone_e164, v_phone),
      preferred_location = coalesce(nullif(p_data ->> 'preferred_location', ''), preferred_location)
    where id = v_lead;
    v_outcome := case when v_supp then 'suppressed' else 'updated' end;
  end if;

  insert into public.lead_form_submissions (organization_id, form_id, lead_id, outcome, ip_hash, user_agent, payload)
  values (v_form.organization_id, v_form.id, v_lead, v_outcome, p_ip_hash, left(p_user_agent, 300), p_data - 'consent')
  returning id into v_sub;

  insert into public.lead_activities (organization_id, lead_id, kind, summary, data)
  values (v_form.organization_id, v_lead, 'note',
          left(format('Web form “%s”%s', v_form.name, coalesce(': ' || nullif(p_data ->> 'message', ''), '')), 2000),
          jsonb_build_object('source', 'web_form', 'submission_id', v_sub));

  -- Consent only for boxes the person ticked, only with the wording that was shown, never over a suppression.
  if not v_supp then
    for v_c in select * from jsonb_array_elements(coalesce(p_data -> 'consent', '[]')) loop
      if (v_c ->> 'channel' = 'email' and v_form.consent_email = v_c ->> 'text')
         or (v_c ->> 'channel' = 'sms' and v_form.consent_sms = v_c ->> 'text')
         or (v_c ->> 'channel' in ('phone_call', 'ai_voice_call') and v_form.consent_call = v_c ->> 'text') then
        insert into public.consent_records (organization_id, lead_id, channel, status, basis, source, evidence_url)
        values (v_form.organization_id, v_lead, (v_c ->> 'channel')::public.contact_channel, 'granted', 'express_written',
                left(format('Web form “%s”, submission %s, wording v%s: “%s”', v_form.name, v_sub,
                            left(encode(sha256(convert_to(v_c ->> 'text', 'UTF8')), 'hex'), 8), v_c ->> 'text'), 500), null);
      end if;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'outcome', v_outcome, 'lead_id', v_lead, 'submission_id', v_sub);
end $$;

revoke execute on all functions in schema public from anon, public;
revoke execute on all functions in schema app from anon, public;
grant execute on all functions in schema app to authenticated, service_role;
revoke execute on function public.submit_lead_form(text, jsonb, text, text, integer, integer), public.record_property_view(uuid, uuid, uuid) from authenticated;
grant execute on function public.submit_lead_form(text, jsonb, text, text, integer, integer), public.record_property_view(uuid, uuid, uuid) to service_role;
