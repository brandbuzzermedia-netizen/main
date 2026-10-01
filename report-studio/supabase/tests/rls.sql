-- Row-level security checks, run by scripts/check-db.sh after the seed.
-- Each block impersonates a user and asserts what they can see or change.
\set ON_ERROR_STOP on
\o /dev/null

-- Fixtures: a GBS staff member, a second agency with its own staff and
-- client, and a client viewer for Thrishank.
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'mehul@getbeeseen.com'),
  ('10000000-0000-4000-8000-000000000002', 'other@agency.test'),
  ('10000000-0000-4000-8000-000000000003', 'owner@thrishank.test');
insert into public.agencies (id, name) values ('00000000-0000-4000-8000-0000000000a2', 'Other Agency');
insert into public.clients (id, agency_id, name, slug) values
  ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000a2', 'Other Client', 'other');
insert into public.users (id, agency_id, role, client_id) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'owner', null),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a2', 'staff', null),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a1', 'client_viewer', '00000000-0000-4000-8000-0000000000c1');
insert into storage.objects (bucket_id, name) values
  ('report-assets', '00000000-0000-4000-8000-0000000000a1/thrishank/2026-08/ig.png'),
  ('report-assets', '00000000-0000-4000-8000-0000000000a2/other/x.png');

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'RLS check failed: %', what; end if;
  raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated;

-- GBS staff
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) from public.clients) = 3, 'staff sees only their 3 clients');
select pg_temp.check((select count(*) from public.reports) = 5, 'staff sees their 5 reports');
select pg_temp.check((select count(*) from public.internal_notes) = 1, 'staff sees internal notes');
select pg_temp.check((select count(*) from storage.objects) = 1, 'staff sees only their agency''s files');
insert into public.clients (agency_id, name, slug) values ('00000000-0000-4000-8000-0000000000a1', 'New Client', 'new-client');
select pg_temp.check((select count(*) from public.clients) = 4, 'staff can create a client');
do $$ begin
  insert into public.clients (agency_id, name, slug) values ('00000000-0000-4000-8000-0000000000a2', 'Sneaky', 'sneaky');
  raise exception 'staff wrote into another agency';
exception when insufficient_privilege then raise notice 'ok: staff cannot write into another agency';
end $$;
reset role;

-- Other agency's staff
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select pg_temp.check((select count(*) from public.clients) = 1, 'other agency sees only its own client');
select pg_temp.check((select count(*) from public.reports) = 0, 'other agency sees no GBS reports');
select pg_temp.check((select count(*) from public.extracted_metrics) = 0, 'other agency sees no GBS metrics');
reset role;

-- Client viewer, report not yet shared
set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select pg_temp.check((select count(*) from public.reports) = 0, 'viewer sees nothing before sharing');
reset role;

update public.reports set shared_with_client = true where id = '00000000-0000-4000-8000-0000000000e1';

set role authenticated;
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select pg_temp.check((select count(*) from public.reports) = 1, 'viewer sees the one shared report');
select pg_temp.check((select count(*) from public.clients) = 1, 'viewer sees only their own client');
select pg_temp.check((select count(*) from public.social_post_metrics) = 42, 'viewer sees post metrics of the shared report');
select pg_temp.check((select count(*) from public.internal_notes) = 0, 'viewer never sees internal notes');
select pg_temp.check((select count(*) from public.insights) = 0, 'viewer never sees insight confidence');
select pg_temp.check((select count(*) from storage.objects) = 0, 'viewer has no direct storage access');
update public.reports set status = 'Delivered';
select pg_temp.check((select count(*) from public.reports where status = 'Delivered') = 0, 'viewer cannot change a report');
reset role;
