begin;
\ir 00_helpers.sql.inc

-- People
--   a  Mehul: group owner, owner of GBS and Vyra (created them)
--   b  outsider with their own unrelated group
--   c  GBS sales rep
--   d  GBS company admin
--   e  Vyra Studio staff
--   f  external partner on GBS
--   g  GBS finance user
--   h  external accountant on GBS
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'vyra-staff@test'),
  ('00000000-0000-0000-0000-0000000000f1', 'partner@test'),
  ('00000000-0000-0000-0000-0000000000a1', 'gbs-finance@test'),
  ('00000000-0000-0000-0000-0000000000b1', 'accountant@test');
insert into public.users (id, email) select id, email from auth.users on conflict do nothing;

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('Diwani Parivaar') as grp;
grant all on t to authenticated;
alter table t add column gbs uuid, add column vyra uuid, add column outsider_grp uuid, add column outsider_org uuid;
update t set gbs = public.create_company(grp, jsonb_build_object(
  'name', 'Get Bee Seen', 'slug', 'gbs-test', 'ownership_type', 'wholly_owned', 'consolidation', 'consolidated',
  'stages', jsonb_build_array(
    jsonb_build_object('name', 'Lead', 'kind', 'open', 'probability_pct', 10),
    jsonb_build_object('name', 'Proposal', 'kind', 'proposal', 'probability_pct', 50),
    jsonb_build_object('name', 'Won', 'kind', 'won', 'probability_pct', 100))));
update t set vyra = public.create_company(grp, jsonb_build_object(
  'name', 'Vyra Studio', 'slug', 'vyra-test', 'ownership_type', 'family_owned', 'owner_label', 'Mother',
  'stages', jsonb_build_array(jsonb_build_object('name', 'Enquiry', 'kind', 'open', 'probability_pct', 10))));
select pg_temp.assert((select count(*) from public.pipeline_stages) = 4, 'stages seeded from registry payload');
select pg_temp.assert((select role from public.memberships where organization_id = (select gbs from t)) = 'owner', 'creator owns the company');
select pg_temp.logout();

-- Memberships are granted by the group owner (as an administrator would).
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.memberships (organization_id, user_id, role)
select gbs, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t union all
select gbs, '00000000-0000-0000-0000-00000000000d'::uuid, 'company_admin' from t union all
select vyra, '00000000-0000-0000-0000-0000000000e1'::uuid, 'staff' from t union all
select gbs, '00000000-0000-0000-0000-0000000000f1'::uuid, 'partner' from t union all
select gbs, '00000000-0000-0000-0000-0000000000a1'::uuid, 'finance' from t union all
select gbs, '00000000-0000-0000-0000-0000000000b1'::uuid, 'accountant' from t;

-- Deals: one owned by the rep, one by Mehul (shared with the partner), one in Vyra.
insert into public.deals (organization_id, title, stage_id, value_minor, owner_id)
select gbs, 'Rep deal', (select id from public.pipeline_stages where organization_id = t.gbs and name = 'Lead'), 5000000,
       '00000000-0000-0000-0000-00000000000c'::uuid from t union all
select gbs, 'Owner deal', (select id from public.pipeline_stages where organization_id = t.gbs and name = 'Proposal'), 12000000,
       '00000000-0000-0000-0000-00000000000a'::uuid from t union all
select vyra, 'Vyra order', (select id from public.pipeline_stages where organization_id = t.vyra), 1500000,
       '00000000-0000-0000-0000-00000000000a'::uuid from t;
insert into public.deal_shares (organization_id, deal_id, user_id)
select gbs, (select id from public.deals where title = 'Owner deal'), '00000000-0000-0000-0000-0000000000f1'::uuid from t;
insert into public.tasks (organization_id, title, assignee_id) select gbs, 'Rep task', '00000000-0000-0000-0000-00000000000c'::uuid from t;
insert into public.tasks (organization_id, title) select vyra, 'Vyra task' from t;
insert into public.clients (organization_id, client_code, legal_name) select gbs, 'CLIENT', 'Client Pvt Ltd' from t;
select pg_temp.assert((select count(*) from public.deals) = 3, 'owner reads deals in both companies');
-- Won stage closes the deal automatically.
update public.deals set stage_id = (select id from public.pipeline_stages where name = 'Won') where title = 'Owner deal';
select pg_temp.assert((select closed_at is not null from public.deals where title = 'Owner deal'), 'won stage sets closed_at');
update public.deals set stage_id = (select id from public.pipeline_stages where name = 'Proposal') where title = 'Owner deal';
select pg_temp.assert((select closed_at is null from public.deals where title = 'Owner deal'), 'reopening clears closed_at');
select pg_temp.logout();

