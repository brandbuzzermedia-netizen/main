-- Diwani Parivaar OS, Phase 10: business-specific modules and their compliance gates.

insert into public.permissions (key, description, sensitive) values
  ('operations.read', 'See products, orders, suppliers, properties and outlet sales', false),
  ('operations.write', 'Manage products, orders, suppliers, properties and outlet sales', false),
  ('compliance.verify', 'Verify BIS evidence and K-RERA registrations; approve regulated ads', true)
on conflict do nothing;
insert into public.role_permissions (role, permission) values
  ('owner', 'operations.read'), ('owner', 'operations.write'), ('owner', 'compliance.verify'),
  ('company_admin', 'operations.read'), ('company_admin', 'operations.write'), ('company_admin', 'compliance.verify'),
  ('operations_manager', 'operations.read'), ('operations_manager', 'operations.write'),
  ('sales_manager', 'operations.read'), ('marketing_manager', 'operations.read'), ('staff', 'operations.read'),
  ('finance', 'operations.read')
on conflict do nothing;

create table public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 200),
  kind            text not null default 'supplier' check (kind in ('supplier', 'white_label', 'weaver', 'vendor', 'franchisor')),
  contact_name    text,
  phone_e164      text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  gstin           text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  sku                text not null check (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,40}$'),
  name               text not null check (length(trim(name)) between 1 and 200),
  variant            text,
  -- Saree fabric/weave/colour/length, toy age range, etc.
  attributes         jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object'),
  price_minor        bigint check (price_minor >= 0),
  dealer_price_minor bigint check (dealer_price_minor >= 0),
  cost_minor         bigint check (cost_minor >= 0),
  fulfilment         text not null default 'stock_held' check (fulfilment in ('stock_held', 'supplier_direct', 'digital')),
  stock_qty          integer check (stock_qty >= 0),
  supplier_id        uuid,
  requires_bis       boolean not null default false,
  bis_status         text not null default 'none' check (bis_status in ('none', 'submitted', 'verified', 'rejected')),
  bis_certificate_no text,
  bis_valid_until    date,
  bis_document_id    uuid,
  bis_verified_by    uuid references public.users (id) on delete set null,
  bis_verified_at    timestamptz,
  listed             boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, sku),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id) on delete set null (supplier_id),
  foreign key (organization_id, bis_document_id) references public.documents (organization_id, id) on delete restrict,
  check (fulfilment <> 'stock_held' or stock_qty is not null)
);

-- A toy is never listed as compliant without verified, current BIS evidence.
create or replace function app.guard_product() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.bis_status = 'verified' and (tg_op = 'INSERT' or old.bis_status <> 'verified' or new.bis_certificate_no is distinct from old.bis_certificate_no) then
    if current_setting('app.compliance_rpc', true) is distinct from 'on' then
      raise exception 'BIS evidence is verified only through verify_bis by an authorised person' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.requires_bis and new.listed and not (new.bis_status = 'verified' and new.bis_valid_until >= current_date) then
    raise exception 'This product needs verified, current BIS evidence before it can be listed' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger products_guard before insert or update on public.products for each row execute function app.guard_product();

create or replace function public.verify_bis(p_product uuid, p_certificate text, p_valid_until date, p_document uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare p public.products;
begin
  select * into p from public.products where id = p_product;
  if p.id is null or not app.has_permission(p.organization_id, 'compliance.verify') then
    raise exception 'Only an authorised person can verify BIS evidence' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(length(trim(p_certificate)), 0) < 4 or p_valid_until < current_date or p_document is null then
    raise exception 'Record the certificate number, a future expiry date and the evidence document' using errcode = 'check_violation';
  end if;
  perform set_config('app.compliance_rpc', 'on', true);
  update public.products set bis_status = 'verified', bis_certificate_no = trim(p_certificate), bis_valid_until = p_valid_until,
    bis_document_id = p_document, bis_verified_by = auth.uid(), bis_verified_at = now() where id = p_product;
  perform set_config('app.compliance_rpc', 'off', true);
end $$;

create table public.orders (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete cascade,
  order_number            text not null,
  kind                    text not null default 'b2c' check (kind in ('b2b', 'b2c')),
  channel                 text not null check (channel in ('direct', 'whatsapp', 'instagram', 'shopify', 'dealer', 'exhibition', 'website', 'other')),
  contact_id              uuid,
  customer_name           text,
  status                  text not null default 'enquiry' check (status in ('enquiry', 'quoted', 'accepted', 'advance_received', 'supplier_po', 'packed', 'dispatched', 'delivered', 'cancelled', 'returned')),
  total_minor             bigint not null default 0 check (total_minor >= 0),
  -- B2B advance rule: configurable per order (default 50%).
  advance_required_pct    numeric(5, 2) not null default 50 check (advance_required_pct between 0 and 100),
  advance_received_minor  bigint not null default 0 check (advance_received_minor >= 0),
  tracking_reference      text,
  notes                   text,
  created_by              uuid default auth.uid() references public.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, order_number),
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete set null (contact_id)
);

