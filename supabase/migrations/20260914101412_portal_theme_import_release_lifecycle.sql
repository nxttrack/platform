-- Extend the canonical release/asset catalog. Native manifest schema 3 is unchanged.
-- No existing release, assignment, curriculum or historical migration is rewritten.
alter table public.portal_theme_release
  add column presentation_json jsonb,
  add column source_provenance_json jsonb,
  add column import_revision integer not null default 0,
  add column import_findings_json jsonb not null default '[]'::jsonb,
  add column review_digest text,
  add column reviewed_by_user_id uuid references auth.users(id) on delete restrict,
  add column reviewed_at timestamptz,
  add constraint portal_theme_import_revision_check check (import_revision >= 0),
  add constraint portal_theme_presentation_check check (
    presentation_json is null or (
      jsonb_typeof(presentation_json) = 'object'
      and presentation_json->>'presentationContract' = 'rich-swim-journey/1.0'
      and presentation_json->>'themeId' = theme_key
      and presentation_json->>'runtimeRelease' = release
      and manifest_schema_version = 3
    )
  ),
  add constraint portal_theme_review_digest_check check (review_digest is null or review_digest ~ '^[a-f0-9]{64}$');
create index portal_theme_release_reviewer_idx on public.portal_theme_release(reviewed_by_user_id);

alter table public.portal_theme_asset
  add column storage_object_key text,
  add column byte_size bigint,
  drop constraint portal_theme_asset_slot_check,
  add constraint portal_theme_asset_slot_check check (
    slot ~ '^[a-z]+(\.[a-z-]+)+$' or slot ~ '^rich\.[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$'
  ),
  drop constraint portal_theme_asset_mime_check,
  add constraint portal_theme_asset_mime_check check (mime_type in ('image/avif', 'image/webp', 'image/png', 'image/jpeg')),
  add constraint portal_theme_storage_asset_check check (
    storage_object_key is null or (
      storage_object_key = theme_key || '/' || theme_release || '/' || content_hash || '.' || case when mime_type = 'image/jpeg' then 'jpg' else split_part(mime_type, '/', 2) end
      and asset_path = '/portal-themes/' || storage_object_key
      and byte_size between 1 and 20971520
    )
  );
create index portal_theme_asset_storage_key_idx on public.portal_theme_asset(storage_object_key)
  where storage_object_key is not null;

create table public.portal_theme_import (
  id uuid primary key default gen_random_uuid(),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  source_name text not null check (length(source_name) between 1 and 160),
  source_object_key text not null unique,
  byte_size bigint not null check (byte_size between 1 and 67108864),
  status text not null default 'received' check (status in ('received', 'analyzed', 'rejected', 'draft')),
  analysis_json jsonb not null default '{}'::jsonb check (jsonb_typeof(analysis_json) = 'object'),
  created_at timestamptz not null default now(),
  constraint portal_theme_import_source_path_check check (source_object_key = id::text || '/' || source_hash)
);
create index portal_theme_import_actor_created_idx on public.portal_theme_import(created_by_user_id, created_at desc);

create table public.portal_theme_revision (
  theme_key text not null,
  theme_release text not null,
  revision integer not null check (revision > 0),
  document_json jsonb not null check (jsonb_typeof(document_json) = 'object'),
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (theme_key, theme_release, revision),
  foreign key (theme_key, theme_release) references public.portal_theme_release(theme_key, release) on delete restrict
);
create index portal_theme_revision_actor_idx on public.portal_theme_revision(created_by_user_id);

alter table public.portal_theme_import enable row level security;
alter table public.portal_theme_import force row level security;
alter table public.portal_theme_revision enable row level security;
alter table public.portal_theme_revision force row level security;
revoke all on public.portal_theme_import from public, anon, authenticated;
revoke all on public.portal_theme_revision from public, anon, authenticated;
grant select on public.portal_theme_import to authenticated;
grant select on public.portal_theme_revision to authenticated;
grant all on public.portal_theme_import to service_role;
grant select, insert on public.portal_theme_revision to service_role;
create policy portal_theme_import_manager_read on public.portal_theme_import for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));
create policy portal_theme_revision_manager_read on public.portal_theme_revision for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));
create policy portal_child_session_restrictive on public.portal_theme_import as restrictive for all to authenticated
  using (not app_private.is_portal_session_restricted()) with check (not app_private.is_portal_session_restricted());
