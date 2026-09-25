-- Phase 5 telemetry + escalation ingest matrix.
--
-- Proves the server half of Phase 5 against a real PostgreSQL:
--
--   1. escalation ingest is idempotent on the escalation id (one row, replays rejected)
--   2. the evidence jsonb snapshot is stored verbatim (reason, bundle version, candidates)
--   3. an escalation cannot point at a missing event, another tenant's event, or run
--      with no tenant claim
--   4. the operations dashboard views return tenant-scoped aggregates
--
-- Each probe assumes the `authenticated` role with a JWT claim, exactly as a
-- Supabase request would, then records what actually happened. Negative controls
-- (orphan / cross-tenant / no-claim) assert a block and observe a block, so the
-- suite would fail if any of those guarantees regressed.
--
-- Run: psql -f supabase/tests/phase5_telemetry.sql

\set ON_ERROR_STOP off

drop table if exists phase5_results;

create table phase5_results (
  id          serial primary key,
  section     text not null,
  role_name   text not null,
  object_name text not null,
  operation   text not null,
  expected    text not null,
  observed    text not null,
  ok          boolean not null
);

-- ---------------------------------------------------------------- helpers ---

create or replace function p5_claims(p_role app_role, p_tenant uuid, p_user uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_user::text,
      'app_metadata', jsonb_build_object(
        'tenant_id', p_tenant::text,
        'app_role', p_role::text
      )
    )::text,
    true
  )
$$;

create or replace function p5_probe(
  p_section text,
  p_role app_role,
  p_tenant uuid,
  p_user uuid,
  p_object text,
  p_operation text,
  p_sql text,
  p_expect text,
  p_denial text default null
) returns void
language plpgsql
as $$
declare
  v_observed text;
  v_rows bigint;
begin
  begin
    perform p5_claims(p_role, p_tenant, p_user);
    execute 'set local role authenticated';

    begin
      execute p_sql;
      get diagnostics v_rows = row_count;
      v_observed := 'rows:' || v_rows;
    exception
      when insufficient_privilege then v_observed := 'denied:privilege';
      when others then v_observed := 'error:' || sqlstate;
    end;

    execute 'reset role';
  exception
    when others then v_observed := 'probe_failure:' || sqlstate;
  end;

  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values (
    p_section, p_role::text, p_object, p_operation, p_expect, v_observed,
    case
      when p_expect = 'allowed' then v_observed like 'rows:%' and v_observed <> 'rows:0'
      when p_denial is not null then v_observed = p_denial
      else v_observed = 'rows:0' or v_observed like 'denied:%' or v_observed like 'error:%'
    end
  );
end;
$$;

create or replace function p5_read(
  p_section text,
  p_role app_role,
  p_tenant uuid,
  p_user uuid,
  p_object text,
  p_query text,
  p_expect_rows int
) returns void
language plpgsql
as $$
declare
  v_observed text;
  v_count bigint;
begin
  begin
    perform p5_claims(p_role, p_tenant, p_user);
    execute 'set local role authenticated';

    begin
      execute format('select count(*) from (%s) q', p_query) into v_count;
      v_observed := 'rows:' || v_count;
    exception
      when insufficient_privilege then
        v_count := null;
        v_observed := 'denied:privilege';
      when others then
        v_count := null;
        v_observed := 'error:' || sqlstate;
    end;

    execute 'reset role';
  exception
    when others then
      v_count := null;
      v_observed := 'probe_failure:' || sqlstate;
  end;

  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values (
    p_section, p_role::text, p_object, 'select', p_expect_rows::text, v_observed,
    coalesce(v_count = p_expect_rows, false)
  );
end;
$$;

\o /dev/null

-- ============================ escalation ingest flow =========================
-- A client sends the query event first, then the escalation that names it.

do $$
declare
  v_tenant uuid := '11111111-1111-1111-1111-111111111111';
  v_agent  uuid := 'a0000000-0000-0000-0000-000000000004';
  v_event  uuid := gen_random_uuid();
  v_esc    uuid := gen_random_uuid();
  v_first  boolean;
  v_replay boolean;
  v_rows   integer;
  v_reason text;
  v_bv     bigint;
  v_cand   integer;
  v_ev     jsonb := '{"queryText":"where is my refund","reason":"insufficient_margin","thresholdAccept":0,"minMargin":0.18,"bundleVersion":1,"modelId":"Xenova/all-MiniLM-L6-v2","modelRevision":"751bff37182d3f1213fa05d7196b954e230abad9","candidates":[{"sopId":"c0000000-0000-0000-0000-000000000001","score":0.41,"passage":"refund within 14 days"},{"sopId":"c0000000-0000-0000-0000-000000000002","score":0.26,"passage":"exchange only"}]}'::jsonb;
