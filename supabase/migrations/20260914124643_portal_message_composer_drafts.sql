-- Private unsent composer state. No message, notification or provider action is created by autosave.
-- A draft expires after 30 days; reads hide expired state and the next save prunes the actor's expired rows.
create table public.message_composer_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid,
  participant_id uuid,
  curriculum_item_id uuid,
  session_id uuid,
  scope_key text generated always as (coalesce(thread_id::text, 'new') || ':' || coalesce(participant_id::text, 'general')) stored,
  subject text not null default '',
  plain_text text not null default '',
  visibility text not null default 'public_to_thread',
  thread_type text not null default 'general',
  revision integer not null default 1,
  operation_id uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  constraint message_composer_thread_fk foreign key(tenant_id, thread_id) references public.message_threads(tenant_id, id) on delete cascade,
  constraint message_composer_participant_fk foreign key(tenant_id, participant_id) references public.participants(tenant_id, id) on delete cascade,
  constraint message_composer_curriculum_item_fk foreign key(tenant_id, curriculum_item_id) references public.curriculum_items(tenant_id, id) on delete restrict,
  constraint message_composer_session_fk foreign key(tenant_id, session_id) references public.sessions(tenant_id, id) on delete restrict,
  constraint message_composer_context_check check (not (curriculum_item_id is not null and session_id is not null) and ((curriculum_item_id is null and session_id is null) or participant_id is not null)),
  constraint message_composer_text_bounds check (length(subject) <= 180 and length(plain_text) <= 8000),
  constraint message_composer_visibility_check check (visibility in ('public_to_thread', 'internal_note', 'staff_only')),
  constraint message_composer_thread_type_check check (thread_type in ('general', 'planning', 'payment', 'progress', 'graduation', 'intake', 'waitlist', 'support', 'internal')),
  constraint message_composer_revision_check check (revision > 0),
  constraint message_composer_author_scope_unique unique(tenant_id, author_user_id, scope_key)
);
create index message_composer_expiry_idx on public.message_composer_drafts(expires_at);
revoke all on public.message_composer_drafts from public, anon, authenticated;
grant select on public.message_composer_drafts to authenticated;
grant all on public.message_composer_drafts to service_role;
alter table public.message_composer_drafts enable row level security;
alter table public.message_composer_drafts force row level security;
create policy message_composer_author_read on public.message_composer_drafts for select to authenticated
  using (author_user_id = (select auth.uid()) and expires_at > now()
    and exists (select 1 from public.tenant_memberships membership where membership.tenant_id = message_composer_drafts.tenant_id
      and membership.user_id = (select auth.uid()) and membership.status = 'active')
    and (thread_id is null or app_private.current_user_can_view_message_thread(tenant_id, thread_id, visibility <> 'public_to_thread')));
create policy portal_child_session_restrictive on public.message_composer_drafts as restrictive for all to authenticated
  using (not app_private.is_portal_session_restricted()) with check (not app_private.is_portal_session_restricted());

-- Preserve explicit authorized item/lesson IDs with a sent thread as well as its draft.
alter table public.message_threads add column curriculum_item_id uuid;
alter table public.message_threads add constraint message_threads_curriculum_item_fk
  foreign key(tenant_id, curriculum_item_id) references public.curriculum_items(tenant_id, id) on delete restrict;

