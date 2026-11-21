-- Diwani Parivaar OS, Phase 6: document vault and bill OCR.
-- Files live in a private Supabase Storage bucket under "<organization_id>/<document_id>/<name>".
-- Originals are never deleted by the app. OCR output is a suggestion: an expense that came from
-- a bill can only be submitted for approval after a person has reviewed the extraction.

insert into public.permissions (key, description, sensitive) values
  ('documents.read', 'Open documents in the company vault', true),
  ('documents.write', 'Upload documents and review OCR', false)
on conflict do nothing;
insert into public.role_permissions (role, permission) values
  ('owner', 'documents.read'), ('owner', 'documents.write'), ('company_admin', 'documents.read'), ('company_admin', 'documents.write'),
  ('finance', 'documents.read'), ('finance', 'documents.write'), ('viewer', 'documents.read'),
  ('operations_manager', 'documents.write'), ('staff', 'documents.write'), ('sales_manager', 'documents.write')
on conflict do nothing;

create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  storage_path    text not null unique,
  file_name       text not null check (length(file_name) between 1 and 200),
  mime_type       text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes      integer not null check (size_bytes between 1 and 15728640),
  sha256          text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  kind            text not null default 'bill' check (kind in ('bill', 'receipt', 'agreement', 'lease', 'certificate', 'tax', 'other')),
  -- Restricted documents (salary, partner terms, owner distributions) need finance.sensitive.
  restricted      boolean not null default false,
  uploaded_by     uuid default auth.uid() references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (organization_id, id),
  check (storage_path like organization_id::text || '/%')
);
-- The same file uploaded twice is a duplicate, whoever uploads it.
create unique index documents_same_file on public.documents (organization_id, sha256);

create table public.ocr_extractions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  document_id      uuid not null,
  provider         text not null,
  model            text,
  is_mock          boolean not null default false,
  status           text not null default 'pending' check (status in ('pending', 'extracted', 'failed', 'reviewed', 'rejected')),
  -- {"vendor_name":{"value":"…","confidence":0.93}, …}; values are untrusted suggestions.
  fields           jsonb not null default '{}' check (jsonb_typeof(fields) = 'object'),
  -- The person's corrected values (kept beside the original output, never overwriting it).
  corrected        jsonb,
  error            text,
  reviewed_by      uuid references public.users (id) on delete set null,
  reviewed_at      timestamptz,
  created_by       uuid default auth.uid() references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, document_id) references public.documents (organization_id, id) on delete restrict,
  check ((status = 'reviewed') = (reviewed_at is not null))
);

alter table public.ledger_entries
  add column ocr_extraction_id uuid,
  add column vendor_gstin      text check (vendor_gstin is null or vendor_gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  add column bill_number       text,
  add column cgst_minor        bigint not null default 0 check (cgst_minor >= 0),
  add column sgst_minor        bigint not null default 0 check (sgst_minor >= 0),
  add column igst_minor        bigint not null default 0 check (igst_minor >= 0),
  add column cess_minor        bigint not null default 0 check (cess_minor >= 0),
  add column place_of_supply   text,
  add constraint ledger_source_document_fk foreign key (organization_id, source_document_id) references public.documents (organization_id, id) on delete restrict,
  add constraint ledger_ocr_fk foreign key (organization_id, ocr_extraction_id) references public.ocr_extractions (organization_id, id) on delete restrict;
create index on public.ledger_entries (organization_id, lower(counterparty), bill_number) where bill_number is not null;

-- Unreviewed OCR never reaches approval.
create or replace function app.guard_ocr_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ocr_extraction_id is not null and new.status <> 'draft'
     and not exists (select 1 from public.ocr_extractions x where x.id = new.ocr_extraction_id and x.status = 'reviewed') then
    raise exception 'Review the extracted bill fields before submitting for approval' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger ledger_entries_ocr_review before insert or update on public.ledger_entries
  for each row execute function app.guard_ocr_review();

-- Possible duplicate bills: same vendor and bill number, or same vendor, date and amount.
create or replace function public.possible_duplicate_bills(p_org uuid, p_vendor text, p_bill_number text, p_date date, p_amount_minor bigint, p_exclude uuid default null)
returns table (entry_id uuid, description text, txn_date date, amount_minor bigint, status public.ledger_status, reason text)
language sql stable security invoker set search_path = public as $$
  select e.id, e.description, e.txn_date, e.amount_minor, e.status,
         case when p_bill_number is not null and e.bill_number = p_bill_number then 'Same vendor and bill number'
              else 'Same vendor, date and amount' end
  from public.ledger_entries e
  where e.organization_id = p_org and e.id is distinct from p_exclude and e.status not in ('void', 'reversed')
    and lower(coalesce(e.counterparty, '')) = lower(coalesce(p_vendor, ''))
    and ((p_bill_number is not null and e.bill_number = p_bill_number)
      or (e.txn_date = p_date and e.amount_minor = p_amount_minor))
$$;

do $$
declare t text;
begin
  foreach t in array array['documents', 'ocr_extractions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()', t || '_audit', t);
  end loop;
end $$;
create trigger ocr_extractions_touch before update on public.ocr_extractions for each row execute function app.touch_updated_at();
-- Originals are never deleted by users.
revoke delete on public.documents, public.ocr_extractions from authenticated;
revoke update on public.documents from authenticated;

create or replace function app.can_read_document(p_org uuid, p_restricted boolean, p_uploader uuid) returns boolean
language sql stable as $$
  select (app.has_permission(p_org, 'documents.read') and (not p_restricted or app.has_permission(p_org, 'finance.sensitive')))
      or (p_uploader = auth.uid() and not p_restricted)
$$;

create policy documents_read on public.documents for select to authenticated using (app.can_read_document(organization_id, restricted, uploaded_by));
create policy documents_insert on public.documents for insert to authenticated
  with check (app.has_permission(organization_id, 'documents.write') and uploaded_by = auth.uid());
create policy ocr_read on public.ocr_extractions for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id));
create policy ocr_insert on public.ocr_extractions for insert to authenticated with check (app.has_permission(organization_id, 'documents.write'));
create policy ocr_update on public.ocr_extractions for update to authenticated
  using (app.has_permission(organization_id, 'documents.write')) with check (app.has_permission(organization_id, 'documents.write'));

revoke all on function public.possible_duplicate_bills(uuid, text, text, date, bigint, uuid) from public, anon;
grant execute on function public.possible_duplicate_bills(uuid, text, text, date, bigint, uuid) to authenticated;
revoke execute on all functions in schema app from anon, public;
grant execute on all functions in schema app to authenticated, service_role;

-- Storage bucket and object policies exist only on Supabase (skipped on plain PostgreSQL in CI).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('documents', 'documents', false, 15728640, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
    on conflict (id) do update set public = false;
    execute $p$create policy documents_object_read on storage.objects for select to authenticated
      using (bucket_id = 'documents' and exists (
        select 1 from public.documents d where d.storage_path = storage.objects.name))$p$;
    execute $p$create policy documents_object_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'documents' and app.has_permission(((storage.foldername(name))[1])::uuid, 'documents.write'))$p$;
  end if;
end $$;
