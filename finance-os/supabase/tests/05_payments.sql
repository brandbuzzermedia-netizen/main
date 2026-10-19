begin;
\ir 00_helpers.sql.inc

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_organization('GBS') as org, (now() at time zone 'Asia/Kolkata')::date as today;
select pg_temp.logout();
grant all on t to authenticated;
insert into public.memberships (organization_id, user_id, role)
select org, '00000000-0000-0000-0000-00000000000c'::uuid, 'viewer' from t;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

alter table t add column c1 uuid, add column c2 uuid, add column p1 uuid, add column r jsonb;
insert into public.clients (organization_id, client_code, legal_name)
select org, code, name from t, (values ('ALPHA', 'Alpha Pvt Ltd'), ('BETA', 'Beta LLP')) v(code, name);
update t set c1 = (select id from public.clients where client_code = 'ALPHA'), c2 = (select id from public.clients where client_code = 'BETA');

insert into public.invoices (organization_id, client_id, source_channel, invoice_number, invoice_date, due_date, total_minor)
select org, c1, 'manual'::public.source_channel, n, today - 30, today + d, amt from t,
  (values ('I-1', -20, 100000::bigint), ('I-2', -5, 50000::bigint), ('I-3', 10, 30000::bigint)) v(n, d, amt);
insert into public.invoices (organization_id, client_id, source_channel, invoice_number, invoice_date, due_date, total_minor)
select org, c2, 'manual', 'J-1', today - 30, today - 3, 70000 from t;

-- Scenario 4/5: record_payment with allocations across invoices; pending until verified.
update t set p1 = public.record_payment(org,
  jsonb_build_object('client_id', c1, 'transaction_reference', 'UTR 111', 'payment_date', today - 10, 'amount_minor', 120000, 'method', 'neft'),
  jsonb_build_array(jsonb_build_object('invoice_id', (select id from public.invoices where invoice_number = 'I-1'), 'amount_minor', 100000),
                    jsonb_build_object('invoice_id', (select id from public.invoices where invoice_number = 'I-2'), 'amount_minor', 20000)));
select pg_temp.assert((select outstanding_minor from public.invoices where invoice_number = 'I-1') = 100000, 'pending payment does not settle');
select pg_temp.assert_raises(
  format($$select public.record_payment(%L, '{"client_id":"%s","transaction_reference":"x","payment_date":"2026-10-01","amount_minor":1,"verified":true}'::jsonb)$$,
         (select org from t), (select c1 from t)),
  'how the payment was verified', 'verification requires a note');

update public.payments set verification_status = 'verified', verification_note = 'Seen in HDFC statement' where id = (select p1 from t);
select pg_temp.assert((select outstanding_minor from public.invoices where invoice_number = 'I-1') = 0, 'full payment settles I-1');
select pg_temp.assert((select outstanding_minor from public.invoices where invoice_number = 'I-2') = 30000, 'partial payment leaves remainder on I-2');

-- Duplicate reference across sources and spacing/case is rejected.
select pg_temp.assert_raises(
  format($$select public.record_payment(%L, '{"client_id":"%s","source":"bank_import","transaction_reference":"utr111","payment_date":"2026-10-01","amount_minor":5}'::jsonb)$$,
         (select org from t), (select c1 from t)),
  'already recorded', 'same reference from another source is a duplicate');

-- Re-allocation is atomic: invalid set leaves previous allocations untouched.
select pg_temp.assert_raises(
  format($$select public.set_payment_allocations(%L, jsonb_build_array(
            jsonb_build_object('invoice_id', (select id from public.invoices where invoice_number = 'I-3'), 'amount_minor', 20000),
            jsonb_build_object('invoice_id', (select id from public.invoices where invoice_number = 'J-1'), 'amount_minor', 100)))$$, (select p1 from t)),
  'different clients', 'cross-client allocation rejected');
select pg_temp.assert((select count(*) from public.payment_allocations where payment_id = (select p1 from t)) = 2, 'failed reallocation rolled back');
select public.set_payment_allocations(p1, jsonb_build_array(
  jsonb_build_object('invoice_id', (select id from public.invoices where invoice_number = 'I-1'), 'amount_minor', 100000),
  jsonb_build_object('invoice_id', (select id from public.invoices where invoice_number = 'I-3'), 'amount_minor', 20000))) from t;
