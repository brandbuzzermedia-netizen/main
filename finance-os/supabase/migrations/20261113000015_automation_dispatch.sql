-- Automation dispatch support.
-- Real runs are claimed by the scheduled dispatcher (service role) and sent to n8n.
-- Mock runs (test mode, no credentials) are completed in-app and always labelled mock.

alter table public.automation_runs add column workflow_path text;

create or replace function public.claim_automation_runs(p_limit integer default 20)
returns setof public.automation_runs
language sql security definer set search_path = public as $$
  update public.automation_runs r set status = 'running', attempts = attempts + 1, started_at = now()
  where r.id in (
    select x.id from public.automation_runs x
    join public.automation_definitions d on d.id = x.definition_id
    join public.organizations o on o.id = x.organization_id
    where x.status = 'queued' and not x.is_mock and d.enabled and not o.emergency_stop
    order by x.created_at limit greatest(1, least(p_limit, 100))
    for update of x skip locked)
  returning r.*
$$;
revoke all on function public.claim_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.claim_automation_runs(integer) to service_role;

create or replace function public.complete_mock_run(p_run uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare r public.automation_runs;
begin
  select * into r from public.automation_runs where id = p_run for update;
  if r.id is null or not app.has_permission(r.organization_id, 'automation.manage') then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if not r.is_mock then raise exception 'Only mock runs complete in-app; real runs report back from n8n' using errcode = 'check_violation'; end if;
  if r.status <> 'queued' then raise exception 'This run is not queued' using errcode = 'check_violation'; end if;
  update public.automation_runs set status = 'succeeded', started_at = now(), finished_at = now(),
    n8n_execution_id = 'mock', payload_summary = payload_summary || '{"result": "Mock run: validation passed, nothing was sent or changed"}'
  where id = p_run;
end $$;
revoke all on function public.complete_mock_run(uuid) from public, anon;
grant execute on function public.complete_mock_run(uuid) to authenticated;