create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id        uuid not null,
  product_id      uuid not null,
  quantity        integer not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  foreign key (organization_id, order_id) references public.orders (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete restrict
);

-- B2B orders cannot reach a supplier PO (or later) until the advance is received.
create or replace function app.guard_order() returns trigger
language plpgsql as $$
begin
  if new.kind = 'b2b' and new.status in ('supplier_po', 'packed', 'dispatched', 'delivered')
     and new.advance_received_minor < ceil(new.total_minor * new.advance_required_pct / 100.0) then
    raise exception 'Record the % %% advance before raising the supplier PO', new.advance_required_pct using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger orders_guard before insert or update on public.orders for each row execute function app.guard_order();

create table public.commission_agreements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  partner_name    text not null,
  basis           text not null check (basis in ('percent_of_deal', 'fixed_per_deal', 'per_disbursal_percent', 'unconfirmed')),
  rate_pct        numeric(6, 3) check (rate_pct > 0 and rate_pct <= 100),
  fixed_minor     bigint check (fixed_minor > 0),
  status          text not null default 'unconfirmed' check (status in ('unconfirmed', 'signed', 'terminated')),
  signed_on       date,
  document_id     uuid,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, document_id) references public.documents (organization_id, id) on delete restrict,
  -- A commission is only "signed" with the signed agreement on file and real terms.
  check (status <> 'signed' or (signed_on is not null and document_id is not null and basis <> 'unconfirmed'
         and (rate_pct is not null or fixed_minor is not null)))
);

create table public.commission_receivables (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete cascade,
  agreement_id              uuid not null,
  deal_id                   uuid not null,
  -- The partner's transaction value, kept for reference. Never income.
  gross_value_reference_minor bigint check (gross_value_reference_minor >= 0),
  commission_minor          bigint not null check (commission_minor > 0),
  status                    text not null default 'expected' check (status in ('expected', 'confirmed', 'invoiced', 'received', 'disputed')),
  partner_confirmation_ref  text,
  ledger_entry_id           uuid,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  foreign key (organization_id, agreement_id) references public.commission_agreements (organization_id, id) on delete restrict,
  foreign key (organization_id, deal_id) references public.deals (organization_id, id) on delete restrict,
  foreign key (organization_id, ledger_entry_id) references public.ledger_entries (organization_id, id) on delete restrict,
  check (status in ('expected', 'disputed') or partner_confirmation_ref is not null),
  unique (agreement_id, deal_id)
);

create or replace function app.guard_commission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select status from public.commission_agreements where id = new.agreement_id) <> 'signed' then
    raise exception 'Commission is recorded only under a signed agreement' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.deals d join public.pipeline_stages s on s.id = d.stage_id where d.id = new.deal_id and s.kind = 'won') then
    raise exception 'Commission is recorded only after the partner confirms the close' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger commission_receivables_guard before insert or update on public.commission_receivables for each row execute function app.guard_commission();

create table public.properties (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  title              text not null,
  kind               text not null default 'residential' check (kind in ('residential', 'land', 'commercial')),
  listing_side       text not null default 'sale' check (listing_side in ('sale', 'rent', 'mandate')),
  location           text,
  price_minor        bigint check (price_minor >= 0),
  status             text not null default 'available' check (status in ('available', 'under_offer', 'sold', 'withdrawn')),
  broker_name        text,
  rera_registration  text,
  rera_verified      boolean not null default false,
  rera_verified_by   uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, id),
  check (not rera_verified or (rera_registration is not null and rera_verified_by is not null))
);

create table public.site_visits (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id     uuid not null,
  contact_id      uuid,
  visit_at        timestamptz not null,
  feedback        text,
  created_by      uuid default auth.uid() references public.users (id) on delete set null,
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id) references public.contacts (organization_id, id) on delete set null (contact_id)
);

create table public.ad_approvals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  channel         text not null check (channel in ('meta', 'google', 'instagram', 'whatsapp', 'print', 'other')),
  headline        text not null,
  body            text,
  property_id     uuid,
  product_id      uuid,
  status          text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'published')),
  decided_by      uuid references public.users (id) on delete set null,
  decided_at      timestamptz,
  created_by      uuid default auth.uid() references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete restrict,
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete restrict
);

