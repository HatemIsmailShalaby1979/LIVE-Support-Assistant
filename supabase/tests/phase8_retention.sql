-- Retention and redaction suite — Phase 8.
--
-- Migration 0015 is retention plus redaction. This file proves three things:
-- expired data is removed, recent data is untouched, and the retention entry
-- point is denied to every application role.
--
-- The partition-drop path is proved with a temporary January 2026 partition. The
-- default-partition behavior and scheduler idempotence are deliberately not in
-- this pass.
--
-- Run: bash tooling/db/verify-phase7.sh

\set ON_ERROR_STOP off

drop table if exists retention_results;

create table retention_results (
  id         serial primary key,
  section    text not null,
  check_name text not null,
  expected   text not null,
  observed   text not null,
  ok         boolean not null
);

-- ------------------------------------------------------------------ helpers ---

create or replace function r_expect(p_section text, p_check text, p_expected text, p_observed text, p_ok boolean)
returns void
language sql
as $$
  insert into retention_results (section, check_name, expected, observed, ok)
  values (p_section, p_check, p_expected, p_observed, p_ok)
$$;

create or replace function r_claims(p_role text, p_tenant uuid, p_user uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_user::text,
      'app_metadata', jsonb_build_object(
        'tenant_id', p_tenant::text,
        'app_role', p_role
      )
    )::text,
    true
  )
$$;

create or replace function r_denied(p_role text, p_sql text)
returns text
language plpgsql
as $$
declare
  v_seen text;
begin
  begin
    perform r_claims(p_role, '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000');
    execute 'set local role authenticated';
    begin
      execute p_sql;
      v_seen := 'ALLOWED';
    exception
      when insufficient_privilege then v_seen := 'denied:privilege';
      when others then v_seen := 'error:' || sqlstate;
    end;
    execute 'reset role';
  exception when others then
    v_seen := 'probe_failure:' || sqlstate;
  end;
  return v_seen;
end;
$$;

-- -------------------------------------------------------------------- seed ---

create or replace function r_seed()
returns void
language plpgsql
as $$
declare
  v_tenant    uuid := '11111111-1111-1111-1111-111111111111';
  v_agent     uuid;
  v_old_event uuid := 'e0000000-0000-0000-0000-000000000011';
  v_new_event uuid := 'e0000000-0000-0000-0000-000000000012';
  v_old_esc   uuid := 'c0000000-0000-0000-0000-000000000011';
  v_new_esc   uuid := 'c0000000-0000-0000-0000-000000000012';
  v_old_at    timestamptz := timestamptz '2026-01-15 12:00:00+00';
  v_new_at    timestamptz := now() - interval '1 day';
  v_old_event_payload jsonb;
  v_new_event_payload jsonb;
  v_old_evidence jsonb;
  v_new_evidence jsonb;
