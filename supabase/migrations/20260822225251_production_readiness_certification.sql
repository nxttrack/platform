-- Sprint 2 production-readiness certification hardening. This migration is
-- intentionally additive: the four reviewed Sprint 1 migrations stay immutable.

-- Import execution and reconciliation are service-owned. The web application
-- already routes every mutation through the service-role server boundary; leaving
-- legacy Data API mutation privileges in place would let an authenticated tenant
-- administrator forge leases/status or delete the durable manifest by cascade.
revoke insert, update, delete on public.import_jobs from authenticated;
revoke insert, update, delete on public.import_rows from authenticated;
revoke insert, update, delete on public.import_job_events from authenticated;

-- Provider acceptance timestamps are audit evidence, not user-editable state.
-- Keep the pre-existing business-row update policies intact while fencing these
-- individual evidence columns for anon/authenticated Data API sessions.
create function app_private.prevent_client_provider_acceptance_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  protected_column text := tg_argv[0];
  previous_value jsonb;
  next_value jsonb := to_jsonb(new) -> protected_column;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if next_value is distinct from 'null'::jsonb then
      raise exception 'Provider acceptance evidence is service-owned';
    end if;
  else
    previous_value := to_jsonb(old) -> protected_column;
    if next_value is distinct from previous_value then
      raise exception 'Provider acceptance evidence is service-owned';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.prevent_client_provider_acceptance_mutation() from public;

create trigger auth_invitations_provider_acceptance_service_only
  before insert or update on public.auth_invitations
  for each row execute function app_private.prevent_client_provider_acceptance_mutation('provider_accepted_at');
create trigger tenant_notifications_provider_acceptance_service_only
  before insert or update on public.tenant_notifications
  for each row execute function app_private.prevent_client_provider_acceptance_mutation('provider_accepted_at');
create trigger slot_offers_provider_acceptance_service_only
  before insert or update on public.slot_offers
  for each row execute function app_private.prevent_client_provider_acceptance_mutation('provider_accepted_at');
create trigger email_delivery_attempts_acceptance_service_only
  before insert or update on public.email_delivery_attempts
  for each row execute function app_private.prevent_client_provider_acceptance_mutation('accepted_at');

