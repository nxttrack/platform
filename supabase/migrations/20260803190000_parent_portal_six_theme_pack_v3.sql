-- NXTTRACK parent portal theme pack v3.
-- Adds the six-theme contract without mutating immutable historical releases.

alter table public.portal_theme_release
  drop constraint portal_theme_release_contract_check,
  add constraint portal_theme_release_contract_check
    check (portal_contract in ('parent-portal/1.1', 'parent-portal/1.2'));

alter table public.portal_theme_release
  drop constraint portal_theme_release_schema_check,
  add constraint portal_theme_release_schema_check
    check (manifest_schema_version in (2, 3));

alter table public.portal_theme_audit_event
  drop constraint portal_theme_audit_type_check,
  add constraint portal_theme_audit_type_check
    check (
      event_type in (
        'previewed',
        'scheduled',
        'activated',
        'rolled_back',
        'schedule_cancelled',
        'fallback_used',
        'license_verified',
        'license_revoked',
        'availability_enabled',
        'availability_disabled'
      )
    );

insert into public.portal_theme (theme_key, display_name, description) values
  ('nxttrack-default', 'NXTTRACK Default', 'Een rustige, sectorspecifiek neutrale momentumroute.'),
  ('dolphin-bay', 'Dolphin Bay', 'Een zonnige, sociale reis van baai naar baai.'),
  ('turtle-trails', 'Turtle Trails', 'Een kalme stroomroute met veilige, herkenbare stappen.'),
  ('polar-splash', 'Polar Splash', 'Een heldere expeditie langs ijsplaten en poolwater.'),
  ('coastal-explorer', 'Coastal Explorer', 'Een nuchtere ontdekkingstocht langs de Nederlandse kust.'),
  ('nationaal-zwem-abc', 'Nationaal Zwem ABC', 'Een A-B-C diplomareis met gecontroleerde naamvoering.')
on conflict (theme_key) do update
set display_name = excluded.display_name, description = excluded.description;

insert into public.portal_theme_release (
  theme_key,
  release,
  status,
  portal_contract,
  manifest_schema_version,
  manifest_json,
  content_hash,
  published_at
) values
  ('nxttrack-default', '3.0.0', 'published', 'parent-portal/1.2', 3, '{"themePack":"1.0.0","registry":"web-build","assessmentScale":"five_point_v1","badgeArtworkMode":"placeholder-only"}', 'f0f873a51d38d9f77c326a1b2636490fc798d734f1eaf7764239e0ec6d1d15cb', now()),
  ('dolphin-bay', '3.0.0', 'published', 'parent-portal/1.2', 3, '{"themePack":"1.0.0","registry":"web-build","assessmentScale":"five_point_v1","badgeArtworkMode":"placeholder-only"}', 'c2c8e8f32176909fc990f004fb18cd1decd0b82d3b0f1e2f6494ab9e5119bfdc', now()),
  ('turtle-trails', '3.0.0', 'published', 'parent-portal/1.2', 3, '{"themePack":"1.0.0","registry":"web-build","assessmentScale":"five_point_v1","badgeArtworkMode":"placeholder-only"}', '13a8ed33133b9b61719d6647777b2d36ae039b9a8c8cd7cd105fa77940acb841', now()),
  ('polar-splash', '3.0.0', 'published', 'parent-portal/1.2', 3, '{"themePack":"1.0.0","registry":"web-build","assessmentScale":"five_point_v1","badgeArtworkMode":"placeholder-only"}', '70bccf3a08da2c5a3482d1ba4a045a39b01959d839fcbbcd05e56bed261ddee2', now()),
  ('coastal-explorer', '3.0.0', 'published', 'parent-portal/1.2', 3, '{"themePack":"1.0.0","registry":"web-build","assessmentScale":"five_point_v1","badgeArtworkMode":"placeholder-only"}', 'f021c7b95683ae7e1f5bb607f550053cbb84bc7d2de5e1601e923a5a0f7e9b23', now()),
  ('nationaal-zwem-abc', '3.0.0', 'published', 'parent-portal/1.2', 3, '{"themePack":"1.0.0","registry":"web-build","assessmentScale":"five_point_v1","badgeArtworkMode":"placeholder-only","publicDisplayName":"Diplomareis A–B–C","requiresVerifiedLicense":true}', 'eabb8c2fce84a6ae5b812d099f4f661917b361d7f211f925e4e7f04c85cb8207', now())
on conflict (theme_key, release) do nothing;

