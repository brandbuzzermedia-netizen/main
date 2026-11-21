begin;
\ir 00_helpers.sql.inc
-- a owner · c sales rep (works on the client's deal)
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated, service_role;
alter table t add column org uuid, add column deal uuid, add column inv uuid, add column hold uuid;
update t set org = public.create_company(grp, jsonb_build_object('name', 'GBS', 'slug', 'gbs-holds', 'short_name', 'GBS',
  'stages', jsonb_build_array(jsonb_build_object('name', 'Lead', 'kind', 'open'), jsonb_build_object('name', 'Won', 'kind', 'won', 'probability_pct', 100))));
select pg_temp.assert((select hold_after_days from public.payment_rules where organization_id = (select org from t)) = 15, 'new companies get default rules');
insert into public.memberships (organization_id, user_id, role) select org, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t;
insert into public.deals (organization_id, title, account_name, stage_id, value_minor, owner_id)
select org, 'Retainer', 'Late Payer Ltd', (select id from public.pipeline_stages where kind = 'won' and organization_id = t.org), 1000000, '00000000-0000-0000-0000-00000000000c'::uuid from t;
update t set deal = (select id from public.deals);
update t set inv = public.invoice_from_deal((select deal from t), 0, 0, null);
select pg_temp.assert((select client_id from public.deals) is not null, 'invoicing links the client to the deal');
-- Make the invoice 20 days old for the test.
update public.invoices set invoice_date = current_date - 20, due_date = current_date - 20 where id = (select inv from t);
select pg_temp.logout();

set local role service_role;
select pg_temp.assert(public.evaluate_payment_holds(current_date) = 1, 'hold created after 15 days overdue');
select pg_temp.assert(public.evaluate_payment_holds(current_date) = 0, 'no duplicate hold');
reset role;
select pg_temp.assert((select count(*) from public.tasks where title like 'STOP WORK: Late Payer Ltd%' and assignee_id = '00000000-0000-0000-0000-00000000000c') = 1, 'the person on the deal gets a STOP WORK task');

-- The whole team can see the hold; new work on the client is refused.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.work_holds where status = 'active') = 1, 'sales rep sees the hold');
select pg_temp.assert_raises($$insert into public.tasks (organization_id, title, deal_id) select org, 'More work', deal from t$$, 'on hold', 'new task on the client is refused');
select pg_temp.assert_raises($$select public.release_work_hold((select id from public.work_holds), 'please', null)$$, 'owner or approver', 'a sales rep cannot release');
select pg_temp.logout();

-- Paying lifts the hold and tells the team to resume.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.record_payment((select org from t),
  jsonb_build_object('client_id', (select client_id from public.invoices where id = (select inv from t)), 'transaction_reference', 'UTR 1', 'payment_date', current_date,
    'amount_minor', 1000000, 'method', 'neft', 'verified', true, 'verification_note', 'Seen in bank statement'),
  jsonb_build_array(jsonb_build_object('invoice_id', (select inv from t), 'amount_minor', 1000000)));
select pg_temp.logout();
select pg_temp.assert((select status from public.work_holds) = 'released', 'paid: hold released automatically');
select pg_temp.assert(exists (select 1 from public.tasks where title = 'Resume work: Late Payer Ltd has paid'), 'team told to resume');
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
insert into public.tasks (organization_id, title, deal_id) select org, 'Next deliverable', deal from t;
select pg_temp.logout();

-- Owner override: a second late invoice; give time until a date; no new hold before then.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.deals (organization_id, title, account_name, stage_id, value_minor)
select org, 'Phase 2', 'Late Payer Ltd', (select id from public.pipeline_stages where kind = 'won' and organization_id = t.org), 500000 from t;
update t set inv = public.invoice_from_deal((select id from public.deals where title = 'Phase 2'), 0, 0, null);
update public.invoices set invoice_date = current_date - 20, due_date = current_date - 20 where id = (select inv from t);
select pg_temp.logout();
set local role service_role;
select public.evaluate_payment_holds(current_date);
reset role;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.release_work_hold((select id from public.work_holds where status = 'active'), 'Client promised payment Friday', current_date + 5);
select pg_temp.logout();
set local role service_role;
select pg_temp.assert(public.evaluate_payment_holds(current_date + 1) = 0, 'no hold during the extra time');
select pg_temp.assert(public.evaluate_payment_holds(current_date + 6) = 1, 'hold returns after the extra time');
reset role;

-- Warning day: the team hears before work stops.
select pg_temp.assert(exists (select 1 from public.payment_rules where warn_after_days = 3), 'warning after 3 days by default');
rollback;
