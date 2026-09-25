-- RBAC matrix.
--
-- Proves two independent guarantees against a real PostgreSQL rather than
-- asserting them in a document:
--
--   1. tenant isolation  — no role in tenant B can read or write tenant A's rows
--   2. role capability   — which roles hold which verbs, table by table
--
-- Each probe assumes the `authenticated` role with a JWT payload for the acting
-- user, exactly as a Supabase request would, then attempts the operation and
-- records what actually happened.
--
-- A probe is "allowed" when it succeeds and affects at least one row, and
-- "blocked" when it raises a privilege error or affects no rows. Both are real
-- denials: RLS filters silently for reads and for updates whose USING clause
-- fails, and raises for inserts whose WITH CHECK fails.
--
-- Run: psql -f supabase/tests/rbac_matrix.sql

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


drop table if exists rbac_results;

create table rbac_results (
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

create or replace function rbac_claims(p_role app_role, p_tenant uuid, p_user uuid)
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

-- Probe a write. Expectation is 'allowed' or 'blocked'.
create or replace function rbac_probe(
  p_section text,
  p_role app_role,
  p_tenant uuid,
  p_user uuid,
  p_object text,
  p_operation text,
  p_sql text,
  p_expect text
) returns void
language plpgsql
as $$
declare
  v_observed text;
  v_rows bigint;
begin
  begin
    perform rbac_claims(p_role, p_tenant, p_user);
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

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values (
    p_section, p_role::text, p_object, p_operation, p_expect, v_observed,
    case
      when p_expect = 'allowed' then v_observed like 'rows:%' and v_observed <> 'rows:0'
      else v_observed = 'rows:0' or v_observed like 'denied:%' or v_observed like 'error:%'
    end
  );
end;
$$;

-- Probe a read. Expectation is the exact number of rows that must be visible.
create or replace function rbac_probe_read(
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
    perform rbac_claims(p_role, p_tenant, p_user);
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

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values (
    p_section, p_role::text, p_object, 'select', p_expect_rows::text, v_observed,
    coalesce(v_count = p_expect_rows, false)
  );
end;
$$;

-- =============================== tenant isolation ==========================
-- Acting as Beta's ops manager, the most powerful role, against Alpha's rows.
-- Probe output is suppressed; the report at the foot of this file is the result.

\o /dev/null

select rbac_probe_read('tenant isolation', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', :'beta_ops',
  'sops', $q$ select 1 from sops where tenant_id = '11111111-1111-1111-1111-111111111111' $q$, 0);

select rbac_probe_read('tenant isolation', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', :'beta_ops',
  'sop_versions', $q$ select 1 from sop_versions where tenant_id = '11111111-1111-1111-1111-111111111111' $q$, 0);

select rbac_probe_read('tenant isolation', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', :'beta_ops',
  'policy_bundles', $q$ select 1 from policy_bundles where tenant_id = '11111111-1111-1111-1111-111111111111' $q$, 0);

select rbac_probe_read('tenant isolation', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', :'beta_ops',
  'telemetry_events', $q$ select 1 from telemetry_events where tenant_id = '11111111-1111-1111-1111-111111111111' $q$, 0);

select rbac_probe_read('tenant isolation', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', :'beta_ops',
  'escalations', $q$ select 1 from escalations where tenant_id = '11111111-1111-1111-1111-111111111111' $q$, 0);

select rbac_probe_read('tenant isolation', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', :'beta_ops',
  'users', $q$ select 1 from users where tenant_id = '11111111-1111-1111-1111-111111111111' $q$, 0);

select rbac_probe_read('tenant isolation', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', :'beta_ops',
  'device_registrations', $q$ select 1 from device_registrations where tenant_id = '11111111-1111-1111-1111-111111111111' $q$, 0);

select rbac_probe_read('tenant isolation', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', :'beta_ops',
  'tenants', $q$ select 1 from tenants where id = '11111111-1111-1111-1111-111111111111' $q$, 0);

-- Cross-tenant writes.
select rbac_probe('tenant isolation', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', :'beta_ops',
  'sops', 'update other tenant',
  $q$ update sops set title = 'hijacked' where tenant_id = '11111111-1111-1111-1111-111111111111' $q$,
  'blocked');

select rbac_probe('tenant isolation', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', :'beta_ops',
  'sops', 'insert into other tenant',
  $q$ insert into sops (tenant_id, title) values ('11111111-1111-1111-1111-111111111111', 'injected') $q$,
  'blocked');

select rbac_probe('tenant isolation', 'agent',
  '22222222-2222-2222-2222-222222222222', :'beta_agent',
  'telemetry_events', 'insert for other tenant',
  $q$ insert into telemetry_events (id, tenant_id, user_pseudonym, event_type, occurred_at, payload)
     values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'p', 'query', now(), '{}'::jsonb) $q$,
  'blocked');

select rbac_probe('tenant isolation', 'ops_manager',
  '22222222-2222-2222-2222-222222222222', :'beta_ops',
  'escalations', 'update other tenant',
  $q$ update escalations set status = 'resolved' where tenant_id = '11111111-1111-1111-1111-111111111111' $q$,
  'blocked');

-- ============================== SOP content roles ==========================

select rbac_probe('sop content roles', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'sops', 'insert',
  $q$ insert into sops (tenant_id, title) values ('11111111-1111-1111-1111-111111111111', 'Ops authored') $q$,
  'allowed');

select rbac_probe('sop content roles', 'sop_editor',
  '11111111-1111-1111-1111-111111111111', :'alpha_editor',
  'sops', 'insert',
  $q$ insert into sops (tenant_id, title) values ('11111111-1111-1111-1111-111111111111', 'Editor authored') $q$,
  'allowed');

select rbac_probe('sop content roles', 'team_lead',
  '11111111-1111-1111-1111-111111111111', :'alpha_lead',
  'sops', 'insert',
  $q$ insert into sops (tenant_id, title) values ('11111111-1111-1111-1111-111111111111', 'Lead authored') $q$,
  'blocked');

select rbac_probe('sop content roles', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'sops', 'insert',
  $q$ insert into sops (tenant_id, title) values ('11111111-1111-1111-1111-111111111111', 'Agent authored') $q$,
  'blocked');

select rbac_probe('sop content roles', 'auditor',
  '11111111-1111-1111-1111-111111111111', :'alpha_auditor',
  'sops', 'insert',
  $q$ insert into sops (tenant_id, title) values ('11111111-1111-1111-1111-111111111111', 'Auditor authored') $q$,
  'blocked');

select rbac_probe('sop content roles', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'sops', 'update',
  $q$ update sops set title = 'agent edited' where id = 'c0000000-0000-0000-0000-000000000001' $q$,
  'blocked');

select rbac_probe('sop content roles', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'sops', 'delete',
  $q$ delete from sops where id = 'c0000000-0000-0000-0000-000000000001' $q$,
  'blocked');

select rbac_probe('sop content roles', 'sop_editor',
  '11111111-1111-1111-1111-111111111111', :'alpha_editor',
  'sop_versions', 'insert',
  $q$ insert into sop_versions (sop_id, tenant_id, version, body_ciphertext, body_hash, created_by)
     values ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 2,
             '\x00'::bytea, 'hash-alpha-2', '$q$ || :'alpha_editor' || $q$') $q$,
  'allowed');

