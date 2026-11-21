begin;
\ir 00_helpers.sql.inc
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated;
alter table t add column org uuid, add column ct uuid;
update t set org = public.create_company(grp, '{"name":"Co","slug":"co-outreach"}');
insert into public.contacts (organization_id, full_name, consent_basis, consent_at) select org, 'Lead', 'legitimate_interest', now() from t;
update t set ct = (select id from public.contacts limit 1);
insert into public.outreach_events (organization_id, contact_id, kind, outcome) select org, ct, 'facebook', 'sent' from t;
insert into public.outreach_events (organization_id, contact_id, kind, outcome) select org, ct, 'instagram', 'positive' from t;
select pg_temp.assert((select count(*) from public.outreach_events) = 2, 'facebook and instagram activity can be logged');
select pg_temp.assert_raises($$insert into public.outreach_events (organization_id, contact_id, kind) select org, ct, 'telegram' from t$$, 'check', 'unknown channels are still refused');
select pg_temp.logout();
rollback;
