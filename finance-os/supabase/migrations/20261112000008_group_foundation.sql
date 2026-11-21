-- Diwani Parivaar OS, Phase 1: group foundation
--
-- The existing `organizations` table becomes the company workspace registry (see
-- docs/DECISIONS.md, D2). This migration adds:
--   1. family groups and group memberships (group access never implies company access);
--   2. registry columns on organizations (slug, ownership, consolidation, modules, branding);
--   3. a permission catalogue mapped to company roles, and app.has_permission();
--   4. guarded membership management (a company admin cannot grant owner or group rights);
--   5. company emergency stop (audited, RPC only);
--   6. the minimal CRM tables the owner dashboard reads: pipeline stages, deals, deal shares,
--      meetings and tasks, all company-scoped with composite foreign keys.
-- Nothing here touches existing finance rows.

-- ---------------------------------------------------------------------------
-- 1. Family groups
-- ---------------------------------------------------------------------------
create table public.family_groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) > 0),
  base_currency  char(3) not null default 'INR',
  timezone       text not null default 'Asia/Kolkata',
  -- Indian financial year starts in April by default.
  fy_start_month smallint not null default 4 check (fy_start_month between 1 and 12),
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.group_memberships (
  id              uuid primary key default gen_random_uuid(),
  family_group_id uuid not null references public.family_groups (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  -- group_owner: super admin of the group registry and group memberships.
  -- family_owner: sees the Command Centre; company figures still need company membership.
  -- group_viewer: sees the registry only.
  role            text not null check (role in ('group_owner', 'family_owner', 'group_viewer')),
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (family_group_id, user_id)
);
create index on public.group_memberships (user_id);

-- ---------------------------------------------------------------------------
-- 2. Company registry columns
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column family_group_id       uuid references public.family_groups (id) on delete restrict,
  add column slug                  text,
  add column short_name            text,
  add column ownership_type        text not null default 'unconfigured' check (ownership_type in (
    'wholly_owned', 'director_partner_operated', 'partner_channel', 'joint_venture',
    'family_owned', 'proposed', 'unconfigured')),
  -- Free text such as "Mehul", "Brother", "Mother". Descriptive only; never used for access.
  add column owner_label           text,
  add column consolidation         text not null default 'needs_confirmation' check (consolidation in (
    'consolidated', 'commission_only', 'share_per_agreement', 'not_consolidated', 'needs_confirmation')),
  add column business_model        text not null default 'general' check (business_model in (
    'agency', 'product_b2b', 'ecommerce_services', 'international_services', 'services',
    'real_estate', 'partner_channel', 'restaurant', 'retail', 'general')),
  add column lifecycle_status      text not null default 'setup' check (lifecycle_status in ('active', 'pre_launch', 'setup', 'archived')),
  add column enabled_modules       text[] not null default '{home,pipeline,meetings,tasks,finance,team,settings}',
  add column sidebar_color         text check (sidebar_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column accent_color          text check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column logo_key              text check (logo_key in ('gbs', 'tanofun', 'iyp', 'brightwire', 'moreofus')),
  add column fy_start_month        smallint not null default 4 check (fy_start_month between 1 and 12),
  add column emergency_stop        boolean not null default false,
  add column emergency_stop_at     timestamptz,
  add column emergency_stop_by     uuid references public.users (id) on delete set null,
  add column emergency_stop_reason text,
  add constraint organizations_modules_known check (enabled_modules <@ array[
    'home', 'leads', 'pipeline', 'outreach', 'meetings', 'tasks', 'customers', 'operations',
    'automation', 'marketing', 'finance', 'rental', 'expenses', 'tax', 'team', 'reports', 'vault', 'settings']::text[]),
  add constraint organizations_stop_reason check (not emergency_stop or length(trim(coalesce(emergency_stop_reason, ''))) > 0);

-- Existing workspaces get a slug derived from their name plus a short id suffix.
update public.organizations set slug =
  trim(both '-' from left(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), 30)) || '-' || left(id::text, 6)
where slug is null;
update public.organizations set slug = 'company-' || left(id::text, 8) where slug !~ '^[a-z0-9]';
alter table public.organizations
  alter column slug set not null,
  add constraint organizations_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  add constraint organizations_slug_key unique (slug);
create index on public.organizations (family_group_id);

-- Registry, group and stop columns change only through the RPCs below. Users may edit
-- descriptive settings directly (subject to RLS).
revoke update on public.organizations from authenticated;
grant update (name, legal_name, gstin, short_name, business_model, lifecycle_status, enabled_modules,
              sidebar_color, accent_color, logo_key, timezone, fy_start_month)
  on public.organizations to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Roles and permissions
-- ---------------------------------------------------------------------------
insert into public.roles (key, description) values
  ('company_admin',      'Company admin: settings and members; cannot grant owner; no finance unless also granted'),
  ('sales_manager',      'Sales manager: all pipeline, meetings and tasks for this company'),
  ('sales_rep',          'Sales representative or appointment setter: own deals, meetings and tasks'),
  ('operations_manager', 'Operations manager: all tasks; own deals'),
  ('marketing_manager',  'Marketing manager: all pipeline (read and write)'),
  ('staff',              'Employee: own tasks and assigned records only'),
  ('accountant',         'External accountant: no access until entities and periods are granted (Phase 7)'),
  ('partner',            'External partner: only deals explicitly shared with them')
on conflict (key) do nothing;

create table public.permissions (
  key         text primary key,
  description text not null,
  sensitive   boolean not null default false
);

insert into public.permissions (key, description, sensitive) values
  ('company.view',           'Open the company workspace', false),
  ('company.settings',       'Edit company settings, modules and branding', false),
  ('company.emergency_stop', 'Pause or resume all outbound activity for the company', true),
  ('members.manage',         'Invite, change and remove members (not owners)', true),
  ('members.grant_owner',    'Grant or remove the owner role', true),
  ('dashboard.owner',        'See the owner dashboard', false),
  ('finance.read',           'Read finance ledgers and totals', true),
  ('finance.write',          'Create and change finance records', true),
  ('crm.read_all',           'Read every deal and meeting in the company', false),
  ('crm.read_assigned',      'Read deals and meetings you own', false),
  ('crm.read_shared',        'Read deals explicitly shared with you', false),
  ('crm.write',              'Create and update deals and meetings (own only, unless crm.read_all)', false),
  ('crm.manage',             'Configure stages, reassign, share and delete deals', false),
  ('tasks.read_all',         'Read every task in the company', false),
  ('tasks.write',            'Create tasks and update your own', false),
  ('audit.read',             'Read the company audit log', true);

create table public.role_permissions (
  role       text not null references public.roles (key) on delete cascade,
  permission text not null references public.permissions (key) on delete cascade,
  primary key (role, permission)
);

insert into public.role_permissions (role, permission)
select r, p from (values
  ('owner', array['company.view', 'company.settings', 'company.emergency_stop', 'members.manage', 'members.grant_owner',
                  'dashboard.owner', 'finance.read', 'finance.write', 'crm.read_all', 'crm.write', 'crm.manage',
                  'tasks.read_all', 'tasks.write', 'audit.read']),
  ('company_admin', array['company.view', 'company.settings', 'company.emergency_stop', 'members.manage',
                          'dashboard.owner', 'crm.read_all', 'crm.write', 'crm.manage', 'tasks.read_all', 'tasks.write', 'audit.read']),
  ('finance', array['company.view', 'finance.read', 'finance.write', 'tasks.write']),
  ('viewer', array['company.view', 'finance.read']),
  ('account_manager', array['company.view', 'crm.read_assigned', 'crm.write', 'tasks.write']),
  ('sales_manager', array['company.view', 'crm.read_all', 'crm.write', 'crm.manage', 'tasks.read_all', 'tasks.write']),
  ('sales_rep', array['company.view', 'crm.read_assigned', 'crm.write', 'tasks.write']),
  ('operations_manager', array['company.view', 'crm.read_assigned', 'crm.write', 'tasks.read_all', 'tasks.write']),
  ('marketing_manager', array['company.view', 'crm.read_all', 'crm.write', 'tasks.write']),
  ('staff', array['company.view', 'crm.read_assigned', 'tasks.write']),
  ('accountant', array['company.view']),
  ('partner', array['company.view', 'crm.read_shared'])
) as v(r, perms), unnest(perms) as p;

create or replace function app.has_permission(p_org uuid, p_perm text) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.organization_id = p_org and m.user_id = auth.uid() and rp.permission = p_perm)
$$;

