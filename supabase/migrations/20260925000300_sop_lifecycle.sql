-- 0003 — SOP lifecycle and policy bundles.

create table sops (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id),
  title      text not null,
  status     text not null default 'draft'
             check (status in ('draft', 'in_review', 'published', 'retired')),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index sops_tenant_idx on sops (tenant_id);

create table sop_versions (
  id              uuid primary key default gen_random_uuid(),
  sop_id          uuid not null references sops(id) on delete cascade,
  tenant_id       uuid not null references tenants(id),
  version         integer not null,
  -- The server never holds plaintext procedure content. See design §3.
  body_ciphertext bytea not null,
  body_hash       text not null,
  change_note     text,
  created_by      uuid not null references users(id),
  created_at      timestamptz not null default now(),
  unique (sop_id, version)
);

create index sop_versions_tenant_idx on sop_versions (tenant_id);

create table policy_bundles (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id),
  bundle_version     bigint not null,
  manifest_hash      text not null,
  signature          text not null,
  model_id           text not null,
  model_revision     text not null,
  quantization       text not null,
  payload_ciphertext bytea not null,
  published_at       timestamptz not null default now(),
  published_by       uuid not null references users(id),
  unique (tenant_id, bundle_version)
);

create table device_bundle_acks (
  device_id      uuid not null references device_registrations(id),
  tenant_id      uuid not null references tenants(id),
  bundle_version bigint not null,
  installed_at   timestamptz not null default now(),
  primary key (device_id, bundle_version)
);

create index device_bundle_acks_tenant_idx on device_bundle_acks (tenant_id);

-- Bundle versions are monotonic and gap-free per tenant. A client that receives
-- version 7 when it holds 5 must be able to conclude that it missed one; without
-- this guarantee a stale client cannot distinguish "nothing changed" from "the
-- sync is broken", and the fleet-currency dashboard reports fiction.
create or replace function app.enforce_monotonic_bundle_version()
returns trigger
language plpgsql
as $$
declare
  v_max bigint;
begin
  select coalesce(max(bundle_version), 0)
    into v_max
    from policy_bundles
   where tenant_id = new.tenant_id;

  if new.bundle_version <> v_max + 1 then
    raise exception 'bundle_version must be exactly % for this tenant, got %',
      v_max + 1, new.bundle_version
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger policy_bundles_monotonic
before insert on policy_bundles
for each row execute function app.enforce_monotonic_bundle_version();
