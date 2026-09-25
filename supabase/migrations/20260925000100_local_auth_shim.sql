-- 0001 — local auth shim, installed only where the platform has none.
--
-- Supabase ships an `auth` schema with `auth.users` and the `auth.jwt()` /
-- `auth.uid()` helpers. This file reproduces exactly the parts our policies
-- read, so the same policy text can be exercised against a plain PostgreSQL in
-- CI or on a laptop.
--
-- On a real Supabase project those objects already exist and are owned by the
-- platform, and this file installs nothing: the guards below check for each
-- object first. That guard is not a convenience. An earlier version used a bare
-- `create or replace function auth.jwt()`, which on a hosted project would have
-- replaced GoTrue's own function — breaking PostgREST, realtime, and every RLS
-- policy that calls `auth.uid()` across the entire project. The local shim and
-- the platform's real implementation must never be confused for each other.
--
-- One migration history, two environments: safe to push to a laptop and to a
-- hosted project without a separate branch.

create schema if not exists auth;

-- On a hosted project `auth.users` already exists and `postgres` has no CREATE on
-- the `auth` schema at all. `create table if not exists` still demands that
-- privilege even when the table is already there, so the existence check has to
-- happen before the statement is attempted — not in the same breath as it. This
-- is not hypothetical: pushing the unguarded version to a real project failed
-- with `permission denied for schema auth (SQLSTATE 42501)`.
do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users' and c.relkind = 'r'
  ) then
    create table auth.users (
      id    uuid primary key,
      email text unique
    );
  end if;
end;
$$;

-- Reads the claims the API layer attaches to the current request. Supabase
-- reads the same `request.jwt.claims` setting, so a policy written against this
-- body behaves identically against the platform's own implementation.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'jwt' and p.pronargs = 0
  ) then
    execute $fn$
      create function auth.jwt()
      returns jsonb
      language sql
      stable
      as $body$
        select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      $body$
    $fn$;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid' and p.pronargs = 0
  ) then
    execute $fn$
      create function auth.uid()
      returns uuid
      language sql
      stable
      as $body$
        select nullif(auth.jwt() ->> 'sub', '')::uuid
      $body$
    $fn$;
  end if;
end;
$$;