-- Existing finance helpers now resolve through the permission catalogue. For the original
-- four roles the result is unchanged (owner/finance write; owner/finance/viewer read).
create or replace function app.can_write(p_org uuid) returns boolean
language sql stable as $$ select app.has_permission(p_org, 'finance.write') $$;

create or replace function app.can_read_finance(p_org uuid) returns boolean
language sql stable as $$ select app.has_permission(p_org, 'finance.read') $$;

create or replace function app.group_role(p_group uuid) returns text
language sql stable security definer set search_path = public, auth as $$
  select gm.role from public.group_memberships gm where gm.family_group_id = p_group and gm.user_id = auth.uid()
$$;

create or replace function app.is_group_member(p_group uuid) returns boolean
language sql stable as $$ select app.group_role(p_group) is not null $$;

create or replace function app.is_group_owner(p_group uuid) returns boolean
language sql stable as $$ select coalesce(app.group_role(p_group) = 'group_owner', false) $$;

create or replace function app.is_group_owner_of_org(p_org uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select app.is_group_owner(o.family_group_id) from public.organizations o where o.id = p_org), false)
$$;

create or replace function app.is_org_member(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.organization_id = p_org and m.user_id = p_user)
$$;

-- Who may write a membership row with this role in this company.
-- Group owners may manage any company in their group (every change is audited).
-- Otherwise members.manage is required, and owner rows also need members.grant_owner.
create or replace function app.can_manage_member(p_org uuid, p_role text) returns boolean
language sql stable as $$
  select app.is_group_owner_of_org(p_org)
      or (app.has_permission(p_org, 'members.manage')
          and (p_role <> 'owner' or app.has_permission(p_org, 'members.grant_owner')))
