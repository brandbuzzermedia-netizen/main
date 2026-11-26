-- Payment discipline: each company sets when an overdue invoice warns the team and when work
-- for that client stops. A hold is created automatically, the team is told (tasks, banner,
-- n8n email), new tasks on the client's deals are refused, and the hold lifts by itself when
-- the client pays. Owners or approvers can release early or give time until a date, with a reason.

create table public.payment_rules (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  enabled         boolean not null default true,
  warn_after_days integer not null default 3 check (warn_after_days between 0 and 90),
  hold_after_days integer not null default 15 check (hold_after_days between 1 and 180),
  updated_at      timestamptz not null default now(),
  updated_by      uuid default auth.uid() references public.users (id) on delete set null,
  check (hold_after_days > warn_after_days)
);
alter table public.payment_rules enable row level security;
create policy payment_rules_read on public.payment_rules for select to authenticated using (app.has_permission(organization_id, 'company.view'));
create policy payment_rules_write on public.payment_rules for all to authenticated
  using (app.has_permission(organization_id, 'company.settings')) with check (app.has_permission(organization_id, 'company.settings'));

-- A client can have its own stop-work timeline (e.g. a long-standing client gets 30 days).
alter table public.clients add column hold_after_days integer check (hold_after_days is null or hold_after_days between 1 and 365);
-- Deals remember their client once invoiced, so a hold reaches the right work.
alter table public.deals add column client_id uuid;
alter table public.deals add constraint deals_client_fk foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete set null (client_id);
update public.deals d set client_id = i.client_id from public.invoices i where i.id = d.invoice_id and d.client_id is null;

create table public.work_holds (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id       uuid not null,
  invoice_id      uuid,
  status          text not null default 'active' check (status in ('active', 'released')),
  days_overdue    integer not null,
  started_at      timestamptz not null default now(),
  released_at     timestamptz,
  released_by     uuid references public.users (id) on delete set null,
  release_reason  text check (release_reason is null or length(release_reason) <= 300),
  resume_by       date,
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  check ((status = 'released') = (released_at is not null))
);
create unique index work_holds_one_active on public.work_holds (organization_id, client_id) where status = 'active';
alter table public.work_holds enable row level security;
-- Everyone in the company sees holds: the point is that the team knows to stop.
create policy work_holds_read on public.work_holds for select to authenticated using (app.has_permission(organization_id, 'company.view'));
grant select on public.payment_rules, public.work_holds to authenticated;
grant insert, update, delete on public.payment_rules to authenticated;
grant all on public.payment_rules, public.work_holds to service_role;
create trigger payment_rules_audit after insert or update or delete on public.payment_rules for each row execute function app.audit_row();
create trigger work_holds_audit after insert or update or delete on public.work_holds for each row execute function app.audit_row();

create or replace function app.client_on_hold(p_org uuid, p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.work_holds where organization_id = p_org and client_id = p_client and status = 'active')
$$;

-- Work stops: no new tasks on deals of a client on hold.
create or replace function app.guard_task_on_hold() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_client uuid; v_name text;
begin
  if new.deal_id is null then return new; end if;
  select d.client_id into v_client from public.deals d where d.id = new.deal_id;
  if v_client is not null and app.client_on_hold(new.organization_id, v_client) then
    select legal_name into v_name from public.clients where id = v_client;
    raise exception 'Work is on hold for %: payment is overdue. An owner can release the hold in Finance.', v_name using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger tasks_guard_hold before insert on public.tasks for each row execute function app.guard_task_on_hold();

/** Team task helper: one task per person who works on the client's deals, or one unassigned task. */
create or replace function app.hold_tasks(p_org uuid, p_client uuid, p_title text, p_due date) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.tasks (organization_id, title, due_on, priority, assignee_id, created_by)
  select p_org, left(p_title, 200), p_due, 'high', a, null
  from (select distinct owner_id as a from public.deals where organization_id = p_org and client_id = p_client and owner_id is not null) x
  where not exists (select 1 from public.tasks t where t.organization_id = p_org and t.title = left(p_title, 200) and t.status in ('open', 'in_progress'));
  if not found then
    insert into public.tasks (organization_id, title, due_on, priority, created_by)
    select p_org, left(p_title, 200), p_due, 'high', null
    where not exists (select 1 from public.tasks t where t.organization_id = p_org and t.title = left(p_title, 200));
  end if;
end $$;

