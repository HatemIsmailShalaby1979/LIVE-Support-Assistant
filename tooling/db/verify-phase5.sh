#!/usr/bin/env bash
#
# Phase 5 verification.
#
# Brings up a throwaway PostgreSQL, applies the migrations (0001..0010), seeds
# fixtures and runs the Phase 5 telemetry + escalation-ingest matrix. Everything
# is exercised against a real server: idempotent ingest, evidence persistence,
# the write-time integrity trigger, and the operations dashboard views.
#
# The database is dropped and recreated on every run, so the result is
# reproducible from an empty cluster and cannot pass because of leftover state.
#
# Usage:
#   bash tooling/db/verify-phase5.sh
#
# Requirements: Docker, running. No local PostgreSQL client is needed.

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

echo "==> running the Phase 5 matrix"
set +e
output="$(docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -f - < supabase/tests/phase5_telemetry.sql 2>&1)"
status=$?
set -e

echo "$output"

if [ $status -ne 0 ]; then
  echo "psql exited with status $status" >&2
  exit "$status"
fi

if ! printf '%s' "$output" | grep -q 'PHASE5 OK'; then
  echo "PHASE5 DID NOT REPORT OK" >&2
  exit 1
fi

echo ""
echo "Phase 5 verification complete."
