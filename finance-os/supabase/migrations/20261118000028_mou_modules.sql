-- More of Us OS modules for every company: proposals, research board, company and personal targets.
-- Additive only: new tables, no changes to existing rows.

-- Company sales settings: monthly target, default GST and the services the company sells.
create table public.company_targets (
  organization_id      uuid primary key references public.organizations (id) on delete cascade,
  monthly_target_minor bigint not null default 0 check (monthly_target_minor >= 0),
  default_gst_bp       integer not null default 1800 check (default_gst_bp between 0 and 2800),
  services             text[] not null default '{}' check (cardinality(services) <= 40),
  updated_at           timestamptz not null default now()
);
alter table public.company_targets enable row level security;
create policy company_targets_read on public.company_targets for select to authenticated using (app.has_permission(organization_id, 'company.view'));
create policy company_targets_write on public.company_targets for all to authenticated
  using (app.has_permission(organization_id, 'crm.manage')) with check (app.has_permission(organization_id, 'crm.manage'));
grant select, insert, update on public.company_targets to authenticated;
grant all on public.company_targets to service_role;

-- A monthly target per person, per company.
create table public.member_targets (
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  user_id              uuid not null references public.users (id) on delete cascade,
  monthly_target_minor bigint not null default 0 check (monthly_target_minor >= 0),
  primary key (organization_id, user_id)
);
alter table public.member_targets enable row level security;
create policy member_targets_read on public.member_targets for select to authenticated using (app.has_permission(organization_id, 'company.view'));
create policy member_targets_write on public.member_targets for all to authenticated
  using (app.has_permission(organization_id, 'crm.manage')) with check (app.has_permission(organization_id, 'crm.manage'));
grant select, insert, update, delete on public.member_targets to authenticated;
grant all on public.member_targets to service_role;

-- Proposals linked to a client and (optionally) a deal. Amounts in paise, GST in basis points.
create table public.proposals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  number           text not null check (length(trim(number)) between 1 and 40),
  title            text not null check (length(trim(title)) between 2 and 200),
  client_name      text not null check (length(trim(client_name)) between 1 and 200),
  deal_id          uuid,
  amount_minor     bigint not null check (amount_minor >= 0),
  gst_bp           integer not null default 1800 check (gst_bp between 0 and 2800),
  status           text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  sent_on          date,
  follow_up_on     date,
  decided_on       date,
  notes            text check (notes is null or length(notes) <= 4000),
  owner_id         uuid default auth.uid() references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, number),
  foreign key (organization_id, deal_id) references public.deals (organization_id, id) on delete set null (deal_id)
);
create index on public.proposals (organization_id, status);
alter table public.proposals enable row level security;
create policy proposals_read on public.proposals for select to authenticated
  using (app.has_permission(organization_id, 'crm.read_all') or (app.has_permission(organization_id, 'crm.write') and owner_id = auth.uid()));
create policy proposals_write on public.proposals for all to authenticated
  using (app.has_permission(organization_id, 'crm.manage') or (app.has_permission(organization_id, 'crm.write') and owner_id = auth.uid()))
  with check (app.has_permission(organization_id, 'crm.write'));
grant select, insert, update, delete on public.proposals to authenticated;
grant all on public.proposals to service_role;

-- Research board: account research and preparation cards that move across columns.
create table public.research_cards (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  title            text not null check (length(trim(title)) between 2 and 200),
  account          text check (account is null or length(account) <= 200),
  details          text check (details is null or length(details) <= 4000),
  status           text not null default 'to_start' check (status in ('to_start', 'research', 'in_progress', 'done')),
  priority         text not null default 'normal' check (priority in ('normal', 'high')),
  due_on           date,
  assignee_id      uuid references public.users (id) on delete set null,
  position         integer not null default 0,
  created_by       uuid default auth.uid() references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.research_cards (organization_id, status, position);
alter table public.research_cards enable row level security;
create policy research_cards_all on public.research_cards for all to authenticated
  using (app.has_permission(organization_id, 'crm.write')) with check (app.has_permission(organization_id, 'crm.write'));
grant select, insert, update, delete on public.research_cards to authenticated;
grant all on public.research_cards to service_role;

do $$
declare t text;
begin
  foreach t in array array['proposals', 'research_cards', 'company_targets', 'member_targets'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_row()', t || '_audit', t);
  end loop;
  foreach t in array array['proposals', 'research_cards', 'company_targets'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;
