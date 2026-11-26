begin;
\ir 00_helpers.sql.inc
-- a owner · c sales rep · d sales manager
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated, service_role;
alter table t add column org uuid, add column seq uuid;
update t set org = public.create_company(grp, '{"name":"GBS","slug":"gbs-auto"}');
insert into public.memberships (organization_id, user_id, role) select org, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t;
insert into public.memberships (organization_id, user_id, role) select org, '00000000-0000-0000-0000-00000000000d'::uuid, 'sales_manager' from t;
insert into public.sender_accounts (organization_id, channel, kind, label, address, account_key, daily_limit) select org, 'email', 'mailbox', 'Box', 'a@gbs.test', 'BOX_AUTO', 50 from t;
insert into public.contacts (organization_id, full_name, email, consent_basis, consent_at) select org, 'Lead ' || g, 'auto' || g || '@x.test', 'legitimate_interest', now() from t, generate_series(1, 2) g;
insert into public.outreach_sequences (organization_id, name, status, steps, approved_at)
  select org, 'Email', 'active', '[{"channel":"email","delay_days":0,"template":"Hi"},{"channel":"email","delay_days":1,"template":"Again"}]'::jsonb, now() from t;
update t set seq = (select id from public.outreach_sequences);
select pg_temp.assert((select approved_at from public.outreach_sequences) is null, 'a new campaign starts unapproved even if the insert says otherwise');
select pg_temp.assert_raises($$update public.outreach_sequences set approved_at = now()$$, 'approve_campaign', 'approval only through the approval function');
insert into public.outreach_enrollments (organization_id, sequence_id, contact_id, next_step_at) select c.organization_id, (select seq from t), c.id, now() - interval '1 hour' from public.contacts c;
insert into public.automation_definitions (organization_id, template_key, name, trigger_kind, enabled, requires_approval, is_financial, idempotent) select org, 'sequence_sends', 's', 'schedule', true, true, false, true from t;
select pg_temp.logout();

-- A sales manager cannot approve; the owner can.
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert_raises($$select public.approve_campaign((select seq from t), true)$$, 'owner or company admin', 'sales manager cannot approve');
select pg_temp.logout();

-- Unapproved: the daily run waits.
set local role service_role;
select public.enqueue_scheduled_runs(current_date);
reset role;
select pg_temp.assert((select status from public.automation_runs where idempotency_key = 'sequence_sends:' || current_date) = 'pending_approval', 'unapproved campaign waits for approval');

-- Approved once: the next day's run queues on its own.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.approve_campaign((select seq from t), true);
select pg_temp.logout();
update public.outreach_enrollments set next_step_at = now() - interval '1 hour';
set local role service_role;
select public.enqueue_scheduled_runs(current_date + 1);
reset role;
select pg_temp.assert((select status from public.automation_runs where idempotency_key = 'sequence_sends:' || (current_date + 1)) = 'queued', 'approved campaign runs without asking');

-- Editing the wording withdraws the approval.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.outreach_sequences set steps = '[{"channel":"email","delay_days":0,"template":"New wording"}]'::jsonb;
select pg_temp.assert((select approved_at from public.outreach_sequences) is null, 'edited campaign needs approval again');
-- AI assistant settings: limits are enforced.
insert into public.growth_settings (organization_id, ai_reply_enabled, ai_knowledge) select org, true, 'We build websites.' from t;
select pg_temp.assert_raises($$update public.growth_settings set ai_reply_channels = '{linkedin}'$$, 'check', 'AI replies only on email and WhatsApp');
select pg_temp.assert_raises($$update public.growth_settings set ai_daily_limit = 50$$, 'check', 'per-person daily limit capped');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.ai_replies) = 0, 'sales rep cannot read the AI conversation log (needs read-all)');
select pg_temp.logout();
rollback;
