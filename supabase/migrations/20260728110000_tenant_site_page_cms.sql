-- Structured tenant website content. Plain-text fields and local CTA paths
-- keep public rendering predictable and avoid arbitrary HTML/script injection.

create table public.tenant_site_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  page_key text not null,
  eyebrow text not null,
  title text not null,
  intro text not null,
  primary_cta_label text,
  primary_cta_href text,
  secondary_cta_label text,
  secondary_cta_href text,
  seo_title text,
  seo_description text,
  theme text not null default 'water',
  status text not null default 'published',
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_site_pages_key_check check (page_key in ('home', 'programs', 'agenda', 'news')),
  constraint tenant_site_pages_theme_check check (theme in ('water', 'calm', 'navy')),
  constraint tenant_site_pages_status_check check (status in ('published', 'hidden')),
  constraint tenant_site_pages_primary_cta_check check (
    (primary_cta_label is null and primary_cta_href is null)
    or (
      primary_cta_label is not null
      and primary_cta_href ~ '^/[A-Za-z0-9_?&=%./-]*$'
      and primary_cta_href !~ '^//'
    )
  ),
  constraint tenant_site_pages_secondary_cta_check check (
    (secondary_cta_label is null and secondary_cta_href is null)
    or (
      secondary_cta_label is not null
      and secondary_cta_href ~ '^/[A-Za-z0-9_?&=%./-]*$'
      and secondary_cta_href !~ '^//'
    )
  ),
  constraint tenant_site_pages_scope_unique unique (tenant_id, page_key),
  constraint tenant_site_pages_tenant_id_id_unique unique (tenant_id, id)
);

create index tenant_site_pages_status_idx
  on public.tenant_site_pages (tenant_id, status, page_key);

create trigger tenant_site_pages_set_updated_at
  before update on public.tenant_site_pages
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.tenant_site_pages to authenticated;
grant all on public.tenant_site_pages to service_role;

alter table public.tenant_site_pages enable row level security;
alter table public.tenant_site_pages force row level security;

create policy "Tenant admins manage website pages"
  on public.tenant_site_pages for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
