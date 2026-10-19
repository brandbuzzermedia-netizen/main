-- GBS Finance OS: Razorpay payment links and gateway receipts

-- ---------------------------------------------------------------------------
-- 1. Payment links created for invoices
-- ---------------------------------------------------------------------------
create type public.payment_link_status as enum ('created', 'partially_paid', 'paid', 'expired', 'cancelled');

create table public.payment_links (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  invoice_id       uuid not null,
  client_id        uuid not null,
  provider         text not null default 'razorpay',
  provider_link_id text not null,
  reference_id     text not null,
  short_url        text not null check (short_url ~ '^https://'),
  amount_minor     bigint not null check (amount_minor > 0),
  amount_paid_minor bigint not null default 0 check (amount_paid_minor >= 0),
  currency         char(3) not null default 'INR',
  accept_partial   boolean not null default false,
  status           public.payment_link_status not null default 'created',
  expire_by        timestamptz,
  provider_response jsonb,
  last_event_at    timestamptz,
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete cascade,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  unique (provider, provider_link_id),
  unique (provider, reference_id)
);
create index on public.payment_links (invoice_id, created_at desc);
-- At most one usable link per invoice.
create unique index payment_links_one_open on public.payment_links (invoice_id)
  where status in ('created', 'partially_paid');

create trigger payment_links_touch before update on public.payment_links
  for each row execute function app.touch_updated_at();
create trigger payment_links_audit after insert or update or delete on public.payment_links
  for each row execute function app.audit_row();

alter table public.payment_links enable row level security;
create policy payment_links_read on public.payment_links for select to authenticated
  using (app.can_read_client(organization_id, client_id));
create policy payment_links_write on public.payment_links for all to authenticated
  using (app.can_write(organization_id)) with check (app.can_write(organization_id));
revoke all on public.payment_links from anon;
grant select, insert, update, delete on public.payment_links to authenticated;
grant all on public.payment_links to service_role;

-- ---------------------------------------------------------------------------
-- 2. Swipe reconciliation tasks close themselves once the ledger agrees.
-- ---------------------------------------------------------------------------
create or replace function app.refresh_invoice_totals(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.invoices;
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
  returning * into v_inv;

  if v_inv.id is null then return; end if;
  perform app.refresh_commitments(v_inv.client_id);

  if v_inv.source_reported_paid_minor is not null
     and v_inv.source_reported_paid_minor in (v_inv.amount_received_minor, v_inv.amount_received_minor + v_inv.credited_minor) then
    update public.escalation_tasks set
      status = 'resolved', resolved_at = now(),
      resolution = 'Closed automatically: verified payments now match what Swipe reports.'
    where invoice_id = v_inv.id and kind = 'reconciliation'
      and dedupe_key like 'recon:swipe_paid:%' and status in ('open', 'in_progress');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Apply a signature-verified Razorpay event. Executable by service_role only (grants below):
--    the webhook route verifies the signature before calling it. An error rolls the whole
--    event back (including its integration_events row), the route answers 500 and Razorpay retries.
--    Idempotent twice over: the event id is unique in integration_events, and the
--    Razorpay payment id is unique as a payment reference.
--    Returns one of: duplicate_event, unknown_link, recorded, already_recorded, status_updated, ignored.
-- ---------------------------------------------------------------------------
create or replace function public.apply_razorpay_event(
  p_event_id     text,
  p_event_type   text,
  p_link_id      text,
  p_link_status  text,
  p_link_amount_paid bigint,
  p_payment_id   text,
  p_payment_amount bigint,
  p_payment_method text,
  p_paid_at      timestamptz,
  p_payload      jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_link public.payment_links;
  v_inv  public.invoices;
  v_event uuid;
  v_payment uuid;
  v_alloc bigint;
  v_method public.payment_method;
  v_result text;
begin
  select * into v_link from public.payment_links where provider = 'razorpay' and provider_link_id = p_link_id for update;

  insert into public.integration_events (organization_id, provider, provider_event_id, event_type, signature_valid, payload, status)
  values (v_link.organization_id, 'razorpay', p_event_id, p_event_type, true, p_payload, 'received')
  on conflict (provider, provider_event_id) do nothing
  returning id into v_event;
  if v_event is null then
    return 'duplicate_event';
  end if;

  if v_link.id is null then
    update public.integration_events set status = 'ignored', processed_at = now(),
      error = 'No payment link with this id was created by Finance OS' where id = v_event;
    return 'unknown_link';
  end if;

  if p_event_type in ('payment_link.paid', 'payment_link.partially_paid') and p_payment_id is not null and p_payment_amount > 0 then
    select * into v_inv from public.invoices where id = v_link.invoice_id for update;
    v_method := case lower(coalesce(p_payment_method, ''))
                  when 'upi' then 'upi' when 'card' then 'card' when 'netbanking' then 'gateway'
                  else 'gateway' end::public.payment_method;

    select id into v_payment from public.payments
    where organization_id = v_link.organization_id
      and upper(regexp_replace(transaction_reference, '\s+', '', 'g')) = upper(p_payment_id);

    if v_payment is null then
      insert into public.payments (
        organization_id, client_id, source, transaction_reference, payment_date, amount_minor, method, kind,
        payer_name, verification_status, verified_at, verification_note, reconciliation_notes
      ) values (
        v_link.organization_id, v_link.client_id, 'gateway', p_payment_id,
        (coalesce(p_paid_at, now()) at time zone 'Asia/Kolkata')::date, p_payment_amount, v_method, 'receipt',
        null, 'verified', now(),
        'Razorpay webhook ' || p_event_type || ' (signature verified), event ' || p_event_id,
        'Payment link ' || v_link.provider_link_id || ' for ' || v_inv.invoice_number
      ) returning id into v_payment;

      -- Pay the linked invoice up to its open balance; anything extra stays unallocated.
      v_alloc := least(p_payment_amount, greatest(v_inv.outstanding_minor, 0));
      if v_alloc > 0 and v_inv.status <> 'cancelled' then
        insert into public.payment_allocations (organization_id, payment_id, invoice_id, amount_minor)
        values (v_link.organization_id, v_payment, v_inv.id, v_alloc);
      end if;
      v_result := 'recorded';
    else
      v_result := 'already_recorded';
    end if;
  else
    v_result := case when p_event_type in ('payment_link.expired', 'payment_link.cancelled') then 'status_updated' else 'ignored' end;
  end if;

  update public.payment_links set
    status = case p_link_status
               when 'paid' then 'paid' when 'partially_paid' then 'partially_paid'
               when 'expired' then 'expired' when 'cancelled' then 'cancelled'
               else status::text end::public.payment_link_status,
    amount_paid_minor = greatest(amount_paid_minor, coalesce(p_link_amount_paid, 0)),
    last_event_at = now()
  where id = v_link.id;

  update public.integration_events set status = case when v_result = 'ignored' then 'ignored' else 'processed' end::public.event_status,
    processed_at = now() where id = v_event;
  return v_result;
end $$;

revoke execute on function public.apply_razorpay_event(text, text, text, text, bigint, text, bigint, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.apply_razorpay_event(text, text, text, text, bigint, text, bigint, text, timestamptz, jsonb) to service_role;
