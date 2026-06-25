alter table public.tenant_public_profiles
  add column if not exists social_image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-assets',
  'tenant-assets',
  true,
  5242880,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read tenant asset objects" on storage.objects;
drop policy if exists "Tenant staff can read tenant asset objects" on storage.objects;
create policy "Tenant staff can read tenant asset objects"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'tenant-assets'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and (
      app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
      or app_private.current_user_has_tenant_role(((storage.foldername(name))[1])::uuid, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
    )
  );

drop policy if exists "Tenant staff can insert tenant asset objects" on storage.objects;
create policy "Tenant staff can insert tenant asset objects"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tenant-assets'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and (
      app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
      or app_private.current_user_has_tenant_role(((storage.foldername(name))[1])::uuid, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
    )
  );

drop policy if exists "Tenant staff can update tenant asset objects" on storage.objects;
create policy "Tenant staff can update tenant asset objects"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'tenant-assets'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and (
      app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
      or app_private.current_user_has_tenant_role(((storage.foldername(name))[1])::uuid, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
    )
  )
  with check (
    bucket_id = 'tenant-assets'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and (
      app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
      or app_private.current_user_has_tenant_role(((storage.foldername(name))[1])::uuid, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
    )
  );

drop trigger if exists tenant_public_profiles_audit_events on public.tenant_public_profiles;
create trigger tenant_public_profiles_audit_events
  after insert or update or delete on public.tenant_public_profiles
  for each row execute function app_private.record_audit_event();

drop trigger if exists program_public_settings_audit_events on public.program_public_settings;
create trigger program_public_settings_audit_events
  after insert or update or delete on public.program_public_settings
  for each row execute function app_private.record_audit_event();

drop trigger if exists intake_form_configs_audit_events on public.intake_form_configs;
create trigger intake_form_configs_audit_events
  after insert or update or delete on public.intake_form_configs
  for each row execute function app_private.record_audit_event();
