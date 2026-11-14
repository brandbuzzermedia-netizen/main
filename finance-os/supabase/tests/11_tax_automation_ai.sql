begin;
\ir 00_helpers.sql.inc
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b1', 'ca@test');
insert into public.users (id, email) select id, email from auth.users on conflict do nothing;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated;
alter table t add column org uuid, add column ent uuid, add column per uuid, add column def uuid, add column fin uuid;
update t set org = public.create_company(grp, '{"name":"A","slug":"tax-a"}');
update t set ent = (select id from public.legal_entities where organization_id = t.org);
insert into public.memberships (organization_id, user_id, role) select org, '00000000-0000-0000-0000-0000000000b1'::uuid, 'accountant' from t
  union all select org, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t;
insert into public.ledger_entries (organization_id, legal_entity_id, entry_type, category, description, txn_date, amount_minor, status)
select org, ent, 'expense'::public.ledger_type, 'Rent', 'FY26 Q1', '2026-05-10'::date, 100, 'pending_approval'::public.ledger_status from t union all
select org, ent, 'expense', 'Rent', 'FY25', '2025-05-10', 100, 'pending_approval' from t;

-- Filing needs a real acknowledgement through record_filing.
insert into public.tax_periods (organization_id, legal_entity_id, kind, label, period_start, period_end, due_on, accountant_id)
select org, ent, 'gst_monthly', 'GSTR-3B Oct 2026', '2026-10-01', '2026-10-31', '2026-11-20', '00000000-0000-0000-0000-0000000000b1'::uuid from t;
update t set per = (select id from public.tax_periods);
select pg_temp.assert_raises($$update public.tax_periods set status = 'filed', ack_reference = 'AA1234567', filed_on = '2026-11-18', filed_recorded_by = auth.uid()$$,
  'record_filing', 'cannot mark filed by direct update');
select pg_temp.assert_raises($$select public.record_filing((select per from t), 'x', '2026-11-18')$$, 'check constraint', 'a junk acknowledgement is rejected');
select public.record_filing((select per from t), 'AA2910260012345', '2026-11-18');
select pg_temp.assert((select status from public.tax_periods) = 'filed', 'filed with acknowledgement');
select pg_temp.assert_raises($$update public.tax_periods set notes = 'x'$$, 'locked', 'a filed period is locked');
-- Accountant sees only granted entity and period.
insert into public.accountant_grants (organization_id, legal_entity_id, user_id, period_start, period_end)
select org, ent, '00000000-0000-0000-0000-0000000000b1'::uuid, '2026-04-01', '2027-03-31' from t;

-- Automation: disabled, approval, idempotency, retry rules, emergency stop.
insert into public.automation_definitions (organization_id, template_key, name, trigger_kind, enabled, requires_approval, is_financial, idempotent)
select org, 'invoice_overdue_reminder', 'Invoice overdue reminder', 'schedule', false, true, false, true from t;
update t set def = (select id from public.automation_definitions);
select pg_temp.assert_raises($$select public.request_automation_run((select def from t), 'evt-0000001', 'test')$$, 'disabled', 'disabled workflows do not execute');
update public.automation_definitions set enabled = true;
select public.request_automation_run((select def from t), 'evt-0000001', 'test');
select pg_temp.assert((select status from public.automation_runs) = 'pending_approval', 'approval-required run pauses');
select public.request_automation_run((select def from t), 'evt-0000001', 'test');
select pg_temp.assert((select count(*) from public.automation_runs) = 1, 'duplicate event does not run twice');
select public.decide_automation_run((select id from public.automation_runs), true);
select pg_temp.assert((select status from public.automation_runs) = 'queued', 'approved run is queued');
select pg_temp.assert_raises($$insert into public.automation_definitions (organization_id, template_key, name, trigger_kind, requires_approval, is_financial) select org, 'refund', 'Refund', 'manual', false, true from t$$,
  'check constraint', 'financial automations always need approval');
insert into public.automation_definitions (organization_id, template_key, name, trigger_kind, enabled, requires_approval, is_financial, idempotent)
select org, 'record_payment', 'Record payment', 'webhook', true, true, true, false from t;
update t set fin = (select id from public.automation_definitions where template_key = 'record_payment');
select public.request_automation_run((select fin from t), 'pay-0000001', 'test');
select public.decide_automation_run((select id from public.automation_runs where idempotency_key = 'pay-0000001'), true);
select pg_temp.assert_raises($$update public.automation_runs set status = 'failed'$$, 'permission denied', 'users cannot rewrite run status');
select pg_temp.logout();
-- Simulate the service-role callback marking the financial run failed.
update public.automation_runs set status = 'failed', last_error = 'timeout' where idempotency_key = 'pay-0000001';
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert_raises($$select public.retry_automation_run((select id from public.automation_runs where idempotency_key = 'pay-0000001'))$$,
  'not safe to retry', 'non-idempotent financial runs are not blindly retried');
select public.set_emergency_stop((select org from t), true, 'Testing the stop');
select pg_temp.assert_raises($$select public.request_automation_run((select def from t), 'evt-0000002', 'test')$$, 'emergency stop', 'emergency stop blocks runs');
select public.set_emergency_stop((select org from t), false);

-- AI usage and budget.
update public.app_settings set ai_monthly_token_limit = 1000;
insert into public.ai_usage_log (organization_id, purpose, model, input_tokens, output_tokens) select org, 'follow_up_draft', 'claude-opus-5-5', 600, 100 from t;
select pg_temp.assert(public.ai_budget_remaining((select org from t)) = 300, 'budget counts this month''s tokens');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert((select count(*) from public.ledger_entries) = 1, 'accountant reads only the granted period');
select pg_temp.assert((select count(*) from public.tax_periods) = 1, 'accountant reads the assigned period');
select pg_temp.assert((select count(*) from public.automation_runs) = 0, 'accountant sees no automation');
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select public.log_export((select org from t), 'contacts', 3);
select pg_temp.assert_raises(format($$select public.log_export(%L, 'x', 1)$$, gen_random_uuid()), 'not a member', 'cannot log exports for another company');
select pg_temp.assert((select count(*) from public.tax_periods) = 0, 'rep sees no tax data');
select pg_temp.assert(public.ai_budget_remaining((select org from t)) = 300, 'members see the shared budget');
select pg_temp.assert_raises($$select public.request_automation_run((select def from t), 'evt-0000003', 'test')$$, 'not allowed', 'rep cannot trigger automations');
select pg_temp.logout();
select pg_temp.assert((select count(*) from public.audit_logs where action = 'EXPORT') = 1, 'export is audited');
rollback;
