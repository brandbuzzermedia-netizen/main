begin;
\ir 00_helpers.sql.inc
\ir 00_setup.sql.inc

create or replace function pg_temp.deal_stage(p_org uuid, p_name text) returns uuid language sql as $$
  select id from public.deal_stages where organization_id = p_org and name = p_name
$$;

select pg_temp.assert((select count(*) from public.deal_stages where organization_id = (select alpha from t_ids)) = 7, 'deal stages seeded for new orgs');

-- Admin creates two leads: one for the rep, one unassigned.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.leads (organization_id, full_name, email, stage_id, owner_id)
select alpha, 'Rep Lead', 'rep.lead@example.com', pg_temp.stage(alpha, 'new'), '00000000-0000-0000-0000-00000000000d'::uuid from t_ids;
insert into public.leads (organization_id, full_name, email, stage_id)
select alpha, 'Other Lead', 'other.lead@example.com', pg_temp.stage(alpha, 'new') from t_ids;
create temp table t_lead as select
  (select id from public.leads where full_name = 'Rep Lead') as rep_lead,
  (select id from public.leads where full_name = 'Other Lead') as other_lead;
grant all on t_lead to authenticated;

-- Logging an outbound call: last contacted, stage new → contacted, timeline entry.
select public.log_interaction((select alpha from t_ids), (select other_lead from t_lead), 'call', 'outbound', 'connected', 'Discussed 3-bed homes in Austin');
select pg_temp.assert((select last_contacted_at from public.leads where full_name = 'Other Lead') is not null, 'last_contacted_at set');
select pg_temp.assert((select s.key from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.full_name = 'Other Lead') = 'contacted', 'new lead moved to contacted');
select pg_temp.assert((select data ->> 'outcome' from public.lead_activities where kind = 'call') = 'connected', 'call outcome stored');
-- Inbound messages do not count as contacting the lead.
select public.log_interaction((select alpha from t_ids), (select rep_lead from t_lead), 'email', 'inbound', null, 'Asked about pricing');
select pg_temp.assert((select last_contacted_at from public.leads where full_name = 'Rep Lead') is null, 'inbound does not set last contacted');
select pg_temp.assert_raises(
  format($$select public.log_interaction(%L, %L, 'telepathy', 'outbound', null, 'x')$$, (select alpha from t_ids), (select rep_lead from t_lead)),
  'unknown interaction', 'unknown kind rejected');
select pg_temp.assert_raises(
  format($$select public.log_interaction(%L, %L, 'call', 'outbound', null, 'x', now() + interval '1 day')$$, (select alpha from t_ids), (select rep_lead from t_lead)),
  'not in the future', 'future interaction rejected');

-- Deals: closed_at follows the stage category.
insert into public.deals (organization_id, lead_id, title, value_minor, commission_minor, currency, stage_id, owner_id)
select alpha, (select other_lead from t_lead), '12 Oak St purchase', 50000000, 1500000, 'USD', pg_temp.deal_stage(alpha, 'Offer made'),
       '00000000-0000-0000-0000-00000000000a'::uuid from t_ids;
select pg_temp.assert((select closed_at from public.deals) is null, 'open deal has no closed_at');
update public.deals set stage_id = (select pg_temp.deal_stage(alpha, 'Closed won') from t_ids);
select pg_temp.assert((select closed_at from public.deals) is not null, 'won deal gets closed_at');
update public.deals set stage_id = (select pg_temp.deal_stage(alpha, 'Negotiation') from t_ids);
select pg_temp.assert((select closed_at from public.deals) is null, 'reopened deal clears closed_at');
update public.deals set stage_id = (select pg_temp.deal_stage(alpha, 'Closed won') from t_ids);
select pg_temp.assert((select count(*) from public.lead_activities where kind = 'deal') = 4, 'deal changes on the timeline');
select pg_temp.assert_raises(
  $$update public.deals set owner_id = '00000000-0000-0000-0000-00000000000b'$$,
  'member of this organization', 'deal owner must be a member');
select pg_temp.assert_raises(
  format($$insert into public.deal_stages (organization_id, name, category, probability) values (%L, 'Bad', 'won', 50)$$, (select alpha from t_ids)),
  'check', 'won stages are 100%');

-- Appointments: booking moves an early lead to "Appointment booked"; status changes are logged.
insert into public.appointments (organization_id, lead_id, kind, title, starts_at, ends_at, assigned_to)
select alpha, (select rep_lead from t_lead), 'viewing', 'Viewing at 12 Oak St', now() + interval '2 days', now() + interval '2 days 1 hour',
       '00000000-0000-0000-0000-00000000000d'::uuid from t_ids;
select pg_temp.assert((select s.key from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.full_name = 'Rep Lead') = 'appointment_booked',
  'booking moves lead to appointment booked');
select pg_temp.assert_raises(
  format($$insert into public.appointments (organization_id, lead_id, title, starts_at, ends_at) values (%L, %L, 'x', now(), now() - interval '1 hour')$$,
         (select alpha from t_ids), (select rep_lead from t_lead)),
  'check', 'appointment must end after it starts');
select pg_temp.assert_raises(
  format($$insert into public.appointments (organization_id, lead_id, title, starts_at, ends_at, source) values (%L, %L, 'x', now(), now() + interval '1 hour', 'calendar')$$,
         (select alpha from t_ids), (select rep_lead from t_lead)),
  'row-level security', 'users cannot create calendar-confirmed appointments');
