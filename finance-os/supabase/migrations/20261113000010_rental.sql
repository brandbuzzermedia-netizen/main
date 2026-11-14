-- Diwani Parivaar OS, Phase 5: rental management.
-- Units belong to a company workspace and a legal entity (the legal owner). Nothing about a
-- unit's owner, use or tax treatment is inferred from its label: "Salon" and "Tower" are labels.
-- Rent charges are the accrual record; receipts are cash; deposits are a separate liability
-- ledger and never income. Unit expenses are ordinary ledger expenses tagged with the unit.

insert into public.permissions (key, description, sensitive) values
  ('rental.read', 'See rental units, leases, rent and deposits', true),
  ('rental.write', 'Manage rental units, leases, charges and receipts', true)
on conflict do nothing;
insert into public.role_permissions (role, permission) values
  ('owner', 'rental.read'), ('owner', 'rental.write'), ('finance', 'rental.read'), ('finance', 'rental.write'), ('viewer', 'rental.read')
on conflict do nothing;

create table public.rental_units (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  legal_entity_id  uuid not null,
  label            text not null check (length(trim(label)) between 1 and 80),
  address          text,
  use_type         text check (use_type in ('residential', 'commercial', 'retail', 'office', 'industrial', 'land', 'other')),
  co_owners        text,
  notes            text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, label),
  foreign key (organization_id, legal_entity_id) references public.legal_entities (organization_id, id) on delete restrict
);

create table public.tenants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 200),
  contact_name    text,
  email           text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone_e164      text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.leases (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations (id) on delete cascade,
  unit_id                  uuid not null,
  tenant_id                uuid not null,
  start_date               date not null,
  end_date                 date,
  lock_in_months           smallint check (lock_in_months between 0 and 240),
  notice_days              smallint check (notice_days between 0 and 365),
  rent_minor               bigint not null check (rent_minor > 0),
  currency                 char(3) not null default 'INR',
  frequency                text not null default 'monthly' check (frequency in ('monthly', 'quarterly', 'yearly')),
  due_day                  smallint not null default 5 check (due_day between 1 and 28),
  escalation_pct           numeric(5, 2) check (escalation_pct between 0 and 100),
  escalation_every_months  smallint check (escalation_every_months between 1 and 120),
  deposit_minor            bigint not null default 0 check (deposit_minor >= 0),
  deposit_terms            text,
  status                   text not null default 'active' check (status in ('draft', 'active', 'ended')),
  document_id              uuid,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, unit_id) references public.rental_units (organization_id, id) on delete restrict,
  foreign key (organization_id, tenant_id) references public.tenants (organization_id, id) on delete restrict,
  check (end_date is null or end_date >= start_date),
  check ((escalation_pct is null) = (escalation_every_months is null))
);
-- One active lease per unit.
create unique index leases_one_active on public.leases (unit_id) where status = 'active';

create table public.rent_charges (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  lease_id         uuid not null,
  period_start     date not null,
  period_end       date not null,
  due_on           date not null,
  amount_minor     bigint not null check (amount_minor > 0),
  received_minor   bigint not null default 0 check (received_minor >= 0),
  status           text not null default 'open' check (status in ('open', 'partially_paid', 'paid', 'waived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, id),
  unique (lease_id, period_start),
  foreign key (organization_id, lease_id) references public.leases (organization_id, id) on delete cascade,
  check (received_minor <= amount_minor)
);
create index on public.rent_charges (organization_id, due_on);

create table public.rent_receipts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  charge_id        uuid not null,
  amount_minor     bigint not null check (amount_minor > 0),
  received_on      date not null,
  method           text not null check (method in ('upi', 'neft', 'rtgs', 'imps', 'cheque', 'cash', 'other')),
  reference        text not null check (length(trim(reference)) > 0),
  created_by       uuid default auth.uid() references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, charge_id) references public.rent_charges (organization_id, id) on delete restrict,
  unique (organization_id, reference)
);

create table public.security_deposit_ledger (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  lease_id         uuid not null,
  kind             text not null check (kind in ('received', 'refunded', 'appropriated')),
  amount_minor     bigint not null check (amount_minor > 0),
  on_date          date not null,
  reference        text,
  note             text,
  created_by       uuid default auth.uid() references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, lease_id) references public.leases (organization_id, id) on delete restrict
);

