-- GBS Finance OS: Phase 3 (payments, allocations, reconciliation, commitments)

-- ---------------------------------------------------------------------------
-- 1. One transaction reference = one payment, whatever the source.
--    A UTR typed in manually and the same UTR in a bank statement must not become two
--    receipts. References are compared case- and whitespace-insensitively.
-- ---------------------------------------------------------------------------
alter table public.payments drop constraint payments_organization_id_source_transaction_reference_key;
create unique index payments_reference_unique
  on public.payments (organization_id, upper(regexp_replace(transaction_reference, '\s+', '', 'g')));

alter table public.payments
  add column verification_note text,
  add column bank_narration    text;

alter table public.payment_commitments
  add column missed_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Commitment fulfilment: re-evaluated whenever verified money for the client changes.
--    Kept if verified receipts dated on/after the promise cover the promised amount
--    (for a commitment tied to an invoice: allocations to that invoice; otherwise any
--    verified receipt from the client), or if the invoice is fully settled.
--    A commitment that was already missed and is paid later becomes 'fulfilled' but keeps
--    missed_at, and the client's missed count is not reduced.
-- ---------------------------------------------------------------------------
create or replace function app.refresh_commitments(p_client_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.payment_commitments pc set
    status = 'fulfilled',
    resolved_at = now()
  where pc.client_id = p_client_id
    and pc.status in ('open', 'missed')
    and (
      (pc.invoice_id is not null and (
         exists (select 1 from public.invoices i where i.id = pc.invoice_id and i.outstanding_minor = 0 and i.total_minor > 0)
         or coalesce((
           select sum(a.amount_minor)
           from public.payment_allocations a
           join public.payments p on p.id = a.payment_id
           where a.invoice_id = pc.invoice_id
             and p.verification_status = 'verified' and p.kind = 'receipt'
             and p.payment_date >= pc.promised_on
         ), 0) >= pc.promised_amount_minor))
      or
      (pc.invoice_id is null and coalesce((
         select sum(p.amount_minor) from public.payments p
         where p.client_id = pc.client_id
           and p.verification_status = 'verified' and p.kind = 'receipt'
           and p.payment_date >= pc.promised_on
       ), 0) >= pc.promised_amount_minor)
    );
end $$;

create or replace function app.refresh_invoice_totals(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_client uuid;
begin
  update public.invoices i set
    amount_received_minor = coalesce((
      select sum(a.amount_minor)
      from public.payment_allocations a
      join public.payments p on p.id = a.payment_id
      where a.invoice_id = i.id
        and p.verification_status = 'verified'
        and p.kind = 'receipt'
    ), 0),
    credited_minor = coalesce((
      select sum(c.amount_minor) from public.credit_notes c where c.invoice_id = i.id
    ), 0)
  where i.id = p_invoice_id
  returning client_id into v_client;
  if v_client is not null then
    perform app.refresh_commitments(v_client);
  end if;
end $$;

create or replace function app.on_payment_status_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_invoice_id uuid;
begin
  for v_invoice_id in select invoice_id from public.payment_allocations where payment_id = new.id loop
    perform app.refresh_invoice_totals(v_invoice_id);
  end loop;
  if new.client_id is not null then
    perform app.refresh_commitments(new.client_id);
  end if;
  if old.client_id is not null and old.client_id is distinct from new.client_id then
    perform app.refresh_commitments(old.client_id);
  end if;
  return null;
end $$;

drop trigger payments_refresh_invoices on public.payments;
create trigger payments_refresh_invoices
  after update of verification_status, kind, amount_minor, client_id, payment_date on public.payments
  for each row execute function app.on_payment_status_change();

-- New verified receipts (e.g. bank imports) can fulfil client-level commitments.
create or replace function app.on_payment_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null and new.verification_status = 'verified' then
    perform app.refresh_commitments(new.client_id);
  end if;
  return null;
end $$;

create trigger payments_after_insert
  after insert on public.payments
  for each row execute function app.on_payment_insert();

-- A payment's client cannot change while it has allocations (they would point at another client's invoices).
create or replace function app.guard_payment_client() returns trigger
language plpgsql as $$
begin
  if new.client_id is distinct from old.client_id
     and exists (select 1 from public.payment_allocations where payment_id = new.id) then
    raise exception 'Remove this payment''s allocations before changing its client' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger payments_guard_client
  before update of client_id on public.payments
  for each row execute function app.guard_payment_client();

-- ---------------------------------------------------------------------------
-- 3. RPCs. All SECURITY INVOKER: RLS and the ledger triggers still apply.
-- ---------------------------------------------------------------------------
create or replace function app.assert_writer(p_org uuid) returns void
language plpgsql stable as $$
begin
  if current_user in ('service_role', 'postgres') then return; end if;
  if not app.can_write(p_org) then
    raise exception 'Not allowed to change finance records for this organization' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Replace all allocations of a payment atomically. p_allocations: [{invoice_id, amount_minor}]
create or replace function public.set_payment_allocations(p_payment_id uuid, p_allocations jsonb)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid;
  v_alloc jsonb;
begin
  select organization_id into v_org from public.payments where id = p_payment_id for update;
  if v_org is null then
    raise exception 'Payment not found' using errcode = 'no_data_found';
  end if;
  perform app.assert_writer(v_org);
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'p_allocations must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  delete from public.payment_allocations where payment_id = p_payment_id;
  for v_alloc in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    if coalesce((v_alloc ->> 'amount_minor')::bigint, 0) <= 0 then
      continue;
    end if;
    insert into public.payment_allocations (organization_id, payment_id, invoice_id, amount_minor, created_by)
    values (v_org, p_payment_id, (v_alloc ->> 'invoice_id')::uuid, (v_alloc ->> 'amount_minor')::bigint, auth.uid());
  end loop;
end $$;

-- Record a payment and (optionally) its allocations in one transaction.
-- p_payment: {client_id, source, transaction_reference, payment_date, amount_minor, method, kind,
--             payer_name, reconciliation_notes, verified (bool), verification_note}
create or replace function public.record_payment(p_org uuid, p_payment jsonb, p_allocations jsonb default '[]'::jsonb)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_verified boolean := coalesce((p_payment ->> 'verified')::boolean, false);
begin
  perform app.assert_writer(p_org);
  if v_verified and coalesce(length(trim(p_payment ->> 'verification_note')), 0) < 3 then
    raise exception 'Say how the payment was verified (e.g. "Seen in HDFC statement 18 Oct")' using errcode = 'check_violation';
  end if;

  insert into public.payments (
    organization_id, client_id, source, transaction_reference, payment_date, amount_minor, currency, method, kind,
    payer_name, reconciliation_notes, verification_status, verified_by, verified_at, verification_note, bank_narration, created_by
  ) values (
    p_org,
    nullif(p_payment ->> 'client_id', '')::uuid,
    coalesce(nullif(p_payment ->> 'source', ''), 'manual')::public.payment_source,
    trim(p_payment ->> 'transaction_reference'),
    (p_payment ->> 'payment_date')::date,
    (p_payment ->> 'amount_minor')::bigint,
    coalesce(nullif(p_payment ->> 'currency', ''), 'INR'),
    coalesce(nullif(p_payment ->> 'method', ''), 'other')::public.payment_method,
    coalesce(nullif(p_payment ->> 'kind', ''), 'receipt')::public.payment_kind,
    nullif(p_payment ->> 'payer_name', ''),
    nullif(p_payment ->> 'reconciliation_notes', ''),
    case when v_verified then 'verified'::public.verification_status else 'pending_verification'::public.verification_status end,
    case when v_verified then auth.uid() end,
    case when v_verified then now() end,
    nullif(p_payment ->> 'verification_note', ''),
    nullif(p_payment ->> 'bank_narration', ''),
    auth.uid()
  ) returning id into v_id;

  if jsonb_array_length(coalesce(p_allocations, '[]'::jsonb)) > 0 then
    perform public.set_payment_allocations(v_id, p_allocations);
  end if;
  return v_id;
exception when unique_violation then
  if sqlerrm like '%payments_reference_unique%' then
    raise exception 'A payment with reference % is already recorded', p_payment ->> 'transaction_reference'
      using errcode = 'unique_violation';
  end if;
  raise;
end $$;

-- Import credits from a bank statement. Bank records count as verified receipts.
-- p_rows: [{row_number, transaction_reference, payment_date, amount_minor, narration, payer_name,
--           client_id|null, allocate_invoice_id|null}]
-- Per row:
--   * reference already recorded and pending with the same amount -> verified by the statement
--   * reference already recorded otherwise                         -> skipped as duplicate
--   * new                                                          -> inserted as a verified receipt,
--                                                                     allocated only when the app found
--                                                                     one unambiguous exact match
create or replace function public.import_bank_receipts(p_org uuid, p_rows jsonb, p_file_name text default null, p_file_sha256 text default null)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_run uuid;
  v_row jsonb;
  v_existing public.payments;
  v_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_inserted int := 0; v_verified int := 0; v_duplicates int := 0; v_allocated int := 0; v_unmatched int := 0; v_errors int := 0;
  v_prior int := 0;
  v_message text;
begin
  perform app.assert_writer(p_org);
  if p_file_sha256 is not null then
    select count(*) into v_prior from public.integration_sync_runs
    where organization_id = p_org and idempotency_key = 'sha256:' || p_file_sha256 and status <> 'failed';
  end if;
  insert into public.integration_sync_runs (organization_id, integration, job, trigger, idempotency_key, file_name, triggered_by)
  values (p_org, 'bank', 'statement_import', 'upload',
          case when p_file_sha256 is not null then 'sha256:' || p_file_sha256 end, p_file_name, auth.uid())
  returning id into v_run;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    begin
      select * into v_existing from public.payments
      where organization_id = p_org
        and upper(regexp_replace(transaction_reference, '\s+', '', 'g'))
            = upper(regexp_replace(v_row ->> 'transaction_reference', '\s+', '', 'g'))
      for update;

      if v_existing.id is not null then
        if v_existing.verification_status = 'pending_verification'
           and v_existing.amount_minor = (v_row ->> 'amount_minor')::bigint then
          update public.payments set
            verification_status = 'verified', verified_by = auth.uid(), verified_at = now(),
            verification_note = 'Matched bank statement ' || coalesce(p_file_name, ''),
            bank_narration = coalesce(bank_narration, v_row ->> 'narration')
          where id = v_existing.id;
          v_verified := v_verified + 1;
          v_results := v_results || jsonb_build_object('row', v_row -> 'row_number', 'payment_id', v_existing.id, 'action', 'verified_existing');
        else
          v_duplicates := v_duplicates + 1;
          v_results := v_results || jsonb_build_object('row', v_row -> 'row_number', 'payment_id', v_existing.id, 'action', 'duplicate',
            'message', case when v_existing.amount_minor <> (v_row ->> 'amount_minor')::bigint
                            then 'Reference already recorded with a different amount. Check it manually.'
                            else 'Already recorded' end);
        end if;
        v_existing := null;
        continue;
      end if;

      insert into public.payments (
        organization_id, client_id, source, transaction_reference, payment_date, amount_minor, method, kind,
        payer_name, bank_narration, verification_status, verified_by, verified_at, verification_note, created_by
      ) values (
        p_org, nullif(v_row ->> 'client_id', '')::uuid, 'bank_import', trim(v_row ->> 'transaction_reference'),
        (v_row ->> 'payment_date')::date, (v_row ->> 'amount_minor')::bigint,
        coalesce(nullif(v_row ->> 'method', ''), 'other')::public.payment_method, 'receipt',
        nullif(v_row ->> 'payer_name', ''), nullif(v_row ->> 'narration', ''),
        'verified', auth.uid(), now(), 'Bank statement ' || coalesce(p_file_name, ''), auth.uid()
      ) returning id into v_id;
      v_inserted := v_inserted + 1;

      if nullif(v_row ->> 'allocate_invoice_id', '') is not null then
        perform public.set_payment_allocations(v_id, jsonb_build_array(jsonb_build_object(
          'invoice_id', v_row ->> 'allocate_invoice_id', 'amount_minor', (v_row ->> 'amount_minor')::bigint)));
        v_allocated := v_allocated + 1;
        v_results := v_results || jsonb_build_object('row', v_row -> 'row_number', 'payment_id', v_id, 'action', 'inserted_allocated');
      else
        if nullif(v_row ->> 'client_id', '') is null then v_unmatched := v_unmatched + 1; end if;
        v_results := v_results || jsonb_build_object('row', v_row -> 'row_number', 'payment_id', v_id, 'action', 'inserted');
      end if;
    exception when others then
      v_errors := v_errors + 1;
      get stacked diagnostics v_message = message_text;
      v_results := v_results || jsonb_build_object('row', v_row -> 'row_number', 'action', 'error', 'message', v_message);
    end;
  end loop;

  update public.integration_sync_runs set
    status = case when v_errors = 0 then 'succeeded'::public.run_status
                  when v_errors = jsonb_array_length(p_rows) then 'failed'::public.run_status
                  else 'partial'::public.run_status end,
    finished_at = now(),
    stats = jsonb_build_object('rows', jsonb_array_length(p_rows), 'inserted', v_inserted, 'verified_existing', v_verified,
                               'duplicates', v_duplicates, 'auto_allocated', v_allocated, 'unmatched', v_unmatched,
                               'errors', v_errors, 'same_file_imported_before', v_prior > 0),
    error = case when v_errors > 0 then v_errors || ' row(s) failed' end
  where id = v_run;

  return jsonb_build_object('run_id', v_run, 'inserted', v_inserted, 'verified_existing', v_verified, 'duplicates', v_duplicates,
                            'auto_allocated', v_allocated, 'unmatched', v_unmatched, 'errors', v_errors,
                            'same_file_imported_before', v_prior > 0, 'results', v_results);
end $$;

-- Approve a payment extension, replacing any active one. The old extension is kept as revoked history.
create or replace function public.approve_extension(p_invoice_id uuid, p_new_due_date date, p_reason text)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_inv public.invoices;
  v_id uuid;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if v_inv.id is null then raise exception 'Invoice not found' using errcode = 'no_data_found'; end if;
  perform app.assert_writer(v_inv.organization_id);
  if p_new_due_date <= v_inv.due_date then
    raise exception 'The extended due date must be after the original due date (%)', v_inv.due_date using errcode = 'check_violation';
  end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then
    raise exception 'Give a reason for the extension' using errcode = 'check_violation';
  end if;
  update public.payment_extensions set status = 'revoked' where invoice_id = p_invoice_id and status = 'active';
  insert into public.payment_extensions (organization_id, invoice_id, new_due_date, reason, approved_by)
  values (v_inv.organization_id, p_invoice_id, p_new_due_date, trim(p_reason), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Daily job: mark commitments whose date has passed without verified payment as missed.
-- Idempotent: acts only on 'open' commitments, and the escalation task has a deterministic dedupe key,
-- so the founder gets exactly one task per missed commitment however often this runs.
-- An active extension running past today supersedes the promise (cancelled, not missed).
create or replace function public.process_missed_commitments(p_org uuid)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_today date := app.org_today(p_org);
  v_c record;
  v_missed int := 0;
  v_superseded int := 0;
  v_outstanding bigint;
begin
  perform app.assert_writer(p_org);

  for v_c in
    select pc.*, c.legal_name, c.trading_name, i.invoice_number
    from public.payment_commitments pc
    join public.clients c on c.id = pc.client_id
    left join public.invoices i on i.id = pc.invoice_id
    where pc.organization_id = p_org and pc.status = 'open' and pc.commitment_date < v_today
    order by pc.commitment_date
    for update of pc
  loop
    perform app.refresh_commitments(v_c.client_id);
    if (select status from public.payment_commitments where id = v_c.id) <> 'open' then
      continue;   -- fulfilled by money that arrived in time
    end if;

    if v_c.invoice_id is not null and exists (
      select 1 from public.payment_extensions e
      where e.invoice_id = v_c.invoice_id and e.status = 'active'
        and e.new_due_date >= v_today and e.approved_at >= v_c.created_at
    ) then
      update public.payment_commitments set status = 'cancelled', resolved_at = now(),
        notes = concat_ws(E'\n', notes, 'Superseded by an approved payment extension.')
      where id = v_c.id;
      v_superseded := v_superseded + 1;
      continue;
    end if;

    update public.payment_commitments set status = 'missed', missed_at = now() where id = v_c.id;
    update public.clients set missed_commitments_count = missed_commitments_count + 1 where id = v_c.client_id;

    select case when v_c.invoice_id is not null
                then (select outstanding_minor from public.invoices where id = v_c.invoice_id)
                else (select coalesce(sum(outstanding_minor), 0) from public.invoices
                      where client_id = v_c.client_id and status = 'issued') end
      into v_outstanding;

    insert into public.escalation_tasks (organization_id, dedupe_key, kind, priority, title, details, client_id, invoice_id, commitment_id, due_on)
    values (
      p_org, 'commitment_missed:' || v_c.id, 'commitment_missed',
      case when (select missed_commitments_count from public.clients where id = v_c.client_id) > 1 then 'urgent' else 'high' end::public.task_priority,
      format('%s missed a payment promise%s', coalesce(v_c.trading_name, v_c.legal_name),
             case when v_c.invoice_number is not null then ' for ' || v_c.invoice_number else '' end),
      format('%s promised %s paise by %s (promise made %s). Outstanding now: %s paise. Missed promises for this client so far: %s.',
             v_c.promised_by, v_c.promised_amount_minor, v_c.commitment_date, v_c.promised_on, v_outstanding,
             (select missed_commitments_count from public.clients where id = v_c.client_id)),
      v_c.client_id, v_c.invoice_id, v_c.id, v_today
    )
    on conflict (organization_id, dedupe_key) do nothing;
    v_missed := v_missed + 1;
  end loop;

  return jsonb_build_object('missed', v_missed, 'superseded', v_superseded, 'as_of', v_today);
end $$;

revoke execute on function public.set_payment_allocations(uuid, jsonb) from public, anon;
revoke execute on function public.record_payment(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.import_bank_receipts(uuid, jsonb, text, text) from public, anon;
revoke execute on function public.approve_extension(uuid, date, text) from public, anon;
revoke execute on function public.process_missed_commitments(uuid) from public, anon;
revoke execute on all functions in schema app from public, anon;
grant execute on function public.set_payment_allocations(uuid, jsonb) to authenticated, service_role;
grant execute on function public.record_payment(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.import_bank_receipts(uuid, jsonb, text, text) to authenticated, service_role;
grant execute on function public.approve_extension(uuid, date, text) to authenticated, service_role;
grant execute on function public.process_missed_commitments(uuid) to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. payment_balances view: payments with client name and allocation detail for the UI.
-- ---------------------------------------------------------------------------
create or replace view public.payment_list with (security_invoker = true) as
select
  p.*,
  c.client_code,
  c.legal_name   as client_legal_name,
  c.trading_name as client_trading_name,
  (select count(*) from public.payment_allocations a where a.payment_id = p.id) as allocation_count
from public.payments p
left join public.clients c on c.id = p.client_id;

revoke all on public.payment_list from anon;
revoke insert, update, delete, truncate, references, trigger on public.payment_list from authenticated;
grant select on public.payment_list to authenticated, service_role;
