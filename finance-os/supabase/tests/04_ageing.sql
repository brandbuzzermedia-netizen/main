begin;
\ir 00_helpers.sql.inc

select pg_temp.login('00000000-0000-0000-0000-00000000000a');
create temp table t as select public.create_organization('GBS') as org, (now() at time zone 'Asia/Kolkata')::date as today;
select pg_temp.logout();
grant all on t to authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000a');

insert into public.clients (organization_id, client_code, legal_name) select org, 'ALPHA', 'Alpha' from t;

insert into public.invoices (organization_id, client_id, source_channel, invoice_number, invoice_date, due_date, total_minor)
select t.org, c.id, 'manual'::public.source_channel, v.num, t.today - 60, t.today + v.offset_days, 100000
from t, public.clients c,
     (values ('A-future', 3), ('A-today', 0), ('A-5', -5), ('A-20', -20), ('A-50', -50)) v(num, offset_days);

select pg_temp.assert((select ageing_bucket from public.invoice_balances where invoice_number = 'A-future') = 'not_due', 'future not due');
select pg_temp.assert((select ageing_bucket from public.invoice_balances where invoice_number = 'A-today') = 'due_today', 'due today');
select pg_temp.assert((select ageing_bucket from public.invoice_balances where invoice_number = 'A-5') = 'overdue_1_15', '5 days overdue');
select pg_temp.assert((select days_overdue from public.invoice_balances where invoice_number = 'A-5') = 5, 'days overdue computed in IST');
select pg_temp.assert((select ageing_bucket from public.invoice_balances where invoice_number = 'A-20') = 'overdue_16_45', '20 days overdue');
select pg_temp.assert((select ageing_bucket from public.invoice_balances where invoice_number = 'A-50') = 'overdue_45_plus', '50 days overdue');

-- An approved extension moves the effective due date.
insert into public.payment_extensions (organization_id, invoice_id, new_due_date, reason)
select t.org, i.id, t.today + 5, 'Client cash-flow; approved by founder' from t, public.invoices i where i.invoice_number = 'A-20';
select pg_temp.assert((select ageing_bucket from public.invoice_balances where invoice_number = 'A-20') = 'not_due', 'extension defers ageing');
select pg_temp.assert_raises(
  format($$insert into public.payment_extensions (organization_id, invoice_id, new_due_date, reason)
           select %L, id, current_date + 9, 'second' from public.invoices where invoice_number = 'A-20'$$, (select org from t)),
  'duplicate key', 'only one active extension per invoice');

-- Disputed invoices are bucketed separately; cancelled ones drop out of client balances.
update public.invoices set status = 'disputed' where invoice_number = 'A-50';
update public.invoices set status = 'cancelled' where invoice_number = 'A-5';
select pg_temp.assert((select ageing_bucket from public.invoice_balances where invoice_number = 'A-50') = 'disputed', 'disputed bucket');
select pg_temp.assert((select outstanding_minor from public.client_balances) = 400000, 'cancelled excluded from client balance (disputed still owed)');
select pg_temp.assert((select overdue_minor from public.client_balances) = 0, 'disputed is not counted as overdue');

select pg_temp.logout();
rollback;
