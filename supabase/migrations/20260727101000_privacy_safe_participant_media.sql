-- Privacy-safe progress media.
--
-- Design boundaries:
-- - JPEG/PNG only and exactly one participant per asset.
-- - Storage stays private and has no authenticated storage.objects policy.
-- - Guardians record consent through an audited RPC; snapshots cannot be
--   changed directly.
-- - Uploading creates a draft. Publishing is a separate, confirmed action.
-- - Journey Bot participants can never receive media.

create table public.participant_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  published_by uuid references auth.users (id) on delete set null,
  media_type text not null default 'image',
  storage_bucket text not null default 'participant-media',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  caption text,
  linked_entity_type text,
  linked_entity_id uuid,
  visibility text not null default 'guardian_and_staff',
  consent_purpose text not null default 'private_progress_media',
  consent_checked_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz not null,
  status text not null default 'draft',
  download_allowed boolean not null default false,
  content_classification text not null default 'restricted',
  classification_reasons text[] not null default array['minor_media', 'biometric_context']::text[],
  file_sha256 text not null,
  malware_scan_engine text not null,
  malware_scan_status text not null,
  malware_scanned_at timestamptz not null,
  failure_reason text,
  is_test boolean not null default false,
  journey_run_id uuid,
  test_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_media_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id)
    on delete cascade,
  constraint participant_media_type_check check (media_type = 'image'),
  constraint participant_media_bucket_check check (storage_bucket = 'participant-media'),
  constraint participant_media_mime_check check (mime_type in ('image/jpeg', 'image/png')),
  constraint participant_media_visibility_check check (visibility in ('guardian_and_staff', 'staff_only')),
  constraint participant_media_purpose_check check (consent_purpose = 'private_progress_media'),
  constraint participant_media_status_check check (
    status in ('draft', 'published', 'consent_blocked', 'expired', 'pending_deletion', 'deleted', 'failed')
  ),
  constraint participant_media_classification_check check (content_classification = 'restricted'),
  constraint participant_media_scan_status_check check (malware_scan_status in ('clean', 'not_required')),
  constraint participant_media_size_check check (size_bytes > 0 and size_bytes <= 20971520),
  constraint participant_media_expiry_check check (expires_at > created_at),
  constraint participant_media_publish_check check (
    (status = 'published' and published_at is not null and published_by is not null and consent_checked_at is not null)
    or status <> 'published'
  ),
  constraint participant_media_test_boundary_check check (
    is_test = false and journey_run_id is null and test_metadata_json = '{}'::jsonb
  ),
  constraint participant_media_tenant_id_id_unique unique (tenant_id, id),
  constraint participant_media_storage_path_unique unique (storage_bucket, storage_path)
);

create table public.media_consent_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  consent_id uuid not null,
  guardian_user_id uuid not null references auth.users (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  purpose text not null,
  decision text not null,
  policy_version text not null,
  authority text not null default 'guardian',
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint media_consent_events_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id)
    on delete cascade,
  constraint media_consent_events_consent_fk
    foreign key (tenant_id, consent_id)
    references public.media_consents (tenant_id, id)
    on delete cascade,
  constraint media_consent_events_purpose_check check (purpose = 'private_progress_media'),
  constraint media_consent_events_decision_check check (decision in ('granted', 'denied', 'withdrawn')),
  constraint media_consent_events_authority_check check (authority in ('guardian', 'legal_representative')),
  constraint media_consent_events_policy_version_check check (length(trim(policy_version)) between 1 and 80),
  constraint media_consent_events_tenant_id_id_unique unique (tenant_id, id)
);

create table public.media_access_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  media_id uuid not null,
  viewer_profile_id uuid references auth.users (id) on delete set null,
  action text not null,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  constraint media_access_logs_media_fk
    foreign key (tenant_id, media_id)
    references public.participant_media (tenant_id, id)
    on delete cascade,
  constraint media_access_logs_action_check check (
    action in ('view', 'download', 'upload', 'publish', 'archive', 'consent_blocked', 'expired', 'delete')
  ),
  constraint media_access_logs_metadata_size_check check (octet_length(metadata_json::text) <= 4096),
  constraint media_access_logs_tenant_id_id_unique unique (tenant_id, id)
);

create index participant_media_participant_created_idx
  on public.participant_media (tenant_id, participant_id, created_at desc);
create index participant_media_expiry_idx
  on public.participant_media (expires_at)
  where status in ('draft', 'published', 'consent_blocked');
create index media_consent_events_participant_idx
  on public.media_consent_events (tenant_id, participant_id, occurred_at desc);
create index media_access_logs_media_occurred_idx
  on public.media_access_logs (tenant_id, media_id, occurred_at desc);

create trigger participant_media_set_updated_at
  before update on public.participant_media
  for each row execute function app_private.set_updated_at();