-- An unrelated tenant.
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
update t set outsider_grp = public.create_family_group('Someone Else');
select pg_temp.assert((select count(*) from public.family_groups) = 1, 'outsider sees only own group');
select pg_temp.assert((select count(*) from public.organizations) = 0, 'outsider sees no companies');
select pg_temp.assert((select count(*) from public.deals) = 0, 'outsider sees no deals');
select pg_temp.assert_raises(format($$select public.create_company(%L, '{"name":"x","slug":"hijack"}')$$, (select grp from t)),
  'group owner', 'outsider cannot add a company to the family group');
select pg_temp.assert_raises(format($$insert into public.group_memberships (family_group_id, user_id, role) values (%L, '00000000-0000-0000-0000-00000000000b', 'group_owner')$$, (select grp from t)),
  'row-level security', 'outsider cannot join the family group');
select pg_temp.logout();

-- GBS sales rep: own deals and tasks only; no Vyra, no finance, no group.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.deals) = 1 and (select title from public.deals) = 'Rep deal', 'rep sees only own deal');
select pg_temp.assert((select count(*) from public.tasks) = 1, 'rep sees only own task');
select pg_temp.assert((select count(*) from public.clients) = 0, 'rep cannot read finance clients');
select pg_temp.assert((select count(*) from public.family_groups) = 0, 'company membership does not imply group access');
select pg_temp.assert((select count(*) from public.organizations) = 1, 'rep sees only GBS in the registry');
select pg_temp.assert(not ('finance.read' = any (public.my_permissions((select gbs from t)))), 'rep has no finance permission');
select pg_temp.assert(cardinality(public.my_permissions((select vyra from t))) = 0, 'rep has no Vyra permissions');
select pg_temp.assert_raises(format($$insert into public.deals (organization_id, title, stage_id, owner_id) values (%L, 'x', %L, '00000000-0000-0000-0000-00000000000a')$$,
  (select gbs from t), (select id from public.pipeline_stages where name = 'Lead')), 'row-level security', 'rep cannot create a deal for someone else');
select pg_temp.assert_raises(format($$insert into public.deals (organization_id, title, stage_id, owner_id) values (%L, 'x', %L, '00000000-0000-0000-0000-00000000000c')$$,
  (select vyra from t), (select id from public.pipeline_stages where name = 'Lead')), null, 'rep cannot write into Vyra Studio (membership guard or RLS)');
update public.deals set value_minor = 1 where title = 'Owner deal';
insert into public.deals (organization_id, title, stage_id, owner_id)
select gbs, 'Rep new deal', (select id from public.pipeline_stages where name = 'Lead'), '00000000-0000-0000-0000-00000000000c'::uuid from t;
select pg_temp.assert_raises($$update public.deals set owner_id = '00000000-0000-0000-0000-00000000000a' where title = 'Rep deal'$$,
  'row-level security', 'rep cannot hand a deal to someone else');
select pg_temp.assert_raises(format($$select public.set_emergency_stop(%L, true, 'x')$$, (select gbs from t)), 'not allowed', 'rep cannot press emergency stop');
select pg_temp.logout();
select pg_temp.assert((select value_minor from public.deals where title = 'Owner deal') = 12000000, 'rep update of another deal affected nothing');

-- Vyra staff cannot read GBS leads or finance.
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert((select count(*) from public.deals) = 0, 'Vyra staff sees no GBS deals (and no unassigned Vyra deals)');
select pg_temp.assert((select count(*) from public.clients) = 0, 'Vyra staff reads no GBS finance');
select pg_temp.assert((select count(*) from public.organizations) = 1, 'Vyra staff sees only Vyra');
select pg_temp.assert((select count(*) from public.tasks) = 0, 'staff sees no unassigned tasks');
select pg_temp.logout();