select pg_temp.assert((select outstanding_minor from public.invoices where invoice_number = 'I-2') = 50000, 'reallocation reopens I-2');
select pg_temp.assert((select outstanding_minor from public.invoices where invoice_number = 'I-3') = 10000, 'reallocation applied to I-3');

-- Client cannot change while allocated.
select pg_temp.assert_raises(format('update public.payments set client_id = %L where id = %L', (select c2 from t), (select p1 from t)),
  'allocations', 'client locked while allocated');

-- Scenario 6/7: bank statement import — new unmatched credit, duplicate replay, verifies a pending manual entry.
select public.record_payment(org, jsonb_build_object('client_id', c2, 'transaction_reference', 'IMPS-999', 'payment_date', today, 'amount_minor', 70000, 'method', 'imps'),
  jsonb_build_array(jsonb_build_object('invoice_id', (select id from public.invoices where invoice_number = 'J-1'), 'amount_minor', 70000))) from t;
create temp table bank as select jsonb_build_array(
  jsonb_build_object('row_number', 2, 'transaction_reference', 'NEFT-AAA', 'payment_date', today, 'amount_minor', 45000, 'narration', 'NEFT-AAA-SOME PAYER'),
  jsonb_build_object('row_number', 3, 'transaction_reference', 'imps-999', 'payment_date', today, 'amount_minor', 70000, 'narration', 'IMPS-999-BETA LLP'),
  jsonb_build_object('row_number', 4, 'transaction_reference', 'UTR111', 'payment_date', today - 1, 'amount_minor', 120000, 'narration', 'dup'),
  jsonb_build_object('row_number', 5, 'transaction_reference', 'NEFT-BBB', 'payment_date', today, 'amount_minor', 50000, 'narration', 'ALPHA PVT',
                     'client_id', c1, 'allocate_invoice_id', (select id from public.invoices where invoice_number = 'I-2'))
) as rows from t;
grant all on bank to authenticated;
update t set r = public.import_bank_receipts(org, (select rows from bank), 'hdfc-oct.csv', 'sha-1');
select pg_temp.assert((select (r->>'inserted')::int from t) = 2, 'two new bank receipts');
select pg_temp.assert((select (r->>'verified_existing')::int from t) = 1, 'pending manual entry verified by statement');
select pg_temp.assert((select (r->>'duplicates')::int from t) = 1, 'already-verified reference skipped');
select pg_temp.assert((select (r->>'auto_allocated')::int from t) = 1, 'exact match auto-allocated');
select pg_temp.assert((select (r->>'unmatched')::int from t) = 1, 'unmatched credit counted');
select pg_temp.assert((select outstanding_minor from public.invoices where invoice_number = 'J-1') = 0, 'statement verification settles J-1');
select pg_temp.assert((select outstanding_minor from public.invoices where invoice_number = 'I-2') = 0, 'auto allocation settles I-2');
select pg_temp.assert((select client_id is null and unallocated_minor = 45000 from public.payments where transaction_reference = 'NEFT-AAA'), 'unmatched stays unallocated');
update t set r = public.import_bank_receipts(org, (select rows from bank), 'hdfc-oct.csv', 'sha-1');
select pg_temp.assert((select (r->>'inserted')::int from t) = 0 and (select (r->>'same_file_imported_before')::boolean from t), 'statement replay is a no-op');
select pg_temp.assert((select count(*) from public.payments) = 4, 'no duplicate payments after replay');

-- Scenario 9: extensions replace each other and keep history.
select public.approve_extension((select id from public.invoices where invoice_number = 'I-3'), today + 20, 'Client asked for 10 more days') from t;
select public.approve_extension((select id from public.invoices where invoice_number = 'I-3'), today + 25, 'Further 5 days, approved by founder') from t;
select pg_temp.assert((select count(*) from public.payment_extensions where status = 'revoked') = 1, 'previous extension revoked');
select pg_temp.assert((select effective_due_date from public.invoice_balances where invoice_number = 'I-3') = (select today + 25 from t), 'latest extension applies');
select pg_temp.assert_raises(format($$select public.approve_extension(%L, '2000-01-01', 'x y z')$$, (select id from public.invoices where invoice_number = 'I-3')),
  'must be after', 'extension must move the date later');