$$;

drop policy memberships_owner_write on public.memberships;
create policy memberships_insert on public.memberships for insert to authenticated
  with check (app.can_manage_member(organization_id, role));
create policy memberships_update on public.memberships for update to authenticated
  using (app.can_manage_member(organization_id, role))
  with check (app.can_manage_member(organization_id, role));
create policy memberships_delete on public.memberships for delete to authenticated
  using (app.can_manage_member(organization_id, role));

-- A company must always keep at least one owner.
create or replace function app.guard_last_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if not exists (select 1 from public.memberships m
                   where m.organization_id = old.organization_id and m.role = 'owner' and m.id <> old.id) then
      -- Allow the cascade when the whole organization is being deleted.
      if exists (select 1 from public.organizations o where o.id = old.organization_id) then
        raise exception 'A company must keep at least one owner' using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger memberships_guard_last_owner before update or delete on public.memberships
  for each row execute function app.guard_last_owner();

-- ---------------------------------------------------------------------------
-- 4. Group RLS
-- ---------------------------------------------------------------------------
alter table public.family_groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

create policy family_groups_read on public.family_groups for select to authenticated
  using (app.is_group_member(id));
create policy family_groups_update on public.family_groups for update to authenticated
  using (app.is_group_owner(id)) with check (app.is_group_owner(id));

create policy group_memberships_read on public.group_memberships for select to authenticated
  using (app.is_group_member(family_group_id));
-- Only a group owner can grant or change group roles. Company admins and owners cannot.
create policy group_memberships_write on public.group_memberships for all to authenticated
  using (app.is_group_owner(family_group_id)) with check (app.is_group_owner(family_group_id));

create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

-- Group members see the registry rows of companies in their group (name, ownership,
-- status). Company figures are still gated by each table's own policies.
create policy org_read_group on public.organizations for select to authenticated
  using (family_group_id is not null and app.is_group_member(family_group_id));
drop policy org_update on public.organizations;
create policy org_update on public.organizations for update to authenticated
  using (app.has_permission(id, 'company.settings')) with check (app.has_permission(id, 'company.settings'));