create policy portal_child_session_restrictive on public.portal_theme_revision as restrictive for all to authenticated
  using (not app_private.is_portal_session_restricted()) with check (not app_private.is_portal_session_restricted());

-- Raw imports are inert evidence, separate from validated raster delivery. Neither bucket is public.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
  ('portal-theme-imports', 'portal-theme-imports', false, 67108864, array['application/octet-stream']),
  ('portal-theme-assets', 'portal-theme-assets', false, 20971520, array['image/png', 'image/webp', 'image/avif', 'image/jpeg']);

alter table public.portal_theme_audit_event drop constraint portal_theme_audit_type_check;
alter table public.portal_theme_audit_event add constraint portal_theme_audit_type_check check (event_type in (
  'previewed', 'scheduled', 'activated', 'rolled_back', 'schedule_cancelled', 'fallback_used',
  'license_verified', 'license_revoked', 'availability_enabled', 'availability_disabled',
  'import_analyzed', 'draft_saved', 'release_reviewed', 'release_published', 'management_changed',
  'world_bound', 'world_rolled_back'
));

create function app_private.require_portal_theme_manager(p_actor uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.platform_memberships m
    where m.user_id = p_actor and m.status = 'active' and m.role in ('platform_owner', 'platform_admin')) then
    raise exception 'platform_theme_manager_required' using errcode = '42501';
  end if;
end;
$$;

create function app_private.portal_theme_release_digest(p_theme text, p_release text)
returns text language sql stable security invoker set search_path = '' as $$
  select encode(extensions.digest(jsonb_build_object(
    'manifest', r.manifest_json, 'presentation', r.presentation_json,
    'provenance', r.source_provenance_json, 'findings', r.import_findings_json,
    'assets', coalesce((select jsonb_agg(jsonb_build_object(
      'slot', a.slot, 'path', a.asset_path, 'key', a.storage_object_key, 'hash', a.content_hash,
      'mime', a.mime_type, 'width', a.intrinsic_width, 'height', a.intrinsic_height, 'bytes', a.byte_size
    ) order by a.slot) from public.portal_theme_asset a
      where a.theme_key = r.theme_key and a.theme_release = r.release), '[]'::jsonb)
  )::text, 'sha256'), 'hex')
  from public.portal_theme_release r where r.theme_key = p_theme and r.release = p_release;
$$;