begin
  -- 1. the query event (payload carries the outcome the funnel reads)
  perform p5_claims('agent', v_tenant, v_agent);
  execute 'set local role authenticated';
  perform app.ingest_telemetry_event(
    v_event, 'd0000000-0000-0000-0000-000000000001', 'pseudo-alpha-1', 'query', 1,
    '2026-09-22 09:00:00+00',
    jsonb_build_object(
      'outcome', 'escalated', 'sopId', null, 'score', null, 'margin', null,
      'gateReason', 'insufficient_margin', 'thresholdAccept', 0, 'minMargin', 0.18,
      'topCandidates', v_ev -> 'candidates'
    ));
  execute 'reset role';

  -- 2. the escalation referencing it
  perform p5_claims('agent', v_tenant, v_agent);
  execute 'set local role authenticated';
  v_first := app.ingest_escalation(v_esc, v_event, '2026-09-22 09:00:00+00', v_ev);
  execute 'reset role';

  -- 3. replay the same escalation id
  perform p5_claims('agent', v_tenant, v_agent);
  execute 'set local role authenticated';
  v_replay := app.ingest_escalation(v_esc, v_event, '2026-09-22 09:00:00+00', v_ev);
  execute 'reset role';

  select count(*) into v_rows from escalations where id = v_esc;
  select (evidence ->> 'reason')::text,
         (evidence ->> 'bundleVersion')::bigint,
         jsonb_array_length(evidence -> 'candidates')
    into v_reason, v_bv, v_cand
    from escalations where id = v_esc;

  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('escalation ingest', 'agent', 'escalations', 'first ingest accepted', 'true', v_first::text, v_first);

  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('escalation ingest', 'agent', 'escalations', 'replay rejected', 'false', v_replay::text, not v_replay);

  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('escalation ingest', 'agent', 'escalations', 'exactly one row for id', '1', v_rows::text, v_rows = 1);

  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('escalation ingest', 'agent', 'escalations', 'evidence reason populated', 'insufficient_margin',
          coalesce(v_reason, 'null'), coalesce(v_reason, 'null') = 'insufficient_margin');

  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('escalation ingest', 'agent', 'escalations', 'evidence bundleVersion populated', '1',
          coalesce(v_bv::text, 'null'), v_bv = 1);

  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('escalation ingest', 'agent', 'escalations', 'evidence candidates populated', '2',
          coalesce(v_cand::text, 'null'), v_cand = 2);
exception when others then
  begin
    execute 'reset role';
  exception when others then null;
  end;

  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('escalation ingest', 'agent', 'escalations', 'probe', 'ok', 'failure:' || sqlstate, false);
end $$;

select p5_probe('ingest contract', 'agent',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004',
  'app.ingest_telemetry_event', 'answered event without decision evidence',
  $q$ select app.ingest_telemetry_event(gen_random_uuid(),
        'd0000000-0000-0000-0000-000000000001', 'pseudo-alpha-1', 'query', 1,
        '2026-09-22 10:00:00+00',
        '{"outcome":"answered","topCandidates":[{"sopId":"1","score":0.8,"passage":"candidate"}]}'::jsonb) $q$,
  'blocked', 'error:22023');

select p5_probe('ingest contract', 'agent',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004',
  'app.ingest_escalation', 'escalation without evidence contract',
  $q$ select app.ingest_escalation(gen_random_uuid(),
        'aa000000-0000-0000-0000-000000000001', '2026-09-20 10:00:00+00',
        '{"reason":"no_candidates"}'::jsonb) $q$,
  'blocked', 'error:22023');

select p5_probe('ingest contract', 'agent',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004',
  'app.ingest_escalation', 'evidence disagrees with source gate settings',
  $q$ select app.ingest_escalation(gen_random_uuid(),
        'aa000000-0000-0000-0000-000000000002', '2026-09-20 10:05:00+00',
        '{"queryText":"q","reason":"insufficient_margin","thresholdAccept":0,"minMargin":0.15,"bundleVersion":1,"modelId":"m","modelRevision":"r","candidates":[{"sopId":"1","score":0.42,"passage":"refund policy"},{"sopId":"3","score":0.4,"passage":"login policy"}]}'::jsonb) $q$,
  'blocked', 'error:22023');