-- Guardian materialization remains create-only. An invitation for an Auth user
-- that already has this tenant role is a validation/race conflict; it must not
-- rewrite the membership. A profile that already exists is a global identity and
-- must never be renamed by tenant-scoped import data.
create or replace function public.materialize_import_guardian_invitation(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_invitation_id uuid,
  target_user_id uuid,
  target_is_new_account boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  invitation public.auth_invitations%rowtype;
  existing_membership_id uuid;
  membership_id uuid;
  already_materialized boolean := false;
begin
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then raise exception 'Tenant administrator required'; end if;

  select * into invitation from public.auth_invitations candidate
  where candidate.id = target_invitation_id and candidate.tenant_id = target_tenant_id
    and candidate.import_job_id = target_job_id
  for update;
  if invitation.id is null or invitation.status <> 'pending' then raise exception 'Import invitation is not pending'; end if;
  if not exists (
    select 1 from public.import_jobs job
    where job.id = target_job_id and job.tenant_id = target_tenant_id
      and job.status in ('applying', 'failed', 'completed') and job.rollback_state = 'not_requested'
  ) then raise exception 'Import job is not available for identity materialization'; end if;
  if invitation.invited_user_id is not null then
    if invitation.invited_user_id <> target_user_id then raise exception 'Import invitation is bound to another Auth user'; end if;
    already_materialized := true;
  end if;

  if already_materialized then
    select membership.id into membership_id
    from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_user_id
      and membership.role = 'parent' and membership.invitation_id = invitation.id;
  else
    select membership.id into existing_membership_id
    from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_user_id
      and membership.role = 'parent'
    for update;
    if existing_membership_id is not null then
      raise exception 'Import guardian membership already exists';
    end if;

    insert into public.profiles (id, email, full_name)
    values (target_user_id, lower(invitation.email), invitation.invitee_name)
    on conflict (id) do nothing;
    insert into public.user_security (user_id, email, must_change_password, last_invited_at)
    values (target_user_id, lower(invitation.email), target_is_new_account, now())
    on conflict (user_id) do update set email = excluded.email,
      must_change_password = public.user_security.must_change_password or excluded.must_change_password,
      last_invited_at = excluded.last_invited_at;

    insert into public.tenant_memberships (
      tenant_id, user_id, role, status, invited_email, invitation_id, invitation_expires_at
    ) values (
      target_tenant_id, target_user_id, 'parent', 'invited', lower(invitation.email), invitation.id, invitation.expires_at
    ) returning id into membership_id;

    update public.auth_invitations
    set invited_user_id = target_user_id, requires_password_setup = target_is_new_account,
        identity_status = 'ready', identity_error_code = null
    where id = invitation.id;

    insert into public.import_manifest_entries (
      tenant_id, import_job_id, import_row_id, record_type, target_table, target_id,
      created_by_import, apply_attempt
    )
    select target_tenant_id, target_job_id, invitation.import_row_id, 'guardians',
      'tenant_memberships', membership_id, true, greatest(job.apply_attempts, 1)
    from public.import_jobs job where job.id = target_job_id
    on conflict (tenant_id, import_job_id, import_row_id, target_table) do nothing;
  end if;

  return jsonb_build_object('outcome', 'ready', 'invitationId', invitation.id,
    'membershipId', membership_id, 'alreadyMaterialized', already_materialized);
end;
$$;

-- The original participant write also creates one guardian link but only the
-- participant was recorded in the manifest. Capture that owned child so normal
-- rollback can remove it explicitly before the parent referential guard runs.
alter table public.import_manifest_entries
  drop constraint import_manifest_target_table_check;
alter table public.import_manifest_entries
  add constraint import_manifest_target_table_check check (
    target_table in (
      'participants', 'participant_guardians', 'auth_invitations',
      'tenant_memberships', 'email_outbox', 'groups', 'enrollments', 'manual_payments'
    )
  );

create function app_private.capture_import_participant_guardian_manifest()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.target_table = 'participants' and new.created_by_import then
    insert into public.import_manifest_entries (
      tenant_id, import_job_id, import_row_id, record_type, target_table,
      target_id, created_by_import, apply_attempt
    )
    select new.tenant_id, new.import_job_id, new.import_row_id, new.record_type,
      'participant_guardians', guardian.id, true, new.apply_attempt
    from public.participant_guardians guardian
    where guardian.tenant_id = new.tenant_id and guardian.participant_id = new.target_id
    order by guardian.created_at, guardian.id
    limit 1
    on conflict (tenant_id, import_job_id, import_row_id, target_table) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function app_private.capture_import_participant_guardian_manifest() from public;

create trigger capture_import_participant_guardian_manifest
  after insert on public.import_manifest_entries
  for each row execute function app_private.capture_import_participant_guardian_manifest();

insert into public.import_manifest_entries (
  tenant_id, import_job_id, import_row_id, record_type, target_table,
  target_id, created_by_import, apply_attempt
)
select manifest.tenant_id, manifest.import_job_id, manifest.import_row_id,
  manifest.record_type, 'participant_guardians', guardian.id, true, manifest.apply_attempt
from public.import_manifest_entries manifest
cross join lateral (
  select link.id from public.participant_guardians link
  where link.tenant_id = manifest.tenant_id and link.participant_id = manifest.target_id
  order by link.created_at, link.id limit 1
) guardian
where manifest.target_table = 'participants' and manifest.created_by_import
  and manifest.compensation_status in ('pending', 'failed')
on conflict (tenant_id, import_job_id, import_row_id, target_table) do nothing;

-- Resolve every direct FK dynamically and reject a rollback parent delete when
-- any unmanifested row would be cascaded, nulled or restricted. This guard runs
-- only inside the certified import-rollback wrapper.
create function app_private.assert_import_target_unreferenced(
  target_parent regclass,
  target_tenant_id uuid,
  target_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  foreign_key record;
  has_reference boolean;
begin
  for foreign_key in
    select constraint_row.conrelid,
      string_agg(
        format('%I = %s', child_attribute.attname,
          case parent_attribute.attname when 'tenant_id' then '$1' when 'id' then '$2' end),
        ' and ' order by child_key.ordinality
      ) as predicate,
      count(*) filter (where parent_attribute.attname in ('tenant_id', 'id')) as supported_columns,
      cardinality(constraint_row.conkey) as total_columns
    from pg_catalog.pg_constraint constraint_row
    cross join lateral unnest(constraint_row.conkey) with ordinality child_key(attnum, ordinality)
    join lateral unnest(constraint_row.confkey) with ordinality parent_key(attnum, ordinality)
      on parent_key.ordinality = child_key.ordinality
    join pg_catalog.pg_attribute child_attribute
      on child_attribute.attrelid = constraint_row.conrelid and child_attribute.attnum = child_key.attnum
    join pg_catalog.pg_attribute parent_attribute
      on parent_attribute.attrelid = constraint_row.confrelid and parent_attribute.attnum = parent_key.attnum
    where constraint_row.contype = 'f' and constraint_row.confrelid = target_parent
    group by constraint_row.oid, constraint_row.conrelid, constraint_row.conkey
  loop
    if foreign_key.supported_columns <> foreign_key.total_columns then
      raise exception 'Unsupported import rollback foreign key on %', foreign_key.conrelid::regclass;
    end if;
    execute format('select exists (select 1 from %s where %s)', foreign_key.conrelid::regclass, foreign_key.predicate)
      into has_reference using target_tenant_id, target_id;
    if has_reference then
      raise exception 'Import rollback target has dependent rows in %', foreign_key.conrelid::regclass;
    end if;
  end loop;
end;
$$;

revoke all on function app_private.assert_import_target_unreferenced(regclass, uuid, uuid) from public;
grant execute on function app_private.assert_import_target_unreferenced(regclass, uuid, uuid) to service_role;

create function app_private.guard_import_parent_rollback_delete()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if nullif(current_setting('nxttrack.import_rollback_job_id', true), '') is not null
    and current_setting('nxttrack.import_rollback_tenant_id', true) = old.tenant_id::text
  then
    perform app_private.assert_import_target_unreferenced(tg_relid, old.tenant_id, old.id);
  end if;
  return old;
end;
$$;

revoke all on function app_private.guard_import_parent_rollback_delete() from public;

create trigger guard_import_participant_rollback_delete
  before delete on public.participants
  for each row execute function app_private.guard_import_parent_rollback_delete();
create trigger guard_import_group_rollback_delete
  before delete on public.groups
  for each row execute function app_private.guard_import_parent_rollback_delete();

-- Keep the reviewed v1 body available only as a private implementation detail.
-- The public signature first compensates newly-manifested guardian links and sets
-- the transaction-local context consumed by the parent-delete guards.
alter function public.rollback_import_chunk(uuid, uuid, uuid, uuid, integer)
  rename to rollback_import_chunk_v1_unsafe;

create function public.rollback_import_chunk(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_claim_token uuid,
  target_limit integer default 250
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  job public.import_jobs%rowtype;
  manifest public.import_manifest_entries%rowtype;
  current_manifest_id uuid;
  compensated_count integer := 0;
  remaining_count integer;
  legacy_result jsonb;
begin
  if target_limit not between 1 and 250 then raise exception 'Invalid rollback chunk size'; end if;
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then raise exception 'Tenant administrator required'; end if;

  select * into job from public.import_jobs candidate
  where candidate.tenant_id = target_tenant_id and candidate.id = target_job_id for update;
  if job.id is null or job.rollback_state <> 'rolling_back' or job.rollback_claim_token <> target_claim_token
    or job.rollback_lease_expires_at <= now()
  then raise exception 'Import rollback claim is invalid or expired'; end if;

  begin
    for manifest in
      select candidate.* from public.import_manifest_entries candidate
      where candidate.tenant_id = target_tenant_id and candidate.import_job_id = target_job_id
        and candidate.target_table = 'participant_guardians' and candidate.created_by_import
        and candidate.compensation_status in ('pending', 'failed')
      order by candidate.applied_at desc, candidate.id
      limit target_limit
      for update
    loop
      current_manifest_id := manifest.id;
      delete from public.participant_guardians
      where tenant_id = target_tenant_id and id = manifest.target_id;
      update public.import_manifest_entries
      set compensation_status = 'compensated', compensation_attempts = compensation_attempts + 1,
          compensation_error_code = null, compensated_at = now()
      where id = manifest.id;
      compensated_count := compensated_count + 1;
    end loop;
  exception when others then
    update public.import_manifest_entries
    set compensation_status = 'failed', compensation_attempts = compensation_attempts + 1,
        compensation_error_code = 'compensation_failed'
    where id = current_manifest_id;
    update public.import_jobs
    set rollback_state = 'needs_attention', reconciliation_state = 'needs_attention',
        rollback_error_code = 'compensation_failed', rollback_claim_token = null,
        rollback_lease_expires_at = null
    where id = target_job_id;
    return jsonb_build_object('outcome', 'needs_attention', 'errorCode', 'compensation_failed',
      'manifestEntryId', current_manifest_id);
  end;

  if compensated_count > 0 then
    select count(*)::integer into remaining_count from public.import_manifest_entries candidate
    where candidate.tenant_id = target_tenant_id and candidate.import_job_id = target_job_id
      and candidate.created_by_import and candidate.compensation_status in ('pending', 'failed');
    update public.import_jobs set rollback_lease_expires_at = now() + interval '5 minutes' where id = target_job_id;
    return jsonb_build_object('outcome', 'compensated', 'processed', compensated_count,
      'remaining', remaining_count, 'done', remaining_count = 0);
  end if;

  perform set_config('nxttrack.import_rollback_job_id', target_job_id::text, true);
  perform set_config('nxttrack.import_rollback_tenant_id', target_tenant_id::text, true);
  select public.rollback_import_chunk_v1_unsafe(
    target_actor_user_id, target_tenant_id, target_job_id, target_claim_token, target_limit
  ) into legacy_result;
  perform set_config('nxttrack.import_rollback_job_id', '', true);
  perform set_config('nxttrack.import_rollback_tenant_id', '', true);
  return legacy_result;
end;
$$;

revoke all on function public.rollback_import_chunk_v1_unsafe(uuid, uuid, uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.rollback_import_chunk(uuid, uuid, uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.rollback_import_chunk_v1_unsafe(uuid, uuid, uuid, uuid, integer)
  to service_role;
grant execute on function public.rollback_import_chunk(uuid, uuid, uuid, uuid, integer)
  to service_role;
