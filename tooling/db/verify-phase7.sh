#!/usr/bin/env bash
#
# Phase 7 verification.
#
# Brings up a throwaway PostgreSQL, applies ALL migrations, seeds fixtures, and
# runs every database suite in one session:
#
#   1. rbac_matrix.sql       — the privilege matrix (99 probes)
#   2. phase5_telemetry.sql  — ingest contracts + dashboards (17 probes)
#   3. rls_bypass.sql        — the attack suite (40 probes)
#   4. phase8_retention.sql  — retention removes expired data, redacts escalations, stays closed
#
# The database is dropped and recreated on every run, so the result is
# reproducible from an empty cluster and cannot pass because of leftover state.
#
# Usage:
#   bash tooling/db/verify-phase7.sh

set -euo pipefail

CONTAINER="${CONTAINER:-sop-pg-test}"
IMAGE="${IMAGE:-postgres:17-alpine}"
PORT="${PORT:-55432}"
DB="${DB:-sop}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

echo "==> ensuring container '$CONTAINER'"
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB="$DB" \
    -p "${PORT}:5432" \
    "$IMAGE" >/dev/null
  echo "    created from $IMAGE"
else
  docker start "$CONTAINER" >/dev/null 2>&1 || true
  echo "    reusing existing container"
fi

echo "==> waiting for the server to accept connections"
ready="no"
for attempt in $(seq 1 60); do
  if docker exec "$CONTAINER" psql -U postgres -d postgres -c 'select 1' >/dev/null 2>&1; then
    echo "    ready after ${attempt} attempt(s)"
    ready="yes"
    break
  fi
  sleep 2
done

if [ "$ready" != "yes" ]; then
  echo "    server did not become ready" >&2
  exit 1
fi

echo "==> recreating database '$DB' from empty"
docker exec "$CONTAINER" psql -U postgres -d postgres -q \
  -c "drop database if exists $DB with (force)" \
  -c "create database $DB"

echo "==> applying migrations"
for file in supabase/migrations/*.sql; do
  docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f - < "$file"
  echo "    $(basename "$file")"
done

echo "==> seeding fixtures"
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f - \
  < supabase/seed/0001_fixtures.sql
echo "    applied"

status=0

run_suite() {
  local file="$1"
  local verdict="$2"
  echo ""
  echo "==> running $file"
  set +e
  output="$(docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -f - < "$file" 2>&1)"
  suite_status=$?
  set -e

  printf '%s\n' "$output" | awk '/=== .* ===/{show=1} show' | head -40

  if [ $suite_status -ne 0 ]; then
    echo "psql exited with status $suite_status for $file" >&2
    status=1
    return
  fi

  if ! printf '%s' "$output" | grep -q "$verdict"; then
    echo "$file DID NOT REPORT '$verdict'" >&2
    status=1
  fi
}

run_suite supabase/tests/rbac_matrix.sql      "RBAC MATRIX OK"
run_suite supabase/tests/phase5_telemetry.sql "PHASE5 OK"
run_suite supabase/tests/rls_bypass.sql       "RLS BYPASS SUITE OK"
run_suite supabase/tests/phase8_retention.sql  "RETENTION SUITE OK"

if [ $status -ne 0 ]; then
  echo ""
  echo "Phase 7 verification FAILED." >&2
  exit 1
fi

echo ""
echo "Phase 7 verification complete: all four suites reported OK."