-- Company admin: manages members, but cannot grant owner or any group role.
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert((select count(*) from public.deals where organization_id = (select gbs from t)) = 3, 'company admin reads all GBS deals');
select pg_temp.assert((select count(*) from public.clients) = 0, 'company admin has no finance access by default');
select pg_temp.assert_raises(format($$insert into public.group_memberships (family_group_id, user_id, role) values (%L, '00000000-0000-0000-0000-00000000000d', 'group_owner')$$, (select grp from t)),
  'row-level security', 'company admin cannot grant group super admin');
select pg_temp.assert_raises($$update public.memberships set role = 'owner' where user_id = '00000000-0000-0000-0000-00000000000d'$$,
  'row-level security', 'company admin cannot promote self to owner');
select pg_temp.assert_raises(format($$insert into public.memberships (organization_id, user_id, role) values (%L, '00000000-0000-0000-0000-0000000000e1', 'owner')$$, (select gbs from t)),
  'row-level security', 'company admin cannot grant owner');
update public.memberships set role = 'sales_manager' where user_id = '00000000-0000-0000-0000-00000000000c' and organization_id = (select gbs from t);
select pg_temp.assert((select count(*) from public.memberships where role = 'sales_manager') = 1, 'company admin can change a non-owner role');
update public.memberships set role = 'sales_rep' where user_id = '00000000-0000-0000-0000-00000000000c';
delete from public.memberships where role = 'owner';
select pg_temp.assert_raises(format($$update public.organizations set family_group_id = %L where id = %L$$, (select outsider_grp from t), (select gbs from t)),
  'permission denied', 'company admin cannot move the company to another group');
select pg_temp.assert_raises(format($$update public.organizations set consolidation = 'consolidated' where id = %L$$, (select vyra from t)),
  'permission denied', 'consolidation cannot be edited directly');
select pg_temp.assert_raises(format($$select public.set_company_registry(%L, 'wholly_owned', 'consolidated', null)$$, (select gbs from t)),
  'group owner', 'company admin cannot change ownership or consolidation');
select public.set_emergency_stop((select gbs from t), true, 'Wrong template sent to clients');
select pg_temp.assert_raises(format($$select public.set_emergency_stop(%L, true, '')$$, (select gbs from t)), 'reason', 'a stop needs a reason');
select pg_temp.logout();
select pg_temp.assert((select count(*) from public.memberships where role = 'owner' and organization_id = (select gbs from t)) = 1, 'admin could not delete the owner');
select pg_temp.assert((select emergency_stop and emergency_stop_reason is not null from public.organizations where id = (select gbs from t)), 'emergency stop recorded');
select pg_temp.assert((select count(*) from public.audit_logs where table_name = 'organizations' and new_data ->> 'emergency_stop' = 'true') = 1, 'emergency stop audited');

-- Partner: only the shared deal; no tasks, no finance, no members' records.
select pg_temp.login('00000000-0000-0000-0000-0000000000f1');
select pg_temp.assert((select count(*) from public.deals) = 1 and (select title from public.deals) = 'Owner deal', 'partner sees only the shared deal');
select pg_temp.assert((select count(*) from public.clients) = 0, 'partner reads no finance');
select pg_temp.assert((select count(*) from public.tasks) = 0, 'partner reads no tasks');
select pg_temp.assert_raises(format($$insert into public.tasks (organization_id, title) values (%L, 'x')$$, (select gbs from t)),
  'row-level security', 'partner cannot create tasks');
update public.deals set value_minor = 0;
select pg_temp.logout();
select pg_temp.assert((select value_minor from public.deals where title = 'Owner deal') = 12000000, 'partner cannot edit the shared deal');

-- Finance user: finance yes, CRM no. Accountant: nothing until periods are granted.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert((select count(*) from public.clients) = 1, 'finance user reads finance clients');
select pg_temp.assert((select count(*) from public.deals) = 0, 'finance user does not read deals');
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.assert((select count(*) from public.clients) = 0, 'accountant reads no finance without a period grant');
select pg_temp.assert((select count(*) from public.deals) = 0, 'accountant reads no deals');
select pg_temp.logout();

