-- Field Sales -> Pipeline: as a field lead progresses, its deal moves along the company's own pipeline.
--   Demo shown -> a "meeting" stage, Interested -> "proposal" (or the nearest later stage the company has),
--   Advance paid / Delivered / Final paid -> Won, Lost -> Lost (with the reason). Deals never move backwards.
-- Also fixes the outreach automation trigger so it fires when the lead status is changed by another trigger
-- (a column-specific UPDATE OF trigger does not fire for changes made inside a BEFORE trigger).

drop trigger if exists contacts_outreach_status on public.contacts;
create trigger contacts_outreach_status after update on public.contacts
  for each row when (new.lead_status is distinct from old.lead_status) execute function app.outreach_status_change();

create or replace function app.field_pipeline() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rank constant text[] := array['open', 'meeting', 'proposal', 'negotiation', 'won'];
  chain text[]; target text; v_deal uuid; v_stage uuid; v_cur text; k text;
begin
  if new.field_status is not distinct from old.field_status or new.field_status is null then return new; end if;
  chain := case new.field_status
    when 'demo_shown' then array['meeting', 'open']
    when 'interested' then array['proposal', 'negotiation', 'meeting', 'open']
    when 'advance_paid' then array['won'] when 'delivered' then array['won'] when 'final_paid' then array['won']
    when 'lost' then array['lost'] else null end;
  if chain is null then return new; end if;
  begin
    foreach k in array chain loop
      select id into v_stage from public.pipeline_stages where organization_id = new.organization_id and kind = k order by position limit 1;
      if v_stage is not null then target := k; exit; end if;
    end loop;
    if v_stage is null then return new; end if;
    -- Re-read: the outreach automation may have created the deal earlier in this same update.
    select auto_deal_id into v_deal from public.contacts where id = new.id;
    if v_deal is null then
      if target = 'lost' then return new; end if;
      insert into public.deals (organization_id, title, account_name, stage_id, owner_id, contact_id, source, next_action, next_action_on, created_by)
      values (new.organization_id, left(coalesce(nullif(trim(new.company_name), ''), new.full_name) || ' · field', 200), new.company_name, v_stage,
              app.member_or_null(new.organization_id, new.owner_id), new.id, left(coalesce(new.source, 'Field sales'), 80),
              case when target = 'won' then 'Hand over to delivery' else 'Follow up after the visit' end, new.next_follow_up_on, null)
      returning id into v_deal;
      update public.contacts set auto_deal_id = v_deal where id = new.id;
    else
      select s.kind into v_cur from public.deals d join public.pipeline_stages s on s.id = d.stage_id where d.id = v_deal;
      if target = 'lost' or v_cur = 'lost' or coalesce(array_position(rank, target), 0) > coalesce(array_position(rank, v_cur), 0) then
        update public.deals set stage_id = v_stage,
          lost_reason = case when target = 'lost' then coalesce(new.lost_reason, lost_reason) else lost_reason end,
          next_action_on = coalesce(new.next_follow_up_on, next_action_on)
        where id = v_deal;
      end if;
    end if;
    -- The delivery task made at Advance paid belongs to this deal.
    update public.tasks t set deal_id = v_deal from public.delivery_handoffs h
      where h.contact_id = new.id and t.id = h.task_id and t.deal_id is null;
  exception when others then raise warning 'field pipeline sync skipped: %', sqlerrm;
  end;
  return new;
end $$;
-- Named to run after contacts_outreach_status (triggers fire in name order).
create trigger contacts_zz_field_pipeline after update of field_status on public.contacts
  for each row execute function app.field_pipeline();

revoke execute on all functions in schema app from public, anon;