-- Unit expenses are ledger expenses tagged with the unit (same company enforced).
alter table public.ledger_entries
  add constraint ledger_rental_unit_fk foreign key (organization_id, rental_unit_id)
    references public.rental_units (organization_id, id) on delete restrict,
  add constraint ledger_rental_unit_expense check (rental_unit_id is null or entry_type in ('expense', 'write_off'));

-- Receipts maintain the charge's received amount and status.
create or replace function app.on_rent_receipt() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_charge uuid := coalesce(new.charge_id, old.charge_id); v_sum bigint; v_amt bigint;
begin
  select coalesce(sum(amount_minor), 0) into v_sum from public.rent_receipts where charge_id = v_charge;
  select amount_minor into v_amt from public.rent_charges where id = v_charge;
  if v_sum > v_amt then raise exception 'Receipts exceed the rent due for this period' using errcode = 'check_violation'; end if;
  update public.rent_charges set received_minor = v_sum,
    status = case when status = 'waived' then 'waived' when v_sum = 0 then 'open' when v_sum < amount_minor then 'partially_paid' else 'paid' end
  where id = v_charge;
  return null;
end $$;
create trigger rent_receipts_refresh after insert or update or delete on public.rent_receipts
  for each row execute function app.on_rent_receipt();

-- Deposits cannot go negative.
create or replace function app.guard_deposit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_bal bigint;
begin
  select coalesce(sum(case when kind = 'received' then amount_minor else -amount_minor end), 0) into v_bal
  from public.security_deposit_ledger where lease_id = new.lease_id;
  if v_bal < 0 then raise exception 'Refunds and appropriations exceed the deposit held' using errcode = 'check_violation'; end if;
  return null;
end $$;
create trigger deposit_guard after insert or update on public.security_deposit_ledger
  for each row execute function app.guard_deposit();

-- Rent due for one period, applying escalation every N months from the lease start.
create or replace function app.rent_for_period(l public.leases, p_start date) returns bigint
language sql immutable as $$
  select case when l.escalation_pct is null then l.rent_minor else
    round(l.rent_minor * power(1 + l.escalation_pct / 100.0,
      floor(((extract(year from age(p_start, l.start_date)) * 12 + extract(month from age(p_start, l.start_date)))) / l.escalation_every_months)))::bigint end
$$;

-- Idempotent: creates any missing charges for active leases up to p_through. Safe to run daily.
create or replace function public.generate_rent_charges(p_org uuid, p_through date)
returns int
language plpgsql security definer set search_path = public, auth as $$
declare l public.leases; v_start date; v_step interval; v_n int := 0;
begin
  if not app.has_permission(p_org, 'rental.write') then
    raise exception 'Not allowed to generate rent for this company' using errcode = 'insufficient_privilege';
  end if;
  for l in select * from public.leases where organization_id = p_org and status = 'active' loop
    v_step := case l.frequency when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months' else interval '1 year' end;
    v_start := l.start_date;
    while v_start <= p_through and (l.end_date is null or v_start <= l.end_date) loop
      insert into public.rent_charges (organization_id, lease_id, period_start, period_end, due_on, amount_minor)
      values (p_org, l.id, v_start, (v_start + v_step - interval '1 day')::date,
              make_date(extract(year from v_start)::int, extract(month from v_start)::int, l.due_day), app.rent_for_period(l, v_start))
      on conflict (lease_id, period_start) do nothing;
      if found then v_n := v_n + 1; end if;
      v_start := (v_start + v_step)::date;
    end loop;
  end loop;
  return v_n;
end $$;

do $$
declare t text;
begin
  foreach t in array array['rental_units', 'tenants', 'leases', 'rent_charges', 'rent_receipts', 'security_deposit_ledger'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()', t || '_audit', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.has_permission(organization_id, ''rental.read''))', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (app.has_permission(organization_id, ''rental.write'')) with check (app.has_permission(organization_id, ''rental.write''))', t || '_write', t);
  end loop;
  foreach t in array array['rental_units', 'tenants', 'leases', 'rent_charges'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;
-- Receipts and deposit movements are append-only once recorded (corrections need a database admin, audited).
revoke update, delete on public.rent_receipts, public.security_deposit_ledger from authenticated;

revoke all on function public.generate_rent_charges(uuid, date) from public, anon;
grant execute on function public.generate_rent_charges(uuid, date) to authenticated;
revoke execute on all functions in schema app from anon, public;
grant execute on all functions in schema app to authenticated, service_role;