-- Owners: assigning a record to a non-member is rejected; the last owner and last group owner stay.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert_raises(format($$insert into public.tasks (organization_id, title, assignee_id) values (%L, 'x', '00000000-0000-0000-0000-0000000000e1')$$, (select gbs from t)),
  'not a member', 'cannot assign a GBS task to Vyra staff');
select pg_temp.assert_raises(format($$insert into public.deals (organization_id, title, stage_id) values (%L, 'x', %L)$$, (select gbs from t),
  (select id from public.pipeline_stages where organization_id = (select vyra from t))), 'foreign key', 'a deal cannot use another company''s stage');
select pg_temp.assert_raises(format($$delete from public.memberships where organization_id = %L and role = 'owner'$$, (select vyra from t)),
  'at least one owner', 'last company owner cannot be removed');
select pg_temp.assert_raises(format($$delete from public.group_memberships where family_group_id = %L$$, (select grp from t)),
  'at least one group owner', 'last group owner cannot be removed');
insert into public.group_memberships (family_group_id, user_id, role) select grp, '00000000-0000-0000-0000-0000000000e1'::uuid, 'family_owner' from t;
select pg_temp.assert((select count(*) from public.audit_logs where table_name = 'group_memberships' and family_group_id = (select grp from t)) >= 2, 'group role grants are audited');
select pg_temp.logout();

-- Family owner without company membership sees the registry, not the figures.
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert((select count(*) from public.family_groups) = 1, 'family owner sees the group');
select pg_temp.assert((select count(*) from public.organizations) = 2, 'family owner sees the registry');
select pg_temp.assert((select count(*) from public.deals where organization_id = (select gbs from t)) = 0, 'registry access does not reveal GBS deals');
select pg_temp.assert((select count(*) from public.clients) = 0, 'registry access does not reveal finance');
select pg_temp.assert((select count(*) from public.audit_logs) = 0, 'family owner cannot read audit logs');
select pg_temp.assert_raises(format($$insert into public.memberships (organization_id, user_id, role) values (%L, '00000000-0000-0000-0000-0000000000e1', 'owner')$$, (select gbs from t)),
  'row-level security', 'family owner cannot grant themselves company access');
select pg_temp.logout();

-- Adding people by email goes through the same rules.
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert_raises(format($$select public.add_member_by_email(%L, 'vyra-staff@test', 'owner')$$, (select gbs from t)),
  'not allowed', 'company admin cannot add an owner by email');
select pg_temp.assert_raises(format($$select public.add_member_by_email(%L, 'nobody@test', 'staff')$$, (select gbs from t)),
  'signed in yet', 'unknown email is rejected');
select public.add_member_by_email((select gbs from t), 'VYRA-STAFF@test', 'staff');
select pg_temp.assert_raises(format($$select public.add_member_by_email(%L, 'vyra-staff@test', 'staff')$$, (select gbs from t)),
  'already a member', 'duplicate membership is rejected');
select pg_temp.assert_raises(format($$select public.add_member_by_email(%L, 'vyra-staff@test', 'staff')$$, (select vyra from t)),
  'not allowed', 'GBS admin cannot add people to Vyra');
select pg_temp.assert_raises(format($$select public.add_group_member_by_email(%L, 'am@gbs.test', 'group_owner')$$, (select grp from t)),
  'group owner', 'company admin cannot add group members');
select pg_temp.logout();

-- Pre-group workspaces (the original GBS Finance OS) get a slug and can be attached.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t2 as select public.create_organization('GBS Finance (old)') as legacy;
select pg_temp.assert((select slug ~ '^gbs-finance-old-' from public.organizations where id = (select legacy from t2)), 'legacy org gets a slug');
select public.attach_company_to_group((select legacy from t2), (select grp from t), '{"ownership_type": "wholly_owned", "consolidation": "consolidated"}');
select pg_temp.assert((select family_group_id = (select grp from t) and consolidation = 'consolidated' from public.organizations where id = (select legacy from t2)), 'legacy org attached');
select pg_temp.assert_raises(format($$select public.attach_company_to_group(%L, %L)$$, (select legacy from t2), (select grp from t)),
  'already in a group', 'cannot attach twice');
select pg_temp.logout();

rollback;
