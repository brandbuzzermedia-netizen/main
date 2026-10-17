begin;
\ir 00_helpers.sql.inc

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_organization('GBS') as org;
select pg_temp.logout();
grant all on t to authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

alter table t add column c1 uuid, add column c2 uuid, add column inv1 uuid, add column inv2 uuid, add column inv_other uuid;
with c as (
  insert into public.clients (organization_id, client_code, legal_name)
  select org, code, name from t, (values ('ALPHA', 'Alpha Pvt Ltd'), ('BETA', 'Beta LLP')) v(code, name)
  returning id, client_code)
update t set c1 = (select id from c where client_code = 'ALPHA'), c2 = (select id from c where client_code = 'BETA');

insert into public.invoices (organization_id, client_id, source_channel, invoice_number, invoice_date, due_date, total_minor, tax_minor)
select org, c1, 'manual'::public.source_channel, 'GBS/26-27/001', '2026-10-01'::date, '2026-10-08'::date, 5900000, 900000 from t union all
select org, c1, 'manual', 'GBS/26-27/002', '2026-10-01', '2026-10-08', 1000000, 0 from t union all
select org, c1, 'manual', 'GBS/26-27/004', '2026-10-01', '2026-10-08', 1000000, 0 from t union all
select org, c2, 'manual', 'GBS/26-27/003', '2026-10-01', '2026-10-08', 1000000, 0 from t;
update t set inv1 = (select id from public.invoices where invoice_number = 'GBS/26-27/001'),
             inv2 = (select id from public.invoices where invoice_number = 'GBS/26-27/002'),
             inv_other = (select id from public.invoices where invoice_number = 'GBS/26-27/003');

-- Duplicate official invoice number is rejected.
select pg_temp.assert_raises(
  format($$insert into public.invoices (organization_id, client_id, source_channel, invoice_number, invoice_date, due_date, total_minor)
           values (%L, %L, 'manual', 'GBS/26-27/001', '2026-10-01', '2026-10-08', 1)$$, (select org from t), (select c1 from t)),
  'duplicate key', 'invoice numbers are unique per org');

-- Ledger columns cannot be typed in.
select pg_temp.assert_raises(
  format('update public.invoices set amount_received_minor = 100 where id = %L', (select inv1 from t)),
  'derived', 'amount_received cannot be set directly');
select pg_temp.assert_raises(
  format($$insert into public.invoices (organization_id, client_id, source_channel, invoice_number, invoice_date, due_date, total_minor, amount_received_minor)
           values (%L, %L, 'manual', 'X-1', '2026-10-01', '2026-10-08', 100, 100)$$, (select org from t), (select c1 from t)),
  'zero received', 'new invoices cannot start paid');

-- A pending (unverified) payment does NOT reduce the balance.
insert into public.payments (organization_id, client_id, source, transaction_reference, payment_date, amount_minor, method)
select org, c1, 'manual', 'UTR-0001', '2026-10-05', 7000000, 'neft' from t;
insert into public.payment_allocations (organization_id, payment_id, invoice_id, amount_minor)
select org, (select id from public.payments where transaction_reference = 'UTR-0001'), inv1, 5900000 from t;
select pg_temp.assert((select outstanding_minor from public.invoices where id = (select inv1 from t)) = 5900000,
  'pending payment leaves invoice outstanding');
select pg_temp.assert((select has_pending_payment from public.invoice_balances where id = (select inv1 from t)),
  'view flags pending payment');
select pg_temp.assert((select unallocated_minor from public.payments where transaction_reference = 'UTR-0001') = 1100000,
  'unallocated balance tracked');

-- Verifying the payment settles the invoice.
update public.payments set verification_status = 'verified' where transaction_reference = 'UTR-0001';
select pg_temp.assert((select outstanding_minor from public.invoices where id = (select inv1 from t)) = 0, 'verified payment settles invoice');
select pg_temp.assert((select payment_state from public.invoice_balances where id = (select inv1 from t)) = 'paid', 'payment_state paid');
select pg_temp.assert((select verified_at is not null from public.payments where transaction_reference = 'UTR-0001'), 'verified_at stamped');

