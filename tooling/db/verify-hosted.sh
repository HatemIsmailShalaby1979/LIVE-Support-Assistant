#!/usr/bin/env bash
#
# Hosted verification: run all four SQL suites against a real Supabase project.
#
# This is the check that matters, and it is not the same as verify-phase7.sh.
# That script proves the schema behaves correctly in a container running plain
# PostgreSQL, where we install our own `auth` shim and where `postgres` is a
# superuser. A hosted project has GoTrue's real `auth` schema, a `postgres` role
# that is not a superuser, platform-owned roles we did not create, and an event
# trigger that enables RLS on new public tables behind our back. Every one of
# those is an assumption the local run cannot check and this one can.
#
# Deliberately different from the local script in three ways:
#   1. It never drops or recreates the database. That is `supabase db push`'s
#      job, and on a hosted project it would be catastrophic.
#   2. It requires the session pooler, not the transaction pooler. The suites
#      set `role` and `request.jwt.claims` at session level; a transaction
#      pooler resets the session between transactions and every claim-based
#      probe would silently test the wrong thing.
#   3. The password never appears in a command line. It is read from the
#      environment or .env.local and handed to psql through a file.
#
# Usage:
#   SUPABASE_DB_PASSWORD=... bash tooling/db/verify-hosted.sh
#   # or put SUPABASE_DB_PASSWORD in .env.local (gitignored)
#
# Requirements: Docker (or a psql on PATH), `supabase link` already run, and
# migrations already applied with `supabase db push`.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

# ---------------------------------------------------------------- connection --

# The CLI maintains this after `supabase link` and it contains no password.
pooler_file="supabase/.temp/pooler-url"

if [ -f "$pooler_file" ]; then
  conn="$(cat "$pooler_file")"
else
  : "${POOLER_HOST:?run 'supabase link' first, or set POOLER_HOST}"
  : "${POOLER_PORT:=5432}"
  : "${POOLER_USER:?set POOLER_USER to postgres.<project-ref>}"
  conn="postgresql://${POOLER_USER}@${POOLER_HOST}:${POOLER_PORT}/postgres"
fi

host="$(printf '%s' "$conn" | sed -E 's#.*@([^/]+)/.*#\1#')"
user="$(printf '%s' "$conn" | sed -E 's#.*://([^@]*)@.*#\1#')"
port="${host##*:}"
host="${host%:*}"

if [ -z "${SUPABASE_DB_PASSWORD:-}" ] && [ -f .env.local ]; then
  SUPABASE_DB_PASSWORD="$(sed -n 's/^SUPABASE_DB_PASSWORD=//p' .env.local | head -n 1)"
fi

: "${SUPABASE_DB_PASSWORD:?set SUPABASE_DB_PASSWORD in the environment or .env.local. This script never accepts it as an argument, because arguments are visible to every process on the machine.}"

case "$port" in
  6543)
    echo "refusing to run: port 6543 is the transaction pooler." >&2
    echo "The suites set role and request.jwt.claims at session level, so they" >&2
    echo "need the session pooler. Point supabase link at session mode." >&2
    exit 2
    ;;
esac

echo "==> target: $user@$host:$port (session pooler)"

# --------------------------------------------------------------------- psql --

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

printf 'PGPASSWORD=%s\n' "$SUPABASE_DB_PASSWORD" > "$workdir/pg.env"
chmod 600 "$workdir/pg.env"

# docker needs a native path; Git Bash hands it a POSIX one otherwise.
native_path() {
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*) local d="${1%/*}"; printf '%s/%s' "$(cd "$d" && pwd -W)" "${1##*/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

if [ -n "${SOP_PSQL:-}" ] || command -v psql >/dev/null 2>&1; then
  psql_cmd() {
    local bin="${SOP_PSQL:-psql}"
    PGPASSWORD="$SUPABASE_DB_PASSWORD" "$bin" -h "$host" -p "$port" -U "$user" -d postgres "$@"
  }
  echo "==> using psql on PATH"
