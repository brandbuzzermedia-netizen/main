-- Exports and sensitive reads are audited (Phase 11 hardening).
alter table public.audit_logs drop constraint audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in ('INSERT', 'UPDATE', 'DELETE', 'EXPORT', 'SENSITIVE_READ'));

create or replace function public.log_export(p_org uuid, p_what text, p_rows integer)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not app.is_member(p_org) then raise exception 'Not a member' using errcode = 'insufficient_privilege'; end if;
  insert into public.audit_logs (organization_id, actor_id, table_name, action, new_data)
  values (p_org, auth.uid(), left(p_what, 60), 'EXPORT', jsonb_build_object('rows', p_rows));
end $$;
revoke all on function public.log_export(uuid, text, integer) from public, anon;
grant execute on function public.log_export(uuid, text, integer) to authenticated;
