-- Attempts are separate records: retry never rewrites the failed source evidence.
alter table public.portal_theme_import
  add column retry_of uuid references public.portal_theme_import(id) on delete restrict,
  add column requested_runtime_release text,
  add column cleanup_started_at timestamptz,
  add column cleaned_at timestamptz,
  drop constraint portal_theme_import_status_check,
  add constraint portal_theme_import_status_check check(status in ('received','analyzed','rejected','draft','cleaning','cleaned')),
  add constraint portal_theme_requested_release_check check(requested_runtime_release is null or requested_runtime_release ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$');
create index portal_theme_import_retry_idx on public.portal_theme_import(retry_of);

create table app_private.portal_theme_import_recovery_event (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.portal_theme_import(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check(action in ('cleanup_started','cleanup_finished')),
  created_at timestamptz not null default now()
);
create index portal_theme_import_recovery_import_idx on app_private.portal_theme_import_recovery_event(import_id,created_at);
create index portal_theme_import_recovery_actor_idx on app_private.portal_theme_import_recovery_event(actor_user_id);
alter table app_private.portal_theme_import_recovery_event enable row level security;
alter table app_private.portal_theme_import_recovery_event force row level security;
revoke all on app_private.portal_theme_import_recovery_event from public,anon,authenticated;
grant select,insert on app_private.portal_theme_import_recovery_event to service_role;

create function public.begin_portal_theme_import_cleanup(p_actor uuid,p_import uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_import public.portal_theme_import%rowtype;
begin
  perform app_private.require_portal_theme_manager(p_actor);
  select * into v_import from public.portal_theme_import i where i.id=p_import for update;
  if v_import.id is null then raise exception 'theme_import_unavailable'; end if;
  if v_import.status='cleaned' then return jsonb_build_object('cleaned',true); end if;
  -- Only terminal rejected attempts. Never race a running import, mapping or draft save.
  if v_import.status not in ('rejected','cleaning') then raise exception 'theme_import_cleanup_not_rejected'; end if;
  if exists(select 1 from public.portal_theme_release r where r.source_provenance_json->>'importId'=p_import::text
      or r.source_provenance_json->>'sourceObjectKey'=v_import.source_object_key)
    or exists(select 1 from public.portal_theme_revision r where r.document_json#>>'{provenance,importId}'=p_import::text
      or r.document_json#>>'{provenance,sourceObjectKey}'=v_import.source_object_key)
  then raise exception 'theme_import_source_referenced'; end if;
  if v_import.status='rejected' then
    update public.portal_theme_import i set status='cleaning',cleanup_started_at=now() where i.id=p_import;
    insert into app_private.portal_theme_import_recovery_event(import_id,actor_user_id,action) values(p_import,p_actor,'cleanup_started');
  end if;
  return jsonb_build_object('cleaned',false,'sourceObjectKey',v_import.source_object_key);
end;
$$;
revoke all on function public.begin_portal_theme_import_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_portal_theme_import_cleanup(uuid,uuid) to service_role;

create function public.finish_portal_theme_import_cleanup(p_actor uuid,p_import uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_status text;
begin
  perform app_private.require_portal_theme_manager(p_actor);
  select i.status into v_status from public.portal_theme_import i where i.id=p_import for update;
  if v_status='cleaned' then return; end if;
  if v_status is distinct from 'cleaning' then raise exception 'theme_import_cleanup_not_started'; end if;
  update public.portal_theme_import i set status='cleaned',cleaned_at=now() where i.id=p_import;
  insert into app_private.portal_theme_import_recovery_event(import_id,actor_user_id,action) values(p_import,p_actor,'cleanup_finished');
end;
$$;
revoke all on function public.finish_portal_theme_import_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finish_portal_theme_import_cleanup(uuid,uuid) to service_role;

-- Match the existing management UI at the database write boundary as well.
create function app_private.guard_world_binding_published_curriculum()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.curriculum_versions v where v.tenant_id=new.tenant_id and v.id=new.curriculum_version_id
    and v.program_id=new.program_id and v.status='published' for share;
  if not found then raise exception 'published_curriculum_required'; end if;
  return new;
end;
$$;
revoke all on function app_private.guard_world_binding_published_curriculum() from public,anon,authenticated;
create trigger world_binding_published_curriculum before insert on public.portal_theme_world_binding
  for each row execute function app_private.guard_world_binding_published_curriculum();
