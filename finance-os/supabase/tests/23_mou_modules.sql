begin;
\ir 00_helpers.sql.inc
-- a owner · c sales rep · d second rep
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated, service_role;
alter table t add column org uuid;
update t set org = public.create_company(grp, '{"name":"GBS","slug":"gbs-mou"}');
insert into public.memberships (organization_id, user_id, role) select org, u, 'sales_rep' from t, unnest(array['00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d']::uuid[]) u;
insert into public.company_targets (organization_id, monthly_target_minor, services) select org, 150000000, '{Website}' from t;
insert into public.member_targets (organization_id, user_id, monthly_target_minor) select org, '00000000-0000-0000-0000-00000000000c', 100000000 from t;
select pg_temp.assert_raises($$insert into public.proposals (organization_id, number, title, client_name, amount_minor, gst_bp) select org, 'GBS-P-001', 'Site', 'A', 100, 9000 from t$$, 'check', 'GST above 28% refused');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
update public.company_targets set monthly_target_minor = 1;
select pg_temp.assert((select monthly_target_minor from public.company_targets) = 150000000, 'a sales rep cannot change the company target');
insert into public.proposals (organization_id, number, title, client_name, amount_minor) select org, 'GBS-P-002', 'Mine', 'B', 100 from t;
insert into public.research_cards (organization_id, title) select org, 'Research it' from t;
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert((select count(*) from public.proposals) = 0, 'a rep does not see another rep''s proposals');
select pg_temp.assert((select count(*) from public.research_cards) = 1, 'the research board is shared by the sales team');
select pg_temp.assert((select count(*) from public.member_targets) = 1, 'everyone sees the team targets');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert((select count(*) from public.proposals) = 1, 'the owner sees every proposal');
select pg_temp.assert_raises($$insert into public.proposals (organization_id, number, title, client_name, amount_minor) select org, 'GBS-P-002', 'Dup', 'C', 1 from t$$, 'duplicate', 'proposal numbers are unique per company');
rollback;