-- A converted lead is never moved backwards by a booking.
update public.leads set stage_id = (select pg_temp.stage(alpha, 'converted') from t_ids) where full_name = 'Other Lead';
insert into public.appointments (organization_id, lead_id, title, starts_at, ends_at)
select alpha, (select other_lead from t_lead), 'Handover', now() + interval '1 day', now() + interval '1 day 30 minutes' from t_ids;
select pg_temp.assert((select s.key from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.full_name = 'Other Lead') = 'converted',
  'booking never moves a lead backwards');

-- Tasks: completion time follows status.
insert into public.tasks (organization_id, lead_id, title, due_at, assignee_id)
select alpha, (select rep_lead from t_lead), 'Send floor plans', now() - interval '1 hour', '00000000-0000-0000-0000-00000000000d'::uuid from t_ids;
insert into public.tasks (organization_id, lead_id, title, assignee_id)
select alpha, (select other_lead from t_lead), 'Admin-only task', '00000000-0000-0000-0000-00000000000a'::uuid from t_ids;
select pg_temp.logout();

-- The rep sees only CRM records on their lead or assigned to them.
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert((select count(*) from public.deals) = 0, 'rep sees no deals on other leads');
select pg_temp.assert((select count(*) from public.tasks) = 1, 'rep sees only own tasks');
select pg_temp.assert((select count(*) from public.appointments) = 1, 'rep sees only appointments on own lead');
update public.tasks set status = 'done';
select pg_temp.assert((select completed_at from public.tasks) is not null, 'completed_at set');
select pg_temp.assert_raises(
  $$update public.tasks set assignee_id = '00000000-0000-0000-0000-00000000000c'$$,
  'row-level security', 'rep cannot hand a task to someone else');
insert into public.deals (organization_id, lead_id, title, currency, stage_id, owner_id)
select alpha, (select rep_lead from t_lead), 'Rep deal', 'USD', pg_temp.deal_stage(alpha, 'Qualified'), '00000000-0000-0000-0000-00000000000d'::uuid from t_ids;
select pg_temp.assert_raises(
  format($$insert into public.deals (organization_id, lead_id, title, currency, stage_id, owner_id) values (%L, %L, 'x', 'USD', %L, %L)$$,
         (select alpha from t_ids), (select other_lead from t_lead), (select pg_temp.deal_stage(alpha, 'Qualified') from t_ids), '00000000-0000-0000-0000-00000000000d'),
  'row-level security', 'rep cannot open a deal on someone else''s lead');
select pg_temp.assert_raises(
  format($$select public.log_interaction(%L, %L, 'call', 'outbound', null, 'x')$$, (select alpha from t_ids), (select other_lead from t_lead)),
  'not allowed', 'rep cannot log on someone else''s lead');
select pg_temp.assert(((public.crm_dashboard((select alpha from t_ids), now() - interval '7 days', now() + interval '1 minute')) ->> 'open_deals')::int = 1,
  'rep dashboard counts only visible deals');
select pg_temp.logout();

-- Read-only reads but cannot write.
update public.subscriptions set plan_key = 'starter', status = 'active' where organization_id = (select alpha from t_ids);
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.add_member((select alpha from t_ids), '00000000-0000-0000-0000-00000000000e', 'read_only');
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select pg_temp.assert((select count(*) from public.deals) = 2, 'read-only sees all deals');
select pg_temp.assert_raises(
  format($$insert into public.tasks (organization_id, title) values (%L, 'x')$$, (select alpha from t_ids)),
  'row-level security', 'read-only cannot create tasks');
select pg_temp.logout();

-- Other tenant sees nothing.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert((select count(*) from public.deals) + (select count(*) from public.tasks) + (select count(*) from public.appointments) = 0, 'beta sees no alpha CRM records');
select pg_temp.assert_raises(
  format($$select public.log_interaction(%L, %L, 'call', 'outbound', null, 'x')$$, (select alpha from t_ids), (select other_lead from t_lead)),
  'not allowed', 'cross-tenant logging rejected');
select pg_temp.logout();

-- Dashboard figures for the admin.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t_dash as select public.crm_dashboard((select alpha from t_ids), now() - interval '7 days', now() + interval '1 minute') as d;
select pg_temp.assert((select (d ->> 'won_count')::int from t_dash) = 1, 'won deals counted');
select pg_temp.assert((select (d ->> 'won_commission')::bigint from t_dash) = 1500000, 'won commission summed');
select pg_temp.assert((select (d ->> 'open_deals')::int from t_dash) = 1, 'open deals counted');
select pg_temp.assert((select (d ->> 'appointments_upcoming')::int from t_dash) = 2, 'upcoming appointments');
select pg_temp.assert((select (d ->> 'contacted_leads')::int from t_dash) = 1, 'contacted leads from outbound interactions');
select pg_temp.assert((select (d -> 'interactions' ->> 'call')::int from t_dash) = 1, 'interactions by kind');
select pg_temp.assert((select jsonb_array_length(d -> 'leads_series') from t_dash) between 7 and 9, 'one series point per day');
select pg_temp.assert((select sum((p ->> 'count')::int) from t_dash, jsonb_array_elements(d -> 'leads_series') p) = 2, 'series sums to leads created');
select pg_temp.assert((select (d ->> 'cohort_with_appointment')::int from t_dash) = 2, 'leads with an appointment');
select pg_temp.assert((select jsonb_array_length(d -> 'leaderboard') from t_dash) = 3, 'leaderboard lists working members');
select pg_temp.logout();

rollback;
