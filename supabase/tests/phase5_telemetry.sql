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

-- ---------------------------------------------------------------- fixtures ---
--
-- The seven principals below are addressed by name, not by literal UUID.
--
-- Locally the auth shim lets us choose those UUIDs, and the defaults here are the
-- ones the seed inserts. A hosted project cannot: public.users.id references
-- auth.users(id), that table belongs to GoTrue, and postgres has no CREATE on
-- the auth schema, so the only supported way to get a row in there is the Auth
-- Admin API — which assigns its own UUID. Hard-coded identifiers therefore mean
-- the suite cannot run against the platform it ships to, which is the one place
-- it most needs to run.
--
-- Override from the command line:
--   psql -v alpha_ops=<uuid> -v alpha_editor=<uuid> ... -f <this file>
-- tooling/db/verify-hosted.sh does exactly that, after provisioning the users.

\if :{?alpha_ops}
\else
\set alpha_ops 'a0000000-0000-0000-0000-000000000001'
\endif
\if :{?alpha_editor}
\else
\set alpha_editor 'a0000000-0000-0000-0000-000000000002'
\endif
\if :{?alpha_lead}
\else
\set alpha_lead 'a0000000-0000-0000-0000-000000000003'
\endif
\if :{?alpha_agent}
\else
\set alpha_agent 'a0000000-0000-0000-0000-000000000004'
\endif
\if :{?alpha_auditor}
\else
\set alpha_auditor 'a0000000-0000-0000-0000-000000000005'
\endif
\if :{?beta_ops}
\else
\set beta_ops 'b0000000-0000-0000-0000-000000000001'
\endif
\if :{?beta_agent}
\else
\set beta_agent 'b0000000-0000-0000-0000-000000000002'
\endif


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
      when others then v_observed := 'error:' || sqlstate || ' ' || sqlerrm;
    end;

    execute 'reset role';
  exception
    when others then v_observed := 'probe_failure:' || sqlstate || ' ' || sqlerrm;
  end;

  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values (
    p_section, p_role::text, p_object, p_operation, p_expect, v_observed,
    case
      when p_expect = 'allowed' then v_observed like 'rows:%' and v_observed <> 'rows:0'
      when p_denial is not null then v_observed like p_denial || '%'
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
        v_observed := 'error:' || sqlstate || ' ' || sqlerrm;
    end;

    execute 'reset role';
  exception
    when others then
      v_count := null;
      v_observed := 'probe_failure:' || sqlstate || ' ' || sqlerrm;
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
  v_agent  uuid;
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
  -- Resolved by email, not by a psql variable: this block is a dollar-quoted
  -- body, where psql expands nothing. A hosted project creates these
  -- principals through the Auth Admin API and cannot choose their UUIDs, so
  -- the email is the only identifier that exists in both environments.
  select id into v_agent from auth.users where email = 'agent@alpha.example';
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
  values ('escalation ingest', 'agent', 'escalations', 'probe', 'ok', 'failure:' || sqlstate || ' ' || sqlerrm, false);
end $$;

select p5_probe('ingest contract', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'app.ingest_telemetry_event', 'answered event without decision evidence',
  $q$ select app.ingest_telemetry_event(gen_random_uuid(),
        'd0000000-0000-0000-0000-000000000001', 'pseudo-alpha-1', 'query', 1,
        '2026-09-22 10:00:00+00',
        '{"outcome":"answered","topCandidates":[{"sopId":"1","score":0.8,"passage":"candidate"}]}'::jsonb) $q$,
  'blocked', 'error:22023');

select p5_probe('ingest contract', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'app.ingest_escalation', 'escalation without evidence contract',
  $q$ select app.ingest_escalation(gen_random_uuid(),
        'aa000000-0000-0000-0000-000000000001', '2026-09-20 10:00:00+00',
        '{"reason":"no_candidates"}'::jsonb) $q$,
  'blocked', 'error:22023');

select p5_probe('ingest contract', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'app.ingest_escalation', 'evidence disagrees with source gate settings',
  $q$ select app.ingest_escalation(gen_random_uuid(),
        'aa000000-0000-0000-0000-000000000002', '2026-09-20 10:05:00+00',
        '{"queryText":"q","reason":"insufficient_margin","thresholdAccept":0,"minMargin":0.15,"bundleVersion":1,"modelId":"m","modelRevision":"r","candidates":[{"sopId":"1","score":0.42,"passage":"refund policy"},{"sopId":"3","score":0.4,"passage":"login policy"}]}'::jsonb) $q$,
  'blocked', 'error:22023');

select p5_probe('ingest contract', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'app.ingest_escalation', 'fractional bundle version rejected',
  $q$ select app.ingest_escalation(gen_random_uuid(),
        'aa000000-0000-0000-0000-000000000002', '2026-09-20 10:05:00+00',
        '{"queryText":"q","reason":"insufficient_margin","thresholdAccept":0,"minMargin":0.18,"bundleVersion":1.5,"modelId":"m","modelRevision":"r","candidates":[{"sopId":"1","score":0.42,"passage":"refund policy"},{"sopId":"3","score":0.4,"passage":"login policy"}]}'::jsonb) $q$,
  'blocked', 'error:22023');

-- ============================ escalation integrity ============================
-- Negative controls: each must be refused, so the suite would fail if any
-- guarantee regressed.

select p5_probe('escalation integrity', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'escalations', 'ingest against a nonexistent event',
  $q$ select app.ingest_escalation(gen_random_uuid(), '00000000-0000-0000-0000-0000000000ff',
        '2026-09-20 10:00:00+00', '{"queryText":"q","reason":"no_candidates","thresholdAccept":0,"minMargin":0.18,"bundleVersion":1,"modelId":"m","modelRevision":"r","candidates":[]}'::jsonb) $q$,
  'blocked');

select p5_probe('escalation integrity', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'escalations', 'ingest against another tenant''s event',
  $q$ select app.ingest_escalation(gen_random_uuid(), 'bb000000-0000-0000-0000-000000000001',
        '2026-09-20 11:00:00+00', '{"queryText":"q","reason":"no_candidates","thresholdAccept":0,"minMargin":0.18,"bundleVersion":1,"modelId":"m","modelRevision":"r","candidates":[]}'::jsonb) $q$,
  'blocked');

select p5_probe('escalation integrity', 'agent',
  null, :'alpha_agent',
  'escalations', 'ingest with no tenant claim',
  $q$ select app.ingest_escalation(gen_random_uuid(), 'aa000000-0000-0000-0000-000000000001',
        '2026-09-20 10:00:00+00', '{"queryText":"q","reason":"no_candidates","thresholdAccept":0,"minMargin":0.18,"bundleVersion":1,"modelId":"m","modelRevision":"r","candidates":[]}'::jsonb) $q$,
  'blocked');

-- =============================== ops dashboard ===============================
-- Threshold change first, so the threshold-changes view has something to show.

do $$
declare
  v_tenant uuid := '11111111-1111-1111-1111-111111111111';
  v_ops    uuid;
begin
  select id into v_ops from auth.users where email = 'ops@alpha.example';
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
          'failure:' || sqlstate || ' ' || sqlerrm, false);
