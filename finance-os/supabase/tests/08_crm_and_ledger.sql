begin;
\ir 00_helpers.sql.inc
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'fin2@test');
insert into public.users (id, email) select id, email from auth.users on conflict do nothing;

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated;
alter table t add column gbs uuid, add column tof uuid, add column ent uuid;
update t set gbs = public.create_company(grp, '{"name":"GBS","slug":"gbs-l"}'), tof = public.create_company(grp, '{"name":"TOF","slug":"tof-l"}');
update t set ent = (select id from public.legal_entities where organization_id = t.gbs and is_default);
insert into public.memberships (organization_id, user_id, role) select gbs, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t
  union all select gbs, '00000000-0000-0000-0000-0000000000f2'::uuid, 'finance' from t;
select pg_temp.assert((select count(*) from public.legal_entities) = 2, 'each company gets a default legal entity');

-- Phase 3: contacts, duplicates, consent and suppression gates.
insert into public.contacts (organization_id, full_name, email, phone_e164, owner_id)
select gbs, 'Asha', 'asha@example.com', '+919800000001', '00000000-0000-0000-0000-00000000000a'::uuid from t;
select pg_temp.assert_raises(format($$insert into public.contacts (organization_id, full_name, email) values (%L, 'Dup', 'ASHA@example.com')$$, (select gbs from t)),
  'contacts_email_unique', 'duplicate email rejected');
select pg_temp.assert((select public.import_contacts((select gbs from t), '[{"full_name":"Asha again","email":"asha@example.com"},{"full_name":"Ravi","email":"ravi@example.com"},{"full_name":"Bad","email":"not-an-email"}]') ->> 'duplicates') = '1', 'import skips duplicates');
select pg_temp.assert((select count(*) from public.contacts) = 2, 'import inserted one, rejected one invalid');
insert into public.outreach_sequences (organization_id, name, status) select gbs, 'First touch', 'active' from t;
select pg_temp.assert_raises(format($$insert into public.outreach_enrollments (organization_id, sequence_id, contact_id) select %L, (select id from public.outreach_sequences), (select id from public.contacts where full_name = 'Asha')$$, (select gbs from t)),
  'lawful basis', 'no outreach without a lawful basis');
update public.contacts set consent_basis = 'consent', consent_at = now() where full_name = 'Asha';
insert into public.outreach_enrollments (organization_id, sequence_id, contact_id)
select gbs, (select id from public.outreach_sequences), (select id from public.contacts where full_name = 'Asha') from t;
insert into public.outreach_events (organization_id, contact_id, kind) select gbs, (select id from public.contacts where full_name = 'Asha'), 'unsubscribe' from t;
select pg_temp.assert((select status from public.outreach_enrollments) = 'stopped_suppressed', 'unsubscribe stops the sequence');
select pg_temp.assert((select do_not_contact from public.contacts where full_name = 'Asha'), 'unsubscribe sets do-not-contact');
select pg_temp.assert((select count(*) from public.suppression_records where value_normalized = 'asha@example.com') = 1, 'unsubscribe adds suppression');
select pg_temp.assert_raises($$update public.outreach_enrollments set status = 'active'$$, 'do-not-contact', 'cannot re-enrol an unsubscribed contact');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.contacts) = 0, 'rep sees no contacts owned by others');
select pg_temp.logout();

-- Phase 4: ledger, maker-checker, immutability, settlement.
select pg_temp.login('00000000-0000-0000-0000-0000000000f2');
insert into public.ledger_entries (organization_id, legal_entity_id, entry_type, category, description, txn_date, amount_minor, status)
select gbs, ent, 'expense', 'Software', 'Design tool', '2026-11-05', 1180000, 'pending_approval' from t;
select pg_temp.assert_raises($$update public.ledger_entries set status = 'approved'$$, 'approval functions', 'cannot approve by direct update');
select pg_temp.assert_raises(format($$insert into public.ledger_entries (organization_id, legal_entity_id, entry_type, category, description, txn_date, amount_minor, status) values (%L, %L, 'income', 'x', 'x', '2026-11-01', 100, 'approved')$$, (select gbs from t), (select ent from t)),
  'start as draft', 'cannot insert an approved entry');
select pg_temp.assert_raises($$select public.approve_ledger_entry((select id from public.ledger_entries limit 1), true)$$, 'not allowed', 'finance user without approve permission cannot approve');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select public.approve_ledger_entry((select id from public.ledger_entries limit 1), true);
select pg_temp.assert((select status from public.ledger_entries limit 1) = 'approved', 'owner approves an entry someone else made');
insert into public.ledger_entries (organization_id, legal_entity_id, entry_type, category, description, txn_date, amount_minor, status)
select gbs, ent, 'income', 'Retainer', 'Own entry', '2026-11-06', 5000000, 'pending_approval' from t;
select pg_temp.assert_raises($$select public.approve_ledger_entry((select id from public.ledger_entries where description = 'Own entry'), true)$$, 'other than the creator', 'maker cannot check their own entry');
select pg_temp.assert_raises($$update public.ledger_entries set amount_minor = 1 where description = 'Design tool'$$, 'cannot be edited', 'approved entries are immutable');
select pg_temp.assert_raises($$delete from public.ledger_entries where description = 'Design tool'$$, 'only drafts', 'approved entries cannot be deleted');
select public.settle_ledger_entry((select id from public.ledger_entries where description = 'Design tool'), 500000, '2026-11-07', 'upi', 'UTR1');
select pg_temp.assert((select status from public.ledger_entries where description = 'Design tool') = 'partially_settled', 'partial settlement');
select pg_temp.assert_raises($$select public.settle_ledger_entry((select id from public.ledger_entries where description = 'Design tool'), 9999999, '2026-11-07', 'upi', 'UTR2')$$, 'exceeds', 'cannot over-settle');
select public.settle_ledger_entry((select id from public.ledger_entries where description = 'Design tool'), 680000, '2026-11-08', 'upi', 'UTR2');
select pg_temp.assert((select status from public.ledger_entries where description = 'Design tool') = 'settled', 'fully settled');
select public.reverse_ledger_entry((select id from public.ledger_entries where description = 'Design tool'), 'Duplicate bill');
select pg_temp.assert((select status from public.ledger_entries where description = 'Design tool') = 'reversed', 'reversed');
-- Foreign currency needs a rate to be approved.
insert into public.ledger_entries (organization_id, legal_entity_id, entry_type, category, description, txn_date, amount_minor, currency, status, created_by)
select gbs, ent, 'income', 'Consulting', 'USD invoice', '2026-11-06', 100000, 'USD', 'pending_approval', '00000000-0000-0000-0000-0000000000f2'::uuid from t;
select pg_temp.assert_raises($$select public.approve_ledger_entry((select id from public.ledger_entries where description = 'USD invoice'), true)$$, 'fx rate', 'no FX rate, no approval');
-- Internal transfer creates two legs in one group.
select public.record_internal_transfer((select gbs from t), (select tof from t), 1000000, '2026-11-09', 'NEFT1', 'Working capital');
select pg_temp.assert((select count(*) from public.ledger_entries where entry_type in ('transfer_in', 'transfer_out')) = 2, 'transfer has two legs');
select pg_temp.logout();

-- A rep never sees the ledger.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.ledger_entries) = 0, 'rep cannot read the ledger');
select pg_temp.logout();
rollback;