insert into public.portal_theme_asset (
  theme_key,
  theme_release,
  slot,
  asset_path,
  content_hash,
  mime_type,
  intrinsic_width,
  intrinsic_height,
  is_decorative
) values
  ('nxttrack-default', '3.0.0', 'overview.hero.desktop', '/portal-themes/nxttrack-default/journey-desktop.png', '63bf886e4fc43d99f7ded594cfe419abe0de9ebe946dcfd2f0b2fa2c4f6cda12', 'image/png', 1672, 941, true),
  ('nxttrack-default', '3.0.0', 'overview.hero.mobile', '/portal-themes/nxttrack-default/journey-mobile.png', '8a1b4bbdb33967f70dce1e0a7b97a614296d214c8cf0b91715c005a802308518', 'image/png', 941, 1672, true),
  ('nxttrack-default', '3.0.0', 'progress.journey.desktop', '/portal-themes/nxttrack-default/journey-desktop.png', '63bf886e4fc43d99f7ded594cfe419abe0de9ebe946dcfd2f0b2fa2c4f6cda12', 'image/png', 1672, 941, true),
  ('nxttrack-default', '3.0.0', 'progress.journey.mobile', '/portal-themes/nxttrack-default/journey-mobile.png', '8a1b4bbdb33967f70dce1e0a7b97a614296d214c8cf0b91715c005a802308518', 'image/png', 941, 1672, true),
  ('dolphin-bay', '3.0.0', 'overview.hero.desktop', '/portal-themes/dolphin-bay/journey-desktop.png', 'd2294e3ce995c2fc2d9a0b0962ac058e1a9f46dc3a289a37844a10b0e81c1c58', 'image/png', 1672, 941, true),
  ('dolphin-bay', '3.0.0', 'overview.hero.mobile', '/portal-themes/dolphin-bay/journey-mobile.png', '6718a238c5787a20a582fe8d2f0ea71f2ce27065f4eac6d15a92970c0e7ed719', 'image/png', 941, 1672, true),
  ('dolphin-bay', '3.0.0', 'progress.journey.desktop', '/portal-themes/dolphin-bay/journey-desktop.png', 'd2294e3ce995c2fc2d9a0b0962ac058e1a9f46dc3a289a37844a10b0e81c1c58', 'image/png', 1672, 941, true),
  ('dolphin-bay', '3.0.0', 'progress.journey.mobile', '/portal-themes/dolphin-bay/journey-mobile.png', '6718a238c5787a20a582fe8d2f0ea71f2ce27065f4eac6d15a92970c0e7ed719', 'image/png', 941, 1672, true),
  ('dolphin-bay', '3.0.0', 'mascot.idle', '/portal-themes/dolphin-bay/mascot.png', '03d852ba7b0d2e3a430222f1250a2479fc9a05119ce75479205cfc750e53b7d5', 'image/png', 1254, 1254, true),
  ('turtle-trails', '3.0.0', 'overview.hero.desktop', '/portal-themes/turtle-trails/journey-desktop.png', '6634b7b7eb9d4ebc6f2f0dd08172266e3489a3fce1f866d1b7096e7511a41de2', 'image/png', 1664, 936, true),
  ('turtle-trails', '3.0.0', 'overview.hero.mobile', '/portal-themes/turtle-trails/journey-mobile.png', '4eefe146e8723ff0a3ccfdfe5d4d665ac24862e86533fbc9379c142bbf7a05fd', 'image/png', 936, 1664, true),
  ('turtle-trails', '3.0.0', 'progress.journey.desktop', '/portal-themes/turtle-trails/journey-desktop.png', '6634b7b7eb9d4ebc6f2f0dd08172266e3489a3fce1f866d1b7096e7511a41de2', 'image/png', 1664, 936, true),
  ('turtle-trails', '3.0.0', 'progress.journey.mobile', '/portal-themes/turtle-trails/journey-mobile.png', '4eefe146e8723ff0a3ccfdfe5d4d665ac24862e86533fbc9379c142bbf7a05fd', 'image/png', 936, 1664, true),
  ('turtle-trails', '3.0.0', 'mascot.idle', '/portal-themes/turtle-trails/mascot.png', '4876ed4c2b5fb924d2f5ff25c348d0babe07892a6b945afea8ee8db4bc483d8e', 'image/png', 1254, 1254, true),
  ('polar-splash', '3.0.0', 'overview.hero.desktop', '/portal-themes/polar-splash/journey-desktop.png', '8b26b922f823872e8d8a390cec67b89861c09fa723a11ae7d72e4aa46f23fa51', 'image/png', 1664, 936, true),
  ('polar-splash', '3.0.0', 'overview.hero.mobile', '/portal-themes/polar-splash/journey-mobile.png', '903f56d660b460d7a57e43f6440c1190e3bcf4e0a11642bc77265771951c17d1', 'image/png', 936, 1664, true),
  ('polar-splash', '3.0.0', 'progress.journey.desktop', '/portal-themes/polar-splash/journey-desktop.png', '8b26b922f823872e8d8a390cec67b89861c09fa723a11ae7d72e4aa46f23fa51', 'image/png', 1664, 936, true),
  ('polar-splash', '3.0.0', 'progress.journey.mobile', '/portal-themes/polar-splash/journey-mobile.png', '903f56d660b460d7a57e43f6440c1190e3bcf4e0a11642bc77265771951c17d1', 'image/png', 936, 1664, true),
  ('polar-splash', '3.0.0', 'mascot.idle', '/portal-themes/polar-splash/mascot.png', 'af24557e10ed39c052c8e515bb42572693e55b580c254df1c32068807c1cd7ec', 'image/png', 1024, 1536, true),
  ('coastal-explorer', '3.0.0', 'overview.hero.desktop', '/portal-themes/coastal-explorer/journey-desktop.png', 'a70b067e64ef50143788a2c1bdd5c87be9c2487edcde260f768e0a0ac44f1fd1', 'image/png', 1672, 941, true),
  ('coastal-explorer', '3.0.0', 'overview.hero.mobile', '/portal-themes/coastal-explorer/journey-mobile.png', 'd3ac6cb81a806820b1591f6f236e5b5f48c2abf13f6d5eada737f69f95796a7d', 'image/png', 941, 1672, true),
  ('coastal-explorer', '3.0.0', 'progress.journey.desktop', '/portal-themes/coastal-explorer/journey-desktop.png', 'a70b067e64ef50143788a2c1bdd5c87be9c2487edcde260f768e0a0ac44f1fd1', 'image/png', 1672, 941, true),
  ('coastal-explorer', '3.0.0', 'progress.journey.mobile', '/portal-themes/coastal-explorer/journey-mobile.png', 'd3ac6cb81a806820b1591f6f236e5b5f48c2abf13f6d5eada737f69f95796a7d', 'image/png', 941, 1672, true),
  ('coastal-explorer', '3.0.0', 'mascot.idle', '/portal-themes/coastal-explorer/mascot.png', '5f940c254a8c560a51289422f8c66377b0fc563a812c9944cad940ee683564c6', 'image/png', 1024, 1536, true),
  ('nationaal-zwem-abc', '3.0.0', 'overview.hero.desktop', '/portal-themes/nationaal-zwem-abc/journey-desktop.png', '68a954d4b754540552eea2ef834653235379ff2fd6f99f7e53a5e8a7c2b478b6', 'image/png', 1672, 941, true),
  ('nationaal-zwem-abc', '3.0.0', 'overview.hero.mobile', '/portal-themes/nationaal-zwem-abc/journey-mobile.png', 'dcc52b05c4a7a55aa61676b6463797fecdbd39037003e442ee838eaffceca4d2', 'image/png', 941, 1672, true),
  ('nationaal-zwem-abc', '3.0.0', 'progress.journey.desktop', '/portal-themes/nationaal-zwem-abc/journey-desktop.png', '68a954d4b754540552eea2ef834653235379ff2fd6f99f7e53a5e8a7c2b478b6', 'image/png', 1672, 941, true),
  ('nationaal-zwem-abc', '3.0.0', 'progress.journey.mobile', '/portal-themes/nationaal-zwem-abc/journey-mobile.png', 'dcc52b05c4a7a55aa61676b6463797fecdbd39037003e442ee838eaffceca4d2', 'image/png', 941, 1672, true)