select rbac_probe('sop content roles', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'sop_versions', 'update published version',
  $q$ update sop_versions set body_hash = 'tampered' where id = 'e0000000-0000-0000-0000-000000000001' $q$,
  'blocked');

select rbac_probe('sop content roles', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'sop_versions', 'delete version',
  $q$ delete from sop_versions where id = 'e0000000-0000-0000-0000-000000000001' $q$,
  'blocked');

-- ============================== bundle publishing ==========================

select rbac_probe('bundle publishing', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'policy_bundles', 'publish version 2',
  $q$ insert into policy_bundles (tenant_id, bundle_version, manifest_hash, signature,
       model_id, model_revision, quantization, payload_ciphertext, published_by)
     values ('11111111-1111-1111-1111-111111111111', 2, 'm2', 's2',
             'Xenova/all-MiniLM-L6-v2', '751bff37', 'q8', '\x00'::bytea,
             '$q$ || :'alpha_ops' || $q$') $q$,
  'allowed');

select rbac_probe('bundle publishing', 'sop_editor',
  '11111111-1111-1111-1111-111111111111', :'alpha_editor',
  'policy_bundles', 'publish',
  $q$ insert into policy_bundles (tenant_id, bundle_version, manifest_hash, signature,
       model_id, model_revision, quantization, payload_ciphertext, published_by)
     values ('11111111-1111-1111-1111-111111111111', 3, 'm3', 's3',
             'Xenova/all-MiniLM-L6-v2', '751bff37', 'q8', '\x00'::bytea,
             '$q$ || :'alpha_editor' || $q$') $q$,
  'blocked');

