-- Swipe may report "paid" excluding credit notes (they are separate documents there).
-- Treat Swipe's paid figure as consistent if it equals verified receipts either with or
-- without credit notes; only open a reconciliation task when it matches neither.

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

      -- Swipe's paid figure disagrees with our verified ledger (with or without credit notes, which Swipe
      -- may keep as separate documents): one reconciliation task per reported value.
      if v_reported is not null
         and v_reported <> v_existing.amount_received_minor
         and v_reported <> v_existing.amount_received_minor + v_existing.credited_minor then
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

