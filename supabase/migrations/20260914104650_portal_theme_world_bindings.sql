-- Explicit opt-in. Existing tenants retain their canonical selection policy.
alter table public.tenant_settings add column portal_theme_management_mode text not null default 'legacy'
  check (portal_theme_management_mode in ('legacy', 'platform'));
create function app_private.protect_portal_theme_management_mode()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') and (
    (tg_op = 'INSERT' and new.portal_theme_management_mode <> 'legacy') or
    (tg_op = 'UPDATE' and new.portal_theme_management_mode is distinct from old.portal_theme_management_mode)
  ) then raise exception 'platform_theme_management_required' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger protect_portal_theme_management_mode before insert or update on public.tenant_settings
  for each row execute function app_private.protect_portal_theme_management_mode();
revoke all on function app_private.protect_portal_theme_management_mode() from public, anon, authenticated;

-- A visual binding references real curriculum identities; it never creates or renames them.
create table public.portal_theme_world_binding (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  program_id uuid not null,
  curriculum_version_id uuid not null,
  curriculum_stage_id uuid not null,
  theme_key text not null,
  theme_release text not null,
  world_id text not null,
  criterion_artwork_json jsonb not null default '{}'::jsonb check (jsonb_typeof(criterion_artwork_json) = 'object'),
  previous_binding_id uuid references public.portal_theme_world_binding(id) on delete restrict,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 3 and 1000),
  created_at timestamptz not null default now(),
  deactivated_at timestamptz,
  foreign key (tenant_id, program_id) references public.programs(tenant_id, id) on delete restrict,
  foreign key (tenant_id, curriculum_version_id) references public.curriculum_versions(tenant_id, id) on delete restrict,
  foreign key (tenant_id, curriculum_stage_id) references public.curriculum_stages(tenant_id, id) on delete restrict,
  foreign key (theme_key, theme_release) references public.portal_theme_release(theme_key, release) on delete restrict
);
create unique index portal_theme_world_binding_current_idx on public.portal_theme_world_binding(tenant_id, program_id, curriculum_version_id, curriculum_stage_id) where deactivated_at is null;
create index portal_theme_world_binding_version_idx on public.portal_theme_world_binding(tenant_id, curriculum_version_id);
create index portal_theme_world_binding_stage_idx on public.portal_theme_world_binding(tenant_id, curriculum_stage_id);
create index portal_theme_world_binding_release_idx on public.portal_theme_world_binding(theme_key, theme_release);
create index portal_theme_world_binding_previous_idx on public.portal_theme_world_binding(previous_binding_id);
create index portal_theme_world_binding_actor_idx on public.portal_theme_world_binding(created_by_user_id);
alter table public.portal_theme_world_binding enable row level security;
alter table public.portal_theme_world_binding force row level security;
revoke all on public.portal_theme_world_binding from public, anon, authenticated;
grant select on public.portal_theme_world_binding to authenticated;
grant select, insert, update on public.portal_theme_world_binding to service_role;
create policy portal_theme_world_binding_manager_read on public.portal_theme_world_binding for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));
create policy portal_child_session_restrictive on public.portal_theme_world_binding as restrictive for all to authenticated
  using (not app_private.is_portal_session_restricted()) with check (not app_private.is_portal_session_restricted());

