drop policy if exists telemetry_events_insert on telemetry_events;
drop policy if exists telemetry_ingest_dedup_insert on telemetry_ingest_dedup;
drop policy if exists escalations_insert on escalations;
drop policy if exists tenant_threshold_changes_insert on tenant_threshold_changes;

revoke insert on telemetry_events from authenticated;
revoke insert on telemetry_ingest_dedup from authenticated;
revoke insert on escalations from authenticated;
revoke insert on tenant_threshold_changes from authenticated;

alter table tenants
  alter column min_margin set default 0.180;

revoke update on escalations from authenticated;
grant update (status, assigned_to, resolution, linked_sop_version, resolved_at)
  on escalations to authenticated;

drop policy if exists escalations_select on escalations;
create policy escalations_select on escalations
  for select to authenticated
  using (
    tenant_id = app.current_tenant()
    and app.current_role() in ('ops_manager', 'team_lead', 'auditor')
  );

create or replace function app.enforce_escalation_references_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if new.assigned_to is not null and not exists (
    select 1 from users
     where id = new.assigned_to
       and tenant_id = new.tenant_id
  ) then
    raise exception 'assigned user % does not belong to tenant %', new.assigned_to, new.tenant_id
      using errcode = 'foreign_key_violation';
  end if;

  if new.linked_sop_version is not null and not exists (
    select 1 from sop_versions
     where id = new.linked_sop_version
       and tenant_id = new.tenant_id
  ) then
    raise exception 'linked SOP version % does not belong to tenant %',
      new.linked_sop_version, new.tenant_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger escalations_references_tenant
  before insert or update of assigned_to, linked_sop_version on escalations
  for each row execute function app.enforce_escalation_references_tenant();

create or replace function app.ingest_telemetry_event(
  p_id             uuid,
  p_device_id      uuid,
  p_user_pseudonym text,
  p_event_type     text,
  p_bundle_version bigint,
  p_occurred_at    timestamptz,
  p_payload        jsonb
) returns boolean
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_tenant  uuid := app.current_tenant();
  v_role    app_role := app.current_role();
  v_outcome text;
  v_claimed integer;
begin
  if v_tenant is null or v_role is null then
    raise exception 'request carries no complete tenant claim'
      using errcode = 'insufficient_privilege';
  end if;

  if v_role not in ('ops_manager', 'sop_editor', 'team_lead', 'agent', 'auditor') then
    raise exception 'role cannot ingest telemetry'
      using errcode = 'insufficient_privilege';
  end if;

  if p_event_type is distinct from 'query'
     or p_bundle_version is null
     or p_bundle_version < 1
     or p_user_pseudonym is null
     or length(p_user_pseudonym) not between 1 and 128
     or p_occurred_at is null
     or p_occurred_at > now() + interval '5 minutes'
     or jsonb_typeof(p_payload) is distinct from 'object'
     or not (p_payload ?& array[
       'outcome', 'sopId', 'score', 'margin', 'gateReason',
       'thresholdAccept', 'minMargin', 'topCandidates'
     ])
     or coalesce(p_payload ->> 'outcome', '') not in ('answered', 'escalated')
     or jsonb_typeof(p_payload -> 'sopId') is null
     or jsonb_typeof(p_payload -> 'score') is null
     or jsonb_typeof(p_payload -> 'margin') is null
     or jsonb_typeof(p_payload -> 'gateReason') is null
     or jsonb_typeof(p_payload -> 'thresholdAccept') is distinct from 'number'
     or jsonb_typeof(p_payload -> 'minMargin') is distinct from 'number'
     or jsonb_typeof(p_payload -> 'topCandidates') is distinct from 'array' then
    raise exception 'telemetry event failed contract validation'
      using errcode = '22023';
  end if;

  v_outcome := p_payload ->> 'outcome';

  if (p_payload ->> 'thresholdAccept')::numeric not between 0 and 1
     or (p_payload ->> 'minMargin')::numeric not between 0 and 1 then
    raise exception 'telemetry gate parameters are outside [0,1]'
      using errcode = '22023';
  end if;

  if v_outcome = 'answered' and (
    jsonb_typeof(p_payload -> 'sopId') is distinct from 'string'
    or length(p_payload ->> 'sopId') = 0
    or jsonb_typeof(p_payload -> 'score') is distinct from 'number'
    or jsonb_typeof(p_payload -> 'margin') is distinct from 'number'
    or p_payload -> 'gateReason' is distinct from 'null'::jsonb
  ) then
    raise exception 'answered telemetry shape is invalid'
      using errcode = '22023';
  end if;

  if v_outcome = 'answered'
     and (
       (p_payload ->> 'score')::numeric not between -1 and 1
       or (p_payload ->> 'margin')::numeric not between 0 and 1
     ) then
    raise exception 'answered telemetry scores are outside their bounds'
      using errcode = '22023';
  end if;

  if v_outcome = 'escalated' and (
    jsonb_typeof(p_payload -> 'sopId') is distinct from 'null'
    or jsonb_typeof(p_payload -> 'score') is distinct from 'null'
    or jsonb_typeof(p_payload -> 'margin') is distinct from 'null'
    or jsonb_typeof(p_payload -> 'gateReason') is distinct from 'string'
    or coalesce(p_payload ->> 'gateReason', '') not in (
      'no_candidates', 'below_threshold', 'insufficient_margin',
      'manual_review_required', 'invalid_candidate', 'bundle_inconsistent'
    )
  ) then
    raise exception 'escalated telemetry shape is invalid'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_payload -> 'topCandidates') not between 0 and 5
     or (v_outcome = 'answered' and jsonb_array_length(p_payload -> 'topCandidates') < 1)
     or (
       v_outcome = 'escalated'
       and p_payload ->> 'gateReason' in ('no_candidates', 'invalid_candidate')
       and jsonb_array_length(p_payload -> 'topCandidates') <> 0
     )
     or (
       v_outcome = 'escalated'
       and p_payload ->> 'gateReason' in (
         'below_threshold', 'insufficient_margin', 'manual_review_required', 'bundle_inconsistent'
       )
       and jsonb_array_length(p_payload -> 'topCandidates') < 1
     )
     or exists (
       select 1
         from jsonb_array_elements(p_payload -> 'topCandidates') as candidate
        where jsonb_typeof(candidate -> 'sopId') is distinct from 'string'
           or length(candidate ->> 'sopId') = 0
           or jsonb_typeof(candidate -> 'score') is distinct from 'number'
           or case
                when jsonb_typeof(candidate -> 'score') = 'number'
                then (candidate ->> 'score')::numeric not between -1 and 1
                else true
              end
           or jsonb_typeof(candidate -> 'passage') is distinct from 'string'
     ) then
    raise exception 'telemetry candidates failed contract validation'
      using errcode = '22023';
  end if;

  if p_device_id is not null and not exists (
    select 1
      from device_registrations
     where id = p_device_id
       and tenant_id = v_tenant
  ) then
    raise exception 'device % does not belong to tenant %', p_device_id, v_tenant
      using errcode = 'foreign_key_violation';
  end if;

  insert into telemetry_ingest_dedup (id, tenant_id)
  values (p_id, v_tenant)
  on conflict (id) do nothing;

  get diagnostics v_claimed = row_count;

  if v_claimed = 0 then
    return false;
  end if;

  insert into telemetry_events (
    id, tenant_id, device_id, user_pseudonym, event_type, bundle_version,
    occurred_at, payload
  ) values (
    p_id, v_tenant, p_device_id, p_user_pseudonym, p_event_type, p_bundle_version,
    p_occurred_at, p_payload
  );

  return true;