-- Colleagues: also visible across a shared group.
create policy users_read_group on public.users for select to authenticated
  using (exists (
    select 1 from public.group_memberships mine
    join public.group_memberships theirs on theirs.family_group_id = mine.family_group_id
    where mine.user_id = auth.uid() and theirs.user_id = public.users.id));

create or replace function app.guard_last_group_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'group_owner' and (tg_op = 'DELETE' or new.role <> 'group_owner')
     and exists (select 1 from public.family_groups g where g.id = old.family_group_id)
     and not exists (select 1 from public.group_memberships gm
                     where gm.family_group_id = old.family_group_id and gm.role = 'group_owner' and gm.id <> old.id) then
    raise exception 'A family group must keep at least one group owner' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end $$;
create trigger group_memberships_guard_last_owner before update or delete on public.group_memberships
  for each row execute function app.guard_last_group_owner();

-- ---------------------------------------------------------------------------
-- 5. Audit: group-scoped rows and registry changes
-- ---------------------------------------------------------------------------
alter table public.audit_logs add column family_group_id uuid;
create index on public.audit_logs (family_group_id, created_at desc);

create or replace function app.audit_row() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if tg_op = 'UPDATE' and v_old - 'updated_at' = v_new - 'updated_at' then
    return new;
  end if;
  insert into public.audit_logs (organization_id, family_group_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (
    case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid else (v_row ->> 'organization_id')::uuid end,
    case when tg_table_name = 'family_groups' then (v_row ->> 'id')::uuid else (v_row ->> 'family_group_id')::uuid end,
    auth.uid(),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    tg_op, v_old, v_new
  );
  return coalesce(new, old);
end $$;

drop policy audit_logs_read on public.audit_logs;
create policy audit_logs_read on public.audit_logs for select to authenticated
  using ((organization_id is not null and app.has_permission(organization_id, 'audit.read'))
      or (organization_id is null and family_group_id is not null and app.is_group_owner(family_group_id)));

do $$
declare t text;
begin
  foreach t in array array['family_groups', 'group_memberships'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['organizations', 'family_groups', 'group_memberships'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. CRM foundation used by the dashboards (Phase 3 extends it)
-- ---------------------------------------------------------------------------
create table public.pipeline_stages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  position        smallint not null check (position >= 0),
  -- What the stage means, so dashboards can find proposals, wins and losses whatever it is called.
  kind            text not null default 'open' check (kind in ('open', 'meeting', 'proposal', 'negotiation', 'won', 'lost')),
  -- Probability used for the weighted forecast. Configured per company, not assumed.
  probability_pct smallint not null default 0 check (probability_pct between 0 and 100),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name),
  check (kind <> 'won' or probability_pct = 100),
  check (kind <> 'lost' or probability_pct = 0)
);
create index on public.pipeline_stages (organization_id, position);

create table public.deals (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  title             text not null check (length(trim(title)) between 1 and 200),
  account_name      text check (account_name is null or length(account_name) <= 200),
  stage_id          uuid not null,
  -- Minor units next to an explicit currency. Totals never mix currencies.
  value_minor       bigint not null default 0 check (value_minor >= 0),
  currency          char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  owner_id          uuid references public.users (id) on delete set null,
  is_hot            boolean not null default false,
  expected_close_on date,
  next_action       text check (next_action is null or length(next_action) <= 300),
  next_action_on    date,
  source            text check (source is null or length(source) <= 80),
  last_activity_at  timestamptz not null default now(),
  closed_at         timestamptz,
  lost_reason       text,
  created_by        uuid default auth.uid() references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, stage_id) references public.pipeline_stages (organization_id, id) on delete restrict
);
create index on public.deals (organization_id, stage_id);
create index on public.deals (organization_id, owner_id);

-- Partners see only deals listed here.
create table public.deal_shares (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  deal_id         uuid not null,
  user_id         uuid not null references public.users (id) on delete cascade,
  created_by      uuid default auth.uid() references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (deal_id, user_id),
  foreign key (organization_id, deal_id) references public.deals (organization_id, id) on delete cascade
);

