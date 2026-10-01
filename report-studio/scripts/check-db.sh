#!/usr/bin/env bash
# Applies the Supabase migration and seed to a throwaway local Postgres and
# runs the row-level security checks. Needs Postgres server binaries.
#   PG_BIN=/usr/lib/postgresql/16/bin scripts/check-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN=${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DIR=$(mktemp -d)
trap '"$PG_BIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
OWNER=$(id -un)
if [ "$OWNER" = root ]; then RUN=(runuser -u postgres --); chown postgres "$DIR"; else RUN=(); fi
"${RUN[@]}" "$PG_BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"${RUN[@]}" "$PG_BIN/pg_ctl" -D "$DIR/data" -o "-k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=(psql -h "$DIR" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/supabase-stubs.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f supabase/seed.sql
"${PSQL[@]}" -f supabase/tests/rls.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
echo "Migration, seed and RLS checks passed."
