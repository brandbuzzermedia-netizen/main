begin;
\ir 00_helpers.sql.inc
-- a owner · c sales rep
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated, service_role;
alter table t add column org uuid, add column seq uuid, add column lead uuid;
update t set org = public.create_company(grp, jsonb_build_object('name', 'GBS', 'slug', 'gbs-oa', 'short_name', 'GBS',
  'stages', jsonb_build_array(jsonb_build_object('name', 'Lead', 'kind', 'open'), jsonb_build_object('name', 'Won', 'kind', 'won', 'probability_pct', 100))));
insert into public.memberships (organization_id, user_id, role) select org, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t;
insert into public.outreach_sequences (organization_id, name, status, steps) select org, 'Apollo flow', 'active', '[{"channel":"email","delay_days":0,"template":"Hi"}]'::jsonb from t;
update t set seq = (select id from public.outreach_sequences);
insert into public.outreach_source_rules (organization_id, source_match, sequence_id) select org, 'apollo', seq from t;
select pg_temp.logout();

-- A sales rep works a lead: no answer -> follow-up task in 2 days (once).
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
insert into public.contacts (organization_id, full_name, email, company_name, owner_id, source, consent_basis, consent_at)
  select org, 'Asha Rao', 'asha@acme.test', 'Acme', '00000000-0000-0000-0000-00000000000c'::uuid, 'Apollo: clinics', 'legitimate_interest', now() from t;
update t set lead = (select id from public.contacts where full_name = 'Asha Rao');
select pg_temp.assert((select count(*) from public.outreach_enrollments where contact_id = (select lead from t)) = 1, 'Apollo lead joined the Apollo campaign');
insert into public.outreach_events (organization_id, contact_id, kind, outcome) select org, lead, 'call', 'no_answer' from t;
insert into public.outreach_events (organization_id, contact_id, kind, outcome) select org, lead, 'call', 'no_answer' from t;
select pg_temp.assert((select count(*) from public.tasks where title = 'Follow up: Asha Rao (call)') = 1, 'one follow-up task, not two');
select pg_temp.assert((select due_on from public.tasks where title = 'Follow up: Asha Rao (call)') = (now() at time zone 'Asia/Kolkata')::date + 2, 'due in 2 days');
select pg_temp.assert((select assignee_id from public.tasks where title = 'Follow up: Asha Rao (call)') = '00000000-0000-0000-0000-00000000000c', 'assigned to the lead owner');

-- Interested -> deal + meeting task (once); Converted -> client linked to the deal.
update public.contacts set lead_status = 'qualified' where id = (select lead from t);
update public.contacts set lead_status = 'contacted' where id = (select lead from t);
update public.contacts set lead_status = 'qualified' where id = (select lead from t);
select pg_temp.assert((select count(*) from public.deals where title = 'Asha Rao · Acme') = 1, 'one deal for the interested lead');
select pg_temp.assert(exists (select 1 from public.tasks where title = 'Book a meeting: Asha Rao' and priority = 'high'), 'meeting task added');
update public.contacts set lead_status = 'customer' where id = (select lead from t);
select pg_temp.logout();
select pg_temp.assert((select legal_name from public.clients where id = (select auto_client_id from public.contacts where id = (select lead from t))) = 'Acme', 'client created from the company name');
select pg_temp.assert((select client_id from public.deals where title = 'Asha Rao · Acme') = (select auto_client_id from public.contacts where id = (select lead from t)), 'deal linked to the client');

-- Switched off: nothing happens.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.outreach_automation (organization_id, followup_on, interested_deal) select org, false, false from t;
insert into public.contacts (organization_id, full_name, source) select org, 'Ravi', 'Referral' from t;
insert into public.outreach_events (organization_id, contact_id, kind, outcome) select org, (select id from public.contacts where full_name = 'Ravi'), 'call', 'voicemail' from t;
update public.contacts set lead_status = 'qualified' where full_name = 'Ravi';
select pg_temp.assert(not exists (select 1 from public.tasks where title like 'Follow up: Ravi%'), 'no follow-up when switched off');
select pg_temp.assert(not exists (select 1 from public.deals where title = 'Ravi'), 'no deal when switched off');
select pg_temp.logout();

-- A sales rep cannot change the rules.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
update public.outreach_automation set followup_on = true;
select pg_temp.assert(not (select followup_on from public.outreach_automation), 'sales rep cannot switch rules');
select pg_temp.logout();

-- Leads waiting on the list: one reminder per period.
insert into public.contacts (organization_id, full_name, owner_id, created_at) select org, 'Old Lead', '00000000-0000-0000-0000-00000000000c'::uuid, now() - interval '10 days' from t;
set local role service_role;
select pg_temp.assert(public.run_outreach_rules(current_date) >= 1, 'stale lead reminded');
select pg_temp.assert(public.run_outreach_rules(current_date) = 0, 'not reminded twice');
reset role;
select pg_temp.assert(exists (select 1 from public.tasks where title like 'Reach out: Old Lead has waited 7+ days%'), 'reminder task created');
select pg_temp.assert((select count(*) from public.outreach_rule_log where organization_id = (select org from t)) >= 5, 'every action is logged');
rollback;
