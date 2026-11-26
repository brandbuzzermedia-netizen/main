begin;
\ir 00_helpers.sql.inc
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated, service_role;
alter table t add column org uuid;
alter table t add column lead uuid;
update t set org = public.create_company(grp, '{"name":"GBS","slug":"gbs-google"}');
insert into public.memberships (organization_id, user_id, role) select org, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t;
with x as (insert into public.contacts (organization_id, full_name, field_status) select org, 'Ravi', 'to_visit' from t returning id) update t set lead = (select id from x);

-- Each person stores only their own (encrypted) Google tokens.
insert into public.google_connections (refresh_token_enc, google_email) values ('v1.sealed', 'owner@example.com');
select pg_temp.assert_raises($$insert into public.google_connections (user_id, refresh_token_enc) values ('00000000-0000-0000-0000-00000000000c', 'x')$$, 'row-level security', 'cannot store tokens for someone else');

-- Meetings carry the lead, the kind and the Meet link; only real Meet links are accepted.
insert into public.meetings (organization_id, title, starts_at, owner_id, contact_id, kind, meet_url, calendar_url, attendee_email)
  select org, 'Demo: Ravi', now() + interval '1 day', auth.uid(), lead, 'meet', 'https://meet.google.com/abc-defg-hij', 'https://www.google.com/calendar/event?eid=x', 'ravi@shine.in' from t;
select pg_temp.assert((select count(*) from public.meetings where contact_id = (select lead from t)) = 1, 'meeting linked to the lead');
select pg_temp.assert_raises($$insert into public.meetings (organization_id, title, starts_at, owner_id, meet_url) select org, 'Bad', now(), auth.uid(), 'https://evil.example/meet' from t$$, 'check', 'only Google Meet links');
select pg_temp.assert_raises($$insert into public.meetings (organization_id, title, starts_at, owner_id, kind) select org, 'Bad', now(), auth.uid(), 'zoom' from t$$, 'check', 'known meeting kinds only');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.google_connections) = 0, 'others cannot see my Google connection');
select pg_temp.logout();
rollback;
