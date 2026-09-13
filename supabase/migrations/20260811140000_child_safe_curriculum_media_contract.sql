-- Child-safe instructional media is authored inside an immutable curriculum
-- release. Draft metadata may be incomplete, but an approved projection must
-- always carry a title, video URL, WebVTT URL and readable transcript.

alter table public.participant_media
  drop constraint participant_media_type_check,
  drop constraint participant_media_mime_check;

alter table public.participant_media
  add constraint participant_media_type_check
    check (media_type in ('image', 'video')),
  add constraint participant_media_mime_check
    check (
      (media_type = 'image' and mime_type in ('image/jpeg', 'image/png'))
      or (media_type = 'video' and mime_type = 'video/mp4')
    );

comment on constraint participant_media_mime_check on public.participant_media is
  'Child-safe moments accept privacy-reviewed image renditions and manually confirmed low/web MP4 renditions only.';

alter table public.curriculum_items
  add constraint curriculum_items_child_instruction_video_check
  check (
    not (context_json ? 'childInstructionVideo')
    or context_json -> 'childInstructionVideo' = 'null'::jsonb
    or (
      jsonb_typeof(context_json -> 'childInstructionVideo') = 'object'
      and context_json #>> '{childInstructionVideo,status}' in ('draft', 'approved')
      and coalesce(length(context_json #>> '{childInstructionVideo,title}'), 0) <= 160
      and coalesce(length(context_json #>> '{childInstructionVideo,url}'), 0) <= 2000
      and coalesce(length(context_json #>> '{childInstructionVideo,captionsUrl}'), 0) <= 2000
      and coalesce(length(context_json #>> '{childInstructionVideo,transcript}'), 0) <= 8000
      and (
        context_json #>> '{childInstructionVideo,status}' <> 'approved'
        or (
          length(trim(context_json #>> '{childInstructionVideo,title}')) between 1 and 160
          and length(trim(context_json #>> '{childInstructionVideo,transcript}')) between 1 and 8000
          and context_json #>> '{childInstructionVideo,url}' ~ '^(https://[^[:space:]]+|/[A-Za-z0-9/_.,?=&%-]+)$'
          and context_json #>> '{childInstructionVideo,captionsUrl}' ~ '^(https://[^[:space:]]+|/[A-Za-z0-9/_.,?=&%-]+)$'
        )
      )
    )
  ) not valid;

alter table public.curriculum_items
  validate constraint curriculum_items_child_instruction_video_check;

comment on constraint curriculum_items_child_instruction_video_check on public.curriculum_items is
  'Approved child instructional media is version-bound and requires captions plus transcript; draft values are never projected.';

create or replace function app_private.configure_child_portal_rollout_for_service(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_status text,
  p_absolute_ttl_minutes integer,
  p_security_reviewed boolean,
  p_visual_matrix_reviewed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_status boolean := p_status in ('pilot', 'enabled');
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('child-portal-rollout:' || p_tenant_id::text, 0));

  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = p_tenant_id
      and membership.user_id = p_actor_user_id
      and membership.status = 'active'
      and membership.role in ('tenant_owner', 'tenant_admin')
  ) then
    raise exception 'child_portal_rollout_permission_required' using errcode = '42501';
  end if;
  if p_status not in ('disabled', 'paused', 'pilot', 'enabled') then
    raise exception 'invalid_child_portal_rollout_status' using errcode = '22023';
  end if;
  if p_absolute_ttl_minutes < 15 or p_absolute_ttl_minutes > 720 then
    raise exception 'invalid_child_portal_absolute_ttl' using errcode = '22023';
  end if;
  if active_status and (not p_security_reviewed or not p_visual_matrix_reviewed) then
    raise exception 'child_portal_readiness_incomplete' using errcode = '23514';
  end if;

  insert into public.tenant_swim_rollouts (
    tenant_id, feature_key, status, readiness_json, config_json,
    activated_at, activated_by_user_id
  )
  select
    p_tenant_id,
    feature_key,
    case when feature_key = 'swim.portal.direct_child_login' then 'disabled' else p_status end,
    jsonb_build_object(
      'security_reviewed', p_security_reviewed,
      'visual_matrix_reviewed', p_visual_matrix_reviewed
    ),
    case
      when feature_key = 'swim.portal.child_mode'
        then jsonb_build_object('absoluteTtlMinutes', p_absolute_ttl_minutes)
      else '{}'::jsonb
    end,
    case when active_status and feature_key <> 'swim.portal.direct_child_login' then now() else null end,
    p_actor_user_id
  from unnest(array[
    'swim.portal.parent_child_split',
    'swim.portal.child_mode',
    'swim.portal.parent_requests',
    'swim.portal.direct_child_login'
  ]::text[]) as feature(feature_key)
  on conflict (tenant_id, feature_key) do update set
    status = excluded.status,
    readiness_json = excluded.readiness_json,
    config_json = excluded.config_json,
    activated_at = excluded.activated_at,
    activated_by_user_id = excluded.activated_by_user_id,
    updated_at = now();

  if not active_status then
    insert into app_private.portal_session_audit_events (
      session_id, auth_user_id, tenant_id, participant_id, event_type, metadata_json
    )
    select
      context.session_id, context.auth_user_id, context.tenant_id,
      context.participant_id, 'child_context_revoked',
      jsonb_build_object('reason', 'rollout_kill_switch', 'status', p_status)
    from app_private.portal_session_contexts context
    where context.tenant_id = p_tenant_id
      and context.locked_at is null
      and context.revoked_at is null;

    update app_private.portal_session_contexts context
    set locked_at = now(), lock_reason = 'rollout_kill_switch'
    where context.tenant_id = p_tenant_id
      and context.locked_at is null
      and context.revoked_at is null;
  end if;

  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type,
    subject_id, reason, after_json
  ) values (
    p_tenant_id, p_actor_user_id, 'curriculum.publish',
    'child_portal_rollout_configured', 'tenant', p_tenant_id,
    'Tenant owner/admin configured the session-bound child portal rollout.',
    jsonb_build_object(
      'status', p_status,
      'absoluteTtlMinutes', p_absolute_ttl_minutes,
      'securityReviewed', p_security_reviewed,
      'visualMatrixReviewed', p_visual_matrix_reviewed,
      'directChildLogin', false
    )
  );

  return jsonb_build_object(
    'status', p_status,
    'absoluteTtlMinutes', p_absolute_ttl_minutes,
    'directChildLogin', false
  );
end;
$$;

create or replace function public.configure_child_portal_rollout_for_service(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_status text,
  p_absolute_ttl_minutes integer,
  p_security_reviewed boolean,
  p_visual_matrix_reviewed boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.configure_child_portal_rollout_for_service(
    p_tenant_id,
    p_actor_user_id,
    p_status,
    p_absolute_ttl_minutes,
    p_security_reviewed,
    p_visual_matrix_reviewed
  );
$$;

revoke all on function app_private.configure_child_portal_rollout_for_service(uuid, uuid, text, integer, boolean, boolean) from public, anon, authenticated;
revoke all on function public.configure_child_portal_rollout_for_service(uuid, uuid, text, integer, boolean, boolean) from public, anon, authenticated;
grant execute on function app_private.configure_child_portal_rollout_for_service(uuid, uuid, text, integer, boolean, boolean) to service_role;
grant execute on function public.configure_child_portal_rollout_for_service(uuid, uuid, text, integer, boolean, boolean) to service_role;
