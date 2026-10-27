-- New timeline kinds for the built-in CRM. Kept in their own migration because a new enum
-- value cannot be used in the same transaction that adds it.
alter type public.activity_kind add value if not exists 'whatsapp';
alter type public.activity_kind add value if not exists 'meeting';
alter type public.activity_kind add value if not exists 'deal';
alter type public.activity_kind add value if not exists 'task';
