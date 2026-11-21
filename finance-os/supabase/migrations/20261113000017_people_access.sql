-- People and access hardening.
--
--   1. Invitations: an owner can grant a role to someone who has never signed in. The role is
--      applied when that person first confirms their email (magic link), never before.
--   2. Deactivation instead of deletion: removing a member archives the membership with who,
--      when and why, and it can be restored. Records the person created stay untouched.
--   3. MFA for owners and finance: a company can require a second factor (TOTP) for its owner,
--      company admin and finance roles. Without it, those people keep only `company.view`, so
--      the app can send them to set up MFA but the database releases nothing sensitive.
--
-- Additive only: new tables, one new column with a safe default, and replaced functions whose
-- results are unchanged while no company requires MFA.

-- 1. Invitations -------------------------------------------------------------------------------

create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email           text not null check (email = lower(trim(email)) and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role            text not null references public.roles (key),
  invited_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '14 days',
  accepted_at     timestamptz,
  accepted_by     uuid references public.users (id) on delete set null,
  revoked_at      timestamptz,
  check (role not in ('group_owner', 'family_owner', 'group_viewer'))
);
create unique index invitations_one_open on public.invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;
alter table public.invitations enable row level security;

create policy invitations_read on public.invitations for select to authenticated
  using (app.has_permission(organization_id, 'members.manage') or app.is_group_owner_of_org(organization_id));
-- Writes go through the RPCs below only.
grant select on public.invitations to authenticated;
grant all on public.invitations to service_role;

create trigger invitations_audit after insert or update or delete on public.invitations
  for each row execute function app.audit_row();

/** Adds an existing user straight away, otherwise records an invitation. Returns 'added' or 'invited'. */
create or replace function public.invite_member(p_org uuid, p_email text, p_role text)
returns text
language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text := lower(trim(p_email));
  v_user uuid;
begin
  if not app.can_manage_member(p_org, p_role) then
    raise exception 'Not allowed to grant that role in this company' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.roles where key = p_role) or p_role in ('group_owner', 'family_owner', 'group_viewer') then
    raise exception 'Unknown company role' using errcode = 'check_violation';
  end if;
  select id into v_user from public.users where lower(email) = v_email;
  if v_user is not null then
    perform public.add_member_by_email(p_org, v_email, p_role);
    return 'added';
  end if;
  update public.invitations set role = p_role, invited_by = auth.uid(), expires_at = now() + interval '14 days'
    where organization_id = p_org and email = v_email and accepted_at is null and revoked_at is null;
  if not found then
    insert into public.invitations (organization_id, email, role, invited_by) values (p_org, v_email, p_role, auth.uid());
  end if;
  return 'invited';
end $$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_inv public.invitations;
begin
  select * into v_inv from public.invitations where id = p_invitation;
  if v_inv.id is null or not app.can_manage_member(v_inv.organization_id, v_inv.role) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  update public.invitations set revoked_at = now() where id = p_invitation and accepted_at is null and revoked_at is null;
end $$;

/** True when an email has an open invitation. Service role only: the login page uses it for its allowlist. */
create or replace function public.invitation_open(p_email text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invitations
    where email = lower(trim(p_email)) and accepted_at is null and revoked_at is null and expires_at > now())
$$;

/** Applies open invitations once the email address is confirmed. */
create or replace function app.accept_invitations() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare v_inv record;
begin
  if new.email_confirmed_at is null or new.email is null then return new; end if;
  -- public.users is filled by on_auth_user_created; make sure the row exists first.
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  for v_inv in
    select * from public.invitations
    where email = lower(new.email) and accepted_at is null and revoked_at is null and expires_at > now()
  loop
    insert into public.memberships (organization_id, user_id, role)
    values (v_inv.organization_id, new.id, v_inv.role)
    on conflict (organization_id, user_id) do nothing;
    update public.invitations set accepted_at = now(), accepted_by = new.id where id = v_inv.id;
  end loop;
  return new;
end $$;

create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row execute function app.accept_invitations();

-- 2. Deactivation instead of deletion ------------------------------------------------------------

create table public.membership_history (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references public.users (id) on delete cascade,
  role             text not null references public.roles (key),
  joined_at        timestamptz not null,
  deactivated_at   timestamptz not null default now(),
  deactivated_by   uuid references public.users (id) on delete set null,
  reason           text not null check (length(trim(reason)) between 3 and 300),
  reactivated_at   timestamptz,
  reactivated_by   uuid references public.users (id) on delete set null
);
create index on public.membership_history (organization_id, deactivated_at desc);
alter table public.membership_history enable row level security;
create policy membership_history_read on public.membership_history for select to authenticated
  using (app.has_permission(organization_id, 'members.manage') or app.is_group_owner_of_org(organization_id));