on conflict (theme_key, theme_release, slot) do nothing;

alter table public.tenant_portal_theme_assignment
  add column activation_source text not null default 'platform',
  add constraint tenant_portal_theme_assignment_source_check
    check (activation_source in ('platform', 'tenant_admin', 'migration'));

create table public.tenant_portal_theme_availability (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  theme_key text not null,
  theme_release text not null,
  is_enabled boolean not null default true,
  reason text not null,
  enabled_by_platform_admin_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, theme_key, theme_release),
  foreign key (theme_key, theme_release)
    references public.portal_theme_release (theme_key, release) on delete restrict,
  constraint tenant_portal_theme_availability_reason_check
    check (length(trim(reason)) between 3 and 1000)
);

create index tenant_portal_theme_availability_enabled_idx
  on public.tenant_portal_theme_availability (tenant_id, is_enabled, theme_key);

create trigger tenant_portal_theme_availability_set_updated_at
before update on public.tenant_portal_theme_availability
for each row execute function app_private.set_updated_at();

create function app_private.validate_active_portal_theme_assignment()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $$
begin
  if new.deactivated_at is null and not exists (
    select 1
    from public.portal_theme_release release
    where release.theme_key = new.theme_key
      and release.release = new.theme_release
      and release.status = 'published'
      and release.portal_contract = 'parent-portal/1.2'
      and release.manifest_schema_version = 3
  ) then
    raise exception 'Only a published six-theme v3 release can be activated';
  end if;
  return new;