end $$;

select p5_read('ops dashboard', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'ops_escalation_dashboard',
  $q$ select 1 from app.ops_escalation_dashboard where reason = 'insufficient_margin' $q$,
  1);

select p5_read('ops dashboard', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'ops_gate_funnel',
  $q$ select 1 from app.ops_gate_funnel
        where tenant_id = '11111111-1111-1111-1111-111111111111'
          and day = '2026-09-22 00:00:00+00'
          and queries = 1 and escalated = 1 $q$,
  1);

select p5_read('ops dashboard', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'ops_threshold_changes',
  $q$ select 1 from app.ops_threshold_changes
        where tenant_id = '11111111-1111-1111-1111-111111111111'
          and new_min_margin = 0.180 $q$,
  1);

-- ============================ ingest throttle ==============================
-- Phase 9. Both ingest functions accepted unlimited writes from any authenticated
-- client. Enforcement is a BEFORE INSERT trigger calling app.check_ingest_rate,
-- so what follows proves the throttle where it actually bites, not just the
-- helper in isolation.
--
-- Every identity in this section is minted at runtime (gen_random_uuid), never
-- hardcoded. Fixed fixture ids share per-minute counter buckets with the seed,
-- with other suites, and with previous runs of this suite; exact-count assertions
-- against shared buckets are testing the weather. A runtime-fresh device starts
-- every run with a virgin bucket, which makes each boundary deterministic. The
-- one shared scope left — the tenant bucket on Alpha — is only ever asserted
-- with headroom in the hundreds, never near a boundary.
-- The 61-iteration loop asserts R = A + 1 (the refusal immediately follows the
-- admissions, proving exactness) with A >= 60 and R <= 130 rather than pinning
-- 61: a minute boundary mid-loop resets the count, and the relative assertion
-- holds across it while an absolute one would flake.

do $$
declare
  v_tenant uuid := '11111111-1111-1111-1111-111111111111';
  v_agent  uuid;
  v_enroller uuid;
  v_dev    uuid := gen_random_uuid();
  v_other  uuid := gen_random_uuid();
  v_flood  uuid := gen_random_uuid();
  v_prune  uuid := gen_random_uuid();
  v_escdev uuid := gen_random_uuid();
  v_t9     uuid := gen_random_uuid();
  v_ok     boolean;
  v_n      integer;
  v_admitted integer;
  v_refused_at integer;
  v_state  text;
  v_ev_id  uuid;
  v_ev_at  timestamptz;
