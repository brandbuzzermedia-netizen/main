-- Demo seed: the GBS agency and Thrishank Doors, August 2026 (the prototype
-- dataset, mirrored from src/lib/fixtures/thrishank-2026-08.ts).
--
-- Provenance matters here. Account-level Instagram and Meta Ads figures come
-- from the client's platform screenshots ('screenshot'). Per-piece figures
-- are 'sample' values except those confirmed in the client brief ('brief').
-- Sample rows must be replaced by real extraction before a report is sent.
--
-- To give yourself access after signing up (Auth > Users), run:
--   insert into public.users (id, agency_id, role, full_name)
--   select id, '00000000-0000-4000-8000-0000000000a1', 'owner', 'Mehul'
--   from auth.users where email = 'you@example.com';

insert into public.agencies (id, name, tagline) values
  ('00000000-0000-4000-8000-0000000000a1', 'Get Bee Seen', 'Making brands impossible to ignore.');

insert into public.clients (id, agency_id, name, slug, industry, location) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'Thrishank Doors', 'thrishank', 'Doors and architectural hardware', 'Bengaluru, India'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', 'Lykes', 'lykes', 'Retail', null),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a1', 'Conic Gold', 'conic-gold', 'Jewellery', null);

-- Placeholder palette until the client supplies brand colours.
insert into public.client_brand_assets (agency_id, client_id, kind, primary_color, accent_color) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'palette', '#3B2A21', '#C9974A');

insert into public.reports (id, agency_id, client_id, period_start, period_end, status, template, resolutions, created_at) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '2026-08-01', '2026-08-31', 'Ready for review', 'premium', '{"ig.growth": "reported"}', '2026-09-03'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '2026-07-01', '2026-07-31', 'Delivered', 'premium', '{}', '2026-08-04'),
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '2026-06-01', '2026-06-30', 'Delivered', 'premium', '{}', '2026-07-03'),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c2', '2026-08-01', '2026-08-31', 'Pending', 'premium', '{}', '2026-09-30'),
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c3', '2026-08-01', '2026-08-31', 'Draft', 'premium', '{}', '2026-10-01');

insert into public.report_sections (agency_id, report_id, section_key, position)
select '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', k, n from unnest(array['exec','social','calendar','content','ig','meta','google','linkedin','leads','impact','mom','sources','recs','plan']) with ordinality as s(k, n);

-- Instagram Insights, account level. Reported follower growth (7.4%) disagrees
-- with the calculated 49 / 677 = 7.2%; the app detects that and the reviewer's
-- choice is stored in reports.resolutions (seeded as "reported").
insert into public.extracted_metrics (agency_id, report_id, metric_key, value, unit, provenance, confidence, conflict_group, user_confirmed) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'ig.views', 81560, null, 'screenshot', 'high', null, true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'ig.unique', 35217, null, 'screenshot', 'high', null, true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'ig.nonFol', 98.4, '%', 'screenshot', 'high', null, true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'ig.net', 49, null, 'screenshot', 'high', null, true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'ig.followers', 726, null, 'screenshot', 'high', null, true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'ig.growth', 7.4, '%', 'screenshot', 'high', null, true);

insert into public.campaigns (id, agency_id, report_id, platform_id, name, objective) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'meta', 'Thrishank – Messaging conversations', 'Messages');

insert into public.campaign_metrics (agency_id, campaign_id, metric_key, value, provenance, confidence, user_confirmed) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', 'spend', 8474.59, 'screenshot', 'high', true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', 'conv', 363, 'screenshot', 'high', true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', 'impr', 115004, 'screenshot', 'high', true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000f1', 'reach', 39030, 'screenshot', 'high', true);

-- Content published. Caption of the first piece is from the brief; the rest are sample.
insert into public.social_posts (id, agency_id, report_id, platform_id, published_on, post_type, theme, caption, tags, provenance, position) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'instagram', '2026-08-14', 'Reel', 'Product showcase', 'Serving straight perfection. Where precision engineering meets grand entrances. Every line aligned, every swing effortless.', '#Thrishank #PremiumDoors #LuxuryInteriors #DoorDesign', 'brief', 1),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'instagram', '2026-08-15', 'Post', 'Festival', 'Freedom is the foundation of every home. Wishing you a happy Independence Day from all of us at Thrishank.', '#IndependenceDay #Thrishank #HappyIndependenceDay', 'sample', 2),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'instagram', '2026-08-18', 'Post', 'Product showcase', 'Solid wood. Solid finish. Meet the entrance range built to last generations, with details you feel every time you open it.', '#SolidWood #Thrishank #EntranceDoors', 'sample', 3),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'instagram', '2026-08-20', 'Reel', 'Behind the scenes', 'Behind every door, a process. Watch a Thrishank door take shape from raw timber to finished edge.', '#BehindTheScenes #Craftsmanship #Thrishank', 'sample', 4),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'instagram', '2026-08-23', 'Post', 'Engagement', 'Which finish suits your entrance? Walnut, teak or matte black. Tell us in the comments.', '#DoorFinish #Thrishank #HomeDecor', 'sample', 5),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'instagram', '2026-08-26', 'Reel', 'Educational', 'Three hinges, zero compromise. See why hardware matters as much as the door itself.', '#DoorHardware #Thrishank #DidYouKnow', 'sample', 6),
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'instagram', '2026-08-30', 'Reel', 'Product showcase', 'Closing out the month with a close-up of the details you only notice when it is done right.', '#Thrishank #Detail #PremiumDoors', 'sample', 7);

insert into public.social_post_metrics (agency_id, post_id, metric_key, value, provenance, confidence, user_confirmed) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000101', 'views', 12900, 'brief', 'high', true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000101', 'reach', 9640, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000101', 'likes', 57, 'brief', 'high', true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000101', 'comments', 4, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000101', 'shares', 6, 'brief', 'high', true),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000101', 'saves', 11, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000102', 'views', 6240, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000102', 'reach', 5120, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000102', 'likes', 74, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000102', 'comments', 6, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000102', 'shares', 3, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000102', 'saves', 5, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000103', 'views', 4870, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000103', 'reach', 4010, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000103', 'likes', 41, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000103', 'comments', 2, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000103', 'shares', 2, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000103', 'saves', 9, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000104', 'views', 11430, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000104', 'reach', 8700, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000104', 'likes', 49, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000104', 'comments', 5, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000104', 'shares', 4, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000104', 'saves', 8, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000105', 'views', 3910, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000105', 'reach', 3300, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000105', 'likes', 36, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000105', 'comments', 11, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000105', 'shares', 1, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000105', 'saves', 3, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000106', 'views', 9860, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000106', 'reach', 7480, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000106', 'likes', 44, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000106', 'comments', 3, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000106', 'shares', 5, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000106', 'saves', 14, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000107', 'views', 8120, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000107', 'reach', 6230, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000107', 'likes', 38, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000107', 'comments', 2, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000107', 'shares', 2, 'sample', 'low', false),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000107', 'saves', 6, 'sample', 'low', false);

insert into public.report_versions (id, agency_id, report_id, version, label, content, created_at) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 1, 'Generated analysis', '{}', '2026-09-03 11:20+05:30');
update public.reports set current_version_id = '00000000-0000-4000-8000-0000000000d1' where id = '00000000-0000-4000-8000-0000000000e1';

insert into public.internal_notes (agency_id, report_id, body, author_name, created_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000e1', 'Client asked for more dealer-focused content next month. Do not include in the client report.', 'Mehul', '2026-09-02');
