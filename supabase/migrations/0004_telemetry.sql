-- 0004 — telemetry and escalations.
--
-- Partitioned by `occurred_at` so that retention is a partition drop. That choice
-- has two consequences, both verified against PostgreSQL 17 rather than assumed:
--
--   * A unique constraint on a partitioned table MUST include the partition key.
--     `unique index on (id)` fails with "unique constraint on partitioned table
--     must include all partitioning columns". There is no global unique index
--     across partitions, so uniqueness on the event id alone cannot live here.
--   * A composite FOREIGN KEY *into* a partitioned table does work, provided it
--     references a unique constraint that includes the partition key.

create table telemetry_events (
  id             uuid not null,
  tenant_id      uuid not null,
  device_id      uuid,
  user_pseudonym text not null,
  event_type     text not null,
  bundle_version bigint,
  occurred_at    timestamptz not null,
  payload        jsonb not null,
  ingested_at    timestamptz not null default now(),
  primary key (id, occurred_at)
) partition by range (occurred_at);

create table telemetry_events_2026_09 partition of telemetry_events
  for values from ('2026-09-01 00:00:00+00') to ('2026-10-01 00:00:00+00');

-- A default partition keeps ingest from failing when a client reports a clock
-- skew across a month boundary. Retention is a later concern.
create table telemetry_events_default partition of telemetry_events default;

create index telemetry_events_tenant_time_idx
  on telemetry_events (tenant_id, occurred_at desc);

-- The ingest ledger. Exists because the partitioned table above cannot carry a
-- unique constraint on `id`, and the alternative — `on conflict (id, occurred_at)`
-- — only holds if the client resends a byte-identical timestamp. A client that
-- regenerates `occurred_at` on retry would silently write a duplicate audit row
-- with the same id and a different time, corrupting exactly the analytics the
-- telemetry exists to feed.
--
-- This table is deliberately NOT partitioned: it needs a plain primary key on
-- `id`. It is a dedup cache with a retention policy, not an audit record, so a
-- maintenance role may prune it. Nothing in the audit trail lives only here.
create table telemetry_ingest_dedup (
  id         uuid primary key,
  tenant_id  uuid not null,
  first_seen timestamptz not null default now()
);

create index telemetry_ingest_dedup_seen_idx on telemetry_ingest_dedup (first_seen);

create table escalations (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  -- Provenance, NOT a foreign key. Measured against PostgreSQL 17: a composite
  -- FK into a partitioned table is legal, but PostgreSQL propagates a separate
  -- constraint onto every partition, and each of those constraints depends on
  -- its partition. `DROP TABLE telemetry_events_2026_09` is therefore refused
  -- even when no escalation references it any more — the dependency is
  -- structural, not data-dependent — and `CASCADE` would silently drop the FK
  -- from this table altogether.
  --
  -- A durable record cannot hold a foreign key into a table that is periodically
  -- dropped. Integrity is enforced at write time by the trigger below instead,
  -- which costs nothing structurally and leaves retention unblocked.
  query_event_id     uuid not null,
  -- Identifies which partition the event is in, so provenance survives even
  -- after that partition is retired.
  query_occurred_at  timestamptz not null,
  -- The escalation must outlive the telemetry that produced it, so it carries
  -- its own copy of the evidence: the query text, the scores, the candidates.
  -- The design in §5 assumes this snapshot; the column exists from the start so
  -- that Phase 5 does not have to add it under pressure.
  evidence           jsonb not null default '{}'::jsonb,
  status             text not null default 'open'
                     check (status in ('open', 'assigned', 'resolved')),
  assigned_to        uuid references users(id),
  resolution         text,
  linked_sop_version uuid references sop_versions(id),
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);

create index escalations_tenant_idx on escalations (tenant_id);
create index escalations_open_idx on escalations (tenant_id, status)
  where status <> 'resolved';

-- Write-time referential integrity. Same guarantee the foreign key would have
-- given, without coupling the escalation to a partition's lifetime.
--
-- SECURITY DEFINER is required, and this was found by the test rather than by
-- reasoning: the check reads telemetry_events, and the role that creates
-- escalations is the frontline agent, which by policy cannot read telemetry at
-- all. Run as the invoker, the existence check always came back empty and
-- rejected every legitimate escalation with 23503. An integrity check must not
-- be subject to the caller's read policy.
--
-- Running elevated also lets it do something the foreign key could not: verify
-- that the event belongs to the same tenant as the escalation.
create or replace function app.enforce_escalation_event_exists()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if not exists (
    select 1
      from telemetry_events
     where id = new.query_event_id
       and occurred_at = new.query_occurred_at
       and tenant_id = new.tenant_id
  ) then
    raise exception 'query event % at % does not exist in tenant %',
      new.query_event_id, new.query_occurred_at, new.tenant_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger escalations_event_exists
before insert or update of query_event_id, query_occurred_at on escalations
for each row execute function app.enforce_escalation_event_exists();
