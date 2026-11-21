begin;
\ir 00_helpers.sql.inc
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated, service_role;
alter table t add column org uuid;
update t set org = public.create_company(grp, '{"name":"GBS","slug":"gbs-rec"}');
insert into public.contacts (organization_id, full_name, phone_e164, consent_basis, consent_at) select org, 'Caller', '+919800000077', 'legitimate_interest', now() from t;
insert into public.automation_definitions (organization_id, template_key, name, trigger_kind, enabled, requires_approval, is_financial, idempotent) select org, 'voice_calls', 'v', 'schedule', true, false, false, true from t;
insert into public.growth_settings (organization_id, record_calls) select org, true from t;
select pg_temp.logout();
insert into public.voice_calls (organization_id, contact_id, purpose, scheduled_for) select org, (select id from public.contacts), 'qualify', now() - interval '1 hour' from t;
set local role service_role;
select public.enqueue_scheduled_runs(current_date);
reset role;
select pg_temp.assert((select payload_summary ->> 'disclosure' from public.automation_runs where idempotency_key like 'voice_calls:%')
  = 'Hi, this is an AI assistant calling on behalf of GBS. This call is recorded for quality and training.', 'recorded calls say so in the first sentence');
select pg_temp.assert((select (payload_summary ->> 'record_calls')::boolean from public.automation_runs where idempotency_key like 'voice_calls:%'), 'the run carries the recording setting');
update public.growth_settings set record_calls = false;
delete from public.automation_runs;
set local role service_role;
select public.enqueue_scheduled_runs(current_date);
reset role;
select pg_temp.assert((select payload_summary ->> 'disclosure' from public.automation_runs where idempotency_key like 'voice_calls:%')
  = 'Hi, this is an AI assistant calling on behalf of GBS.', 'no recording notice when recording is off');
select pg_temp.assert_raises($$update public.voice_calls set external_id = 'bad id with spaces'$$, 'check', 'conversation ids are validated');
rollback;