-- The monotonic guard: version 9 when the tenant's maximum is 2.
select rbac_probe('bundle publishing', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'policy_bundles', 'publish non-monotonic version 9',
  $q$ insert into policy_bundles (tenant_id, bundle_version, manifest_hash, signature,
       model_id, model_revision, quantization, payload_ciphertext, published_by)
     values ('11111111-1111-1111-1111-111111111111', 9, 'm9', 's9',
             'Xenova/all-MiniLM-L6-v2', '751bff37', 'q8', '\x00'::bytea,
             '$q$ || :'alpha_ops' || $q$') $q$,
  'blocked');

select rbac_probe('bundle publishing', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'policy_bundles', 'rewrite published bundle',
  $q$ update policy_bundles set manifest_hash = 'rewritten' where id = 'f0000000-0000-0000-0000-000000000001' $q$,
  'blocked');

-- ============================ bundle publish path ==========================
-- The database half of the publish path. The seed starts this tenant at bundle
-- version 1, and the section above published version 2, so the next is 3.

do $$
declare
  v_tenant  uuid := '11111111-1111-1111-1111-111111111111';
  v_ops     uuid;
  v_editor  uuid;
  v_version bigint;
  v_observed text;
  v_own_devices bigint;
  v_foreign_devices bigint;
  v_own_device uuid;
  v_next bigint;