-- Scenario 8: commitments. One kept on time, one missed, one superseded by extension, one client-level kept.
insert into public.invoices (organization_id, client_id, source_channel, invoice_number, invoice_date, due_date, total_minor)
select org, c2, 'manual', n, today - 30, today - 10, 40000 from t, (values ('J-2'), ('J-3')) v(n);
insert into public.payment_commitments (organization_id, client_id, invoice_id, promised_amount_minor, commitment_date, promised_on, promised_by)
select org, c2, (select id from public.invoices where invoice_number = 'J-2'), 40000, today - 2, today - 7, 'Ravi (Beta accounts)' from t union all
select org, c1, (select id from public.invoices where invoice_number = 'I-3'), 10000, today - 1, today - 6, 'Asha' from t union all
select org, c2, null, 25000, today - 1, today - 4, 'Ravi' from t;
-- I-3 promise is superseded: the extension was approved after... make it so by back-dating the promise.
update public.payment_commitments set created_at = now() - interval '1 day' where promised_by = 'Asha';
-- Client-level promise kept: a verified receipt from BETA after the promise date.
select public.record_payment(org, jsonb_build_object('client_id', c2, 'transaction_reference', 'UPI-KEEP', 'payment_date', today - 2,
  'amount_minor', 25000, 'method', 'upi', 'verified', true, 'verification_note', 'In bank'), '[]'::jsonb) from t;
select pg_temp.assert((select status from public.payment_commitments where promised_by = 'Ravi') = 'fulfilled', 'client-level promise fulfilled by verified receipt');

update t set r = public.process_missed_commitments(org);
select pg_temp.assert((select (r->>'missed')::int from t) = 1, 'one missed commitment');
select pg_temp.assert((select (r->>'superseded')::int from t) = 1, 'one superseded by extension');
select pg_temp.assert((select missed_commitments_count from public.clients where client_code = 'BETA') = 1, 'client missed count incremented');
select pg_temp.assert((select count(*) from public.escalation_tasks where kind = 'commitment_missed') = 1, 'exactly one founder task');
-- Rerun: idempotent.
update t set r = public.process_missed_commitments(org);
select pg_temp.assert((select (r->>'missed')::int from t) = 0, 'rerun misses nothing new');
select pg_temp.assert((select count(*) from public.escalation_tasks where kind = 'commitment_missed') = 1, 'still exactly one task');
select pg_temp.assert((select missed_commitments_count from public.clients where client_code = 'BETA') = 1, 'count not double-incremented');

-- Late payment after a miss: commitment becomes fulfilled but keeps missed_at; count stays.
select public.record_payment(org, jsonb_build_object('client_id', c2, 'transaction_reference', 'LATE-1', 'payment_date', today,
  'amount_minor', 40000, 'method', 'neft', 'verified', true, 'verification_note', 'Bank'),
  jsonb_build_array(jsonb_build_object('invoice_id', (select id from public.invoices where invoice_number = 'J-2'), 'amount_minor', 40000))) from t;
select pg_temp.assert((select status = 'fulfilled' and missed_at is not null from public.payment_commitments where promised_by = 'Ravi (Beta accounts)'),
  'late payment fulfils but history kept');
select pg_temp.assert((select missed_commitments_count from public.clients where client_code = 'BETA') = 1, 'missed count unchanged by late payment');

-- Viewer cannot record payments or run jobs.
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert_raises(format($$select public.record_payment(%L, '{"transaction_reference":"V","payment_date":"2026-10-01","amount_minor":1}'::jsonb)$$, (select org from t)),
  'not allowed', 'viewer cannot record payments');
select pg_temp.assert_raises(format('select public.process_missed_commitments(%L)', (select org from t)), 'not allowed', 'viewer cannot run jobs');
select pg_temp.assert((select count(*) from public.payment_list) = 6, 'viewer reads payments');
select pg_temp.logout();
rollback;
