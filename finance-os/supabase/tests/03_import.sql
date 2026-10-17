begin;
\ir 00_helpers.sql.inc

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_organization('GBS') as org;
select pg_temp.logout();
grant all on t to authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
alter table t add column c1 uuid, add column c2 uuid, add column r jsonb;
with c as (
  insert into public.clients (organization_id, client_code, legal_name)
  select org, code, name from t, (values ('ALPHA', 'Alpha Pvt Ltd'), ('BETA', 'Beta LLP')) v(code, name)
  returning id, client_code)
update t set c1 = (select id from c where client_code = 'ALPHA'), c2 = (select id from c where client_code = 'BETA');

create temp table batch as
select jsonb_build_array(
  jsonb_build_object('row_number', 2, 'invoice_number', 'INV-101', 'client_id', c1, 'invoice_date', '2026-10-01',
                     'due_date', '2026-10-08', 'total_minor', 5900000, 'tax_minor', 900000, 'subtotal_minor', 5000000,
                     'source_status', 'issued', 'pdf_url', 'https://example.invalid/inv-101.pdf'),
  jsonb_build_object('row_number', 3, 'invoice_number', 'INV-102', 'client_id', c2, 'invoice_date', '2026-10-01',
                     'due_date', '2026-10-15', 'total_minor', 1180000, 'tax_minor', 180000,
                     'source_status', 'issued', 'source_reported_status', 'Paid', 'source_reported_paid_minor', 1180000),
  jsonb_build_object('row_number', 4, 'invoice_number', 'INV-103', 'client_id', c1, 'invoice_date', '2026-10-05',
                     'due_date', '2026-10-01', 'total_minor', 100, 'source_status', 'issued')
) as rows from t;
grant all on batch to authenticated;

-- First import: 2 inserted, 1 error (due date before invoice date), 1 reconciliation task.
update t set r = public.import_invoices(org, 'csv', (select rows from batch), 'swipe-oct.csv', 'abc123');
select pg_temp.assert((select (r->>'inserted')::int from t) = 2, 'two rows inserted');
select pg_temp.assert((select (r->>'errors')::int from t) = 1, 'invalid row reported, not fatal');
select pg_temp.assert((select (r->>'reconciliation_tasks')::int from t) = 1, 'Swipe paid mismatch opens a task');
select pg_temp.assert((select outstanding_minor from public.invoices where invoice_number = 'INV-102') = 1180000,
  'Swipe "paid" does not mark the invoice paid');
select pg_temp.assert((select status from public.integration_sync_runs order by started_at desc limit 1) = 'partial', 'run marked partial');
select pg_temp.assert((select sync_status from public.invoices where invoice_number = 'INV-101') = 'current', 'csv rows are current');

-- Re-importing the same file: no duplicates, no new tasks, flagged as seen before.
update t set r = public.import_invoices(org, 'csv', (select rows from batch), 'swipe-oct.csv', 'abc123');
select pg_temp.assert((select (r->>'inserted')::int from t) = 0, 'reimport inserts nothing');
select pg_temp.assert((select (r->>'unchanged')::int from t) = 2, 'reimport reports unchanged');
select pg_temp.assert((select (r->>'same_file_imported_before')::boolean from t), 'same file detected');
select pg_temp.assert((select count(*) from public.invoices) = 2, 'still exactly two invoices');
select pg_temp.assert((select count(*) from public.escalation_tasks) = 1, 'no duplicate reconciliation task');

-- Swipe changes the total, and a manual (non-synced) edit path never downgrades sync status.
update t set r = public.import_invoices(org, 'csv', jsonb_build_array(
  jsonb_build_object('row_number', 2, 'invoice_number', 'INV-101', 'client_id', c1, 'invoice_date', '2026-10-01',
                     'due_date', '2026-10-10', 'total_minor', 6000000, 'tax_minor', 900000, 'subtotal_minor', 5100000,
                     'source_status', 'issued')));
select pg_temp.assert((select (r->>'updated')::int from t) = 1, 'changed row updated');
select pg_temp.assert((select r->'results'->0->'changed' from t) ? 'total', 'change list includes total');
select pg_temp.assert((select pdf_url from public.invoices where invoice_number = 'INV-101') = 'https://example.invalid/inv-101.pdf',
  'blank pdf_url in a later import keeps the known link');

-- A disputed invoice stays disputed on re-import.
update public.invoices set status = 'disputed', status_reason = 'Client disputes scope' where invoice_number = 'INV-101';
update t set r = public.import_invoices(org, 'csv', jsonb_build_array(
  jsonb_build_object('row_number', 2, 'invoice_number', 'INV-101', 'client_id', c1, 'invoice_date', '2026-10-01',
                     'due_date', '2026-10-10', 'total_minor', 6000000, 'tax_minor', 900000, 'subtotal_minor', 5100000,
                     'source_status', 'issued')));
select pg_temp.assert((select status from public.invoices where invoice_number = 'INV-101') = 'disputed', 'dispute preserved');

-- Same invoice number arriving for a different client is an error, never a silent reassignment.
update t set r = public.import_invoices(org, 'csv', jsonb_build_array(
  jsonb_build_object('row_number', 2, 'invoice_number', 'INV-101', 'client_id', c2, 'invoice_date', '2026-10-01',
                     'due_date', '2026-10-10', 'total_minor', 6000000, 'source_status', 'issued')));
select pg_temp.assert((select (r->>'errors')::int from t) = 1, 'client mismatch rejected');
select pg_temp.assert((select client_id from public.invoices where invoice_number = 'INV-101') = (select c1 from t), 'client unchanged');

-- Cancelling an invoice that has verified money on it is refused.
insert into public.payments (organization_id, client_id, source, transaction_reference, payment_date, amount_minor, verification_status, verified_at)
select org, c2, 'manual', 'UTR-9', '2026-10-12', 1180000, 'verified', now() from t;
insert into public.payment_allocations (organization_id, payment_id, invoice_id, amount_minor)
select org, (select id from public.payments where transaction_reference = 'UTR-9'),
       (select id from public.invoices where invoice_number = 'INV-102'), 1180000 from t;
update t set r = public.import_invoices(org, 'csv', jsonb_build_array(
  jsonb_build_object('row_number', 3, 'invoice_number', 'INV-102', 'client_id', c2, 'invoice_date', '2026-10-01',
                     'due_date', '2026-10-15', 'total_minor', 1180000, 'tax_minor', 180000, 'source_status', 'cancelled')));
select pg_temp.assert((select r->'results'->0->>'message' from t) like '%cancelled%', 'cancel with payments refused');

-- Lowering a total below verified receipts is refused by the ledger constraint.
update t set r = public.import_invoices(org, 'csv', jsonb_build_array(
  jsonb_build_object('row_number', 3, 'invoice_number', 'INV-102', 'client_id', c2, 'invoice_date', '2026-10-01',
                     'due_date', '2026-10-15', 'total_minor', 100, 'source_status', 'issued')));
select pg_temp.assert((select (r->>'errors')::int from t) = 1, 'total below receipts rejected');

-- A manual entry for an already-synced invoice keeps it marked as synced.
update t set r = public.import_invoices(org, 'manual', jsonb_build_array(
  jsonb_build_object('row_number', 1, 'invoice_number', 'INV-102', 'client_id', c2, 'invoice_date', '2026-10-01',
                     'due_date', '2026-10-15', 'total_minor', 1180000, 'tax_minor', 180000, 'source_status', 'issued')));
select pg_temp.assert((select source_channel from public.invoices where invoice_number = 'INV-102') = 'csv', 'manual does not downgrade channel');

select pg_temp.logout();
rollback;