create function public.set_portal_theme_management_mode(p_actor uuid, p_tenant uuid, p_mode text, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_old text;
begin
  perform app_private.require_portal_theme_manager(p_actor);
  if p_mode is null or p_mode not in ('legacy', 'platform') or length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'invalid_management_change' using errcode = '22023';
  end if;
  perform 1 from public.tenants t where t.id = p_tenant for update;
  if not found then raise exception 'unknown_tenant' using errcode = '22023'; end if;
  insert into public.tenant_settings(tenant_id) values(p_tenant) on conflict (tenant_id) do nothing;
  select s.portal_theme_management_mode into v_old from public.tenant_settings s where s.tenant_id = p_tenant;
  if v_old = p_mode then return; end if;
  -- Never leave active bindings which appear editable through a legacy theme picker.
  if p_mode = 'legacy' and exists (select 1 from public.portal_theme_world_binding b where b.tenant_id = p_tenant and b.deactivated_at is null) then
    raise exception 'remove_world_bindings_before_legacy_mode' using errcode = '22023';
  end if;
  update public.tenant_settings s set portal_theme_management_mode = p_mode where s.tenant_id = p_tenant;
  insert into public.portal_theme_audit_event(tenant_id, actor_user_id, event_type, reason, request_correlation_id, metadata_json)
    values(p_tenant, p_actor, 'management_changed', trim(p_reason), gen_random_uuid()::text,
      jsonb_build_object('previousMode', v_old, 'nextMode', p_mode));
end;
$$;

create function public.bind_portal_theme_world(
  p_actor uuid, p_tenant uuid, p_program uuid, p_version uuid, p_stage uuid,
  p_theme text, p_release text, p_world text, p_artwork jsonb, p_expected_binding uuid, p_reason text,
  p_rollback_binding uuid default null
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_current public.portal_theme_world_binding%rowtype;
  v_restore public.portal_theme_world_binding%rowtype;
  v_presentation jsonb;
  v_id uuid;
begin
  perform app_private.require_portal_theme_manager(p_actor);
  if length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then raise exception 'reason_required' using errcode = '22023'; end if;
  -- Same lock as default activation, management mode and tenant selection.
  perform 1 from public.tenants t where t.id = p_tenant for update;
  if not exists (select 1 from public.tenant_settings s where s.tenant_id = p_tenant and s.portal_theme_management_mode = 'platform') then
    raise exception 'platform_managed_target_required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.curriculum_versions v join public.curriculum_stages s
      on s.tenant_id = v.tenant_id and s.curriculum_version_id = v.id
    where v.tenant_id = p_tenant and v.id = p_version and v.program_id = p_program and s.id = p_stage
  ) then raise exception 'curriculum_binding_mismatch' using errcode = '22023'; end if;
  select * into v_current from public.portal_theme_world_binding b
    where b.tenant_id = p_tenant and b.program_id = p_program and b.curriculum_version_id = p_version
      and b.curriculum_stage_id = p_stage and b.deactivated_at is null for update;
  if v_current.id is distinct from p_expected_binding then raise exception 'binding_revision_conflict' using errcode = '40001'; end if;
  if p_rollback_binding is not null then
    select * into v_restore from public.portal_theme_world_binding b where b.id = p_rollback_binding
      and b.tenant_id = p_tenant and b.program_id = p_program and b.curriculum_version_id = p_version and b.curriculum_stage_id = p_stage;
    if v_restore.id is null or v_current.id is null or v_current.previous_binding_id is distinct from v_restore.id then
      raise exception 'invalid_binding_rollback' using errcode = '22023';
    end if;
    -- Restore the complete published presentation and its mapping as one unit.
    p_theme := v_restore.theme_key; p_release := v_restore.theme_release;
    p_world := v_restore.world_id; p_artwork := v_restore.criterion_artwork_json;
  end if;
  select r.presentation_json into v_presentation from public.portal_theme_release r
    where r.theme_key = p_theme and r.release = p_release and r.status = 'published' and r.manifest_schema_version = 3;
  if v_presentation is null or not coalesce((v_presentation->'worlds') ? p_world, false) then
    raise exception 'published_world_required' using errcode = '22023';
  end if;
  if p_artwork is null or jsonb_typeof(p_artwork) <> 'object' or octet_length(p_artwork::text) > 65536 then
    raise exception 'invalid_criterion_artwork' using errcode = '22023';
  end if;
  if (v_presentation->>'role' = 'standard' or v_presentation#>>'{pearlArtwork,mode}' = 'none') and p_artwork <> '{}'::jsonb then
    raise exception 'neutral_pearl_policy' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_each(p_artwork) entry where jsonb_typeof(entry.value) <> 'string'
      or not coalesce((v_presentation->'assets') ? (entry.value #>> '{}'), false)
      or not exists (select 1 from public.curriculum_items item join public.curriculum_item_identities identity
        on identity.tenant_id = item.tenant_id and identity.id = item.identity_id
        where item.tenant_id = p_tenant and item.curriculum_version_id = p_version and item.curriculum_stage_id = p_stage and identity.stable_key = entry.key)
  ) then raise exception 'criterion_identity_mismatch' using errcode = '22023'; end if;
  update public.portal_theme_world_binding b set deactivated_at = now() where b.id = v_current.id;
  insert into public.portal_theme_world_binding(tenant_id, program_id, curriculum_version_id, curriculum_stage_id,
    theme_key, theme_release, world_id, criterion_artwork_json, previous_binding_id, created_by_user_id, reason)
  values(p_tenant, p_program, p_version, p_stage, p_theme, p_release, p_world, p_artwork, v_current.id, p_actor, trim(p_reason)) returning id into v_id;
  insert into public.portal_theme_audit_event(tenant_id, actor_user_id, event_type, previous_theme_key, previous_theme_release,
    next_theme_key, next_theme_release, reason, request_correlation_id, metadata_json)
  values(p_tenant, p_actor, case when p_rollback_binding is null then 'world_bound' else 'world_rolled_back' end,
    v_current.theme_key, v_current.theme_release, p_theme, p_release, trim(p_reason), gen_random_uuid()::text,
    jsonb_build_object('bindingId', v_id, 'previousBindingId', v_current.id, 'programId', p_program, 'curriculumVersionId', p_version, 'stageId', p_stage, 'worldId', p_world));
  return v_id;
end;
$$;

create function public.remove_portal_theme_world_binding(p_actor uuid, p_binding uuid, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_binding public.portal_theme_world_binding%rowtype;
begin
  perform app_private.require_portal_theme_manager(p_actor);
  if length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_binding from public.portal_theme_world_binding b where b.id = p_binding;
  if v_binding.id is null then raise exception 'unknown_binding' using errcode = '22023'; end if;
  perform 1 from public.tenants t where t.id = v_binding.tenant_id for update;
  update public.portal_theme_world_binding b set deactivated_at = now() where b.id = p_binding and b.deactivated_at is null;
  if not found then raise exception 'binding_revision_conflict' using errcode = '40001'; end if;
  insert into public.portal_theme_audit_event(tenant_id, actor_user_id, event_type, previous_theme_key, previous_theme_release, reason, request_correlation_id, metadata_json)
  values(v_binding.tenant_id, p_actor, 'world_bound', v_binding.theme_key, v_binding.theme_release, trim(p_reason), gen_random_uuid()::text,
    jsonb_build_object('bindingId', p_binding, 'removed', true));
end;
$$;

create function app_private.protect_portal_theme_world_binding_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'binding_history_immutable' using errcode = '55000'; end if;
  if old.deactivated_at is not null or new.deactivated_at is null or
    (to_jsonb(old) - 'deactivated_at') is distinct from (to_jsonb(new) - 'deactivated_at') then
    raise exception 'binding_history_immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger protect_portal_theme_world_binding_history before update or delete on public.portal_theme_world_binding
  for each row execute function app_private.protect_portal_theme_world_binding_history();

revoke all on function public.set_portal_theme_management_mode(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.bind_portal_theme_world(uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.remove_portal_theme_world_binding(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.protect_portal_theme_world_binding_history() from public, anon, authenticated;
grant execute on function public.set_portal_theme_management_mode(uuid, uuid, text, text) to service_role;
grant execute on function public.bind_portal_theme_world(uuid, uuid, uuid, uuid, uuid, text, text, text, jsonb, uuid, text, uuid) to service_role;
grant execute on function public.remove_portal_theme_world_binding(uuid, uuid, text) to service_role;

-- Existing immutable chapter records keep their exact contents. New chapters pin their visual unit.
alter table public.portal_journey_chapter_snapshots
  add column world_binding_id uuid references public.portal_theme_world_binding(id) on delete restrict,
  add column presentation_snapshot_json jsonb;
create index portal_journey_chapter_binding_idx on public.portal_journey_chapter_snapshots(world_binding_id);
create function app_private.capture_portal_journey_world_binding()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_binding public.portal_theme_world_binding%rowtype; v_presentation jsonb; v_asset text;
begin
  perform 1 from public.tenants t where t.id = new.tenant_id for update;
  select b.* into v_binding from public.portal_theme_world_binding b
    where b.tenant_id = new.tenant_id and b.curriculum_version_id = new.curriculum_version_id
      and b.curriculum_stage_id = new.curriculum_stage_id and b.deactivated_at is null;
  if v_binding.id is null then return new; end if;
  select r.presentation_json into v_presentation from public.portal_theme_release r
    where r.theme_key = v_binding.theme_key and r.release = v_binding.theme_release and r.status = 'published';
  v_asset := v_presentation#>>array['worlds', v_binding.world_id, 'landscape', 'layers', 'back'];
  new.theme_key := v_binding.theme_key; new.theme_release := v_binding.theme_release;
  new.artwork_id := '/portal-themes/' || (v_presentation#>>array['assets', v_asset, 'objectKey']);
  new.world_binding_id := v_binding.id;
  new.presentation_snapshot_json := jsonb_build_object('worldId', v_binding.world_id, 'presentation', v_presentation,
    'criterionArtwork', v_binding.criterion_artwork_json);
  return new;
end;
$$;
create trigger capture_portal_journey_world_binding before insert on public.portal_journey_chapter_snapshots
  for each row execute function app_private.capture_portal_journey_world_binding();
revoke all on function app_private.capture_portal_journey_world_binding() from public, anon, authenticated;

-- Forward replacements retain original signatures, grants, capability checks and transactional semantics.
create or replace function app_private.select_available_tenant_portal_theme(
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
  if exists (select 1 from public.tenant_settings settings
    where settings.tenant_id = target_tenant_id and settings.portal_theme_management_mode = 'platform') then
    raise exception 'theme_is_platform_managed' using errcode = '42501';
  end if;
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

create or replace function app_private.save_child_portal_preferences_for_service(
  p_session_id uuid,
  p_user_id uuid,
  p_tenant_id uuid,
  p_participant_id uuid,
  p_reduced_motion boolean,
  p_celebrations_enabled boolean,
  p_sound_enabled boolean,
  p_read_aloud_enabled boolean,
  p_theme_key text,
  p_theme_release text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text, 0));

  if not exists (
    select 1 from app_private.portal_session_contexts context
    where context.session_id = p_session_id
      and context.auth_user_id = p_user_id
      and context.tenant_id = p_tenant_id
      and context.participant_id = p_participant_id
      and context.locked_at is null
      and context.revoked_at is null
      and context.expires_at > now()
      and 'child_preferences.write_safe' = any(context.capabilities)
  ) then
    raise exception 'child_preference_capability_required' using errcode = '42501';
  end if;

  perform 1 from public.tenants tenant where tenant.id = p_tenant_id for update;
  if p_theme_key is not null and exists (select 1 from public.tenant_settings settings
    where settings.tenant_id = p_tenant_id and settings.portal_theme_management_mode = 'platform') then
    raise exception 'theme_is_platform_managed' using errcode = '42501';
  end if;

  if (p_theme_key is null) <> (p_theme_release is null) or (
    p_theme_key is not null and not exists (
      select 1
      from public.tenant_portal_theme_availability availability
      join public.portal_theme_release release
        on release.theme_key = availability.theme_key
       and release.release = availability.theme_release
      where availability.tenant_id = p_tenant_id
        and availability.theme_key = p_theme_key
        and availability.theme_release = p_theme_release
        and availability.is_enabled
        and release.status = 'published'
    )
  ) then
    raise exception 'child_theme_not_available' using errcode = '22023';
  end if;

  insert into public.portal_child_preferences (
    tenant_id, participant_id, reduced_motion, celebrations_enabled,
    sound_enabled, read_aloud_enabled, theme_key, theme_release,
    updated_by_user_id
  ) values (
    p_tenant_id, p_participant_id, p_reduced_motion, p_celebrations_enabled,
    p_sound_enabled, p_read_aloud_enabled, p_theme_key, p_theme_release,
    p_user_id
  ) on conflict (tenant_id, participant_id) do update set
    reduced_motion = excluded.reduced_motion,
    celebrations_enabled = excluded.celebrations_enabled,
    sound_enabled = excluded.sound_enabled,
    read_aloud_enabled = excluded.read_aloud_enabled,
    theme_key = excluded.theme_key,
    theme_release = excluded.theme_release,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now();

  insert into app_private.portal_session_audit_events (
    session_id, auth_user_id, tenant_id, participant_id, event_type,
    metadata_json
  ) values (
    p_session_id, p_user_id, p_tenant_id, p_participant_id,
    'child_preference_changed',
    jsonb_build_object(
      'reducedMotion', p_reduced_motion,
      'celebrationsEnabled', p_celebrations_enabled,
      'soundEnabled', p_sound_enabled,
      'readAloudEnabled', p_read_aloud_enabled,
      'themeKey', p_theme_key,
      'themeRelease', p_theme_release
    )
  );
end;
$$;

create or replace function app_private.capture_portal_journey_chapter_snapshot()
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

  -- Native artwork remains the compatibility fallback for an unbound stage.
  -- The BEFORE INSERT trigger replaces the complete unit when an explicit rich binding exists.
  if exists (select 1 from public.portal_theme_release r where r.theme_key = snapshot_theme_key
    and r.release = snapshot_theme_release and r.presentation_json is not null) then
    snapshot_theme_key := 'nxttrack-default'; snapshot_theme_release := '3.0.0';
  end if;

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