-- One payment across multiple invoices; partial on the second.
insert into public.payment_allocations (organization_id, payment_id, invoice_id, amount_minor)
select org, (select id from public.payments where transaction_reference = 'UTR-0001'), inv2, 600000 from t;
select pg_temp.assert((select outstanding_minor from public.invoices where id = (select inv2 from t)) = 400000, 'partial payment leaves remainder');
select pg_temp.assert((select payment_state from public.invoice_balances where id = (select inv2 from t)) = 'partially_paid', 'partially paid');

-- Over-allocation of the payment is rejected (5,00,000 paise left of 70,00,000).
select pg_temp.assert_raises(
  format($$insert into public.payment_allocations (organization_id, payment_id, invoice_id, amount_minor)
           values (%L, (select id from public.payments where transaction_reference = 'UTR-0001'),
                   (select id from public.invoices where invoice_number = 'GBS/26-27/004'), 500001)$$,
         (select org from t)),
  'check constraint', 'cannot allocate more than the payment amount');

-- Over-paying an invoice is rejected.
insert into public.payments (organization_id, client_id, source, transaction_reference, payment_date, amount_minor, verification_status, verified_at)
select org, c1, 'manual', 'UTR-0002', '2026-10-06', 9999999, 'verified', now() from t;
select pg_temp.assert_raises(
  format($$insert into public.payment_allocations (organization_id, payment_id, invoice_id, amount_minor)
           values (%L, (select id from public.payments where transaction_reference = 'UTR-0002'), %L, 400001)$$,
         (select org from t), (select inv2 from t)),
  'check constraint', 'cannot allocate more than the invoice outstanding');

-- Cross-client allocation is rejected.
select pg_temp.assert_raises(
  format($$insert into public.payment_allocations (organization_id, payment_id, invoice_id, amount_minor)
           values (%L, (select id from public.payments where transaction_reference = 'UTR-0002'), %L, 100)$$,
         (select org from t), (select inv_other from t)),
  'different clients', 'payment cannot pay another client''s invoice');

-- Duplicate transaction reference (e.g. a replayed webhook) is rejected.
select pg_temp.assert_raises(
  format($$insert into public.payments (organization_id, client_id, source, transaction_reference, payment_date, amount_minor)
           values (%L, %L, 'manual', 'UTR-0001', '2026-10-05', 7000000)$$, (select org from t), (select c1 from t)),
  'duplicate key', 'duplicate transaction reference');

-- Rejecting a verified payment restores the balance.
update public.payments set verification_status = 'rejected' where transaction_reference = 'UTR-0001';
select pg_temp.assert((select outstanding_minor from public.invoices where id = (select inv1 from t)) = 5900000, 'rejected payment reopens invoice');

-- Credit note reduces outstanding.
insert into public.credit_notes (organization_id, invoice_id, credit_note_number, issued_on, amount_minor)
select org, inv1, 'CN-001', '2026-10-10', 900000 from t;
select pg_temp.assert((select outstanding_minor from public.invoices where id = (select inv1 from t)) = 5000000, 'credit note reduces outstanding');

-- Refunds cannot be allocated to invoices.
insert into public.payments (organization_id, client_id, source, transaction_reference, payment_date, amount_minor, kind)
select org, c1, 'manual', 'RFND-1', '2026-10-11', 100, 'refund' from t;
select pg_temp.assert_raises(
  format($$insert into public.payment_allocations (organization_id, payment_id, invoice_id, amount_minor)
           values (%L, (select id from public.payments where transaction_reference = 'RFND-1'), %L, 100)$$,
         (select org from t), (select inv1 from t)),
  'only receipts', 'refund allocation rejected');

-- Unmatched payment (no client yet) is allowed and sits unallocated.
insert into public.payments (organization_id, source, transaction_reference, payment_date, amount_minor, payer_name)
select org, 'bank_import', 'UTR-UNKNOWN', '2026-10-12', 250000, 'SOME PAYER' from t;
select pg_temp.assert((select unallocated_minor from public.payments where transaction_reference = 'UTR-UNKNOWN') = 250000, 'unmatched payment unallocated');

select pg_temp.logout();
rollback;
