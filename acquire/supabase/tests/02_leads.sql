begin;
\ir 00_helpers.sql.inc
\ir 00_setup.sql.inc

select pg_temp.login('00000000-0000-0000-0000-00000000000a');

-- Duplicate detection: normalized email and E.164 phone are unique per organization.
insert into public.leads (organization_id, full_name, email, phone_e164, country, stage_id)
select alpha, 'Bianca Buyer', 'Bianca@Example.com', '+13125550111', 'US', pg_temp.stage(alpha, 'new') from t_ids;
select pg_temp.assert((select email_normalized from public.leads where full_name = 'Bianca Buyer') = 'bianca@example.com', 'email normalized');
select pg_temp.assert_raises(
  format($$insert into public.leads (organization_id, full_name, email, stage_id) values (%L, 'Dup', 'BIANCA@example.com', %L)$$,
         (select alpha from t_ids), (select pg_temp.stage(alpha, 'new') from t_ids)),
  'leads_email_unique', 'duplicate email rejected');
select pg_temp.assert_raises(
  format($$insert into public.leads (organization_id, full_name, phone_e164, stage_id) values (%L, 'Dup', '+13125550111', %L)$$,
         (select alpha from t_ids), (select pg_temp.stage(alpha, 'new') from t_ids)),
  'leads_phone_unique', 'duplicate phone rejected');
select pg_temp.assert_raises(
  format($$insert into public.leads (organization_id, full_name, stage_id) values (%L, 'No contact', %L)$$,
         (select alpha from t_ids), (select pg_temp.stage(alpha, 'new') from t_ids)),
  'check', 'a lead needs an email or phone');
select pg_temp.assert_raises(
  format($$insert into public.leads (organization_id, full_name, phone_e164, stage_id) values (%L, 'Bad phone', '3125550111', %L)$$,
         (select alpha from t_ids), (select pg_temp.stage(alpha, 'new') from t_ids)),
  'check', 'phone must be E.164');
select pg_temp.assert_raises(
  format($$insert into public.leads (organization_id, full_name, email, stage_id, budget_min_minor, budget_max_minor, currency)
           values (%L, 'Budget', 'b@x.com', %L, 500, 100, 'USD')$$,
         (select alpha from t_ids), (select pg_temp.stage(alpha, 'new') from t_ids)),
  'check', 'budget max must be >= min');
select pg_temp.assert_raises(
  $$update public.leads set owner_id = '00000000-0000-0000-0000-00000000000b' where full_name = 'Bianca Buyer'$$,
  'member of this organization', 'cannot assign a lead to someone outside the organization');
-- The same person may exist in another organization.
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into public.leads (organization_id, full_name, email, stage_id)
select beta, 'Bianca Buyer', 'bianca@example.com', pg_temp.stage(beta, 'new') from t_ids;
select pg_temp.logout();

-- Timeline entries come from triggers.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
update public.leads set stage_id = (select pg_temp.stage(alpha, 'contacted') from t_ids), owner_id = '00000000-0000-0000-0000-00000000000d'
where full_name = 'Bianca Buyer';
select pg_temp.assert((select array_agg(kind::text order by kind::text) from public.lead_activities
  where lead_id = (select id from public.leads where full_name = 'Bianca Buyer')) = array['assigned', 'created', 'stage_changed'],
  'created, stage and assignment activities written');
select pg_temp.assert((select summary from public.lead_activities where kind = 'stage_changed') = 'Stage: New → Contacted', 'stage summary');
select pg_temp.assert_raises(
  $$insert into public.lead_activities (organization_id, lead_id, kind, summary, actor_id)
    select organization_id, id, 'email', 'fake email sent', '00000000-0000-0000-0000-00000000000a' from public.leads limit 1$$,
  'row-level security', 'users cannot forge system activities');
insert into public.lead_activities (organization_id, lead_id, kind, summary, actor_id)
select organization_id, id, 'note', 'Prefers WhatsApp', '00000000-0000-0000-0000-00000000000a' from public.leads where full_name = 'Bianca Buyer';

-- Consent: append-only, newest wins in the view.
insert into public.consent_records (organization_id, lead_id, channel, status, basis, source, captured_at, recorded_by)
select organization_id, id, 'sms', 'granted', 'express_written', 'Landing page form v2, SMS checkbox', now() - interval '2 days',
       '00000000-0000-0000-0000-00000000000a' from public.leads where full_name = 'Bianca Buyer';
