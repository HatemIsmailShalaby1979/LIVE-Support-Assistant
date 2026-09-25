-- 0008 — the bundle publish path.
--
-- The crypto happens in the edge function; this is the database half. Two
-- helpers and one writer, so the publish path cannot be assembled differently by
-- two callers.
--
-- On concurrency: `app.next_bundle_version` reads the maximum and adds one, which
-- is not atomic on its own. It does not need to be. The trigger installed in 0003
-- rejects any insert whose version is not exactly max + 1, so two concurrent
-- publishers produce one success and one error — never a duplicate or a gap. The
-- error is the correct outcome and the caller retries.

create or replace function app.next_bundle_version(p_tenant uuid)
returns bigint
language sql
stable
as $$
  select coalesce(max(bundle_version), 0) + 1
    from policy_bundles
   where tenant_id = p_tenant
$$;

-- The devices a published bundle must be wrapped for. Reads through RLS, so a
-- caller only ever sees its own tenant's roster.
create or replace function app.enrolled_devices(p_tenant uuid)
returns table (device_id uuid, public_key text)
language sql
stable
as $$
  select id, public_key
    from device_registrations
   where tenant_id = p_tenant
     and status = 'active'
$$;

-- Assign the next version and store the published bundle in one statement.
--
-- SECURITY INVOKER on purpose: row-level security still applies, so only an
-- ops_manager can reach the insert. The function assigns the version; it does
-- not decide who may publish.
create or replace function app.publish_policy_bundle(
  p_tenant             uuid,
  p_manifest_hash      text,
  p_signature          text,
  p_model_id           text,
  p_model_revision     text,
  p_quantization       text,
  p_payload_ciphertext bytea,
  p_published_by       uuid
) returns bigint
language plpgsql
as $$
declare
  v_version bigint;
begin
  v_version := app.next_bundle_version(p_tenant);

  insert into policy_bundles (
    tenant_id, bundle_version, manifest_hash, signature,
    model_id, model_revision, quantization, payload_ciphertext, published_by
  ) values (
    p_tenant, v_version, p_manifest_hash, p_signature,
    p_model_id, p_model_revision, p_quantization, p_payload_ciphertext, p_published_by
  );

  return v_version;
end;
$$;

grant execute on function app.next_bundle_version(uuid) to authenticated;
grant execute on function app.enrolled_devices(uuid) to authenticated;
grant execute on function app.publish_policy_bundle(
  uuid, text, text, text, text, text, bytea, uuid
) to authenticated;