/** Daily: warn at warn_after_days, hold at the client's or company's hold_after_days. Service role only. */
create or replace function public.evaluate_payment_holds(p_today date)
returns integer
language plpgsql security definer set search_path = public as $$
declare r record; v_new integer := 0; v_rule int;
begin
  for r in
    select i.id as invoice_id, i.organization_id, i.client_id, i.invoice_number, i.due_date, p_today - i.due_date as days,
           c.legal_name, c.hold_after_days as client_days, pr.warn_after_days, pr.hold_after_days
    from public.invoices i
    join public.clients c on c.id = i.client_id
    join public.payment_rules pr on pr.organization_id = i.organization_id and pr.enabled
    where i.status = 'issued' and i.outstanding_minor > 0 and i.due_date < p_today
  loop
    v_rule := coalesce(r.client_days, r.hold_after_days);
    if r.days >= v_rule then
      if app.client_on_hold(r.organization_id, r.client_id) then continue; end if;
      -- An owner gave extra time for this invoice.
      if exists (select 1 from public.work_holds h where h.organization_id = r.organization_id and h.invoice_id = r.invoice_id and h.status = 'released' and h.resume_by >= p_today) then continue; end if;
      insert into public.work_holds (organization_id, client_id, invoice_id, days_overdue) values (r.organization_id, r.client_id, r.invoice_id, r.days);
      perform app.hold_tasks(r.organization_id, r.client_id, format('STOP WORK: %s — invoice %s is %s days overdue', r.legal_name, r.invoice_number, r.days), p_today);
      v_new := v_new + 1;
    elsif r.days = r.warn_after_days then
      perform app.hold_tasks(r.organization_id, r.client_id,
        format('Payment overdue: %s — invoice %s. Work stops on %s if unpaid', r.legal_name, r.invoice_number, to_char(r.due_date + v_rule, 'DD Mon YYYY')), p_today);
    end if;
  end loop;
  return v_new;
end $$;

/** Paid (or cancelled): lift the client's hold once nothing of theirs is past the stop line. */
create or replace function app.release_holds_on_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rule int; v_name text;
begin
  if not app.client_on_hold(new.organization_id, new.client_id) then return new; end if;
  if new.status = 'issued' and new.outstanding_minor > 0 then return new; end if;
  select coalesce(c.hold_after_days, pr.hold_after_days, 15), c.legal_name into v_rule, v_name
  from public.clients c left join public.payment_rules pr on pr.organization_id = c.organization_id where c.id = new.client_id;
  if exists (select 1 from public.invoices i where i.client_id = new.client_id and i.id <> new.id and i.status = 'issued' and i.outstanding_minor > 0
             and i.due_date + v_rule <= (now() at time zone 'Asia/Kolkata')::date) then return new; end if;
  update public.work_holds set status = 'released', released_at = now(), release_reason = 'Paid' where organization_id = new.organization_id and client_id = new.client_id and status = 'active';
  perform app.hold_tasks(new.organization_id, new.client_id, format('Resume work: %s has paid', v_name), (now() at time zone 'Asia/Kolkata')::date);
  return new;
end $$;
create trigger invoices_release_holds after update of amount_received_minor, credited_minor, status on public.invoices
  for each row execute function app.release_holds_on_payment();

/** Owner or approver releases early, optionally giving time until a date. */
create or replace function public.release_work_hold(p_hold uuid, p_reason text, p_resume_by date)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare h public.work_holds;
begin
  select * into h from public.work_holds where id = p_hold and status = 'active';
  if h.id is null then raise exception 'This hold is not active' using errcode = 'check_violation'; end if;
  if not (app.has_permission(h.organization_id, 'finance.approve') or app.has_permission(h.organization_id, 'company.settings')) then
    raise exception 'Only an owner or approver can release a hold' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why the hold is released' using errcode = 'check_violation'; end if;
  update public.work_holds set status = 'released', released_at = now(), released_by = auth.uid(), release_reason = trim(p_reason), resume_by = p_resume_by where id = h.id;
end $$;

