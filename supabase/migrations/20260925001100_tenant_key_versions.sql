-- 0011 — tenant key versions: the audit record for key rotation.
--
-- Phase 7. Rotation itself happens in the sync server (packages/sync,
-- `rotateTenantKeys`): PostgreSQL has no Ed25519 or X25519 in pgcrypto, so the
-- database never generates or holds private key material. What the database
-- owns is the ledger — which key generation existed, when it was replaced, and
-- therefore exactly which bundles a revoked device could still read. An audit
-- trail a regulator can read is worth more here than key bytes in a column.
--
-- Versions are per (tenant, kind) and monotonic, like bundle versions.
--
-- Revocation is a timestamp, set only through `app.revoke_tenant_key`, because
-- the table is append-only by privilege: no UPDATE grant exists, so a careless
-- future migration cannot make rows editable.

create table tenant_key_versions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  kind       text not null check (kind in ('signing', 'wrapping')),
  version    integer not null,
  -- Public material only. Private keys never reach this schema.
  public_key text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_id, kind, version)
);

create index tenant_key_versions_tenant_idx
  on tenant_key_versions (tenant_id, kind, version desc);

alter table tenant_key_versions enable row level security;

create policy tenant_key_versions_select on tenant_key_versions
  for select to authenticated
  using (tenant_id = app.current_tenant());

create policy tenant_key_versions_insert on tenant_key_versions
  for insert to authenticated
  with check (
    tenant_id = app.current_tenant()
    and app.current_role() = 'ops_manager'
  );

revoke all on tenant_key_versions from authenticated;
grant select, insert on tenant_key_versions to authenticated;

create or replace function app.revoke_tenant_key(
  p_tenant_id uuid,
  p_kind      text,
  p_version   integer
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if app.current_tenant() is null
     or p_tenant_id <> app.current_tenant()
     or app.current_role() <> 'ops_manager' then
    raise exception 'only the tenant''s ops manager may revoke a key version'
      using errcode = 'insufficient_privilege';
  end if;

  if p_kind not in ('signing', 'wrapping') then
    raise exception 'unknown key kind %', p_kind
      using errcode = 'check_violation';
  end if;

  update tenant_key_versions
     set revoked_at = now()
   where tenant_id = p_tenant_id
     and kind = p_kind
     and version = p_version
     and revoked_at is null;

  if not found then
    raise exception 'no active % key version % for tenant', p_kind, p_version
      using errcode = 'no_data_found';
  end if;
end;
$$;

grant execute on function app.revoke_tenant_key(uuid, text, integer) to authenticated;
