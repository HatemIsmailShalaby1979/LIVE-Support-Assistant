-- Ingest throttle — Phase 9.
--
-- The last open item from the production-readiness audit. Both ingest functions
-- accepted unlimited writes from any authenticated client: a compromised token, a
-- buggy client in a retry loop, or one bad actor could grow the telemetry tables
-- and the plaintext query text inside them without bound. Nothing limited it.
--
-- The design, kept deliberately small:
--
-- - Fixed windows of one minute, aligned on the minute. A fixed window can admit
--   up to 2x the limit across a boundary; that is accepted and stated, because the
--   alternative (sliding log) stores every timestamp and this table's whole job is
--   to stay tiny.
-- - Keyed per device. One agent's device cannot flood another's, and a human asks
--   at human rates: generous headroom above ~1 query per 5 seconds sustained, and a
--   script doing hundreds per second hits the wall immediately.
-- - Events without a device fall into a per-tenant bucket with its own lower
--   limit. The pseudonym is client-supplied and forgeable, so it is not a key;
--   the tenant is the only trustworthy scope left.
-- - The counter update is a single upsert with RETURNING. Concurrent increments
--   serialize on the row lock and each sees its own post-increment count, so the
--   limit is exact rather than advisory.
-- - Old windows are pruned opportunistically inside the check, not by a
--   scheduler. The delete is indexed and almost always matches zero rows, and the
--   table stays tiny forever even though no cron job exists yet.
-- - A rejection is an error the client already knows how to handle. The telemetry
--   queue keeps failed items with backoff and retries them, so throttled records
--   are delayed, never lost. No client change was needed.
--
-- The numbers are starting points, not policy: 60/min per device, 120/min per
-- tenant for deviceless events. They are parameters with defaults for exactly that
-- reason, and the suite exercises the boundary through small limits rather than by
-- waiting out a minute.

-- One row per tenant per bucket per minute. The bucket is text on purpose: the
-- device half of the key is nullable, and nulls do not belong in a primary key.
-- 'device:<uuid>' for identified devices, 'tenant' for events without one.
create table if not exists ingest_rate_windows (
  tenant_id    uuid not null,
  bucket       text not null,
  window_start timestamptz not null,
  event_count  integer not null default 0,
  primary key (tenant_id, bucket, window_start)
);

alter table ingest_rate_windows enable row level security;

-- No policies and no grants: this table is only touched by the SECURITY DEFINER
-- check below, which runs as the owner. Direct reads or writes by any
-- application role are refused by the absence of both.

create or replace function app.check_ingest_rate(
  p_tenant uuid,
  p_device uuid,
  p_device_limit integer default 60,
  p_tenant_limit integer default 120
) returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_bucket text := case when p_device is null then 'tenant' else 'device:' || p_device::text end;
  v_scope text := case when p_device is null then 'tenant' else 'device' end;
  v_limit integer := case when p_device is null then p_tenant_limit else p_device_limit end;
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  if p_tenant is null then
    raise exception 'ingest rate cannot be checked without a tenant'
      using errcode = '22023';
  end if;
  if v_limit < 1 then
    raise exception 'an ingest limit below 1 admits nothing, which is a misconfiguration rather than a limit'
      using errcode = '22023';
  end if;

  -- Self-maintaining: windows older than five minutes can never be current again,
  -- so they go on every call. Indexed, almost always zero rows, no scheduler needed.
  delete from ingest_rate_windows
   where window_start < v_window - interval '5 minutes';

  insert into ingest_rate_windows as w (tenant_id, bucket, window_start, event_count)
  values (p_tenant, v_bucket, v_window, 1)
  on conflict (tenant_id, bucket, window_start)
  do update set event_count = w.event_count + 1
  returning event_count into v_count;

  if v_count > v_limit then
    raise exception 'ingest rate limit exceeded for this %, retry with backoff', v_scope
      using errcode = 'P0001';
  end if;
end;
$$;

-- ------------------------------------------------------- enforcement ---

-- The check is enforced by triggers, not by editing the two ingest functions.
-- Duplicating both 150-line bodies into this migration just to add one call would
-- be the larger diff and the weaker guarantee: a trigger fires for every write
-- path into these tables, including any future one, while an edited function only
-- covers itself. Parent-table row triggers fire for rows routed to any partition,
-- so one trigger on `telemetry_events` covers every monthly partition plus the
-- default. The check runs at insert time, which means invalid requests still fail
-- on contract validation first without consuming quota — the throttle limits
-- accepted writes, which is exactly the unbounded-growth threat from the audit.
--
-- One accepted gap, stated: replays hit the dedup ledger's `on conflict do
-- nothing` and return before any event row is written, so a replay storm never
-- reaches this trigger. That is correct rather than lenient — replays are
-- idempotent no-ops against a tiny indexed table, and punishing retries would
-- break the queue's backoff contract.

create or replace function app.enforce_telemetry_rate()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  perform app.check_ingest_rate(NEW.tenant_id, NEW.device_id);
  return NEW;
end;
$$;

drop trigger if exists telemetry_rate_limit on telemetry_events;
create trigger telemetry_rate_limit
  before insert on telemetry_events
  for each row execute function app.enforce_telemetry_rate();

-- Escalations carry no device, so they count against the per-tenant bucket. Each
-- one also names a real event, which was throttled on its own insert — the pair
-- cannot be smuggled past the device bucket by writing the escalation directly.
create or replace function app.enforce_escalation_rate()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  perform app.check_ingest_rate(NEW.tenant_id, null);
  return NEW;
end;
$$;

drop trigger if exists escalation_rate_limit on escalations;
create trigger escalation_rate_limit
  before insert on escalations
  for each row execute function app.enforce_escalation_rate();

-- The check is only meaningful inside the ingest path. It lives in the exposed
-- `app` schema (everything does), so it is closed to every application role the
-- same way the retention functions are: resolved role names, because a local
-- container has only `authenticated` while a hosted project also has `anon`.
do $$
declare
  target text;
begin
  foreach target in array array[
    'app.check_ingest_rate(uuid, uuid, integer, integer)',
    'app.enforce_telemetry_rate()',
    'app.enforce_escalation_rate()'
  ] loop
    execute format('revoke all on function %s from public', target);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', target);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', target);
    end if;
  end loop;
end;
$$;
