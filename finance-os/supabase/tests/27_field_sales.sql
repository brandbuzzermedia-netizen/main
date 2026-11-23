begin;
\ir 00_helpers.sql.inc
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated, service_role;
alter table t add column org uuid;
alter table t add column lead uuid;
alter table t add column lead2 uuid;
update t set org = public.create_company(grp, '{"name":"GBS","slug":"gbs-field"}');
insert into public.memberships (organization_id, user_id, role) select org, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t;
with x as (insert into public.contacts (organization_id, full_name, company_name, phone_e164, field_status, field_segment, area, lat, lng, source)
  select org, 'Ravi', 'Shine Detailing', '+919800000001', 'to_visit', 'car_detailing', 'HSR Layout', 12.9116, 77.6474, 'Walk-in' from t returning id)
update t set lead = (select id from x);
with x as (insert into public.contacts (organization_id, full_name, company_name, phone_e164, field_status, field_segment)
  select org, 'Anil', 'Anil Motors', '+919800000002', 'to_visit', 'used_car_dealer' from t returning id)
update t set lead2 = (select id from x);

alter table t add column lead3 uuid;
with x as (insert into public.contacts (organization_id, full_name, company_name, field_status) select org, 'Kiran', 'Kiran Cars', 'to_visit' from t returning id)
update t set lead3 = (select id from x);
insert into public.pipeline_stages (organization_id, name, position, kind, probability_pct)
  select org, n, p, k, pr from t, (values ('Lead', 1, 'open', 10), ('Demo', 2, 'meeting', 30), ('Proposal', 3, 'proposal', 60), ('Won', 4, 'won', 100), ('Lost', 5, 'lost', 0)) v(n, p, k, pr);
create or replace function pg_temp.deal_kind(c uuid) returns text language sql as $$
  select s.kind from public.contacts x join public.deals d on d.id = x.auto_deal_id join public.pipeline_stages s on s.id = d.stage_id where x.id = c $$;

-- Lat and lng go together; segment and status are checked.
select pg_temp.assert_raises($$update public.contacts set lat = 12.9 , lng = null where id = (select lead from t)$$, 'contacts_lat_lng_together', 'lat without lng is refused');
select pg_temp.assert_raises($$update public.contacts set field_status = 'maybe' where id = (select lead from t)$$, 'check', 'unknown status refused');

-- Owner absent: follow-up on the day they are back, owner-back time kept, lead status moves to contacted.
insert into public.field_visits (organization_id, contact_id, outcome, owner_back_at, lat, lng)
  select org, lead, 'owner_absent', '2026-11-25 16:00+05:30', 12.9117, 77.6475 from t;
select pg_temp.assert((select field_status from public.contacts where id = (select lead from t)) = 'owner_absent', 'owner absent status');
select pg_temp.assert((select next_follow_up_on from public.contacts where id = (select lead from t)) = '2026-11-25', 'follow-up when the owner is back');
select pg_temp.assert((select owner_back_at from public.contacts where id = (select lead from t)) = '2026-11-25 16:00+05:30', 'owner-back time kept');
select pg_temp.assert((select lead_status from public.contacts where id = (select lead from t)) = 'contacted', 'lead status contacted');
select pg_temp.assert((select auto_deal_id from public.contacts where id = (select lead from t)) is null, 'no deal while only the owner was absent');

-- Interested: lead becomes qualified (pipeline automation applies).
insert into public.field_visits (organization_id, contact_id, outcome) select org, lead, 'interested' from t;
select pg_temp.assert((select field_status from public.contacts where id = (select lead from t)) = 'interested', 'interested');
select pg_temp.assert((select lead_status from public.contacts where id = (select lead from t)) = 'qualified', 'lead qualified');
select pg_temp.assert(pg_temp.deal_kind((select lead from t)) = 'proposal', 'interested: deal in the proposal stage');
select pg_temp.assert((select count(*) from public.deals where account_name = 'Shine Detailing') = 1, 'exactly one deal');
select pg_temp.assert((select owner_back_at from public.contacts where id = (select lead from t)) is null, 'owner-back time cleared');

-- A later owner-absent visit never moves the lead backwards.
insert into public.field_visits (organization_id, contact_id, outcome) select org, lead, 'owner_absent' from t;
select pg_temp.assert((select field_status from public.contacts where id = (select lead from t)) = 'interested', 'never backwards');

