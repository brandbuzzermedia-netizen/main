begin;
\ir 00_helpers.sql.inc
\ir 00_setup.sql.inc

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.leads (organization_id, full_name, email, phone_e164, stage_id, owner_id)
select alpha, 'Olivia Outreach', 'olivia@example.com', '+12127365000', pg_temp.stage(alpha, 'new'), '00000000-0000-0000-0000-00000000000d'::uuid from t_ids;
create temp table t_lead as select id from public.leads where full_name = 'Olivia Outreach';
grant all on t_lead to authenticated;

-- Templates: approval is stamped; editing an approved template sends it back to draft.
insert into public.message_templates (organization_id, name, channel, subject, body)
select alpha, 'Intro email', 'email', 'Homes in {{preferred_location}}', 'Hi {{first_name}}, …' from t_ids;
insert into public.message_templates (organization_id, name, channel, body, status)
select alpha, 'Intro SMS', 'sms', 'Hi {{first_name}}, it''s {{agent_name}}. Reply STOP to opt out.', 'approved' from t_ids;
select pg_temp.assert((select approved_by from public.message_templates where name = 'Intro SMS') = '00000000-0000-0000-0000-00000000000a', 'approval stamped');
update public.message_templates set status = 'approved' where name = 'Intro email';
update public.message_templates set body = 'Changed' where name = 'Intro email';
select pg_temp.assert((select status from public.message_templates where name = 'Intro email') = 'draft', 'editing approved content requires re-approval');
select pg_temp.assert_raises(
  format($$insert into public.message_templates (organization_id, name, channel, body) values (%L, 'No subject', 'email', 'x')$$, (select alpha from t_ids)),
  'check', 'email templates need a subject');

-- Campaigns cannot run with unapproved templates.
select pg_temp.assert_raises(
  format($$insert into public.campaigns (organization_id, name, status, steps) values (%L, 'Bad', 'active', %L)$$,
         (select alpha from t_ids), jsonb_build_array(jsonb_build_object('channel', 'email', 'template_id', (select id from public.message_templates where name = 'Intro email'), 'delay_days', 0))),
  'approved', 'unapproved template blocks activation');
insert into public.campaigns (organization_id, name, status, steps)
select alpha, 'Follow-up', 'active', jsonb_build_array(
  jsonb_build_object('channel', 'sms', 'template_id', (select id from public.message_templates where name = 'Intro SMS'), 'delay_days', 0),
  jsonb_build_object('channel', 'sms', 'template_id', (select id from public.message_templates where name = 'Intro SMS'), 'delay_days', 2))
from t_ids;
select pg_temp.assert_raises(
  format($$insert into public.campaigns (organization_id, name, steps) values (%L, 'Bad delay', '[{"channel":"sms","delay_days":400}]')$$, (select alpha from t_ids)),
  'delay', 'step delays are bounded');
insert into public.campaign_enrollments (organization_id, campaign_id, lead_id)
select alpha, (select id from public.campaigns where name = 'Follow-up'), (select id from t_lead) from t_ids;

-- A message is never "sent" without an allow decision.
select pg_temp.assert_raises(
  format($$insert into public.messages (organization_id, lead_id, channel, direction, to_address, body, status, decision, created_by)
           values (%L, %L, 'sms', 'outbound', '+12127365000', 'x', 'queued', '{"decision":"block"}', '00000000-0000-0000-0000-00000000000a')$$,
         (select alpha from t_ids), (select id from t_lead)),
  'check', 'blocked decision cannot be queued');
insert into public.messages (organization_id, lead_id, channel, direction, to_address, body, status, decision, created_by)
select alpha, (select id from t_lead), 'sms', 'outbound', '+12127365000', 'Hi Olivia', 'queued', '{"decision":"allow"}', '00000000-0000-0000-0000-00000000000a' from t_ids;
update public.messages set status = 'sent', provider = 'twilio', provider_message_id = 'SM123', sent_at = now();
select pg_temp.assert((select s.key from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.id = (select id from t_lead)) = 'contacted',
  'a sent message moves a new lead to contacted');
select pg_temp.assert((select last_contacted_at from public.leads where id = (select id from t_lead)) is not null, 'sent message sets last contacted');
select pg_temp.assert_raises($$update public.messages set body = 'rewritten'$$, 'cannot be changed', 'message content is fixed');
select pg_temp.assert_raises(
  format($$insert into public.messages (organization_id, lead_id, channel, direction, to_address, body, status, created_by)
           values (%L, %L, 'sms', 'inbound', '+1', 'fake reply', 'received', '00000000-0000-0000-0000-00000000000a')$$,
         (select alpha from t_ids), (select id from t_lead)),
  'row-level security', 'people cannot forge inbound messages');
select pg_temp.logout();

-- Webhook path (service role): inbound reply stops the sequence; duplicate deliveries are rejected.
insert into public.messages (organization_id, lead_id, channel, direction, to_address, from_address, body, status, provider, provider_message_id)
select alpha, (select id from t_lead), 'sms', 'inbound', '+15550000000', '+12127365000', 'Yes, call me', 'received', 'twilio', 'SM999' from t_ids;
select pg_temp.assert((select status from public.campaign_enrollments) = 'stopped', 'reply stops the sequence');
select pg_temp.assert((select stop_reason from public.campaign_enrollments) = 'replied', 'stop reason recorded');
select pg_temp.assert_raises(
  format($$insert into public.messages (organization_id, lead_id, channel, direction, to_address, body, status, provider, provider_message_id)
           values (%L, %L, 'sms', 'inbound', '+1', 'dup', 'received', 'twilio', 'SM999')$$, (select alpha from t_ids), (select id from t_lead)),
  'messages_provider_unique', 'duplicate webhook delivery rejected');

-- Usage metering: idempotent per reference; quota enforced (trial has 0 SMS).
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert_raises(
  format($$select public.meter_usage(%L, 'sms', 1, 'SM123')$$, (select alpha from t_ids)),
  'plan limit', 'trial plan has no SMS allowance');
select public.meter_usage((select alpha from t_ids), 'email', 1, 'em-1');
select public.meter_usage((select alpha from t_ids), 'email', 1, 'em-1');
select pg_temp.assert(public.usage_this_period((select alpha from t_ids), 'email') = 1, 'usage is idempotent per reference');
select pg_temp.logout();

-- The rep sees the conversation on their lead; read-only can't send; other tenants see nothing.
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert((select count(*) from public.messages) = 2, 'rep sees the thread on their lead');
select pg_temp.assert_raises(
  format($$insert into public.message_templates (organization_id, name, channel, body) values (%L, 'Rep', 'sms', 'x')$$, (select alpha from t_ids)),
  'row-level security', 'reps cannot create templates');
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert((select count(*) from public.messages) + (select count(*) from public.message_templates) + (select count(*) from public.campaigns) = 0, 'beta sees nothing');
select pg_temp.assert(public.usage_this_period((select alpha from t_ids), 'email') is null, 'beta cannot read alpha usage');
select pg_temp.assert_raises(format($$select public.meter_usage(%L, 'email', 1, 'x')$$, (select alpha from t_ids)), 'not allowed', 'beta cannot meter alpha');
select pg_temp.logout();

rollback;
