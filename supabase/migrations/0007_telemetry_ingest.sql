-- 0007 — the telemetry ingest path.
--
-- One call, one transaction, idempotent on the event id alone.
--
-- Why a function rather than two client statements: the dedup claim and the
-- event insert must be atomic. If a client claimed an id and then failed to
-- insert the event, a retry would find the id already claimed and silently drop
-- the event forever. Wrapping both in one function makes the pair succeed or
-- fail together.
--
-- Why SECURITY INVOKER and not SECURITY DEFINER: row-level security must still
-- apply to both inserts. The tenant is therefore checked twice — once here, from
-- the signed claim, and once by the policy on each table.

create or replace function app.ingest_telemetry_event(
  p_id             uuid,
  p_device_id      uuid,
  p_user_pseudonym text,
  p_event_type     text,
  p_bundle_version bigint,
  p_occurred_at    timestamptz,
  p_payload        jsonb
) returns boolean
language plpgsql
as $$
declare
  v_tenant  uuid := app.current_tenant();
  v_claimed integer;
begin
  if v_tenant is null then
    raise exception 'request carries no tenant claim'
      using errcode = 'insufficient_privilege';
  end if;

  insert into telemetry_ingest_dedup (id, tenant_id)
  values (p_id, v_tenant)
  on conflict (id) do nothing;

  get diagnostics v_claimed = row_count;

  if v_claimed = 0 then
    -- Already ingested. A replayed id from a *different* tenant lands here too,
    -- which would drop the second tenant's event. With client-generated UUIDv4
    -- ids a collision is not a practical concern, and the alternative — letting
    -- the duplicate through — corrupts the audit trail, which is worse.
    return false;
  end if;

  insert into telemetry_events (
    id, tenant_id, device_id, user_pseudonym, event_type, bundle_version,
    occurred_at, payload
  ) values (
    p_id, v_tenant, p_device_id, p_user_pseudonym, p_event_type, p_bundle_version,
    p_occurred_at, p_payload
  );

  return true;
end;
$$;

grant execute on function app.ingest_telemetry_event(
  uuid, uuid, text, text, bigint, timestamptz, jsonb
) to authenticated;
