-- Controlled tenant website CMS 2.0.
-- Immutable JSON snapshots contain only application-validated section data;
-- arbitrary HTML, scripts and external CTA URLs remain impossible.

alter table public.tenant_site_pages
  drop constraint if exists tenant_site_pages_status_check;
alter table public.tenant_site_pages
  add constraint tenant_site_pages_status_check check (status in ('draft', 'published', 'hidden'));

create table public.tenant_site_page_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  page_id uuid not null,
  version_number integer not null,
  status text not null default 'draft',
  snapshot_json jsonb not null,
  change_summary text,
  parent_version_id uuid,
  created_by_user_id uuid references auth.users (id) on delete set null,
  published_by_user_id uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tenant_site_page_versions_page_fk
    foreign key (tenant_id, page_id)
    references public.tenant_site_pages (tenant_id, id) on delete cascade,
  constraint tenant_site_page_versions_parent_fk
    foreign key (tenant_id, parent_version_id)
    references public.tenant_site_page_versions (tenant_id, id) on delete set null (parent_version_id),
  constraint tenant_site_page_versions_number_check check (version_number > 0),
  constraint tenant_site_page_versions_status_check
    check (status in ('draft', 'published', 'archived')),
  constraint tenant_site_page_versions_snapshot_check check (
    jsonb_typeof(snapshot_json) = 'object'
    and jsonb_typeof(snapshot_json -> 'page') = 'object'
    and jsonb_typeof(snapshot_json -> 'sections') = 'array'
    and octet_length(snapshot_json::text) <= 131072
  ),
  constraint tenant_site_page_versions_publish_check
    check (
      (status = 'published' and published_by_user_id is not null and published_at is not null)
      or status <> 'published'
    ),
  constraint tenant_site_page_versions_summary_size_check
    check (change_summary is null or length(change_summary) <= 240),
  constraint tenant_site_page_versions_unique unique (tenant_id, page_id, version_number),
  constraint tenant_site_page_versions_tenant_id_id_unique unique (tenant_id, id)
);

alter table public.tenant_site_pages
  add column if not exists draft_version_id uuid,
  add column if not exists published_version_id uuid;
alter table public.tenant_site_pages
  add constraint tenant_site_pages_draft_version_fk
    foreign key (tenant_id, draft_version_id)
    references public.tenant_site_page_versions (tenant_id, id)
    on delete set null (draft_version_id),
  add constraint tenant_site_pages_published_version_fk
    foreign key (tenant_id, published_version_id)
    references public.tenant_site_page_versions (tenant_id, id)
    on delete set null (published_version_id);

create table public.tenant_media_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  alt_text text not null,
  asset_kind text not null default 'photo',
  storage_bucket text not null default 'tenant-media-assets',
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  width integer not null,
  height integer not null,
  file_sha256 text not null,
  malware_scan_engine text not null,
  malware_scan_status text not null,
  malware_scanned_at timestamptz not null,
  consent_status text not null default 'not_required',
  consent_reference text,
  consent_expires_at timestamptz,
  public_enabled boolean not null default false,
  focal_x numeric(5, 4) not null default 0.5,
  focal_y numeric(5, 4) not null default 0.5,
  status text not null default 'draft',
  uploaded_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_media_assets_kind_check check (asset_kind in ('photo', 'graphic', 'logo', 'icon')),
  constraint tenant_media_assets_bucket_check check (storage_bucket = 'tenant-media-assets'),
  constraint tenant_media_assets_mime_check check (mime_type in ('image/jpeg', 'image/png')),
  constraint tenant_media_assets_size_check check (size_bytes > 0 and size_bytes <= 10485760),
  constraint tenant_media_assets_dimensions_check check (width between 64 and 4000 and height between 64 and 4000),
  constraint tenant_media_assets_hash_check check (file_sha256 ~ '^[a-f0-9]{64}$'),
  constraint tenant_media_assets_scan_check check (malware_scan_status in ('clean', 'not_required')),
  constraint tenant_media_assets_consent_check
    check (consent_status in ('not_required', 'granted', 'restricted', 'withdrawn', 'expired')),
  constraint tenant_media_assets_public_check check (
    not public_enabled
    or (
      status = 'active'
      and consent_status in ('not_required', 'granted')
      and (consent_expires_at is null or consent_expires_at > created_at)
    )
  ),
  constraint tenant_media_assets_focal_check check (focal_x between 0 and 1 and focal_y between 0 and 1),
  constraint tenant_media_assets_status_check check (status in ('draft', 'active', 'archived', 'deleted')),
  constraint tenant_media_assets_alt_size_check check (length(trim(alt_text)) between 3 and 240),
  constraint tenant_media_assets_path_unique unique (storage_bucket, storage_path),
  constraint tenant_media_assets_tenant_id_id_unique unique (tenant_id, id)
);