create function app_private.assert_message_composer_context(
  p_tenant uuid, p_thread uuid, p_participant uuid, p_item uuid, p_session uuid, p_visibility text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_admin boolean;
  v_parent boolean;
  v_instructor boolean;
  v_assigned boolean := false;
  v_own_group boolean := false;
  v_thread public.message_threads%rowtype;
  v_settings public.tenant_settings%rowtype;
begin
  if v_actor is null or app_private.is_portal_session_restricted() then raise exception 'message_composer_access_denied'; end if;
  select coalesce(bool_or(m.role in ('tenant_owner','tenant_admin','tenant_staff')),false),
    coalesce(bool_or(m.role = 'parent'),false), coalesce(bool_or(m.role = 'instructor'),false)
    into v_admin,v_parent,v_instructor
    from public.tenant_memberships m where m.tenant_id = p_tenant and m.user_id = v_actor and m.status = 'active';
  if not (v_admin or v_parent or v_instructor) then raise exception 'message_composer_access_denied'; end if;
  if p_visibility is null or p_visibility not in ('public_to_thread','internal_note','staff_only') then raise exception 'message_visibility_invalid'; end if;
  if p_item is not null and p_session is not null then raise exception 'message_reference_invalid'; end if;
  if (p_item is not null or p_session is not null) and p_participant is null then raise exception 'message_reference_participant_required'; end if;
  select * into v_settings from public.tenant_settings s where s.tenant_id = p_tenant;
  if p_thread is not null then
    select * into v_thread from public.message_threads t where t.tenant_id = p_tenant and t.id = p_thread and t.status not in ('closed','archived') and not t.is_test;
    if v_thread.id is null or v_thread.participant_id is distinct from p_participant then raise exception 'message_thread_context_unavailable'; end if;
    v_assigned := coalesce(v_thread.assigned_instructor_user_id = v_actor or v_thread.assigned_staff_user_id = v_actor,false);
    v_own_group := coalesce(v_settings.instructors_can_view_parent_threads = 'own_groups',false) and exists (
      select 1 from public.group_instructor_assignments a where a.tenant_id = p_tenant and a.group_id = v_thread.group_id and a.instructor_user_id = v_actor and a.status = 'active');
    if not v_admin and not (v_parent and coalesce(v_thread.guardian_user_id = v_actor,false)) and not (v_instructor and (v_assigned or v_own_group)) then raise exception 'message_thread_access_denied'; end if;
  end if;
  if p_participant is not null then
    if not exists (select 1 from public.participants p where p.tenant_id = p_tenant and p.id = p_participant) then raise exception 'message_participant_unavailable'; end if;
    if not v_admin and v_parent and (p_thread is null or coalesce(v_thread.guardian_user_id = v_actor,false)) then
      if not exists (select 1 from public.participants p where p.tenant_id = p_tenant and p.id = p_participant and p.guardian_user_id = v_actor)
        and not exists (select 1 from public.participant_guardians g where g.tenant_id = p_tenant and g.participant_id = p_participant and g.guardian_user_id = v_actor and g.status = 'active' and g.access_level in ('primary','secondary'))
      then raise exception 'message_participant_read_only'; end if;
    elsif not v_admin and v_instructor and p_thread is null and not app_private.current_user_can_instruct_participant(p_participant) then
      raise exception 'message_participant_access_denied';
    end if;
  elsif p_thread is null and not v_admin and not v_parent then
    raise exception 'message_participant_required';
  end if;
  if not v_admin then
    if v_parent and (p_thread is null or coalesce(v_thread.guardian_user_id = v_actor,false)) then
      if p_visibility <> 'public_to_thread' then raise exception 'message_parent_visibility_invalid'; end if;
    elsif v_instructor then
      if p_visibility = 'public_to_thread' and coalesce(v_settings.instructors_can_reply_to_parents,false) is not true then raise exception 'message_instructor_replies_disabled'; end if;
      if p_visibility <> 'public_to_thread' and (p_thread is null or not v_assigned) then raise exception 'message_internal_assignment_required'; end if;
    end if;
  end if;
  if p_item is not null and not exists (
    select 1 from public.curriculum_items item join public.enrollments enrollment
      on enrollment.tenant_id = item.tenant_id and enrollment.curriculum_version_id = item.curriculum_version_id
    where item.tenant_id = p_tenant and item.id = p_item and enrollment.participant_id = p_participant
  ) then raise exception 'message_curriculum_reference_denied'; end if;
  if p_session is not null and not exists (
    select 1 from public.sessions lesson join public.group_memberships membership
      on membership.tenant_id = lesson.tenant_id and membership.group_id = lesson.group_id
    where lesson.tenant_id = p_tenant and lesson.id = p_session and membership.participant_id = p_participant
      and membership.status in ('active','trial')
      and membership.starts_on <= (lesson.starts_at at time zone coalesce(v_settings.timezone,'Europe/Amsterdam'))::date
      and (membership.ends_on is null or membership.ends_on >= (lesson.starts_at at time zone coalesce(v_settings.timezone,'Europe/Amsterdam'))::date)
  ) then raise exception 'message_lesson_reference_denied'; end if;
end;
$$;
revoke all on function app_private.assert_message_composer_context(uuid,uuid,uuid,uuid,uuid,text) from public, anon, authenticated;

create function app_private.save_message_composer_draft(
  p_tenant uuid, p_thread uuid, p_participant uuid, p_item uuid, p_session uuid,
  p_subject text, p_text text, p_visibility text, p_type text, p_expected_revision integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_scope text := coalesce(p_thread::text,'new') || ':' || coalesce(p_participant::text,'general');
  v_draft public.message_composer_drafts%rowtype;
begin
  perform app_private.assert_message_composer_context(p_tenant,p_thread,p_participant,p_item,p_session,p_visibility);
  if p_subject is null or p_text is null or length(p_subject) > 180 or length(p_text) > 8000
    or p_expected_revision is null or p_expected_revision < 0
    or p_type is null or p_type not in ('general','planning','payment','progress','graduation','intake','waitlist','support','internal')
  then raise exception 'message_draft_invalid'; end if;
  if p_type = 'internal' and p_visibility = 'public_to_thread' then raise exception 'message_draft_type_visibility_mismatch'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('message-composer:' || p_tenant::text || ':' || v_actor::text || ':' || v_scope,0));
  delete from public.message_composer_drafts d where d.tenant_id = p_tenant and d.author_user_id = v_actor and d.expires_at <= now();
  select * into v_draft from public.message_composer_drafts d where d.tenant_id = p_tenant and d.author_user_id = v_actor and d.scope_key = v_scope for update;
  if coalesce(v_draft.revision,0) <> p_expected_revision then raise exception 'message_draft_revision_conflict'; end if;
  if v_draft.id is null then
    insert into public.message_composer_drafts(tenant_id,author_user_id,thread_id,participant_id,curriculum_item_id,session_id,subject,plain_text,visibility,thread_type)
      values(p_tenant,v_actor,p_thread,p_participant,p_item,p_session,p_subject,p_text,p_visibility,p_type) returning * into v_draft;
  elsif (v_draft.subject,v_draft.plain_text,v_draft.visibility,v_draft.thread_type,v_draft.curriculum_item_id,v_draft.session_id)
    is distinct from (p_subject,p_text,p_visibility,p_type,p_item,p_session) then
    update public.message_composer_drafts d set subject = p_subject, plain_text = p_text, visibility = p_visibility, thread_type = p_type,
      curriculum_item_id = p_item, session_id = p_session, revision = d.revision + 1, operation_id = gen_random_uuid(),
      updated_at = now(), expires_at = now() + interval '30 days'
      where d.id = v_draft.id returning * into v_draft;
  end if;
  return to_jsonb(v_draft);
end;
$$;
revoke all on function app_private.save_message_composer_draft(uuid,uuid,uuid,uuid,uuid,text,text,text,text,integer) from public, anon;
grant execute on function app_private.save_message_composer_draft(uuid,uuid,uuid,uuid,uuid,text,text,text,text,integer) to authenticated, service_role;

create function app_private.discard_message_composer_draft(p_tenant uuid, p_draft uuid, p_expected_revision integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_draft public.message_composer_drafts%rowtype;
begin
  if (select auth.uid()) is null or app_private.is_portal_session_restricted() then raise exception 'message_composer_access_denied'; end if;
  select * into v_draft from public.message_composer_drafts d where d.tenant_id = p_tenant and d.id = p_draft and d.author_user_id = (select auth.uid()) for update;
  if v_draft.id is null then return; end if;
  if v_draft.revision is distinct from p_expected_revision then raise exception 'message_draft_revision_conflict'; end if;
  delete from public.message_composer_drafts d where d.id = v_draft.id;
end;
$$;
revoke all on function app_private.discard_message_composer_draft(uuid,uuid,integer) from public, anon;
grant execute on function app_private.discard_message_composer_draft(uuid,uuid,integer) to authenticated, service_role;

alter table public.messages add column reference_json jsonb not null default '{}'::jsonb
  check (jsonb_typeof(reference_json) = 'object');

create function app_private.send_message_composer_draft(
  p_tenant uuid, p_draft uuid, p_revision integer, p_operation uuid,
  p_human_confirmed boolean, p_classification text, p_reasons jsonb, p_expected_guardian uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_draft public.message_composer_drafts%rowtype;
  v_key text := 'message-composer:' || p_draft::text || ':' || p_operation::text;
  v_receipt public.domain_command_receipts%rowtype;
  v_result jsonb;
  v_reference jsonb := '{}'::jsonb;
  v_admin boolean;
  v_parent boolean;
  v_guardian uuid;
  v_thread uuid;
  v_message uuid;
  v_sender text;
  v_created boolean := false;
  v_hash text;
begin
  if v_actor is null or app_private.is_portal_session_restricted() then raise exception 'message_composer_access_denied'; end if;
  if p_human_confirmed is not true or p_operation is null or p_revision is null or p_revision < 1
    or p_classification is null or p_classification not in ('operational','personal','sensitive','restricted')
    or jsonb_typeof(coalesce(p_reasons,'null'::jsonb)) <> 'array' or pg_column_size(p_reasons) > 8192
  then raise exception 'message_send_confirmation_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_key,0));
  select * into v_receipt from public.domain_command_receipts r where r.tenant_id = p_tenant and r.idempotency_key = v_key;
  if v_receipt.id is not null then
    if v_receipt.actor_user_id is distinct from v_actor or v_receipt.command_type <> 'portal.message.send'
      or not coalesce(app_private.current_user_can_view_message_thread(p_tenant,(v_receipt.result_json->>'threadId')::uuid,false),false)
    then raise exception 'message_composer_access_denied'; end if;
    return v_receipt.result_json || jsonb_build_object('replayed',true);
  end if;
  select * into v_draft from public.message_composer_drafts d where d.tenant_id = p_tenant and d.id = p_draft and d.author_user_id = v_actor for update;
  if v_draft.id is null or v_draft.expires_at <= now() then raise exception 'message_draft_unavailable'; end if;
  if v_draft.revision <> p_revision or v_draft.operation_id <> p_operation then raise exception 'message_draft_revision_conflict'; end if;
  perform app_private.assert_message_composer_context(p_tenant,v_draft.thread_id,v_draft.participant_id,v_draft.curriculum_item_id,v_draft.session_id,v_draft.visibility);
  if length(trim(v_draft.plain_text)) = 0 or (v_draft.thread_id is null and length(trim(v_draft.subject)) = 0) then raise exception 'message_content_required'; end if;
  v_hash := app_private.native_command_request_hash(to_jsonb(v_draft));
  select coalesce(bool_or(m.role in ('tenant_owner','tenant_admin','tenant_staff')),false),coalesce(bool_or(m.role = 'parent'),false)
    into v_admin,v_parent from public.tenant_memberships m where m.tenant_id = p_tenant and m.user_id = v_actor and m.status = 'active';
  v_thread := v_draft.thread_id;
  if v_thread is null then
    -- Parent questions go to the school. Staff/instructor questions about a child
    -- use that child's authoritative primary guardian, shown before confirmation.
    if v_parent and not v_admin then v_guardian := v_actor;
    elsif v_draft.participant_id is not null then
      select p.guardian_user_id into v_guardian from public.participants p where p.tenant_id = p_tenant and p.id = v_draft.participant_id;
    end if;
    if v_guardian is null or not exists (select 1 from public.tenant_memberships m where m.tenant_id = p_tenant and m.user_id = v_guardian and m.role = 'parent' and m.status = 'active') then raise exception 'message_guardian_unavailable'; end if;
    if v_draft.visibility = 'public_to_thread' and v_guardian is distinct from v_actor and v_guardian is distinct from p_expected_guardian then raise exception 'message_recipient_changed'; end if;
    insert into public.message_threads(tenant_id,subject,thread_type,status,participant_id,guardian_user_id,session_id,curriculum_item_id,assigned_staff_user_id,assigned_instructor_user_id,created_by_user_id)
      values(p_tenant,trim(v_draft.subject),v_draft.thread_type,'open',v_draft.participant_id,v_guardian,v_draft.session_id,v_draft.curriculum_item_id,
        case when v_admin then v_actor else null end,case when not v_admin and not v_parent then v_actor else null end,v_actor)
      returning id into v_thread;
    insert into public.message_thread_participants(tenant_id,thread_id,user_id,role,can_reply,can_view_internal)
      values(p_tenant,v_thread,v_guardian,'parent',true,false);
    if v_actor <> v_guardian then
      insert into public.message_thread_participants(tenant_id,thread_id,user_id,role,can_reply,can_view_internal)
        values(p_tenant,v_thread,v_actor,case when v_admin then 'staff' else 'instructor' end,true,true);
    end if;
    v_created := true;
  end if;
  if not v_created and v_draft.visibility = 'public_to_thread' then
    select t.guardian_user_id into v_guardian from public.message_threads t where t.tenant_id = p_tenant and t.id = v_thread for update;
    if v_guardian is distinct from v_actor and v_guardian is distinct from p_expected_guardian then raise exception 'message_recipient_changed'; end if;
  end if;
  if v_draft.curriculum_item_id is not null then
    select jsonb_build_object('kind','curriculum_item','id',i.id,'stableKey',identity.stable_key,'curriculumVersionId',i.curriculum_version_id,'participantId',v_draft.participant_id,'label',i.name)
      into v_reference from public.curriculum_items i join public.curriculum_item_identities identity on identity.tenant_id = i.tenant_id and identity.id = i.identity_id
      where i.tenant_id = p_tenant and i.id = v_draft.curriculum_item_id;
  elsif v_draft.session_id is not null then
    select jsonb_build_object('kind','session','id',s.id,'participantId',v_draft.participant_id,'startsAt',s.starts_at,'timeZone',coalesce((select settings.timezone from public.tenant_settings settings where settings.tenant_id = p_tenant),'Europe/Amsterdam'),'label','Lesmoment')
      into v_reference from public.sessions s where s.tenant_id = p_tenant and s.id = v_draft.session_id;
  end if;
  if v_draft.visibility = 'public_to_thread' then
    -- Reuse the existing command's atomic message/thread/read-state writes,
    -- instructor/guardian checks, command receipt and outbox contract.
    v_result := app_private.reply_native_message_thread(p_tenant,v_thread,v_draft.plain_text,p_classification,p_reasons,true,v_key || ':reply',v_actor);
    v_message := (v_result->>'messageId')::uuid;
    -- Preserve the existing web in-app notification contract inside this same
    -- transaction. No e-mail/provider delivery; replay returns before this insert.
    insert into public.tenant_notifications(tenant_id,recipient_user_id,type,title,message,status,entity_type,entity_id,action_href,dedupe_key,delivery_status,delivery_error)
      select p_tenant,target.user_id,'message_received','Nieuw bericht',t.subject,'unread','message_thread',v_thread,
        min(target.href), 'portal-message:' || v_message::text,'skipped','E-mail uitgeschakeld; in-app notificatie bewaard.'
      from public.message_threads t
      cross join lateral (values
        (t.guardian_user_id,'/portaal/inbox?thread=' || t.id::text),
        (t.assigned_staff_user_id,'/admin/berichten?thread=' || t.id::text),
        (t.assigned_instructor_user_id,'/instructor/berichten?thread=' || t.id::text)
      ) target(user_id,href)
      where t.tenant_id = p_tenant and t.id = v_thread and target.user_id <> v_actor
        and exists(select 1 from public.tenant_memberships membership where membership.tenant_id = p_tenant and membership.user_id = target.user_id and membership.status = 'active')
      group by target.user_id,t.subject
      on conflict(tenant_id,recipient_user_id,dedupe_key) do nothing;
  else
    v_sender := case when v_admin then 'staff' else 'instructor' end;
    insert into public.messages(tenant_id,thread_id,sender_type,sender_user_id,body_json,plain_text,visibility,status,content_classification,classification_reasons,human_confirmed_at,sent_at)
      values(p_tenant,v_thread,v_sender,v_actor,jsonb_build_object('type','doc','content',jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(jsonb_build_object('type','text','text',trim(v_draft.plain_text)))))),
        trim(v_draft.plain_text),v_draft.visibility,'sent',p_classification,p_reasons,now(),now()) returning id into v_message;
    update public.message_threads t set last_message_at = now() where t.tenant_id = p_tenant and t.id = v_thread;
    update public.message_thread_participants p set last_read_at = now() where p.tenant_id = p_tenant and p.thread_id = v_thread and p.user_id = v_actor and p.status = 'active';
    -- Internal text does not create a public delivery or change the school's waiting status.
    v_result := jsonb_build_object('messageId',v_message,'threadId',v_thread,'status','sent');
  end if;
  update public.messages m set reference_json = coalesce(v_reference,'{}'::jsonb) where m.tenant_id = p_tenant and m.id = v_message;
  v_result := v_result || jsonb_build_object('createdThread',v_created,'replayed',false);
  insert into public.domain_command_receipts(tenant_id,idempotency_key,command_type,aggregate_type,aggregate_id,actor_user_id,request_hash,result_json)
    values(p_tenant,v_key,'portal.message.send','message',v_message,v_actor,v_hash,v_result);
  delete from public.message_composer_drafts d where d.id = v_draft.id;
  return v_result;
end;
$$;
revoke all on function app_private.send_message_composer_draft(uuid,uuid,integer,uuid,boolean,text,jsonb,uuid) from public, anon;
grant execute on function app_private.send_message_composer_draft(uuid,uuid,integer,uuid,boolean,text,jsonb,uuid) to authenticated, service_role;

create function app_private.read_message_composer_draft(
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
    select jsonb_build_object('kind','guardian','id',v_guardian,'label',coalesce(nullif(p.full_name,''),'Ouder/verzorger')) into v_recipient from public.profiles p where p.id = v_guardian;
  end if;
  return jsonb_build_object('draft',case when v_draft.id is null then null else to_jsonb(v_draft) end,
    'reference',coalesce(v_reference,'{}'::jsonb),'recipient',v_recipient,'participantLabel',v_participant_label);
end;
$$;
revoke all on function app_private.read_message_composer_draft(uuid,uuid,uuid,uuid,uuid,text) from public, anon;
grant execute on function app_private.read_message_composer_draft(uuid,uuid,uuid,uuid,uuid,text) to authenticated, service_role;

-- The existing native RPC retains its signature and transaction/outbox contract.
create or replace function app_private.reply_native_message_thread(
  target_tenant_id uuid,
  target_thread_id uuid,
  target_plain_text text,
  target_content_classification text,
  target_classification_reasons jsonb,
  target_human_confirmed boolean,
  target_idempotency_key text,
  target_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_thread public.message_threads%rowtype;
  target_settings public.tenant_settings%rowtype;
  actor_is_admin boolean := false;
  actor_is_parent boolean := false;
  actor_is_assigned_instructor boolean := false;
  actor_is_group_instructor boolean := false;
  sender_type text;
  target_message_id uuid;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
  result_json jsonb;
begin
  if target_actor_user_id is null
    or target_actor_user_id is distinct from (select auth.uid())
  then raise exception 'Authenticated actor mismatch'; end if;
  if target_human_confirmed is not true
    or length(trim(coalesce(target_plain_text, ''))) not between 1 and 8000
    or target_content_classification is null
    or target_content_classification not in (
      'operational', 'personal', 'sensitive', 'restricted'
    )
    or jsonb_typeof(coalesce(target_classification_reasons, '[]'::jsonb)) <> 'array'
    or target_idempotency_key is null
    or length(target_idempotency_key) not between 8 and 200
  then raise exception 'Invalid message reply command'; end if;

  select * into target_thread
  from public.message_threads thread
  where thread.tenant_id = target_tenant_id
    and thread.id = target_thread_id
    and thread.status not in ('closed', 'archived')
    and not thread.is_test
  for update;
  if target_thread.id is null then raise exception 'Message thread not available'; end if;
  -- The canonical reply command is also directly callable. Share the explicit
  -- active-role, null-safe guardian, instructor and child-session boundary.
  perform app_private.assert_message_composer_context(target_tenant_id,target_thread_id,target_thread.participant_id,null,null,'public_to_thread');
  select * into target_settings
  from public.tenant_settings settings
  where settings.tenant_id = target_tenant_id;

  actor_is_admin := app_private.current_user_can_manage_tenant_domain(target_tenant_id);
  actor_is_parent := target_thread.guardian_user_id = target_actor_user_id;
  actor_is_assigned_instructor :=
    target_thread.assigned_instructor_user_id = target_actor_user_id
    or target_thread.assigned_staff_user_id = target_actor_user_id;
  actor_is_group_instructor :=
    target_settings.instructors_can_view_parent_threads = 'own_groups'
    and target_thread.group_id is not null
    and exists (
      select 1 from public.group_instructor_assignments assignment
      where assignment.tenant_id = target_tenant_id
        and assignment.group_id = target_thread.group_id
        and assignment.instructor_user_id = target_actor_user_id
        and assignment.status = 'active'
    );
  if actor_is_parent and target_thread.participant_id is not null and not (
    exists (
      select 1 from public.participants participant
      where participant.tenant_id = target_tenant_id
        and participant.id = target_thread.participant_id
        and participant.guardian_user_id = target_actor_user_id
    )
    or exists (
      select 1 from public.participant_guardians guardian
      where guardian.tenant_id = target_tenant_id
        and guardian.participant_id = target_thread.participant_id
        and guardian.guardian_user_id = target_actor_user_id
        and guardian.status = 'active'
        and guardian.access_level in ('primary', 'secondary')
    )
  ) then raise exception 'Parent has read-only thread access'; end if;
  if not actor_is_admin
    and not actor_is_parent
    and not actor_is_assigned_instructor
    and not actor_is_group_instructor
  then raise exception 'Message thread access denied'; end if;
  if (actor_is_assigned_instructor or actor_is_group_instructor)
    and not actor_is_admin
    and coalesce(target_settings.instructors_can_reply_to_parents, false) is not true
  then raise exception 'Instructor replies are disabled'; end if;

  sender_type := case
    when actor_is_parent then 'parent'
    when actor_is_admin then 'staff'
    else 'instructor'
  end;
  request_hash := app_private.native_command_request_hash(jsonb_build_object(
    'threadId', target_thread_id,
    'plainText', trim(target_plain_text),
    'classification', target_content_classification
  ));
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.actor_user_id is distinct from target_actor_user_id
      or existing_receipt.command_type <> 'message.reply'
      or existing_receipt.request_hash <> request_hash
    then raise exception 'Idempotency key was already used for another command'; end if;
    return existing_receipt.result_json;
  end if;

  insert into public.messages (
    tenant_id, thread_id, sender_type, sender_user_id, body_json, body_html,
    plain_text, visibility, status, content_classification,
    classification_reasons, human_confirmed_at, sent_at, is_test, source
  ) values (
    target_tenant_id, target_thread_id, sender_type, target_actor_user_id,
    jsonb_build_object(
      'type', 'doc',
      'content', jsonb_build_array(jsonb_build_object(
        'type', 'paragraph',
        'content', jsonb_build_array(jsonb_build_object(
          'type', 'text',
          'text', trim(target_plain_text)
        ))
      ))
    ),
    null,
    trim(target_plain_text),
    'public_to_thread',
    'sent',
    target_content_classification,
    coalesce(target_classification_reasons, '[]'::jsonb),
    now(),
    now(),
    false,
    'manual'
  ) returning id into target_message_id;
  update public.message_threads
  set last_message_at = now(),
      status = case
        when actor_is_parent then 'waiting_for_school'
        else 'waiting_for_parent'
      end
  where tenant_id = target_tenant_id
    and id = target_thread_id;
  update public.message_thread_participants
  set last_read_at = now()
  where tenant_id = target_tenant_id
    and thread_id = target_thread_id
    and user_id = target_actor_user_id
    and status = 'active';

  result_json := jsonb_build_object(
    'messageId', target_message_id,
    'threadId', target_thread_id,
    'status', 'sent'
  );
  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id, target_idempotency_key, 'message.reply',
    'message', target_message_id, target_actor_user_id, request_hash,
    result_json
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    payload_json
  ) values (
    target_tenant_id, 'communication.thread_replied', 'message',
    target_message_id, target_actor_user_id,
    jsonb_build_object(
      'threadId', target_thread_id,
      'senderType', sender_type,
      'contentClassification', target_content_classification
    )
  );
  return result_json;
end;
$$;


alter table public.message_thread_participants add column archived_at timestamptz;
create function app_private.set_message_thread_personal_archive(p_tenant uuid,p_thread uuid,p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_thread public.message_threads%rowtype;
  v_role text;
begin
  if v_actor is null or p_archived is null or app_private.is_portal_session_restricted()
    or not coalesce(app_private.current_user_can_view_message_thread(p_tenant,p_thread,false),false)
  then raise exception 'message_composer_access_denied'; end if;
  select * into v_thread from public.message_threads t where t.tenant_id = p_tenant and t.id = p_thread and not t.is_test;
  if v_thread.id is null then raise exception 'message_thread_access_denied'; end if;
  select case when bool_or(m.role in ('tenant_owner','tenant_admin','tenant_staff')) then 'staff'
    when bool_or(m.role = 'parent') and v_thread.guardian_user_id = v_actor then 'parent'
    when bool_or(m.role = 'instructor') then 'instructor' end
    into v_role from public.tenant_memberships m where m.tenant_id = p_tenant and m.user_id = v_actor and m.status = 'active';
  if v_role is null then raise exception 'message_composer_access_denied'; end if;
  if v_role = 'parent' and v_thread.participant_id is not null and not (
    exists(select 1 from public.participants p where p.tenant_id = p_tenant and p.id = v_thread.participant_id and p.guardian_user_id = v_actor)
    or exists(select 1 from public.participant_guardians g where g.tenant_id = p_tenant and g.participant_id = v_thread.participant_id and g.guardian_user_id = v_actor and g.status = 'active')
  ) then raise exception 'message_thread_access_denied'; end if;
  -- A personal inbox preference does not close the shared conversation, delete
  -- any message, change reply/internal permissions, or notify another actor.
  insert into public.message_thread_participants(tenant_id,thread_id,user_id,role,can_reply,can_view_internal,archived_at)
    values(p_tenant,p_thread,v_actor,v_role,false,false,case when p_archived then now() else null end)
    on conflict(tenant_id,thread_id,user_id) do update set archived_at = excluded.archived_at;
end;
$$;
revoke all on function app_private.set_message_thread_personal_archive(uuid,uuid,boolean) from public,anon;
grant execute on function app_private.set_message_thread_personal_archive(uuid,uuid,boolean) to authenticated,service_role;

-- Public API surface delegates to actor-bound private commands.
create or replace function public.save_message_composer_draft(
  p_tenant uuid, p_thread uuid, p_participant uuid, p_item uuid, p_session uuid,
  p_subject text, p_text text, p_visibility text, p_type text, p_expected_revision integer
)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.save_message_composer_draft(p_tenant,p_thread,p_participant,p_item,p_session,p_subject,p_text,p_visibility,p_type,p_expected_revision);
$$;
revoke all on function public.save_message_composer_draft(uuid,uuid,uuid,uuid,uuid,text,text,text,text,integer) from public,anon;
grant execute on function public.save_message_composer_draft(uuid,uuid,uuid,uuid,uuid,text,text,text,text,integer) to authenticated,service_role;

create or replace function public.discard_message_composer_draft(p_tenant uuid, p_draft uuid, p_expected_revision integer)
returns void language sql security invoker set search_path = '' as $$
  select app_private.discard_message_composer_draft(p_tenant,p_draft,p_expected_revision);
$$;
revoke all on function public.discard_message_composer_draft(uuid,uuid,integer) from public,anon;
grant execute on function public.discard_message_composer_draft(uuid,uuid,integer) to authenticated,service_role;

create or replace function public.send_message_composer_draft(
  p_tenant uuid, p_draft uuid, p_revision integer, p_operation uuid,
  p_human_confirmed boolean, p_classification text, p_reasons jsonb, p_expected_guardian uuid default null
)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.send_message_composer_draft(p_tenant,p_draft,p_revision,p_operation,p_human_confirmed,p_classification,p_reasons,p_expected_guardian);
$$;
revoke all on function public.send_message_composer_draft(uuid,uuid,integer,uuid,boolean,text,jsonb,uuid) from public,anon;
grant execute on function public.send_message_composer_draft(uuid,uuid,integer,uuid,boolean,text,jsonb,uuid) to authenticated,service_role;

create or replace function public.read_message_composer_draft(
  p_tenant uuid, p_thread uuid, p_participant uuid, p_item uuid, p_session uuid, p_visibility text
)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.read_message_composer_draft(p_tenant,p_thread,p_participant,p_item,p_session,p_visibility);
$$;
revoke all on function public.read_message_composer_draft(uuid,uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.read_message_composer_draft(uuid,uuid,uuid,uuid,uuid,text) to authenticated,service_role;

create or replace function public.set_message_thread_personal_archive(p_tenant uuid,p_thread uuid,p_archived boolean)
returns void language sql security invoker set search_path = '' as $$
  select app_private.set_message_thread_personal_archive(p_tenant,p_thread,p_archived);
$$;
revoke all on function public.set_message_thread_personal_archive(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_message_thread_personal_archive(uuid,uuid,boolean) to authenticated,service_role;
