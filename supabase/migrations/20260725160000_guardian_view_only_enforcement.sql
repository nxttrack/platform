-- A view_only guardian may read participant data but must not create or
-- change operational, attendance, consent, placement or payment state.

create or replace function app_private.current_user_can_mutate_participant(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.participants participant
    where participant.id = target_participant_id
      and (
        participant.guardian_user_id = (select auth.uid())
        or exists (
          select 1
          from public.participant_guardians guardian
          where guardian.tenant_id = participant.tenant_id
            and guardian.participant_id = participant.id
            and guardian.guardian_user_id = (select auth.uid())
            and guardian.status = 'active'
            and guardian.access_level in ('primary', 'secondary')
        )
        or app_private.current_user_can_manage_tenant_domain(participant.tenant_id)
        or app_private.current_user_can_instruct_participant(participant.id)
      )
  );
$$;

revoke all on function app_private.current_user_can_mutate_participant(uuid) from public;
grant execute on function app_private.current_user_can_mutate_participant(uuid) to authenticated;
grant execute on function app_private.current_user_can_mutate_participant(uuid) to service_role;

drop policy if exists "Guardians can create own lesson cancellations" on public.lesson_cancellations;
create policy "Guardians can create own lesson cancellations"
  on public.lesson_cancellations
  for insert
  to authenticated
  with check (
    parent_user_id = (select auth.uid())
    and app_private.current_user_has_tenant_role(tenant_id, array['parent'])
    and app_private.current_user_can_mutate_participant(participant_id)
  );

drop policy if exists "Guardians can create catch-up requests" on public.catch_up_requests;
create policy "Guardians can create catch-up requests"
  on public.catch_up_requests
  for insert
  to authenticated
  with check (
    requested_by_user_id = (select auth.uid())
    and app_private.current_user_has_tenant_role(tenant_id, array['parent'])
    and (
      status = 'requested'
      or (
        status = 'approved'
        and preferred_session_id = assigned_session_id
        and decided_at is not null
        and decided_by_user_id = (select auth.uid())
      )
    )
    and app_private.current_user_can_mutate_participant(participant_id)
  );

drop policy if exists "Guardians can cancel own catch-up requests" on public.catch_up_requests;
create policy "Guardians can cancel own catch-up requests"
  on public.catch_up_requests
  for update
  to authenticated
  using (
    requested_by_user_id = (select auth.uid())
    and app_private.current_user_has_tenant_role(tenant_id, array['parent'])
    and status = 'requested'
    and app_private.current_user_can_mutate_participant(participant_id)
  )
  with check (
    requested_by_user_id = (select auth.uid())
    and app_private.current_user_has_tenant_role(tenant_id, array['parent'])
    and status = 'cancelled'
    and app_private.current_user_can_mutate_participant(participant_id)
  );

drop policy if exists "Guardians manage own media consent" on public.media_consents;
create policy "Guardians manage own media consent"
  on public.media_consents
  for all
  to authenticated
  using (
    guardian_user_id = (select auth.uid())
    and app_private.current_user_has_tenant_role(tenant_id, array['parent'])
    and app_private.current_user_can_mutate_participant(participant_id)
  )
  with check (
    guardian_user_id = (select auth.uid())
    and app_private.current_user_has_tenant_role(tenant_id, array['parent'])
    and app_private.current_user_can_mutate_participant(participant_id)
  );