create table public.tenant_site_version_asset_links (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  version_id uuid not null,
  asset_id uuid not null,
  section_id uuid,
  usage_role text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, version_id, asset_id, usage_role),
  constraint tenant_site_version_assets_version_fk
    foreign key (tenant_id, version_id)
    references public.tenant_site_page_versions (tenant_id, id) on delete cascade,
  constraint tenant_site_version_assets_asset_fk
    foreign key (tenant_id, asset_id)
    references public.tenant_media_assets (tenant_id, id) on delete restrict,
  constraint tenant_site_version_assets_role_check
    check (usage_role in ('hero', 'card', 'team', 'location', 'review', 'gallery', 'background'))
);

create table public.tenant_site_page_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  page_id uuid not null,
  version_id uuid,
  event_type text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  message text not null,
  occurred_at timestamptz not null default now(),
  constraint tenant_site_page_events_page_fk
    foreign key (tenant_id, page_id)
    references public.tenant_site_pages (tenant_id, id) on delete cascade,
  constraint tenant_site_page_events_version_fk
    foreign key (tenant_id, version_id)
    references public.tenant_site_page_versions (tenant_id, id) on delete set null (version_id),
  constraint tenant_site_page_events_type_check
    check (event_type in ('draft_saved', 'section_added', 'section_updated', 'section_removed', 'section_moved', 'published', 'restored')),
  constraint tenant_site_page_events_tenant_id_id_unique unique (tenant_id, id)
);

create index tenant_site_page_versions_timeline_idx
  on public.tenant_site_page_versions (tenant_id, page_id, version_number desc);
create index tenant_media_assets_library_idx
  on public.tenant_media_assets (tenant_id, status, asset_kind, created_at desc);
create index tenant_site_page_events_timeline_idx
  on public.tenant_site_page_events (tenant_id, page_id, occurred_at desc);

create trigger tenant_media_assets_set_updated_at
  before update on public.tenant_media_assets
  for each row execute function app_private.set_updated_at();