begin
  -- Delete this suite's own fixture rows first. A retention suite that does not
  -- start clean can pass vacuously on a re-run, because the first run already
  -- removed the expired fixture it now claims to delete.
  delete from escalations where id in (v_old_esc, v_new_esc);
  delete from telemetry_events where id in (v_old_event, v_new_event);
  delete from telemetry_ingest_dedup where id in (v_old_event, v_new_event);
  drop table if exists telemetry_events_2026_01;
  create table telemetry_events_2026_01 partition of telemetry_events
    for values from ('2026-01-01 00:00:00+00') to ('2026-02-01 00:00:00+00');

  -- Resolved by email, not by a psql variable: this is a dollar-quoted body, and
  -- psql expands nothing inside one.
  select id into v_agent from auth.users where email = 'agent@alpha.example';
  if v_agent is null then
    raise exception 'retention fixture needs agent@alpha.example';
  end if;

  v_old_event_payload := jsonb_build_object(
    'outcome', 'escalated', 'sopId', null, 'score', null, 'margin', null,
    'gateReason', 'insufficient_margin', 'thresholdAccept', 0, 'minMargin', 0.18,
    'queryText', 'expired retention question',
    'topCandidates', jsonb_build_array(
      jsonb_build_object('sopId', 'retention-old-sop', 'score', 0.5, 'passage', 'retention old passage')
    )
  );
  v_new_event_payload := jsonb_build_object(
    'outcome', 'escalated', 'sopId', null, 'score', null, 'margin', null,
    'gateReason', 'insufficient_margin', 'thresholdAccept', 0, 'minMargin', 0.18,
    'queryText', 'recent retention question',
    'topCandidates', jsonb_build_array(
      jsonb_build_object('sopId', 'retention-new-sop', 'score', 0.4, 'passage', 'retention new passage')
    )
  );
  v_old_evidence := jsonb_build_object(
    'queryText', 'expired retention question', 'reason', 'insufficient_margin',
    'thresholdAccept', 0, 'minMargin', 0.18, 'bundleVersion', 1,
    'modelId', 'retention-model', 'modelRevision', 'retention-rev-1',
    'candidates', v_old_event_payload -> 'topCandidates'
  );
  v_new_evidence := jsonb_build_object(
    'queryText', 'recent retention question', 'reason', 'insufficient_margin',
    'thresholdAccept', 0, 'minMargin', 0.18, 'bundleVersion', 1,
    'modelId', 'retention-model', 'modelRevision', 'retention-rev-1',
    'candidates', v_new_event_payload -> 'topCandidates'
  );

  perform r_claims('agent', v_tenant, v_agent);
  execute 'set local role authenticated';

  perform app.ingest_telemetry_event(
    v_old_event, null, 'retention-old', 'query', 1, v_old_at, v_old_event_payload
  );
  perform app.ingest_telemetry_event(
    v_new_event, null, 'retention-new', 'query', 1, v_new_at, v_new_event_payload
  );
  perform app.ingest_escalation(v_old_esc, v_old_event, v_old_at, v_old_evidence);
  perform app.ingest_escalation(v_new_esc, v_new_event, v_new_at, v_new_evidence);

  execute 'reset role';
end;
$$;

-- --------------------------------------------------------- 1. it does work ---

\echo ''
\echo '=== section 1: retention removes what it should ==='

select r_seed();

-- Negative control first: if the expired fixture is absent, the removal checks
-- below prove nothing. A retention function that does nothing must fail here.
select r_expect('1 removes what it should', 'an expired event is present before the run', '1',
  (select count(*) from telemetry_events where id = 'e0000000-0000-0000-0000-000000000011')::text,
  (select count(*) from telemetry_events where id = 'e0000000-0000-0000-0000-000000000011') = 1);

select r_expect('1 removes what it should', 'its query text is readable before the run', 'expired retention question',
  (select payload ->> 'queryText' from telemetry_events where id = 'e0000000-0000-0000-0000-000000000011'),
  (select payload ->> 'queryText' from telemetry_events where id = 'e0000000-0000-0000-0000-000000000011') = 'expired retention question');

select app.run_retention(interval '90 days');

select r_expect('1 removes what it should', 'the expired monthly partition is gone', 'gone',
  coalesce(to_regclass('public.telemetry_events_2026_01')::text, 'gone'),
  to_regclass('public.telemetry_events_2026_01') is null);

select r_expect('1 removes what it should', 'the expired event row is gone with it', '0',
  (select count(*) from telemetry_events where id = 'e0000000-0000-0000-0000-000000000011')::text,
  (select count(*) from telemetry_events where id = 'e0000000-0000-0000-0000-000000000011') = 0);

select r_expect('1 removes what it should', 'the expired escalation row still exists', '1',
  (select count(*) from escalations where id = 'c0000000-0000-0000-0000-000000000011')::text,
  (select count(*) from escalations where id = 'c0000000-0000-0000-0000-000000000011') = 1);

select r_expect('1 removes what it should', 'its query text is redacted rather than readable', '[redacted by retention policy]',
  (select evidence ->> 'queryText' from escalations where id = 'c0000000-0000-0000-0000-000000000011'),
  (select evidence ->> 'queryText' from escalations where id = 'c0000000-0000-0000-0000-000000000011') = '[redacted by retention policy]');