end;
$$;

create trigger validate_active_portal_theme_assignment
before insert or update of theme_key, theme_release, deactivated_at
on public.tenant_portal_theme_assignment
for each row execute function app_private.validate_active_portal_theme_assignment();

grant select on public.tenant_portal_theme_availability to authenticated;
grant all on public.tenant_portal_theme_availability to service_role;

alter table public.tenant_portal_theme_availability enable row level security;
alter table public.tenant_portal_theme_availability force row level security;

create policy tenant_portal_theme_availability_read
  on public.tenant_portal_theme_availability
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_has_platform_role(
      array['platform_owner', 'platform_admin', 'platform_support']
    )
  );

insert into public.tenant_portal_theme_availability (
  tenant_id,
  theme_key,
  theme_release,
  is_enabled,
  reason
)
select
  tenant.id,
  release.theme_key,
  release.release,
  true,
  'Zes-thema launchcatalogus v3'
from public.tenants tenant
cross join (
  values
    ('nxttrack-default', '3.0.0'),
    ('dolphin-bay', '3.0.0'),
    ('turtle-trails', '3.0.0'),
    ('polar-splash', '3.0.0'),
    ('coastal-explorer', '3.0.0'),
    ('nationaal-zwem-abc', '3.0.0')
) as release(theme_key, release)
on conflict (tenant_id, theme_key, theme_release) do nothing;

do $$
declare
  previous_assignment public.tenant_portal_theme_assignment%rowtype;
  next_theme_key text;
begin
  for previous_assignment in
    select *
    from public.tenant_portal_theme_assignment assignment
    where assignment.deactivated_at is null
      and assignment.theme_release <> '3.0.0'
  loop
    next_theme_key := case
      when previous_assignment.theme_key in ('nxttrack-default', 'dolphin-bay', 'turtle-trails')
        then previous_assignment.theme_key
      else 'nxttrack-default'
    end;
    update public.tenant_portal_theme_assignment
    set deactivated_at = now()
    where id = previous_assignment.id;
    insert into public.tenant_portal_theme_assignment (
      tenant_id,
      theme_key,
      theme_release,
      activated_by_platform_admin_id,
      previous_assignment_id,
      reason,
      ticket_reference,
      activation_source
    ) values (
      previous_assignment.tenant_id,
      next_theme_key,
      '3.0.0',
      previous_assignment.activated_by_platform_admin_id,
      previous_assignment.id,
      'Superseded five-theme catalog migrated to six-theme v3',
      previous_assignment.ticket_reference,
      'migration'
    );
  end loop;
end;
$$;