create or replace function app_private.participant_media_has_valid_consent(
  target_tenant_id uuid,
  target_participant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with active_guardians as (
    select participant.guardian_user_id
    from public.participants participant
    where participant.tenant_id = target_tenant_id
      and participant.id = target_participant_id
      and participant.guardian_user_id is not null
      and coalesce(participant.is_test, false) = false
      and not exists (
        select 1
        from public.participant_guardians explicit_guardian
        where explicit_guardian.tenant_id = participant.tenant_id
          and explicit_guardian.participant_id = participant.id
          and explicit_guardian.guardian_user_id = participant.guardian_user_id
          and explicit_guardian.status = 'active'
          and explicit_guardian.access_level = 'view_only'
      )
    union
    select guardian.guardian_user_id
    from public.participant_guardians guardian
    join public.participants participant
      on participant.tenant_id = guardian.tenant_id
     and participant.id = guardian.participant_id
    where guardian.tenant_id = target_tenant_id
      and guardian.participant_id = target_participant_id
      and guardian.status = 'active'
      and guardian.access_level in ('primary', 'secondary')
      and coalesce(participant.is_test, false) = false
  ),
  current_decisions as (
    select consent.guardian_user_id, consent.status, consent.expires_at
    from public.media_consents consent
    join active_guardians guardian on guardian.guardian_user_id = consent.guardian_user_id
    where consent.tenant_id = target_tenant_id
      and consent.participant_id = target_participant_id
      and consent.purpose = 'private_progress_media'
  )
  select
    exists (
      select 1 from current_decisions
      where status = 'granted' and (expires_at is null or expires_at > now())
    )
    and not exists (
      select 1 from current_decisions
      where status in ('denied', 'withdrawn', 'expired')
    );
$$;

revoke all on function app_private.participant_media_has_valid_consent(uuid, uuid) from public;
grant execute on function app_private.participant_media_has_valid_consent(uuid, uuid) to service_role;

create or replace function app_private.record_private_progress_media_consent(
  target_tenant_id uuid,
  target_participant_id uuid,
  target_decision text,
  target_policy_version text,
  target_authority text default 'guardian'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  consent_id uuid;
  participant_is_test boolean;
begin
  if actor_id is null
    or target_decision not in ('granted', 'denied', 'withdrawn')
    or target_authority not in ('guardian', 'legal_representative')
    or length(trim(target_policy_version)) not between 1 and 80
  then
    raise exception 'invalid consent request' using errcode = '22023';
  end if;

  select coalesce(participant.is_test, false)
  into participant_is_test
  from public.participants participant
  where participant.tenant_id = target_tenant_id
    and participant.id = target_participant_id;

  if not found
    or participant_is_test
    or not app_private.current_user_has_tenant_role(target_tenant_id, array['parent'])
    or not exists (
      select 1
      from public.participants participant
      where participant.tenant_id = target_tenant_id
        and participant.id = target_participant_id
        and (
          (
            participant.guardian_user_id = actor_id
            and not exists (
              select 1
              from public.participant_guardians read_only_guardian
              where read_only_guardian.tenant_id = participant.tenant_id
                and read_only_guardian.participant_id = participant.id
                and read_only_guardian.guardian_user_id = actor_id
                and read_only_guardian.status = 'active'
                and read_only_guardian.access_level = 'view_only'
            )
          )
          or exists (
            select 1
            from public.participant_guardians guardian
            where guardian.tenant_id = participant.tenant_id
              and guardian.participant_id = participant.id
              and guardian.guardian_user_id = actor_id
              and guardian.status = 'active'
              and guardian.access_level in ('primary', 'secondary')
          )
        )
    )
    or not app_private.current_user_can_mutate_participant(target_participant_id)
  then
    raise exception 'consent not allowed' using errcode = '42501';
  end if;

  insert into public.media_consents (
    tenant_id,
    participant_id,
    guardian_user_id,
    purpose,
    status,
    granted_at,
    withdrawn_at,
    evidence
  )
  values (
    target_tenant_id,
    target_participant_id,
    actor_id,
    'private_progress_media',
    target_decision,
    case when target_decision = 'granted' then now() end,
    case when target_decision = 'withdrawn' then now() end,
    jsonb_build_object('policy_version', trim(target_policy_version), 'authority', target_authority)
  )
  on conflict (tenant_id, participant_id, guardian_user_id, purpose)
  do update set
    status = excluded.status,
    granted_at = excluded.granted_at,
    withdrawn_at = excluded.withdrawn_at,
    expires_at = null,
    evidence = excluded.evidence
  returning id into consent_id;

  insert into public.media_consent_events (
    tenant_id,
    participant_id,
    consent_id,
    guardian_user_id,
    actor_user_id,
    purpose,
    decision,
    policy_version,
    authority,
    evidence
  )
  values (
    target_tenant_id,
    target_participant_id,
    consent_id,
    actor_id,
    actor_id,
    'private_progress_media',
    target_decision,
    trim(target_policy_version),
    target_authority,
    jsonb_build_object('source', 'parent_portal')
  );

  if target_decision <> 'granted' then
    with blocked as (
      update public.participant_media
      set status = 'consent_blocked'
      where tenant_id = target_tenant_id
        and participant_id = target_participant_id
        and status = 'published'
      returning tenant_id, id
    )
    insert into public.media_access_logs (tenant_id, media_id, viewer_profile_id, action, metadata_json)
    select tenant_id, id, actor_id, 'consent_blocked',
      jsonb_build_object('consent_id', consent_id, 'decision', target_decision)
    from blocked;
  end if;

  return consent_id;
end;
$$;

revoke all on function app_private.record_private_progress_media_consent(uuid, uuid, text, text, text) from public;
grant execute on function app_private.record_private_progress_media_consent(uuid, uuid, text, text, text) to authenticated;

create or replace function public.record_private_progress_media_consent(
  target_tenant_id uuid,
  target_participant_id uuid,
  target_decision text,
  target_policy_version text,
  target_authority text default 'guardian'
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.record_private_progress_media_consent(
    target_tenant_id,
    target_participant_id,
    target_decision,
    target_policy_version,
    target_authority
  );
$$;

revoke all on function public.record_private_progress_media_consent(uuid, uuid, text, text, text) from public;
grant execute on function public.record_private_progress_media_consent(uuid, uuid, text, text, text) to authenticated;

create or replace function app_private.publish_private_progress_media(
  target_media_id uuid,
  target_actor_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  media_row public.participant_media%rowtype;
begin
  select * into media_row
  from public.participant_media
  where id = target_media_id
  for update;

  if not found or media_row.status <> 'draft' then
    return false;
  end if;

  if not exists (
      select 1
      from public.tenant_memberships membership
      where membership.tenant_id = media_row.tenant_id
        and membership.user_id = target_actor_user_id
        and membership.status = 'active'
        and membership.role in ('tenant_owner', 'tenant_admin')
    )
    or media_row.expires_at <= now()
    or media_row.malware_scan_status <> 'clean'
    or not app_private.participant_media_has_valid_consent(media_row.tenant_id, media_row.participant_id)
  then
    return false;
  end if;

  update public.participant_media
  set status = 'published',
      published_at = now(),
      published_by = target_actor_user_id,
      consent_checked_at = now()
  where id = target_media_id;

  insert into public.media_access_logs (tenant_id, media_id, viewer_profile_id, action, metadata_json)
  values (media_row.tenant_id, media_row.id, target_actor_user_id, 'publish', '{"confirmed":true}'::jsonb);

  return true;
end;
$$;

revoke all on function app_private.publish_private_progress_media(uuid, uuid) from public;
grant execute on function app_private.publish_private_progress_media(uuid, uuid) to service_role;

create or replace function public.publish_private_progress_media(
  target_media_id uuid,
  target_actor_user_id uuid
)
returns boolean
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.publish_private_progress_media(target_media_id, target_actor_user_id);
$$;

revoke all on function public.publish_private_progress_media(uuid, uuid) from public;
grant execute on function public.publish_private_progress_media(uuid, uuid) to service_role;

revoke insert, update, delete on public.media_consents from authenticated;
grant select on public.media_consents to authenticated;
grant select on public.participant_media to authenticated;
grant select on public.media_access_logs to authenticated;
grant all on public.media_consents to service_role;
grant all on public.participant_media to service_role;
grant all on public.media_consent_events to service_role;
grant all on public.media_access_logs to service_role;

alter table public.participant_media enable row level security;
alter table public.media_consent_events enable row level security;
alter table public.media_access_logs enable row level security;
alter table public.participant_media force row level security;
alter table public.media_consent_events force row level security;
alter table public.media_access_logs force row level security;

drop policy if exists "Guardians and tenant staff view media consent" on public.media_consents;
drop policy if exists "Guardians manage own media consent" on public.media_consents;
drop policy if exists "Tenant admins manage media consent" on public.media_consents;

create policy "Guardians and tenant admins view media consent"
  on public.media_consents
  for select
  to authenticated
  using (
    guardian_user_id = (select auth.uid())
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  );

create policy "Participant media is server-only"
  on public.participant_media
  for select
  to authenticated
  using (false);

create policy "Media access logs are server-only"
  on public.media_access_logs
  for select
  to authenticated
  using (false);

create policy "Guardians and tenant admins view media consent events"
  on public.media_consent_events
  for select
  to authenticated
  using (
    guardian_user_id = (select auth.uid())
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  );

grant select on public.media_consent_events to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'participant-media',
  'participant-media',
  false,
  20971520,
  array['image/jpeg', 'image/png']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

-- Deliberately no participant-media storage.objects policy. The service-role
-- proxy rechecks authenticated role, tenant, participant relationship,
-- consent, publication, scan evidence and expiry for every request.
