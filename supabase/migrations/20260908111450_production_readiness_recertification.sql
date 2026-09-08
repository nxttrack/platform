-- Independent 2026-09-08 re-certification corrections. The reviewed Sprint 1
-- migrations remain immutable; every change here is additive.

-- Import-created Auth identities are external effects. Record their ownership in
-- the durable manifest and fence compensation with a lease/token pair so a crash
-- after Auth deletion can be reconciled safely. Pre-existing/shared identities
-- never receive this manifest target.
alter table public.import_manifest_entries
  add column compensation_claim_token uuid,
  add column compensation_lease_expires_at timestamptz;

alter table public.import_manifest_entries
  drop constraint import_manifest_target_table_check;
alter table public.import_manifest_entries
  add constraint import_manifest_target_table_check check (
    target_table in (
      'participants', 'participant_guardians', 'auth_invitations',
      'tenant_memberships', 'email_outbox', 'groups', 'enrollments',
      'manual_payments', 'import_auth_users'
    )
  );

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
  if invitation.invited_user_id is not null and invitation.invited_user_id <> target_user_id then
    raise exception 'Import invitation is bound to another Auth user';
  end if;

  select membership.id into membership_id
  from public.tenant_memberships membership
  where membership.tenant_id = target_tenant_id and membership.user_id = target_user_id
    and membership.role = 'parent' and membership.invitation_id = invitation.id
  for update;
  already_materialized := membership_id is not null;

  if not already_materialized then
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
      target.target_table, target.target_id, true, greatest(job.apply_attempts, 1)
    from public.import_jobs job
    cross join lateral (values
      ('tenant_memberships'::text, membership_id),
      ('import_auth_users'::text, case when target_is_new_account then target_user_id else null end)
    ) target(target_table, target_id)
    where job.id = target_job_id and target.target_id is not null
    on conflict (tenant_id, import_job_id, import_row_id, target_table) do nothing;
  end if;

  return jsonb_build_object('outcome', 'ready', 'invitationId', invitation.id,
    'membershipId', membership_id, 'alreadyMaterialized', already_materialized);
end;
$$;

