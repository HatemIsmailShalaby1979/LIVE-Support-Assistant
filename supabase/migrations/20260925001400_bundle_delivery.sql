-- 0014 — make a published bundle deliverable.
--
-- Two things were missing, and both were found by trying to fetch a bundle
-- rather than by reading the schema. That is the only reason this file exists,
-- and it is worth saying why the gap survived: the sync package's server half
-- is complete and tested, and the database half is tested, and nothing had ever
-- asked a device to actually install a bundle it was given.
--
-- 1. There was nowhere to put a per-device wrapped content key.
--    `publishBundle` wraps the content key to every enrolled device's public key
--    and returns a Map<deviceId, key>. `app.publish_policy_bundle` had no
--    parameter for it and `policy_bundles` had no column, so a published bundle
--    was a thing no device could ever decrypt. A bundle with no device keys is
--    not a slow feature; it is a dead one.
--
-- 2. The signed manifest was not reconstructible.
--    The signature covers the canonical JSON of the whole manifest, which
--    includes dimensions, iv, sopCount and publishedAt. Only manifest_hash was
--    stored, so a client could fetch a ciphertext and a signature but could not
--    rebuild the bytes the signature was made over. It would have had to trust
--    the server to tell it what those fields were — the exact dependency the
--    signature exists to remove.
--
-- So the manifest is stored, whole, as jsonb, and the client is handed the same
-- document the signature was computed over. The columns that already existed are
-- kept and checked against it, because a column and a JSON field that disagree
-- is a bundle that verifies one way and is indexed another.

-- ----------------------------------------------------------------- manifest --

-- Nullable, and deliberately so. A row with no manifest cannot be fetched by a
-- device and cannot be installed, so it is not a delivery path — but the RBAC
-- matrix inserts bare rows to prove the monotonic version guard independently of
-- the delivery path, and forcing a signed manifest on those would be testing the
-- wrong thing. The constraint below applies whenever a manifest IS present, and
-- `bundle_for_device` refuses anything without one, so the two together mean a
-- device can never be handed a signature with nothing to verify.
alter table policy_bundles
  add column manifest jsonb;

-- When a manifest is present it must agree with the columns that index and
-- filter the bundle. Without this a publisher could store one manifest and sign
-- another, and the columns would be the ones every query trusted.
--
-- The `is not null` on each field is what keeps the check from being vacuously
-- true: a CHECK passes on NULL, so a partially populated manifest would satisfy
-- an `=` comparison against NULL and the whole constraint would do nothing.
alter table policy_bundles
  add constraint policy_bundles_manifest_agrees_with_columns check (
    manifest is null or (
      manifest ->> 'tenantId'        is not null
      and manifest ->> 'tenantId'     = tenant_id::text
      and (manifest ->> 'bundleVersion') is not null
      and (manifest ->> 'bundleVersion')::bigint = bundle_version
      and manifest ->> 'modelId'        is not null
      and manifest ->> 'modelId'        = model_id
      and manifest ->> 'modelRevision'  is not null
      and manifest ->> 'modelRevision'  = model_revision
      and manifest ->> 'quantization'   is not null
      and manifest ->> 'quantization'   = quantization
      and manifest ->> 'payloadHash'    is not null
      and manifest ->> 'payloadHash'    = manifest_hash
      and jsonb_typeof(manifest -> 'dimensions') = 'number'
      and manifest ->> 'iv'          is not null
      and jsonb_typeof(manifest -> 'sopCount')    = 'number'
      and manifest ->> 'publishedAt' is not null
    )
  );

-- ------------------------------------------------------ per-device wrapped keys --

-- One row per device per bundle. A device that enrols after a bundle is
-- published gets no row for it, which is correct: bundleForDevice refuses, and
-- the device receives the next bundle. That is the documented behaviour in
-- packages/sync/src/server.ts, and this table is what makes it true.
create table policy_bundle_device_keys (
  tenant_id      uuid   not null references tenants(id) on delete cascade,
  bundle_version bigint not null,
  device_id      uuid   not null references device_registrations(id) on delete cascade,
  wrapped_key    bytea  not null,
  primary key (tenant_id, bundle_version, device_id)
);

create index policy_bundle_device_keys_device_idx
  on policy_bundle_device_keys (device_id, bundle_version desc);

alter table policy_bundle_device_keys enable row level security;

-- Read-only from the database side. A wrapped key is written exactly once, by the
-- publish path, and is never updated: re-wrapping under the same version would
-- mean two different keys for one bundle, and the client has no way to tell
-- which one it was promised.
create policy policy_bundle_device_keys_select on policy_bundle_device_keys
  for select to authenticated
  using (tenant_id = app.current_tenant());

-- Read-only from the database side, with exactly one exception: the publish path
-- writes a wrapped key once, and only for the same role that may publish a
-- bundle in the first place.
--
-- The insert is restricted rather than granted to authenticated, and the
-- function that performs it stays SECURITY INVOKER so row-level security is still
-- what decides who may publish. Making the function SECURITY DEFINER instead
-- would have been the easy way to get the insert to work, and it would also have
-- meant an editor could publish: the whole reason 0008 chose INVOKER is that RLS
-- is the authority here, not a check inside the function body.
--
-- A wrapped key is never updated, only inserted, and only for a device the
-- function has already checked belongs to the tenant. An ops_manager could in
-- principle write one of these rows directly, but that role can already publish
-- a bundle for its own tenant, and `bundle_for_device` only ever serves the
-- caller's own tenant — so this is not a wider capability than the role has.
create policy policy_bundle_device_keys_publish on policy_bundle_device_keys
  for insert to authenticated
  with check (
    tenant_id = app.current_tenant()
    and app.current_role() = 'ops_manager'
  );

