begin;
\ir 00_helpers.sql.inc
-- a owner (group owner) · c sales rep
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated, service_role;
alter table t add column org uuid, add column org2 uuid, add column seq uuid, add column m1 uuid, add column m2 uuid;
update t set org = public.create_company(grp, '{"name":"GBS","slug":"gbs-send"}'), org2 = public.create_company(grp, '{"name":"TOF","slug":"tof-send"}');
insert into public.memberships (organization_id, user_id, role) select org, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t;

-- Platform ceilings and real-person rule.
select pg_temp.assert_raises($$insert into public.sender_accounts (organization_id, channel, kind, label, address, account_key, daily_limit) select org, 'linkedin', 'page', 'LI', 'x', 'LI_1', 100 from t$$, 'check', 'LinkedIn capped at 25 a day');
select pg_temp.assert_raises($$insert into public.sender_accounts (organization_id, channel, kind, label, address, account_key, daily_limit) select org, 'linkedin', 'personal_profile', 'LI', 'x', 'LI_1', 20 from t$$, 'check', 'a personal profile needs its real operator');
insert into public.sender_accounts (organization_id, channel, kind, label, address, account_key, daily_limit, warmup_started) select org, 'email', 'mailbox', 'Box 1', 'a@gbs.test', 'BOX_1', 100, current_date from t;
insert into public.sender_accounts (organization_id, channel, kind, label, address, account_key, daily_limit) select org, 'email', 'mailbox', 'Box 2', 'b@gbs.test', 'BOX_2', 2 from t;
insert into public.sender_accounts (organization_id, channel, kind, label, address, account_key, daily_limit, operator_id) select org, 'linkedin', 'personal_profile', 'Rep profile', 'linkedin.com/in/rep', 'REP_LI', 20, '00000000-0000-0000-0000-00000000000c'::uuid from t;
update t set m1 = (select id from public.sender_accounts where account_key = 'BOX_1'), m2 = (select id from public.sender_accounts where account_key = 'BOX_2');
select pg_temp.assert(app.account_capacity((select a from public.sender_accounts a where account_key = 'BOX_1'), current_date) = 10, 'new mailbox warms up at 10 a day');
select pg_temp.assert(app.account_capacity((select a from public.sender_accounts a where account_key = 'BOX_1'), current_date + 4) = 30, 'then +5 a day');

-- Shared accounts: only the group owner adds them; every company can use them.
insert into public.sender_accounts (family_group_id, channel, kind, label, address, account_key, daily_limit) select grp, 'whatsapp', 'business_number', 'Group WA', '+919800000000', 'GROUP_WA', 250 from t;
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert_raises($$insert into public.sender_accounts (organization_id, channel, kind, label, address, account_key, daily_limit) select org, 'email', 'mailbox', 'x', 'x@x.test', 'REP_BOX', 10 from t$$, null, 'a sales rep cannot add sending accounts');
select pg_temp.logout();
select pg_temp.assert(app.pick_sender((select org2 from t), 'whatsapp', current_date) = (select id from public.sender_accounts where account_key = 'GROUP_WA'), 'another company uses the shared number');

-- 30 leads in an email campaign: 10 + 2 go today (capacity), the rest wait; the LinkedIn step goes to the rep.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.contacts (organization_id, full_name, email, consent_basis, consent_at) select org, 'Lead ' || g, 'lead' || g || '@x.test', 'consent', now() from t, generate_series(1, 30) g;
insert into public.outreach_sequences (organization_id, name, status, steps) select org, 'Email blast', 'active', '[{"channel":"email","delay_days":0,"template":"Hi"}]'::jsonb from t;
insert into public.outreach_enrollments (organization_id, sequence_id, contact_id, next_step_at) select c.organization_id, s.id, c.id, now() - interval '1 hour' from public.contacts c, public.outreach_sequences s;
insert into public.automation_definitions (organization_id, template_key, name, trigger_kind, enabled, requires_approval, is_financial, idempotent) select org, 'sequence_sends', 's', 'schedule', true, false, false, true from t;
select pg_temp.logout();
set local role service_role;
select public.enqueue_scheduled_runs(current_date);
reset role;
select pg_temp.assert((select count(*) from public.outreach_send_log where sent_on = current_date) = 12, 'only today''s capacity is sent (10 warming + 2)');
select pg_temp.assert((select count(*) from public.outreach_send_log where sender_account_id = (select m2 from t)) = 2, 'small mailbox stops at its limit');
select pg_temp.assert((select count(*) from public.outreach_enrollments where current_step = 0) = 18, 'the rest wait for tomorrow');
select pg_temp.assert((select count(distinct item ->> 'from') from (select jsonb_array_elements(payload_summary -> 'sends') item from public.automation_runs) x) = 2, 'sends carry the mailbox they go from');

-- Weekly cap per person across channels (default 3).
select pg_temp.assert(not app.touch_capped((select org from t), (select id from public.contacts where full_name = 'Lead 1'), current_date), 'one touch is under the cap');
insert into public.outreach_send_log (organization_id, contact_id, channel, sent_on) select org, (select id from public.contacts where full_name = 'Lead 1'), 'email', current_date from t, generate_series(1, 3);
select pg_temp.assert(app.touch_capped((select org from t), (select id from public.contacts where full_name = 'Lead 1'), current_date), 'capped after the weekly maximum');

-- Pause everything: one company, then the whole group; copy a campaign to another company.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert(public.set_outreach_paused((select org from t), null, true) = 1, 'company campaigns paused');
select pg_temp.assert(public.set_outreach_paused(null, (select grp from t), false) = 1, 'group owner resumes across all companies');
select pg_temp.assert(public.copy_campaign((select id from public.outreach_sequences limit 1), array[(select org2 from t)]) = 1, 'campaign copied');
select pg_temp.assert((select status from public.outreach_sequences where organization_id = (select org2 from t)) = 'paused', 'copies arrive paused for review');
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert_raises($$select public.set_outreach_paused(null, (select grp from t), true)$$, 'group owner', 'a sales rep cannot pause the group');
select pg_temp.logout();
rollback;
