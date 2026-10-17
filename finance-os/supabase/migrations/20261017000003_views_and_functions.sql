-- GBS Finance OS: derived views and RPCs

-- "Today" in the organization's timezone (Asia/Kolkata by default), never the server's.
create or replace function app.org_today(p_org uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.organizations where id = p_org), 'Asia/Kolkata'))::date
$$;
grant execute on function app.org_today(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- invoice_balances: one row per invoice with derived collection state.
-- security_invoker = true, so callers see only rows RLS allows.
-- ---------------------------------------------------------------------------
create or replace view public.invoice_balances with (security_invoker = true) as
with base as (
  select
    i.*,
    c.client_code,
    c.legal_name   as client_legal_name,
    c.trading_name as client_trading_name,
    app.org_today(i.organization_id) as today,
    ext.new_due_date as extended_due_date,
    coalesce(ext.new_due_date, i.due_date) as effective_due_date,
    exists (
      select 1 from public.payment_allocations a
      join public.payments p on p.id = a.payment_id
      where a.invoice_id = i.id and p.verification_status = 'pending_verification'
    ) as has_pending_payment,
    (select min(pc.commitment_date) from public.payment_commitments pc
      where pc.invoice_id = i.id and pc.status = 'open') as open_commitment_date
  from public.invoices i
  join public.clients c on c.id = i.client_id
  left join public.payment_extensions ext on ext.invoice_id = i.id and ext.status = 'active'
)
select
  base.*,
  case
    when base.outstanding_minor = 0 and base.total_minor > 0 then 'paid'
    when base.amount_received_minor > 0 then 'partially_paid'
    else 'unpaid'
  end as payment_state,
  greatest(base.today - base.effective_due_date, 0) as days_overdue,
  case
    when base.status = 'cancelled' then 'cancelled'
    when base.outstanding_minor = 0 then 'settled'
    when base.status = 'disputed' then 'disputed'
    when base.today < base.effective_due_date then 'not_due'
    when base.today = base.effective_due_date then 'due_today'
    when base.today - base.effective_due_date <= 15 then 'overdue_1_15'
    when base.today - base.effective_due_date <= 45 then 'overdue_16_45'
    else 'overdue_45_plus'
  end as ageing_bucket
from base;

-- client_balances: collection position per client (open, non-cancelled invoices only).
create or replace view public.client_balances with (security_invoker = true) as
select
  c.id as client_id,
  c.organization_id,
  c.client_code,
  c.legal_name,
  c.trading_name,
  c.service_status,
  c.missed_commitments_count,
  count(b.id) filter (where b.outstanding_minor > 0)                                      as open_invoice_count,
  coalesce(sum(b.outstanding_minor), 0)                                                    as outstanding_minor,
  coalesce(sum(b.outstanding_minor) filter (where b.ageing_bucket like 'overdue%'), 0)     as overdue_minor,
  coalesce(max(b.days_overdue) filter (where b.outstanding_minor > 0 and b.status = 'issued'), 0) as oldest_days_overdue
from public.clients c
left join public.invoice_balances b
  on b.client_id = c.id and b.status <> 'cancelled'
group by c.id;

grant select on public.invoice_balances, public.client_balances to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_organization: the only way to create a tenant. The caller becomes owner.
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(p_name text, p_is_demo boolean default false)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(length(trim(p_name)), 0) = 0 then
    raise exception 'Organization name is required' using errcode = 'check_violation';
  end if;
  -- Make sure the profile row exists even if the auth trigger was added after signup.
  insert into public.users (id, email)
  select u.id, u.email from auth.users u where u.id = v_uid
  on conflict (id) do nothing;

  insert into public.organizations (name, is_demo) values (trim(p_name), p_is_demo) returning id into v_org;
  insert into public.memberships (organization_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.app_settings (organization_id) values (v_org);
  return v_org;
end $$;

revoke all on function public.create_organization(text, boolean) from public, anon;
grant execute on function public.create_organization(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- import_invoices: idempotent upsert of invoice references from Swipe
-- (CSV export, manual entry, or later the API). Runs as the caller, so RLS applies.
--
-- p_rows: array of objects already validated by the app:
--   row_number, invoice_number, external_id, client_id, invoice_date, due_date,
--   due_date_derived, billing_period_start, billing_period_end, currency,
--   subtotal_minor, tax_minor, total_minor, pdf_url, source_status ('issued'|'cancelled'),
--   source_reported_status, source_reported_paid_minor
--
-- Rules
--   * Matching key: (organization, 'swipe', invoice_number). Re-importing is a no-op.
--   * Ledger columns (received, credited) are never touched.
--   * A locally 'disputed' invoice keeps that status.
--   * Swipe saying "paid" never marks anything paid. A mismatch with our verified
--     ledger opens one reconciliation task.
-- ---------------------------------------------------------------------------
create or replace function public.import_invoices(
  p_org         uuid,
  p_channel     public.source_channel,
  p_rows        jsonb,
  p_file_name   text default null,
  p_file_sha256 text default null
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_run        uuid;
  v_row        jsonb;
  v_existing   public.invoices;
  v_new_id     uuid;
  v_results    jsonb := '[]'::jsonb;
  v_inserted   int := 0;
  v_updated    int := 0;
  v_unchanged  int := 0;
  v_errors     int := 0;
  v_recon      int := 0;
  v_prior_runs int := 0;
  v_status     public.invoice_status;
  v_changed    text[];
  v_reported   bigint;
  v_message    text;
begin
  if not app.can_write(p_org) then
    raise exception 'Not allowed to import invoices for this organization' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  if p_file_sha256 is not null then
    select count(*) into v_prior_runs from public.integration_sync_runs
    where organization_id = p_org and idempotency_key = 'sha256:' || p_file_sha256 and status <> 'failed';
  end if;

  insert into public.integration_sync_runs
    (organization_id, integration, job, channel, trigger, idempotency_key, file_name, triggered_by)
  values
    (p_org, 'swipe', 'invoice_import', p_channel,
     case when p_channel = 'api' then 'schedule'::public.run_trigger
          when p_channel = 'csv' then 'upload'::public.run_trigger
          else 'manual'::public.run_trigger end,
     case when p_file_sha256 is not null then 'sha256:' || p_file_sha256 end,
     p_file_name, auth.uid())
  returning id into v_run;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    begin
      v_existing := null;
      v_message := null;
      v_changed := '{}';
      v_status := case when v_row ->> 'source_status' = 'cancelled' then 'cancelled'::public.invoice_status
                       else 'issued'::public.invoice_status end;
      v_reported := nullif(v_row ->> 'source_reported_paid_minor', '')::bigint;

      select * into v_existing from public.invoices
      where organization_id = p_org and source_system = 'swipe'
        and invoice_number = v_row ->> 'invoice_number'
      for update;

      if v_existing.id is null then
        insert into public.invoices (
          organization_id, client_id, source_system, source_channel, external_id, invoice_number,
          invoice_date, due_date, due_date_derived, billing_period_start, billing_period_end, currency,
          subtotal_minor, tax_minor, total_minor, status, pdf_url,
          source_reported_status, source_reported_paid_minor, last_synced_at, sync_status, created_by
        ) values (
          p_org, (v_row ->> 'client_id')::uuid, 'swipe', p_channel, nullif(v_row ->> 'external_id', ''),
          v_row ->> 'invoice_number',
          (v_row ->> 'invoice_date')::date, (v_row ->> 'due_date')::date,
          coalesce((v_row ->> 'due_date_derived')::boolean, false),
          nullif(v_row ->> 'billing_period_start', '')::date, nullif(v_row ->> 'billing_period_end', '')::date,
          coalesce(nullif(v_row ->> 'currency', ''), 'INR'),
          nullif(v_row ->> 'subtotal_minor', '')::bigint, coalesce(nullif(v_row ->> 'tax_minor', '')::bigint, 0),
          (v_row ->> 'total_minor')::bigint, v_status, nullif(v_row ->> 'pdf_url', ''),
          nullif(v_row ->> 'source_reported_status', ''), v_reported,
          now(), case when p_channel = 'manual' then 'manual'::public.sync_status else 'current'::public.sync_status end,
          auth.uid()
        ) returning * into v_existing;
        v_inserted := v_inserted + 1;
        v_results := v_results || jsonb_build_object('row', v_row -> 'row_number', 'invoice_number', v_existing.invoice_number,
                                                     'invoice_id', v_existing.id, 'action', 'inserted');
      else
        if v_existing.client_id <> (v_row ->> 'client_id')::uuid then
          raise exception 'Invoice % already belongs to a different client. Resolve it manually.', v_existing.invoice_number
            using errcode = 'check_violation';
        end if;
        if v_existing.status = 'disputed' then
          v_status := case when v_status = 'cancelled' then 'cancelled'::public.invoice_status else 'disputed'::public.invoice_status end;
        end if;
        if v_status = 'cancelled' and v_existing.status <> 'cancelled' and v_existing.amount_received_minor > 0 then
          raise exception 'Swipe reports % as cancelled, but verified payments are allocated to it. Reverse the allocations first.',
            v_existing.invoice_number using errcode = 'check_violation';
        end if;

        if v_existing.invoice_date is distinct from (v_row ->> 'invoice_date')::date then v_changed := array_append(v_changed, 'invoice_date'); end if;
        if v_existing.due_date is distinct from (v_row ->> 'due_date')::date then v_changed := array_append(v_changed, 'due_date'); end if;
        if v_existing.total_minor is distinct from (v_row ->> 'total_minor')::bigint then v_changed := array_append(v_changed, 'total'); end if;
        if v_existing.tax_minor is distinct from coalesce(nullif(v_row ->> 'tax_minor', '')::bigint, 0) then v_changed := array_append(v_changed, 'tax'); end if;
        if v_existing.subtotal_minor is distinct from nullif(v_row ->> 'subtotal_minor', '')::bigint then v_changed := array_append(v_changed, 'subtotal'); end if;
        if v_existing.status is distinct from v_status then v_changed := array_append(v_changed, 'status'); end if;
        if v_existing.pdf_url is distinct from coalesce(nullif(v_row ->> 'pdf_url', ''), v_existing.pdf_url) then v_changed := array_append(v_changed, 'pdf_url'); end if;
        if v_existing.external_id is distinct from coalesce(nullif(v_row ->> 'external_id', ''), v_existing.external_id) then v_changed := array_append(v_changed, 'external_id'); end if;
        if v_existing.billing_period_start is distinct from coalesce(nullif(v_row ->> 'billing_period_start', '')::date, v_existing.billing_period_start)
           or v_existing.billing_period_end is distinct from coalesce(nullif(v_row ->> 'billing_period_end', '')::date, v_existing.billing_period_end) then
          v_changed := array_append(v_changed, 'billing_period');
        end if;
        if v_existing.source_reported_paid_minor is distinct from coalesce(v_reported, v_existing.source_reported_paid_minor)
           or v_existing.source_reported_status is distinct from coalesce(nullif(v_row ->> 'source_reported_status', ''), v_existing.source_reported_status) then
          v_changed := array_append(v_changed, 'source_payment_status');
        end if;

        update public.invoices set
          invoice_date               = (v_row ->> 'invoice_date')::date,
          due_date                   = (v_row ->> 'due_date')::date,
          due_date_derived           = coalesce((v_row ->> 'due_date_derived')::boolean, false),
          billing_period_start       = coalesce(nullif(v_row ->> 'billing_period_start', '')::date, billing_period_start),
          billing_period_end         = coalesce(nullif(v_row ->> 'billing_period_end', '')::date, billing_period_end),
          subtotal_minor             = nullif(v_row ->> 'subtotal_minor', '')::bigint,
          tax_minor                  = coalesce(nullif(v_row ->> 'tax_minor', '')::bigint, 0),
          total_minor                = (v_row ->> 'total_minor')::bigint,
          status                     = v_status,
          pdf_url                    = coalesce(nullif(v_row ->> 'pdf_url', ''), pdf_url),
          external_id                = coalesce(nullif(v_row ->> 'external_id', ''), external_id),
          source_reported_status     = coalesce(nullif(v_row ->> 'source_reported_status', ''), source_reported_status),
          source_reported_paid_minor = coalesce(v_reported, source_reported_paid_minor),
          -- An API/CSV sync upgrades a manually keyed invoice; manual entry never downgrades a synced one.
          source_channel             = case when p_channel = 'manual' then source_channel else p_channel end,
          sync_status                = case when p_channel = 'manual' and sync_status <> 'manual' then sync_status
                                            when p_channel = 'manual' then 'manual'::public.sync_status
                                            else 'current'::public.sync_status end,
          last_synced_at             = now()
        where id = v_existing.id
        returning * into v_existing;

        if cardinality(v_changed) = 0 then
          v_unchanged := v_unchanged + 1;
          v_results := v_results || jsonb_build_object('row', v_row -> 'row_number', 'invoice_number', v_existing.invoice_number,
                                                       'invoice_id', v_existing.id, 'action', 'unchanged');
        else
          v_updated := v_updated + 1;
          v_results := v_results || jsonb_build_object('row', v_row -> 'row_number', 'invoice_number', v_existing.invoice_number,
                                                       'invoice_id', v_existing.id, 'action', 'updated',
                                                       'changed', to_jsonb(v_changed));
        end if;
      end if;

      -- Swipe's paid figure disagrees with our verified ledger: one reconciliation task per reported value.
      if v_reported is not null and v_reported <> v_existing.amount_received_minor + v_existing.credited_minor then
        insert into public.escalation_tasks (organization_id, dedupe_key, kind, priority, title, details, client_id, invoice_id)
        values (p_org, 'recon:swipe_paid:' || v_existing.id || ':' || v_reported, 'reconciliation', 'normal',
                'Reconcile ' || v_existing.invoice_number || ': Swipe shows a different paid amount',
                format('Swipe reports %s paise paid; verified allocations and credits total %s paise. '
                       'Record or verify the payment here. Swipe''s figure is not applied automatically.',
                       v_reported, v_existing.amount_received_minor + v_existing.credited_minor),
                v_existing.client_id, v_existing.id)
        on conflict (organization_id, dedupe_key) do nothing;
        if found then v_recon := v_recon + 1; end if;
      end if;
    exception when others then
      v_errors := v_errors + 1;
      get stacked diagnostics v_message = message_text;
      v_results := v_results || jsonb_build_object('row', v_row -> 'row_number', 'invoice_number', v_row ->> 'invoice_number',
                                                   'action', 'error', 'message', v_message);
    end;
  end loop;

  update public.integration_sync_runs set
    status = case
      when v_errors = 0 then 'succeeded'::public.run_status
      when v_errors = jsonb_array_length(p_rows) then 'failed'::public.run_status
      else 'partial'::public.run_status end,
    finished_at = now(),
    stats = jsonb_build_object('rows', jsonb_array_length(p_rows), 'inserted', v_inserted, 'updated', v_updated,
                               'unchanged', v_unchanged, 'errors', v_errors, 'reconciliation_tasks', v_recon,
                               'same_file_imported_before', v_prior_runs > 0),
    error = case when v_errors > 0 then v_errors || ' row(s) failed' end
  where id = v_run;

  return jsonb_build_object(
    'run_id', v_run, 'inserted', v_inserted, 'updated', v_updated, 'unchanged', v_unchanged,
    'errors', v_errors, 'reconciliation_tasks', v_recon, 'same_file_imported_before', v_prior_runs > 0,
    'results', v_results);
end $$;

revoke all on function public.import_invoices(uuid, public.source_channel, jsonb, text, text) from public, anon;
grant execute on function public.import_invoices(uuid, public.source_channel, jsonb, text, text) to authenticated;
