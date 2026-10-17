begin;
\ir 00_helpers.sql.inc

-- Founder A and an unrelated user B each create an organization.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t_ids as select public.create_organization('GBS') as org_a;
grant all on t_ids to authenticated;
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
alter table t_ids add column org_b uuid;
update t_ids set org_b = public.create_organization('Other Agency');
select pg_temp.logout();

-- A creates two clients; one is owned by the account manager D.
insert into public.memberships (organization_id, user_id, role)
select org_a, '00000000-0000-0000-0000-00000000000c'::uuid, 'viewer' from t_ids union all
select org_a, '00000000-0000-0000-0000-00000000000d'::uuid, 'account_manager' from t_ids;

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.clients (organization_id, client_code, legal_name, account_owner_id)
select org_a, 'SHOBHA', 'Shobha Decor Pvt Ltd', '00000000-0000-0000-0000-00000000000d'::uuid from t_ids union all
select org_a, 'LYKES', 'Lykes Furniture LLP', null::uuid from t_ids;
select pg_temp.assert((select count(*) from public.clients) = 2, 'founder sees own clients');
select pg_temp.assert((select count(*) from public.memberships) = 3, 'founder sees roster');
select pg_temp.logout();

-- B sees none of A's data and cannot write into A's org.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert((select count(*) from public.clients) = 0, 'other org sees no clients');
select pg_temp.assert((select count(*) from public.organizations) = 1, 'other org sees only itself');
select pg_temp.assert_raises(
  format($$insert into public.clients (organization_id, client_code, legal_name) values (%L, 'HACK', 'x')$$, (select org_a from t_ids)),
  'row-level security', 'cross-tenant insert is rejected');
select pg_temp.assert_raises(
  format($$insert into public.memberships (organization_id, user_id, role) values (%L, '00000000-0000-0000-0000-00000000000b', 'owner')$$, (select org_a from t_ids)),
  'row-level security', 'cannot add yourself to another org');
update public.clients set legal_name = 'pwned';
select pg_temp.logout();
select pg_temp.assert((select count(*) from public.clients where legal_name = 'pwned') = 0, 'cross-tenant update affected nothing');

-- Viewer reads everything, writes nothing.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.clients) = 2, 'viewer reads clients');
select pg_temp.assert_raises(
  format($$insert into public.clients (organization_id, client_code, legal_name) values (%L, 'NEW', 'x')$$, (select org_a from t_ids)),
  'row-level security', 'viewer cannot insert');
select pg_temp.assert_raises(
  format($$select public.import_invoices(%L, 'manual', '[]'::jsonb)$$, (select org_a from t_ids)),
  'not allowed', 'viewer cannot import');
select pg_temp.logout();

-- Account manager sees only clients they own, and cannot see payments.
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert((select count(*) from public.clients) = 1, 'account manager sees only own client');
select pg_temp.assert((select client_code from public.clients) = 'SHOBHA', 'account manager sees the right client');
select pg_temp.assert((select count(*) from public.payments) = 0, 'account manager reads no payments');
select pg_temp.logout();

-- Anonymous role has no table privileges at all.
set local role anon;
select pg_temp.assert_raises('select * from public.clients', 'permission denied', 'anon cannot read clients');
reset role;

-- Audit log captured the founder's inserts with the actor.
select pg_temp.assert(
  (select count(*) from public.audit_logs where table_name = 'clients' and action = 'INSERT'
     and actor_id = '00000000-0000-0000-0000-00000000000a') = 2,
  'client inserts are audited with actor');

rollback;