create or replace function app_private.publish_tenant_site_version(
  p_tenant_id uuid,
  p_page_id uuid,
  p_version_id uuid,
  p_actor_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_version public.tenant_site_page_versions%rowtype;
  page_payload jsonb;
begin
  select * into target_version
  from public.tenant_site_page_versions
  where tenant_id = p_tenant_id and page_id = p_page_id and id = p_version_id
  for update;
  if target_version.id is null then raise exception 'site_version_not_found'; end if;

  if exists (
    select 1
    from public.tenant_site_version_asset_links link
    join public.tenant_media_assets asset
      on asset.tenant_id = link.tenant_id and asset.id = link.asset_id
    where link.tenant_id = p_tenant_id
      and link.version_id = p_version_id
      and (
        asset.status <> 'active'
        or asset.malware_scan_status not in ('clean', 'not_required')
        or asset.consent_status not in ('not_required', 'granted')
        or (asset.consent_expires_at is not null and asset.consent_expires_at <= now())
      )
  ) then
    raise exception 'site_asset_not_publishable';
  end if;

  page_payload := target_version.snapshot_json -> 'page';
  update public.tenant_site_page_versions
  set status = 'archived'
  where tenant_id = p_tenant_id and page_id = p_page_id and status = 'published' and id <> p_version_id;

  update public.tenant_site_page_versions
  set status = 'published', published_by_user_id = p_actor_user_id, published_at = now()
  where tenant_id = p_tenant_id and id = p_version_id;

  update public.tenant_media_assets asset
  set public_enabled = exists (
    select 1
    from public.tenant_site_version_asset_links link
    join public.tenant_site_page_versions version
      on version.tenant_id = link.tenant_id and version.id = link.version_id
    where link.tenant_id = asset.tenant_id
      and link.asset_id = asset.id
      and version.status = 'published'
  )
  where asset.tenant_id = p_tenant_id;

  update public.tenant_site_pages
  set draft_version_id = p_version_id,
      published_version_id = p_version_id,
      eyebrow = page_payload ->> 'eyebrow',
      title = page_payload ->> 'title',
      intro = page_payload ->> 'intro',
      primary_cta_label = nullif(page_payload ->> 'primaryCtaLabel', ''),
      primary_cta_href = nullif(page_payload ->> 'primaryCtaHref', ''),
      secondary_cta_label = nullif(page_payload ->> 'secondaryCtaLabel', ''),
      secondary_cta_href = nullif(page_payload ->> 'secondaryCtaHref', ''),
      seo_title = page_payload ->> 'seoTitle',
      seo_description = page_payload ->> 'seoDescription',
      theme = page_payload ->> 'theme',
      status = case when page_payload ->> 'status' = 'hidden' then 'hidden' else 'published' end,
      updated_by_user_id = p_actor_user_id
  where tenant_id = p_tenant_id and id = p_page_id;

  insert into public.tenant_site_page_events (
    tenant_id, page_id, version_id, event_type, actor_user_id, message
  ) values (
    p_tenant_id, p_page_id, p_version_id, 'published', p_actor_user_id,
    'Websiteversie atomair gepubliceerd.'
  );
  return true;
end;
$$;

create or replace function public.publish_tenant_site_version(
  p_tenant_id uuid,
  p_page_id uuid,
  p_version_id uuid,
  p_actor_user_id uuid
)
returns boolean
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.publish_tenant_site_version(
    p_tenant_id, p_page_id, p_version_id, p_actor_user_id
  );
$$;

revoke all on function app_private.publish_tenant_site_version(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function app_private.publish_tenant_site_version(uuid, uuid, uuid, uuid) to service_role;
revoke all on function public.publish_tenant_site_version(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_tenant_site_version(uuid, uuid, uuid, uuid) to service_role;

create or replace function app_private.save_tenant_site_draft(
  p_tenant_id uuid,
  p_page_id uuid,
  p_snapshot_json jsonb,
  p_change_summary text,
  p_parent_version_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_asset_ids uuid[],
  p_hero_asset_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_version_id uuid;
  new_version_number integer;
  requested_asset_count integer;
  valid_asset_count integer;
begin
  perform 1
  from public.tenant_site_pages
  where tenant_id = p_tenant_id and id = p_page_id
  for update;
  if not found then raise exception 'site_page_not_found'; end if;

  if p_event_type not in ('draft_saved', 'section_added', 'section_updated', 'section_removed', 'section_moved', 'restored') then
    raise exception 'site_event_type_invalid';
  end if;
  if jsonb_typeof(p_snapshot_json) <> 'object'
    or jsonb_typeof(p_snapshot_json -> 'page') <> 'object'
    or jsonb_typeof(p_snapshot_json -> 'sections') <> 'array'
    or octet_length(p_snapshot_json::text) > 131072 then
    raise exception 'site_snapshot_invalid';
  end if;

  requested_asset_count := cardinality(coalesce(p_asset_ids, array[]::uuid[]));
  select count(distinct asset.id)::integer into valid_asset_count
  from public.tenant_media_assets asset
  where asset.tenant_id = p_tenant_id
    and asset.id = any(coalesce(p_asset_ids, array[]::uuid[]))
    and asset.status = 'active';
  if requested_asset_count <> valid_asset_count then raise exception 'site_asset_invalid'; end if;

  select coalesce(max(version_number), 0) + 1 into new_version_number
  from public.tenant_site_page_versions
  where tenant_id = p_tenant_id and page_id = p_page_id;

  update public.tenant_site_page_versions
  set status = 'archived'
  where tenant_id = p_tenant_id and page_id = p_page_id and status = 'draft';

  insert into public.tenant_site_page_versions (
    tenant_id, page_id, version_number, status, snapshot_json, change_summary,
    parent_version_id, created_by_user_id
  ) values (
    p_tenant_id, p_page_id, new_version_number, 'draft', p_snapshot_json,
    nullif(trim(p_change_summary), ''), p_parent_version_id, p_actor_user_id
  )
  returning id into new_version_id;

  insert into public.tenant_site_version_asset_links (
    tenant_id, version_id, asset_id, usage_role
  )
  select
    p_tenant_id,
    new_version_id,
    asset_id,
    case when asset_id = p_hero_asset_id then 'hero' else 'card' end
  from unnest(coalesce(p_asset_ids, array[]::uuid[])) asset_id;

  update public.tenant_site_pages
  set draft_version_id = new_version_id, updated_by_user_id = p_actor_user_id
  where tenant_id = p_tenant_id and id = p_page_id;

  insert into public.tenant_site_page_events (
    tenant_id, page_id, version_id, event_type, actor_user_id, message
  ) values (
    p_tenant_id, p_page_id, new_version_id, p_event_type, p_actor_user_id,
    coalesce(nullif(trim(p_change_summary), ''), 'Websiteconcept opgeslagen.')
  );

  return new_version_id;
end;
$$;

create or replace function public.save_tenant_site_draft(
  p_tenant_id uuid,
  p_page_id uuid,
  p_snapshot_json jsonb,
  p_change_summary text,
  p_parent_version_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_asset_ids uuid[],
  p_hero_asset_id uuid
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.save_tenant_site_draft(
    p_tenant_id, p_page_id, p_snapshot_json, p_change_summary,
    p_parent_version_id, p_actor_user_id, p_event_type, p_asset_ids,
    p_hero_asset_id
  );
$$;

revoke all on function app_private.save_tenant_site_draft(uuid, uuid, jsonb, text, uuid, uuid, text, uuid[], uuid) from public, anon, authenticated;
grant execute on function app_private.save_tenant_site_draft(uuid, uuid, jsonb, text, uuid, uuid, text, uuid[], uuid) to service_role;
revoke all on function public.save_tenant_site_draft(uuid, uuid, jsonb, text, uuid, uuid, text, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.save_tenant_site_draft(uuid, uuid, jsonb, text, uuid, uuid, text, uuid[], uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-media-assets',
  'tenant-media-assets',
  false,
  10485760,
  array['image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

grant select, insert, update, delete on public.tenant_site_page_versions to authenticated;
grant select, insert, update, delete on public.tenant_media_assets to authenticated;
grant select, insert, delete on public.tenant_site_version_asset_links to authenticated;
grant select, insert on public.tenant_site_page_events to authenticated;
grant all on public.tenant_site_page_versions to service_role;
grant all on public.tenant_media_assets to service_role;
grant all on public.tenant_site_version_asset_links to service_role;
grant all on public.tenant_site_page_events to service_role;

alter table public.tenant_site_page_versions enable row level security;
alter table public.tenant_site_page_versions force row level security;
alter table public.tenant_media_assets enable row level security;
alter table public.tenant_media_assets force row level security;
alter table public.tenant_site_version_asset_links enable row level security;
alter table public.tenant_site_version_asset_links force row level security;
alter table public.tenant_site_page_events enable row level security;
alter table public.tenant_site_page_events force row level security;

create policy "Tenant admins manage website versions"
  on public.tenant_site_page_versions for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins manage media library"
  on public.tenant_media_assets for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins manage website asset links"
  on public.tenant_site_version_asset_links for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins read website events"
  on public.tenant_site_page_events for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins create website events"
  on public.tenant_site_page_events for insert to authenticated
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
