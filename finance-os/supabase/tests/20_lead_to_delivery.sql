begin;
\ir 00_helpers.sql.inc
-- a owner · c sales rep · d second rep
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated, service_role;
alter table t add column org uuid, add column deal uuid, add column inv uuid;
update t set org = public.create_company(grp, jsonb_build_object('name', 'GBS', 'slug', 'gbs-l2d', 'short_name', 'GBS',
  'stages', jsonb_build_array(jsonb_build_object('name', 'Lead', 'kind', 'open'), jsonb_build_object('name', 'Won', 'kind', 'won', 'probability_pct', 100))));
insert into public.memberships (organization_id, user_id, role) select org, u, 'sales_rep' from t, unnest(array['00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d']::uuid[]) u;

-- Round-robin: new unowned leads alternate between the chosen reps; an owner set by hand is kept.
insert into public.growth_settings (organization_id, routing_enabled, routing_members, booking_url)
  select org, true, array['00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d']::uuid[], 'https://cal.com/gbs/intro' from t;
insert into public.contacts (organization_id, full_name, email) select org, 'Lead ' || g, 'l' || g || '@x.test' from t, generate_series(1, 4) g;
insert into public.contacts (organization_id, full_name, owner_id) select org, 'Mine', '00000000-0000-0000-0000-00000000000a'::uuid from t;
select pg_temp.assert((select count(*) from public.contacts where owner_id = '00000000-0000-0000-0000-00000000000c') = 2, 'rep C gets every other lead');
select pg_temp.assert((select count(*) from public.contacts where owner_id = '00000000-0000-0000-0000-00000000000d') = 2, 'rep D gets the others');
select pg_temp.assert((select owner_id from public.contacts where full_name = 'Mine') = '00000000-0000-0000-0000-00000000000a', 'hand-set owner kept');
select pg_temp.assert_raises($$update public.growth_settings set booking_url = 'http://insecure.test'$$, 'check', 'booking link must be https');

-- Onboarding steps become tasks once, on the first payment.
insert into public.onboarding_steps (organization_id, title, due_after_days, position) select org, 'Kick-off call', 0, 1 from t;
insert into public.onboarding_steps (organization_id, title, due_after_days, assignee_id, position) select org, 'Collect brand assets', 2, '00000000-0000-0000-0000-00000000000d'::uuid, 2 from t;
insert into public.deals (organization_id, title, account_name, stage_id, value_minor, owner_id)
select org, 'Retainer', 'New Client Ltd', (select id from public.pipeline_stages where kind = 'won' and organization_id = t.org), 1000000, '00000000-0000-0000-0000-00000000000c'::uuid from t;
update t set deal = (select id from public.deals);
update t set inv = public.invoice_from_deal((select deal from t), 0, 7, null);
select public.record_payment((select org from t),
  jsonb_build_object('client_id', (select client_id from public.invoices where id = (select inv from t)), 'transaction_reference', 'UTR adv', 'payment_date', current_date,
    'amount_minor', 300000, 'method', 'upi', 'verified', true, 'verification_note', 'Advance seen in bank'),
  jsonb_build_array(jsonb_build_object('invoice_id', (select inv from t), 'amount_minor', 300000)));
select pg_temp.assert((select count(*) from public.tasks where deal_id = (select deal from t)) = 2, 'advance payment starts onboarding');
select pg_temp.assert((select assignee_id from public.tasks where title like 'Kick-off call%') = '00000000-0000-0000-0000-00000000000c', 'unassigned step goes to the deal owner');
select pg_temp.assert((select due_on from public.tasks where title like 'Collect brand assets%') = (now() at time zone 'Asia/Kolkata')::date + 2, 'due dates follow the step');
select public.record_payment((select org from t),
  jsonb_build_object('client_id', (select client_id from public.invoices where id = (select inv from t)), 'transaction_reference', 'UTR rest', 'payment_date', current_date,
    'amount_minor', 700000, 'method', 'upi', 'verified', true, 'verification_note', 'Balance seen in bank'),
  jsonb_build_array(jsonb_build_object('invoice_id', (select inv from t), 'amount_minor', 700000)));
select pg_temp.assert((select count(*) from public.tasks where deal_id = (select deal from t)) = 2, 'no repeat on the second payment');
select pg_temp.logout();

-- A sales rep cannot change routing.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
update public.growth_settings set routing_enabled = false;
select pg_temp.assert((select routing_enabled from public.growth_settings), 'sales rep cannot switch routing off');
select pg_temp.logout();

-- Email runs carry the booking link.
insert into public.outreach_sequences (organization_id, name, status, steps) select org, 'E', 'active', '[{"channel":"email","delay_days":0,"template":"Book: {{booking_link}}"}]'::jsonb from t;
update public.contacts set consent_basis = 'legitimate_interest', consent_at = now() where full_name = 'Lead 1';
insert into public.outreach_enrollments (organization_id, sequence_id, contact_id, next_step_at) select c.organization_id, s.id, c.id, now() - interval '1 hour' from public.contacts c, public.outreach_sequences s where c.full_name = 'Lead 1';
insert into public.sender_accounts (organization_id, channel, kind, label, address, account_key, daily_limit) select org, 'email', 'mailbox', 'Box', 'a@gbs.test', 'BOX_L2D', 50 from t;
insert into public.automation_definitions (organization_id, template_key, name, trigger_kind, enabled, requires_approval, is_financial, idempotent) select org, 'sequence_sends', 's', 'schedule', true, false, false, true from t;
set local role service_role;
select public.enqueue_scheduled_runs(current_date);
reset role;
select pg_temp.assert((select payload_summary ->> 'booking_url' from public.automation_runs where idempotency_key like 'sequence_sends:%') = 'https://cal.com/gbs/intro', 'booking link sent with the run');
rollback;
