begin;
\ir 00_helpers.sql.inc
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated;
alter table t add column tof uuid, add column re uuid, add column ash uuid, add column doc uuid, add column prod uuid, add column prop uuid, add column agr uuid, add column deal uuid;
update t set tof = public.create_company(grp, '{"name":"TOF","slug":"m-tof","business_model":"product_b2b"}'),
             re = public.create_company(grp, '{"name":"RE","slug":"m-re","business_model":"real_estate"}'),
             ash = public.create_company(grp, '{"name":"Ashwin","slug":"m-ash","consolidation":"commission_only","stages":[{"name":"Handed off","kind":"open"},{"name":"Closed (partner confirmed)","kind":"won","probability_pct":100}]}');
insert into public.memberships (organization_id, user_id, role) select tof, '00000000-0000-0000-0000-00000000000c'::uuid, 'staff' from t;

-- BIS gate.
insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, sha256)
select tof, tof || '/d/bis.pdf', 'bis.pdf', 'application/pdf', 100, repeat('d', 64) from t;
update t set doc = (select id from public.documents);
insert into public.products (organization_id, sku, name, requires_bis, fulfilment) select tof, 'TOY-1', 'Stacking rings', true, 'supplier_direct' from t;
update t set prod = (select id from public.products);
select pg_temp.assert_raises($$update public.products set listed = true$$, 'bis evidence', 'cannot list a toy without BIS');
select pg_temp.assert_raises($$update public.products set bis_status = 'verified', bis_valid_until = '2030-01-01', bis_certificate_no = 'CM/L-123'$$, 'verify_bis', 'cannot self-mark BIS verified');
select public.verify_bis((select prod from t), 'CM/L-1234567', '2030-01-01', (select doc from t));
update public.products set listed = true;
select pg_temp.assert((select listed from public.products), 'listed after verification');

-- 50% advance gate.
insert into public.orders (organization_id, order_number, kind, channel, total_minor, status) select tof, 'Q-1', 'b2b', 'dealer', 1000000, 'accepted' from t;
select pg_temp.assert_raises($$update public.orders set status = 'supplier_po'$$, 'advance', 'no supplier PO before the advance');
update public.orders set advance_received_minor = 500000, status = 'supplier_po';
select pg_temp.assert((select status from public.orders) = 'supplier_po', 'PO allowed once 50% is in');

-- Commission gate: unconfirmed terms and unconfirmed closes record nothing.
insert into public.commission_agreements (organization_id, partner_name, basis) select ash, 'Ashwin', 'unconfirmed' from t;
update t set agr = (select id from public.commission_agreements);
insert into public.deals (organization_id, title, stage_id, value_minor) select ash, 'Office lease referral', (select id from public.pipeline_stages where organization_id = t.ash and kind = 'open'), 250000000 from t;
update t set deal = (select id from public.deals);
select pg_temp.assert_raises(format($$insert into public.commission_receivables (organization_id, agreement_id, deal_id, commission_minor) values (%L, %L, %L, 100)$$, (select ash from t), (select agr from t), (select deal from t)),
  'signed agreement', 'no commission without a signed agreement');
select pg_temp.assert_raises($$update public.commission_agreements set status = 'signed'$$, 'check constraint', 'cannot mark signed without the document and terms');
insert into public.documents (organization_id, storage_path, file_name, mime_type, size_bytes, sha256) select ash, ash || '/d/agr.pdf', 'agr.pdf', 'application/pdf', 100, repeat('e', 64) from t;
update public.commission_agreements set status = 'signed', basis = 'percent_of_deal', rate_pct = 1, signed_on = '2026-11-01', document_id = (select id from public.documents where file_name = 'agr.pdf');
select pg_temp.assert_raises(format($$insert into public.commission_receivables (organization_id, agreement_id, deal_id, commission_minor) values (%L, %L, %L, 100)$$, (select ash from t), (select agr from t), (select deal from t)),
  'confirms the close', 'no commission before a confirmed close');
update public.deals set stage_id = (select id from public.pipeline_stages where organization_id = (select ash from t) and kind = 'won');
insert into public.commission_receivables (organization_id, agreement_id, deal_id, gross_value_reference_minor, commission_minor) select ash, agr, deal, 250000000, 2500000 from t;
select pg_temp.assert_raises($$update public.commission_receivables set status = 'confirmed'$$, 'check constraint', 'confirmation needs the partner statement reference');

-- K-RERA gate.
insert into public.properties (organization_id, title) select re, '3BHK, Whitefield' from t;
update t set prop = (select id from public.properties);
insert into public.ad_approvals (organization_id, channel, headline, property_id) select re, 'meta', '3BHK for sale', prop from t;
select pg_temp.assert_raises($$update public.ad_approvals set status = 'approved'$$, 'k-rera', 'no ad approval without verified K-RERA');
select pg_temp.assert_raises($$update public.properties set rera_verified = true, rera_registration = 'PRM/KA/RERA/1', rera_verified_by = auth.uid()$$, 'verify_rera', 'cannot self-verify RERA');
select pg_temp.assert_raises(format($$insert into public.ad_approvals (organization_id, channel, headline, status) values (%L, 'meta', 'Generic ad', 'approved')$$, (select re from t)),
  'name the property', 'real estate ads must name a property');
select public.verify_rera((select prop from t), 'PRM/KA/RERA/1251/446/PR/123456');
update public.ad_approvals set status = 'approved';
select pg_temp.assert((select status from public.ad_approvals) = 'approved', 'approved after verification');
update public.properties set rera_registration = 'CHANGED-123';
select pg_temp.assert(not (select rera_verified from public.properties), 'changing the number needs re-verification');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.products) = 1, 'staff can read the catalogue');
update public.products set name = 'x';
select pg_temp.logout();
select pg_temp.assert((select name from public.products) = 'Stacking rings', 'staff cannot edit products');
rollback;
