-- 0002 — tenancy, roles and claim helpers.

create schema if not exists app;

create type app_role as enum ('ops_manager', 'sop_editor', 'team_lead', 'agent', 'auditor');

create table tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- Gate parameters, calibrated per tenant at onboarding. See design §4 and §11:
  -- these are starting points, not validated global constants.
  threshold  numeric(4,3) not null default 0.000,
  min_margin numeric(4,3) not null default 0.150,
  plan       text not null default 'standard',
  created_at timestamptz not null default now()
);

create table users (
  id           uuid primary key references auth.users(id) on delete cascade,
  tenant_id    uuid not null references tenants(id),
  display_name text not null,
  role         app_role not null,
  created_at   timestamptz not null default now()
);

create index users_tenant_idx on users (tenant_id);

create table device_registrations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id),
  user_id      uuid not null references users(id),
  platform     text not null check (platform in ('web', 'desktop', 'mobile')),
  public_key   text not null,
  status       text not null default 'active',
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (tenant_id, user_id, platform)
);

create index device_registrations_tenant_idx on device_registrations (tenant_id);

-- The tenant a request belongs to. Read from the signed JWT, which the auth
-- service issues; no policy trusts a client-supplied tenant id.
create or replace function app.current_tenant()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
$$;

-- The caller's role, likewise from the signed JWT.
create or replace function app.current_role()
returns app_role
language sql
stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'app_role', '')::app_role
$$;

-- The single database role every authenticated request runs as. Authorisation is
-- expressed in row-level security policies, which is what makes the matrix in
-- supabase/tests/rbac_matrix.sql testable as a matrix rather than as a hope.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;
