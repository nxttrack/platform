-- Reuse the canonical private draft table and final assessment command.
-- These review columns do not publish any observation or notification.
alter table public.swim_assessment_drafts
  add column review_owned boolean not null default false,
  add column review_base_observation_id uuid,
  add column review_correction_reason text,
  add column review_session_id uuid,
  add constraint swim_draft_review_base_fk foreign key(tenant_id,review_base_observation_id)
    references public.swim_assessment_observations(tenant_id,id) on delete restrict,
  add constraint swim_draft_review_session_fk foreign key(tenant_id,review_session_id)
    references public.sessions(tenant_id,id) on delete restrict,
  add constraint swim_draft_review_reason_bound check(length(review_correction_reason) <= 2000);

create function app_private.require_instructor_assessment_context(p_tenant uuid,p_participant uuid,p_enrollment uuid,p_item uuid,p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or app_private.is_portal_session_restricted()
    or not coalesce(app_private.current_user_has_swim_permission(p_tenant,'assessment.record'),false)
    or not (coalesce(app_private.current_user_can_manage_tenant_domain(p_tenant),false) or coalesce(app_private.current_user_can_instruct_participant(p_participant),false))
  then raise exception 'assessment_review_access_denied'; end if;
  if not exists(select 1 from public.enrollments e
    join public.curriculum_versions version on version.tenant_id = e.tenant_id and version.id = e.curriculum_version_id and version.status = 'published'
    join public.curriculum_items i
    on i.tenant_id = e.tenant_id and i.curriculum_version_id = e.curriculum_version_id
    where e.tenant_id = p_tenant and e.id = p_enrollment and e.participant_id = p_participant and i.id = p_item)
  then raise exception 'assessment_review_context_changed'; end if;
  if p_session is not null and not exists(
    select 1 from public.sessions s join public.group_memberships m on m.tenant_id = s.tenant_id and m.group_id = s.group_id
    left join public.tenant_settings settings on settings.tenant_id = s.tenant_id
    where s.tenant_id = p_tenant and s.id = p_session and m.enrollment_id = p_enrollment and m.participant_id = p_participant
      and m.status in ('active','trial') and m.starts_on <= (s.starts_at at time zone coalesce(settings.timezone,'Europe/Amsterdam'))::date
      and (m.ends_on is null or m.ends_on >= (s.starts_at at time zone coalesce(settings.timezone,'Europe/Amsterdam'))::date)
      and (app_private.current_user_can_manage_tenant_domain(p_tenant) or exists(
        select 1 from public.group_instructor_assignments a where a.tenant_id = p_tenant and a.group_id = s.group_id
          and a.instructor_user_id = (select auth.uid()) and a.status = 'active'))
  ) then raise exception 'assessment_review_session_denied'; end if;
end;
$$;
revoke all on function app_private.require_instructor_assessment_context(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;

create function app_private.latest_reviewed_assessment_id(p_tenant uuid,p_enrollment uuid,p_item uuid)
returns uuid language sql stable security invoker set search_path = '' as $$
  select o.id from public.swim_assessment_observations o
  where o.tenant_id = p_tenant and o.enrollment_id = p_enrollment and o.curriculum_item_id = p_item
    and not exists(select 1 from public.swim_assessment_retractions r where r.tenant_id = o.tenant_id and r.observation_id = o.id)
    and not exists(select 1 from public.swim_assessment_observations c where c.tenant_id = o.tenant_id and c.corrects_observation_id = o.id
      and not exists(select 1 from public.swim_assessment_retractions r where r.tenant_id = c.tenant_id and r.observation_id = c.id))
  order by o.observed_at desc,o.finalized_at desc,o.id desc limit 1;
$$;
revoke all on function app_private.latest_reviewed_assessment_id(uuid,uuid,uuid) from public,anon,authenticated;

create function app_private.read_instructor_assessment_draft(p_tenant uuid,p_participant uuid,p_enrollment uuid,p_item uuid,p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_draft public.swim_assessment_drafts%rowtype; v_item public.curriculum_items%rowtype; v_current jsonb; v_compliment jsonb;
begin
  perform app_private.require_instructor_assessment_context(p_tenant,p_participant,p_enrollment,p_item,p_session);
  select * into v_draft from public.swim_assessment_drafts d where d.tenant_id = p_tenant and d.enrollment_id = p_enrollment
    and d.curriculum_item_id = p_item and d.saved_by_user_id = (select auth.uid()) and d.expires_at > now();
  if v_draft.id is not null and not v_draft.review_owned then raise exception 'assessment_draft_other_client'; end if;
  if v_draft.id is not null then perform app_private.require_instructor_assessment_context(p_tenant,p_participant,p_enrollment,p_item,v_draft.review_session_id); end if;
  select * into v_item from public.curriculum_items i where i.tenant_id = p_tenant and i.id = p_item;
  select jsonb_build_object('id',o.id,'rating',o.rating,'visibility',o.visibility,'observedAt',o.observed_at,'finalizedAt',o.finalized_at)
    into v_current from public.swim_assessment_observations o where o.id = app_private.latest_reviewed_assessment_id(p_tenant,p_enrollment,p_item);
  select jsonb_build_object('id',c.id,'message',c.message,'publishedAt',c.published_at) into v_compliment from public.swim_child_compliments c where c.tenant_id = p_tenant and c.observation_id = (v_current->>'id')::uuid;
  return jsonb_build_object('draft',case when v_draft.id is null then null else to_jsonb(v_draft) end,'current',v_current,'compliment',v_compliment,
    'item',jsonb_build_object('id',v_item.id,'name',v_item.name,'description',v_item.description,'masteryThreshold',v_item.mastery_threshold,'versionId',v_item.curriculum_version_id));
end;
$$;
revoke all on function app_private.read_instructor_assessment_draft(uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function app_private.read_instructor_assessment_draft(uuid,uuid,uuid,uuid,uuid) to authenticated,service_role;

create function app_private.save_instructor_assessment_draft(p_tenant uuid,p_participant uuid,p_enrollment uuid,p_item uuid,p_session uuid,
  p_rating integer,p_visibility text,p_base_observation uuid,p_reason text,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_draft public.swim_assessment_drafts%rowtype; v_version uuid;
begin
  perform app_private.require_instructor_assessment_context(p_tenant,p_participant,p_enrollment,p_item,p_session);
  if p_rating is null or p_rating not between 1 and 5 or p_visibility is null or p_visibility not in ('internal','parent_visible')
    or length(coalesce(p_reason,'')) > 2000 or p_expected_revision is null or p_expected_revision < 0
  then raise exception 'assessment_review_input_invalid'; end if;
  -- All draft edits and finalize commands take the canonical enrollment lock first.
  select e.curriculum_version_id into v_version from public.enrollments e where e.tenant_id = p_tenant and e.id = p_enrollment for update;
  perform app_private.require_instructor_assessment_context(p_tenant,p_participant,p_enrollment,p_item,p_session);
  if p_base_observation is not null and not exists(select 1 from public.swim_assessment_observations o where o.tenant_id = p_tenant
    and o.id = p_base_observation and o.enrollment_id = p_enrollment and o.participant_id = p_participant and o.curriculum_item_id = p_item)
  then raise exception 'assessment_review_base_invalid'; end if;
  delete from public.swim_assessment_drafts d where d.tenant_id = p_tenant and d.saved_by_user_id = (select auth.uid()) and d.expires_at <= now();
  select * into v_draft from public.swim_assessment_drafts d where d.tenant_id = p_tenant and d.enrollment_id = p_enrollment
    and d.curriculum_item_id = p_item and d.saved_by_user_id = (select auth.uid()) for update;
  if v_draft.id is not null and not v_draft.review_owned then raise exception 'assessment_draft_other_client'; end if;
  if coalesce(v_draft.draft_revision,0) <> p_expected_revision then raise exception 'assessment_draft_revision_conflict'; end if;
  if v_draft.id is null then
    insert into public.swim_assessment_drafts(tenant_id,participant_id,enrollment_id,curriculum_version_id,curriculum_item_id,rating,visibility,
      client_operation_id,device_id,saved_by_user_id,review_owned,review_base_observation_id,review_correction_reason,review_session_id)
      values(p_tenant,p_participant,p_enrollment,v_version,p_item,p_rating,p_visibility,gen_random_uuid()::text,'instructor-web-review',(select auth.uid()),true,p_base_observation,nullif(trim(p_reason),''),p_session)
      returning * into v_draft;
  elsif (v_draft.rating,v_draft.visibility,v_draft.review_base_observation_id,v_draft.review_correction_reason,v_draft.review_session_id)
    is distinct from (p_rating,p_visibility,p_base_observation,nullif(trim(p_reason),''),p_session) then
    update public.swim_assessment_drafts d set rating = p_rating,visibility = p_visibility,review_base_observation_id = p_base_observation,
      review_correction_reason = nullif(trim(p_reason),''),review_session_id = p_session,client_operation_id = gen_random_uuid()::text,
      draft_revision = d.draft_revision + 1,expires_at = now() + interval '30 days'
      where d.id = v_draft.id returning * into v_draft;
  end if;
  return to_jsonb(v_draft);
end;
$$;
revoke all on function app_private.save_instructor_assessment_draft(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text,integer) from public,anon;
grant execute on function app_private.save_instructor_assessment_draft(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text,integer) to authenticated,service_role;

create function app_private.discard_instructor_assessment_draft(p_tenant uuid,p_draft uuid,p_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_draft public.swim_assessment_drafts%rowtype;
begin
  if (select auth.uid()) is null or app_private.is_portal_session_restricted() then raise exception 'assessment_review_access_denied'; end if;
  select * into v_draft from public.swim_assessment_drafts d where d.tenant_id = p_tenant and d.id = p_draft and d.saved_by_user_id = (select auth.uid()) for update;
  if v_draft.id is null then return; end if;
  if not v_draft.review_owned or v_draft.draft_revision is distinct from p_revision then raise exception 'assessment_draft_revision_conflict'; end if;
  delete from public.swim_assessment_drafts d where d.id = v_draft.id;
end;
$$;
revoke all on function app_private.discard_instructor_assessment_draft(uuid,uuid,integer) from public,anon;
grant execute on function app_private.discard_instructor_assessment_draft(uuid,uuid,integer) to authenticated,service_role;

create function app_private.finalize_instructor_assessment_draft(p_tenant uuid,p_participant uuid,p_enrollment uuid,p_item uuid,
  p_draft uuid,p_revision integer,p_operation uuid,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_draft public.swim_assessment_drafts%rowtype; v_current uuid; v_observation uuid; v_receipt public.domain_command_receipts%rowtype;
  v_key text := 'assessment:review:' || p_draft::text || ':' || p_operation::text; v_result jsonb;
begin
  perform app_private.require_instructor_assessment_context(p_tenant,p_participant,p_enrollment,p_item,null);
  if p_confirmed is not true or p_operation is null or p_revision is null or p_revision < 1 then raise exception 'assessment_review_confirmation_required'; end if;
  perform 1 from public.enrollments e where e.tenant_id = p_tenant and e.id = p_enrollment for update;
  select * into v_receipt from public.domain_command_receipts r where r.tenant_id = p_tenant and r.idempotency_key = v_key;
  if v_receipt.id is not null then
    if v_receipt.actor_user_id is distinct from (select auth.uid()) or v_receipt.command_type <> 'assessment.review.finalize'
      or v_receipt.result_json->>'enrollmentId' is distinct from p_enrollment::text or v_receipt.result_json->>'itemId' is distinct from p_item::text
    then raise exception 'assessment_review_access_denied'; end if;
    return v_receipt.result_json || jsonb_build_object('replayed',true);
  end if;
  select * into v_draft from public.swim_assessment_drafts d where d.tenant_id = p_tenant and d.id = p_draft
    and d.saved_by_user_id = (select auth.uid()) and d.enrollment_id = p_enrollment and d.curriculum_item_id = p_item and d.participant_id = p_participant for update;
  if v_draft.id is null or v_draft.expires_at <= now() or not v_draft.review_owned then raise exception 'assessment_draft_unavailable'; end if;
  if v_draft.draft_revision <> p_revision or v_draft.client_operation_id is distinct from p_operation::text then raise exception 'assessment_draft_revision_conflict'; end if;
  perform app_private.require_instructor_assessment_context(p_tenant,p_participant,p_enrollment,p_item,v_draft.review_session_id);
  v_current := app_private.latest_reviewed_assessment_id(p_tenant,p_enrollment,p_item);
  if v_current is distinct from v_draft.review_base_observation_id then raise exception 'assessment_observation_conflict'; end if;
  if v_current is not null and length(trim(coalesce(v_draft.review_correction_reason,''))) < 3 then raise exception 'assessment_correction_reason_required'; end if;
  v_observation := app_private.finalize_swim_assessment(p_tenant,p_participant,p_enrollment,p_item,v_draft.rating,null,v_draft.visibility,
    jsonb_build_object('channel','instructor_web_review','formulaVersion','swim_progress_v3','childVisible',false),now(),v_draft.review_session_id,
    v_current,v_draft.review_correction_reason,case when v_current is null then 'manual' else 'admin_command' end,
    v_draft.client_operation_id,'instructor-web-review',(select auth.uid()),v_key || ':canonical');
  v_result := jsonb_build_object('observationId',v_observation,'enrollmentId',p_enrollment,'itemId',p_item,'replayed',false);
  insert into public.domain_command_receipts(tenant_id,idempotency_key,command_type,aggregate_type,aggregate_id,actor_user_id,request_hash,result_json)
    values(p_tenant,v_key,'assessment.review.finalize','swim_assessment_observation',v_observation,(select auth.uid()),app_private.native_command_request_hash(to_jsonb(v_draft)),v_result);
  delete from public.swim_assessment_drafts d where d.id = v_draft.id;
  return v_result;
end;
$$;
revoke all on function app_private.finalize_instructor_assessment_draft(uuid,uuid,uuid,uuid,uuid,integer,uuid,boolean) from public,anon;
grant execute on function app_private.finalize_instructor_assessment_draft(uuid,uuid,uuid,uuid,uuid,integer,uuid,boolean) to authenticated,service_role;

create function public.read_instructor_assessment_draft(p_tenant uuid,p_participant uuid,p_enrollment uuid,p_item uuid,p_session uuid)
returns jsonb language sql security invoker set search_path = '' as $$
 select app_private.read_instructor_assessment_draft(p_tenant,p_participant,p_enrollment,p_item,p_session);
$$;
revoke all on function public.read_instructor_assessment_draft(uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.read_instructor_assessment_draft(uuid,uuid,uuid,uuid,uuid) to authenticated,service_role;

create function public.save_instructor_assessment_draft(p_tenant uuid,p_participant uuid,p_enrollment uuid,p_item uuid,p_session uuid,
  p_rating integer,p_visibility text,p_base_observation uuid,p_reason text,p_expected_revision integer)
returns jsonb language sql security invoker set search_path = '' as $$
 select app_private.save_instructor_assessment_draft(p_tenant,p_participant,p_enrollment,p_item,p_session,p_rating,p_visibility,p_base_observation,p_reason,p_expected_revision);
$$;
revoke all on function public.save_instructor_assessment_draft(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text,integer) from public,anon;
grant execute on function public.save_instructor_assessment_draft(uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text,integer) to authenticated,service_role;

create function public.discard_instructor_assessment_draft(p_tenant uuid,p_draft uuid,p_revision integer)
returns void language sql security invoker set search_path = '' as $$
 select app_private.discard_instructor_assessment_draft(p_tenant,p_draft,p_revision);
$$;
revoke all on function public.discard_instructor_assessment_draft(uuid,uuid,integer) from public,anon;
grant execute on function public.discard_instructor_assessment_draft(uuid,uuid,integer) to authenticated,service_role;

create function public.finalize_instructor_assessment_draft(p_tenant uuid,p_participant uuid,p_enrollment uuid,p_item uuid,
  p_draft uuid,p_revision integer,p_operation uuid,p_confirmed boolean)
returns jsonb language sql security invoker set search_path = '' as $$
 select app_private.finalize_instructor_assessment_draft(p_tenant,p_participant,p_enrollment,p_item,p_draft,p_revision,p_operation,p_confirmed);
$$;
revoke all on function public.finalize_instructor_assessment_draft(uuid,uuid,uuid,uuid,uuid,integer,uuid,boolean) from public,anon;
grant execute on function public.finalize_instructor_assessment_draft(uuid,uuid,uuid,uuid,uuid,integer,uuid,boolean) to authenticated,service_role;

-- A child compliment is a separate, explicitly confirmed publication. It does
-- not change rating, observation visibility, notes, completion order or score.
create table public.swim_child_compliments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  observation_id uuid not null,
  enrollment_id uuid not null,
  participant_id uuid not null,
  message text not null check(length(trim(message)) between 1 and 240),
  published_by_user_id uuid references auth.users(id) on delete set null,
  client_operation_id uuid not null,
  published_at timestamptz not null default now(),
  constraint swim_child_compliment_observation_fk foreign key(tenant_id,observation_id) references public.swim_assessment_observations(tenant_id,id) on delete cascade,
  constraint swim_child_compliment_enrollment_fk foreign key(tenant_id,enrollment_id,participant_id) references public.enrollments(tenant_id,id,participant_id) on delete cascade,
  constraint swim_child_compliment_once unique(tenant_id,observation_id),
  constraint swim_child_compliment_operation unique(tenant_id,published_by_user_id,client_operation_id)
);
create index swim_child_compliment_enrollment_idx on public.swim_child_compliments(tenant_id,enrollment_id,published_at);
revoke all on public.swim_child_compliments from public,anon,authenticated;
grant select on public.swim_child_compliments to authenticated;
grant all on public.swim_child_compliments to service_role;
alter table public.swim_child_compliments enable row level security;
alter table public.swim_child_compliments force row level security;
create policy swim_child_compliment_staff_read on public.swim_child_compliments for select to authenticated
  using(app_private.current_user_can_instruct_participant(participant_id));
create policy portal_child_session_restrictive on public.swim_child_compliments as restrictive for all to authenticated
  using(not app_private.is_portal_session_restricted()) with check(not app_private.is_portal_session_restricted());

create function app_private.guard_swim_child_compliment_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Auth deletion may anonymize provenance; published wording/context stays fixed.
  if (to_jsonb(new) - 'published_by_user_id') is distinct from (to_jsonb(old) - 'published_by_user_id')
    or (new.published_by_user_id is distinct from old.published_by_user_id and new.published_by_user_id is not null)
  then raise exception 'child_compliment_immutable'; end if;
  return new;
end;
$$;
revoke all on function app_private.guard_swim_child_compliment_immutable() from public,anon,authenticated;
create trigger swim_child_compliment_immutable before update on public.swim_child_compliments
  for each row execute function app_private.guard_swim_child_compliment_immutable();

create function app_private.publish_swim_child_compliment(p_tenant uuid,p_observation uuid,p_message text,p_operation uuid,p_confirmed boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_observation public.swim_assessment_observations%rowtype; v_existing public.swim_child_compliments%rowtype; v_id uuid;
begin
  if (select auth.uid()) is null or app_private.is_portal_session_restricted() then raise exception 'assessment_review_access_denied'; end if;
  if p_confirmed is not true or p_operation is null or p_message is null or length(trim(p_message)) not between 1 and 240
  then raise exception 'child_compliment_confirmation_required'; end if;
  select * into v_observation from public.swim_assessment_observations o where o.tenant_id = p_tenant and o.id = p_observation;
  if v_observation.id is null or v_observation.visibility <> 'parent_visible' then raise exception 'child_compliment_observation_unavailable'; end if;
  perform app_private.require_instructor_assessment_context(p_tenant,v_observation.participant_id,v_observation.enrollment_id,v_observation.curriculum_item_id,null);
  perform 1 from public.enrollments e where e.tenant_id = p_tenant and e.id = v_observation.enrollment_id for update;
  perform app_private.require_instructor_assessment_context(p_tenant,v_observation.participant_id,v_observation.enrollment_id,v_observation.curriculum_item_id,null);
  if app_private.latest_reviewed_assessment_id(p_tenant,v_observation.enrollment_id,v_observation.curriculum_item_id) is distinct from v_observation.id
  then raise exception 'child_compliment_observation_changed'; end if;
  select * into v_existing from public.swim_child_compliments c where c.tenant_id = p_tenant and c.observation_id = p_observation;
  if v_existing.id is not null then
    if v_existing.published_by_user_id = (select auth.uid()) and v_existing.client_operation_id = p_operation and v_existing.message = trim(p_message) then return v_existing.id; end if;
    raise exception 'child_compliment_already_published';
  end if;
  insert into public.swim_child_compliments(tenant_id,observation_id,enrollment_id,participant_id,message,published_by_user_id,client_operation_id)
    values(p_tenant,p_observation,v_observation.enrollment_id,v_observation.participant_id,trim(p_message),(select auth.uid()),p_operation) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function app_private.publish_swim_child_compliment(uuid,uuid,text,uuid,boolean) from public,anon;
grant execute on function app_private.publish_swim_child_compliment(uuid,uuid,text,uuid,boolean) to authenticated,service_role;
create function public.publish_swim_child_compliment(p_tenant uuid,p_observation uuid,p_message text,p_operation uuid,p_confirmed boolean)
returns uuid language sql security invoker set search_path = '' as $$
  select app_private.publish_swim_child_compliment(p_tenant,p_observation,p_message,p_operation,p_confirmed);
$$;
revoke all on function public.publish_swim_child_compliment(uuid,uuid,text,uuid,boolean) from public,anon;
grant execute on function public.publish_swim_child_compliment(uuid,uuid,text,uuid,boolean) to authenticated,service_role;

-- The guardian identity is authoritative; an optional display profile must not
-- make an authorized recipient disappear. Missing guardian remains unavailable.
create or replace function app_private.read_message_composer_draft(
  p_tenant uuid, p_thread uuid, p_participant uuid, p_item uuid, p_session uuid, p_visibility text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_draft public.message_composer_drafts%rowtype;
  v_item uuid := p_item;
  v_session uuid := p_session;
  v_reference jsonb := '{}'::jsonb;
  v_guardian uuid;
  v_recipient jsonb;
  v_participant_label text;
begin
  perform app_private.assert_message_composer_context(p_tenant,p_thread,p_participant,p_item,p_session,p_visibility);
  select * into v_draft from public.message_composer_drafts d where d.tenant_id = p_tenant
    and d.author_user_id = (select auth.uid()) and d.scope_key = coalesce(p_thread::text,'new') || ':' || coalesce(p_participant::text,'general') and d.expires_at > now();
  if v_draft.id is not null then
    -- Resume the saved context; URL parameters cannot silently relabel unsent text.
    perform app_private.assert_message_composer_context(p_tenant,p_thread,p_participant,v_draft.curriculum_item_id,v_draft.session_id,v_draft.visibility);
    v_item := v_draft.curriculum_item_id; v_session := v_draft.session_id;
  end if;
  if v_item is not null then
    select jsonb_build_object('kind','curriculum_item','id',i.id,'stableKey',identity.stable_key,'curriculumVersionId',i.curriculum_version_id,'participantId',p_participant,'label',i.name)
      into v_reference from public.curriculum_items i join public.curriculum_item_identities identity on identity.tenant_id = i.tenant_id and identity.id = i.identity_id
      where i.tenant_id = p_tenant and i.id = v_item;
  elsif v_session is not null then
    select jsonb_build_object('kind','session','id',s.id,'participantId',p_participant,'startsAt',s.starts_at,'timeZone',coalesce((select settings.timezone from public.tenant_settings settings where settings.tenant_id = p_tenant),'Europe/Amsterdam'),'label','Lesmoment')
      into v_reference from public.sessions s where s.tenant_id = p_tenant and s.id = v_session;
  end if;
  select p.display_name,p.guardian_user_id into v_participant_label,v_guardian from public.participants p where p.tenant_id = p_tenant and p.id = p_participant;
  if p_thread is not null then select t.guardian_user_id into v_guardian from public.message_threads t where t.tenant_id = p_tenant and t.id = p_thread; end if;
  if v_guardian = (select auth.uid()) or (p_thread is null and exists (
    select 1 from public.tenant_memberships m where m.tenant_id = p_tenant and m.user_id = (select auth.uid()) and m.role = 'parent' and m.status = 'active'
  ) and not app_private.current_user_can_manage_tenant_domain(p_tenant)) then
    select jsonb_build_object('kind','school','label',t.name) into v_recipient from public.tenants t where t.id = p_tenant;
  else
    select jsonb_build_object('kind','guardian','id',v_guardian,'label',coalesce((select nullif(p.full_name,'') from public.profiles p where p.id = v_guardian),'Ouder/verzorger')) into v_recipient where v_guardian is not null;
  end if;
  return jsonb_build_object('draft',case when v_draft.id is null then null else to_jsonb(v_draft) end,
    'reference',coalesce(v_reference,'{}'::jsonb),'recipient',v_recipient,'participantLabel',v_participant_label);
end;
$$;
