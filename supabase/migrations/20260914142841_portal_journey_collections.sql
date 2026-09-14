-- Cosmetic discoveries have no assessment, badge, billing, notification or
-- transition side effects. Native child context v1 keeps its exact contract.
alter table app_private.portal_session_contexts
  add column presentation_capabilities text[] not null default '{}'::text[],
  add constraint portal_session_presentation_capabilities_check check (
    presentation_capabilities = '{}'::text[] or presentation_capabilities = array['collectibles.write_safe']::text[]
  );

create function app_private.start_child_portal_presentation_session_for_service(
  p_session_id uuid, p_user_id uuid, p_tenant_id uuid, p_participant_id uuid, p_context_version integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_context jsonb;
begin
  -- The original complete guardian/session/rollout/TTL authority runs first.
  v_context := app_private.start_child_portal_session_for_service(p_session_id,p_user_id,p_tenant_id,p_participant_id,p_context_version);
  if v_context->>'mode' is distinct from 'child' then raise exception 'collection_child_session_required'; end if;
  update app_private.portal_session_contexts c set presentation_capabilities = array['collectibles.write_safe']::text[]
    where c.session_id = p_session_id and c.auth_user_id = p_user_id and c.tenant_id = p_tenant_id and c.participant_id = p_participant_id;
  return v_context;
end;
$$;
revoke all on function app_private.start_child_portal_presentation_session_for_service(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function app_private.start_child_portal_presentation_session_for_service(uuid,uuid,uuid,uuid,integer) to service_role;

create table app_private.portal_collection_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  participant_id uuid not null,
  theme_key text not null,
  theme_release text not null,
  item_key text not null check(length(item_key) between 1 and 100),
  title text not null check(length(title) between 1 and 100),
  asset_snapshot_json jsonb,
  found_at timestamptz not null default clock_timestamp(),
  constraint portal_collection_participant_fk foreign key(tenant_id,participant_id) references public.participants(tenant_id,id) on delete cascade,
  constraint portal_collection_release_fk foreign key(theme_key,theme_release) references public.portal_theme_release(theme_key,release) on delete restrict,
  constraint portal_collection_once unique(tenant_id,participant_id,theme_key,item_key),
  constraint portal_collection_asset_object check(asset_snapshot_json is null or jsonb_typeof(asset_snapshot_json) = 'object')
);
create index portal_collection_history_idx on app_private.portal_collection_items(tenant_id,participant_id,found_at,id);
alter table app_private.portal_collection_items enable row level security;
alter table app_private.portal_collection_items force row level security;
revoke all on app_private.portal_collection_items from public,anon,authenticated;
grant all on app_private.portal_collection_items to service_role;

create table app_private.portal_collection_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  participant_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  theme_key text not null,
  theme_release text not null,
  item_key text not null,
  title text not null,
  asset_snapshot_json jsonb,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default now() + interval '1 hour',
  saved_item_id uuid references app_private.portal_collection_items(id) on delete cascade,
  constraint portal_collection_offer_participant_fk foreign key(tenant_id,participant_id) references public.participants(tenant_id,id) on delete cascade,
  constraint portal_collection_offer_release_fk foreign key(theme_key,theme_release) references public.portal_theme_release(theme_key,release) on delete restrict,
  constraint portal_collection_offer_retry unique(tenant_id,participant_id,actor_user_id,request_id)
);
create index portal_collection_offer_recent_idx on app_private.portal_collection_offers(tenant_id,participant_id,actor_user_id,created_at);
alter table app_private.portal_collection_offers enable row level security;
alter table app_private.portal_collection_offers force row level security;
revoke all on app_private.portal_collection_offers from public,anon,authenticated;
grant all on app_private.portal_collection_offers to service_role;

create function app_private.guard_collection_item_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if to_jsonb(new) is distinct from to_jsonb(old) then raise exception 'collection_item_immutable'; end if;
  return new;
end;
$$;
revoke all on function app_private.guard_collection_item_immutable() from public,anon,authenticated;
create trigger portal_collection_item_immutable before update on app_private.portal_collection_items
  for each row execute function app_private.guard_collection_item_immutable();

