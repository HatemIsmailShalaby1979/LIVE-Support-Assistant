-- 0012 — the dashboard views must run as the CALLER, not as their owner.
--
-- The Phase 7 RLS bypass suite caught a real vulnerability in the Phase 5
-- views: created without `security_invoker`, each view executes its underlying
-- query as its OWNER — `postgres`, a superuser, which bypasses row-level
-- security entirely. An ops manager of tenant Beta querying
-- `app.ops_escalation_dashboard` therefore saw tenant Alpha's escalations,
-- funnel, and threshold changes. Measured, not hypothesised: the bypass suite
-- observed foreign rows through all three views before this fix.
--
-- PostgreSQL 15+ supports `security_invoker = true`: the view's body then runs
-- with the CALLER's privileges, and RLS on the base tables applies as intended.
-- The option cannot be changed by CREATE OR REPLACE VIEW, so each view is
-- dropped and recreated identically.

drop view if exists app.ops_escalation_dashboard;
drop view if exists app.ops_gate_funnel;
drop view if exists app.ops_threshold_changes;

create or replace view app.ops_escalation_dashboard
with (security_invoker = true) as
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

create or replace view app.ops_threshold_changes
with (security_invoker = true) as
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

create or replace view app.ops_gate_funnel
with (security_invoker = true) as
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
