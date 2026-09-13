-- PostgREST exposes functions from the public API schema. Keep all authority in
-- the existing app_private commands and expose only service-role invoker shims.

create function public.select_available_tenant_portal_theme(
  target_tenant_id uuid,
  target_theme_key text,
  target_theme_release text,
  target_actor_user_id uuid,
  target_reason text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app_private.select_available_tenant_portal_theme(
    target_tenant_id,
    target_theme_key,
    target_theme_release,
    target_actor_user_id,
    target_reason
  );
$$;

create function public.set_tenant_portal_theme_availability(
  target_tenant_id uuid,
  target_theme_key text,
  target_theme_release text,
  target_is_enabled boolean,
  target_actor_user_id uuid,
  target_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_private.set_tenant_portal_theme_availability(
    target_tenant_id,
    target_theme_key,
    target_theme_release,
    target_is_enabled,
    target_actor_user_id,
    target_reason
  );
$$;

create function public.set_tenant_portal_theme_license(
  target_tenant_id uuid,
  target_actor_user_id uuid,
  target_status text,
  target_evidence_reference text,
  target_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_private.set_tenant_portal_theme_license(
    target_tenant_id,
    target_actor_user_id,
    target_status,
    target_evidence_reference,
    target_reason
  );
$$;

revoke all on function public.select_available_tenant_portal_theme(
  uuid, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.select_available_tenant_portal_theme(
  uuid, text, text, uuid, text
) to service_role;

revoke all on function public.set_tenant_portal_theme_availability(
  uuid, text, text, boolean, uuid, text
) from public, anon, authenticated;
grant execute on function public.set_tenant_portal_theme_availability(
  uuid, text, text, boolean, uuid, text
) to service_role;

revoke all on function public.set_tenant_portal_theme_license(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.set_tenant_portal_theme_license(
  uuid, uuid, text, text, text
) to service_role;

comment on function public.select_available_tenant_portal_theme(
  uuid, text, text, uuid, text
) is 'Service-only Data API wrapper; tenant authorization and locking remain in app_private.';
comment on function public.set_tenant_portal_theme_availability(
  uuid, text, text, boolean, uuid, text
) is 'Service-only Data API wrapper; platform authorization, locking and audit remain in app_private.';
comment on function public.set_tenant_portal_theme_license(
  uuid, uuid, text, text, text
) is 'Service-only Data API wrapper; platform authorization and audit remain in app_private.';

notify pgrst, 'reload schema';
