-- A platform role is not an implicit tenant write capability. Platform actors use
-- service-routed application commands, or receive an explicit active management
-- membership in the target tenant before making a client-role mutation.
create function app_private.prevent_platform_only_tenant_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target_tenant_id uuid;
begin
  if current_user <> 'authenticated' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  target_tenant_id := case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;

  if target_tenant_id is not null
    and app_private.current_user_has_platform_role(
      array['platform_owner', 'platform_admin', 'platform_support']
    )
    and not app_private.current_user_has_tenant_role(
      target_tenant_id,
      array['tenant_owner', 'tenant_admin', 'tenant_staff']
    )
  then
    raise exception 'Direct platform-only tenant mutation is forbidden';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'public.tenant_onboarding_runs'::regclass,
    'public.tenant_onboarding_events'::regclass,
    'public.auth_invitations'::regclass,
    'public.tenant_memberships'::regclass,
    'public.participants'::regclass,
    'public.participant_guardians'::regclass,
    'public.enrollments'::regclass,
    'public.intake_submissions'::regclass,
    'public.intake_answers'::regclass,
    'public.groups'::regclass,
    'public.group_memberships'::regclass,
    'public.import_jobs'::regclass,
    'public.import_rows'::regclass,
    'public.import_job_events'::regclass,
    'public.import_manifest_entries'::regclass,
    'public.email_outbox'::regclass,
    'public.email_outbox_events'::regclass,
    'public.core_write_operations'::regclass,
    'storage.objects'::regclass
  ]
  loop
    execute format(
      'create trigger platform_only_tenant_mutation_guard before insert or update or delete on %s for each row execute function app_private.prevent_platform_only_tenant_mutation()',
      target_table
    );
  end loop;
end;
$$;

revoke all on function app_private.prevent_platform_only_tenant_mutation()
  from public, anon, authenticated;
grant execute on function app_private.prevent_platform_only_tenant_mutation()
  to service_role;
