-- Group Command Centre module toggles (Settings in the design). Group owners only (existing policy).
alter table public.family_groups add column disabled_modules text[] not null default '{}'
  check (disabled_modules <@ array['pipeline', 'meetings', 'automation', 'finance', 'rental', 'expenses', 'tax', 'team', 'reports', 'vault']::text[]);
