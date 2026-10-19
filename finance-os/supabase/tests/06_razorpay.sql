begin;
\ir 00_helpers.sql.inc

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_organization('GBS') as org, (now() at time zone 'Asia/Kolkata')::date as today;
select pg_temp.logout();
grant all on t to authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
alter table t add column c1 uuid, add column r text;
insert into public.clients (organization_id, client_code, legal_name) select org, 'ALPHA', 'Alpha' from t;
update t set c1 = (select id from public.clients where client_code = 'ALPHA');
-- Swipe already says INV-1 is paid (so a reconciliation task opens on import).
select public.import_invoices(org, 'csv', jsonb_build_array(
  jsonb_build_object('row_number', 2, 'invoice_number', 'INV-1', 'client_id', c1, 'invoice_date', today - 10, 'due_date', today - 3,
                     'total_minor', 118000, 'tax_minor', 18000, 'source_status', 'issued', 'source_reported_paid_minor', 118000),
  jsonb_build_object('row_number', 3, 'invoice_number', 'INV-2', 'client_id', c1, 'invoice_date', today - 10, 'due_date', today + 3,
                     'total_minor', 50000, 'source_status', 'issued'))) from t;
select pg_temp.assert((select count(*) from public.escalation_tasks where status = 'open') = 1, 'reconciliation task open');

insert into public.payment_links (organization_id, invoice_id, client_id, provider_link_id, reference_id, short_url, amount_minor)
select org, (select id from public.invoices where invoice_number = 'INV-1'), c1, 'plink_A', 'INV-1-a1', 'https://rzp.io/i/abc', 118000 from t;
select pg_temp.assert_raises(
  format($$insert into public.payment_links (organization_id, invoice_id, client_id, provider_link_id, reference_id, short_url, amount_minor)
           values (%L, (select id from public.invoices where invoice_number = 'INV-1'), %L, 'plink_B', 'INV-1-a2', 'https://rzp.io/i/def', 1)$$,
         (select org from t), (select c1 from t)),
  'duplicate key', 'only one open link per invoice');
insert into public.payment_links (organization_id, invoice_id, client_id, provider_link_id, reference_id, short_url, amount_minor)
select org, (select id from public.invoices where invoice_number = 'INV-2'), c1, 'plink_C', 'INV-2-a1', 'https://rzp.io/i/ghi', 50000 from t;

-- Webhook calls are not allowed for signed-in users.
select pg_temp.assert_raises($$select public.apply_razorpay_event('evt_x','payment_link.paid','plink_A','paid',118000,'pay_X',118000,'upi',now(),'{}')$$,
  'permission denied', 'users cannot call the webhook function');
select pg_temp.logout();

-- As the webhook (service role): paid event records a verified gateway receipt and settles the invoice.
set local role service_role;
select pg_temp.assert(public.apply_razorpay_event('evt_1','payment_link.paid','plink_A','paid',118000,'pay_111',118000,'upi',now(),'{"event":"payment_link.paid"}') = 'recorded', 'first event recorded');
reset role;
select pg_temp.assert((select outstanding_minor from public.invoices where invoice_number = 'INV-1') = 0, 'invoice settled by gateway payment');
select pg_temp.assert((select verification_status = 'verified' and source = 'gateway' and method = 'upi' from public.payments where transaction_reference = 'pay_111'), 'gateway receipt verified');
select pg_temp.assert((select status from public.payment_links where provider_link_id = 'plink_A') = 'paid', 'link marked paid');
select pg_temp.assert((select status from public.escalation_tasks where kind = 'reconciliation') = 'resolved', 'reconciliation task auto-closed once ledger matches Swipe');

set local role service_role;
-- Scenario 7: duplicate webhook delivery (same event id) is a no-op.
select pg_temp.assert(public.apply_razorpay_event('evt_1','payment_link.paid','plink_A','paid',118000,'pay_111',118000,'upi',now(),'{}') = 'duplicate_event', 'duplicate event ignored');
-- A different event for the same payment does not double count.
select pg_temp.assert(public.apply_razorpay_event('evt_2','payment_link.paid','plink_A','paid',118000,'pay_111',118000,'upi',now(),'{}') = 'already_recorded', 'same payment id not recorded twice');
-- Overpayment on INV-2: allocate the open balance, keep the rest unallocated.
select pg_temp.assert(public.apply_razorpay_event('evt_3','payment_link.paid','plink_C','paid',60000,'pay_222',60000,'card',now(),'{}') = 'recorded', 'second link paid');
-- Unknown link (e.g. a link made outside Finance OS) is logged and ignored.
select pg_temp.assert(public.apply_razorpay_event('evt_4','payment_link.paid','plink_ZZZ','paid',100,'pay_333',100,'upi',now(),'{}') = 'unknown_link', 'unknown link ignored');
reset role;
select pg_temp.assert((select unallocated_minor from public.payments where transaction_reference = 'pay_222') = 10000, 'overpayment kept unallocated');
select pg_temp.assert((select count(*) from public.payments) = 2, 'exactly two payments');
select pg_temp.assert((select count(*) from public.integration_events where provider = 'razorpay') = 4, 'every distinct event logged once');
select pg_temp.assert((select status from public.integration_events where provider_event_id = 'evt_4') = 'ignored', 'unknown link event marked ignored');

-- A failed event rolls back fully (no half-recorded payment, event not marked as seen, so Razorpay's retry works).
insert into public.payment_links (organization_id, invoice_id, client_id, provider_link_id, reference_id, short_url, amount_minor, status)
select org, (select id from public.invoices where invoice_number = 'INV-2'), c1, 'plink_D', 'INV-2-a2', 'https://rzp.io/i/jkl', 1, 'expired' from t;
set local role service_role;
select pg_temp.assert(public.apply_razorpay_event('evt_5','payment_link.expired','plink_D','expired',0,null,null,null,null,'{}') = 'status_updated', 'expiry event handled');
reset role;
select pg_temp.assert((select status from public.payment_links where provider_link_id = 'plink_D') = 'expired', 'link expired');
rollback;