begin
  -- Resolved by email: a dollar-quoted body, so psql expands nothing inside it,
  -- and a hosted project cannot choose these UUIDs. See the preamble.
  select id into v_ops from auth.users where email = 'ops@alpha.example';
  select id into v_editor from auth.users where email = 'editor@alpha.example';
  select id into v_own_device from device_registrations
   where tenant_id = v_tenant and platform = 'web' limit 1;
  perform rbac_claims('ops_manager', v_tenant, v_ops);
  execute 'set local role authenticated';

  -- The manifest is stored whole as jsonb and the columns are derived from it, so
  -- a publisher cannot sign one document and index another. The signature is
  -- opaque here: this matrix proves who may publish, not the crypto, which lives
  -- in tooling/transport/probe-bundle.mjs.
  -- The version is server-assigned, so the publisher asks for it before signing:
  -- a manifest that named a different version would be stored with columns that
  -- disagree with the document the signature covers, which is the exact hole the
  -- agreement constraint exists to close. Hard-coding a literal here only works
  -- until another probe publishes first.
  select app.next_bundle_version(v_tenant) into v_next;

  v_version := app.publish_policy_bundle(
    v_tenant,
    jsonb_build_object(
      'tenantId', v_tenant::text,
      'bundleVersion', v_next,
      'modelId', 'Xenova/all-MiniLM-L6-v2',
      'modelRevision', '751bff37182d3f1213fa05d7196b954e230abad9',
      'quantization', 'q8',
      'dimensions', 384,
      'payloadHash', 'hash-alpha-' || v_next,
      'iv', 'aXYtZm9yLXRoZS1wcm9iZQ==',
      'sopCount', 2,
      'publishedAt', '2026-09-25T00:00:00.000Z'
    ),
    'sig-3',
    '\x00'::bytea,
    jsonb_build_array(jsonb_build_object(
      'deviceId', v_own_device,
      'wrappedKey', encode('\x01'::bytea, 'base64')
    )),
    v_ops);

  -- Alpha has one enrolled device at this point in the fixtures; the device
  -- enrolment section below adds a second, later.
  select count(*) into v_own_devices from app.enrolled_devices(v_tenant);

  -- The function takes a tenant argument. It must not be usable to read another
  -- tenant's roster: RLS scopes the rows to the caller's claim, not to the
  -- argument.
  select count(*) into v_foreign_devices
    from app.enrolled_devices('22222222-2222-2222-2222-222222222222');

  execute 'reset role';

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('bundle publish path', 'ops_manager', 'policy_bundles',
          'publish assigns the next version', '3', v_version::text, v_version = 3);

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('bundle publish path', 'ops_manager', 'device_registrations',
          'own tenant devices returned for wrapping', '1', v_own_devices::text, v_own_devices = 1);

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('bundle publish path', 'ops_manager', 'device_registrations',
          'another tenant''s devices not returned', '0', v_foreign_devices::text, v_foreign_devices = 0);

  -- An editor may author procedure content but must not be able to push policy
  -- to every device.
  perform rbac_claims('sop_editor', v_tenant, v_editor);
  execute 'set local role authenticated';

  begin
    perform app.publish_policy_bundle(
      v_tenant,
      jsonb_build_object(
        'tenantId', v_tenant::text,
        'bundleVersion', (select app.next_bundle_version(v_tenant)),
        'modelId', 'Xenova/all-MiniLM-L6-v2',
        'modelRevision', '751bff37182d3f1213fa05d7196b954e230abad9',
        'quantization', 'q8',
        'dimensions', 384,
        'payloadHash', 'hash-alpha-editor',
        'iv', 'aXYtZm9yLXRoZS1wcm9iZQ==',
        'sopCount', 2,
        'publishedAt', '2026-09-25T00:00:00.000Z'
      ),
      'sig-4',
      '\x00'::bytea,
      jsonb_build_array(jsonb_build_object(
        'deviceId', v_own_device,
        'wrappedKey', encode('\x02'::bytea, 'base64')
      )),
      v_editor);
    v_observed := 'allowed';
  exception
    when others then v_observed := 'error:' || sqlstate || ' ' || sqlerrm;
  end;

  execute 'reset role';

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('bundle publish path', 'sop_editor', 'policy_bundles',
          'publish refused', 'blocked', v_observed, v_observed <> 'allowed');
