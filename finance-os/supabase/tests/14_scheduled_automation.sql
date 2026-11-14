begin;
\ir 00_helpers.sql.inc
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated;
alter table t add column org uuid, add column ent uuid, add column salon uuid, add column ten uuid, add column other uuid;
update t set org = public.create_company(grp, '{"name":"Holdings","slug":"holdings"}');
update t set other = public.create_company(grp, '{"name":"Stopped Co","slug":"stopped"}');
update t set ent = (select id from public.legal_entities where organization_id = t.org);
insert into public.rental_units (organization_id, legal_entity_id, label) select org, ent, 'Salon' from t;
update t set salon = (select id from public.rental_units where label = 'Salon');
insert into public.tenants (organization_id, name) select org, 'Demo tenant' from t;
update t set ten = (select id from public.tenants);
insert into public.leases (organization_id, unit_id, tenant_id, start_date, rent_minor, due_day) select org, salon, ten, '2026-09-01', 5000000, 5 from t;
select public.generate_rent_charges((select org from t), '2026-11-30');
insert into public.automation_definitions (organization_id, template_key, name, trigger_kind, enabled, requires_approval, is_financial, idempotent)
select org, k, k, 'schedule', true, false, false, true from t, unnest(array['daily_summary', 'rent_overdue_escalation', 'bill_ocr_review']) k;
insert into public.automation_definitions (organization_id, template_key, name, trigger_kind, enabled, requires_approval, is_financial, idempotent)
select other, 'daily_summary', 'daily', 'schedule', true, false, false, true from t;
select public.set_emergency_stop((select other from t), true, 'Testing the stop');
select pg_temp.logout();

-- Only the service role (cron dispatcher) may queue scheduled runs.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert_raises($$select public.enqueue_scheduled_runs('2026-11-13')$$, 'permission denied', 'signed-in users cannot queue scheduled runs');
select pg_temp.logout();

set local role service_role;
select pg_temp.assert(public.enqueue_scheduled_runs('2026-11-13') = 2, 'daily summary + rent overdue queued; no bills, so no OCR reminder; stopped company skipped');
select pg_temp.assert(public.enqueue_scheduled_runs('2026-11-13') = 0, 'running again the same day queues nothing');
reset role;

select pg_temp.assert((select count(*) from public.automation_runs where organization_id = (select other from t)) = 0, 'emergency-stopped company gets no runs');
select pg_temp.assert((select bool_and(workflow_path = 'dp-' || replace(split_part(idempotency_key, ':', 1), '_', '-')) from public.automation_runs), 'each run routes to its template webhook');
select pg_temp.assert((select bool_and(status = 'queued' and not is_mock) from public.automation_runs), 'runs are real and queued');
select pg_temp.assert((select jsonb_array_length(payload_summary -> 'overdue') from public.automation_runs where idempotency_key like 'rent_overdue%') = 3,
  'Sep, Oct and Nov rent are overdue on 13 Nov');
select pg_temp.assert((select (payload_summary ->> 'open_deals')::int from public.automation_runs where idempotency_key like 'daily_summary%') = 0, 'summary counts real records');
select pg_temp.assert((select count(*) from public.tasks where title like 'Rent overdue: Salon%') = 3, 'one escalation task per overdue charge');

set local role service_role;
select public.enqueue_scheduled_runs('2026-11-14');
reset role;
select pg_temp.assert((select count(*) from public.tasks where title like 'Rent overdue: Salon%') = 3, 'no duplicate escalation tasks next day');
select pg_temp.assert((select count(*) from public.automation_runs where idempotency_key like 'daily_summary%') = 2, 'one summary per day');

-- Manually requested runs also get their webhook path.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.request_automation_run((select id from public.automation_definitions where template_key = 'bill_ocr_review' and organization_id = (select org from t)), 'manual-run-0001', 'manual');
select pg_temp.logout();
select pg_temp.assert((select workflow_path from public.automation_runs where idempotency_key = 'manual-run-0001') = 'dp-bill-ocr-review', 'manual run routed too');
rollback;
