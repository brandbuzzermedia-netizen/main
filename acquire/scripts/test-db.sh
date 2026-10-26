#!/usr/bin/env bash
# Apply all migrations to a scratch PostgreSQL database and run the SQL test suite.
#
#   TEST_DATABASE_URL=postgres://postgres@localhost:54322/postgres scripts/test-db.sh
#
# The target database is DROPPED and recreated. Never point this at a real project.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a disposable PostgreSQL server (e.g. postgres://postgres@localhost:5432/postgres)}"
DB_NAME="acquire_test"
ADMIN_URL="$TEST_DATABASE_URL"
TEST_URL="$(python3 - "$TEST_DATABASE_URL" "$DB_NAME" <<'PY'
import sys
from urllib.parse import urlsplit, urlunsplit
u = urlsplit(sys.argv[1])
print(urlunsplit(u._replace(path="/" + sys.argv[2])))
PY
)"

psql "$ADMIN_URL" -qX -v ON_ERROR_STOP=1 -c "drop database if exists $DB_NAME with (force)" -c "create database $DB_NAME"

run() { psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 "$@"; }

run -f supabase/tests/supabase_shim.sql
for f in supabase/migrations/*.sql; do
  echo "migrate  $(basename "$f")"
  run -f "$f"
done

status=0
for f in supabase/tests/[0-9]*.sql; do
  if out="$(run -o /dev/null -f "$f" 2>&1)"; then
    echo "pass     $(basename "$f")"
    grep -E '^(NOTICE|psql:.*NOTICE)' <<<"$out" | sed 's/^/         /' || true
  else
    echo "FAIL     $(basename "$f")"
    sed 's/^/         /' <<<"$out"
    status=1
  fi
done
exit $status