create function app_private.select_available_tenant_portal_theme(
  target_tenant_id uuid,
  target_theme_key text,
  target_theme_release text,
  target_actor_user_id uuid,
  target_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  previous_assignment public.tenant_portal_theme_assignment%rowtype;
  next_assignment_id uuid;
begin
  if not exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = target_actor_user_id
      and membership.status = 'active'
      and membership.role in ('tenant_owner', 'tenant_admin')
  ) then
    raise exception 'Tenant theme manager required';
  end if;
  if length(trim(coalesce(target_reason, ''))) < 3 then
    raise exception 'Theme selection reason required';
  end if;
  if not exists (
    select 1
    from public.tenant_portal_theme_availability availability
    join public.portal_theme_release release
      on release.theme_key = availability.theme_key
     and release.release = availability.theme_release
     and release.status = 'published'
     and release.manifest_schema_version = 3
    where availability.tenant_id = target_tenant_id
      and availability.theme_key = target_theme_key
      and availability.theme_release = target_theme_release
      and availability.is_enabled
  ) then
    raise exception 'Theme release is not available for this tenant';
  end if;

  perform 1 from public.tenants where id = target_tenant_id for update;
  select * into previous_assignment
  from public.tenant_portal_theme_assignment assignment
  where assignment.tenant_id = target_tenant_id
    and assignment.deactivated_at is null
  for update;
  if previous_assignment.theme_key = target_theme_key
    and previous_assignment.theme_release = target_theme_release
  then
    return previous_assignment.id;
  end if;

  update public.tenant_portal_theme_assignment
  set deactivated_at = now()
  where tenant_id = target_tenant_id
    and deactivated_at is null;

  insert into public.tenant_portal_theme_assignment (
    tenant_id,
    theme_key,
    theme_release,
    activated_by_platform_admin_id,
    previous_assignment_id,
    reason,
    activation_source
  ) values (
    target_tenant_id,
    target_theme_key,
    target_theme_release,
    target_actor_user_id,
    previous_assignment.id,
    trim(target_reason),
    'tenant_admin'
  )
  returning id into next_assignment_id;

  insert into public.portal_theme_audit_event (
    tenant_id,
    actor_user_id,
    event_type,
    previous_theme_key,
    previous_theme_release,
    next_theme_key,
    next_theme_release,
    reason,
    request_correlation_id,
    metadata_json
  ) values (
    target_tenant_id,
    target_actor_user_id,
    'activated',
    previous_assignment.theme_key,
    previous_assignment.theme_release,
    target_theme_key,
    target_theme_release,
    trim(target_reason),
    gen_random_uuid()::text,
    jsonb_build_object('source', 'tenant_admin')
  );

  return next_assignment_id;
end;
$$;

revoke all on function app_private.select_available_tenant_portal_theme(
  uuid, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function app_private.select_available_tenant_portal_theme(
  uuid, text, text, uuid, text
) to service_role;

create function app_private.set_tenant_portal_theme_availability(
  target_tenant_id uuid,
  target_theme_key text,
  target_theme_release text,
  target_is_enabled boolean,
  target_actor_user_id uuid,
  target_reason text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.platform_memberships membership
    where membership.user_id = target_actor_user_id
      and membership.status = 'active'
      and membership.role in ('platform_owner', 'platform_admin')
  ) then
    raise exception 'Platform theme manager required';
  end if;
  if length(trim(coalesce(target_reason, ''))) < 3 then
    raise exception 'Availability reason required';
  end if;
  if not exists (
    select 1
    from public.portal_theme_release release
    where release.theme_key = target_theme_key
      and release.release = target_theme_release
      and release.status = 'published'
      and release.portal_contract = 'parent-portal/1.2'
      and release.manifest_schema_version = 3
  ) then
    raise exception 'Published six-theme release required';
  end if;

  perform 1 from public.tenants where id = target_tenant_id for update;
  if not found then raise exception 'Tenant not found'; end if;

  insert into public.tenant_portal_theme_availability (
    tenant_id,
    theme_key,
    theme_release,
    is_enabled,
    reason,
    enabled_by_platform_admin_id
  ) values (
    target_tenant_id,
    target_theme_key,
    target_theme_release,
    target_is_enabled,
    trim(target_reason),
    target_actor_user_id
  )
  on conflict (tenant_id, theme_key, theme_release) do update
  set is_enabled = excluded.is_enabled,
      reason = excluded.reason,
      enabled_by_platform_admin_id = excluded.enabled_by_platform_admin_id,
      updated_at = now();

  insert into public.portal_theme_audit_event (
    tenant_id,
    actor_user_id,
    event_type,
    next_theme_key,
    next_theme_release,
    reason,
    request_correlation_id,
    metadata_json
  ) values (
    target_tenant_id,
    target_actor_user_id,
    case when target_is_enabled then 'availability_enabled' else 'availability_disabled' end,
    target_theme_key,
    target_theme_release,
    trim(target_reason),
    gen_random_uuid()::text,
    jsonb_build_object('source', 'platform_control_center')
  );
end;
$$;

revoke all on function app_private.set_tenant_portal_theme_availability(
  uuid, text, text, boolean, uuid, text
) from public, anon, authenticated;
grant execute on function app_private.set_tenant_portal_theme_availability(
  uuid, text, text, boolean, uuid, text
) to service_role;

create table public.tenant_portal_theme_license (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  theme_key text not null references public.portal_theme (theme_key) on delete restrict,
  status text not null default 'unverified',
  evidence_reference text,
  verified_at timestamptz,
  expires_at timestamptz,
  verified_by_platform_admin_id uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, theme_key),
  constraint tenant_portal_theme_license_status_check
    check (status in ('unverified', 'verified', 'expired', 'revoked')),
  constraint tenant_portal_theme_license_evidence_check
    check (
      (status = 'verified' and evidence_reference is not null and verified_at is not null and verified_by_platform_admin_id is not null)
      or status <> 'verified'
    )
);