select r_expect('1 removes what it should', 'the non-PII evidence is preserved on that row', 'insufficient_margin/1/1',
  (select (evidence ->> 'reason') || '/' || (evidence ->> 'bundleVersion') || '/' || jsonb_array_length(evidence -> 'candidates')::text
     from escalations where id = 'c0000000-0000-0000-0000-000000000011'),
  (select (evidence ->> 'reason') || '/' || (evidence ->> 'bundleVersion') || '/' || jsonb_array_length(evidence -> 'candidates')::text
     from escalations where id = 'c0000000-0000-0000-0000-000000000011') = 'insufficient_margin/1/1');

-- --------------------------------------------------------- 2. it is not too eager ---

\echo ''
\echo '=== section 2: retention never touches live data ==='

select r_expect('2 never too eager', 'the current monthly partition still exists', 'present',
  coalesce(to_regclass('public.telemetry_events_2026_09')::text, 'absent'),
  to_regclass('public.telemetry_events_2026_09') is not null);

select r_expect('2 never too eager', 'the recent event row survives', '1',
  (select count(*) from telemetry_events where id = 'e0000000-0000-0000-0000-000000000012')::text,
  (select count(*) from telemetry_events where id = 'e0000000-0000-0000-0000-000000000012') = 1);

select r_expect('2 never too eager', 'a recent question is still readable', 'recent retention question',
  (select payload ->> 'queryText' from telemetry_events where id = 'e0000000-0000-0000-0000-000000000012'),
  (select payload ->> 'queryText' from telemetry_events where id = 'e0000000-0000-0000-0000-000000000012') = 'recent retention question');

select r_expect('2 never too eager', 'a recent escalation is not redacted', 'recent retention question',
  (select evidence ->> 'queryText' from escalations where id = 'c0000000-0000-0000-0000-000000000012'),
  (select evidence ->> 'queryText' from escalations where id = 'c0000000-0000-0000-0000-000000000012') = 'recent retention question');

-- ------------------------------------------------- 3. closed to application roles ---

\echo ''
\echo '=== section 3: closed to every application role ==='

select r_expect('3 closed to app roles', 'ops_manager cannot run retention', 'denied:privilege',
  r_denied('ops_manager', 'select app.run_retention(interval ''90 days'')'),
  r_denied('ops_manager', 'select app.run_retention(interval ''90 days'')') = 'denied:privilege');

select r_expect('3 closed to app roles', 'team_lead cannot run retention', 'denied:privilege',
  r_denied('team_lead', 'select app.run_retention(interval ''90 days'')'),
  r_denied('team_lead', 'select app.run_retention(interval ''90 days'')') = 'denied:privilege');

select r_expect('3 closed to app roles', 'agent cannot run retention', 'denied:privilege',
  r_denied('agent', 'select app.run_retention(interval ''90 days'')'),
  r_denied('agent', 'select app.run_retention(interval ''90 days'')') = 'denied:privilege');

select r_expect('3 closed to app roles', 'auditor cannot run retention', 'denied:privilege',
  r_denied('auditor', 'select app.run_retention(interval ''90 days'')'),
  r_denied('auditor', 'select app.run_retention(interval ''90 days'')') = 'denied:privilege');

select r_expect('3 closed to app roles', 'sop_editor cannot run retention', 'denied:privilege',
  r_denied('sop_editor', 'select app.run_retention(interval ''90 days'')'),
  r_denied('sop_editor', 'select app.run_retention(interval ''90 days'')') = 'denied:privilege');

-- ------------------------------------------------------------------- verdict ---

\echo ''
\echo '=== retention results by section ==='
select section, count(*) filter (where ok) as passed, count(*) as total
from retention_results
group by section
order by section;

\echo ''
\echo '=== failures ==='
select section, check_name, expected, observed
from retention_results
where not ok
order by id;

\echo ''
select case
  when count(*) = 0 then 'RETENTION SUITE OK'
  else 'RETENTION SUITE FAILED: ' || count(*) || ' check(s)'
end as verdict
from retention_results
where not ok;
