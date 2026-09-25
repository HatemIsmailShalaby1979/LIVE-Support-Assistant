-- Test fixtures: two tenants, one user per role, and rows to isolate.
-- Fixed UUIDs so the RBAC matrix can name exactly what it attacks.
-- Runs as the owner, so row-level security does not apply to the seed itself.

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'ops@alpha.example'),
  ('a0000000-0000-0000-0000-000000000002', 'editor@alpha.example'),
  ('a0000000-0000-0000-0000-000000000003', 'lead@alpha.example'),
  ('a0000000-0000-0000-0000-000000000004', 'agent@alpha.example'),
  ('a0000000-0000-0000-0000-000000000005', 'auditor@alpha.example'),
  ('b0000000-0000-0000-0000-000000000001', 'ops@beta.example'),
  ('b0000000-0000-0000-0000-000000000002', 'agent@beta.example')
on conflict (id) do nothing;

insert into tenants (id, name, threshold, min_margin) values
  ('11111111-1111-1111-1111-111111111111', 'Alpha Academy', 0.000, 0.150),
  ('22222222-2222-2222-2222-222222222222', 'Beta Logistics', 0.000, 0.135)
on conflict (id) do nothing;

insert into users (id, tenant_id, display_name, role) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alpha Ops',     'ops_manager'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Alpha Editor',  'sop_editor'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Alpha Lead',    'team_lead'),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Alpha Agent',   'agent'),
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Alpha Auditor', 'auditor'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Beta Ops',      'ops_manager'),
  ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Beta Agent',    'agent')
on conflict (id) do nothing;

insert into device_registrations (id, tenant_id, user_id, platform, public_key) values
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'a0000000-0000-0000-0000-000000000004', 'web', 'alpha-agent-key'),
  ('d0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'b0000000-0000-0000-0000-000000000002', 'web', 'beta-agent-key')
on conflict (id) do nothing;

insert into sops (id, tenant_id, title, status, created_by) values
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Alpha refund procedure', 'published', 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'Beta refund procedure', 'published', 'b0000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into sop_versions (id, sop_id, tenant_id, version, body_ciphertext, body_hash, created_by) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 1, '\x00'::bytea, 'hash-alpha-1',
   'a0000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222', 1, '\x00'::bytea, 'hash-beta-1',
   'b0000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into policy_bundles (
  id, tenant_id, bundle_version, manifest_hash, signature,
  model_id, model_revision, quantization, payload_ciphertext, published_by
) values
  ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1,
   'manifest-alpha-1', 'sig-alpha-1', 'Xenova/all-MiniLM-L6-v2', '751bff37', 'q8', '\x00'::bytea,
   'a0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 1,
   'manifest-beta-1', 'sig-beta-1', 'Xenova/all-MiniLM-L6-v2', '751bff37', 'q8', '\x00'::bytea,
   'b0000000-0000-0000-0000-000000000001')
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
