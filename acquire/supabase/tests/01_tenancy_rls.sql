begin;
\ir 00_helpers.sql.inc
\ir 00_setup.sql.inc

-- Organization setup created the defaults.
select pg_temp.assert((select count(*) from public.pipeline_stages where organization_id = (select alpha from t_ids)) = 13, 'default stages seeded');
select pg_temp.assert((select count(*) from public.lead_sources where organization_id = (select alpha from t_ids)) = 2, 'default sources seeded');
select pg_temp.assert((select plan_key from public.subscriptions where organization_id = (select alpha from t_ids)) = 'trial', 'trial subscription created');
select pg_temp.assert((select timezone from public.organizations where id = (select beta from t_ids)) = 'Europe/London', 'market default time zone');
select pg_temp.assert((select default_currency from public.organizations where id = (select beta from t_ids)) = 'GBP', 'market default currency');

-- Seat limit: the trial plan has 3 seats and alpha already uses them.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert_raises(
  format($$select public.add_member(%L, '00000000-0000-0000-0000-00000000000e', 'read_only')$$, (select alpha from t_ids)),
  'seat limit', 'seat limit enforced');
select pg_temp.logout();
update public.subscriptions set plan_key = 'starter', status = 'active' where organization_id = (select alpha from t_ids);
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.add_member((select alpha from t_ids), '00000000-0000-0000-0000-00000000000e', 'read_only');

-- Admin creates leads: one assigned to the rep, one unassigned.
insert into public.leads (organization_id, full_name, email, stage_id, owner_id)
select alpha, 'Rita Rep-Owned', 'rita@example.com', pg_temp.stage(alpha, 'new'), '00000000-0000-0000-0000-00000000000d'::uuid from t_ids;
insert into public.leads (organization_id, full_name, phone_e164, stage_id)
select alpha, 'Ulysses Unassigned', '+13125550100', pg_temp.stage(alpha, 'new') from t_ids;
select pg_temp.assert((select count(*) from public.leads) = 2, 'admin sees both leads');
select pg_temp.assert((select count(*) from public.memberships) = 4, 'admin sees roster');
select pg_temp.logout();

-- Other tenant sees nothing and cannot write in.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert((select count(*) from public.leads) = 0, 'beta sees no alpha leads');
select pg_temp.assert((select count(*) from public.organizations) = 1, 'beta sees only itself');
select pg_temp.assert((select count(*) from public.pipeline_stages where organization_id = (select alpha from t_ids)) = 0, 'beta sees no alpha stages');
select pg_temp.assert_raises(
  format($$insert into public.leads (organization_id, full_name, email, stage_id) values (%L, 'x', 'x@x.com', %L)$$,
         (select alpha from t_ids), (select pg_temp.stage(alpha, 'new') from t_ids)),
  'row-level security', 'cross-tenant lead insert rejected');
select pg_temp.assert_raises(
  format($$insert into public.memberships (organization_id, user_id, role) values (%L, '00000000-0000-0000-0000-00000000000b', 'agency_admin')$$, (select alpha from t_ids)),
  'row-level security', 'cannot join another org');
select pg_temp.assert_raises(
  format($$select public.import_leads(%L, '[]'::jsonb, null)$$, (select alpha from t_ids)),
  'not allowed', 'cross-tenant import rejected');
select pg_temp.assert(((public.lead_metrics((select alpha from t_ids), now() - interval '1 day', now() + interval '1 minute', now() - interval '1 day')) ->> 'total')::int = 0,
  'beta metrics for alpha are empty');
update public.leads set full_name = 'pwned';
select pg_temp.logout();
select pg_temp.assert((select count(*) from public.leads where full_name = 'pwned') = 0, 'cross-tenant update affected nothing');

-- Sales rep: sees and edits only their own lead; cannot reassign it away or take another.
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert((select count(*) from public.leads) = 1, 'rep sees only own lead');
select pg_temp.assert((select full_name from public.leads) = 'Rita Rep-Owned', 'rep sees the right lead');
update public.leads set notes = 'called back';
select pg_temp.assert((select notes from public.leads) = 'called back', 'rep can update own lead');
select pg_temp.assert_raises(
  $$update public.leads set owner_id = '00000000-0000-0000-0000-00000000000c' where full_name = 'Rita Rep-Owned'$$,
  'row-level security', 'rep cannot hand a lead to someone else');
update public.leads set owner_id = '00000000-0000-0000-0000-00000000000d' where full_name = 'Ulysses Unassigned';
select pg_temp.assert_raises(
  format($$insert into public.leads (organization_id, full_name, email, stage_id) values (%L, 'Unowned', 'u@x.com', %L)$$,
         (select alpha from t_ids), (select pg_temp.stage(alpha, 'new') from t_ids)),
  'row-level security', 'rep must own leads they create');
select pg_temp.assert_raises(
  format($$select public.import_leads(%L, '[]'::jsonb, null)$$, (select alpha from t_ids)),
  'not allowed', 'rep cannot import');
