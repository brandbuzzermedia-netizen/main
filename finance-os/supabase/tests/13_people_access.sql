begin;
\ir 00_helpers.sql.inc

-- a owner · g finance user · c sales rep · new invitee who has never signed in
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'gbs-finance@test');
insert into public.users (id, email) select id, email from auth.users on conflict do nothing;

create or replace function pg_temp.login_aal(p_uid uuid, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('Diwani Parivaar') as grp;
grant all on t to authenticated;
alter table t add column gbs uuid, add column hist uuid;
update t set gbs = public.create_company(grp, jsonb_build_object('name', 'Get Bee Seen', 'slug', 'gbs-test', 'ownership_type', 'wholly_owned', 'consolidation', 'consolidated'));
insert into public.memberships (organization_id, user_id, role) select gbs, '00000000-0000-0000-0000-0000000000a1'::uuid, 'finance' from t;
insert into public.memberships (organization_id, user_id, role) select gbs, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t;

-- 1. Invitations
select pg_temp.assert(public.invite_member((select gbs from t), 'am@gbs.test', 'viewer') = 'added', 'existing user is added at once');
select pg_temp.assert(public.invite_member((select gbs from t), ' New.Person@Example.test ', 'sales_rep') = 'invited', 'unknown email is invited');
select pg_temp.assert(public.invite_member((select gbs from t), 'new.person@example.test', 'account_manager') = 'invited', 're-inviting updates the open invitation');
select pg_temp.assert((select count(*) from public.invitations) = 1 and (select role from public.invitations) = 'account_manager', 'one open invitation per email');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert_raises($$select public.invite_member((select gbs from t), 'x@example.test', 'owner')$$, 'not allowed', 'a sales rep cannot invite');
select pg_temp.assert((select count(*) from public.invitations) = 0, 'a sales rep cannot read invitations');
select pg_temp.logout();

-- Not accepted while the email is unconfirmed; accepted on confirmation; case-insensitive.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f9', 'NEW.person@example.test');
select pg_temp.assert(not exists (select 1 from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f9'), 'no access before the email is confirmed');
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000f9';
select pg_temp.assert((select role from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f9') = 'account_manager', 'invitation applied on confirmation');
select pg_temp.assert((select accepted_by from public.invitations) = '00000000-0000-0000-0000-0000000000f9', 'invitation marked accepted');

-- Revoked and expired invitations do nothing.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.invite_member((select gbs from t), 'late@example.test', 'staff');
select public.revoke_invitation((select id from public.invitations where email = 'late@example.test'));
select pg_temp.logout();
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000f8', 'late@example.test', now());
select pg_temp.assert(not exists (select 1 from public.memberships where user_id = '00000000-0000-0000-0000-0000000000f8'), 'revoked invitation grants nothing');
select pg_temp.assert(public.invitation_open('late@example.test') = false, 'revoked invitation is not open');

-- 2. Deactivation
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert_raises(format($$select public.deactivate_member(%L, 'not mine')$$, (select id from public.memberships where role = 'finance')), 'not allowed', 'a sales rep cannot deactivate');
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.assert_raises(format($$select public.deactivate_member(%L, 'leaving')$$, (select id from public.memberships where user_id = '00000000-0000-0000-0000-00000000000a')), 'yourself', 'cannot deactivate yourself');
select pg_temp.assert_raises(format($$select public.deactivate_member(%L, '')$$, (select id from public.memberships where role = 'sales_rep')), 'say why', 'a reason is required');
update t set hist = public.deactivate_member((select id from public.memberships where role = 'sales_rep'), 'Left the company');
select pg_temp.assert(not exists (select 1 from public.memberships where role = 'sales_rep'), 'access removed');
select pg_temp.assert((select reason from public.membership_history where id = (select hist from t)) = 'Left the company', 'history keeps who, when and why');
select pg_temp.assert((select email from public.users where id = '00000000-0000-0000-0000-00000000000c') = 'viewer@gbs.test', 'owner still sees a former member''s email');
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(not exists (select 1 from public.membership_history), 'finance user cannot read member history');
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.reactivate_member((select hist from t));
select pg_temp.assert(exists (select 1 from public.memberships where role = 'sales_rep'), 'reactivation restores the role');
select pg_temp.assert((select reactivated_at from public.membership_history where id = (select hist from t)) is not null, 'reactivation recorded');
select pg_temp.assert_raises(format($$select public.reactivate_member(%L)$$, (select hist from t)), 'not allowed', 'cannot reactivate twice');

-- 3. MFA for owners and finance
select pg_temp.assert_raises($$update public.organizations set require_mfa = true where id = (select gbs from t)$$, null, 'direct update of the requirement is refused');
select pg_temp.assert_raises($$select public.set_require_mfa((select gbs from t), true)$$, 'two-step', 'turning MFA on needs MFA in use');
select pg_temp.logout();
select pg_temp.login_aal('00000000-0000-0000-0000-00000000000a', 'aal2');
select public.set_require_mfa((select gbs from t), true);
select pg_temp.assert((select require_mfa from public.organizations where id = (select gbs from t)), 'owner with MFA can require it');
select pg_temp.assert(app.has_permission((select gbs from t), 'finance.read'), 'owner at aal2 keeps finance access');
select pg_temp.logout();

-- Owner and finance at aal1: only company.view remains, in RLS and in my_permissions.
select pg_temp.login_aal('00000000-0000-0000-0000-00000000000a', 'aal1');
select pg_temp.assert(not app.has_permission((select gbs from t), 'finance.read'), 'owner without MFA loses finance');
select pg_temp.assert(public.my_permissions((select gbs from t)) = array['company.view'], 'only company.view is left');
select pg_temp.assert((select bool_and(not satisfied) from public.my_mfa_requirements()), 'requirement reported as unmet');
select pg_temp.assert_raises($$select public.set_require_mfa((select gbs from t), false)$$, 'two-step', 'a password alone cannot switch MFA off');
select pg_temp.logout();
select pg_temp.login_aal('00000000-0000-0000-0000-0000000000a1', 'aal1');
select pg_temp.assert(not app.has_permission((select gbs from t), 'finance.read'), 'finance user without MFA loses finance');
select pg_temp.logout();
select pg_temp.login_aal('00000000-0000-0000-0000-0000000000a1', 'aal2');
select pg_temp.assert(app.has_permission((select gbs from t), 'finance.read'), 'finance user with MFA keeps finance');
select pg_temp.logout();

-- Roles outside the MFA set are unaffected.
select pg_temp.login_aal('00000000-0000-0000-0000-00000000000c', 'aal1');
select pg_temp.assert(app.has_permission((select gbs from t), 'crm.write'), 'sales rep keeps CRM access without MFA');
select pg_temp.assert(not exists (select 1 from public.my_mfa_requirements()), 'no requirement for a sales rep');
select pg_temp.logout();
rollback;