revoke all on policy_bundle_device_keys from authenticated;
grant select, insert on policy_bundle_device_keys to authenticated;

-- --------------------------------------------------------------- publishing --

-- Replaces app.publish_policy_bundle, which could not store a device key and is
-- therefore not replaced but removed: leaving it in place would leave a function
-- that produces bundles nobody can install.
drop function if exists app.publish_policy_bundle(uuid, text, text, text, text, text, bytea, uuid);

create or replace function app.publish_policy_bundle(
  p_tenant            uuid,
  p_manifest          jsonb,
  p_signature         text,
  p_payload_ciphertext bytea,
  p_device_keys       jsonb,
  p_published_by      uuid
) returns bigint
language plpgsql
security invoker
set search_path = public, app, pg_temp
as $$
declare
  v_version bigint;
  v_key     record;
begin
  -- p_device_keys is an array of {deviceId, wrappedKey}. An empty or absent array
  -- is refused outright rather than published: a bundle no device can decrypt is
  -- a silent outage on every client, discovered only when someone asks why the
  -- agent has no procedures.
  if p_device_keys is null
     or jsonb_typeof(p_device_keys) <> 'array'
     or jsonb_array_length(p_device_keys) = 0 then
    raise exception 'a bundle must be wrapped for at least one device'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_manifest) <> 'object' then
    raise exception 'the manifest must be a json object' using errcode = '22023';
  end if;

  v_version := app.next_bundle_version(p_tenant);

  insert into policy_bundles (
    tenant_id, bundle_version, manifest_hash, signature,
    model_id, model_revision, quantization, payload_ciphertext,
    manifest, published_by
  ) values (
    p_tenant, v_version,
    p_manifest ->> 'payloadHash',
    p_signature,
    p_manifest ->> 'modelId',
    p_manifest ->> 'modelRevision',
    p_manifest ->> 'quantization',
    p_payload_ciphertext,
    p_manifest,
    p_published_by
  );

  for v_key in
    select
      (entry ->> 'deviceId')::uuid as device_id,
      decode(entry ->> 'wrappedKey', 'base64') as wrapped
    from jsonb_array_elements(p_device_keys) as entry
  loop
    -- A device key may only be stored for a device enrolled on this tenant. Without
    -- this, a publisher could hand a tenant's content key to another tenant's
    -- device and the fetch path would happily return it.
    if not exists (
      select 1 from device_registrations d
       where d.id = v_key.device_id
         and d.tenant_id = p_tenant
         and d.status = 'active'
    ) then
      raise exception 'device % is not an active device of this tenant', v_key.device_id
        using errcode = '22023';
    end if;

    insert into policy_bundle_device_keys (tenant_id, bundle_version, device_id, wrapped_key)
    values (p_tenant, v_version, v_key.device_id, v_key.wrapped);
  end loop;

  return v_version;
end;
$$;

grant execute on function app.publish_policy_bundle(uuid, jsonb, text, bytea, jsonb, uuid)
  to authenticated;

-- ----------------------------------------------------------------- fetching --

-- The client's whole view of a bundle: the exact document that was signed, the
-- signature over it, the ciphertext, and the content key wrapped for this device
-- alone.
--
-- SECURITY DEFINER so a device can read its own wrapped key without holding
-- table privileges on it. The tenant is read from the caller's JWT and the device
-- is checked against this tenant, so the function cannot be pointed at another
-- tenant's bundle by passing its id.
create or replace function app.bundle_for_device(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_tenant uuid;
  v_bundle policy_bundles;
  v_wrapped bytea;
begin
  v_tenant := app.current_tenant();

  if v_tenant is null then
    raise exception 'no tenant on this session' using errcode = '42501';
  end if;

  -- The device must belong to the caller's tenant. Passing a device id from
  -- elsewhere returns no bundle rather than an error, so the function does not
  -- confirm whether a foreign device exists.
  if not exists (
    select 1 from device_registrations d
     where d.id = p_device_id and d.tenant_id = v_tenant
  ) then
    return null;
  end if;

  select b.* into v_bundle
    from policy_bundles b
    join policy_bundle_device_keys k
      on k.tenant_id = b.tenant_id and k.bundle_version = b.bundle_version
   where b.tenant_id = v_tenant
     and k.device_id = p_device_id
     -- A bundle with no stored manifest has no signed document, so there is
     -- nothing for the client to verify a signature against. Refusing it here is
     -- the last place that can happen; after this the device simply sees no
     -- bundle and keeps serving the one it already had.
     and b.manifest is not null
   order by b.bundle_version desc
   limit 1;

  if v_bundle.id is null then
    return null;
  end if;

  select wrapped_key into v_wrapped
    from policy_bundle_device_keys
   where tenant_id = v_tenant
     and bundle_version = v_bundle.bundle_version
     and device_id = p_device_id;

  return jsonb_build_object(
    'manifest', v_bundle.manifest,
    'signature', v_bundle.signature,
    'payloadCiphertext', encode(v_bundle.payload_ciphertext, 'base64'),
    'wrappedContentKey', encode(v_wrapped, 'base64')
  );
end;
$$;

-- Execution is granted to authenticated, but the function itself takes the
-- device id and reads the tenant from the JWT, so there is nothing to pass that
-- would widen the result. PUBLIC execute is revoked for the same reason as every
-- other function in migration 0013: a default grant is a public API surface.
revoke all on function app.bundle_for_device(uuid) from public;
grant execute on function app.bundle_for_device(uuid) to authenticated;