exception when others then
  begin
    execute 'reset role';
  exception when others then null;
  end;

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('bundle publish path', 'ops_manager', 'policy_bundles',
          'probe', 'ok', 'failure:' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- ============================== threshold audit ============================
-- The gate parameters decide how much the system answers and how much it hands
-- to a human. A silent change is indistinguishable from a collapse in answer
-- quality, so every change must leave a record.

do $$
declare
  v_tenant   uuid := '11111111-1111-1111-1111-111111111111';
  v_ops      uuid;
  v_agent    uuid;
  v_before   bigint;
  v_after    bigint;
  v_previous numeric;
  v_observed text;
begin
  select id into v_ops from auth.users where email = 'ops@alpha.example';
  select id into v_agent from auth.users where email = 'agent@alpha.example';
  select count(*) into v_before from tenant_threshold_changes where tenant_id = v_tenant;

  perform rbac_claims('ops_manager', v_tenant, v_ops);
  execute 'set local role authenticated';
  update tenants set min_margin = 0.180 where id = v_tenant;
  execute 'reset role';

  select count(*) into v_after from tenant_threshold_changes where tenant_id = v_tenant;

  select previous_min_margin into v_previous
    from tenant_threshold_changes
   where tenant_id = v_tenant
   order by changed_at desc
   limit 1;

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('threshold audit', 'ops_manager', 'tenants',
          'threshold change recorded', '1', (v_after - v_before)::text, (v_after - v_before) = 1);

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('threshold audit', 'ops_manager', 'tenant_threshold_changes',
          'previous value recorded', '0.150', v_previous::text, v_previous = 0.150);

  -- An agent must not be able to move the threshold that governs their own work.
  perform rbac_claims('agent', v_tenant, v_agent);
  execute 'set local role authenticated';
  begin
    update tenants set min_margin = 0.010 where id = v_tenant;
    get diagnostics v_observed = row_count;
    v_observed := 'rows:' || v_observed;
  exception
    when others then v_observed := 'error:' || sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('threshold audit', 'agent', 'tenants',
          'threshold change refused', 'blocked', v_observed,
          v_observed = 'rows:0' or v_observed like 'error:%');
exception when others then
  begin
    execute 'reset role';
  exception when others then null;
  end;

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('threshold audit', 'ops_manager', 'tenants', 'probe', 'ok',
          'failure:' || sqlstate || ' ' || sqlerrm, false);
end $$;

select rbac_probe('threshold audit', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'tenant_threshold_changes', 'direct audit insert',
  $q$ insert into tenant_threshold_changes (
       tenant_id, previous_threshold, new_threshold,
       previous_min_margin, new_min_margin, changed_by
     ) values (
       '11111111-1111-1111-1111-111111111111', 0, 0.1, 0.15, 0.01,
       '$q$ || :'alpha_agent' || $q$'
     ) $q$,
  'blocked');

insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
select
  'threshold audit', 'authenticated', 'tenants', 'new tenant default',
  '0.180', column_default, (column_default::numeric = 0.180)
from information_schema.columns
where table_schema = 'public'
  and table_name = 'tenants'
  and column_name = 'min_margin';

-- ============================ telemetry append-only ========================

select rbac_probe('telemetry append-only', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'telemetry_events', 'direct insert',
  $q$ insert into telemetry_events (id, tenant_id, device_id, user_pseudonym, event_type, occurred_at, payload)
     values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
             'd0000000-0000-0000-0000-000000000001', 'pseudo-alpha-1', 'query', now(), '{}'::jsonb) $q$,
  'blocked');

select rbac_probe('telemetry append-only', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'telemetry_ingest_dedup', 'direct dedup claim',
  $q$ insert into telemetry_ingest_dedup (id, tenant_id)
     values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111') $q$,
  'blocked');

select rbac_probe('telemetry append-only', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'telemetry_events', 'update',
  $q$ update telemetry_events set payload = '{"result":"forged"}'::jsonb
      where id = 'aa000000-0000-0000-0000-000000000002' $q$,
  'blocked');

select rbac_probe('telemetry append-only', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'telemetry_events', 'update',
  $q$ update telemetry_events set payload = '{"result":"forged"}'::jsonb
      where id = 'aa000000-0000-0000-0000-000000000002' $q$,
  'blocked');

select rbac_probe('telemetry append-only', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'telemetry_events', 'delete',
  $q$ delete from telemetry_events where id = 'aa000000-0000-0000-0000-000000000002' $q$,
  'blocked');

select rbac_probe('telemetry append-only', 'auditor',
  '11111111-1111-1111-1111-111111111111', :'alpha_auditor',
  'telemetry_events', 'delete',
  $q$ delete from telemetry_events where id = 'aa000000-0000-0000-0000-000000000002' $q$,
  'blocked');

-- Read scope: telemetry carries query text, so a frontline agent cannot browse it.
select rbac_probe_read('telemetry append-only', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'telemetry_events', $q$ select 1 from telemetry_events $q$, 0);

select rbac_probe_read('telemetry append-only', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'telemetry_events', $q$ select 1 from telemetry_events $q$, 2);

select rbac_probe_read('telemetry append-only', 'auditor',
  '11111111-1111-1111-1111-111111111111', :'alpha_auditor',
  'telemetry_events', $q$ select 1 from telemetry_events $q$, 2);

select rbac_probe_read('telemetry append-only', 'team_lead',
  '11111111-1111-1111-1111-111111111111', :'alpha_lead',
  'telemetry_events', $q$ select 1 from telemetry_events $q$, 2);