begin
  select id into v_agent from auth.users where email = 'agent@alpha.example';
  if v_agent is null then
    raise exception 'throttle probes need agent@alpha.example';
  end if;

  -- The flood and escalation devices are enrolled for Alpha up front: ingest
  -- rejects writes from unenrolled devices, and enrollment is fixture state the
  -- section must own rather than borrow. The user is taken from an existing
  -- enrollment so the foreign key always resolves, and the platforms are ones the
  -- seed never uses for that user — with a delete-first so a re-run starts clean.
  -- Sharing the seed's (tenant, user, platform) row would collide on the unique
  -- key that `on conflict (id)` does not cover, which is exactly how a run failed.
  select user_id into v_enroller from device_registrations
   where tenant_id = v_tenant limit 1;
  delete from device_registrations
   where tenant_id = v_tenant and user_id = v_enroller and platform in ('mobile', 'desktop');
  insert into device_registrations (id, tenant_id, user_id, platform, public_key)
  values (v_flood, v_tenant, v_enroller, 'mobile', 'throttle-probe-flood'),
         (v_escdev, v_tenant, v_enroller, 'desktop', 'throttle-probe-esc');

  -- 1. The boundary is exact: two admissions, then the refusal, consecutively.
  -- R = A + 1 proves no early refusal and no silent drop, on a virgin bucket.
  v_admitted := 0;
  v_refused_at := 0;
  for v_n in 1..6 loop
    begin
      perform app.check_ingest_rate(v_tenant, v_dev, 2, 120);
      v_admitted := v_admitted + 1;
    exception when others then
      if v_refused_at = 0 then v_refused_at := v_n; end if;
      if sqlstate != 'P0001' then
        raise exception 'boundary probe raised %, not P0001', sqlstate;
      end if;
    end;
  end loop;
  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('ingest throttle', 'agent', 'app.check_ingest_rate', 'limit 2 admits exactly two then refuses',
    'admitted=2 refused_at=3', 'admitted=' || v_admitted || ' refused_at=' || v_refused_at,
    v_admitted = 2 and v_refused_at = 3);

  -- 2. Isolation: one capped device does not spend another's quota, and a second
  -- tenant starts with a clean slate entirely. Both tenants here are runtime-fresh
  -- for the device under test, so no seed row and no other suite can interfere.
  begin
    perform app.check_ingest_rate(v_tenant, v_other, 2, 120);
    v_state := 'ok';
  exception when others then
    v_state := sqlstate;
  end;
  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('ingest throttle', 'agent', 'app.check_ingest_rate', 'a second device is unaffected', 'ok', v_state, v_state = 'ok');
  begin
    perform app.check_ingest_rate(v_t9, v_dev, 2, 120);
    v_state := 'ok';
  exception when others then
    v_state := sqlstate;
  end;
  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('ingest throttle', 'agent', 'app.check_ingest_rate', 'a fresh tenant starts with a clean slate', 'ok', v_state, v_state = 'ok');

  -- 3. Deviceless events count against the per-tenant bucket, not nobody's. The
  -- tenant is runtime-fresh, so its bucket is virgin by construction: limit 1
  -- admits one call and refuses the next, with no ambient writes to blur it.
  begin
    perform app.check_ingest_rate(v_t9, null, 60, 1);
    v_state := 'ok';
  exception when others then
    v_state := sqlstate;
  end;
  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('ingest throttle', 'agent', 'app.check_ingest_rate', 'one deviceless event is admitted', 'ok', v_state, v_state = 'ok');
  begin
    perform app.check_ingest_rate(v_t9, null, 60, 1);
    v_state := 'admitted';
  exception when others then
    v_state := sqlstate;
  end;
  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('ingest throttle', 'agent', 'app.check_ingest_rate', 'the second is refused', 'P0001', v_state, v_state = 'P0001');

  -- 4. A limit below 1 admits nothing, which is a misconfiguration rather than a
  -- limit, so it is refused instead of silently dropping every write.
  begin
    perform app.check_ingest_rate(v_tenant, v_other, 0, 120);
    v_state := 'admitted';
  exception when others then
    v_state := sqlstate;
  end;
  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('ingest throttle', 'agent', 'app.check_ingest_rate', 'a zero limit is refused, not obeyed', '22023', v_state, v_state = '22023');

  -- 5. Old windows prune themselves: a row ten minutes old cannot be current, so
  -- the next check must delete it. Without this the table grows a row per device
  -- per minute forever, and no scheduler exists yet to clean it.
  insert into ingest_rate_windows (tenant_id, bucket, window_start, event_count)
  values (v_tenant, 'device:' || v_prune::text, now() - interval '10 minutes', 999);
  perform app.check_ingest_rate(v_tenant, v_prune, 60, 120);
  select count(*) into v_n from ingest_rate_windows
   where window_start < date_trunc('minute', now()) - interval '5 minutes';
  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('ingest throttle', 'agent', 'ingest_rate_windows', 'stale windows are pruned by the check itself', '0', v_n::text, v_n = 0);

  -- 6. End to end through the real ingest path, at production defaults. The loop
  -- runs until the first refusal and asserts the refusal immediately follows the
  -- admissions (R = A + 1, proving exactness: no early refusal, no silent drop)
  -- with at least a full window's worth admitted. Pinning exactly 61 would flake
  -- if a minute boundary crossed mid-loop and reset the count; the relative
  -- assertion holds across it. This is the probe that catches a check the
  -- migration forgot to wire to a trigger.
  perform p5_claims('agent', v_tenant, v_agent);
  execute 'set local role authenticated';
  v_admitted := 0;
  v_refused_at := 0;
  for v_n in 1..130 loop
    begin
      v_ok := app.ingest_telemetry_event(
        gen_random_uuid(), v_flood, 'throttle-probe', 'query', 1, now(),
        jsonb_build_object(
          'outcome', 'answered', 'sopId', '1', 'score', 0.8, 'margin', 0.2,
          'gateReason', null, 'thresholdAccept', 0, 'minMargin', 0.18,
          'topCandidates', jsonb_build_array(
            jsonb_build_object('sopId', '1', 'score', 0.8, 'passage', 'throttle probe'))
        ));
      if not v_ok then
        raise exception 'ingest returned false rather than raising';
      end if;
      v_admitted := v_admitted + 1;
    exception when others then
      if v_refused_at = 0 then v_refused_at := v_n; end if;
      if sqlstate != 'P0001' then
        raise exception 'flood probe raised %, not P0001', sqlstate;
      end if;
      exit;
    end;
  end loop;
  execute 'reset role';
  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('ingest throttle', 'agent', 'app.ingest_telemetry_event', 'a full window admitted then the next refused',
    'admitted>=60 and refused_at=admitted+1',
    'admitted=' || v_admitted || ' refused_at=' || v_refused_at,
    v_admitted >= 60 and v_refused_at = v_admitted + 1);

  -- 7. The escalation trigger exists and does not break the normal path. An
  -- escalation names a real event and its evidence must match that event, so this
  -- ingests a proper escalated event first and then the escalation that names it.
  -- The event goes through the enrolled v_escdev: ingest rejects unenrolled
  -- devices, and borrowing a seed device would share its bucket. Wrapped, so any
  -- failure here lands on this named row rather than the outer backstop.
  perform p5_claims('agent', v_tenant, v_agent);
  execute 'set local role authenticated';
  v_ev_id := gen_random_uuid();
  v_ev_at := now();
  begin
    perform app.ingest_telemetry_event(
      v_ev_id, v_escdev, 'throttle-probe', 'query', 1, v_ev_at,
      jsonb_build_object(
        'outcome', 'escalated', 'sopId', null, 'score', null, 'margin', null,
        'gateReason', 'insufficient_margin', 'thresholdAccept', 0, 'minMargin', 0.18,
        'topCandidates', jsonb_build_array(
          jsonb_build_object('sopId', '1', 'score', 0.8, 'passage', 'throttle probe'))
      ));
    v_ok := app.ingest_escalation(
      gen_random_uuid(), v_ev_id, v_ev_at,
      jsonb_build_object(
        'queryText', 'throttle probe escalation', 'reason', 'insufficient_margin',
        'thresholdAccept', 0, 'minMargin', 0.18, 'bundleVersion', 1,
        'modelId', 'throttle-probe', 'modelRevision', 'throttle-probe',
        'candidates', jsonb_build_array(
          jsonb_build_object('sopId', '1', 'score', 0.8, 'passage', 'throttle probe'))
      ));
    v_state := 'event+escalation ok=' || v_ok::text;
  exception when others then
    v_state := sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('ingest throttle', 'agent', 'app.ingest_escalation', 'an escalation still ingests under the limit',
    'event+escalation ok=true', v_state, v_state = 'event+escalation ok=true');
exception when others then
  begin
    execute 'reset role';
  exception when others then null;
  end;

  insert into phase5_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('ingest throttle', 'agent', 'ingest_rate_windows', 'probe', 'ok', 'failure:' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- 8. The helper is closed to direct calls: it is only meaningful inside the
-- ingest path, and the exposed `app` schema would otherwise offer it to anyone
-- holding a key.
select p5_probe('ingest throttle', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'app.check_ingest_rate', 'direct call refused',
  $q$ select app.check_ingest_rate('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000093', 60, 120) $q$,
  'blocked', 'denied:privilege');

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
