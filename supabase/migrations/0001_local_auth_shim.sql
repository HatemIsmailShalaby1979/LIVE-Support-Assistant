-- 0001 — local auth shim.
--
-- Supabase ships an `auth` schema with `auth.users` and the `auth.jwt()` /
-- `auth.uid()` helpers. This file reproduces exactly the parts our policies read,
-- so the same policy text can be exercised against a plain PostgreSQL in CI or
-- on a laptop. It is NOT applied to a real Supabase project: there, these
-- objects already exist and are owned by the platform.

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key,
  email text unique
);

-- Reads the claims the API layer attaches to the current request. Supabase reads
-- the same `request.jwt.claims` setting, so a policy that works here works there.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
