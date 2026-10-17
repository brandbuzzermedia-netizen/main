-- Defense in depth: the anon role (unauthenticated requests carrying only the public key)
-- gets nothing, including objects created by later migrations.
--
-- Supabase's default privileges grant anon access to new tables, views and functions in
-- public. RLS already returns no rows to anon, but grants are removed so a future
-- policy mistake cannot expose data.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
revoke execute on all functions in schema app from anon, public;

-- Re-grant what signed-in users need (revoking from PUBLIC also removed their implicit access).
grant execute on all functions in schema app to authenticated, service_role;
grant execute on function public.create_organization(text, boolean) to authenticated;
grant execute on function public.import_invoices(uuid, public.source_channel, jsonb, text, text) to authenticated;

-- Views are read-only to users; their RLS comes from security_invoker.
revoke insert, update, delete, truncate, references, trigger on public.invoice_balances, public.client_balances from authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
alter default privileges in schema app revoke execute on functions from anon, public;