revoke all on function public.materialize_import_guardian_invitation(uuid,uuid,uuid,uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.materialize_import_guardian_invitation(uuid,uuid,uuid,uuid,uuid,boolean)
  to service_role;

create function app_private.import_auth_user_owner(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select user_account.raw_app_meta_data ->> 'nxttrack_provisioning_invitation_id'
  from auth.users user_account
  where user_account.id = target_user_id;
$$;

revoke all on function app_private.import_auth_user_owner(uuid) from public, anon, authenticated;
grant execute on function app_private.import_auth_user_owner(uuid) to service_role;

create function app_private.import_auth_user_exists(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users user_account where user_account.id = target_user_id);
$$;

create function app_private.import_auth_users_for_job(target_tenant_id uuid, target_job_id uuid)
returns table (user_id uuid, invitation_id uuid, import_row_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select user_account.id, invitation.id, invitation.import_row_id
  from auth.users user_account
  join public.auth_invitations invitation
    on invitation.id::text = user_account.raw_app_meta_data ->> 'nxttrack_provisioning_invitation_id'
  where invitation.tenant_id = target_tenant_id
    and invitation.import_job_id = target_job_id;
$$;

revoke all on function app_private.import_auth_user_exists(uuid) from public, anon, authenticated;
revoke all on function app_private.import_auth_users_for_job(uuid,uuid) from public, anon, authenticated;
grant execute on function app_private.import_auth_user_exists(uuid) to service_role;
grant execute on function app_private.import_auth_users_for_job(uuid,uuid) to service_role;

create function public.claim_import_auth_user_rollback(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_claim_token uuid,
  target_lease_seconds integer default 300
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  job public.import_jobs%rowtype;
  auth_manifest public.import_manifest_entries%rowtype;
  invitation_id uuid;
  invitation public.auth_invitations%rowtype;
  external_claim_token uuid;
  auth_owner text;
  auth_user_exists boolean;
begin
  if target_lease_seconds not between 30 and 900 then raise exception 'Invalid Auth rollback lease'; end if;
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then raise exception 'Tenant administrator required'; end if;

  select * into job from public.import_jobs candidate
  where candidate.tenant_id = target_tenant_id and candidate.id = target_job_id for update;
  if job.id is null or job.rollback_state <> 'rolling_back'
    or job.rollback_claim_token <> target_claim_token or job.rollback_lease_expires_at <= now()
  then raise exception 'Import rollback claim is invalid or expired'; end if;

  -- An Auth create can commit before the application reaches membership
  -- materialization. Recover those invitation-owned identities from immutable
  -- Auth metadata so rollback cannot silently orphan them.
  insert into public.import_manifest_entries (
    tenant_id, import_job_id, import_row_id, record_type, target_table, target_id,
    created_by_import, apply_attempt
  )
  select target_tenant_id, target_job_id, discovered.import_row_id, 'guardians',
    'import_auth_users', discovered.user_id, true, greatest(job.apply_attempts, 1)
  from app_private.import_auth_users_for_job(target_tenant_id, target_job_id) discovered
  on conflict (tenant_id, import_job_id, import_row_id, target_table) do nothing;

  select * into auth_manifest
  from public.import_manifest_entries candidate
  where candidate.tenant_id = target_tenant_id and candidate.import_job_id = target_job_id
    and candidate.target_table = 'import_auth_users' and candidate.created_by_import
    and candidate.compensation_status in ('pending', 'failed')
    and (candidate.compensation_lease_expires_at is null or candidate.compensation_lease_expires_at <= now())
  order by candidate.applied_at, candidate.id
  limit 1 for update skip locked;
  if auth_manifest.id is null then
    if exists (
      select 1 from public.import_manifest_entries candidate
      where candidate.tenant_id = target_tenant_id and candidate.import_job_id = target_job_id
        and candidate.target_table = 'import_auth_users' and candidate.created_by_import
        and candidate.compensation_status in ('pending', 'failed')
    ) then return jsonb_build_object('outcome', 'busy'); end if;
    return jsonb_build_object('outcome', 'empty');
  end if;

  if auth_manifest.compensation_attempts >= 100 then
    update public.import_jobs
    set rollback_state = 'needs_attention', reconciliation_state = 'needs_attention',
        rollback_error_code = 'auth_compensation_exhausted', rollback_claim_token = null,
        rollback_lease_expires_at = null
    where id = target_job_id;
    return jsonb_build_object('outcome', 'needs_attention', 'errorCode', 'auth_compensation_exhausted');
  end if;

  select target_id into invitation_id
  from public.import_manifest_entries candidate
  where candidate.tenant_id = target_tenant_id and candidate.import_job_id = target_job_id
    and candidate.import_row_id = auth_manifest.import_row_id
    and candidate.target_table = 'auth_invitations' and candidate.created_by_import;
  select * into invitation from public.auth_invitations candidate
  where candidate.tenant_id = target_tenant_id and candidate.id = invitation_id for update;
  if invitation.id is null or invitation.status <> 'pending' or invitation.provider_accepted_at is not null then
    update public.import_manifest_entries
    set compensation_status = 'failed', compensation_attempts = compensation_attempts + 1,
        compensation_error_code = 'auth_identity_not_removable'
    where id = auth_manifest.id;
    update public.import_jobs
    set rollback_state = 'needs_attention', reconciliation_state = 'needs_attention',
        rollback_error_code = 'auth_identity_not_removable', rollback_claim_token = null,
        rollback_lease_expires_at = null
    where id = target_job_id;
    return jsonb_build_object('outcome', 'needs_attention', 'errorCode', 'auth_identity_not_removable');
  end if;

  auth_user_exists := app_private.import_auth_user_exists(auth_manifest.target_id);
  auth_owner := app_private.import_auth_user_owner(auth_manifest.target_id);
  if (auth_user_exists and auth_owner is distinct from invitation.id::text)
    or (auth_user_exists and invitation.invited_user_id is not null
      and invitation.invited_user_id is distinct from auth_manifest.target_id)
    or exists (select 1 from public.platform_memberships membership where membership.user_id = auth_manifest.target_id)
    or exists (
      select 1 from public.tenant_memberships membership
      where membership.user_id = auth_manifest.target_id
        and not exists (
          select 1 from public.import_manifest_entries owned
          where owned.tenant_id = membership.tenant_id and owned.import_job_id = target_job_id
            and owned.target_table = 'tenant_memberships' and owned.target_id = membership.id
            and owned.created_by_import
        )
    )
    or exists (
      select 1 from public.auth_invitations other_invitation
      where other_invitation.invited_user_id = auth_manifest.target_id and other_invitation.id <> invitation.id
    )
  then
    update public.import_manifest_entries
    set compensation_status = 'failed', compensation_attempts = compensation_attempts + 1,
        compensation_error_code = 'shared_auth_identity'
    where id = auth_manifest.id;
    update public.import_jobs
    set rollback_state = 'needs_attention', reconciliation_state = 'needs_attention',
        rollback_error_code = 'shared_auth_identity', rollback_claim_token = null,
        rollback_lease_expires_at = null
    where id = target_job_id;
    return jsonb_build_object('outcome', 'needs_attention', 'errorCode', 'shared_auth_identity');
  end if;

  external_claim_token := gen_random_uuid();
  update public.import_manifest_entries
  set compensation_claim_token = external_claim_token,
      compensation_lease_expires_at = now() + make_interval(secs => target_lease_seconds),
      compensation_attempts = compensation_attempts + 1,
      compensation_error_code = null
  where id = auth_manifest.id;
  update public.import_jobs set rollback_lease_expires_at = now() + interval '5 minutes' where id = target_job_id;
  return jsonb_build_object(
    'outcome', 'claimed', 'claimToken', external_claim_token,
    'manifestEntryId', auth_manifest.id, 'userId', auth_manifest.target_id,
    'invitationId', invitation.id, 'alreadyDeleted', not auth_user_exists
  );
end;
$$;

create function public.complete_import_auth_user_rollback(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_claim_token uuid,
  target_manifest_entry_id uuid,
  target_external_claim_token uuid,
  target_deleted boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  job public.import_jobs%rowtype;
  auth_manifest public.import_manifest_entries%rowtype;
begin
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then raise exception 'Tenant administrator required'; end if;
  select * into job from public.import_jobs candidate
  where candidate.tenant_id = target_tenant_id and candidate.id = target_job_id for update;
  if job.id is null or job.rollback_state <> 'rolling_back' or job.rollback_claim_token <> target_claim_token
  then raise exception 'Import rollback claim is invalid'; end if;
  select * into auth_manifest from public.import_manifest_entries candidate
  where candidate.id = target_manifest_entry_id and candidate.tenant_id = target_tenant_id
    and candidate.import_job_id = target_job_id and candidate.target_table = 'import_auth_users'
  for update;
  if auth_manifest.id is null or auth_manifest.compensation_claim_token <> target_external_claim_token
    or auth_manifest.compensation_lease_expires_at <= now()
  then raise exception 'Import Auth rollback claim is invalid or expired'; end if;

  if not target_deleted then
    update public.import_manifest_entries
    set compensation_status = 'failed', compensation_error_code = 'auth_delete_failed',
        compensation_claim_token = null, compensation_lease_expires_at = null
    where id = auth_manifest.id;
    update public.import_jobs
    set rollback_state = 'needs_attention', reconciliation_state = 'needs_attention',
        rollback_error_code = 'auth_delete_failed', rollback_claim_token = null,
        rollback_lease_expires_at = null
    where id = target_job_id;
    return jsonb_build_object('outcome', 'needs_attention', 'errorCode', 'auth_delete_failed');
  end if;
  if app_private.import_auth_user_exists(auth_manifest.target_id) then
    raise exception 'Import Auth identity still exists after compensation';
  end if;
  update public.import_manifest_entries
  set compensation_status = 'compensated', compensation_error_code = null,
      compensation_claim_token = null, compensation_lease_expires_at = null,
      compensated_at = now()
  where id = auth_manifest.id;
  return jsonb_build_object('outcome', 'compensated', 'manifestEntryId', auth_manifest.id);
end;
$$;

revoke all on function public.claim_import_auth_user_rollback(uuid,uuid,uuid,uuid,integer)
  from public, anon, authenticated;
revoke all on function public.complete_import_auth_user_rollback(uuid,uuid,uuid,uuid,uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.claim_import_auth_user_rollback(uuid,uuid,uuid,uuid,integer)
  to service_role;
grant execute on function public.complete_import_auth_user_rollback(uuid,uuid,uuid,uuid,uuid,uuid,boolean)
  to service_role;

-- Roll the immutable service-only schema handshake forward to the complete
-- 147-migration lineage.
create or replace function public.runtime_schema_compatibility()
returns table (
  contract_version integer,
  minimum_compatible_app_sha text,
  minimum_schema_fingerprint text,
  required_migration_version text
)
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    5,
    '541fe5fd6cee083cb809eef236382cfd2d519ed3'::text,
    '2b38518a37e41adb2da11224561e44e185c28ca45a962e1f8acfd361aab38aba'::text,
    '20260908111450'::text;
$$;

revoke all on function public.runtime_schema_compatibility() from public, anon, authenticated;
grant execute on function public.runtime_schema_compatibility() to service_role;

comment on function public.runtime_schema_compatibility() is
  'Stable service-only application/schema compatibility handshake. The fingerprint is SHA-256 over the ordered 147-migration minimum schema lineage.';
