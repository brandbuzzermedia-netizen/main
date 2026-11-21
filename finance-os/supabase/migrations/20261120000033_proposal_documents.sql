-- Branded proposal documents (Get Bee Seen format): the drafted content, the research behind it and the client's website.
alter table public.proposals add column doc jsonb check (doc is null or (jsonb_typeof(doc) = 'object' and pg_column_size(doc) <= 200000));
alter table public.proposals add column research jsonb check (research is null or (jsonb_typeof(research) = 'object' and pg_column_size(research) <= 100000));
alter table public.proposals add column website text check (website is null or (website ~ '^https?://' and length(website) <= 300));
