-- Scheduled automation and n8n routing.
--
-- Before this, nothing set automation_runs.workflow_path, so a real (non-mock) run could never
-- reach n8n, and nothing queued scheduled runs. This adds:
--   1. a default webhook path per template: dp-<template-key-with-dashes>, matching the
--      workflow files in n8n/workflows/;
--   2. enqueue_scheduled_runs(): called by the signed cron dispatcher, queues one run per
--      company per day for the three low-risk templates that are switched on, with a summary
--      built from real records. Companies under emergency stop are skipped. Idempotent.
--
-- Additive: one trigger and one function; existing runs keep their values.

create or replace function app.default_workflow_path() returns trigger
language plpgsql as $$
begin
  if new.workflow_path is null then
    select 'dp-' || replace(d.template_key, '_', '-') into new.workflow_path
    from public.automation_definitions d where d.id = new.definition_id;
  end if;
  return new;
end $$;
create trigger automation_runs_workflow_path before insert on public.automation_runs
  for each row execute function app.default_workflow_path();

update public.automation_runs r set workflow_path = 'dp-' || replace(d.template_key, '_', '-')
  from public.automation_definitions d where d.id = r.definition_id and r.workflow_path is null;

/**
 * Queues today's scheduled runs. Service role only (the cron dispatcher). Returns how many new
 * runs were queued. Summaries contain counts and labels only, never bank or tax identifiers.
 */
create or replace function public.enqueue_scheduled_runs(p_today date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  d record;
  v_summary jsonb;
  v_new integer := 0;
  v_id uuid;
begin
  for d in
    select ad.* from public.automation_definitions ad
    join public.organizations o on o.id = ad.organization_id
    where ad.enabled and not o.emergency_stop
      and ad.template_key in ('daily_summary', 'rent_overdue_escalation', 'bill_ocr_review')
  loop
    if d.template_key = 'daily_summary' then
      v_summary := jsonb_build_object(
        'company', (select name from public.organizations where id = d.organization_id),
        'date', p_today,
        'open_deals', (select count(*) from public.deals x join public.pipeline_stages s on s.id = x.stage_id
                        where x.organization_id = d.organization_id and s.kind not in ('won', 'lost')),
        'open_pipeline_minor', (select coalesce(sum(x.value_minor), 0) from public.deals x join public.pipeline_stages s on s.id = x.stage_id
                        where x.organization_id = d.organization_id and s.kind not in ('won', 'lost') and x.currency = 'INR'),
        'meetings_today', (select count(*) from public.meetings m where m.organization_id = d.organization_id
                        and (m.starts_at at time zone 'Asia/Kolkata')::date = p_today and m.status = 'scheduled'),
        'tasks_overdue', (select count(*) from public.tasks t where t.organization_id = d.organization_id
                        and t.status = 'open' and t.due_on < p_today),
        'ledger_awaiting_approval', (select count(*) from public.ledger_entries l where l.organization_id = d.organization_id
                        and l.status = 'pending_approval'),
        'bills_awaiting_review', (select count(*) from public.ocr_extractions e where e.organization_id = d.organization_id
                        and e.status in ('extracted', 'failed')));
    elsif d.template_key = 'bill_ocr_review' then
      v_summary := jsonb_build_object(
        'company', (select name from public.organizations where id = d.organization_id),
        'date', p_today,
        'bills_awaiting_review', (select count(*) from public.ocr_extractions e where e.organization_id = d.organization_id
                        and e.status in ('extracted', 'failed')),
        'oldest_waiting_days', (select coalesce(max(p_today - (e.created_at at time zone 'Asia/Kolkata')::date), 0)
                        from public.ocr_extractions e where e.organization_id = d.organization_id and e.status in ('extracted', 'failed')));
      if (v_summary ->> 'bills_awaiting_review')::int = 0 then continue; end if;
    else -- rent_overdue_escalation
      v_summary := jsonb_build_object(
        'company', (select name from public.organizations where id = d.organization_id),
        'date', p_today,
        'overdue', coalesce((select jsonb_agg(jsonb_build_object(
            'unit', u.label, 'due_on', c.due_on, 'outstanding_minor', c.amount_minor - c.received_minor,
            'days_overdue', p_today - c.due_on) order by c.due_on)
          from public.rent_charges c
          join public.leases l on l.id = c.lease_id
          join public.rental_units u on u.id = l.unit_id
          where c.organization_id = d.organization_id and c.status in ('open', 'partially_paid') and c.due_on < p_today), '[]'::jsonb));
      if jsonb_array_length(v_summary -> 'overdue') = 0 then continue; end if;
      -- The escalation task lives in the OS itself, once per overdue charge.
      insert into public.tasks (organization_id, title, due_on, priority, created_by)
      select d.organization_id, left(format('Rent overdue: %s (due %s)', u.label, to_char(c.due_on, 'DD Mon YYYY')), 200), p_today, 'high', null
      from public.rent_charges c
      join public.leases l on l.id = c.lease_id
      join public.rental_units u on u.id = l.unit_id
      where c.organization_id = d.organization_id and c.status in ('open', 'partially_paid') and c.due_on < p_today
        and not exists (select 1 from public.tasks t where t.organization_id = d.organization_id
                        and t.title = left(format('Rent overdue: %s (due %s)', u.label, to_char(c.due_on, 'DD Mon YYYY')), 200));
    end if;

    insert into public.automation_runs (organization_id, definition_id, idempotency_key, trigger_source, status, is_mock, payload_summary, requested_by)
    values (d.organization_id, d.id, d.template_key || ':' || p_today, 'schedule',
            case when d.requires_approval then 'pending_approval' else 'queued' end, false, v_summary, null)
    on conflict (organization_id, idempotency_key) do nothing
    returning id into v_id;
    if v_id is not null then v_new := v_new + 1; v_id := null; end if;
  end loop;
  return v_new;
end $$;

revoke all on function public.enqueue_scheduled_runs(date) from public, anon, authenticated;
grant execute on function public.enqueue_scheduled_runs(date) to service_role;
