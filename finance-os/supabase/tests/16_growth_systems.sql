begin;
\ir 00_helpers.sql.inc
-- a owner · c sales rep
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated;
alter table t add column org uuid, add column ok uuid, add column dnc uuid, add column nobasis uuid, add column seq uuid, add column won uuid, add column deal uuid, add column post uuid, add column inv uuid;
update t set org = public.create_company(grp, jsonb_build_object('name', 'GBS', 'slug', 'gbs-growth', 'short_name', 'GBS',
  'stages', jsonb_build_array(jsonb_build_object('name', 'Lead', 'kind', 'open'), jsonb_build_object('name', 'Won', 'kind', 'won', 'probability_pct', 100))));
insert into public.memberships (organization_id, user_id, role) select org, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t;
insert into public.contacts (organization_id, full_name, company_name, email, phone_e164, consent_basis, consent_at, linkedin_url)
select org, 'Asha Rao', 'Acme', 'asha@acme.test', '+919800000001', 'consent', now(), 'https://www.linkedin.com/in/asha' from t;
insert into public.contacts (organization_id, full_name, phone_e164, consent_basis, consent_at, do_not_contact) select org, 'No Calls', '+919800000002', 'consent', now(), true from t;
insert into public.contacts (organization_id, full_name, phone_e164) select org, 'No Basis', '+919800000003' from t;
update t set ok = (select id from public.contacts where full_name = 'Asha Rao'), dnc = (select id from public.contacts where full_name = 'No Calls'),
             nobasis = (select id from public.contacts where full_name = 'No Basis');

-- AI calls: always disclosed, only to callable leads.
select pg_temp.assert(public.queue_voice_call((select ok from t), 'qualify') is not null, 'callable lead queued');
select pg_temp.assert((select bool_and(ai_disclosed) from public.voice_calls), 'call is marked as disclosing AI');
select pg_temp.assert_raises($$select public.queue_voice_call((select dnc from t), 'qualify')$$, 'not to be contacted', 'do-not-contact lead refused');
select pg_temp.assert_raises($$select public.queue_voice_call((select nobasis from t), 'qualify')$$, 'lawful basis', 'lead without lawful basis refused');
select pg_temp.assert_raises($$update public.voice_calls set ai_disclosed = false$$, null, 'disclosure cannot be switched off');

-- Posts publish only after approval; the creator cannot mark a post approved or published.
insert into public.content_posts (organization_id, channel, body, scheduled_at) select org, 'linkedin', 'Hello', now() from t;
update t set post = (select id from public.content_posts);
select pg_temp.assert_raises($$update public.content_posts set status = 'approved'$$, 'approve_post', 'direct approval refused');
select pg_temp.assert_raises($$update public.content_posts set status = 'published'$$, 'publisher', 'direct publish refused');
select public.approve_post((select post from t));
select pg_temp.assert((select status from public.content_posts) = 'approved', 'approver can approve');
select pg_temp.assert_raises($$update public.content_posts set body = 'changed'$$, 'cannot be edited', 'approved post is locked');
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
insert into public.content_posts (organization_id, channel, body, scheduled_at) select org, 'facebook', 'Rep draft', now() from t;
select pg_temp.assert_raises(format($$select public.approve_post(%L)$$, (select id from public.content_posts where body = 'Rep draft')), 'approver', 'a sales rep cannot approve posts');
select pg_temp.logout();

-- Invoice from a won deal.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.deals (organization_id, title, account_name, stage_id, value_minor)
select org, 'Website build', 'Acme Pvt Ltd', (select id from public.pipeline_stages where kind = 'open' and organization_id = t.org), 1000000 from t;
update t set deal = (select id from public.deals);
select pg_temp.assert_raises($$select public.invoice_from_deal((select deal from t), 1800, 7, null)$$, 'won deal', 'open deal cannot be invoiced');
update public.deals set stage_id = (select id from public.pipeline_stages where kind = 'won' and organization_id = (select org from t));
select pg_temp.assert_raises($$select public.invoice_from_deal((select deal from t), 1700, 7, null)$$, 'GST rate', 'only standard GST rates');
update t set inv = public.invoice_from_deal((select deal from t), 1800, 7, 'Website build, phase 1');
select pg_temp.assert((select total_minor from public.invoices where id = (select inv from t)) = 1180000, 'total includes 18% GST');
select pg_temp.assert((select invoice_number from public.invoices where id = (select inv from t)) like 'GBS/20%-%/0001', 'numbered per company and year');
select pg_temp.assert((select legal_name from public.clients) = 'Acme Pvt Ltd', 'client created from the account name');
select pg_temp.assert_raises($$select public.invoice_from_deal((select deal from t), 1800, 7, null)$$, 'already has an invoice', 'one invoice per deal');
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert_raises($$select public.invoice_from_deal((select deal from t), 1800, 7, null)$$, null, 'a sales rep cannot raise invoices');
select pg_temp.logout();

-- Sequences: LinkedIn steps become tasks, email steps become sends; reminders queue on due dates.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.outreach_sequences (organization_id, name, status, steps) select org, 'Mixed', 'active',
  '[{"channel":"linkedin","action":"comment","delay_days":0,"template":"Great point, {{first_name}}"},{"channel":"email","delay_days":2,"template":"intro"}]'::jsonb from t;
insert into public.outreach_enrollments (organization_id, sequence_id, contact_id, next_step_at)
select org, (select id from public.outreach_sequences), ok, now() - interval '1 hour' from t;
insert into public.automation_definitions (organization_id, template_key, name, trigger_kind, enabled, requires_approval, is_financial, idempotent)
select org, k, k, 'schedule', true, false, false, true from t, unnest(array['payment_reminders', 'sequence_sends']) k;
insert into public.sender_accounts (organization_id, channel, kind, label, address, account_key, daily_limit) select org, 'email', 'mailbox', 'Sales', 'sales@gbs.test', 'GBS_SALES', 50 from t;
select pg_temp.logout();
set local role service_role;
select public.enqueue_scheduled_runs((now() at time zone 'Asia/Kolkata')::date);
reset role;
select pg_temp.assert((select draft from public.outreach_tasks) = 'Great point, Asha', 'LinkedIn step became a drafted task');
select pg_temp.assert((select target_url from public.outreach_tasks) = 'https://www.linkedin.com/in/asha', 'task opens the profile');
select pg_temp.assert((select current_step from public.outreach_enrollments) = 1, 'enrollment advanced');
set local role service_role;
select public.enqueue_scheduled_runs((now() at time zone 'Asia/Kolkata')::date + 7);
reset role;
select pg_temp.assert((select jsonb_array_length(payload_summary -> 'sends') from public.automation_runs where idempotency_key like 'sequence_sends:%') = 1, 'email step queued for n8n');
select pg_temp.assert((select payload_summary -> 'invoices' -> 0 ->> 'stage' from public.automation_runs where idempotency_key like 'payment_reminders:%') = 'due', 'reminder on the due date');
rollback;