else
  psql_cmd() {
    docker run --rm -i --env-file "$(native_path "$workdir/pg.env")" postgres:17-alpine \
      psql -h "$host" -p "$port" -U "$user" -d postgres "$@"
  }
  echo "==> using postgres:17-alpine in Docker"
fi

# ----------------------------------------------------------------- fixtures --

# The suites are written against fixtures: two tenants, seven principals, and
# rows to isolate. Applying them is not optional — an earlier run of this script
# skipped the seed and 12 probes failed on missing rows, which looked like
# schema damage and was not.
#
# The principals themselves come from the Auth Admin API, because hosted cannot
# choose their UUIDs. provisioning writes the mapping; this script injects it
# into both the seed and the suites.
fixture_env="supabase/.temp/fixture-uuids.env"

if [ ! -f "$fixture_env" ]; then
  echo "==> provisioning the fixture principals"
  node tooling/db/provision-hosted-fixtures.mjs
fi

declare -a fixture_args=()
while IFS='=' read -r name value; do
  [ -n "$name" ] || continue
  fixture_args+=(-v "${name}=${value}")
done < "$fixture_env"

if [ ${#fixture_args[@]} -eq 0 ]; then
  echo "no principal UUIDs in $fixture_env" >&2
  exit 2
fi

echo "==> seeding fixtures (auth.users skipped: GoTrue owns them here)"
set +e
seed_output="$(psql_cmd "${fixture_args[@]}" -v skip_auth_users=1 -f - < supabase/seed/0001_fixtures.sql 2>&1)"
seed_status=$?
set -e

if [ $seed_status -ne 0 ]; then
  echo "$seed_output" >&2
  echo "seeding failed; the suites would report fixture failures that are not schema failures" >&2
  exit 1
fi
printf '%s\n' "$seed_output" | grep -E 'ERROR' && {
  echo "seeding reported errors" >&2
  exit 1
}
echo "    done"

# ------------------------------------------------------------------- suites --

status=0
declare -a names=()
declare -a verdicts=()
declare -a outcomes=()

run_suite() {
  local file="$1"
  local verdict="$2"

  echo ""
  echo "==> re-seeding before $file"
  psql_cmd "${fixture_args[@]}" -v skip_auth_users=1 -q -f - \
    < supabase/seed/0001_fixtures.sql >/dev/null 2>&1

  echo "==> running $file"

  set +e
  output="$(psql_cmd "${fixture_args[@]}" -f - < "$file" 2>&1)"
  suite_status=$?
  set -e

  # On success, a summary is enough. On failure, print EVERYTHING.
  #
  # An earlier version of this script grepped the output for a few keywords to
  # keep it short, and the grep was case-sensitive — so it silently dropped every
  # probe result row and the uppercase "FAILED" verdict, and reported three
  # suites as having reported no verdict when they had in fact reported 12
  # failures. A filter that hides failures is worse than no filter, because it
  # makes a real problem look like a missing line.
  if [ $suite_status -eq 0 ] && printf '%s' "$output" | grep -q "$verdict"; then
    printf '%s\n' "$output" | grep -E '^===|passed +\||OK' | head -30
  else
    printf '%s\n' "$output"
  fi

  names+=("$file")
  verdicts+=("$verdict")

  if [ $suite_status -ne 0 ]; then
    echo "$file: psql exited with status $suite_status" >&2
    outcomes+=("psql exit $suite_status")
    status=1
    return
  fi

  if ! printf '%s' "$output" | grep -q "$verdict"; then
    echo "$file DID NOT REPORT '$verdict'" >&2
    outcomes+=("no verdict line")
    status=1
    return
  fi

  outcomes+=("OK")
}

run_suite supabase/tests/rbac_matrix.sql      "RBAC MATRIX OK"
run_suite supabase/tests/phase5_telemetry.sql "PHASE5 OK"
run_suite supabase/tests/rls_bypass.sql       "RLS BYPASS SUITE OK"
run_suite supabase/tests/phase8_retention.sql  "RETENTION SUITE OK"

# ------------------------------------------------------------------ cleanup --

# The suites create probe helpers in `public`, and they must not survive the run.
#
# `rbac_probe` and its siblings execute a SQL string supplied by their caller
# (`execute p_sql`) after setting the role themselves, so a function left behind
# in a hosted `public` schema is reachable through PostgREST by anyone holding
# the anon key: Supabase's default privileges grant EXECUTE on new functions in
# `public`, which would let an unauthenticated caller run SQL as
# `authenticated`. The container run never had to care because the whole database
# was dropped afterwards. On a hosted project, dropping is our job.
#
# Pass --keep to leave the artefacts in place for debugging. Do that on a
# throwaway project, never on one holding data.
keep=0
if [ "${1:-}" = "--keep" ]; then
  keep=1
fi

cleanup() {
  if [ $keep -eq 1 ]; then
    echo ""
    echo "--keep given: leaving probe functions and result tables in place."
    return
  fi

  echo ""
  echo "==> removing probe functions and result tables"

  set +e
  psql_cmd -q -c "
    drop function if exists public.rbac_claims(app_role);
    drop function if exists public.rbac_probe(text, app_role, uuid, uuid, text, text, text, text);
    drop function if exists public.rbac_probe_read(text, app_role, uuid, uuid, text, text);
    drop function if exists public.p5_claims(app_role, uuid, uuid);
    drop function if exists public.p5_probe(text, app_role, uuid, uuid, text, text, text, text);
    drop function if exists public.p5_read(text, app_role, uuid, uuid, text, text);
    drop function if exists public.b_claims(app_role, uuid, uuid);
    drop function if exists public.b_no_claims();
    drop function if exists public.b_probe(text, app_role, uuid, uuid, text, text, text, text);
    drop function if exists public.b_read(text, app_role, uuid, uuid, text, text);
    drop function if exists public.b_anon_read(text, text, text);
    drop function if exists public.r_expect(text, text, text, text, boolean);
    drop function if exists public.r_claims(text, uuid, uuid);
    drop function if exists public.r_denied(text, text);
    drop function if exists public.r_seed();
    drop table if exists public.rbac_results;
    drop table if exists public.phase5_results;
    drop table if exists public.bypass_results;
    drop table if exists public.retention_results;
  " >/dev/null 2>&1
  cleanup_status=$?
  set -e

  if [ $cleanup_status -eq 0 ]; then
    echo "    done"
  else
    # Overloaded signatures are the likely cause; report it rather than hide it,
    # because a surviving rbac_probe is a live exposure, not a cosmetic issue.
    echo "    WARNING: cleanup did not complete cleanly." >&2
    echo "    A surviving public.rbac_probe accepts caller-supplied SQL. Check" >&2
    echo "    for it and drop it by hand before this project holds data:" >&2
    echo "      select p.oid::regprocedure from pg_proc p" >&2
    echo "        join pg_namespace n on n.oid = p.pronamespace" >&2
    echo "       where n.nspname = 'public' and p.proname in" >&2
    echo "             ('rbac_probe','p5_probe','b_probe');" >&2
  fi
}

cleanup

# ------------------------------------------------------------------- verdict --

echo ""
echo "hosted verification summary"
for i in "${!names[@]}"; do
  printf '  %-8s %s (expected "%s")\n' "${outcomes[$i]}" "${names[$i]}" "${verdicts[$i]}"
done

if [ $status -ne 0 ]; then
  echo ""
  echo "Hosted verification FAILED. Read each failure before assuming the schema" >&2
  echo "is wrong: a hosted project also differs in roles, ownership and the" >&2
  echo "platform's own auth schema, and a probe can fail for those reasons." >&2
  exit 1
fi

echo ""
echo "Hosted verification complete: all four suites reported OK on the real project."