-- Regulated ads: property ads need a verified K-RERA registration; product ads need a listable product.
create or replace function app.guard_ad() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('approved', 'published') then
    if not app.has_permission(new.organization_id, 'compliance.verify') then
      raise exception 'Only an authorised person can approve an ad' using errcode = 'insufficient_privilege';
    end if;
    if new.property_id is not null and not (select rera_verified from public.properties where id = new.property_id) then
      raise exception 'K-RERA registration must be verified before this ad can be approved' using errcode = 'check_violation';
    end if;
    if (select business_model from public.organizations where id = new.organization_id) = 'real_estate' and new.property_id is null then
      raise exception 'Real estate ads must name the property so its K-RERA status can be checked' using errcode = 'check_violation';
    end if;
    if new.product_id is not null and exists (select 1 from public.products p where p.id = new.product_id and p.requires_bis
         and not (p.bis_status = 'verified' and p.bis_valid_until >= current_date)) then
      raise exception 'This product has no verified, current BIS evidence' using errcode = 'check_violation';
    end if;
    new.decided_by := coalesce(new.decided_by, auth.uid());
    new.decided_at := coalesce(new.decided_at, now());
  end if;
  return new;
end $$;
create trigger ad_approvals_guard before insert or update on public.ad_approvals for each row execute function app.guard_ad();

create or replace function public.verify_rera(p_property uuid, p_registration text)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.properties where id = p_property;
  if v_org is null or not app.has_permission(v_org, 'compliance.verify') then
    raise exception 'Only an authorised person can verify K-RERA details' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(length(trim(p_registration)), 0) < 6 then raise exception 'Enter the registration number' using errcode = 'check_violation'; end if;
  perform set_config('app.compliance_rpc', 'on', true);
  update public.properties set rera_registration = trim(p_registration), rera_verified = true, rera_verified_by = auth.uid() where id = p_property;
  perform set_config('app.compliance_rpc', 'off', true);
end $$;
-- rera_verified is set only by verify_rera.
create or replace function app.guard_property() returns trigger
language plpgsql as $$
begin
  if current_setting('app.compliance_rpc', true) = 'on' then return new; end if;
  if new.rera_verified and (tg_op = 'INSERT' or not old.rera_verified) then
    raise exception 'K-RERA details are verified only through verify_rera by an authorised person' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and new.rera_registration is distinct from old.rera_registration then
    new.rera_verified := false; new.rera_verified_by := null; -- a changed number needs re-verification
  end if;
  return new;
end $$;
create trigger properties_guard before insert or update on public.properties for each row execute function app.guard_property();

create table public.outlet_daily_sales (
  id                         uuid primary key default gen_random_uuid(),
  organization_id            uuid not null references public.organizations (id) on delete cascade,
  outlet                     text not null default 'Main outlet',
  sale_date                  date not null,
  channel                    text not null check (channel in ('dine_in', 'takeaway', 'zomato', 'swiggy', 'whatsapp', 'bulk', 'other')),
  orders_count               integer not null default 0 check (orders_count >= 0),
  gross_minor                bigint not null default 0 check (gross_minor >= 0),
  platform_commission_minor  bigint not null default 0 check (platform_commission_minor >= 0),
  source                     text not null default 'manual' check (source in ('manual', 'pos')),
  created_by                 uuid default auth.uid() references public.users (id) on delete set null,
  created_at                 timestamptz not null default now(),
  unique (organization_id, outlet, sale_date, channel)
);

do $$
declare t text;
begin
  foreach t in array array['suppliers', 'products', 'orders', 'order_items', 'commission_agreements', 'commission_receivables',
                           'properties', 'site_visits', 'ad_approvals', 'outlet_daily_sales'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()', t || '_audit', t);
  end loop;
  foreach t in array array['suppliers', 'products', 'orders', 'properties', 'ad_approvals'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['suppliers', 'products', 'orders', 'order_items', 'properties', 'site_visits', 'ad_approvals', 'outlet_daily_sales'] loop
    execute format('create policy %I on public.%I for select to authenticated using (app.has_permission(organization_id, ''operations.read''))', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (app.has_permission(organization_id, ''operations.write'')) with check (app.has_permission(organization_id, ''operations.write''))', t || '_write', t);
  end loop;
end $$;
-- Partner terms are finance-sensitive.
create policy commission_agreements_read on public.commission_agreements for select to authenticated using (app.has_permission(organization_id, 'finance.sensitive'));
create policy commission_agreements_write on public.commission_agreements for all to authenticated
  using (app.has_permission(organization_id, 'finance.approve')) with check (app.has_permission(organization_id, 'finance.approve'));
create policy commission_receivables_read on public.commission_receivables for select to authenticated using (app.can_read_finance(organization_id));
create policy commission_receivables_write on public.commission_receivables for all to authenticated
  using (app.can_write(organization_id)) with check (app.can_write(organization_id));

revoke all on function public.verify_bis(uuid, text, date, uuid), public.verify_rera(uuid, text) from public, anon;
grant execute on function public.verify_bis(uuid, text, date, uuid), public.verify_rera(uuid, text) to authenticated;
revoke execute on all functions in schema app from anon, public;
grant execute on all functions in schema app to authenticated, service_role;
