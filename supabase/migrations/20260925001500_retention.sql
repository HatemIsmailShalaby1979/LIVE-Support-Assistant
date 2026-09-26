-- Retention and redaction -- Phase 8.
--
-- The production-readiness audit found the only P0 that was not a code path: no
-- retention anywhere in this schema, while customer query text is stored in the
-- clear. Partitioning was built for retention, but nothing dropped a partition.
--
-- A plan reading "retention = drop old partitions" would look finished and leave
-- personal data in place. Query text exists in two places with opposite lifecycles:
-- telemetry_events.payload is partitioned by month and can be dropped, while
-- escalations.evidence is deliberately unpartitioned so an escalation outlives the
-- telemetry that produced it. Dropping a partition therefore does not remove the
-- customer's words.
--
-- So retention is two jobs: telemetry is dropped for volume and expired audit
-- value; escalations are redacted rather than deleted, because the row, reason,
-- timing, assignee, and resolution note are the audit trail, while that value is
-- not in the customer's words. The horizon is a parameter. Ninety days is a
-- starting point, not a legal answer.

-- Drop expired telemetry. Whole monthly partitions go by catalog change; the
-- catch-all default partition has no range, so its expired rows are deleted.
create or replace function app.purge_telemetry_older_than(retain interval)
returns integer
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  dropped integer := 0;
  part record;
  upper_bound timestamptz;
begin
  if retain is null or retain < interval '0' then
    raise exception 'retention horizon must be a non-negative interval, got %', retain
      using errcode = '22023';
  end if;

  for part in
    select c.relname as name,
           pg_get_expr(c.relpartbound, c.oid) as bound
      from pg_class c
      join pg_inherits i on i.inhrelid = c.oid
      join pg_class parent on parent.oid = i.inhparent
     where parent.relname = 'telemetry_events'
       and c.relname <> 'telemetry_events_default'
  loop
    upper_bound := (regexp_match(lower(part.bound), 'to \(([^)]+)\)'))[1]::timestamptz;
    if upper_bound is null then
      raise exception 'unsupported telemetry partition bound for %: %', part.name, part.bound;
    end if;

    -- Only a partition whose entire range is older than the horizon. A partition
    -- straddling the boundary is left alone, because retention must not delete
    -- live events along with expired ones.
    if upper_bound < now() - retain then
      execute format('drop table if exists %I', part.name);
      dropped := dropped + 1;
    end if;
  end loop;

  delete from telemetry_events
   where occurred_at < now() - retain
     and tableoid = 'telemetry_events_default'::regclass;

  return dropped;
end;
$$;

-- Redact escalation query text without deleting the audit record. The tombstone is
-- explicit so "never had text" and "text removed by policy" are not conflated.
create or replace function app.redact_escalation_query_text(retain interval)
returns integer
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  touched integer := 0;
begin
  if retain is null or retain < interval '0' then
    raise exception 'retention horizon must be a non-negative interval, got %', retain
      using errcode = '22023';
  end if;

  update escalations
     set evidence = jsonb_set(
           evidence,
           '{queryText}',
           to_jsonb('[redacted by retention policy]'::text)
         )
   where query_occurred_at < now() - retain
     and evidence ? 'queryText'
     and evidence ->> 'queryText' <> '[redacted by retention policy]';

  get diagnostics touched = row_count;
  return touched;
end;
$$;

-- Run both retention paths together so a scheduler cannot execute them inconsistently.
create or replace function app.run_retention(retain interval default interval '90 days')
returns table (partitions_dropped integer, escalations_redacted integer, events_deleted integer)
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  dropped integer;
  redacted integer;
  events_before bigint;
  events_after bigint;
begin
  if retain is null or retain < interval '0' then
    raise exception 'retention horizon must be a non-negative interval, got %', retain
      using errcode = '22023';
  end if;

  select count(*) into events_before
    from telemetry_events
   where occurred_at < now() - retain;

  dropped := app.purge_telemetry_older_than(retain);
  redacted := app.redact_escalation_query_text(retain);

  select count(*) into events_after
    from telemetry_events
   where occurred_at < now() - retain;

  return query select dropped, redacted, greatest(events_before - events_after, 0)::integer;
end;
$$;

-- These run as the owner and can rewrite audit evidence, so close them to
-- application roles. Resolve role names at runtime because local and hosted
-- projects do not expose the same roles.
do $$
declare
  target text;
begin
  foreach target in array array[
    'app.purge_telemetry_older_than(interval)',
    'app.redact_escalation_query_text(interval)',
    'app.run_retention(interval)'
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

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function app.run_retention(interval) to service_role;
  end if;
end;
$$;
