begin;
\ir 00_helpers.sql.inc
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated;
alter table t add column org uuid, add column other uuid, add column ent uuid, add column doc uuid, add column ocr uuid;
update t set org = public.create_company(grp, '{"name":"A","slug":"doc-a"}'), other = public.create_company(grp, '{"name":"B","slug":"doc-b"}');
update t set ent = (select id from public.legal_entities where organization_id = t.org);
insert into public.memberships (organization_id, user_id, role) select org, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t;
insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, sha256)
select org, org || '/x/bill.pdf', 'bill.pdf', 'application/pdf', 1000, repeat('a', 64) from t;
update t set doc = (select id from public.documents);
select pg_temp.assert_raises(format($$insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, sha256) values (%L, %L, 'b.pdf', 'application/pdf', 10, %L)$$, (select org from t), (select org from t) || '/y/b.pdf', repeat('a', 64)),
  'documents_same_file', 'same file twice is flagged as duplicate');
select pg_temp.assert_raises(format($$insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, sha256) values (%L, %L, 'x.exe', 'application/x-msdownload', 10, %L)$$, (select org from t), (select org from t) || '/z/x.exe', repeat('b', 64)),
  'check constraint', 'only PDF and images are accepted');
select pg_temp.assert_raises(format($$insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, sha256) values (%L, %L, 'x.pdf', 'application/pdf', 10, %L)$$, (select org from t), (select other from t) || '/z/x.pdf', repeat('c', 64)),
  'check constraint', 'a file path cannot point into another company');
select pg_temp.assert_raises($$delete from public.documents$$, 'permission denied', 'originals cannot be deleted');

insert into public.ocr_extractions (organization_id, document_id, provider, is_mock, status, fields)
select org, doc, 'mock', true, 'extracted', '{"total":{"value":"11800","confidence":0.4}}' from t;
update t set ocr = (select id from public.ocr_extractions);
-- Unreviewed OCR cannot be submitted; a draft is fine.
insert into public.ledger_entries (organization_id, legal_entity_id, entry_type, category, description, counterparty, bill_number, txn_date, amount_minor, source_document_id, ocr_extraction_id)
select org, ent, 'expense', 'Repairs', 'Bill DV-0412', 'Demo Vendor', 'DV-0412', '2026-11-08', 1180000, doc, ocr from t;
select pg_temp.assert_raises($$update public.ledger_entries set status = 'pending_approval'$$, 'review the extracted', 'unreviewed OCR cannot go for approval');
update public.ocr_extractions set status = 'reviewed', reviewed_at = now(), reviewed_by = '00000000-0000-0000-0000-00000000000a', corrected = '{"total":"11800"}';
update public.ledger_entries set status = 'pending_approval';
select pg_temp.assert((select status from public.ledger_entries) = 'pending_approval', 'reviewed OCR can be submitted (still needs approval to post)');
select pg_temp.assert((select fields -> 'total' ->> 'confidence' from public.ocr_extractions) = '0.4', 'original OCR output is preserved beside corrections');
select pg_temp.assert((select count(*) from public.possible_duplicate_bills((select org from t), 'demo vendor', 'DV-0412', '2026-11-08', 1180000)) = 1, 'duplicate bill detected');
select pg_temp.assert((select count(*) from public.possible_duplicate_bills((select org from t), 'Other', 'DV-0412', '2026-11-08', 1180000)) = 0, 'different vendor is not a duplicate');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.documents) = 0, 'sales rep cannot open the vault');
select pg_temp.assert((select count(*) from public.ocr_extractions) = 0, 'or OCR output');
select pg_temp.logout();
rollback;
