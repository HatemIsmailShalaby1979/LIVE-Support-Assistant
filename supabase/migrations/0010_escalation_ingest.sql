-- 0010 — escalation ingest + the operations dashboard.
--
-- Phase 5. The edge client queues one telemetry event per query and one
-- escalation record per refused query, then ships both to the command centre.
-- This migration is the server half: an idempotent escalation ingest and the
-- read-side views the operations team uses to decide whether to recalibrate.
--
-- Idempotency. `escalations` is NOT partitioned (only `telemetry_events` is, per
-- §13), so it carries a plain primary key on `id`. A replayed escalation id is
-- therefore a single `on conflict (id) do nothing` — no timestamp coupling, no
-- duplicate row. This is exactly the fix the partitioned-table error in §13
-- forced onto telemetry; escalations does not have that problem, so we use the
-- simple form rather than the dedup-ledger form.
--
-- Write-time integrity. The escalation references its query event by provenance
-- (`query_event_id`, `query_occurred_at`), not by foreign key. The trigger from
-- 0004 already verifies the event exists and belongs to the same tenant. The
-- function below is SECURITY DEFINER so a frontline agent can file an escalation
-- without being granted read access to telemetry directly — the same reason the
-- 0004 trigger is SECURITY DEFINER.

create or replace function app.ingest_escalation(
  p_escalation_id      uuid,
  p_query_event_id      uuid,
  p_query_occurred_at   timestamptz,
  p_evidence            jsonb
) returns boolean
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_tenant   uuid := app.current_tenant();
  v_inserted integer;
begin
  if v_tenant is null then
    raise exception 'request carries no tenant claim'
      using errcode = 'insufficient_privilege';
  end if;

  insert into escalations (id, tenant_id, query_event_id, query_occurred_at, evidence)
  values (p_escalation_id, v_tenant, p_query_event_id, p_query_occurred_at, p_evidence)
  on conflict (id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

grant execute on function app.ingest_escalation(uuid, uuid, timestamptz, jsonb)
  to authenticated;

-- The threshold-failure dashboard. An operations manager sees what is being
-- escalated and under which gate parameters, so a spike in `insufficient_margin`
-- right after a bundle change is visible the same day. `escalations` is RLS-
-- scoped, so the view needs no tenant filter of its own: the caller only ever
-- sees their own tenant's rows.
--
-- `evidence` is the jsonb snapshot from `buildEscalationRecord` (Phase 4). The
-- dashboard reads straight from it, which is the whole point of carrying the
-- snapshot rather than joining back to telemetry that gets retired.

create or replace view app.ops_escalation_dashboard as
select
  (evidence ->> 'reason')::text         as reason,
  (evidence ->> 'bundleVersion')::bigint as bundle_version,
  (evidence ->> 'minMargin')::numeric    as min_margin,
  (evidence ->> 'modelId')::text         as model_id,
  count(*)                               as escalations,
  min(created_at)                        as first_at,
  max(created_at)                        as last_at
from escalations
group by reason, bundle_version, min_margin, model_id;

-- Every gate-parameter change, with who and the before value. Append-only by
-- privilege (0009); surfaced here so a parameter move and an escalation spike can
-- be read side by side.

create or replace view app.ops_threshold_changes as
select
  tenant_id,
  previous_threshold,
  new_threshold,
  previous_min_margin,
  new_min_margin,
  changed_by,
  changed_at
from tenant_threshold_changes
order by tenant_id, changed_at desc;

-- The gate funnel: queries run, answered, escalated, per day. `telemetry_events`
-- is partitioned and RLS-scoped; the view inherits both. `outcome` is written by
-- the client telemetry queue (Phase 5 client).

create or replace view app.ops_gate_funnel as
select
  tenant_id,
  date_trunc('day', occurred_at) as day,
  count(*) filter (where event_type = 'query') as queries,
  count(*) filter (where event_type = 'query'
                    and payload ? 'outcome'
                    and payload ->> 'outcome' = 'answered') as answered,
  count(*) filter (where event_type = 'query'
                    and payload ? 'outcome'
                    and payload ->> 'outcome' = 'escalated') as escalated
from telemetry_events
group by tenant_id, day;

grant select on app.ops_escalation_dashboard to authenticated;
grant select on app.ops_threshold_changes    to authenticated;
grant select on app.ops_gate_funnel           to authenticated;