create index tenant_portal_theme_license_status_idx
  on public.tenant_portal_theme_license (theme_key, status, expires_at);

grant select on public.tenant_portal_theme_license to authenticated;
grant all on public.tenant_portal_theme_license to service_role;

alter table public.tenant_portal_theme_license enable row level security;
alter table public.tenant_portal_theme_license force row level security;

create policy "Platform staff can view tenant theme licenses"
  on public.tenant_portal_theme_license
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(
      array['platform_owner', 'platform_admin', 'platform_support']
    )
  );

create function app_private.set_tenant_portal_theme_license(
  target_tenant_id uuid,
  target_actor_user_id uuid,
  target_status text,
  target_evidence_reference text,
  target_reason text
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  target_now timestamptz := now();
begin
  if not exists (
    select 1
    from public.platform_memberships membership
    where membership.user_id = target_actor_user_id
      and membership.status = 'active'
      and membership.role in ('platform_owner', 'platform_admin')
  ) then
    raise exception 'Platform theme manager required';
  end if;
  if target_status not in ('verified', 'revoked') then
    raise exception 'Invalid license status';
  end if;
  if target_status = 'verified'
    and length(trim(coalesce(target_evidence_reference, ''))) < 3
  then
    raise exception 'License evidence required';
  end if;
  if length(trim(coalesce(target_reason, ''))) < 3 then
    raise exception 'License reason required';
  end if;

  perform 1 from public.tenants where id = target_tenant_id for update;
  if not found then raise exception 'Tenant not found'; end if;

  insert into public.tenant_portal_theme_license (
    tenant_id,
    theme_key,
    status,
    evidence_reference,
    verified_at,
    expires_at,
    verified_by_platform_admin_id,
    updated_at
  ) values (
    target_tenant_id,
    'nationaal-zwem-abc',
    target_status,
    case when target_status = 'verified' then trim(target_evidence_reference) else null end,
    case when target_status = 'verified' then target_now else null end,
    null,
    case when target_status = 'verified' then target_actor_user_id else null end,
    target_now
  )
  on conflict (tenant_id, theme_key) do update
  set status = excluded.status,
      evidence_reference = excluded.evidence_reference,
      verified_at = excluded.verified_at,
      expires_at = excluded.expires_at,
      verified_by_platform_admin_id = excluded.verified_by_platform_admin_id,
      updated_at = excluded.updated_at;

  insert into public.portal_theme_audit_event (
    tenant_id,
    actor_user_id,
    event_type,
    next_theme_key,
    next_theme_release,
    reason,
    request_correlation_id,
    metadata_json
  ) values (
    target_tenant_id,
    target_actor_user_id,
    case when target_status = 'verified' then 'license_verified' else 'license_revoked' end,
    'nationaal-zwem-abc',
    '3.0.0',
    case
      when target_status = 'verified'
        then trim(target_reason) || ': ' || trim(target_evidence_reference)
      else trim(target_reason)
    end,
    gen_random_uuid()::text,
    jsonb_build_object('gate', 'public_display_name')
  );
end;
$$;

revoke all on function app_private.set_tenant_portal_theme_license(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function app_private.set_tenant_portal_theme_license(
  uuid, uuid, text, text, text
) to service_role;

create table public.portal_journey_chapter_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrollment_id uuid not null,
  participant_id uuid not null,
  curriculum_version_id uuid not null,
  curriculum_stage_id uuid not null,
  transition_case_id uuid not null,
  theme_key text not null,
  theme_release text not null,
  artwork_id text not null,
  route_order_json jsonb not null,
  completion_data_json jsonb not null,
  badge_award_ids uuid[] not null default '{}'::uuid[],
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, curriculum_stage_id)
    references public.curriculum_stages (tenant_id, id) on delete restrict,
  foreign key (tenant_id, transition_case_id)
    references public.swim_transition_cases (tenant_id, id) on delete restrict,
  foreign key (theme_key, theme_release)
    references public.portal_theme_release (theme_key, release) on delete restrict,
  constraint portal_journey_chapter_snapshots_route_check
    check (jsonb_typeof(route_order_json) = 'array'),
  constraint portal_journey_chapter_snapshots_completion_check
    check (jsonb_typeof(completion_data_json) = 'object'),
  constraint portal_journey_chapter_snapshots_artwork_check
    check (artwork_id ~ '^/portal-themes/[a-z0-9/_\.-]+$'),
  constraint portal_journey_chapter_snapshots_unique
    unique (tenant_id, enrollment_id, curriculum_version_id, curriculum_stage_id)
);