select rbac_probe('telemetry idempotency', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'app.ingest_telemetry_event', 'foreign tenant device rejected',
  $q$ select app.ingest_telemetry_event(gen_random_uuid(),
        'd0000000-0000-0000-0000-000000000002', 'pseudo-alpha-1', 'query', 1,
        now(), '{"outcome":"answered"}'::jsonb) $q$,
  'blocked');

-- =========================== telemetry idempotency =========================
-- The replay with a drifted timestamp is the case the original composite-key
-- design missed: same event id, different occurred_at, which would have written
-- a second audit row.

do $$
declare
  v_tenant uuid := '11111111-1111-1111-1111-111111111111';
  v_user   uuid;
  v_id     uuid := gen_random_uuid();
  v_first  boolean;
  v_replay boolean;
  v_drift  boolean;
  v_rows   integer;
begin
  select id into v_user from auth.users where email = 'agent@alpha.example';
  perform rbac_claims('agent', v_tenant, v_user);
  execute 'set local role authenticated';

  v_first := app.ingest_telemetry_event(
    v_id, null, 'pseudo-alpha-1', 'query', 1,
    '2026-09-21 09:00:00+00', '{"outcome":"answered","sopId":"1","score":0.81,"margin":0.22,"gateReason":null,"thresholdAccept":0,"minMargin":0.18,"topCandidates":[{"sopId":"1","score":0.81,"passage":"candidate"}]}'::jsonb);

  v_replay := app.ingest_telemetry_event(
    v_id, null, 'pseudo-alpha-1', 'query', 1,
    '2026-09-21 09:00:00+00', '{"outcome":"answered","sopId":"1","score":0.81,"margin":0.22,"gateReason":null,"thresholdAccept":0,"minMargin":0.18,"topCandidates":[{"sopId":"1","score":0.81,"passage":"candidate"}]}'::jsonb);

  v_drift := app.ingest_telemetry_event(
    v_id, null, 'pseudo-alpha-1', 'query', 1,
    '2026-09-21 09:07:00+00', '{"outcome":"answered","sopId":"1","score":0.81,"margin":0.22,"gateReason":null,"thresholdAccept":0,"minMargin":0.18,"topCandidates":[{"sopId":"1","score":0.81,"passage":"candidate"}]}'::jsonb);

  -- Count as the owner: the agent role cannot read telemetry by policy.
  execute 'reset role';
  select count(*) into v_rows from telemetry_events where id = v_id;

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('telemetry idempotency', 'agent', 'telemetry_events',
          'first ingest accepted', 'true', v_first::text, v_first);

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('telemetry idempotency', 'agent', 'telemetry_events',
          'identical replay rejected', 'false', v_replay::text, not v_replay);

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('telemetry idempotency', 'agent', 'telemetry_events',
          'replay with drifted timestamp rejected', 'false', v_drift::text, not v_drift);

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('telemetry idempotency', 'agent', 'telemetry_events',
          'exactly one row exists for the id', '1', v_rows::text, v_rows = 1);
exception when others then
  begin
    execute 'reset role';
  exception when others then null;
  end;

  insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
  values ('telemetry idempotency', 'agent', 'telemetry_events',
          'probe', 'ok', 'failure:' || sqlstate || ' ' || sqlerrm, false);
end $$;

-- ================================ escalations ==============================

select rbac_probe('escalations', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'escalations', 'direct insert against a real query event',
  $q$ insert into escalations (tenant_id, query_event_id, query_occurred_at)
     values ('11111111-1111-1111-1111-111111111111',
             'aa000000-0000-0000-0000-000000000001', '2026-09-20 10:00:00+00') $q$,
  'blocked');

-- Referential integrity: an escalation cannot point at an event that never
-- existed. This is what the write-time trigger buys.
select rbac_probe('escalations', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'escalations', 'insert against a nonexistent query event',
  $q$ insert into escalations (tenant_id, query_event_id, query_occurred_at)
     values ('11111111-1111-1111-1111-111111111111',
             '00000000-0000-0000-0000-0000000000ff', '2026-09-20 10:00:00+00') $q$,
  'blocked');

