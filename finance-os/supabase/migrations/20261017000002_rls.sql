-- GBS Finance OS: row level security
--
-- Model: a user sees an organization's data only through a membership row.
--   owner, finance       read and write all finance data
--   viewer               read all finance data
--   account_manager      read clients they own (and those clients' invoices,
--                        contacts, contracts, commitments, ad budgets), and log commitments
-- The service role (server-side jobs and webhooks only) bypasses RLS.
--
-- RLS is enabled but deliberately not FORCEd: the SECURITY DEFINER helpers below
-- run as the table owner and must read memberships without recursing into policies.

grant usage on schema app to authenticated, service_role;

create or replace function app.member_role(p_org uuid) returns text
language sql stable security definer set search_path = public, auth as $$
  select m.role from public.memberships m
  where m.organization_id = p_org and m.user_id = auth.uid()
$$;

create or replace function app.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select app.member_role(p_org) is not null
$$;

create or replace function app.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce(app.member_role(p_org) = any (p_roles), false)
$$;

create or replace function app.can_write(p_org uuid) returns boolean
language sql stable as $$ select app.has_role(p_org, array['owner', 'finance']) $$;

create or replace function app.can_read_finance(p_org uuid) returns boolean
language sql stable as $$ select app.has_role(p_org, array['owner', 'finance', 'viewer']) $$;

create or replace function app.can_read_client(p_org uuid, p_client uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select app.can_read_finance(p_org)
      or (app.has_role(p_org, array['account_manager'])
          and exists (select 1 from public.clients c
                      where c.id = p_client and c.organization_id = p_org
                        and c.account_owner_id = auth.uid()))
$$;

grant execute on all functions in schema app to authenticated, service_role;

-- Anonymous users get nothing.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'roles', 'users', 'memberships', 'clients', 'billing_contacts', 'contracts',
    'invoices', 'invoice_line_items', 'credit_notes', 'payment_extensions', 'payments',
    'payment_allocations', 'advertising_budgets', 'advertising_funding_events', 'expenses',
    'payment_commitments', 'reminder_events', 'escalation_tasks', 'integration_sync_runs',
    'integration_events', 'app_settings', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Reference data
create policy roles_read on public.roles for select to authenticated using (true);

-- Organizations: created only through public.create_organization().
create policy org_read on public.organizations for select to authenticated
  using (app.is_member(id));
create policy org_update on public.organizations for update to authenticated
  using (app.has_role(id, array['owner'])) with check (app.has_role(id, array['owner']));

-- Users: see yourself and colleagues in shared organizations; edit only yourself.
create policy users_read on public.users for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and theirs.user_id = public.users.id));
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Memberships: members see the roster; only owners manage it.
create policy memberships_read on public.memberships for select to authenticated
  using (app.is_member(organization_id));
create policy memberships_owner_write on public.memberships for all to authenticated
  using (app.has_role(organization_id, array['owner']))
  with check (app.has_role(organization_id, array['owner']));

-- Client-scoped tables: readable per app.can_read_client, writable by owner/finance.
create policy clients_read on public.clients for select to authenticated
  using (app.can_read_client(organization_id, id));
create policy clients_write on public.clients for all to authenticated
  using (app.can_write(organization_id)) with check (app.can_write(organization_id));

do $$
declare t text;
begin
  foreach t in array array['billing_contacts', 'contracts', 'invoices', 'advertising_budgets', 'payment_commitments'] loop
    execute format($f$create policy %I on public.%I for select to authenticated
                     using (app.can_read_client(organization_id, client_id))$f$, t || '_read', t);
    execute format($f$create policy %I on public.%I for all to authenticated
                     using (app.can_write(organization_id)) with check (app.can_write(organization_id))$f$,
                   t || '_write', t);
  end loop;
end $$;

-- Account managers may log a commitment for their own clients (but not edit others).
create policy payment_commitments_am_insert on public.payment_commitments for insert to authenticated
  with check (app.has_role(organization_id, array['account_manager'])
              and app.can_read_client(organization_id, client_id)
              and status = 'open');

-- Invoice children follow the parent invoice's visibility.
create policy invoice_line_items_read on public.invoice_line_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and app.can_read_client(i.organization_id, i.client_id)));
create policy invoice_line_items_write on public.invoice_line_items for all to authenticated
  using (app.can_write(organization_id)) with check (app.can_write(organization_id));

create policy credit_notes_read on public.credit_notes for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and app.can_read_client(i.organization_id, i.client_id)));
create policy credit_notes_write on public.credit_notes for all to authenticated
  using (app.can_write(organization_id)) with check (app.can_write(organization_id));

create policy payment_extensions_read on public.payment_extensions for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id
                 and app.can_read_client(i.organization_id, i.client_id)));
create policy payment_extensions_write on public.payment_extensions for all to authenticated
  using (app.can_write(organization_id)) with check (app.can_write(organization_id));

create policy advertising_funding_events_read on public.advertising_funding_events for select to authenticated
  using (exists (select 1 from public.advertising_budgets b where b.id = budget_id
                 and app.can_read_client(b.organization_id, b.client_id)));
create policy advertising_funding_events_write on public.advertising_funding_events for all to authenticated
  using (app.can_write(organization_id)) with check (app.can_write(organization_id));

-- Organization-wide finance tables: finance roles read, owner/finance write.
do $$
declare t text;
begin
  foreach t in array array['payments', 'payment_allocations', 'expenses', 'reminder_events',
                           'escalation_tasks', 'integration_sync_runs', 'app_settings'] loop
    execute format($f$create policy %I on public.%I for select to authenticated
                     using (app.can_read_finance(organization_id))$f$, t || '_read', t);
    execute format($f$create policy %I on public.%I for all to authenticated
                     using (app.can_write(organization_id)) with check (app.can_write(organization_id))$f$,
                   t || '_write', t);
  end loop;
end $$;

-- Provider events are written only by webhook routes (service role).
create policy integration_events_read on public.integration_events for select to authenticated
  using (organization_id is not null and app.can_read_finance(organization_id));

-- Audit log is append-only via trigger; owners read it.
create policy audit_logs_read on public.audit_logs for select to authenticated
  using (organization_id is not null and app.has_role(organization_id, array['owner']));
revoke insert, update, delete on public.audit_logs from authenticated;
revoke update, delete on public.integration_events from authenticated;
revoke insert on public.integration_events from authenticated;