select pg_temp.assert((select count(*) from public.audit_logs) = 0, 'rep cannot read audit log');
select pg_temp.assert(((public.lead_metrics((select alpha from t_ids), now() - interval '1 day', now() + interval '1 minute', now() - interval '1 day')) ->> 'total')::int = 1,
  'rep metrics count only own leads');
select pg_temp.logout();
select pg_temp.assert((select owner_id from public.leads where full_name = 'Ulysses Unassigned') is null, 'rep could not claim an unassigned lead');

-- Read-only: reads everything, writes nothing.
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select pg_temp.assert((select count(*) from public.leads) = 2, 'read-only sees all leads');
select pg_temp.assert_raises(
  format($$insert into public.leads (organization_id, full_name, email, stage_id) values (%L, 'x', 'ro@x.com', %L)$$,
         (select alpha from t_ids), (select pg_temp.stage(alpha, 'new') from t_ids)),
  'row-level security', 'read-only cannot insert');
update public.leads set notes = 'read-only edit';
select pg_temp.assert_raises(
  format($$insert into public.lead_sources (organization_id, name) values (%L, 'RO source')$$, (select alpha from t_ids)),
  'row-level security', 'read-only cannot add sources');
select pg_temp.logout();
select pg_temp.assert((select count(*) from public.leads where notes = 'read-only edit') = 0, 'read-only update affected nothing');

-- Campaign manager: assigns leads, manages sources, cannot change team or settings.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
update public.leads set owner_id = '00000000-0000-0000-0000-00000000000d' where full_name = 'Ulysses Unassigned';
insert into public.lead_sources (organization_id, name, kind) select alpha, 'Website form', 'web_form' from t_ids;
select pg_temp.assert_raises(
  format($$select public.add_member(%L, '00000000-0000-0000-0000-00000000000b', 'read_only')$$, (select alpha from t_ids)),
  'only an agency admin', 'manager cannot add members');
update public.organization_settings set contact_window_start = '07:00';
select pg_temp.assert_raises(
  format($$select public.erase_lead(%L, (select id from public.leads limit 1))$$, (select alpha from t_ids)),
  'only an agency admin', 'manager cannot erase');
select pg_temp.assert_raises(
  format($$insert into public.pipeline_stages (organization_id, key, name, category, is_system) values (%L, 'sneaky', 'Sneaky', 'new', true)$$, (select alpha from t_ids)),
  'row-level security', 'cannot create system stages');
delete from public.pipeline_stages where key = 'opted_out';
select pg_temp.logout();
select pg_temp.assert((select count(*) from public.leads where owner_id = '00000000-0000-0000-0000-00000000000d') = 2, 'manager assigned the lead');
select pg_temp.assert((select contact_window_start from public.organization_settings where organization_id = (select alpha from t_ids)) = '09:00', 'manager cannot change settings');
select pg_temp.assert((select count(*) from public.pipeline_stages where organization_id = (select alpha from t_ids) and key = 'opted_out') = 1, 'system stage kept');

-- Billing state cannot be changed by tenants.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert_raises(
  $$update public.subscriptions set plan_key = 'scale'$$, 'permission denied', 'admin cannot self-upgrade');
select pg_temp.assert_raises(
  $$insert into public.usage_records (organization_id, metric, quantity) select alpha, 'sms', -5 from t_ids$$, 'permission denied', 'usage is server-written');
-- An organization keeps at least one admin.
select pg_temp.assert_raises(
  $$update public.memberships set role = 'read_only' where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  'at least one agency admin', 'last admin cannot be demoted');
-- Platform console is closed to tenants.
select pg_temp.assert_raises($$select * from public.admin_list_organizations()$$, 'platform admins only', 'tenant admin is not a platform admin');
select pg_temp.logout();

-- Platform admin: sees organization facts, but no leads through RLS.
insert into public.users (id, email) values ('00000000-0000-0000-0000-00000000000f', 'operator@platform.test') on conflict do nothing;
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-00000000000f');
select pg_temp.login('00000000-0000-0000-0000-00000000000f');
select pg_temp.assert((select count(*) from public.admin_list_organizations()) = 2, 'platform admin lists organizations');
select pg_temp.assert((select leads from public.admin_list_organizations() where name = 'Alpha Realty') = 2, 'platform admin sees lead counts');
select pg_temp.assert((select count(*) from public.leads) = 0, 'platform admin reads no lead rows');
select pg_temp.logout();

-- Audit trail records lead changes with the actor.
select pg_temp.assert((select count(*) from public.audit_logs where table_name = 'leads' and action = 'INSERT'
  and actor_id = '00000000-0000-0000-0000-00000000000a') = 2, 'lead inserts audited with actor');

-- Anonymous role has no access at all.
set local role anon;
select pg_temp.assert_raises($$select count(*) from public.leads$$, 'permission denied', 'anon cannot read leads');
select pg_temp.assert_raises($$select count(*) from public.plans$$, 'permission denied', 'anon cannot read plans');
select pg_temp.assert_raises($$select public.create_organization('x', 'US')$$, 'permission denied', 'anon cannot create orgs');
reset role;

rollback;
