-- GBS Client Report Studio: initial schema, row-level security and storage.
--
-- Tenancy: every row carries agency_id. Agency staff see only their own
-- agency's rows. Client viewers see only reports shared with their client,
-- and never internal notes or upload internals.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tagline text,
  created_at timestamptz not null default now()
);

-- One row per signed-in person. Staff belong to an agency; client viewers
-- also belong to the agency that serves them, plus one client.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff', 'client_viewer')),
  client_id uuid,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  slug text not null,
  industry text,
  location text,
  website text,
  instagram text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, slug),
  unique (id, agency_id)
);

alter table public.users
  add constraint users_client_fk foreign key (client_id, agency_id) references public.clients (id, agency_id) on delete cascade,
  add constraint users_client_viewer_has_client check (role <> 'client_viewer' or client_id is not null);

-- Logo, cover image and palette. Files live in the private storage bucket.
create table public.client_brand_assets (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  client_id uuid not null,
  kind text not null check (kind in ('logo', 'cover', 'palette')),
  storage_path text,
  primary_color text check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  foreign key (client_id, agency_id) references public.clients (id, agency_id) on delete cascade
);

-- Reference data shared by all agencies.
create table public.platforms (
  id text primary key,
  label text not null,
  description text
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  client_id uuid not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'Draft' check (status in ('Draft', 'Pending', 'Ready for review', 'Delivered')),
  template text not null default 'premium' check (template in ('premium', 'minimal', 'dark')),
  -- Reviewer decisions on conflicting figures, e.g. {"ig.growth": "reported"}.
  resolutions jsonb not null default '{}'::jsonb,
  shared_with_client boolean not null default false,
  share_password_hash text,
  current_version_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (id, agency_id),
  foreign key (client_id, agency_id) references public.clients (id, agency_id) on delete cascade
);
create index reports_client_idx on public.reports (client_id, period_start desc);

-- Which modules a report includes, in order.
create table public.report_sections (
  agency_id uuid not null,
  report_id uuid not null,
  section_key text not null check (section_key in (
    'exec', 'social', 'calendar', 'content', 'ig', 'meta', 'google', 'linkedin',
    'leads', 'impact', 'mom', 'sources', 'recs', 'plan')),
  enabled boolean not null default true,
  position int not null,
  primary key (report_id, section_key),
  foreign key (report_id, agency_id) references public.reports (id, agency_id) on delete cascade
);

-- Uploaded screenshots and files. Duplicates (same content hash in one
-- report) are kept but flagged, so their figures are never counted twice.
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  report_id uuid not null,
  platform_id text not null references public.platforms (id),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  byte_size bigint,
  content_hash text not null,
  duplicate_of uuid references public.uploads (id) on delete set null,
  period_start date,
  period_end date,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'running', 'done', 'failed', 'manual')),
  -- Shown on the client's source screenshot pages.
  include_in_report boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, agency_id),
  foreign key (report_id, agency_id) references public.reports (id, agency_id) on delete cascade
);
create index uploads_report_hash_idx on public.uploads (report_id, content_hash);

-- Account-level figures. metric_key mirrors the report data path
-- ("ig.views", "meta.spend", "prev.views"). Rows sharing a conflict_group
-- disagree; only a user-confirmed row is used.
create table public.extracted_metrics (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  report_id uuid not null,
  metric_key text not null,
  value numeric,
  text_value text,
  unit text,
  source_upload_id uuid references public.uploads (id) on delete set null,
  provenance text not null default 'screenshot' check (provenance in ('screenshot', 'brief', 'sample', 'manual')),
  confidence text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  conflict_group text,
  user_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (report_id, agency_id) references public.reports (id, agency_id) on delete cascade
);
create index extracted_metrics_report_idx on public.extracted_metrics (report_id, metric_key);

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  report_id uuid not null,
  platform_id text not null references public.platforms (id),
  published_on date not null,
  post_type text not null check (post_type in ('Reel', 'Post', 'Carousel')),
  theme text,
  caption text,
  tags text,
  cover_path text,
  external_url text,
  provenance text not null default 'screenshot' check (provenance in ('screenshot', 'brief', 'sample', 'manual')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, agency_id),
  foreign key (report_id, agency_id) references public.reports (id, agency_id) on delete cascade
);

