-- GBS Engagement Engine — Row Level Security, grants and integrity triggers.
--
-- Request queries run as role gbs_app with app.user_id set for the transaction:
--   select set_config('app.user_id', '<uuid>', true); set local role gbs_app;
-- gbs_app has no BYPASSRLS, so every policy below applies to every request.
-- Background jobs run as the service connection and scope by job.client_id.

-- ───────────────────────────── Identity helpers ─────────────────────────────
create or replace function app.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app.current_org() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select organization_id from users where id = app.uid() and status = 'active'
$$;

create or replace function app.is_super_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from users where id = app.uid() and status = 'active' and platform_role = 'super_admin')
$$;

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from users where id = app.uid() and status = 'active'
                 and platform_role in ('super_admin','account_manager'))
$$;

-- Super admin of the client's organisation, or an account manager assigned to the client.
create or replace function app.is_gbs_manager(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from users u join clients c on c.organization_id = u.organization_id
    where u.id = app.uid() and u.status = 'active' and c.id = cid
      and (u.platform_role = 'super_admin'
           or (u.platform_role = 'account_manager'
               and exists (select 1 from account_managers am where am.client_id = cid and am.user_id = u.id)))
  )
$$;

create or replace function app.client_role(cid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select cu.role from client_users cu join users u on u.id = cu.user_id
  where cu.client_id = cid and cu.user_id = app.uid() and u.status = 'active'
$$;

create or replace function app.can_access_client(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_gbs_manager(cid) or app.client_role(cid) is not null
$$;

-- Configure brand, audiences, campaigns, accounts: GBS managers and the client owner.
create or replace function app.can_manage_client(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_gbs_manager(cid) or app.client_role(cid) = 'owner'
$$;

create or replace function app.can_approve_gbs(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_gbs_manager(cid)
$$;

create or replace function app.can_approve_client(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from client_users cu join users u on u.id = cu.user_id
    where cu.client_id = cid and cu.user_id = app.uid() and u.status = 'active'
      and (cu.role = 'owner' or cu.can_approve)
  )
$$;

create or replace function app.can_edit_comments(cid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.is_gbs_manager(cid) or exists (
    select 1 from client_users cu join users u on u.id = cu.user_id
    where cu.client_id = cid and cu.user_id = app.uid() and u.status = 'active'
      and (cu.role = 'owner' or cu.can_edit)
  )
$$;

-- Users that share at least one client with the current user (for "approved by" names).
create or replace function app.shares_client_with(other uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from (
      select client_id from client_users where user_id = other
      union select client_id from account_managers where user_id = other
    ) theirs
    where app.can_access_client(theirs.client_id)
  )
$$;

-- ───────────────────────────── Approval rules ─────────────────────────────
create or replace function app.effective_approval_mode(comment uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(ca.approval_mode, cl.approval_mode)
  from comments c
  join campaigns ca on ca.id = c.campaign_id and ca.client_id = c.client_id
  join clients cl on cl.id = c.client_id
  where c.id = comment
$$;

create or replace function app.comment_fully_approved(comment uuid) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  mode text := app.effective_approval_mode(comment);
  has_gbs boolean;
  has_client boolean;
begin
  select exists (select 1 from comment_approvals where comment_id = comment and approver_side = 'gbs' and decision = 'approved'),
         exists (select 1 from comment_approvals where comment_id = comment and approver_side = 'client' and decision = 'approved')
    into has_gbs, has_client;
  return case mode
    when 'manual' then has_client
    when 'gbs' then has_gbs
    when 'dual' then has_gbs and has_client
    else false
  end;
end $$;

-- ───────────────────────────── Integrity triggers ─────────────────────────────
-- Tenancy columns never change after insert.
create or replace function app.freeze_tenancy() returns trigger
language plpgsql as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.client_id is distinct from old.client_id then
    raise exception 'tenancy columns are immutable on %', tg_table_name using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'client_users','account_managers','social_accounts','oauth_tokens','brand_profiles','brand_documents',
    'audience_segments','audience_keywords','target_profiles','campaigns','campaign_segments',
    'campaign_target_profiles','posts','engagement_opportunities','comment_generations','comments',
    'comment_edits','comment_approvals','publishing_jobs','publishing_results','engagement_metrics',
    'usage_limits','usage_events','daily_reports'
  ] loop
    execute format('create trigger %I before update on %I for each row execute function app.freeze_tenancy()',
                   t || '_freeze_tenancy', t);
  end loop;
end $$;

-- Comment lifecycle: legal transitions, approval enforcement, edit handling.
create or replace function app.comments_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  allowed text[];
begin
  if new.opportunity_id <> old.opportunity_id or new.campaign_id <> old.campaign_id
     or new.original_text <> old.original_text then
    raise exception 'comment origin is immutable' using errcode = '42501';
  end if;

  if new.current_text is distinct from old.current_text then
    if old.status not in ('generated','pending_approval') then
      raise exception 'comment text can only change before approval (status %)', old.status using errcode = '42501';
    end if;
    new.is_edited := new.current_text <> new.original_text;
    -- Any edit invalidates approvals already given on the old text.
    delete from comment_approvals where comment_id = new.id and decision = 'approved';
  end if;

  if new.status <> old.status then
    allowed := case old.status
      when 'generated'        then array['pending_approval','rejected','superseded']
      when 'pending_approval' then array['approved','rejected','superseded','generated']
      when 'approved'         then array['queued','rejected','pending_approval']
      when 'queued'           then array['publishing','approved','failed','published']
      when 'publishing'       then array['published','failed','queued']
      when 'failed'           then array['queued','rejected']
      when 'rejected'         then array['pending_approval']
      else array[]::text[]
    end;
    if not new.status = any(allowed) then
      raise exception 'illegal comment transition % -> %', old.status, new.status using errcode = '42501';
    end if;

    if new.status = 'rejected' and app.uid() is not null
       and not (app.can_approve_client(new.client_id) or app.can_approve_gbs(new.client_id)) then
      raise exception 'only approvers can reject comments' using errcode = '42501';
    end if;

    if new.status = 'approved' then
      if not app.comment_fully_approved(new.id) then
        raise exception 'comment % lacks the approvals its approval mode requires', new.id using errcode = '42501';
      end if;
      new.approved_at := coalesce(new.approved_at, now());
    end if;

    if new.status in ('pending_approval','rejected') then
      new.approved_at := null;
    end if;
  end if;

  if new.status in ('queued','publishing','published') and new.approved_at is null then
    raise exception 'unapproved comments cannot be queued or published' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger comments_guard before update on comments
  for each row execute function app.comments_guard();

-- New comments always start as generated drafts.
create or replace function app.comments_insert_guard() returns trigger
language plpgsql as $$
begin
  if new.status not in ('generated','pending_approval') or new.approved_at is not null then
    raise exception 'comments must be created unapproved' using errcode = '42501';
  end if;
  new.current_text := coalesce(new.current_text, new.original_text);
  return new;
end $$;

create trigger comments_insert_guard before insert on comments
  for each row execute function app.comments_insert_guard();

-- Approvals can only be recorded on comments awaiting approval.
create or replace function app.approvals_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  st text;
begin
  select status into st from comments where id = new.comment_id and client_id = new.client_id;
  if st is null then
    raise exception 'comment not found for this client' using errcode = '42501';
  end if;
  if new.decision = 'approved' and st <> 'pending_approval' then
    raise exception 'only comments pending approval can be approved (status %)', st using errcode = '42501';
  end if;
  return new;
end $$;

create trigger comment_approvals_guard before insert on comment_approvals
  for each row execute function app.approvals_guard();

-- Nothing enters the publishing queue unless it is approved.
create or replace function app.publishing_jobs_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c record;
begin
  select status, approved_at, platform into c from comments
  where id = new.comment_id and client_id = new.client_id;
  if c is null then
    raise exception 'comment not found for this client' using errcode = '42501';
  end if;
  if c.approved_at is null or c.status not in ('approved','queued') then
    raise exception 'only approved comments can be queued for publishing' using errcode = '42501';
  end if;
  if c.platform <> new.platform then
    raise exception 'publishing platform must match the comment platform' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger publishing_jobs_guard before insert on publishing_jobs
  for each row execute function app.publishing_jobs_guard();

-- Approval mode and client status are GBS decisions; owners can edit everything else.
create or replace function app.clients_guard() returns trigger
language plpgsql as $$
begin
  if app.uid() is not null and not app.is_gbs_manager(old.id) then
    if new.approval_mode is distinct from old.approval_mode
       or new.status is distinct from old.status
       or new.publish_on_approval is distinct from old.publish_on_approval then
      raise exception 'only GBS can change approval mode, status or publishing behaviour' using errcode = '42501';
    end if;
  end if;
  if new.organization_id <> old.organization_id then
    raise exception 'organization is immutable' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger clients_guard before update on clients
  for each row execute function app.clients_guard();

-- Audit log is append-only. The only permitted update is clearing client_id when a client is deleted.
create or replace function app.audit_logs_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.allow_audit_purge', true) = 'on' then
      return old;
    end if;
    raise exception 'audit_logs is append-only' using errcode = '42501';
  end if;
  if new.client_id is null and old.client_id is not null
     and (to_jsonb(new) - 'client_id') = (to_jsonb(old) - 'client_id') then
    return new;
  end if;
  raise exception 'audit_logs is append-only' using errcode = '42501';
end $$;

create trigger audit_logs_immutable before update or delete on audit_logs
  for each row execute function app.audit_logs_immutable();

-- ───────────────────────────── Grants ─────────────────────────────
grant usage on schema public, app to gbs_app;
grant execute on all functions in schema app to gbs_app;

grant select, insert, update, delete on
  clients, client_users, account_managers, social_accounts, brand_profiles, brand_documents,
  audience_segments, audience_keywords, target_profiles, campaigns, campaign_segments,
  campaign_target_profiles, posts, engagement_opportunities, comment_generations, comments,
  comment_edits, publishing_jobs, engagement_metrics, usage_limits, daily_reports
to gbs_app;

grant select, insert on comment_approvals, publishing_results, usage_events, audit_logs to gbs_app;
grant select, update (read_at), delete on notifications to gbs_app;
grant select, update on organizations to gbs_app;
grant insert, update (full_name, platform_role, status), delete on users to gbs_app;
-- Column-level read: password_hash is never readable by request queries.
grant select (id, organization_id, email, full_name, platform_role, status, last_login_at, created_at) on users to gbs_app;
-- Deliberately no grants on: oauth_tokens, oauth_states, sessions, rate_limits.

-- ───────────────────────────── Row Level Security ─────────────────────────────
alter table organizations enable row level security;
alter table users enable row level security;
alter table sessions enable row level security;
alter table rate_limits enable row level security;
alter table oauth_tokens enable row level security;
alter table oauth_states enable row level security;

create policy org_read on organizations for select to gbs_app using (id = app.current_org());
create policy org_update on organizations for update to gbs_app
  using (id = app.current_org() and app.is_super_admin()) with check (id = app.current_org());

create policy users_read on users for select to gbs_app using (
  id = app.uid()
  or (organization_id = app.current_org() and app.is_staff())
  or app.shares_client_with(id)
);
create policy users_admin_insert on users for insert to gbs_app
  with check (organization_id = app.current_org() and app.is_super_admin());
create policy users_admin_update on users for update to gbs_app
  using (organization_id = app.current_org() and app.is_super_admin())
  with check (organization_id = app.current_org());
create policy users_admin_delete on users for delete to gbs_app
  using (organization_id = app.current_org() and app.is_super_admin() and id <> app.uid());

-- clients
alter table clients enable row level security;
create policy clients_read on clients for select to gbs_app using (app.can_access_client(id));
create policy clients_insert on clients for insert to gbs_app
  with check (organization_id = app.current_org() and app.is_super_admin());
create policy clients_update on clients for update to gbs_app
  using (app.can_manage_client(id)) with check (app.can_manage_client(id));
create policy clients_delete on clients for delete to gbs_app
  using (organization_id = app.current_org() and app.is_super_admin());

-- Membership tables
alter table client_users enable row level security;
create policy client_users_read on client_users for select to gbs_app using (app.can_access_client(client_id));
create policy client_users_write on client_users for all to gbs_app
  using (app.is_gbs_manager(client_id)) with check (app.is_gbs_manager(client_id));

alter table account_managers enable row level security;
create policy account_managers_read on account_managers for select to gbs_app using (app.can_access_client(client_id));
create policy account_managers_write on account_managers for all to gbs_app
  using (app.is_super_admin() and app.is_gbs_manager(client_id))
  with check (app.is_super_admin() and app.is_gbs_manager(client_id));

-- Client configuration: readable by everyone on the client, writable by managers + owner.
do $$
declare t text;
begin
  foreach t in array array[
    'social_accounts','brand_profiles','brand_documents','audience_segments','audience_keywords',
    'target_profiles','campaigns','campaign_segments','campaign_target_profiles',
    'posts','engagement_opportunities','comment_generations','engagement_metrics','daily_reports'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to gbs_app using (app.can_access_client(client_id))',
                   t || '_read', t);
    execute format('create policy %I on %I for insert to gbs_app with check (app.can_manage_client(client_id))',
                   t || '_insert', t);
    execute format('create policy %I on %I for update to gbs_app using (app.can_manage_client(client_id)) with check (app.can_manage_client(client_id))',
                   t || '_update', t);
    execute format('create policy %I on %I for delete to gbs_app using (app.can_manage_client(client_id))',
                   t || '_delete', t);
  end loop;
end $$;

-- Limits are a GBS control.
alter table usage_limits enable row level security;
create policy usage_limits_read on usage_limits for select to gbs_app using (app.can_access_client(client_id));
create policy usage_limits_write on usage_limits for all to gbs_app
  using (app.is_gbs_manager(client_id)) with check (app.is_gbs_manager(client_id));

-- Comments: created by managers, edited by editors, status changed by approvers.
alter table comments enable row level security;
create policy comments_read on comments for select to gbs_app using (app.can_access_client(client_id));
create policy comments_insert on comments for insert to gbs_app with check (app.can_manage_client(client_id));
create policy comments_update on comments for update to gbs_app
  using (app.can_edit_comments(client_id) or app.can_approve_client(client_id) or app.can_approve_gbs(client_id))
  with check (app.can_edit_comments(client_id) or app.can_approve_client(client_id) or app.can_approve_gbs(client_id));
create policy comments_delete on comments for delete to gbs_app
  using (app.is_gbs_manager(client_id) and status in ('generated','superseded','rejected'));

alter table comment_edits enable row level security;
create policy comment_edits_read on comment_edits for select to gbs_app using (app.can_access_client(client_id));
create policy comment_edits_insert on comment_edits for insert to gbs_app with check (
  editor_id = app.uid() and (
    (kind = 'suggestion' and app.can_access_client(client_id))
    or (kind = 'edit' and app.can_edit_comments(client_id))
  )
);
create policy comment_edits_update on comment_edits for update to gbs_app
  using (app.can_edit_comments(client_id)) with check (app.can_edit_comments(client_id));

alter table comment_approvals enable row level security;
create policy comment_approvals_read on comment_approvals for select to gbs_app using (app.can_access_client(client_id));
create policy comment_approvals_insert on comment_approvals for insert to gbs_app with check (
  approver_id = app.uid() and (
    (approver_side = 'gbs' and app.can_approve_gbs(client_id))
    or (approver_side = 'client' and app.can_approve_client(client_id))
  )
);

alter table publishing_jobs enable row level security;
create policy publishing_jobs_read on publishing_jobs for select to gbs_app using (app.can_access_client(client_id));
create policy publishing_jobs_insert on publishing_jobs for insert to gbs_app
  with check (app.can_approve_gbs(client_id) or app.can_approve_client(client_id));
create policy publishing_jobs_update on publishing_jobs for update to gbs_app
  using (app.can_manage_client(client_id) or app.can_approve_client(client_id))
  with check (app.can_manage_client(client_id) or app.can_approve_client(client_id));

create policy publishing_jobs_delete on publishing_jobs for delete to gbs_app
  using (status in ('queued','manual_required','failed','cancelled')
         and (app.can_manage_client(client_id) or app.can_approve_client(client_id)));

alter table publishing_results enable row level security;
create policy publishing_results_read on publishing_results for select to gbs_app using (app.can_access_client(client_id));
create policy publishing_results_insert on publishing_results for insert to gbs_app
  with check (recorded_by = app.uid() and (app.can_edit_comments(client_id) or app.can_approve_client(client_id)));

alter table usage_events enable row level security;
create policy usage_events_read on usage_events for select to gbs_app using (app.can_access_client(client_id));
create policy usage_events_insert on usage_events for insert to gbs_app with check (app.can_access_client(client_id));

alter table notifications enable row level security;
create policy notifications_own on notifications for select to gbs_app using (user_id = app.uid());
create policy notifications_mark_read on notifications for update to gbs_app
  using (user_id = app.uid()) with check (user_id = app.uid());
create policy notifications_delete on notifications for delete to gbs_app using (user_id = app.uid());

alter table audit_logs enable row level security;
create policy audit_logs_read on audit_logs for select to gbs_app using (
  organization_id = app.current_org() and (
    app.is_super_admin()
    or (client_id is not null and app.can_manage_client(client_id))
  )
);
create policy audit_logs_insert on audit_logs for insert to gbs_app with check (
  actor_id = app.uid() and organization_id = app.current_org()
  and (client_id is null or app.can_access_client(client_id))
);
