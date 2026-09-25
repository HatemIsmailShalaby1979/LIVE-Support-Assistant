-- 0005 — row-level security.
--
-- Two independent guarantees are enforced here, and the tests in
-- supabase/tests/rbac_matrix.sql prove both:
--
--   1. Tenant isolation. Every policy is scoped to app.current_tenant(), which
--      comes from the signed JWT. A caller in tenant B cannot see or touch a row
--      in tenant A under any role.
--   2. Role capability. Writes to procedure content are limited to ops_manager
--      and sop_editor; agents may only emit telemetry and open escalations;
--      auditors may only read.
--
-- Note what is deliberately absent: there is no DELETE policy on any table, and
-- no UPDATE policy on sop_versions, policy_bundles, device_bundle_acks or
-- telemetry_events. Absence of a policy is a denial, not an oversight.

alter table tenants            enable row level security;
alter table users              enable row level security;
alter table device_registrations enable row level security;
alter table sops               enable row level security;
alter table sop_versions       enable row level security;
alter table policy_bundles     enable row level security;
alter table device_bundle_acks enable row level security;
alter table telemetry_events   enable row level security;
alter table telemetry_ingest_dedup enable row level security;
alter table escalations        enable row level security;

-- ---------------------------------------------------------------- tenants ---
create policy tenants_select on tenants
  for select to authenticated
  using (id = app.current_tenant());

create policy tenants_update on tenants
  for update to authenticated
  using (id = app.current_tenant() and app.current_role() = 'ops_manager')
  with check (id = app.current_tenant());

-- ------------------------------------------------------------------ users ---
create policy users_select on users
  for select to authenticated
  using (tenant_id = app.current_tenant());

create policy users_insert on users
  for insert to authenticated
  with check (tenant_id = app.current_tenant() and app.current_role() = 'ops_manager');

create policy users_update on users
  for update to authenticated
  using (tenant_id = app.current_tenant() and app.current_role() = 'ops_manager')
  with check (tenant_id = app.current_tenant());

-- --------------------------------------------------- device_registrations ---
create policy device_registrations_select on device_registrations
  for select to authenticated
  using (tenant_id = app.current_tenant());

-- A device enrols itself; an ops manager may enrol on someone's behalf.
create policy device_registrations_insert on device_registrations
  for insert to authenticated
  with check (
    tenant_id = app.current_tenant()
    and (user_id = auth.uid() or app.current_role() = 'ops_manager')
  );

create policy device_registrations_update on device_registrations
  for update to authenticated
  using (
    tenant_id = app.current_tenant()
    and (user_id = auth.uid() or app.current_role() = 'ops_manager')
  )
  with check (tenant_id = app.current_tenant());

-- ------------------------------------------------------------------- sops ---
create policy sops_select on sops
  for select to authenticated
  using (tenant_id = app.current_tenant());

create policy sops_insert on sops
  for insert to authenticated
  with check (
    tenant_id = app.current_tenant()
    and app.current_role() in ('ops_manager', 'sop_editor')
  );

create policy sops_update on sops
  for update to authenticated
  using (
    tenant_id = app.current_tenant()
    and app.current_role() in ('ops_manager', 'sop_editor')
  )
  with check (tenant_id = app.current_tenant());

-- ----------------------------------------------------------- sop_versions ---
create policy sop_versions_select on sop_versions
  for select to authenticated
  using (tenant_id = app.current_tenant());

-- Append-only: a published version is never edited. A correction is a new row.
create policy sop_versions_insert on sop_versions
  for insert to authenticated
  with check (
    tenant_id = app.current_tenant()
    and app.current_role() in ('ops_manager', 'sop_editor')
  );

-- -------------------------------------------------------- policy_bundles ---
create policy policy_bundles_select on policy_bundles
  for select to authenticated
  using (tenant_id = app.current_tenant());

-- Only an ops manager publishes a bundle: this is the act that pushes policy to
-- every enrolled device, so it is not delegated to editors.
create policy policy_bundles_insert on policy_bundles
  for insert to authenticated
  with check (tenant_id = app.current_tenant() and app.current_role() = 'ops_manager');

-- ----------------------------------------------------- device_bundle_acks ---
create policy device_bundle_acks_select on device_bundle_acks
  for select to authenticated
  using (tenant_id = app.current_tenant());

create policy device_bundle_acks_insert on device_bundle_acks
  for insert to authenticated
  with check (
    tenant_id = app.current_tenant()
    and device_id in (
      select id from device_registrations where user_id = auth.uid()
    )
  );

-- ------------------------------------------------------- telemetry_events ---
-- Reads are restricted: telemetry carries query text and per-agent behaviour,
-- which a frontline agent has no business browsing. Writes are open to every
-- role in the tenant because every client emits events.
create policy telemetry_events_select on telemetry_events
  for select to authenticated
  using (
    tenant_id = app.current_tenant()
    and app.current_role() in ('ops_manager', 'team_lead', 'auditor')
  );

create policy telemetry_events_insert on telemetry_events
  for insert to authenticated
  with check (tenant_id = app.current_tenant());

-- ---------------------------------------------------- telemetry_ingest_dedup --
-- The dedup ledger. Scoped per tenant so that a claim is required to write one,
-- and so a tenant cannot inspect another's ingest ids. No update and no delete
-- policy: the only legitimate change is a prune by a maintenance role, which
-- runs outside `authenticated`.
create policy telemetry_ingest_dedup_select on telemetry_ingest_dedup
  for select to authenticated
  using (tenant_id = app.current_tenant());

create policy telemetry_ingest_dedup_insert on telemetry_ingest_dedup
  for insert to authenticated
  with check (tenant_id = app.current_tenant());

-- ------------------------------------------------------------ escalations ---
create policy escalations_select on escalations
  for select to authenticated
  using (tenant_id = app.current_tenant());

create policy escalations_insert on escalations
  for insert to authenticated
  with check (
    tenant_id = app.current_tenant()
    and app.current_role() in ('ops_manager', 'team_lead', 'agent')
  );

create policy escalations_update on escalations
  for update to authenticated
  using (
    tenant_id = app.current_tenant()
    and app.current_role() in ('ops_manager', 'team_lead')
  )
  with check (tenant_id = app.current_tenant());