end;
$$;

create or replace function app.ingest_escalation(
  p_escalation_id      uuid,
  p_query_event_id      uuid,
  p_query_occurred_at   timestamptz,
  p_evidence            jsonb
) returns boolean
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_tenant        uuid := app.current_tenant();
  v_role          app_role := app.current_role();
  v_source_payload jsonb;
  v_source_bundle  bigint;
  v_inserted      integer;
begin
  if v_tenant is null or v_role is null then
    raise exception 'request carries no complete tenant claim'
      using errcode = 'insufficient_privilege';
  end if;

  if v_role not in ('ops_manager', 'team_lead', 'agent') then
    raise exception 'role cannot create escalations'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(p_evidence) is distinct from 'object'
     or not (p_evidence ?& array[
       'queryText', 'reason', 'thresholdAccept', 'minMargin', 'bundleVersion',
       'modelId', 'modelRevision', 'candidates'
     ])
     or jsonb_typeof(p_evidence -> 'queryText') is distinct from 'string'
     or length(p_evidence ->> 'queryText') not between 1 and 10000
     or jsonb_typeof(p_evidence -> 'reason') is distinct from 'string'
     or coalesce(p_evidence ->> 'reason', '') not in (
       'no_candidates', 'below_threshold', 'insufficient_margin',
       'manual_review_required', 'invalid_candidate', 'bundle_inconsistent'
     )
     or jsonb_typeof(p_evidence -> 'thresholdAccept') is distinct from 'number'
     or jsonb_typeof(p_evidence -> 'minMargin') is distinct from 'number'
     or jsonb_typeof(p_evidence -> 'bundleVersion') is distinct from 'number'
     or jsonb_typeof(p_evidence -> 'modelId') is distinct from 'string'
     or length(p_evidence ->> 'modelId') = 0
     or jsonb_typeof(p_evidence -> 'modelRevision') is distinct from 'string'
     or length(p_evidence ->> 'modelRevision') = 0
     or jsonb_typeof(p_evidence -> 'candidates') is distinct from 'array' then
    raise exception 'escalation evidence failed contract validation'
      using errcode = '22023';
  end if;

  if (p_evidence ->> 'thresholdAccept')::numeric not between 0 and 1
     or (p_evidence ->> 'minMargin')::numeric not between 0 and 1
     or (p_evidence ->> 'bundleVersion')::numeric < 1
     or (p_evidence ->> 'bundleVersion')::numeric <> trunc((p_evidence ->> 'bundleVersion')::numeric)
     or (p_evidence ->> 'bundleVersion')::numeric > 9223372036854775807 then
    raise exception 'escalation evidence numbers are outside their bounds'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_evidence -> 'candidates') not between 0 and 5
     or (
       p_evidence ->> 'reason' in ('no_candidates', 'invalid_candidate')
       and jsonb_array_length(p_evidence -> 'candidates') <> 0
     )
     or (
       p_evidence ->> 'reason' in (
         'below_threshold', 'insufficient_margin', 'manual_review_required', 'bundle_inconsistent'
       )
       and jsonb_array_length(p_evidence -> 'candidates') < 1
     )
     or exists (
       select 1
         from jsonb_array_elements(p_evidence -> 'candidates') as candidate
        where jsonb_typeof(candidate -> 'sopId') is distinct from 'string'
           or length(candidate ->> 'sopId') = 0
           or jsonb_typeof(candidate -> 'score') is distinct from 'number'
           or case
                when jsonb_typeof(candidate -> 'score') = 'number'
                then (candidate ->> 'score')::numeric not between -1 and 1
                else true
              end
           or jsonb_typeof(candidate -> 'passage') is distinct from 'string'
     ) then
    raise exception 'escalation candidates failed contract validation'
      using errcode = '22023';
  end if;

  select event.payload, event.bundle_version
    into v_source_payload, v_source_bundle
    from telemetry_events as event
   where event.id = p_query_event_id
     and event.occurred_at = p_query_occurred_at
     and event.tenant_id = v_tenant;

  if not found then
    raise exception 'source query event does not exist in tenant %', v_tenant
      using errcode = 'foreign_key_violation';
  end if;

  if v_source_payload ->> 'outcome' is distinct from 'escalated'
     or v_source_payload ->> 'gateReason' is distinct from p_evidence ->> 'reason'
     or (v_source_payload ->> 'thresholdAccept')::numeric
          is distinct from (p_evidence ->> 'thresholdAccept')::numeric
     or (v_source_payload ->> 'minMargin')::numeric
          is distinct from (p_evidence ->> 'minMargin')::numeric
     or v_source_payload -> 'topCandidates' is distinct from p_evidence -> 'candidates'
     or v_source_bundle is distinct from (p_evidence ->> 'bundleVersion')::bigint then
    raise exception 'escalation evidence does not match its source event'
      using errcode = '22023';
  end if;

  insert into escalations (id, tenant_id, query_event_id, query_occurred_at, evidence)
  values (p_escalation_id, v_tenant, p_query_event_id, p_query_occurred_at, p_evidence)
  on conflict (id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

create or replace function app.audit_threshold_change()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if new.threshold is distinct from old.threshold
     or new.min_margin is distinct from old.min_margin then
    insert into tenant_threshold_changes (
      tenant_id, previous_threshold, new_threshold,
      previous_min_margin, new_min_margin, changed_by
    ) values (
      new.id, old.threshold, new.threshold,
      old.min_margin, new.min_margin, auth.uid()
    );
  end if;

  return new;
end;
$$;

revoke all on function app.current_tenant() from public;
revoke all on function app.current_role() from public;
revoke all on function app.enforce_monotonic_bundle_version() from public;
revoke all on function app.enforce_escalation_event_exists() from public;
revoke all on function app.enforce_escalation_references_tenant() from public;
revoke all on function app.audit_threshold_change() from public;
revoke all on function app.ingest_telemetry_event(uuid, uuid, text, text, bigint, timestamptz, jsonb) from public;
revoke all on function app.next_bundle_version(uuid) from public;
revoke all on function app.enrolled_devices(uuid) from public;
revoke all on function app.publish_policy_bundle(uuid, text, text, text, text, text, bytea, uuid) from public;
revoke all on function app.ingest_escalation(uuid, uuid, timestamptz, jsonb) from public;
revoke all on function app.revoke_tenant_key(uuid, text, integer) from public;

grant execute on function app.current_tenant() to authenticated;
grant execute on function app.current_role() to authenticated;
grant execute on function app.ingest_telemetry_event(uuid, uuid, text, text, bigint, timestamptz, jsonb) to authenticated;
grant execute on function app.next_bundle_version(uuid) to authenticated;
grant execute on function app.enrolled_devices(uuid) to authenticated;
grant execute on function app.publish_policy_bundle(uuid, text, text, text, text, text, bytea, uuid) to authenticated;
grant execute on function app.ingest_escalation(uuid, uuid, timestamptz, jsonb) to authenticated;
grant execute on function app.revoke_tenant_key(uuid, text, integer) to authenticated;
