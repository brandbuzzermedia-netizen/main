begin;
\ir 00_helpers.sql.inc
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated, service_role;
alter table t add column org uuid;
alter table t add column lead uuid;
alter table t add column own uuid;
update t set org = public.create_company(grp, '{"name":"GBS","slug":"gbs-maps"}');
-- A place added from Google: only the place ID and a Google pin.
with x as (insert into public.contacts (organization_id, full_name, field_status, needs_confirm, place_id, lat, lng, coords_fetched_at)
  select org, 'Unconfirmed place', 'to_visit', true, 'ChIJgoogle', 12.91, 77.64, now() - interval '10 days' from t returning id) update t set lead = (select id from x);
-- A lead the person pinned themselves.
with x as (insert into public.contacts (organization_id, full_name, field_status, lat, lng) select org, 'Own Shop', 'to_visit', 12.95, 77.60 from t returning id) update t set own = (select id from x);

-- Pins younger than 30 days stay.
select pg_temp.assert(public.expire_google_coords((select org from t)) = 0, 'nothing expires before 30 days');
-- A check-in with a location replaces the Google pin with the phone's own reading.
insert into public.field_visits (organization_id, contact_id, outcome, lat, lng) select org, lead, 'owner_absent', 12.9123, 77.6412 from t;
select pg_temp.assert((select lat = 12.9123 and coords_fetched_at is null from public.contacts where id = (select lead from t)), 'check-in location replaces the Google pin');
-- A check-in never moves a pin the person set themselves.
insert into public.field_visits (organization_id, contact_id, outcome, lat, lng) select org, own, 'owner_absent', 12.0, 77.0 from t;
select pg_temp.assert((select lat from public.contacts where id = (select own from t)) = 12.95, 'own pin kept');

-- Google pins older than 30 days are cleared; own pins never are.
update public.contacts set lat = 12.91, lng = 77.64, coords_fetched_at = now() - interval '31 days' where id = (select lead from t);
select pg_temp.assert(public.expire_google_coords((select org from t)) = 1, 'one expired');
select pg_temp.assert((select lat is null and lng is null and place_id = 'ChIJgoogle' from public.contacts where id = (select lead from t)), 'pin cleared, place ID kept');
select pg_temp.assert((select lat from public.contacts where id = (select own from t)) = 12.95, 'own pin untouched');
select pg_temp.logout();

-- Outsiders cannot expire another company's pins.
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert(public.expire_google_coords((select org from t)) = 0, 'outsiders do nothing');
select pg_temp.logout();
rollback;