-- Service-only command boundary. The server validates schemas and decodes/hashes every raster;
-- SQL rechecks identity, availability, optimistic revision and policy inside the same transaction.
create function public.save_portal_theme_draft(
  p_actor uuid, p_theme text, p_release text, p_expected_revision integer,
  p_manifest jsonb, p_presentation jsonb, p_provenance jsonb, p_findings jsonb, p_assets jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  prior public.portal_theme_release%rowtype;
  next_revision integer;
  asset record;
  next_digest text;
begin
  perform app_private.require_portal_theme_manager(p_actor);
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'theme_revision_conflict' using errcode = '40001'; end if;
  if p_theme is null or p_theme !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_release is null or p_release !~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
    or p_manifest is null or p_presentation is null or p_assets is null or p_provenance is null or p_findings is null
    or p_manifest#>>'{theme,key}' is distinct from p_theme or p_manifest#>>'{theme,release}' is distinct from p_release
    or p_manifest->>'schemaVersion' is distinct from '3'
    or p_presentation->>'presentationContract' is distinct from 'rich-swim-journey/1.0'
    or p_presentation->>'themeId' is distinct from p_theme or p_presentation->>'runtimeRelease' is distinct from p_release
    or jsonb_typeof(p_presentation->'worlds') is distinct from 'object' or p_presentation->'worlds' = '{}'::jsonb
    or jsonb_typeof(p_assets) is distinct from 'array' or jsonb_array_length(p_assets) > 300
    or jsonb_typeof(p_findings) is distinct from 'array' or jsonb_typeof(p_provenance) is distinct from 'object'
    or octet_length(p_presentation::text) > 4194304 or octet_length(p_manifest::text) > 4194304 then
    raise exception 'invalid_theme_document' using errcode = '22023';
  end if;
  if p_presentation->>'role' = 'standard' and (
    p_presentation#>>'{pearlArtwork,mode}' is distinct from 'none'
    or p_presentation#>'{pearlArtwork,byCriterionIdentity}' is distinct from '{}'::jsonb
  ) then raise exception 'standard_theme_requires_neutral_pearls' using errcode = '22023'; end if;
  if p_theme = 'nxttrack-default' and (
    p_presentation->>'role' is distinct from 'standard' or p_presentation#>>'{guide,mode}' not in ('none', 'route-light')
  ) then raise exception 'default_theme_policy_violation' using errcode = '22023'; end if;
  -- A catalog key serializes new versions too; no two first-save transactions can lose an edit.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('portal-theme:' || p_theme, 0));
  select * into prior from public.portal_theme_release r where r.theme_key = p_theme and r.release = p_release for update;
  if found then
    if prior.status = 'published' or prior.presentation_json is null then raise exception 'immutable_theme_release' using errcode = '22023'; end if;
    if prior.import_revision <> p_expected_revision then raise exception 'theme_revision_conflict' using errcode = '40001'; end if;
  elsif p_expected_revision <> 0 then raise exception 'theme_revision_conflict' using errcode = '40001';
  end if;
  next_revision := coalesce(prior.import_revision, 0) + 1;
  insert into public.portal_theme(theme_key, display_name, description)
    values(p_theme, p_manifest#>>'{theme,displayName}', p_manifest#>>'{theme,description}') on conflict(theme_key) do nothing;
  insert into public.portal_theme_release(theme_key, release, status, portal_contract, manifest_schema_version,
    manifest_json, content_hash, presentation_json, source_provenance_json, import_revision, import_findings_json)
    values(p_theme, p_release, 'draft', 'parent-portal/1.2', 3, p_manifest, repeat('0', 64), p_presentation, p_provenance, next_revision, p_findings)
  on conflict(theme_key, release) do update set
    status = 'draft', manifest_json = excluded.manifest_json, presentation_json = excluded.presentation_json,
    source_provenance_json = excluded.source_provenance_json, import_revision = excluded.import_revision,
    import_findings_json = excluded.import_findings_json, review_digest = null, reviewed_by_user_id = null, reviewed_at = null;
  delete from public.portal_theme_asset a where a.theme_key = p_theme and a.theme_release = p_release;
  for asset in select * from jsonb_to_recordset(p_assets) as x(
    id text, "objectKey" text, "contentHash" text, mime text, width integer, height integer, bytes bigint)
  loop
    if asset.bytes is null or asset.bytes < 1 or asset.bytes > 20971520 or p_presentation#>>array['assets', asset.id, 'objectKey'] is distinct from asset."objectKey"
      or p_presentation#>>array['assets', asset.id, 'contentHash'] is distinct from asset."contentHash"
      or (p_presentation#>>array['assets', asset.id, 'width'])::integer is distinct from asset.width
      or (p_presentation#>>array['assets', asset.id, 'height'])::integer is distinct from asset.height
      or p_presentation#>>array['assets', asset.id, 'mime'] is distinct from asset.mime
      or not exists(select 1 from storage.objects o where o.bucket_id = 'portal-theme-assets' and o.name = asset."objectKey") then
      raise exception 'theme_asset_validation_mismatch' using errcode = '22023';
    end if;
    insert into public.portal_theme_asset(theme_key, theme_release, slot, asset_path, content_hash, mime_type,
      intrinsic_width, intrinsic_height, storage_object_key, byte_size)
      values(p_theme, p_release, 'rich.' || asset.id, '/portal-themes/' || asset."objectKey", asset."contentHash", asset.mime,
        asset.width, asset.height, asset."objectKey", asset.bytes);
  end loop;
  if (select count(*) from jsonb_object_keys(p_presentation->'assets')) <> jsonb_array_length(p_assets) then
    raise exception 'theme_asset_set_incomplete' using errcode = '22023';
  end if;
  next_digest := app_private.portal_theme_release_digest(p_theme, p_release);
  update public.portal_theme_release r set content_hash = next_digest where r.theme_key = p_theme and r.release = p_release;
  insert into public.portal_theme_revision(theme_key, theme_release, revision, document_json, content_digest, created_by_user_id)
    values(p_theme, p_release, next_revision, jsonb_build_object('manifest', p_manifest, 'presentation', p_presentation,
      'provenance', p_provenance, 'findings', p_findings, 'assets', p_assets), next_digest, p_actor);
  insert into public.portal_theme_audit_event(actor_user_id, event_type, next_theme_key, next_theme_release, reason, metadata_json)
    values(p_actor, 'draft_saved', p_theme, p_release, 'Presentation draft saved', jsonb_build_object('revision', next_revision, 'digest', next_digest));
  return jsonb_build_object('revision', next_revision, 'digest', next_digest);
end;
$$;

create function public.review_portal_theme_release(p_actor uuid, p_theme text, p_release text, p_revision integer, p_digest text, p_checks jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare current_release public.portal_theme_release%rowtype;
begin
  perform app_private.require_portal_theme_manager(p_actor);
  select * into current_release from public.portal_theme_release r where r.theme_key = p_theme and r.release = p_release for update;
  if not found or current_release.presentation_json is null or current_release.status not in ('draft', 'review')
    or current_release.import_revision is distinct from p_revision or p_digest is null
    or app_private.portal_theme_release_digest(p_theme, p_release) is distinct from p_digest then
    raise exception 'theme_review_stale' using errcode = '40001';
  end if;
  if p_checks is distinct from '{"desktop":true,"mobile":true,"content":true,"warnings":true}'::jsonb then
    raise exception 'theme_review_incomplete' using errcode = '22023';
  end if;
  update public.portal_theme_release r set status = 'review', review_digest = p_digest, reviewed_by_user_id = p_actor, reviewed_at = now()
    where r.theme_key = p_theme and r.release = p_release;
  insert into public.portal_theme_audit_event(actor_user_id, event_type, next_theme_key, next_theme_release, reason, metadata_json)
    values(p_actor, 'release_reviewed', p_theme, p_release, 'Visual review of exact content', jsonb_build_object('revision', p_revision, 'digest', p_digest, 'checks', p_checks));
end;
$$;

create function public.publish_portal_theme_release(p_actor uuid, p_theme text, p_release text, p_revision integer, p_digest text)
returns void language plpgsql security invoker set search_path = '' as $$
declare current_release public.portal_theme_release%rowtype;
begin
  perform app_private.require_portal_theme_manager(p_actor);
  select * into current_release from public.portal_theme_release r where r.theme_key = p_theme and r.release = p_release for update;
  if not found or current_release.status <> 'review' or current_release.import_revision is distinct from p_revision
    or p_digest is null or current_release.review_digest is distinct from p_digest
    or app_private.portal_theme_release_digest(p_theme, p_release) is distinct from p_digest then
    raise exception 'theme_publication_requires_current_review' using errcode = '40001';
  end if;
  if exists(select 1 from jsonb_each(current_release.presentation_json->'worlds') w,
    lateral (values(w.value->'portrait'), (w.value->'landscape')) s(scene)
    where s.scene->>'quality' = 'fixture-only' or s.scene#>>'{layers,back}' is null
      or s.scene#>>'{anchorSource,status}' = 'fixture-only') then
    raise exception 'fixture_theme_cannot_be_published' using errcode = '22023';
  end if;
  if p_theme = 'nxttrack-default' and (
    current_release.source_provenance_json->>'dialect' is distinct from 'default-source-1.1'
    or current_release.presentation_json->>'sourcePackageVersion' is distinct from '1.1.0'
    or exists(select 1 from unnest(array['badje-01','badje-02','badje-03','badje-a','badje-b','badje-c']) expected(id)
      where not (current_release.presentation_json->'worlds' ? expected.id))
    or (select count(*) from jsonb_object_keys(current_release.presentation_json->'worlds')) <> 6
    or exists(select 1 from jsonb_each(current_release.presentation_json->'worlds') w,
      lateral (values(w.value->'portrait', 941, 1672), (w.value->'landscape', 1672, 941)) s(scene, width, height)
      where s.scene#>>'{anchorSource,status}' is distinct from 'original'
        or s.scene->>'quality' is distinct from 'source-native'
        or (s.scene#>>'{intrinsic,width}')::integer is distinct from s.width
        or (s.scene#>>'{intrinsic,height}')::integer is distinct from s.height
        or s.scene#>>'{parallax,enabled}' is distinct from 'false'
        or s.scene#>>'{layers,mid}' is null or s.scene#>>'{layers,front}' is null)
  ) then raise exception 'original_default_source_required' using errcode = '22023'; end if;
  if exists(select 1 from public.portal_theme_asset a where a.theme_key = p_theme and a.theme_release = p_release
    and not exists(select 1 from storage.objects o where o.bucket_id = 'portal-theme-assets' and o.name = a.storage_object_key)) then
    raise exception 'theme_asset_missing' using errcode = '22023';
  end if;
  update public.portal_theme_release r set status = 'published', published_at = now()
    where r.theme_key = p_theme and r.release = p_release;
  insert into public.portal_theme_audit_event(actor_user_id, event_type, next_theme_key, next_theme_release, reason, metadata_json)
    values(p_actor, 'release_published', p_theme, p_release, 'Immutable presentation published; no assignment changed', jsonb_build_object('revision', p_revision, 'digest', p_digest));
end;
$$;

-- Inserting assets into an already published release is a mutation as well.
create function app_private.prevent_published_theme_asset_insert()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare release_status text;
begin
  select r.status into release_status from public.portal_theme_release r
    where r.theme_key = new.theme_key and r.release = new.theme_release for update;
  if release_status = 'published' then raise exception 'Assets of published portal theme releases are immutable'; end if;
  return new;
end;
$$;
create trigger prevent_published_theme_asset_insert before insert on public.portal_theme_asset
  for each row execute function app_private.prevent_published_theme_asset_insert();

create function app_private.prevent_portal_theme_revision_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin raise exception 'Portal theme revisions are immutable'; end;
$$;
create trigger prevent_portal_theme_revision_mutation before update or delete on public.portal_theme_revision
  for each row execute function app_private.prevent_portal_theme_revision_mutation();

revoke all on function app_private.require_portal_theme_manager(uuid) from public, anon, authenticated;
revoke all on function app_private.portal_theme_release_digest(text, text) from public, anon, authenticated;
revoke all on function app_private.prevent_published_theme_asset_insert() from public, anon, authenticated;
revoke all on function app_private.prevent_portal_theme_revision_mutation() from public, anon, authenticated;
revoke all on function public.save_portal_theme_draft(uuid, text, text, integer, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.review_portal_theme_release(uuid, text, text, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.publish_portal_theme_release(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function app_private.require_portal_theme_manager(uuid) to service_role;
grant execute on function app_private.portal_theme_release_digest(text, text) to service_role;
grant execute on function public.save_portal_theme_draft(uuid, text, text, integer, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.review_portal_theme_release(uuid, text, text, integer, text, jsonb) to service_role;
grant execute on function public.publish_portal_theme_release(uuid, text, text, integer, text) to service_role;

comment on table public.portal_theme_revision is 'Append-only editable-release history. Review binds the exact native manifest, presentation, asset set and provenance digest.';
comment on table public.portal_theme_import is 'Private quarantine provenance. Raw archive/documentation is inert and never served by the runtime asset route.';