create table public.meetings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title           text not null check (length(trim(title)) between 1 and 200),
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  deal_id         uuid,
  owner_id        uuid references public.users (id) on delete set null,
  location        text,
  status          text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  outcome         text,
  next_step       text,
  created_by      uuid default auth.uid() references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, deal_id) references public.deals (organization_id, id) on delete set null (deal_id),
  check (ends_at is null or ends_at >= starts_at)
);
create index on public.meetings (organization_id, starts_at);

create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title           text not null check (length(trim(title)) between 1 and 200),
  details         text,
  due_on          date,
  assignee_id     uuid references public.users (id) on delete set null,
  status          text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  priority        public.task_priority not null default 'normal',
  deal_id         uuid,
  completed_at    timestamptz,
  created_by      uuid default auth.uid() references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, deal_id) references public.deals (organization_id, id) on delete set null (deal_id)
);
create index on public.tasks (organization_id, status, due_on);
create index on public.tasks (assignee_id) where status in ('open', 'in_progress');

-- Owners, assignees and share recipients must be members of the same company, so a
-- record can never be handed to (and leak to) someone outside it.
create or replace function app.guard_crm_people() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  -- Read through jsonb: the column differs per table and NEW has no common shape.
  v_user := (to_jsonb(new) ->> case tg_table_name
    when 'tasks' then 'assignee_id' when 'deal_shares' then 'user_id' else 'owner_id' end)::uuid;
  if v_user is not null and not app.is_org_member(new.organization_id, v_user) then
    raise exception 'That person is not a member of this company' using errcode = 'check_violation';
  end if;
  if tg_table_name <> 'deals' then
    return new;
  end if;
  begin
    -- Stage kind decides whether the deal is closed; keep closed_at in step.
    if (select kind from public.pipeline_stages where id = new.stage_id) in ('won', 'lost') then
      new.closed_at := coalesce(new.closed_at, now());
    else
      new.closed_at := null;
    end if;
    if tg_op = 'UPDATE' and (new.stage_id <> old.stage_id or new.value_minor <> old.value_minor
                             or new.next_action is distinct from old.next_action) then
      new.last_activity_at := now();
    end if;
  end;
  return new;
end $$;

create or replace function app.task_completed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' then new.completed_at := coalesce(new.completed_at, now()); else new.completed_at := null; end if;
  return new;
end $$;
create trigger tasks_completed_at before insert or update on public.tasks
  for each row execute function app.task_completed_at();

