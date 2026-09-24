-- Complete the Badge Studio truth chain:
-- reusable artwork -> badge definition/award snapshot -> versioned share render.

alter table public.badge_studio_assets
  add column if not exists purpose text not null default 'template_image';

alter table public.badge_studio_assets
  drop constraint if exists badge_studio_assets_purpose_check,
  add constraint badge_studio_assets_purpose_check
    check (purpose in ('badge_artwork', 'template_image'));

alter table public.badge_catalog_definitions
  add column if not exists artwork_asset_id uuid
    references public.badge_studio_assets (id) on delete set null;

alter table public.tenant_custom_badges
  add column if not exists artwork_asset_id uuid
    references public.badge_studio_assets (id) on delete set null;

alter table public.participant_badge_awards
  add column if not exists resolved_artwork_asset_id uuid
    references public.badge_studio_assets (id) on delete set null;

alter table public.badge_share_assets
  add column if not exists template_version integer,
  add column if not exists rendered_at timestamptz;

alter table public.badge_share_assets
  drop constraint if exists badge_share_assets_template_version_check,
  add constraint badge_share_assets_template_version_check
    check (template_version is null or template_version > 0);

create index if not exists badge_catalog_artwork_idx
  on public.badge_catalog_definitions (artwork_asset_id)
  where artwork_asset_id is not null;

create index if not exists tenant_custom_badges_artwork_idx
  on public.tenant_custom_badges (tenant_id, artwork_asset_id)
  where artwork_asset_id is not null;

create index if not exists participant_badge_awards_artwork_idx
  on public.participant_badge_awards (tenant_id, resolved_artwork_asset_id)
  where resolved_artwork_asset_id is not null;

create or replace function app_private.enforce_badge_artwork_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  asset_tenant_id uuid;
  asset_purpose text;
  requested_asset_id uuid;
  row_tenant_id uuid;
  row_data jsonb;
begin
  row_data := to_jsonb(new);
  requested_asset_id := coalesce(
    nullif(row_data ->> 'resolved_artwork_asset_id', '')::uuid,
    nullif(row_data ->> 'artwork_asset_id', '')::uuid
  );
  row_tenant_id := nullif(row_data ->> 'tenant_id', '')::uuid;
  if requested_asset_id is null then
    return new;
  end if;

  select tenant_id, purpose
    into asset_tenant_id, asset_purpose
  from public.badge_studio_assets
  where id = requested_asset_id
    and status = 'active';

  if not found or asset_purpose <> 'badge_artwork' then
    raise exception 'Badge artwork must reference an active badge_artwork asset.';
  end if;
  if tg_table_name = 'badge_catalog_definitions' and asset_tenant_id is not null then
    raise exception 'Catalog artwork must be platform scoped.';
  end if;
  if tg_table_name = 'tenant_custom_badges' and asset_tenant_id is distinct from row_tenant_id then
    raise exception 'Custom badge artwork must match the badge tenant.';
  end if;
  if tg_table_name = 'participant_badge_awards' and asset_tenant_id is not null and asset_tenant_id is distinct from row_tenant_id then
    raise exception 'Award artwork must be global or match the award tenant.';
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_badge_artwork_scope() from public, anon, authenticated;
grant execute on function app_private.enforce_badge_artwork_scope() to service_role;

drop trigger if exists badge_catalog_artwork_scope on public.badge_catalog_definitions;
create trigger badge_catalog_artwork_scope
  before insert or update of artwork_asset_id on public.badge_catalog_definitions
  for each row execute function app_private.enforce_badge_artwork_scope();

drop trigger if exists tenant_custom_badge_artwork_scope on public.tenant_custom_badges;
create trigger tenant_custom_badge_artwork_scope
  before insert or update of artwork_asset_id on public.tenant_custom_badges
  for each row execute function app_private.enforce_badge_artwork_scope();

drop trigger if exists participant_badge_award_artwork_scope on public.participant_badge_awards;
create trigger participant_badge_award_artwork_scope
  before insert or update of resolved_artwork_asset_id on public.participant_badge_awards
  for each row execute function app_private.enforce_badge_artwork_scope();

comment on column public.badge_catalog_definitions.artwork_asset_id is
  'Platform artwork shown on the badge wall and available to share-template badge layers.';
comment on column public.tenant_custom_badges.artwork_asset_id is
  'Tenant-scoped artwork for a manually awarded custom badge.';
comment on column public.participant_badge_awards.resolved_artwork_asset_id is
  'Artwork snapshot selected when the badge was awarded.';
comment on column public.badge_share_assets.template_version is
  'Exact published template version used for the deterministic share render.';
