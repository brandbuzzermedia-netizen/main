-- Shared fixture: two organizations and the four roles in alpha. Included after 00_helpers.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t_ids as select public.create_organization('Alpha Realty', 'US', 'America/Chicago') as alpha;
grant all on t_ids to authenticated;
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
alter table t_ids add column beta uuid;
update t_ids set beta = public.create_organization('Beta Homes', 'GB');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.add_member((select alpha from t_ids), '00000000-0000-0000-0000-00000000000c', 'campaign_manager');
select public.add_member((select alpha from t_ids), '00000000-0000-0000-0000-00000000000d', 'sales_rep');
select pg_temp.logout();

-- Helper: stage id by key in an organization (runs as the table owner).
create or replace function pg_temp.stage(p_org uuid, p_key text) returns uuid language sql as $$
  select id from public.pipeline_stages where organization_id = p_org and key = p_key
$$;
