-- Saved views were introduced as a tenant-only feature. The platform control
-- plane has no active tenant, so platform-admin presets need an explicit
-- tenant-less scope while retaining owner-only access.
alter table public.saved_views
  alter column tenant_id drop not null;

alter table public.saved_views
  drop constraint if exists saved_views_user_resource_name_unique;

create unique index if not exists saved_views_user_resource_name_scope_unique
  on public.saved_views (
    user_id,
    coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    resource_key,
    lower(name)
  );

drop policy if exists "Users manage own saved views" on public.saved_views;

create policy "Users manage own saved views"
  on public.saved_views
  for all
  to authenticated
  using (
    user_id = (select auth.uid())
    and (
      (tenant_id is not null and app_private.current_user_has_tenant_role(
        tenant_id,
        array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent']
      ))
      or
      (tenant_id is null and app_private.current_user_has_platform_role(
        array['platform_owner', 'platform_admin', 'platform_support']
      ))
    )
  )
  with check (
    user_id = (select auth.uid())
    and (
      (tenant_id is not null and app_private.current_user_has_tenant_role(
        tenant_id,
        array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent']
      ))
      or
      (tenant_id is null and app_private.current_user_has_platform_role(
        array['platform_owner', 'platform_admin', 'platform_support']
      ))
    )
  );