-- And it cannot point at another tenant's event, which the trigger checks and a
-- foreign key would not have.
select rbac_probe('escalations', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'escalations', 'insert against another tenant''s query event',
  $q$ insert into escalations (tenant_id, query_event_id, query_occurred_at)
     values ('11111111-1111-1111-1111-111111111111',
             'bb000000-0000-0000-0000-000000000001', '2026-09-20 11:00:00+00') $q$,
  'blocked');

select rbac_probe('escalations', 'team_lead',
  '11111111-1111-1111-1111-111111111111', :'alpha_lead',
  'escalations', 'update',
  $q$ update escalations set status = 'resolved', resolution = 'answered by lead'
      where id = 'ab000000-0000-0000-0000-000000000001' $q$,
  'allowed');

select rbac_probe('escalations', 'team_lead',
  '11111111-1111-1111-1111-111111111111', :'alpha_lead',
  'escalations', 'assign same-tenant user',
  $q$ update escalations set assigned_to = '$q$ || :'alpha_agent' || $q$'
      where id = 'ab000000-0000-0000-0000-000000000001' $q$,
  'allowed');

select rbac_probe('escalations', 'team_lead',
  '11111111-1111-1111-1111-111111111111', :'alpha_lead',
  'escalations', 'assign foreign-tenant user',
  $q$ update escalations set assigned_to = '$q$ || :'beta_agent' || $q$'
      where id = 'ab000000-0000-0000-0000-000000000001' $q$,
  'blocked');

select rbac_probe('escalations', 'team_lead',
  '11111111-1111-1111-1111-111111111111', :'alpha_lead',
  'escalations', 'link foreign-tenant SOP version',
  $q$ update escalations set linked_sop_version = 'e0000000-0000-0000-0000-000000000002'
      where id = 'ab000000-0000-0000-0000-000000000001' $q$,
  'blocked');

select rbac_probe('escalations', 'team_lead',
  '11111111-1111-1111-1111-111111111111', :'alpha_lead',
  'escalations', 'rewrite evidence',
  $q$ update escalations set evidence = '{"forged":true}'::jsonb
      where id = 'ab000000-0000-0000-0000-000000000001' $q$,
  'blocked');

select rbac_probe('escalations', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'escalations', 'rewrite provenance',
  $q$ update escalations set query_event_id = gen_random_uuid()
      where id = 'ab000000-0000-0000-0000-000000000001' $q$,
  'blocked');

select rbac_probe('escalations', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'escalations', 'update',
  $q$ update escalations set status = 'resolved' where id = 'ab000000-0000-0000-0000-000000000001' $q$,
  'blocked');

select rbac_probe('escalations', 'ops_manager',
  '11111111-1111-1111-1111-111111111111', :'alpha_ops',
  'escalations', 'delete',
  $q$ delete from escalations where id = 'ab000000-0000-0000-0000-000000000001' $q$,
  'blocked');

select rbac_probe('escalations', 'auditor',
  '11111111-1111-1111-1111-111111111111', :'alpha_auditor',
  'escalations', 'insert',
  $q$ insert into escalations (tenant_id, query_event_id, query_occurred_at)
     values ('11111111-1111-1111-1111-111111111111',
             'aa000000-0000-0000-0000-000000000001', '2026-09-20 10:00:00+00') $q$,
  'blocked');

select rbac_probe('escalations', 'auditor',
  '11111111-1111-1111-1111-111111111111', :'alpha_auditor',
  'app.ingest_escalation', 'auditor calls escalation ingest',
  $q$ select app.ingest_escalation(gen_random_uuid(),
        'aa000000-0000-0000-0000-000000000001', '2026-09-20 10:00:00+00',
        '{"reason":"no_candidates"}'::jsonb) $q$,
  'blocked');

-- ============================== device enrolment ===========================