create function app_private.require_collection_actor(p_session uuid,p_actor uuid,p_tenant uuid,p_participant uuid,p_write boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_context jsonb;
begin
  if p_session is null or p_actor is null or not exists(select 1 from auth.sessions s where s.id = p_session and s.user_id = p_actor and (s.not_after is null or s.not_after > now()))
  then raise exception 'collection_access_denied'; end if;
  if exists(select 1 from app_private.portal_session_contexts c where c.session_id = p_session) then
    v_context := app_private.portal_session_json(p_session,p_actor);
    if v_context->>'mode' is distinct from 'child' or v_context->>'tenantId' is distinct from p_tenant::text or v_context->>'participantId' is distinct from p_participant::text
      or (p_write and not exists(select 1 from app_private.portal_session_contexts c where c.session_id = p_session and 'collectibles.write_safe' = any(c.presentation_capabilities)))
    then raise exception 'collection_child_capability_required'; end if;
  else
    if not exists(select 1 from public.tenant_memberships m where m.tenant_id = p_tenant and m.user_id = p_actor and m.role = 'parent' and m.status = 'active')
      or (exists(select 1 from public.tenant_swim_rollouts r where r.tenant_id = p_tenant and r.feature_key = 'swim.portal.parent_child_split' and r.status in ('pilot','enabled'))
        and not exists(select 1 from app_private.portal_parent_session_contexts c where c.session_id = p_session and c.auth_user_id = p_actor and c.tenant_id = p_tenant))
    then raise exception 'collection_access_denied'; end if;
  end if;
  if not exists(select 1 from public.participants p where p.tenant_id = p_tenant and p.id = p_participant and p.status = 'active'
    and (p.guardian_user_id = p_actor or exists(select 1 from public.participant_guardians g where g.tenant_id = p_tenant and g.participant_id = p_participant
      and g.guardian_user_id = p_actor and g.status = 'active' and (not p_write or g.access_level in ('primary','secondary')))))
  then raise exception 'collection_access_denied'; end if;
end;
$$;
revoke all on function app_private.require_collection_actor(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;

create function app_private.require_collection_release(p_tenant uuid,p_participant uuid,p_theme text,p_release text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_presentation jsonb;
begin
  select r.presentation_json into v_presentation from public.portal_theme_release r where r.theme_key = p_theme and r.release = p_release and r.status = 'published'
    and exists(select 1 from public.enrollments e join public.enrollment_stage_assignments a on a.tenant_id = e.tenant_id and a.enrollment_id = e.id and a.status = 'active'
      join public.portal_theme_world_binding b on b.tenant_id = e.tenant_id and b.program_id = e.program_id and b.curriculum_version_id = e.curriculum_version_id
        and b.curriculum_stage_id = a.curriculum_stage_id and b.deactivated_at is null
      where e.tenant_id = p_tenant and e.participant_id = p_participant and e.status = 'active' and b.theme_key = p_theme and b.theme_release = p_release);
  if v_presentation is null or v_presentation#>>'{collectibles,routeBinding}' is distinct from 'none'
    or jsonb_typeof(v_presentation#>'{collectibles,pool}') is distinct from 'array'
    or jsonb_array_length(v_presentation#>'{collectibles,pool}') not between 1 and 100
  then raise exception 'collection_theme_context_changed'; end if;
  return v_presentation;
end;
$$;
revoke all on function app_private.require_collection_release(uuid,uuid,text,text) from public,anon,authenticated;

create function app_private.discover_portal_collection_for_service(p_session uuid,p_actor uuid,p_tenant uuid,p_participant uuid,p_theme text,p_release text,p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_presentation jsonb; v_offer app_private.portal_collection_offers%rowtype; v_item jsonb; v_last text;
begin
  perform app_private.require_collection_actor(p_session,p_actor,p_tenant,p_participant,true);
  if p_request is null then raise exception 'collection_request_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('collection:' || p_tenant::text || ':' || p_participant::text,0));
  perform app_private.require_collection_actor(p_session,p_actor,p_tenant,p_participant,true);
  v_presentation := app_private.require_collection_release(p_tenant,p_participant,p_theme,p_release);
  select * into v_offer from app_private.portal_collection_offers o where o.tenant_id = p_tenant and o.participant_id = p_participant and o.actor_user_id = p_actor and o.request_id = p_request;
  if v_offer.id is not null then
    if v_offer.theme_key <> p_theme or v_offer.theme_release <> p_release then raise exception 'collection_request_context_changed'; end if;
    if v_offer.expires_at <= now() and v_offer.saved_item_id is null then raise exception 'collection_offer_expired'; end if;
    return to_jsonb(v_offer);
  end if;
  if (select count(*) from app_private.portal_collection_offers o where o.tenant_id = p_tenant and o.participant_id = p_participant and o.actor_user_id = p_actor and o.created_at > now() - interval '1 hour') >= 100
  then raise exception 'collection_rate_limit'; end if;
  select o.item_key into v_last from app_private.portal_collection_offers o where o.tenant_id = p_tenant and o.participant_id = p_participant and o.theme_key = p_theme order by o.created_at desc,o.id desc limit 1;
  select candidate.item into v_item from jsonb_array_elements(v_presentation#>'{collectibles,pool}') as candidate(item)
    where jsonb_array_length(v_presentation#>'{collectibles,pool}') = 1 or candidate.item->>'id' is distinct from v_last order by random() limit 1;
  insert into app_private.portal_collection_offers(tenant_id,participant_id,actor_user_id,request_id,theme_key,theme_release,item_key,title,asset_snapshot_json)
    values(p_tenant,p_participant,p_actor,p_request,p_theme,p_release,v_item->>'id',v_item->>'title',v_presentation->'assets'->(v_item->>'assetId')) returning * into v_offer;
  return to_jsonb(v_offer);
end;
$$;
revoke all on function app_private.discover_portal_collection_for_service(uuid,uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function app_private.discover_portal_collection_for_service(uuid,uuid,uuid,uuid,text,text,uuid) to service_role;

create function app_private.save_portal_collection_for_service(p_session uuid,p_actor uuid,p_tenant uuid,p_participant uuid,p_offer uuid,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_offer app_private.portal_collection_offers%rowtype; v_item app_private.portal_collection_items%rowtype; v_duplicate boolean;
begin
  perform app_private.require_collection_actor(p_session,p_actor,p_tenant,p_participant,true);
  if p_confirmed is not true then raise exception 'collection_confirmation_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('collection:' || p_tenant::text || ':' || p_participant::text,0));
  perform app_private.require_collection_actor(p_session,p_actor,p_tenant,p_participant,true);
  select * into v_offer from app_private.portal_collection_offers o where o.tenant_id = p_tenant and o.participant_id = p_participant and o.id = p_offer and o.actor_user_id = p_actor for update;
  if v_offer.id is null then raise exception 'collection_offer_unavailable'; end if;
  if v_offer.saved_item_id is not null then
    select * into v_item from app_private.portal_collection_items i where i.id = v_offer.saved_item_id;
    return jsonb_build_object('item',to_jsonb(v_item),'duplicate',true,'replayed',true);
  end if;
  if v_offer.expires_at <= now() then raise exception 'collection_offer_expired'; end if;
  perform app_private.require_collection_release(p_tenant,p_participant,v_offer.theme_key,v_offer.theme_release);
  select * into v_item from app_private.portal_collection_items i where i.tenant_id = p_tenant and i.participant_id = p_participant and i.theme_key = v_offer.theme_key and i.item_key = v_offer.item_key;
  v_duplicate := v_item.id is not null;
  if not v_duplicate then
    insert into app_private.portal_collection_items(tenant_id,participant_id,theme_key,theme_release,item_key,title,asset_snapshot_json)
      values(p_tenant,p_participant,v_offer.theme_key,v_offer.theme_release,v_offer.item_key,v_offer.title,v_offer.asset_snapshot_json) returning * into v_item;
  end if;
  update app_private.portal_collection_offers o set saved_item_id = v_item.id where o.id = v_offer.id;
  return jsonb_build_object('item',to_jsonb(v_item),'duplicate',v_duplicate,'replayed',false);
end;
$$;
revoke all on function app_private.save_portal_collection_for_service(uuid,uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function app_private.save_portal_collection_for_service(uuid,uuid,uuid,uuid,uuid,boolean) to service_role;

create function app_private.read_portal_collection_for_service(p_session uuid,p_actor uuid,p_tenant uuid,p_participant uuid,p_after uuid,p_read_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_items jsonb; v_write boolean := true;
begin
  perform app_private.require_collection_actor(p_session,p_actor,p_tenant,p_participant,false);
  if p_read_at is null or p_read_at > now() + interval '1 minute' then raise exception 'collection_read_time_invalid'; end if;
  begin
    perform app_private.require_collection_actor(p_session,p_actor,p_tenant,p_participant,true);
  exception when raise_exception then
    if sqlerrm in ('collection_access_denied','collection_child_capability_required') then v_write := false; else raise; end if;
  end;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.id),'[]'::jsonb) into v_items from (
    select i.id,i.theme_key,i.theme_release,i.item_key,i.title,i.asset_snapshot_json,i.found_at from app_private.portal_collection_items i
    where i.tenant_id = p_tenant and i.participant_id = p_participant and (p_after is null or i.id > p_after) and i.found_at <= p_read_at order by i.id limit 100
  ) item;
  return jsonb_build_object('items',v_items,'canWrite',v_write);
end;
$$;
revoke all on function app_private.read_portal_collection_for_service(uuid,uuid,uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function app_private.read_portal_collection_for_service(uuid,uuid,uuid,uuid,uuid,timestamptz) to service_role;

-- Expose a service-only invoker; privileged implementation stays outside the Data API.
create function public.start_child_portal_presentation_session_for_service(p_session_id uuid, p_user_id uuid, p_tenant_id uuid, p_participant_id uuid, p_context_version integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.start_child_portal_presentation_session_for_service(p_session_id,p_user_id,p_tenant_id,p_participant_id,p_context_version);
$$;
revoke all on function public.start_child_portal_presentation_session_for_service(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.start_child_portal_presentation_session_for_service(uuid,uuid,uuid,uuid,integer) to service_role;

-- Expose a service-only invoker; privileged implementation stays outside the Data API.
create function public.discover_portal_collection_for_service(p_session uuid,p_actor uuid,p_tenant uuid,p_participant uuid,p_theme text,p_release text,p_request uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.discover_portal_collection_for_service(p_session,p_actor,p_tenant,p_participant,p_theme,p_release,p_request);
$$;
revoke all on function public.discover_portal_collection_for_service(uuid,uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.discover_portal_collection_for_service(uuid,uuid,uuid,uuid,text,text,uuid) to service_role;

-- Expose a service-only invoker; privileged implementation stays outside the Data API.
create function public.save_portal_collection_for_service(p_session uuid,p_actor uuid,p_tenant uuid,p_participant uuid,p_offer uuid,p_confirmed boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.save_portal_collection_for_service(p_session,p_actor,p_tenant,p_participant,p_offer,p_confirmed);
$$;
revoke all on function public.save_portal_collection_for_service(uuid,uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.save_portal_collection_for_service(uuid,uuid,uuid,uuid,uuid,boolean) to service_role;

-- Expose a service-only invoker; privileged implementation stays outside the Data API.
create function public.read_portal_collection_for_service(p_session uuid,p_actor uuid,p_tenant uuid,p_participant uuid,p_after uuid,p_read_at timestamptz)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.read_portal_collection_for_service(p_session,p_actor,p_tenant,p_participant,p_after,p_read_at);
$$;
revoke all on function public.read_portal_collection_for_service(uuid,uuid,uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.read_portal_collection_for_service(uuid,uuid,uuid,uuid,uuid,timestamptz) to service_role;
