-- Internal helper functions in the app schema must not be callable by anonymous or ordinary
-- roles directly. Migrations 17, 18 and 20 added some without revoking the default PUBLIC
-- execute grant. (The app schema is not exposed through the API, so this closes a gap rather
-- than an open hole.) Future app functions start locked too.
revoke execute on all functions in schema app from public, anon;
alter default privileges in schema app revoke execute on functions from public, anon;
-- Policies and triggers call these as the signed-in user, so authenticated keeps execute.
grant execute on all functions in schema app to authenticated, service_role;