create table public.social_post_metrics (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  post_id uuid not null,
  metric_key text not null check (metric_key in ('views', 'reach', 'likes', 'comments', 'shares', 'saves')),
  value numeric,
  source_upload_id uuid references public.uploads (id) on delete set null,
  provenance text not null default 'screenshot' check (provenance in ('screenshot', 'brief', 'sample', 'manual')),
  confidence text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  user_confirmed boolean not null default false,
  unique (post_id, metric_key),
  foreign key (post_id, agency_id) references public.social_posts (id, agency_id) on delete cascade
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  report_id uuid not null,
  platform_id text not null references public.platforms (id),
  name text not null,
  objective text,
  created_at timestamptz not null default now(),
  unique (id, agency_id),
  foreign key (report_id, agency_id) references public.reports (id, agency_id) on delete cascade
);

create table public.campaign_metrics (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  campaign_id uuid not null,
  metric_key text not null check (metric_key in ('spend', 'conv', 'impr', 'reach', 'clicks')),
  value numeric,
  source_upload_id uuid references public.uploads (id) on delete set null,
  provenance text not null default 'screenshot' check (provenance in ('screenshot', 'brief', 'sample', 'manual')),
  confidence text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  user_confirmed boolean not null default false,
  unique (campaign_id, metric_key),
  foreign key (campaign_id, agency_id) references public.campaigns (id, agency_id) on delete cascade
);

-- Generated copy blocks with their evidence. Confidence is for staff only.
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  report_id uuid not null,
  version_id uuid,
  block_id text not null,
  type text not null check (type in ('data', 'observation', 'interpretation', 'action', 'summary')),
  text text not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (report_id, agency_id) references public.reports (id, agency_id) on delete cascade
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  report_id uuid not null,
  action text not null,
  why text,
  priority text not null check (priority in ('High', 'Medium', 'Low')),
  owner text,
  timeline text,
  position int not null default 0,
  foreign key (report_id, agency_id) references public.reports (id, agency_id) on delete cascade
);

-- Every generation, regeneration and edit pass is a version. `content`
-- holds edited copy, variants, titles and action-plan rows.
create table public.report_versions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  report_id uuid not null,
  version int not null,
  label text not null,
  content jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (report_id, version),
  foreign key (report_id, agency_id) references public.reports (id, agency_id) on delete cascade
);

alter table public.reports
  add constraint reports_current_version_fk foreign key (current_version_id) references public.report_versions (id) on delete set null;
alter table public.insights
  add constraint insights_version_fk foreign key (version_id) references public.report_versions (id) on delete cascade;

-- Never rendered into a client report and never readable by client viewers.
create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  report_id uuid not null,
  body text not null,
  author_id uuid references auth.users (id) on delete set null,
  author_name text,
  created_at timestamptz not null default now(),
  foreign key (report_id, agency_id) references public.reports (id, agency_id) on delete cascade
);

-- ---------------------------------------------------------------- helpers

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger clients_touch before update on public.clients for each row execute function public.touch_updated_at();
create trigger reports_touch before update on public.reports for each row execute function public.touch_updated_at();

-- Security definer so policies can read the caller's membership without
-- recursing through the users table's own policies.
create or replace function public.current_agency_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select agency_id from public.users where id = auth.uid()
$$;

create or replace function public.is_agency_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users where id = auth.uid() and role in ('owner', 'admin', 'staff'))
$$;

create or replace function public.current_client_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select client_id from public.users where id = auth.uid() and role = 'client_viewer'
$$;

-- True when the caller is a client viewer and the report is shared with them.
create or replace function public.can_view_shared_report(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.reports r join public.users u on u.id = auth.uid()
    where r.id = rid and u.role = 'client_viewer' and r.client_id = u.client_id
      and r.agency_id = u.agency_id and r.shared_with_client
  )
$$;

revoke all on function public.current_agency_id(), public.is_agency_staff(), public.current_client_id(), public.can_view_shared_report(uuid) from public;
grant execute on function public.current_agency_id(), public.is_agency_staff(), public.current_client_id(), public.can_view_shared_report(uuid) to authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.agencies enable row level security;
alter table public.users enable row level security;
alter table public.clients enable row level security;
alter table public.client_brand_assets enable row level security;
alter table public.platforms enable row level security;
alter table public.reports enable row level security;
alter table public.report_sections enable row level security;
alter table public.uploads enable row level security;
alter table public.extracted_metrics enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_post_metrics enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_metrics enable row level security;
alter table public.insights enable row level security;
alter table public.recommendations enable row level security;
alter table public.report_versions enable row level security;
alter table public.internal_notes enable row level security;