select rbac_probe('device enrolment', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'device_registrations', 'enrol own device',
  $q$ insert into device_registrations (tenant_id, user_id, platform, public_key)
     values ('11111111-1111-1111-1111-111111111111', '$q$ || :'alpha_agent' || $q$',
             'mobile', 'agent-mobile-key') $q$,
  'allowed');

select rbac_probe('device enrolment', 'agent',
  '11111111-1111-1111-1111-111111111111', :'alpha_agent',
  'device_registrations', 'enrol device for a colleague',
  $q$ insert into device_registrations (tenant_id, user_id, platform, public_key)
     values ('11111111-1111-1111-1111-111111111111', '$q$ || :'alpha_lead' || $q$',
             'desktop', 'impostor-key') $q$,
  'blocked');

-- =============================== privilege audit ===========================
-- The stronger guarantee: these verbs are not granted at all, so no policy
-- mistake or future migration can reintroduce them by accident.

insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
select
  'privilege audit',
  'authenticated',
  t.tbl,
  p.verb,
  'blocked',
  case when has_table_privilege('authenticated', 'public.' || t.tbl, p.verb)
       then 'granted' else 'not granted' end,
  not has_table_privilege('authenticated', 'public.' || t.tbl, p.verb)
from (values
  ('sop_versions'), ('policy_bundles'), ('device_bundle_acks'), ('telemetry_events'),
  ('escalations'), ('tenant_threshold_changes')
) as t(tbl)
cross join (values ('UPDATE'), ('DELETE')) as p(verb);

insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
select
  'privilege audit',
  'authenticated',
  t.tbl,
  'INSERT',
  'blocked',
  case when has_table_privilege('authenticated', 'public.' || t.tbl, 'INSERT')
       then 'granted' else 'not granted' end,
  not has_table_privilege('authenticated', 'public.' || t.tbl, 'INSERT')
from (values
  ('telemetry_events'), ('telemetry_ingest_dedup'), ('escalations'),
  ('tenant_threshold_changes')
) as t(tbl);

insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
select
  'privilege audit',
  'authenticated',
  'escalations.' || c.column_name,
  'column UPDATE',
  'blocked',
  case when has_column_privilege('authenticated', 'public.escalations', c.column_name, 'UPDATE')
       then 'granted' else 'not granted' end,
  not has_column_privilege('authenticated', 'public.escalations', c.column_name, 'UPDATE')
from (values
  ('id'), ('tenant_id'), ('query_event_id'), ('query_occurred_at'),
  ('evidence'), ('created_at')
) as c(column_name);

insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
select
  'privilege audit',
  'authenticated',
  'escalations.status',
  'column UPDATE',
  'allowed',
  case when has_column_privilege('authenticated', 'public.escalations', 'status', 'UPDATE')
       then 'granted' else 'not granted' end,
  has_column_privilege('authenticated', 'public.escalations', 'status', 'UPDATE');

insert into rbac_results (section, role_name, object_name, operation, expected, observed, ok)
select
  'privilege audit',
  'authenticated',
  c.relname,
  'row level security',
  'allowed',
  case when c.relrowsecurity then 'enabled' else 'DISABLED' end,
  c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in (
    'tenants', 'users', 'device_registrations', 'sops', 'sop_versions',
    'policy_bundles', 'device_bundle_acks', 'telemetry_events', 'escalations',
    'telemetry_ingest_dedup', 'tenant_threshold_changes'
  );

-- =================================== report ================================

\o

\echo ''
\echo '=== RBAC matrix by section ==='
select
  section,
  count(*) filter (where ok) as passed,
  count(*) as total,
  count(*) filter (where not ok) as failed
from rbac_results
group by section
order by section;

\echo ''
\echo '=== failures ==='
select role_name, object_name, operation, expected, observed
from rbac_results
where not ok
order by id;

\echo ''
select case
  when count(*) = 0 then 'RBAC MATRIX OK'
  else 'RBAC MATRIX FAILED: ' || count(*) || ' probe(s)'
end as verdict
from rbac_results
where not ok;