select pg_temp.assert((select status from public.lead_consent_latest where channel = 'sms') = 'granted', 'consent granted');
insert into public.consent_records (organization_id, lead_id, channel, status, basis, source, recorded_by)
select organization_id, id, 'sms', 'withdrawn', 'none_recorded', 'Replied STOP', '00000000-0000-0000-0000-00000000000a'
from public.leads where full_name = 'Bianca Buyer';
select pg_temp.assert((select status from public.lead_consent_latest where channel = 'sms') = 'withdrawn', 'newest consent wins');
select pg_temp.assert_raises($$update public.consent_records set status = 'granted'$$, 'permission denied', 'consent cannot be edited');
select pg_temp.assert_raises($$delete from public.consent_records$$, 'permission denied', 'consent cannot be deleted');
select pg_temp.assert_raises(
  $$insert into public.consent_records (organization_id, lead_id, channel, status, basis, source, recorded_by)
    select organization_id, id, 'email', 'granted', 'express', 'Form', '00000000-0000-0000-0000-00000000000c' from public.leads limit 1$$,
  'row-level security', 'cannot record consent as someone else');

-- Suppression: all-channel opt-out moves matching leads to "opted out".
insert into public.suppression_entries (organization_id, value_type, value, reason, source, created_by)
select alpha, 'phone', '+13125550111', 'opt_out', 'Said stop on a call', '00000000-0000-0000-0000-00000000000a' from t_ids;
select pg_temp.assert((select s.key from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.full_name = 'Bianca Buyer') = 'opted_out',
  'opt-out moves lead to opted_out');
select pg_temp.assert(exists (select 1 from public.lead_activities where kind = 'suppressed'), 'suppression on timeline');
select pg_temp.assert_raises(
  $$insert into public.suppression_entries (organization_id, value_type, value, reason, created_by)
    select alpha, 'phone', '+13125550111', 'manual', '00000000-0000-0000-0000-00000000000a' from t_ids$$,
  'suppression_unique', 'one all-channel entry per value');
-- A channel-specific entry for the same value is allowed and does not change the stage.
insert into public.suppression_entries (organization_id, value_type, value, channel, reason, created_by)
select alpha, 'phone', '+13125550111', 'ai_voice_call', 'manual', '00000000-0000-0000-0000-00000000000a' from t_ids;
select pg_temp.assert_raises(
  $$insert into public.suppression_entries (organization_id, value_type, value, reason, created_by)
    select alpha, 'email', 'Mixed@Case.com', 'manual', '00000000-0000-0000-0000-00000000000a' from t_ids$$,
  'check', 'suppression values must be normalized');
select pg_temp.logout();

-- The rep can record an opt-out for their own lead, but cannot lift one.
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
insert into public.suppression_entries (organization_id, value_type, value, reason, lead_id, created_by)
select l.organization_id, 'email', l.email_normalized, 'unsubscribe', l.id, '00000000-0000-0000-0000-00000000000d' from public.leads l;
delete from public.suppression_entries;
select pg_temp.logout();
select pg_temp.assert((select count(*) from public.suppression_entries where organization_id = (select alpha from t_ids)) = 3, 'rep could not lift suppressions');

-- Import: creates, skips duplicates, flags suppressed people, records consent, is idempotent.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
create temp table t_import as
select public.import_leads(
  (select alpha from t_ids),
  '[
    {"row_number": 2, "full_name": "Ivan Investor", "email": "ivan@example.com", "country": "US", "segment": "investor",
     "tags": ["luxury", "q4"], "consent": [{"channel": "email", "basis": "express", "source": "Open house sign-up sheet"}]},
    {"row_number": 3, "full_name": "Bianca Again", "email": "bianca@example.com"},
    {"row_number": 4, "full_name": "Sam Seller", "phone_e164": "+13125550199", "segment": "seller", "timeline": "within_3_months"},
    {"row_number": 5, "full_name": "Bad Segment", "email": "bad@example.com", "segment": "alien"}
  ]'::jsonb,
  (select id from public.lead_sources where name = 'CSV import' and organization_id = (select alpha from t_ids)),
  'skip', 'leads.csv', 'abc123') as r;
grant all on t_import to authenticated;
select pg_temp.assert((select (r ->> 'created')::int from t_import) = 2, 'import created two');
select pg_temp.assert((select (r ->> 'skipped')::int from t_import) = 2, 'import skipped duplicate and bad row');
select pg_temp.assert((select r -> 'results' -> 3 ->> 'outcome' from t_import) = 'error', 'bad row reported');
select pg_temp.assert((select tags from public.leads where full_name = 'Ivan Investor') = array['luxury', 'q4'], 'tags imported');
select pg_temp.assert((select basis from public.lead_consent_latest c join public.leads l on l.id = c.lead_id where l.full_name = 'Ivan Investor') = 'express',
  'consent imported');
