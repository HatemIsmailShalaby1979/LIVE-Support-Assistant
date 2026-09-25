-- Test fixtures: two tenants, one user per role, and rows to isolate.
-- Fixed UUIDs so the RBAC matrix can name exactly what it attacks.
-- Runs as the owner, so row-level security does not apply to the seed itself.

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


-- The auth principals, written directly into GoTrue's table.
--
-- Skipped on a hosted project. Those rows live in auth.users, which we cannot
-- write to: postgres has no CREATE on the auth schema and is not a member of
-- the role that owns it. There they are created through the Auth Admin API
-- instead (tooling/db/provision-hosted-fixtures.mjs), and the UUIDs it hands
-- back are what this seed and the suites are invoked with.
\if :{?skip_auth_users}
\else
insert into auth.users (id, email) values
  (:'alpha_ops', 'ops@alpha.example'),
  (:'alpha_editor', 'editor@alpha.example'),
  (:'alpha_lead', 'lead@alpha.example'),
  (:'alpha_agent', 'agent@alpha.example'),
  (:'alpha_auditor', 'auditor@alpha.example'),
  (:'beta_ops', 'ops@beta.example'),
  (:'beta_agent', 'agent@beta.example')
on conflict (id) do nothing;
\endif

-- Reset the fixture tenants to a canonical state before rebuilding them.
--
-- The container run drops the whole database first, so nothing here ever had to
-- cope with leftovers. A hosted project is persistent, and the first hosted run
-- inherited state from earlier ones: three tenant-isolation probes read rows:4
-- where they expected 2, which looked exactly like a broken schema and was
-- nothing of the kind. Without this block the suites are only correct on a
-- database that has never run them, which is the opposite of a useful gate.
--
-- Scoped to the two fixture tenants. This runs as the owner, and the owner is
-- the only role that holds DELETE on an append-only table by design, so an
-- unscoped truncate would be one edit away from destroying real data on
-- whatever project someone points this at.
--
-- Children before parents: every delete below is a foreign key target of a
-- later one.
delete from escalations           where tenant_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from device_bundle_acks     where tenant_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from telemetry_ingest_dedup where tenant_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from telemetry_events       where tenant_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from device_registrations   where tenant_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from tenant_threshold_changes where tenant_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from tenant_key_versions    where tenant_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from policy_bundles         where tenant_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from sop_versions           where tenant_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from sops                   where tenant_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

insert into tenants (id, name, threshold, min_margin) values
  ('11111111-1111-1111-1111-111111111111', 'Alpha Academy', 0.000, 0.150),
  ('22222222-2222-2222-2222-222222222222', 'Beta Logistics', 0.000, 0.135)
-- do update, not do nothing: the Phase 5 threshold-audit probe changes min_margin
-- and expects exactly one audit row. With do nothing a tenant keeps whatever
-- margin a previous run left it, the update becomes a no-op, no audit row is
-- written, and the dashboard probe reports zero rows — on a persistent database
-- only, which is exactly where nobody looks.
on conflict (id) do update
  set name = excluded.name,
      threshold = excluded.threshold,
      min_margin = excluded.min_margin;

insert into users (id, tenant_id, display_name, role) values
  (:'alpha_ops', '11111111-1111-1111-1111-111111111111', 'Alpha Ops',     'ops_manager'),
  (:'alpha_editor', '11111111-1111-1111-1111-111111111111', 'Alpha Editor',  'sop_editor'),
  (:'alpha_lead', '11111111-1111-1111-1111-111111111111', 'Alpha Lead',    'team_lead'),
  (:'alpha_agent', '11111111-1111-1111-1111-111111111111', 'Alpha Agent',   'agent'),
  (:'alpha_auditor', '11111111-1111-1111-1111-111111111111', 'Alpha Auditor', 'auditor'),
  (:'beta_ops', '22222222-2222-2222-2222-222222222222', 'Beta Ops',      'ops_manager'),
  (:'beta_agent', '22222222-2222-2222-2222-222222222222', 'Beta Agent',    'agent')
on conflict (id) do nothing;

insert into device_registrations (id, tenant_id, user_id, platform, public_key) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   :'alpha_agent', 'web', 'alpha-agent-key'),
  ('d0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   :'beta_agent', 'web', 'beta-agent-key')
on conflict (id) do nothing;

insert into sops (id, tenant_id, title, status, created_by) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Alpha refund procedure', 'published', :'alpha_ops'),
  ('c0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'Beta refund procedure', 'published', :'beta_ops')
on conflict (id) do nothing;

insert into sop_versions (id, sop_id, tenant_id, version, body_ciphertext, body_hash, created_by) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 1, '\x00'::bytea, 'hash-alpha-1',
   :'alpha_ops'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222', 1, '\x00'::bytea, 'hash-beta-1',
   :'beta_ops')
on conflict (id) do nothing;

insert into policy_bundles (
  id, tenant_id, bundle_version, manifest_hash, signature,
  model_id, model_revision, quantization, payload_ciphertext, published_by
) values
  ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1,
   'manifest-alpha-1', 'sig-alpha-1', 'Xenova/all-MiniLM-L6-v2', '751bff37', 'q8', '\x00'::bytea,
   :'alpha_ops'),
  ('f0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 1,
   'manifest-beta-1', 'sig-beta-1', 'Xenova/all-MiniLM-L6-v2', '751bff37', 'q8', '\x00'::bytea,
   :'beta_ops')
on conflict (id) do nothing;

insert into telemetry_events (
  id, tenant_id, device_id, user_pseudonym, event_type, bundle_version, occurred_at, payload
) values
  ('aa000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'd0000000-0000-0000-0000-000000000001', 'pseudo-alpha-1', 'query', 1,
   '2026-09-20 10:00:00+00', '{"outcome":"answered","sopId":"1","score":0.81,"margin":0.22,"gateReason":null,"thresholdAccept":0,"minMargin":0.18,"topCandidates":[{"sopId":"1","score":0.81,"passage":"refund policy"}]}'::jsonb),
  ('aa000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'd0000000-0000-0000-0000-000000000001', 'pseudo-alpha-1', 'query', 1,
   '2026-09-20 10:05:00+00', '{"outcome":"escalated","sopId":null,"score":null,"margin":null,"gateReason":"insufficient_margin","thresholdAccept":0,"minMargin":0.18,"topCandidates":[{"sopId":"1","score":0.42,"passage":"refund policy"},{"sopId":"3","score":0.40,"passage":"login policy"}]}'::jsonb),
  ('bb000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   'd0000000-0000-0000-0000-000000000002', 'pseudo-beta-1', 'query', 1,
   '2026-09-20 11:00:00+00', '{"outcome":"answered","sopId":"1","score":0.79,"margin":0.19,"gateReason":null,"thresholdAccept":0,"minMargin":0.18,"topCandidates":[{"sopId":"1","score":0.79,"passage":"refund policy"}]}'::jsonb)
on conflict (id, occurred_at) do nothing;

insert into escalations (id, tenant_id, query_event_id, query_occurred_at, status) values
  ('ab000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aa000000-0000-0000-0000-000000000002', '2026-09-20 10:05:00+00', 'open'),
  ('ab000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'bb000000-0000-0000-0000-000000000001', '2026-09-20 11:00:00+00', 'open')
on conflict (id) do nothing;