create policy agencies_read on public.agencies for select to authenticated
  using (id = public.current_agency_id());
create policy agencies_update on public.agencies for update to authenticated
  using (id = public.current_agency_id() and public.is_agency_staff())
  with check (id = public.current_agency_id());

create policy users_read_self on public.users for select to authenticated
  using (id = auth.uid() or (public.is_agency_staff() and agency_id = public.current_agency_id()));

create policy platforms_read on public.platforms for select to authenticated using (true);

-- Staff: full access to their agency's rows in every tenant table.
do $$
declare t text;
begin
  foreach t in array array['clients', 'client_brand_assets', 'reports', 'report_sections', 'uploads',
    'extracted_metrics', 'social_posts', 'social_post_metrics', 'campaigns', 'campaign_metrics',
    'insights', 'recommendations', 'report_versions', 'internal_notes']
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_agency_staff() and agency_id = public.current_agency_id())
         with check (public.is_agency_staff() and agency_id = public.current_agency_id())',
      t || '_staff_all', t);
  end loop;
end $$;

-- Client viewers: read-only, and only what a shared report renders.
create policy clients_viewer_read on public.clients for select to authenticated
  using (id = public.current_client_id());
create policy brand_viewer_read on public.client_brand_assets for select to authenticated
  using (client_id = public.current_client_id());
create policy reports_viewer_read on public.reports for select to authenticated
  using (public.can_view_shared_report(id));

do $$
declare t text;
begin
  foreach t in array array['report_sections', 'extracted_metrics', 'social_posts', 'campaigns', 'recommendations', 'report_versions']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_view_shared_report(report_id))',
      t || '_viewer_read', t);
  end loop;
end $$;

create policy uploads_viewer_read on public.uploads for select to authenticated
  using (include_in_report and duplicate_of is null and public.can_view_shared_report(report_id));
create policy post_metrics_viewer_read on public.social_post_metrics for select to authenticated
  using (exists (select 1 from public.social_posts p where p.id = post_id and public.can_view_shared_report(p.report_id)));
create policy campaign_metrics_viewer_read on public.campaign_metrics for select to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and public.can_view_shared_report(c.report_id)));
-- insights (confidence, evidence) and internal_notes have no viewer policy.

-- ---------------------------------------------------------------- storage

-- Private bucket. Objects are stored under "<agency_id>/..." and served to
-- the browser only through short-lived signed URLs created server-side.
insert into storage.buckets (id, name, public)
values ('report-assets', 'report-assets', false)
on conflict (id) do nothing;

create policy report_assets_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'report-assets' and public.is_agency_staff()
         and (storage.foldername(name))[1] = public.current_agency_id()::text);
create policy report_assets_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'report-assets' and public.is_agency_staff()
              and (storage.foldername(name))[1] = public.current_agency_id()::text);
create policy report_assets_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'report-assets' and public.is_agency_staff()
         and (storage.foldername(name))[1] = public.current_agency_id()::text);
create policy report_assets_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'report-assets' and public.is_agency_staff()
         and (storage.foldername(name))[1] = public.current_agency_id()::text);

-- ---------------------------------------------------------------- reference data

insert into public.platforms (id, label, description) values
  ('instagram', 'Instagram Insights', 'Screenshots of Insights: views, reach, followers, content'),
  ('meta', 'Meta Ads', 'Ads Manager screenshots: spend, results, reach, impressions'),
  ('google', 'Google Ads', 'Campaign and conversion screenshots'),
  ('linkedin', 'LinkedIn Ads', 'Campaign Manager screenshots'),
  ('ga', 'Google Analytics', 'Traffic and conversion screenshots'),
  ('gbp', 'Google Business Profile', 'Searches, calls, direction requests'),
  ('yt', 'YouTube Analytics', 'Views, watch time, subscribers'),
  ('other', 'Other marketing screenshots', 'Anything else worth including'),
  ('prev', 'Previous month (for comparison)', 'Last month''s Insights and Ads screenshots')
on conflict (id) do nothing;