select p5_probe('ingest contract', 'agent',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004',
  'app.ingest_escalation', 'fractional bundle version rejected',
  $q$ select app.ingest_escalation(gen_random_uuid(),
        'aa000000-0000-0000-0000-000000000002', '2026-09-20 10:05:00+00',
        '{"queryText":"q","reason":"insufficient_margin","thresholdAccept":0,"minMargin":0.18,"bundleVersion":1.5,"modelId":"m","modelRevision":"r","candidates":[{"sopId":"1","score":0.42,"passage":"refund policy"},{"sopId":"3","score":0.4,"passage":"login policy"}]}'::jsonb) $q$,
  'blocked', 'error:22023');

-- ============================ escalation integrity ============================
-- Negative controls: each must be refused, so the suite would fail if any
-- guarantee regressed.

select p5_probe('escalation integrity', 'agent',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004',
  'escalations', 'ingest against a nonexistent event',
  $q$ select app.ingest_escalation(gen_random_uuid(), '00000000-0000-0000-0000-0000000000ff',
        '2026-09-20 10:00:00+00', '{"queryText":"q","reason":"no_candidates","thresholdAccept":0,"minMargin":0.18,"bundleVersion":1,"modelId":"m","modelRevision":"r","candidates":[]}'::jsonb) $q$,
  'blocked');

select p5_probe('escalation integrity', 'agent',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004',
  'escalations', 'ingest against another tenant''s event',
  $q$ select app.ingest_escalation(gen_random_uuid(), 'bb000000-0000-0000-0000-000000000001',
        '2026-09-20 11:00:00+00', '{"queryText":"q","reason":"no_candidates","thresholdAccept":0,"minMargin":0.18,"bundleVersion":1,"modelId":"m","modelRevision":"r","candidates":[]}'::jsonb) $q$,
  'blocked');

select p5_probe('escalation integrity', 'agent',
  null, 'a0000000-0000-0000-0000-000000000004',
  'escalations', 'ingest with no tenant claim',
  $q$ select app.ingest_escalation(gen_random_uuid(), 'aa000000-0000-0000-0000-000000000001',
        '2026-09-20 10:00:00+00', '{"queryText":"q","reason":"no_candidates","thresholdAccept":0,"minMargin":0.18,"bundleVersion":1,"modelId":"m","modelRevision":"r","candidates":[]}'::jsonb) $q$,
  'blocked');

-- =============================== ops dashboard ===============================
-- Threshold change first, so the threshold-changes view has something to show.

do $$
declare
  v_tenant uuid := '11111111-1111-1111-1111-111111111111';
  v_ops    uuid := 'a0000000-0000-0000-0000-000000000001';
begin
  perform p5_claims('ops_manager', v_tenant, v_ops);
  execute 'set local role authenticated';
  update tenants set min_margin = 0.180 where id = v_tenant;
  execute 'reset role';

  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('ops dashboard', 'ops_manager', 'tenants', 'threshold change applied', 'ok', 'ok', true);
exception when others then
  begin
    execute 'reset role';
  exception when others then null;
  end;

  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('ops dashboard', 'ops_manager', 'tenants', 'threshold change applied', 'ok',
          'failure:' || sqlstate, false);
end $$;

select p5_read('ops dashboard', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
  'ops_escalation_dashboard',
  $q$ select 1 from app.ops_escalation_dashboard where reason = 'insufficient_margin' $q$,
  1);

select p5_read('ops dashboard', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
  'ops_gate_funnel',
  $q$ select 1 from app.ops_gate_funnel
        where tenant_id = '11111111-1111-1111-1111-111111111111'
          and day = '2026-09-22 00:00:00+00'
          and queries = 1 and escalated = 1 $q$,
  1);

select p5_read('ops dashboard', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
  'ops_threshold_changes',
  $q$ select 1 from app.ops_threshold_changes
        where tenant_id = '11111111-1111-1111-1111-111111111111'
          and new_min_margin = 0.180 $q$,
  1);

-- =================================== report ================================

\o

\echo ''
\echo '=== Phase 5 matrix by section ==='
select
  section,
  count(*) filter (where ok) as passed,
  count(*) as total,
  count(*) filter (where not ok) as failed
from phase5_results
group by section
order by section;

\echo ''
\echo '=== failures ==='
select role_name, object_name, operation, expected, observed
from phase5_results
where not ok
order by id;

\echo ''
select case
  when count(*) = 0 then 'PHASE5 OK'
  else 'PHASE5 FAILED: ' || count(*) || ' probe(s)'
end as verdict
from phase5_results
where not ok;
