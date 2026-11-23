-- Google Maps Platform terms: from Places results only the place ID is kept; coordinates from Google may be
-- cached for up to 30 days. Names, phones and addresses are shown live and saved only when a person confirms them.
-- Additive only: existing rows are not changed.

alter table public.contacts
  add column needs_confirm boolean not null default false,
  add column coords_fetched_at timestamptz;
comment on column public.contacts.needs_confirm is 'Added from Google Maps: details are shown live until a person confirms them';
comment on column public.contacts.coords_fetched_at is 'Set when lat/lng came from Google; cleared when replaced by a person''s own location. Expires after 30 days';

-- Clears Google coordinates older than 30 days for one company (called when field lists load).
create or replace function public.expire_google_coords(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not app.has_permission(p_org, 'company.view') then return 0; end if;
  update public.contacts set lat = null, lng = null, coords_fetched_at = null
   where organization_id = p_org and coords_fetched_at is not null and coords_fetched_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.expire_google_coords(uuid) from public, anon;
grant execute on function public.expire_google_coords(uuid) to authenticated;

-- Check-in with a location replaces a pin that came from Google with the phone's own reading.
create or replace function app.field_visit_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rank constant text[] := array['to_visit', 'owner_absent', 'demo_shown', 'interested', 'advance_paid', 'delivered', 'final_paid'];
  cur text; target text; today date := (new.visited_at at time zone 'Asia/Kolkata')::date; follow date; g timestamptz; has_pin boolean;
begin
  select field_status, coords_fetched_at, lat is not null into cur, g, has_pin from public.contacts where id = new.contact_id;
  target := case new.outcome when 'owner_absent' then 'owner_absent' when 'demo_shown' then 'demo_shown' when 'interested' then 'interested'
                             when 'paid_advance' then 'advance_paid' else 'lost' end;
  follow := case new.outcome
    when 'owner_absent' then coalesce((new.owner_back_at at time zone 'Asia/Kolkata')::date, today + 1)
    when 'demo_shown' then today + 2 when 'interested' then today + 1 when 'paid_advance' then today + 7 else null end;
  if target <> 'lost' and cur is not null and cur <> 'lost' and array_position(rank, cur) > array_position(rank, target) then
    target := cur; -- a later visit never moves a lead backwards
  end if;
  update public.contacts set
    field_status = target,
    next_follow_up_on = follow,
    owner_back_at = case when new.outcome = 'owner_absent' then new.owner_back_at else null end,
    lost_reason = case when target = 'lost' then left(coalesce(nullif(trim(new.note), ''), 'Not interested'), 300) else null end,
    lat = case when new.lat is not null and (g is not null or not has_pin) then new.lat else lat end,
    lng = case when new.lat is not null and (g is not null or not has_pin) then new.lng else lng end,
    coords_fetched_at = case when new.lat is not null then null else coords_fetched_at end
  where id = new.contact_id;
  return new;
end $$;

revoke execute on all functions in schema app from public, anon;