select pg_temp.assert((select kind from public.lead_activities a join public.leads l on l.id = a.lead_id where l.full_name = 'Ivan Investor' order by occurred_at limit 1) = 'imported',
  'import activity kind');
-- Re-run with update: no new leads; tags merge.
select public.import_leads((select alpha from t_ids),
  '[{"row_number": 2, "full_name": "Ivan Investor", "email": "IVAN@example.com", "tags": ["vip"], "preferred_location": "Austin"}]'::jsonb,
  null, 'update', 'leads.csv', 'abc124');
select pg_temp.assert((select count(*) from public.leads where full_name = 'Ivan Investor') = 1, 're-import did not duplicate');
select pg_temp.assert((select tags from public.leads where full_name = 'Ivan Investor') @> array['luxury', 'q4', 'vip'], 'tags merged');
select pg_temp.assert((select preferred_location from public.leads where full_name = 'Ivan Investor') = 'Austin', 'fields updated');
-- A suppressed person in a file keeps their suppression; consent from the file is ignored.
select public.import_leads((select alpha from t_ids),
  '[{"row_number": 2, "full_name": "Opted Out Person", "phone_e164": "+447700900123", "consent": [{"channel": "sms", "basis": "express", "source": "list"}]}]'::jsonb,
  null, 'skip', 'other.csv', 'x');
select pg_temp.logout();
insert into public.suppression_entries (organization_id, value_type, value, reason)
select alpha, 'phone', '+447700900999', 'do_not_call' from t_ids;
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
create temp table t_import2 as select public.import_leads((select alpha from t_ids),
  '[{"row_number": 2, "full_name": "Dina DoNotCall", "phone_e164": "+447700900999", "consent": [{"channel": "sms", "basis": "express", "source": "list"}]}]'::jsonb,
  null, 'skip', 'third.csv', 'y') as r;
select pg_temp.assert((select (r ->> 'suppressed')::int from t_import2) = 1, 'suppressed row flagged');
select pg_temp.assert(not exists (select 1 from public.consent_records c join public.leads l on l.id = c.lead_id where l.full_name = 'Dina DoNotCall'),
  'file consent does not override suppression');
select pg_temp.logout();

-- Plan contact limit (lowered to 5 for the test). Inserting past it fails, and a whole import rolls back.
update public.plans set max_contacts = 5 where key = 'trial';
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert((select count(*) from public.leads) = 5, 'five leads before limit test');
select pg_temp.assert_raises(
  format($$insert into public.leads (organization_id, full_name, email, stage_id) values (%L, 'Seventh', 'seven@x.com', %L)$$,
         (select alpha from t_ids), (select pg_temp.stage(alpha, 'new') from t_ids)),
  'contact limit', 'insert past plan limit rejected');
select pg_temp.assert_raises(
  format($$select public.import_leads(%L, '[{"row_number":2,"full_name":"A","email":"a1@x.com"},{"row_number":3,"full_name":"B","email":"b1@x.com"}]'::jsonb, null)$$,
         (select alpha from t_ids)),
  'contact limit', 'import past plan limit rejected');
select pg_temp.assert((select count(*) from public.leads) = 5, 'nothing from the rejected import was kept');

-- Erasure: deletes the lead and history, redacts audit, keeps suppression.
select public.erase_lead((select alpha from t_ids), (select id from public.leads where full_name = 'Ivan Investor'));
select pg_temp.assert(not exists (select 1 from public.leads where full_name = 'Ivan Investor'), 'lead erased');
-- The only remaining copy is the suppression entry erasure keeps on purpose (and its audit row).
select pg_temp.assert(not exists (select 1 from public.audit_logs where table_name <> 'suppression_entries'
  and coalesce(old_data, new_data)::text like '%ivan@example.com%'), 'audit redacted');
select pg_temp.assert(exists (select 1 from public.audit_logs where action = 'ERASE'), 'erasure logged');
select pg_temp.assert(exists (select 1 from public.suppression_entries where value = 'ivan@example.com' and reason = 'erasure'), 'suppression kept after erasure');
-- Leads cannot be deleted directly.
delete from public.leads where full_name = 'Sam Seller';
select pg_temp.assert(exists (select 1 from public.leads where full_name = 'Sam Seller'), 'direct delete is a no-op');

-- Metrics come from stored rows.
select pg_temp.assert(((public.lead_metrics((select alpha from t_ids), now() - interval '1 day', now() + interval '1 minute', now() - interval '1 day')) ->> 'opted_out')::int = 1,
  'opted-out metric');
select pg_temp.logout();

rollback;