do $$
declare t text;
begin
  foreach t in array array['deals', 'meetings', 'tasks', 'deal_shares'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function app.guard_crm_people()', t || '_guard_people', t);
  end loop;
  foreach t in array array['pipeline_stages', 'deals', 'meetings', 'tasks'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['pipeline_stages', 'deals', 'deal_shares', 'meetings', 'tasks'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()', t || '_audit', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

grant select on public.family_groups, public.group_memberships, public.permissions, public.role_permissions to authenticated;
grant update on public.family_groups to authenticated;
grant insert, update, delete on public.group_memberships to authenticated;
grant all on public.family_groups, public.group_memberships, public.permissions, public.role_permissions to service_role;
revoke all on public.family_groups, public.group_memberships, public.permissions, public.role_permissions from anon;

create or replace function app.can_read_deal(p_org uuid, p_deal uuid, p_owner uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select app.has_permission(p_org, 'crm.read_all')
      or (p_owner = auth.uid() and app.has_permission(p_org, 'crm.read_assigned'))
      or (app.has_permission(p_org, 'crm.read_shared')
          and exists (select 1 from public.deal_shares s where s.deal_id = p_deal and s.user_id = auth.uid()))
$$;

create or replace function app.can_write_owned(p_org uuid, p_owner uuid) returns boolean
language sql stable as $$
  select app.has_permission(p_org, 'crm.write')
     and (app.has_permission(p_org, 'crm.read_all') or p_owner = auth.uid())
$$;

create or replace function app.can_read_any_crm(p_org uuid) returns boolean
language sql stable as $$
  select app.has_permission(p_org, 'crm.read_all') or app.has_permission(p_org, 'crm.read_assigned')
      or app.has_permission(p_org, 'crm.read_shared') or app.has_permission(p_org, 'tasks.write')
$$;

create policy pipeline_stages_read on public.pipeline_stages for select to authenticated
  using (app.can_read_any_crm(organization_id));
create policy pipeline_stages_write on public.pipeline_stages for all to authenticated
  using (app.has_permission(organization_id, 'crm.manage')) with check (app.has_permission(organization_id, 'crm.manage'));

create policy deals_read on public.deals for select to authenticated
  using (app.can_read_deal(organization_id, id, owner_id));
create policy deals_insert on public.deals for insert to authenticated
  with check (app.can_write_owned(organization_id, owner_id));
create policy deals_update on public.deals for update to authenticated
  using (app.can_write_owned(organization_id, owner_id)) with check (app.can_write_owned(organization_id, owner_id));
create policy deals_delete on public.deals for delete to authenticated
  using (app.has_permission(organization_id, 'crm.manage'));

create policy deal_shares_read on public.deal_shares for select to authenticated
  using (app.has_permission(organization_id, 'crm.read_all') or user_id = auth.uid());
create policy deal_shares_write on public.deal_shares for all to authenticated
  using (app.has_permission(organization_id, 'crm.manage')) with check (app.has_permission(organization_id, 'crm.manage'));

create policy meetings_read on public.meetings for select to authenticated
  using (app.has_permission(organization_id, 'crm.read_all')
      or (owner_id = auth.uid() and app.has_permission(organization_id, 'crm.read_assigned')));
create policy meetings_insert on public.meetings for insert to authenticated
  with check (app.can_write_owned(organization_id, owner_id));
create policy meetings_update on public.meetings for update to authenticated
  using (app.can_write_owned(organization_id, owner_id)) with check (app.can_write_owned(organization_id, owner_id));
create policy meetings_delete on public.meetings for delete to authenticated
  using (app.has_permission(organization_id, 'crm.manage'));

create policy tasks_read on public.tasks for select to authenticated
  using (app.has_permission(organization_id, 'tasks.read_all')
      or (app.has_permission(organization_id, 'tasks.write') and (assignee_id = auth.uid() or created_by = auth.uid())));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (app.has_permission(organization_id, 'tasks.write') and created_by = auth.uid()
              and (assignee_id is null or assignee_id = auth.uid() or app.has_permission(organization_id, 'tasks.read_all')));
create policy tasks_update on public.tasks for update to authenticated
  using (app.has_permission(organization_id, 'tasks.read_all')
      or (app.has_permission(organization_id, 'tasks.write') and assignee_id = auth.uid()))
  with check (app.has_permission(organization_id, 'tasks.read_all')
      or (app.has_permission(organization_id, 'tasks.write') and assignee_id = auth.uid()));
create policy tasks_delete on public.tasks for delete to authenticated
  using (app.has_permission(organization_id, 'tasks.read_all'));

-- ---------------------------------------------------------------------------
-- 7. RPCs
-- ---------------------------------------------------------------------------

-- Pre-group workspace creation (kept for the existing onboarding path) now sets a slug.
create or replace function public.create_organization(p_name text, p_is_demo boolean default false)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid := gen_random_uuid();
  v_base text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(length(trim(p_name)), 0) = 0 then
    raise exception 'Organization name is required' using errcode = 'check_violation';
  end if;
  insert into public.users (id, email)
  select u.id, u.email from auth.users u where u.id = v_uid
  on conflict (id) do nothing;
  v_base := trim(both '-' from left(regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'), 30));
  if v_base !~ '^[a-z0-9]' then v_base := 'company'; end if;
  insert into public.organizations (id, name, is_demo, slug)
  values (v_org, trim(p_name), p_is_demo, v_base || '-' || left(v_org::text, 6));
  insert into public.memberships (organization_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.app_settings (organization_id) values (v_org);
  return v_org;
end $$;

-- Creates a family group with the caller as its first group owner.
create or replace function public.create_family_group(p_name text, p_is_demo boolean default false)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'insufficient_privilege'; end if;
  if coalesce(length(trim(p_name)), 0) = 0 then raise exception 'Group name is required' using errcode = 'check_violation'; end if;
  insert into public.users (id, email) select u.id, u.email from auth.users u where u.id = v_uid on conflict (id) do nothing;
  insert into public.family_groups (name, is_demo) values (trim(p_name), p_is_demo) returning id into v_group;
  insert into public.group_memberships (family_group_id, user_id, role, created_by) values (v_group, v_uid, 'group_owner', v_uid);
  return v_group;
end $$;

-- Adds a company workspace to a group. Only a group owner may do this; the caller becomes
-- the company's first owner. p_company keys: name, slug, short_name, ownership_type,
-- owner_label, consolidation, business_model, lifecycle_status, enabled_modules (array),
-- sidebar_color, accent_color, logo_key, stages (array of {name, kind, probability_pct}).
create or replace function public.create_company(p_group uuid, p_company jsonb)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_stage jsonb;
  v_pos int := 0;
  v_group public.family_groups;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = 'insufficient_privilege'; end if;
  if not app.is_group_owner(p_group) then
    raise exception 'Only a group owner can add a company to the group' using errcode = 'insufficient_privilege';
  end if;
  select * into v_group from public.family_groups where id = p_group;

  insert into public.organizations (
    name, family_group_id, slug, short_name, ownership_type, owner_label, consolidation, business_model,
    lifecycle_status, enabled_modules, sidebar_color, accent_color, logo_key, is_demo, base_currency, fy_start_month)
  values (
    trim(p_company ->> 'name'), p_group, p_company ->> 'slug', nullif(trim(p_company ->> 'short_name'), ''),
    coalesce(p_company ->> 'ownership_type', 'unconfigured'), nullif(trim(p_company ->> 'owner_label'), ''),
    coalesce(p_company ->> 'consolidation', 'needs_confirmation'), coalesce(p_company ->> 'business_model', 'general'),
    coalesce(p_company ->> 'lifecycle_status', 'setup'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(p_company -> 'enabled_modules') x),
             '{home,pipeline,meetings,tasks,finance,team,settings}'),
    p_company ->> 'sidebar_color', p_company ->> 'accent_color', p_company ->> 'logo_key',
    v_group.is_demo, coalesce(p_company ->> 'base_currency', v_group.base_currency), v_group.fy_start_month)
  returning id into v_org;

  insert into public.memberships (organization_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.app_settings (organization_id) values (v_org);

  for v_stage in select * from jsonb_array_elements(coalesce(p_company -> 'stages', '[]'::jsonb)) loop
    insert into public.pipeline_stages (organization_id, name, position, kind, probability_pct)
    values (v_org, v_stage ->> 'name', v_pos, coalesce(v_stage ->> 'kind', 'open'), coalesce((v_stage ->> 'probability_pct')::smallint, 0));
    v_pos := v_pos + 1;
  end loop;
  return v_org;
end $$;

-- Brings an existing (pre-group) workspace, such as the original GBS Finance OS workspace,
-- into a group. The caller must own the company and be a group owner.
create or replace function public.attach_company_to_group(p_org uuid, p_group uuid, p_registry jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not app.is_group_owner(p_group) or not app.has_permission(p_org, 'members.grant_owner') then
    raise exception 'You must own the company and the group' using errcode = 'insufficient_privilege';
  end if;
  update public.organizations set
    family_group_id = p_group,
    slug            = coalesce(p_registry ->> 'slug', slug),
    short_name      = coalesce(p_registry ->> 'short_name', short_name),
    ownership_type  = coalesce(p_registry ->> 'ownership_type', ownership_type),
    owner_label     = coalesce(p_registry ->> 'owner_label', owner_label),
    consolidation   = coalesce(p_registry ->> 'consolidation', consolidation),
    business_model  = coalesce(p_registry ->> 'business_model', business_model),
    lifecycle_status = coalesce(p_registry ->> 'lifecycle_status', lifecycle_status),
    sidebar_color   = coalesce(p_registry ->> 'sidebar_color', sidebar_color),
    accent_color    = coalesce(p_registry ->> 'accent_color', accent_color),
    logo_key        = coalesce(p_registry ->> 'logo_key', logo_key)
  where id = p_org and family_group_id is null;
  if not found then
    raise exception 'That company is already in a group' using errcode = 'check_violation';
  end if;
end $$;

-- Ownership and consolidation decide what the group totals include, so only a group owner sets them.
create or replace function public.set_company_registry(p_org uuid, p_ownership_type text, p_consolidation text, p_owner_label text)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not app.is_group_owner_of_org(p_org) then
    raise exception 'Only a group owner can change ownership or consolidation' using errcode = 'insufficient_privilege';
  end if;
  update public.organizations set ownership_type = p_ownership_type, consolidation = p_consolidation,
    owner_label = nullif(trim(p_owner_label), '') where id = p_org;
end $$;

create or replace function public.set_emergency_stop(p_org uuid, p_on boolean, p_reason text default null)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not app.has_permission(p_org, 'company.emergency_stop') then
    raise exception 'Not allowed to stop or resume this company' using errcode = 'insufficient_privilege';
  end if;
  if p_on and coalesce(length(trim(p_reason)), 0) = 0 then
    raise exception 'Give a reason for the emergency stop' using errcode = 'check_violation';
  end if;
  update public.organizations set
    emergency_stop = p_on,
    emergency_stop_at = case when p_on then now() end,
    emergency_stop_by = case when p_on then auth.uid() end,
    emergency_stop_reason = case when p_on then trim(p_reason) end
  where id = p_org;
end $$;

-- The caller's role and permissions in one company (for the UI; RLS stays authoritative).
create or replace function public.my_permissions(p_org uuid)
returns text[]
language sql stable security definer set search_path = public, auth as $$
  select coalesce(array_agg(rp.permission order by rp.permission), '{}')
  from public.memberships m join public.role_permissions rp on rp.role = m.role
  where m.organization_id = p_org and m.user_id = auth.uid()
$$;

revoke all on function public.create_family_group(text, boolean), public.create_company(uuid, jsonb),
  public.attach_company_to_group(uuid, uuid, jsonb), public.set_company_registry(uuid, text, text, text),
  public.set_emergency_stop(uuid, boolean, text), public.my_permissions(uuid) from public, anon;
grant execute on function public.create_family_group(text, boolean), public.create_company(uuid, jsonb),
  public.attach_company_to_group(uuid, uuid, jsonb), public.set_company_registry(uuid, text, text, text),
  public.set_emergency_stop(uuid, boolean, text), public.my_permissions(uuid) to authenticated;
revoke execute on all functions in schema app from anon, public;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Adding people. A person must have signed in once (Supabase Auth creates their
--    profile); then a manager can add them by email. Sign-in itself stays restricted by
--    Supabase Auth settings and AUTH_ALLOWED_EMAILS.
-- ---------------------------------------------------------------------------
create or replace function public.add_member_by_email(p_org uuid, p_email text, p_role text)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_user uuid;
begin
  if not app.can_manage_member(p_org, p_role) then
    raise exception 'Not allowed to grant that role in this company' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.roles where key = p_role) or p_role in ('group_owner', 'family_owner', 'group_viewer') then
    raise exception 'Unknown company role' using errcode = 'check_violation';
  end if;
  select id into v_user from public.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No one with that email has signed in yet. Ask them to sign in once, then add them.' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.memberships where organization_id = p_org and user_id = v_user) then
    raise exception 'That person is already a member. Change their role instead.' using errcode = 'unique_violation';
  end if;
  insert into public.memberships (organization_id, user_id, role) values (p_org, v_user, p_role);
  return v_user;
end $$;

create or replace function public.add_group_member_by_email(p_group uuid, p_email text, p_role text)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_user uuid;
begin
  if not app.is_group_owner(p_group) then
    raise exception 'Only a group owner can grant group access' using errcode = 'insufficient_privilege';
  end if;
  select id into v_user from public.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No one with that email has signed in yet. Ask them to sign in once, then add them.' using errcode = 'no_data_found';
  end if;
  insert into public.group_memberships (family_group_id, user_id, role, created_by) values (p_group, v_user, p_role, auth.uid());
  return v_user;
end $$;

revoke all on function public.add_member_by_email(uuid, text, text), public.add_group_member_by_email(uuid, text, text) from public, anon;
grant execute on function public.add_member_by_email(uuid, text, text), public.add_group_member_by_email(uuid, text, text) to authenticated;