grant select on public.membership_history to authenticated;
grant all on public.membership_history to service_role;
-- People who manage members can still see a former member's name and email.
create policy users_read_former on public.users for select to authenticated
  using (exists (select 1 from public.membership_history h
    where h.user_id = public.users.id
      and (app.has_permission(h.organization_id, 'members.manage') or app.is_group_owner_of_org(h.organization_id))));
create trigger membership_history_audit after insert or update or delete on public.membership_history
  for each row execute function app.audit_row();

create or replace function public.deactivate_member(p_membership uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_m public.memberships;
  v_id uuid;
begin
  select * into v_m from public.memberships where id = p_membership;
  if v_m.id is null or not app.can_manage_member(v_m.organization_id, v_m.role) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if v_m.user_id = auth.uid() then
    raise exception 'You cannot deactivate yourself' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Say why the person is being deactivated' using errcode = 'check_violation';
  end if;
  insert into public.membership_history (organization_id, user_id, role, joined_at, deactivated_by, reason)
  values (v_m.organization_id, v_m.user_id, v_m.role, v_m.created_at, auth.uid(), trim(p_reason))
  returning id into v_id;
  -- The last-owner guard still applies here.
  delete from public.memberships where id = v_m.id;
  return v_id;
end $$;

create or replace function public.reactivate_member(p_history uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_h public.membership_history;
begin
  select * into v_h from public.membership_history where id = p_history and reactivated_at is null;
  if v_h.id is null or not app.can_manage_member(v_h.organization_id, v_h.role) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  insert into public.memberships (organization_id, user_id, role) values (v_h.organization_id, v_h.user_id, v_h.role)
    on conflict (organization_id, user_id) do nothing;
  update public.membership_history set reactivated_at = now(), reactivated_by = auth.uid() where id = v_h.id;
end $$;

-- 3. MFA for owners and finance ------------------------------------------------------------------

alter table public.organizations add column require_mfa boolean not null default false;

/** Roles that hold money, people or settings power and so need a second factor when required. */
create or replace function app.mfa_role(p_role text) returns boolean
language sql immutable as $$ select p_role in ('owner', 'company_admin', 'finance') $$;

create or replace function app.mfa_ok(p_org uuid, p_role text) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select not app.mfa_role(p_role)
      or not coalesce((select require_mfa from public.organizations where id = p_org), false)
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

-- Same results as before unless MFA is required and missing; then only company.view remains.
create or replace function app.has_permission(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.organization_id = p_org and m.user_id = auth.uid() and rp.permission = p_perm
      and (p_perm = 'company.view' or app.mfa_ok(p_org, m.role)))
$$;

create or replace function public.my_permissions(p_org uuid)
returns text[]
language sql stable security definer set search_path = public, auth as $$
  select coalesce(array_agg(rp.permission order by rp.permission), '{}')
  from public.memberships m join public.role_permissions rp on rp.role = m.role
  where m.organization_id = p_org and m.user_id = auth.uid()
    and (rp.permission = 'company.view' or app.mfa_ok(p_org, m.role))
$$;

/** Companies where the signed-in person must add or use a second factor before working. */
create or replace function public.my_mfa_requirements()
returns table (organization_id uuid, satisfied boolean)
language sql stable security definer set search_path = public, auth as $$
  select m.organization_id, app.mfa_ok(m.organization_id, m.role)
  from public.memberships m join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid() and o.require_mfa and app.mfa_role(m.role)
$$;

/**
 * Turns the MFA requirement on or off. Either way the caller must be signed in with a second
 * factor, so a stolen password alone can neither switch it off nor lock the owners out.
 */
create or replace function public.set_require_mfa(p_org uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not (app.has_permission(p_org, 'company.settings') or app.is_group_owner_of_org(p_org)) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Set up and use two-step sign-in yourself before changing this' using errcode = 'check_violation';
  end if;
  perform set_config('app.mfa_rpc', 'on', true);
  update public.organizations set require_mfa = p_on where id = p_org;
  perform set_config('app.mfa_rpc', 'off', true);
end $$;

-- Direct updates may not change the requirement; only set_require_mfa may.
create or replace function app.guard_require_mfa() returns trigger
language plpgsql as $$
begin
  if new.require_mfa is distinct from old.require_mfa
     and coalesce(current_setting('app.mfa_rpc', true), 'off') <> 'on'
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Use set_require_mfa to change two-step sign-in' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger organizations_guard_require_mfa before update of require_mfa on public.organizations
  for each row execute function app.guard_require_mfa();

revoke all on function public.invite_member(uuid, text, text), public.revoke_invitation(uuid), public.invitation_open(text),
  public.deactivate_member(uuid, text), public.reactivate_member(uuid), public.my_mfa_requirements(), public.set_require_mfa(uuid, boolean)
  from public, anon;
grant execute on function public.invite_member(uuid, text, text), public.revoke_invitation(uuid),
  public.deactivate_member(uuid, text), public.reactivate_member(uuid), public.my_mfa_requirements(), public.set_require_mfa(uuid, boolean)
  to authenticated;
grant execute on function public.invitation_open(text) to service_role;