create index portal_journey_chapter_snapshots_participant_idx
  on public.portal_journey_chapter_snapshots (tenant_id, participant_id, completed_at desc);

grant select on public.portal_journey_chapter_snapshots to authenticated;
grant select, insert on public.portal_journey_chapter_snapshots to service_role;

alter table public.portal_journey_chapter_snapshots enable row level security;
alter table public.portal_journey_chapter_snapshots force row level security;

create policy portal_journey_chapter_snapshots_read
  on public.portal_journey_chapter_snapshots
  for select
  to authenticated
  using (
    app_private.current_user_can_view_participant(participant_id)
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
  );

create function app_private.capture_portal_journey_chapter_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  target_case public.swim_transition_cases%rowtype;
  previous_assignment public.enrollment_stage_assignments%rowtype;
  snapshot_theme_key text;
  snapshot_theme_release text;
  snapshot_artwork_id text;
  snapshot_route_order jsonb;
  snapshot_completion_data jsonb;
  snapshot_badge_award_ids uuid[];
begin
  if new.transition_case_id is null then
    return new;
  end if;

  select * into target_case
  from public.swim_transition_cases transition
  where transition.tenant_id = new.tenant_id
    and transition.id = new.transition_case_id;
  if target_case.id is null or target_case.from_stage_id = new.curriculum_stage_id then
    return new;
  end if;

  select * into previous_assignment
  from public.enrollment_stage_assignments assignment
  where assignment.tenant_id = new.tenant_id
    and assignment.enrollment_id = new.enrollment_id
    and assignment.curriculum_stage_id = target_case.from_stage_id
    and assignment.transition_case_id = target_case.id
    and assignment.status = 'completed'
  order by assignment.ends_at desc
  limit 1;
  if previous_assignment.id is null then
    raise exception 'Completed source stage assignment missing for journey snapshot';
  end if;

  select assignment.theme_key, assignment.theme_release
  into snapshot_theme_key, snapshot_theme_release
  from public.tenant_portal_theme_assignment assignment
  join public.portal_theme_release release
    on release.theme_key = assignment.theme_key
   and release.release = assignment.theme_release
   and release.status = 'published'
   and release.manifest_schema_version = 3
  where assignment.tenant_id = new.tenant_id
    and assignment.deactivated_at is null
  order by assignment.activated_at desc
  limit 1;

  snapshot_theme_key := coalesce(snapshot_theme_key, 'nxttrack-default');
  snapshot_theme_release := coalesce(snapshot_theme_release, '3.0.0');

  select asset.asset_path into snapshot_artwork_id
  from public.portal_theme_asset asset
  where asset.theme_key = snapshot_theme_key
    and asset.theme_release = snapshot_theme_release
    and asset.slot = 'progress.journey.desktop';
  if snapshot_artwork_id is null then
    raise exception 'Immutable journey artwork is missing';
  end if;

  select coalesce(jsonb_agg(identity.stable_key order by item.sort_order, item.name), '[]'::jsonb)
  into snapshot_route_order
  from public.curriculum_items item
  join public.curriculum_item_identities identity
    on identity.tenant_id = item.tenant_id
   and identity.id = item.identity_id
  where item.tenant_id = new.tenant_id
    and item.curriculum_version_id = new.curriculum_version_id
    and item.curriculum_stage_id = target_case.from_stage_id;

  select jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'itemId', item.id,
          'stableKey', identity.stable_key,
          'rating', observation.rating,
          'completedAt', case when observation.rating = 5 then observation.finalized_at else null end,
          'lastUpdatedAt', observation.finalized_at
        )
        order by item.sort_order, item.name
      ),
      '[]'::jsonb
    ),
    'carryovers',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'itemId', carryover.curriculum_item_id,
            'status', carryover.status
          )
          order by carryover.created_at, carryover.id
        )
        from public.swim_item_carryovers carryover
        where carryover.tenant_id = new.tenant_id
          and carryover.transition_case_id = target_case.id
      ),
      '[]'::jsonb
    )
  )
  into snapshot_completion_data
  from public.curriculum_items item
  join public.curriculum_item_identities identity
    on identity.tenant_id = item.tenant_id
   and identity.id = item.identity_id
  left join lateral (
    select candidate.rating, candidate.finalized_at
    from public.swim_assessment_observations candidate
    where candidate.tenant_id = new.tenant_id
      and candidate.enrollment_id = new.enrollment_id
      and candidate.curriculum_item_id = item.id
      and not exists (
        select 1
        from public.swim_assessment_retractions retraction
        where retraction.tenant_id = candidate.tenant_id
          and retraction.observation_id = candidate.id
      )
      and not exists (
        select 1
        from public.swim_assessment_observations correction
        where correction.tenant_id = candidate.tenant_id
          and correction.corrects_observation_id = candidate.id
          and not exists (
            select 1
            from public.swim_assessment_retractions correction_retraction
            where correction_retraction.tenant_id = correction.tenant_id
              and correction_retraction.observation_id = correction.id
          )
      )
    order by candidate.finalized_at desc, candidate.id
    limit 1
  ) observation on true
  where item.tenant_id = new.tenant_id
    and item.curriculum_version_id = new.curriculum_version_id
    and item.curriculum_stage_id = target_case.from_stage_id;

  select coalesce(array_agg(award.id order by award.awarded_at, award.id), '{}'::uuid[])
  into snapshot_badge_award_ids
  from public.participant_badge_awards award
  where award.tenant_id = new.tenant_id
    and award.participant_id = new.participant_id
    and award.enrollment_id = new.enrollment_id
    and award.status = 'awarded'
    and award.awarded_at >= previous_assignment.starts_at
    and award.awarded_at <= previous_assignment.ends_at;

  insert into public.portal_journey_chapter_snapshots (
    tenant_id,
    enrollment_id,
    participant_id,
    curriculum_version_id,
    curriculum_stage_id,
    transition_case_id,
    theme_key,
    theme_release,
    artwork_id,
    route_order_json,
    completion_data_json,
    badge_award_ids,
    completed_at
  ) values (
    new.tenant_id,
    new.enrollment_id,
    new.participant_id,
    new.curriculum_version_id,
    target_case.from_stage_id,
    target_case.id,
    snapshot_theme_key,
    snapshot_theme_release,
    snapshot_artwork_id,
    snapshot_route_order,
    snapshot_completion_data,
    snapshot_badge_award_ids,
    previous_assignment.ends_at
  )
  on conflict (tenant_id, enrollment_id, curriculum_version_id, curriculum_stage_id) do nothing;

  return new;