-- Advance paid: customer, a delivery task due in 7 days, one handoff, one team notification.
insert into public.field_visits (organization_id, contact_id, outcome, amount_minor) select org, lead, 'paid_advance', 750000 from t;
select pg_temp.assert((select field_status from public.contacts where id = (select lead from t)) = 'advance_paid', 'advance paid');
select pg_temp.assert((select lead_status from public.contacts where id = (select lead from t)) = 'customer', 'lead is a customer');
select pg_temp.assert(pg_temp.deal_kind((select lead from t)) = 'won', 'advance paid: deal won');
select pg_temp.assert((select d.closed_at is not null from public.contacts c join public.deals d on d.id = c.auto_deal_id where c.id = (select lead from t)), 'won deal is closed');
select pg_temp.assert((select auto_client_id from public.contacts where id = (select lead from t)) is not null, 'customer becomes a client for invoicing');
select pg_temp.assert((select deal_id from public.tasks where title = 'Deliver: Shine Detailing') = (select auto_deal_id from public.contacts where id = (select lead from t)), 'delivery task linked to the deal');
select pg_temp.assert((select count(*) from public.delivery_handoffs where contact_id = (select lead from t)) = 1, 'one handoff');
select pg_temp.assert((select due_on from public.tasks where title = 'Deliver: Shine Detailing') = (now() at time zone 'Asia/Kolkata')::date + 7, 'delivery task due in 7 days');
select pg_temp.assert((select count(*) from public.activity_feed where kind = 'delivery_handoff') = 1, 'team notified');
-- Moving away and back does not create a second handoff.
update public.contacts set field_status = 'interested' where id = (select lead from t);
update public.contacts set field_status = 'advance_paid' where id = (select lead from t);
select pg_temp.assert((select count(*) from public.delivery_handoffs where contact_id = (select lead from t)) = 1, 'still one handoff');

-- Not interested: lost with the reason from the note; lead disqualified.
insert into public.field_visits (organization_id, contact_id, outcome, note) select org, lead2, 'not_interested', 'Uses another agency' from t;
select pg_temp.assert((select field_status || '|' || lost_reason || '|' || lead_status from public.contacts where id = (select lead2 from t)) = 'lost|Uses another agency|disqualified', 'lost with reason');
select pg_temp.assert((select next_follow_up_on from public.contacts where id = (select lead2 from t)) is null, 'no follow-up for lost');
select pg_temp.assert((select auto_deal_id from public.contacts where id = (select lead2 from t)) is null, 'lost before any demo: no deal');
-- Demo shown -> deal in the meeting stage; then not interested -> deal lost with the reason.
insert into public.field_visits (organization_id, contact_id, outcome) select org, lead3, 'demo_shown' from t;
select pg_temp.assert(pg_temp.deal_kind((select lead3 from t)) = 'meeting', 'demo shown: deal in the meeting stage');
insert into public.field_visits (organization_id, contact_id, outcome, note) select org, lead3, 'not_interested', 'Too expensive' from t;
select pg_temp.assert(pg_temp.deal_kind((select lead3 from t)) = 'lost', 'not interested: deal lost');
select pg_temp.assert((select d.lost_reason from public.contacts c join public.deals d on d.id = c.auto_deal_id where c.id = (select lead3 from t)) = 'Too expensive', 'lost reason on the deal');

-- Route plans: at most 9 stops.
insert into public.field_route_plans (organization_id, plan_date, contact_ids) select org, '2026-11-23', array[lead, lead2] from t;
select pg_temp.assert_raises($$insert into public.field_route_plans (organization_id, plan_date, contact_ids) select org, '2026-11-24', array_fill(lead, array[10]) from t$$, 'check', 'more than 9 stops refused');
select pg_temp.logout();

-- A sales rep sees only visits on their own leads and cannot log visits on leads they cannot see.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.field_visits) = 0, 'rep sees no visits on others'' leads');
select pg_temp.assert((select count(*) from public.field_route_plans) = 0, 'route plans are personal');
select pg_temp.assert_raises($$insert into public.field_visits (organization_id, contact_id, outcome) select org, lead2, 'demo_shown' from t$$, 'row-level security', 'rep cannot log on hidden lead');
select pg_temp.logout();

-- Outsiders see nothing.
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert((select count(*) from public.delivery_handoffs) = 0, 'outsiders see no handoffs');
select pg_temp.logout();
rollback;
