#!/usr/bin/env bash
# Runs migrations + seed + all SQL tests against a scratch database on a
# plain PostgreSQL server (no Supabase stack needed).
#
#   ./supabase/tests/run.sh            # uses local postgres via sudo -u postgres
#   PSQL="psql -h localhost -U me" ./supabase/tests/run.sh
set -euo pipefail
shopt -s nullglob

cd "$(dirname "$0")/../.."

DB_NAME="${DB_NAME:-family_timeline_test}"
PSQL="${PSQL:-sudo -u postgres psql}"

$PSQL -v ON_ERROR_STOP=1 -qc "drop database if exists ${DB_NAME};"
$PSQL -v ON_ERROR_STOP=1 -qc "create database ${DB_NAME};"

run() {
  echo "==> $1"
  $PSQL -v ON_ERROR_STOP=1 -q -d "$DB_NAME" -f "$1"
}

run supabase/tests/harness/00_supabase_shim.sql

for f in supabase/migrations/*.sql; do
  run "$f"
done

run supabase/seed.sql

for f in supabase/tests/*.test.sql; do
  run "$f"
done

echo "ALL TESTS PASSED"
