-- Authenticated command boundary for canonical assessment clients.
-- Service-role callers deliberately do not receive an actor-impersonation shortcut.

create or replace function public.finalize_swim_assessment(
  target_tenant_id uuid,
  target_participant_id uuid,
  target_enrollment_id uuid,
  target_curriculum_item_id uuid,
  target_rating integer,
  target_note text,
  target_visibility text,
  target_context_json jsonb,
  target_observed_at timestamptz,
  target_session_id uuid,
  target_corrects_observation_id uuid,
  target_correction_reason text,
  target_source text,
  target_client_operation_id text,
  target_device_id text,
  target_idempotency_key text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null then
    raise exception 'Authenticated actor required';
  end if;

  return app_private.finalize_swim_assessment(
    target_tenant_id,
    target_participant_id,
    target_enrollment_id,
    target_curriculum_item_id,
    target_rating,
    target_note,
    target_visibility,
    coalesce(target_context_json, '{}'::jsonb),
    target_observed_at,
    target_session_id,
    target_corrects_observation_id,
    target_correction_reason,
    target_source,
    target_client_operation_id,
    target_device_id,
    actor_user_id,
    target_idempotency_key
  );
end;
$$;

revoke all on function public.finalize_swim_assessment(
  uuid, uuid, uuid, uuid, integer, text, text, jsonb, timestamptz, uuid, uuid, text, text, text, text, text
) from public, anon;
grant execute on function public.finalize_swim_assessment(
  uuid, uuid, uuid, uuid, integer, text, text, jsonb, timestamptz, uuid, uuid, text, text, text, text, text
) to authenticated;

create or replace function public.retract_swim_assessment(
  target_observation_id uuid,
  target_reason text,
  target_idempotency_key text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor_user_id uuid := (select auth.uid());
begin
  if actor_user_id is null then
    raise exception 'Authenticated actor required';
  end if;

  return app_private.retract_swim_assessment(
    target_observation_id,
    target_reason,
    actor_user_id,
    target_idempotency_key
  );
end;
$$;

revoke all on function public.retract_swim_assessment(uuid, text, text) from public, anon;
grant execute on function public.retract_swim_assessment(uuid, text, text) to authenticated;

comment on function public.finalize_swim_assessment(
  uuid, uuid, uuid, uuid, integer, text, text, jsonb, timestamptz, uuid, uuid, text, text, text, text, text
) is
  'Authenticated append-only assessment command used by web and native clients. Actor identity is always taken from auth.uid().';
