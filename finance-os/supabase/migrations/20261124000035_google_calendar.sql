-- Google Calendar and Meet: each person connects their own Google account; meetings booked in the OS
-- get a Google Calendar event with a Meet link. Additive only.

-- Tokens are encrypted by the server before they are stored; each person can see and remove only their own.
create table public.google_connections (
  user_id            uuid primary key default auth.uid() references public.users (id) on delete cascade,
  google_email       text check (google_email is null or length(google_email) <= 320),
  refresh_token_enc  text not null check (length(refresh_token_enc) <= 4000),
  access_token_enc   text check (access_token_enc is null or length(access_token_enc) <= 8000),
  access_expires_at  timestamptz,
  scope              text check (scope is null or length(scope) <= 1000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.google_connections enable row level security;
create policy google_connections_own on public.google_connections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.google_connections to authenticated;
grant all on public.google_connections to service_role;
create trigger google_connections_touch before update on public.google_connections for each row execute function app.touch_updated_at();

-- Meetings: the lead, the kind of meeting and the Google event.
alter table public.meetings
  add column contact_id uuid,
  add column kind text check (kind in ('meet', 'in_person', 'call')),
  add column attendee_email text check (attendee_email is null or attendee_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column google_event_id text check (google_event_id is null or length(google_event_id) <= 1024),
  add column meet_url text check (meet_url is null or meet_url ~ '^https://meet\.google\.com/'),
  add column calendar_url text check (calendar_url is null or calendar_url ~ '^https://(www\.)?google\.com/calendar/');
alter table public.meetings add constraint meetings_contact_fk foreign key (organization_id, contact_id)
  references public.contacts (organization_id, id) on delete set null (contact_id);
create index meetings_contact_idx on public.meetings (contact_id, starts_at desc) where contact_id is not null;

-- Field leads found on Google Maps are matched by place too, so the same shop is not added twice.
create index contacts_org_place_idx on public.contacts (organization_id, place_id) where place_id is not null;
