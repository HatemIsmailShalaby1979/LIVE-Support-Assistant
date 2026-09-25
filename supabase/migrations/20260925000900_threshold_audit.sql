-- 0009 — threshold change audit.
--
-- The gate parameters are the single most consequential number in the product:
-- they decide how much the system answers and how much it hands to a human. A
-- silent change to `min_margin` is indistinguishable, from the outside, from a
-- sudden collapse in answer quality. So every change is recorded, with who made
-- it and what it was before.
--
-- A trigger rather than application code, because the parameter can also be
-- changed by a migration, a support script or a console session, and those paths
-- do not go through the application.

create table tenant_threshold_changes (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  previous_threshold numeric(4,3),
  new_threshold      numeric(4,3) not null,
  previous_min_margin numeric(4,3),
  new_min_margin      numeric(4,3) not null,
  changed_by        uuid,
  changed_at        timestamptz not null default now()
);

create index tenant_threshold_changes_tenant_idx
  on tenant_threshold_changes (tenant_id, changed_at desc);

-- Append-only by privilege, like telemetry: no UPDATE, no DELETE.
alter table tenant_threshold_changes enable row level security;

create policy tenant_threshold_changes_select on tenant_threshold_changes
  for select to authenticated
  using (tenant_id = app.current_tenant());

create policy tenant_threshold_changes_insert on tenant_threshold_changes
  for insert to authenticated
  with check (tenant_id = app.current_tenant());

revoke all on tenant_threshold_changes from authenticated;
grant select, insert on tenant_threshold_changes to authenticated;

create or replace function app.audit_threshold_change()
returns trigger
language plpgsql
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

create trigger tenants_threshold_audit
after update on tenants
for each row execute function app.audit_threshold_change();
