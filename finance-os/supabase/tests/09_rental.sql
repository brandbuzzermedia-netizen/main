begin;
\ir 00_helpers.sql.inc
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_family_group('G') as grp;
grant all on t to authenticated;
alter table t add column org uuid, add column ent uuid, add column salon uuid, add column tower uuid, add column ten uuid, add column lease uuid;
update t set org = public.create_company(grp, '{"name":"Family holdings","slug":"holdings"}');
update t set ent = (select id from public.legal_entities where organization_id = t.org);
insert into public.memberships (organization_id, user_id, role) select org, '00000000-0000-0000-0000-00000000000c'::uuid, 'sales_rep' from t;

-- Salon and Tower are separate, configurable units.
insert into public.rental_units (organization_id, legal_entity_id, label) select org, ent, 'Salon' from t;
insert into public.rental_units (organization_id, legal_entity_id, label) select org, ent, 'Tower' from t;
update t set salon = (select id from public.rental_units where label = 'Salon'), tower = (select id from public.rental_units where label = 'Tower');
insert into public.tenants (organization_id, name) select org, 'Demo tenant' from t;
update t set ten = (select id from public.tenants);
insert into public.leases (organization_id, unit_id, tenant_id, start_date, rent_minor, due_day, deposit_minor, escalation_pct, escalation_every_months)
select org, salon, ten, '2026-01-01', 5000000, 5, 15000000, 5, 12 from t;
update t set lease = (select id from public.leases);
select pg_temp.assert_raises(format($$insert into public.leases (organization_id, unit_id, tenant_id, start_date, rent_minor) values (%L, %L, %L, '2026-06-01', 100)$$,
  (select org from t), (select salon from t), (select ten from t)), 'leases_one_active', 'one active lease per unit');

-- Charges are idempotent and escalate after 12 months.
select pg_temp.assert(public.generate_rent_charges((select org from t), '2027-02-10') = 14, 'Jan 2026 .. Feb 2027 = 14 charges');
select pg_temp.assert(public.generate_rent_charges((select org from t), '2027-02-10') = 0, 'running again creates nothing');
select pg_temp.assert((select amount_minor from public.rent_charges where period_start = '2026-12-01') = 5000000, 'no escalation in year one');
select pg_temp.assert((select amount_minor from public.rent_charges where period_start = '2027-01-01') = 5250000, '5% escalation after 12 months');

-- Rent due, received and arrears are distinct.
insert into public.rent_receipts (organization_id, charge_id, amount_minor, received_on, method, reference)
select org, (select id from public.rent_charges where period_start = '2026-01-01'), 2000000, '2026-01-06', 'upi', 'RENT-1' from t;
select pg_temp.assert((select status from public.rent_charges where period_start = '2026-01-01') = 'partially_paid', 'part-payment');
select pg_temp.assert((select amount_minor - received_minor from public.rent_charges where period_start = '2026-01-01') = 3000000, 'arrears tracked');
select pg_temp.assert_raises(format($$insert into public.rent_receipts (organization_id, charge_id, amount_minor, received_on, method, reference) values (%L, %L, 9000000, '2026-01-07', 'upi', 'RENT-2')$$,
  (select org from t), (select id from public.rent_charges where period_start = '2026-01-01')), 'exceed', 'cannot receive more than due');

-- Deposits are a liability ledger.
insert into public.security_deposit_ledger (organization_id, lease_id, kind, amount_minor, on_date) select org, lease, 'received', 15000000, '2026-01-01' from t;
select pg_temp.assert_raises(format($$insert into public.security_deposit_ledger (organization_id, lease_id, kind, amount_minor, on_date) values (%L, %L, 'refunded', 99999999, '2026-02-01')$$, (select org from t), (select lease from t)),
  'exceed the deposit', 'cannot refund more than held');

-- Unit expenses roll up to the owning entity through the ledger; only expense types can carry a unit.
insert into public.ledger_entries (organization_id, legal_entity_id, entry_type, category, description, txn_date, amount_minor, rental_unit_id, status)
select org, ent, 'expense', 'Repairs', 'Tower lift repair', '2026-11-02', 2500000, tower, 'pending_approval' from t;
select pg_temp.assert_raises(format($$insert into public.ledger_entries (organization_id, legal_entity_id, entry_type, category, description, txn_date, amount_minor, rental_unit_id) values (%L, %L, 'income', 'Rent', 'x', '2026-11-02', 1, %L)$$,
  (select org from t), (select ent from t), (select tower from t)), 'ledger_rental_unit_expense', 'rent is not booked twice through the ledger');
select pg_temp.assert_raises($$update public.rent_receipts set amount_minor = 1$$, 'permission denied', 'receipts are append-only');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.assert((select count(*) from public.rental_units) = 0, 'sales rep sees no rental data');
select pg_temp.assert((select count(*) from public.security_deposit_ledger) = 0, 'sales rep sees no deposits');
select pg_temp.logout();
rollback;
