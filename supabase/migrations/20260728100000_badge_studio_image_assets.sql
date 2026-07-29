-- Private, reusable image library for the Badge Studio.
-- Metadata is tenant-aware for future tenant editors; the first UI manages
-- platform-wide assets only. Object bytes remain service-role-only.

create table public.badge_studio_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  name text not null,
  storage_bucket text not null default 'badge-studio-assets',
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  malware_scan_status text not null,
  status text not null default 'active',
  uploaded_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_studio_assets_bucket_check check (storage_bucket = 'badge-studio-assets'),
  constraint badge_studio_assets_mime_check check (mime_type in ('image/jpeg', 'image/png')),
  constraint badge_studio_assets_size_check check (size_bytes > 0 and size_bytes <= 5242880),
  constraint badge_studio_assets_sha256_check check (sha256 ~ '^[a-f0-9]{64}$'),
  constraint badge_studio_assets_scan_check check (malware_scan_status in ('clean', 'not_required')),
  constraint badge_studio_assets_status_check check (status in ('active', 'archived')),
  constraint badge_studio_assets_storage_unique unique (storage_bucket, storage_path)
);

create index badge_studio_assets_scope_idx
  on public.badge_studio_assets (tenant_id, status, created_at desc);

create trigger badge_studio_assets_set_updated_at
  before update on public.badge_studio_assets
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.badge_studio_assets to authenticated;
grant all on public.badge_studio_assets to service_role;

alter table public.badge_studio_assets enable row level security;
alter table public.badge_studio_assets force row level security;

create policy "Scoped users read badge studio assets"
  on public.badge_studio_assets for select to authenticated
  using (
    tenant_id is null
    or app_private.current_user_has_tenant_role(
      tenant_id,
      array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete']
    )
    or app_private.current_user_has_platform_role(
      array['platform_owner', 'platform_admin', 'platform_support']
    )
  );

create policy "Badge admins manage badge studio assets"
  on public.badge_studio_assets for all to authenticated
  using (
    (tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
    or (tenant_id is not null and app_private.current_user_can_manage_tenant_domain(tenant_id))
  )
  with check (
    (tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
    or (tenant_id is not null and app_private.current_user_can_manage_tenant_domain(tenant_id))
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'badge-studio-assets',
  'badge-studio-assets',
  false,
  5242880,
  array['image/jpeg', 'image/png']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Deliberately no storage.objects policy: uploads and signed reads are issued
-- by reviewed server actions after platform/tenant authorization.
