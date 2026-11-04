-- Per-user email preference, and an outbox marker on notifications so the worker can
-- email each one at most once (claimed with FOR UPDATE SKIP LOCKED).
alter table users add column email_notifications boolean not null default true;
grant select (email_notifications) on users to gbs_app;

alter table notifications add column emailed_at timestamptz;
alter table notifications add column email_status text check (email_status in ('sent','skipped','failed'));
create index notifications_email_outbox_idx on notifications (created_at) where email_status is null;
