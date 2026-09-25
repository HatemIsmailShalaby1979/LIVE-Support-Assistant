-- 0006 — table privileges.
--
-- RLS decides which *rows* a role may touch. Privileges decide which *verbs* it
-- holds at all, and they are the stronger guarantee: a missing GRANT cannot be
-- talked around by a policy mistake, a future migration, or a query written by
-- someone who has not read this file.
--
-- That is why the append-only tables are append-only twice: no UPDATE or DELETE
-- policy exists, and no UPDATE or DELETE privilege is granted. The design calls
-- this "immutability by privilege, not by convention".

grant usage on schema public to authenticated;
grant usage on schema app to authenticated;
grant usage on schema auth to authenticated;

-- ---------------------------------------------------------------- tenants ---
revoke all on tenants from authenticated;
grant select, update on tenants to authenticated;

-- ------------------------------------------------------------------ users ---
revoke all on users from authenticated;
grant select, insert, update on users to authenticated;

-- --------------------------------------------------- device_registrations ---
revoke all on device_registrations from authenticated;
grant select, insert, update on device_registrations to authenticated;

-- ------------------------------------------------------------------- sops ---
revoke all on sops from authenticated;
grant select, insert, update on sops to authenticated;

-- ----------------------------------------------------------- sop_versions ---
-- Append-only: a correction is a new version, never an edit of an old one.
revoke all on sop_versions from authenticated;
grant select, insert on sop_versions to authenticated;

-- -------------------------------------------------------- policy_bundles ---
revoke all on policy_bundles from authenticated;
grant select, insert on policy_bundles to authenticated;

-- ----------------------------------------------------- device_bundle_acks ---
revoke all on device_bundle_acks from authenticated;
grant select, insert on device_bundle_acks to authenticated;

-- ------------------------------------------------------- telemetry_events ---
-- THE append-only guarantee. No UPDATE. No DELETE. For any role, ever.
revoke all on telemetry_events from authenticated;
grant select, insert on telemetry_events to authenticated;

-- --------------------------------------------------- telemetry_ingest_dedup ---
-- A dedup cache, not an audit record. The app may claim an id and read its own
-- claims; pruning is a maintenance job with its own role.
revoke all on telemetry_ingest_dedup from authenticated;
grant select, insert on telemetry_ingest_dedup to authenticated;

-- ------------------------------------------------------------ escalations ---
-- Resolvable but not erasable: an escalation records that the system failed to
-- answer, and that record must survive.
revoke all on escalations from authenticated;
grant select, insert, update on escalations to authenticated;

-- No sequence grants are needed: every key is a UUID.
