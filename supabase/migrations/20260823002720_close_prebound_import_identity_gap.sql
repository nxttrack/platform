-- An Auth trigger may bind invited_user_id before the application materializes
-- the tenant membership. Treating that Auth lineage alone as completed returned
-- a false success with membershipId=null. Completion now requires the exact
-- invitation-owned membership; otherwise the create-only conflict/materialize
-- path remains authoritative.
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
      'tenant_memberships', membership_id, true, greatest(job.apply_attempts, 1)
    from public.import_jobs job where job.id = target_job_id
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
    3,
    '4e3784649767be4c197db624b33995b3d1502f65'::text,
    '761d27a977c53c6037c4408b2064557b80b1c301107195c9065f748ef730fff3'::text,
    '20260823002720'::text;
$$;

revoke all on function public.runtime_schema_compatibility() from public, anon, authenticated;
grant execute on function public.runtime_schema_compatibility() to service_role;

comment on function public.runtime_schema_compatibility() is
  'Stable service-only application/schema compatibility handshake. The fingerprint is SHA-256 over the ordered 145-migration minimum schema lineage.';
