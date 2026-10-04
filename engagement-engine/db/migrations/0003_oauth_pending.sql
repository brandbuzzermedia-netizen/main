-- After OAuth, the accounts a login can reach are held (encrypted, bound to the state) until
-- the user picks which ones belong to this client. Nothing is attached automatically.
alter table oauth_states add column pending_accounts_enc text;
alter table oauth_states add column consumed_at timestamptz;
