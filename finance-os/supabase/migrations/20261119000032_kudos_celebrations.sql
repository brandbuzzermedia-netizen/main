-- Congratulations between teammates (kudos) and one-time celebrations of new achievements.
alter table public.activity_feed add column target_id uuid references public.users (id) on delete cascade;
alter table public.activity_feed drop constraint if exists activity_feed_kind_check;
alter table public.activity_feed add constraint activity_feed_kind_check check (kind in ('deal_created', 'deal_won', 'proposal_sent', 'proposal_accepted',
  'meeting_booked', 'task_done', 'positive_reply', 'payment_received', 'member_joined', 'kudos'));
create index on public.activity_feed (target_id, created_at desc) where target_id is not null;

-- Which celebrations a person has already seen (e.g. "2026-11:hat", "kudos:<id>"); the last 300 are kept.
alter table public.activity_seen add column celebrated text[] not null default '{}';

-- Any member congratulates a teammate. Shown to the whole team; the teammate gets a celebration.
create or replace function public.give_kudos(p_org uuid, p_to uuid, p_message text)
returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid; v_name text; v_msg text := nullif(left(trim(coalesce(p_message, '')), 140), '');
begin
  if auth.uid() is null or not app.has_permission(p_org, 'company.view') then
    raise exception 'Not a member of this company' using errcode = 'insufficient_privilege';
  end if;
  if p_to = auth.uid() then raise exception 'You cannot congratulate yourself' using errcode = 'check_violation'; end if;
  if not exists (select 1 from public.memberships where organization_id = p_org and user_id = p_to) then
    raise exception 'That person is not in this company' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.activity_feed where kind = 'kudos' and actor_id = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'That is a lot of congratulations for one day. Try again tomorrow.' using errcode = 'check_violation';
  end if;
  select coalesce(full_name, split_part(email, '@', 1)) into v_name from public.users where id = p_to;
  insert into public.activity_feed (organization_id, actor_id, target_id, kind, scope, title)
  values (p_org, auth.uid(), p_to, 'kudos', 'team', left('congratulated ' || coalesce(v_name, 'a teammate') || coalesce(': "' || v_msg || '"', ''), 300))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.give_kudos(uuid, uuid, text) from public, anon;
grant execute on function public.give_kudos(uuid, uuid, text) to authenticated;
