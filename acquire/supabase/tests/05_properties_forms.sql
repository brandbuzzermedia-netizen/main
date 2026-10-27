begin;
\ir 00_helpers.sql.inc
\ir 00_setup.sql.inc

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.lead_forms (organization_id, name, consent_email, consent_sms, assign_to)
select alpha, 'Open house', 'Email me new listings.', 'Text me about viewings. Reply STOP to opt out.', '00000000-0000-0000-0000-00000000000d'::uuid from t_ids;
select pg_temp.assert_raises(
  format($$insert into public.lead_forms (organization_id, name, assign_to) values (%L, 'Bad', '00000000-0000-0000-0000-00000000000b')$$, (select alpha from t_ids)),
  'member of this organization', 'form assignee must be a member');
create temp table t_form as select public_key as k from public.lead_forms where name = 'Open house';
grant all on t_form to authenticated;
-- People cannot call the public submission function directly.
select pg_temp.assert_raises(format($$select public.submit_lead_form(%L, '{}'::jsonb, 'x', 'ua')$$, (select k from t_form)), 'permission denied', 'submit is server-only');
select pg_temp.logout();

-- Service role (the public route) submits.
create temp table t_r as select public.submit_lead_form((select k from t_form), jsonb_build_object(
  'full_name', 'Fiona Form', 'email', 'Fiona@Example.com', 'phone_e164', '+12127365001', 'country', 'US', 'message', 'Looking for 2 beds',
  'consent', jsonb_build_array(
    jsonb_build_object('channel', 'email', 'text', 'Email me new listings.'),
    jsonb_build_object('channel', 'sms', 'text', 'Tampered wording'))), 'iphash1', 'Mozilla') as r;
select pg_temp.assert((select r ->> 'outcome' from t_r) = 'created', 'form creates a lead');
select pg_temp.assert((select owner_id from public.leads where email_normalized = 'fiona@example.com') = '00000000-0000-0000-0000-00000000000d', 'form assigns the lead');
select pg_temp.assert((select count(*) from public.consent_records c join public.leads l on l.id = c.lead_id where l.full_name = 'Fiona Form') = 1,
  'only consent with the exact shown wording is recorded');
select pg_temp.assert((select basis from public.consent_records limit 1) = 'express_written', 'form consent is express written');
select pg_temp.assert((select source from public.consent_records limit 1) like '%Email me new listings.%', 'consent keeps the wording');
-- Same person again: updates, not duplicates.
select public.submit_lead_form((select k from t_form), '{"full_name":"Fiona F","email":"fiona@example.com"}'::jsonb, 'iphash1', 'Mozilla');
select pg_temp.assert((select count(*) from public.leads where email_normalized = 'fiona@example.com') = 1, 'repeat submission does not duplicate');
-- Rate limit: 5 per IP per 10 minutes.
select public.submit_lead_form((select k from t_form), format('{"full_name":"x","email":"x%s@example.com"}', g)::jsonb, 'iphash1', 'ua') from generate_series(1, 3) g;
select pg_temp.assert((public.submit_lead_form((select k from t_form), '{"full_name":"y","email":"y@example.com"}'::jsonb, 'iphash1', 'ua')) ->> 'error' = 'rate_limited', 'per-IP rate limit');
select pg_temp.assert((public.submit_lead_form((select k from t_form), '{"full_name":"z","email":"z@example.com"}'::jsonb, 'iphash2', 'ua')) ->> 'ok' = 'true', 'other IPs still accepted');
select pg_temp.assert((public.submit_lead_form('nope', '{}'::jsonb, 'h', 'ua')) ->> 'error' = 'form_not_found', 'unknown form');
-- Suppressed people are recorded but get no consent.
insert into public.suppression_entries (organization_id, value_type, value, reason) select alpha, 'email', 'opted@example.com', 'opt_out' from t_ids;
select pg_temp.assert((public.submit_lead_form((select k from t_form),
  '{"full_name":"Opted","email":"opted@example.com","consent":[{"channel":"email","text":"Email me new listings."}]}'::jsonb, 'iphash3', 'ua')) ->> 'outcome' = 'suppressed', 'suppressed outcome');
select pg_temp.assert(not exists (select 1 from public.consent_records c join public.leads l on l.id = c.lead_id where l.email_normalized = 'opted@example.com'), 'no consent over suppression');

-- Properties and views.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.properties (organization_id, title, currency, price_minor, video_url) select alpha, '12 Oak St', 'USD', 65000000, 'https://video.example.com/oak' from t_ids;
select pg_temp.assert_raises(
  format($$insert into public.properties (organization_id, title, currency, video_url) values (%L, 'Insecure', 'USD', 'http://x')$$, (select alpha from t_ids)),
  'check', 'media links must be https');
insert into public.lead_property_interests (organization_id, lead_id, property_id, shared_at, created_by)
select alpha, (select id from public.leads where email_normalized = 'fiona@example.com'), (select id from public.properties), now(), '00000000-0000-0000-0000-00000000000a' from t_ids;
select pg_temp.logout();
select public.record_property_view((select alpha from t_ids), (select id from public.leads where email_normalized = 'fiona@example.com'), (select id from public.properties));
select public.record_property_view((select alpha from t_ids), (select id from public.leads where email_normalized = 'fiona@example.com'), (select id from public.properties));
select pg_temp.assert((select view_count from public.lead_property_interests) = 2, 'views counted');
select pg_temp.assert((select status from public.lead_property_interests) = 'viewed', 'status moves to viewed');
select pg_temp.assert((select count(*) from public.lead_activities where kind = 'property') = 1, 'first view logged once');

-- Access: the rep sees interests on their lead but cannot edit the catalogue; beta sees nothing.
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert((select count(*) from public.lead_property_interests) = 1, 'rep sees interest on own lead');
select pg_temp.assert_raises(
  format($$insert into public.properties (organization_id, title, currency) values (%L, 'Rep listing', 'USD')$$, (select alpha from t_ids)),
  'row-level security', 'reps cannot edit the catalogue');
select pg_temp.assert((select count(*) from public.lead_form_submissions) = 0, 'reps cannot read form submissions');
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert((select count(*) from public.properties) + (select count(*) from public.lead_forms) = 0, 'beta sees no alpha properties or forms');
select pg_temp.logout();

rollback;