end;
$$;

create trigger enrollment_stage_assignment_capture_portal_journey_snapshot
after insert on public.enrollment_stage_assignments
for each row execute function app_private.capture_portal_journey_chapter_snapshot();

revoke all on function app_private.capture_portal_journey_chapter_snapshot()
  from public, anon, authenticated;

create function app_private.prevent_published_theme_release_mutation()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $$
begin
  if old.status = 'published' then
    raise exception 'Published portal theme releases are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger prevent_published_theme_release_mutation
before update or delete on public.portal_theme_release
for each row execute function app_private.prevent_published_theme_release_mutation();

create function app_private.prevent_published_theme_asset_mutation()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $$
begin
  if exists (
    select 1
    from public.portal_theme_release release
    where release.theme_key = old.theme_key
      and release.release = old.theme_release
      and release.status = 'published'
  ) then
    raise exception 'Assets of published portal theme releases are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger prevent_published_theme_asset_mutation
before update or delete on public.portal_theme_asset
for each row execute function app_private.prevent_published_theme_asset_mutation();

revoke all on function app_private.prevent_published_theme_release_mutation() from public, anon, authenticated;
revoke all on function app_private.prevent_published_theme_asset_mutation() from public, anon, authenticated;
revoke all on function app_private.validate_active_portal_theme_assignment() from public, anon, authenticated;

comment on table public.tenant_portal_theme_license is
  'Platform-verified evidence gate for protected theme display names. Unverified tenants must use the public fallback name.';

comment on table public.portal_journey_chapter_snapshots is
  'Append-only historical chapter view: immutable theme/artwork, curriculum order, completion state and badge instance links captured transactionally on approved stage transition.';
