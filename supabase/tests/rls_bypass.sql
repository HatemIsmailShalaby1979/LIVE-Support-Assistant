-- RLS bypass suite — Phase 7.
--
-- The RBAC matrix proves what each role MAY do. This file proves what no role
-- can do: every vector that could defeat tenant isolation, attempted for real
-- and asserted as refused. A guarantee that has never been attacked is not a
-- guarantee, so each probe here is an attack that must fail.
--
-- Vectors covered:
--   1. no tenant claim at all          — every read and write denied
--   2. function argument abuse         — tenant arguments cannot cross tenants
--   3. dashboard view leakage          — the Phase 5 views respect RLS
--   4. key-rotation surfaces (0011)    — only the ops manager touches the ledger
--   5. schema-object planting          — authenticated cannot create functions
--   6. privilege escalation            — no UPDATE/DELETE on the key ledger
--
-- Positive controls are included deliberately: the marker escalation the Alpha
-- ops manager CAN see, and the key version Alpha CAN revoke. Without them a
-- broken suite in which everything is denied would also report zero failures.
--
-- Run: psql -f supabase/tests/rls_bypass.sql

\set ON_ERROR_STOP off

drop table if exists bypass_results;

create table bypass_results (
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

create or replace function b_claims(p_role app_role, p_tenant uuid, p_user uuid)
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

-- The anonymous case: an authenticated role with NO tenant claim, which is what
-- a malformed or stripped token looks like to the database.
create or replace function b_no_claims()
returns void
language sql
as $$
  select set_config('request.jwt.claims', '', true)
$$;

create or replace function b_probe(
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
    perform b_claims(p_role, p_tenant, p_user);
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

  insert into bypass_results (section, role_name, object_name, operation, expected, observed, ok)
  values (
    p_section, coalesce(p_role::text, 'anonymous'), p_object, p_operation, p_expect, v_observed,
    case
      when p_expect = 'allowed' then v_observed like 'rows:%' and v_observed <> 'rows:0'
      when p_denial is not null then v_observed = p_denial
      else v_observed = 'rows:0' or v_observed like 'denied:%' or v_observed like 'error:%'
    end
  );
end;
$$;

create or replace function b_read(
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
    perform b_claims(p_role, p_tenant, p_user);
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

  insert into bypass_results (section, role_name, object_name, operation, expected, observed, ok)
  values (
    p_section, p_role::text, p_object, 'select', p_expect_rows::text, v_observed,
    coalesce(v_count = p_expect_rows, false)
  );
end;
$$;

-- Anonymous reads: same helpers, but the claim is stripped.
create or replace function b_anon_read(
  p_section text,
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
    perform b_no_claims();
    execute 'set local role authenticated';

    begin
      execute format('select count(*) from (%s) q', p_query) into v_count;
      v_observed := 'rows:' || v_count;
    exception
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

  insert into bypass_results (section, role_name, object_name, operation, expected, observed, ok)
  values (
    p_section, 'anonymous', p_object, 'select', p_expect_rows::text, v_observed,
    coalesce(v_count = p_expect_rows, false)
  );
end;
$$;

\o /dev/null

-- ============================= no tenant claim =============================
-- A stripped or malformed token must see nothing anywhere.

select b_anon_read('no tenant claim', 'sops',
  $q$ select 1 from sops $q$, 0);

select b_anon_read('no tenant claim', 'telemetry_events',
  $q$ select 1 from telemetry_events $q$, 0);

select b_anon_read('no tenant claim', 'escalations',
  $q$ select 1 from escalations $q$, 0);

select b_anon_read('no tenant claim', 'tenant_key_versions',
  $q$ select 1 from tenant_key_versions $q$, 0);

-- And the ingest paths refuse before touching a row.
select b_probe('no tenant claim', null, null, null,
  'telemetry_events', 'ingest event with no claim',
  $q$ select app.ingest_telemetry_event(gen_random_uuid(), null, 'x', 'query', 1,
        now(), '{}'::jsonb) $q$,
  'blocked', 'denied:privilege');

select b_probe('no tenant claim', null, null, null,
  'escalations', 'ingest escalation with no claim',
  $q$ select app.ingest_escalation(gen_random_uuid(), gen_random_uuid(),
        now(), '{}'::jsonb) $q$,
  'blocked', 'denied:privilege');

-- ========================== function argument abuse ==========================
-- Every function that takes a tenant argument is a smuggler's road unless RLS
-- scopes the body. Each one is probed with another tenant's id.

select b_read('function argument abuse', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001',
  'app.enrolled_devices',
  $q$ select 1 from app.enrolled_devices('11111111-1111-1111-1111-111111111111') $q$,
  0);

select b_probe('function argument abuse', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001',
  'app.publish_policy_bundle', 'publish into another tenant',
  $q$ select app.publish_policy_bundle('11111111-1111-1111-1111-111111111111', 'm', 's',
        'Xenova/all-MiniLM-L6-v2', '751bff37', 'q8', '\x00'::bytea,
        'b0000000-0000-0000-0000-000000000001') $q$,
  'blocked');

-- next_bundle_version leaks nothing even when aimed at another tenant: the body
-- reads policy_bundles through RLS, so it sees no foreign rows and returns 1.
select b_read('function argument abuse', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001',
  'app.next_bundle_version',
  $q$ select app.next_bundle_version('11111111-1111-1111-1111-111111111111') = 1 $q$,
  1);

-- ============================ dashboard view leakage =========================
-- A distinctive marker escalation is inserted for Alpha. Beta's ops manager —
-- the strongest foreign role — must not see it through any of the Phase 5 views.

do $$
begin
  insert into escalations (id, tenant_id, query_event_id, query_occurred_at, evidence)
  values ('cc000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
          'aa000000-0000-0000-0000-000000000001', '2026-09-20 10:00:00+00',
          '{"queryText":"marker","reason":"insufficient_margin","thresholdAccept":0,"minMargin":0.15,"bundleVersion":1,"modelId":"leak-marker-model","modelRevision":"r","candidates":[]}'::jsonb);
exception when others then
  null;  -- already inserted on a re-run
end $$;

-- Positive control: Alpha's own ops manager sees the marker.
select b_read('dashboard view leakage', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
  'ops_escalation_dashboard',
  $q$ select 1 from app.ops_escalation_dashboard where model_id = 'leak-marker-model' $q$,
  1);

-- The attack: Beta must not see it.
select b_read('dashboard view leakage', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001',
  'ops_escalation_dashboard',
  $q$ select 1 from app.ops_escalation_dashboard where model_id = 'leak-marker-model' $q$,
  0);

select b_read('dashboard view leakage', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001',
  'ops_gate_funnel',
  $q$ select 1 from app.ops_gate_funnel
        where tenant_id = '11111111-1111-1111-1111-111111111111' $q$,
  0);

select b_read('dashboard view leakage', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001',
  'ops_threshold_changes',
  $q$ select 1 from app.ops_threshold_changes
        where tenant_id = '11111111-1111-1111-1111-111111111111' $q$,
  0);

select b_probe('ingest write boundary', 'agent',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004',
  'telemetry_events', 'direct telemetry insert',
  $q$ insert into telemetry_events (
       id, tenant_id, user_pseudonym, event_type, bundle_version, occurred_at, payload
     ) values (
       gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'forged', 'query', 1,
       now(), '{"outcome":"answered"}'::jsonb
     ) $q$,
  'blocked', 'denied:privilege');

select b_probe('ingest write boundary', 'agent',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004',
  'telemetry_ingest_dedup', 'pre-claim event id',
  $q$ insert into telemetry_ingest_dedup (id, tenant_id)
     values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111') $q$,
  'blocked', 'denied:privilege');

select b_probe('ingest write boundary', 'agent',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004',
  'escalations', 'direct escalation insert',
  $q$ insert into escalations (tenant_id, query_event_id, query_occurred_at, evidence)
     values (
       '11111111-1111-1111-1111-111111111111',
       'aa000000-0000-0000-0000-000000000001', '2026-09-20 10:00:00+00', '{}'::jsonb
     ) $q$,
  'blocked', 'denied:privilege');

select b_probe('ingest write boundary', 'team_lead',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003',
  'escalations', 'rewrite immutable evidence',
  $q$ update escalations set evidence = '{"forged":true}'::jsonb
      where id = 'ab000000-0000-0000-0000-000000000001' $q$,
  'blocked', 'denied:privilege');

select b_probe('ingest write boundary', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
  'escalations', 'rewrite immutable provenance',
  $q$ update escalations set query_event_id = gen_random_uuid()
      where id = 'ab000000-0000-0000-0000-000000000001' $q$,
  'blocked', 'denied:privilege');

select b_probe('ingest write boundary', 'team_lead',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003',
  'escalations', 'assign foreign-tenant user',
  $q$ update escalations set assigned_to = 'b0000000-0000-0000-0000-000000000002'
      where id = 'ab000000-0000-0000-0000-000000000001' $q$,
  'blocked', 'error:23503');

select b_probe('ingest write boundary', 'team_lead',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003',
  'escalations', 'link foreign-tenant SOP version',
  $q$ update escalations set linked_sop_version = 'e0000000-0000-0000-0000-000000000002'
      where id = 'ab000000-0000-0000-0000-000000000001' $q$,
  'blocked', 'error:23503');

select b_probe('ingest write boundary', 'agent',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004',
  'tenant_threshold_changes', 'forge threshold audit row',
  $q$ insert into tenant_threshold_changes (
       tenant_id, previous_threshold, new_threshold,
       previous_min_margin, new_min_margin, changed_by
     ) values (
       '11111111-1111-1111-1111-111111111111', 0, 0.1, 0.15, 0.01,
       'a0000000-0000-0000-0000-000000000004'
     ) $q$,
  'blocked', 'denied:privilege');

select b_probe('ingest write boundary', 'auditor',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000005',
  'app.ingest_escalation', 'auditor calls ingest function',
  $q$ select app.ingest_escalation(gen_random_uuid(),
        'aa000000-0000-0000-0000-000000000001', '2026-09-20 10:00:00+00',
        '{"reason":"no_candidates"}'::jsonb) $q$,
  'blocked', 'denied:privilege');

-- ============================ key rotation surfaces ==========================
-- The 0011 ledger: only the tenant's ops manager records and revokes.

do $$
begin
  insert into tenant_key_versions (tenant_id, kind, version, public_key)
  values ('11111111-1111-1111-1111-111111111111', 'wrapping', 1, 'b64-alpha-wrap-pub-v1')
  on conflict (tenant_id, kind, version) do nothing;
exception when others then
  null;
end $$;

-- Positive control: Alpha's ops manager revokes its own key version.
select b_probe('key rotation surfaces', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
  'app.revoke_tenant_key', 'revoke own wrapping key version 1',
  $q$ select app.revoke_tenant_key('11111111-1111-1111-1111-111111111111', 'wrapping', 1) $q$,
  'allowed');

-- The attacks, each of which must be refused.
select b_probe('key rotation surfaces', 'sop_editor',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002',
  'app.revoke_tenant_key', 'editor revokes a key',
  $q$ select app.revoke_tenant_key('11111111-1111-1111-1111-111111111111', 'wrapping', 1) $q$,
  'blocked');

select b_probe('key rotation surfaces', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001',
  'app.revoke_tenant_key', 'revoke another tenant''s key',
  $q$ select app.revoke_tenant_key('11111111-1111-1111-1111-111111111111', 'wrapping', 1) $q$,
  'blocked');

select b_probe('key rotation surfaces', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
  'app.revoke_tenant_key', 'revoke with an unknown kind',
  $q$ select app.revoke_tenant_key('11111111-1111-1111-1111-111111111111', 'master', 1) $q$,
  'blocked');

select b_probe('key rotation surfaces', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
  'app.revoke_tenant_key', 'revoke a version that does not exist',
  $q$ select app.revoke_tenant_key('11111111-1111-1111-1111-111111111111', 'wrapping', 99) $q$,
  'blocked');

select b_probe('key rotation surfaces', 'agent',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000004',
  'tenant_key_versions', 'agent records a key version',
  $q$ insert into tenant_key_versions (tenant_id, kind, version, public_key)
       values ('11111111-1111-1111-1111-111111111111', 'signing', 1, 'forged') $q$,
  'blocked');

-- And the revocation actually happened, once.
select b_read('key rotation surfaces', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
  'tenant_key_versions',
  $q$ select 1 from tenant_key_versions
        where tenant_id = '11111111-1111-1111-1111-111111111111'
          and kind = 'wrapping' and version = 1
          and revoked_at is not null $q$,
  1);

-- ============================ schema object planting =========================
-- A trojan function in app or public would hijack every SECURITY DEFINER call.
-- Creating one must be impossible for the API role.

select b_probe('schema object planting', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
  'schema app', 'create function in app schema',
  $q$ create function app.bypass_probe() returns void language sql as $$ select 1 $$ $q$,
  'blocked');

insert into bypass_results (section, role_name, object_name, operation, expected, observed, ok)
select
  'schema object planting',
  'authenticated',
  'schema ' || n.nspname,
  'create privilege',
  'not granted',
  case when has_schema_privilege('authenticated', n.nspname, 'CREATE')
       then 'granted' else 'not granted' end,
  not has_schema_privilege('authenticated', n.nspname, 'CREATE')
from (values ('public'), ('app'), ('auth')) as s(name)
join pg_namespace n on n.nspname = s.name;

-- ============================ privilege escalation ============================
-- The key ledger is append-only by privilege, like telemetry.

insert into bypass_results (section, role_name, object_name, operation, expected, observed, ok)
select
  'privilege escalation',
  'authenticated',
  'tenant_key_versions',
  p.verb,
  'blocked',
  case when has_table_privilege('authenticated', 'public.tenant_key_versions', p.verb)
       then 'granted' else 'not granted' end,
  not has_table_privilege('authenticated', 'public.tenant_key_versions', p.verb)
from (values ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(verb);

insert into bypass_results (section, role_name, object_name, operation, expected, observed, ok)
select
  'privilege escalation',
  'authenticated',
  c.relname,
  'row level security',
  'allowed',
  case when c.relrowsecurity then 'enabled' else 'DISABLED' end,
  c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'tenant_key_versions';

-- Direct UPDATE bypass attempt on the ledger, even by an ops manager.
select b_probe('privilege escalation', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
  'tenant_key_versions', 'un-revoke a key version directly',
  $q$ update tenant_key_versions set revoked_at = null
       where tenant_id = '11111111-1111-1111-1111-111111111111' $q$,
  'blocked');

-- =================================== report =================================

\o

\echo ''
\echo '=== RLS bypass suite by section ==='
select
  section,
  count(*) filter (where ok) as passed,
  count(*) as total,
  count(*) filter (where not ok) as failed
from bypass_results
group by section
order by section;

\echo ''
\echo '=== failures ==='
select role_name, object_name, operation, expected, observed
from bypass_results
where not ok
order by id;

\echo ''
select case
  when count(*) = 0 then 'RLS BYPASS SUITE OK'
  else 'RLS BYPASS SUITE FAILED: ' || count(*) || ' probe(s)'
end as verdict
from bypass_results
where not ok;