-- invoice_from_deal now records the client on the deal, so holds reach its work.
create or replace function public.invoice_from_deal(p_deal uuid, p_tax_rate_bp integer, p_due_days integer, p_description text)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  d public.deals; o public.organizations; v_client uuid; v_inv uuid; v_name text; v_tax bigint; v_no text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_fy int;
begin
  select * into d from public.deals where id = p_deal;
  if d.id is null or not app.can_write(d.organization_id) then raise exception 'Only finance can raise invoices' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from public.pipeline_stages s where s.id = d.stage_id and s.kind = 'won') then
    raise exception 'Only a won deal can be invoiced' using errcode = 'check_violation';
  end if;
  if d.invoice_id is not null then raise exception 'This deal already has an invoice' using errcode = 'unique_violation'; end if;
  if d.value_minor <= 0 then raise exception 'Set the deal value before invoicing' using errcode = 'check_violation'; end if;
  if p_tax_rate_bp not in (0, 500, 1200, 1800, 2800) then raise exception 'Choose a GST rate: 0, 5, 12, 18 or 28%%' using errcode = 'check_violation'; end if;
  if p_due_days not between 0 and 120 then raise exception 'Due in 0 to 120 days' using errcode = 'check_violation'; end if;
  select * into o from public.organizations where id = d.organization_id;
  v_name := coalesce(nullif(trim(d.account_name), ''), d.title);
  select id into v_client from public.clients where organization_id = d.organization_id and lower(legal_name) = lower(v_name) limit 1;
  if v_client is null then
    insert into public.clients (organization_id, client_code, legal_name)
    values (d.organization_id, left(upper(regexp_replace(v_name, '[^A-Za-z0-9]', '', 'g')) || 'X', 10) || '-' || upper(substr(md5(random()::text), 1, 4)), v_name)
    returning id into v_client;
  end if;
  v_fy := case when extract(month from v_today) >= coalesce(o.fy_start_month, 4) then extract(year from v_today)::int else extract(year from v_today)::int - 1 end;
  v_no := upper(coalesce(o.short_name, left(regexp_replace(o.name, '[^A-Za-z0-9]', '', 'g'), 4))) || '/' || v_fy || '-' || lpad(((v_fy + 1) % 100)::text, 2, '0') || '/' ||
          lpad((select count(*) + 1 from public.invoices i where i.organization_id = d.organization_id and i.source_system = 'os')::text, 4, '0');
  v_tax := round(d.value_minor * p_tax_rate_bp / 10000.0);
  insert into public.invoices (organization_id, client_id, source_system, source_channel, invoice_number, invoice_date, due_date, currency, subtotal_minor, tax_minor, total_minor)
  values (d.organization_id, v_client, 'os', 'manual', v_no, v_today, v_today + p_due_days, d.currency, d.value_minor, v_tax, d.value_minor + v_tax)
  returning id into v_inv;
  insert into public.invoice_line_items (organization_id, invoice_id, description, quantity, unit_price_minor, tax_rate_bp, tax_minor, amount_minor)
  values (d.organization_id, v_inv, left(coalesce(nullif(trim(p_description), ''), d.title), 500), 1, d.value_minor, p_tax_rate_bp, v_tax, d.value_minor + v_tax);
  update public.deals set invoice_id = v_inv, client_id = v_client where id = d.id;
  return v_inv;
end $$;

-- Every company starts with the default rules (3 days warning, work stops at 15).
insert into public.payment_rules (organization_id, updated_by) select id, null from public.organizations on conflict do nothing;
create or replace function app.default_payment_rules() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.payment_rules (organization_id, updated_by) values (new.id, null) on conflict do nothing;
  return new;
end $$;
create trigger organizations_payment_rules after insert on public.organizations for each row execute function app.default_payment_rules();

revoke all on function public.evaluate_payment_holds(date) from public, anon, authenticated;
grant execute on function public.evaluate_payment_holds(date) to service_role;
revoke all on function public.release_work_hold(uuid, text, date) from public, anon;
grant execute on function public.release_work_hold(uuid, text, date) to authenticated;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;

/** Queues the team email for holds that started today (when the payment_hold_alerts switch is on). */
create or replace function public.enqueue_hold_alerts(p_today date)
returns integer
language plpgsql security definer set search_path = public as $$
declare d record; v_items jsonb; v_team jsonb; v_new int := 0; v_id uuid;
begin
  for d in select ad.* from public.automation_definitions ad join public.organizations o on o.id = ad.organization_id
           where ad.enabled and ad.template_key = 'payment_hold_alerts' and not o.emergency_stop
  loop
    select coalesce(jsonb_agg(jsonb_build_object('client', c.legal_name, 'invoice_number', i.invoice_number, 'days_overdue', h.days_overdue,
             'outstanding_minor', i.outstanding_minor, 'currency', i.currency)), '[]')
      into v_items
    from public.work_holds h join public.clients c on c.id = h.client_id left join public.invoices i on i.id = h.invoice_id
    where h.organization_id = d.organization_id and h.status = 'active' and (h.started_at at time zone 'Asia/Kolkata')::date = p_today;
    if jsonb_array_length(v_items) = 0 then continue; end if;
    select coalesce(jsonb_agg(distinct u.email), '[]') into v_team
    from public.memberships m join public.users u on u.id = m.user_id
    where m.organization_id = d.organization_id and u.email is not null
      and m.role in ('owner', 'company_admin', 'finance', 'account_manager', 'operations_manager', 'sales_manager');
    insert into public.automation_runs (organization_id, definition_id, idempotency_key, trigger_source, status, is_mock, payload_summary, requested_by)
    values (d.organization_id, d.id, 'payment_hold_alerts:' || p_today, 'schedule', case when d.requires_approval then 'pending_approval' else 'queued' end, false,
            jsonb_build_object('company', (select name from public.organizations where id = d.organization_id), 'date', p_today, 'holds', v_items, 'team', v_team), null)
    on conflict (organization_id, idempotency_key) do nothing returning id into v_id;
    if v_id is not null then v_new := v_new + 1; v_id := null; end if;
  end loop;
  return v_new;
end $$;
revoke all on function public.enqueue_hold_alerts(date) from public, anon, authenticated;
grant execute on function public.enqueue_hold_alerts(date) to service_role;
