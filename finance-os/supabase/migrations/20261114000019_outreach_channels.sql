-- Outreach channels: Facebook and Instagram messages can be logged next to email, WhatsApp,
-- LinkedIn and calls. Widens one check constraint; no data changes.
alter table public.outreach_events drop constraint if exists outreach_events_kind_check;
alter table public.outreach_events add constraint outreach_events_kind_check
  check (kind in ('call', 'email', 'whatsapp', 'linkedin', 'facebook', 'instagram', 'reply', 'bounce', 'unsubscribe', 'note'));
