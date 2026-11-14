begin;
\ir 00_helpers.sql.inc
-- a owner · c sales rep
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated, service_role;
alter table t add column org uuid;
update t set org = public.create_company(grp, '{"name":"GBS","slug":"gbs-leads"}');
insert into public.memberships (organization_id, user_id, role) select org, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t;

-- Saved Apollo searches: managers only, and they need something to search for.
select pg_temp.assert_raises($$insert into public.lead_searches (organization_id, name) select org, 'Empty' from t$$, 'check', 'a search needs titles, locations or keywords');
insert into public.lead_searches (organization_id, name, titles, locations) select org, 'Clinic owners', '{Owner}', '{Bengaluru}' from t;
insert into public.lead_searches (organization_id, name, keywords, active) select org, 'Paused one', 'dental', false from t;

-- WhatsApp only for leads who consented; bought (legitimate interest) leads get email only.
insert into public.sender_accounts (organization_id, channel, kind, label, address, account_key, daily_limit) select org, 'whatsapp', 'business_number', 'WA', '+919800000001', 'WA_1', 100 from t;
insert into public.contacts (organization_id, full_name, phone_e164, consent_basis, consent_at) select org, 'Opted in', '+919800000011', 'consent', now() from t;
insert into public.contacts (organization_id, full_name, phone_e164, consent_basis, consent_at) select org, 'Bought', '+919800000012', 'legitimate_interest', now() from t;
insert into public.outreach_sequences (organization_id, name, status, steps) select org, 'WA', 'active', '[{"channel":"whatsapp","delay_days":0,"template":"hello"}]'::jsonb from t;
insert into public.outreach_enrollments (organization_id, sequence_id, contact_id, next_step_at) select c.organization_id, s.id, c.id, now() - interval '1 hour' from public.contacts c, public.outreach_sequences s;
insert into public.automation_definitions (organization_id, template_key, name, trigger_kind, enabled, requires_approval, is_financial, idempotent)
  select org, k, k, 'schedule', true, false, false, true from t, unnest(array['sequence_sends', 'apollo_search']) k;
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert_raises($$insert into public.lead_searches (organization_id, name, keywords) select org, 'Rep', 'x' from t$$, null, 'a sales rep cannot add Apollo searches');
select pg_temp.assert((select count(*) from public.lead_searches) = 2, 'a sales rep can see the searches');
select pg_temp.logout();

set local role service_role;
select public.enqueue_scheduled_runs(current_date);
reset role;
select pg_temp.assert((select count(*) from (select jsonb_array_elements(payload_summary -> 'sends') i from public.automation_runs where idempotency_key like 'sequence_sends:%') x) = 1, 'one WhatsApp send');
select pg_temp.assert((select (jsonb_array_elements(payload_summary -> 'sends') ->> 'to') from public.automation_runs where idempotency_key like 'sequence_sends:%') = '+919800000011', 'only to the lead who opted in');
select pg_temp.assert((select jsonb_array_length(payload_summary -> 'searches') from public.automation_runs where idempotency_key like 'apollo_search:%') = 1, 'active Apollo searches are queued');
select pg_temp.assert((select (payload_summary ->> 'only_verified_emails')::boolean from public.automation_runs where idempotency_key like 'apollo_search:%'), 'run asks for verified emails only');
rollback;
