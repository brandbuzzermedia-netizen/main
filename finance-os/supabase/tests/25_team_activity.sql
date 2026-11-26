begin;
\ir 00_helpers.sql.inc
-- a owner · c sales rep · d second rep
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated, service_role;
alter table t add column org uuid;
update t set org = public.create_company(grp, jsonb_build_object('name', 'GBS', 'slug', 'gbs-act', 'short_name', 'GBS',
  'stages', jsonb_build_array(jsonb_build_object('name', 'Lead', 'kind', 'open'), jsonb_build_object('name', 'Won', 'kind', 'won', 'probability_pct', 100))));
insert into public.memberships (organization_id, user_id, role) select org, u, 'sales_rep' from t, unnest(array['00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d']::uuid[]) u;
select pg_temp.assert((select count(*) from public.activity_feed where kind = 'member_joined') = 3, 'the owner and both new teammates appear in the feed');
select pg_temp.logout();

-- Rep C adds a deal and wins it.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
insert into public.deals (organization_id, title, account_name, stage_id, value_minor, owner_id)
  select org, 'Secret Client retainer', 'Secret Client', (select id from public.pipeline_stages where kind = 'open' and organization_id = t.org), 5000000, '00000000-0000-0000-0000-00000000000c'::uuid from t;
update public.deals set stage_id = (select id from public.pipeline_stages where kind = 'won' and organization_id = deals.organization_id) where title = 'Secret Client retainer';
select pg_temp.assert((select count(*) from public.activity_feed where kind = 'deal_created') = 1, 'the rep sees their own new deal');
select pg_temp.logout();

-- Rep D sees the win (no client name) but not C's deal name.
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert((select title from public.activity_feed where kind = 'deal_won') = 'won a deal', 'team sees the win without the client');
select pg_temp.assert((select amount_minor from public.activity_feed where kind = 'deal_won') = 5000000, 'with its value');
select pg_temp.assert((select count(*) from public.activity_feed where kind = 'deal_created') = 0, 'another rep cannot see the deal name');
select pg_temp.assert(not exists (select 1 from public.activity_feed where title like '%Secret Client%'), 'no client names leak to other reps');
insert into public.activity_seen (user_id) values ('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert_raises($$insert into public.activity_seen (user_id) values ('00000000-0000-0000-0000-00000000000c')$$, null, 'cannot mark someone else''s notifications');
select pg_temp.logout();

-- The owner sees everything.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert((select count(*) from public.activity_feed where kind in ('deal_created', 'deal_won')) = 2, 'owner sees the deal and the win');
select pg_temp.assert((select actor_id from public.activity_feed where kind = 'deal_won') = '00000000-0000-0000-0000-00000000000c', 'the win is credited to the deal owner');
select pg_temp.assert_raises($$insert into public.activity_feed (organization_id, kind, title) select org, 'deal_won', 'fake' from t$$, null, 'nobody can write fake activity');
rollback;
