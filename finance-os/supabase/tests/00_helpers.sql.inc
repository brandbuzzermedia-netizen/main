-- Included by each test file (psql \ir). Test helpers live in pg_temp and vanish with the session.
create or replace function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  reset role;
end $$;

create or replace function pg_temp.assert(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'ASSERTION FAILED: %', p_msg; end if;
end $$;

-- Runs p_sql and asserts it raises (optionally with a message fragment).
create or replace function pg_temp.assert_raises(p_sql text, p_fragment text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_fragment is not null and position(lower(p_fragment) in lower(sqlerrm)) = 0 then
      raise exception 'ASSERTION FAILED: % (raised "%" instead of "%")', p_msg, sqlerrm, p_fragment;
    end if;
    return;
  end;
  raise exception 'ASSERTION FAILED: % (statement succeeded)', p_msg;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'founder@gbs.test'),
  ('00000000-0000-0000-0000-00000000000b', 'other-agency@gbs.test'),
  ('00000000-0000-0000-0000-00000000000c', 'viewer@gbs.test'),
  ('00000000-0000-0000-0000-00000000000d', 'am@gbs.test');
