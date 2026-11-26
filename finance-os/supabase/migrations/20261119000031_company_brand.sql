-- Company brand: any company can use its own logo and colours across its whole OS
-- (sidebar, buttons, tiles, pop-ups, loader). Companies without their own brand keep the design defaults.
alter table public.organizations
  add column brand_custom boolean not null default false,
  add column logo_url     text check (logo_url is null or ((logo_url ~* '^https://' or logo_url ~* '^http://(127\.0\.0\.1|localhost)[:/]') and length(logo_url) <= 600)),
  add column logo_bg      text not null default '#FFFFFF' check (logo_bg ~ '^#[0-9A-Fa-f]{6}$');
-- Brand columns are descriptive settings, editable like the colours (row security still requires company.settings).
grant update (brand_custom, logo_url, logo_bg) on public.organizations to authenticated;

-- Public bucket for logos (logos are shown to everyone in the company; nothing private goes here).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('brand', 'brand', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
    execute $p$create policy brand_object_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'brand' and app.has_permission(((storage.foldername(name))[1])::uuid, 'company.settings'))$p$;
    execute $p$create policy brand_object_update on storage.objects for update to authenticated
      using (bucket_id = 'brand' and app.has_permission(((storage.foldername(name))[1])::uuid, 'company.settings'))$p$;
    execute $p$create policy brand_object_delete on storage.objects for delete to authenticated
      using (bucket_id = 'brand' and app.has_permission(((storage.foldername(name))[1])::uuid, 'company.settings'))$p$;
  end if;
end $$;
