-- Session-bound parent/child portal separation. Child mode is a global state
-- for one Supabase auth session, never a free URL/query-string selection.

create table app_private.portal_session_contexts (
  session_id uuid primary key,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  mode text not null default 'child',
  context_version integer not null default 1,
  capabilities text[] not null,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  locked_at timestamptz,
  lock_reason text,
  revoked_at timestamptz,
  revoke_reason text,
  constraint portal_session_contexts_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint portal_session_contexts_mode_check check (mode = 'child'),
  constraint portal_session_contexts_version_check check (context_version = 1),
  constraint portal_session_contexts_capabilities_check check (
    capabilities = array[
      'today.read',
      'journey.read_child_safe',
      'badges.read_child_safe',
      'schedule.read_child_safe',
      'achievements.read_child_safe',
      'approved_media.read_child_safe',
      'child_preferences.write_safe',
      'parent_request.create_safe'
    ]::text[]
  ),
  constraint portal_session_contexts_expiry_check check (expires_at > activated_at),
  constraint portal_session_contexts_lock_check check (
    (locked_at is null and lock_reason is null)
    or (locked_at is not null and length(trim(lock_reason)) between 1 and 160)
  ),
  constraint portal_session_contexts_revoke_reason_check check (
    (revoked_at is null and revoke_reason is null)
    or (revoked_at is not null and length(trim(revoke_reason)) between 1 and 160)
  )
);

create unique index portal_session_contexts_active_participant_idx
  on app_private.portal_session_contexts (auth_user_id, tenant_id, participant_id, session_id)
  where revoked_at is null;

create index portal_session_contexts_expiry_idx
  on app_private.portal_session_contexts (expires_at)
  where revoked_at is null;

create table app_private.portal_parent_session_contexts (
  session_id uuid primary key,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  context_version integer not null default 1,
  initialized_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  constraint portal_parent_session_contexts_version_check check (context_version = 1)
);

create index portal_parent_session_contexts_user_tenant_idx
  on app_private.portal_parent_session_contexts (auth_user_id, tenant_id, session_id);

create table app_private.portal_session_audit_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid references public.participants (id) on delete set null,
  event_type text not null,
  context_version integer not null default 1,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint portal_session_audit_events_type_check check (
    event_type in (
      'child_context_started',
      'parent_context_initialized',
      'child_context_resolved',
      'child_context_revoked',
      'parent_reauth_required',
      'parent_reauth_completed',
      'child_request_created',
      'child_preference_changed',
      'child_media_approved',
      'child_media_approval_revoked'
    )
  ),
  constraint portal_session_audit_events_metadata_check check (
    jsonb_typeof(metadata_json) = 'object'
  )
);

create index portal_session_audit_lookup_idx
  on app_private.portal_session_audit_events (tenant_id, auth_user_id, created_at desc);

create table app_private.portal_reauth_challenges (
  id uuid primary key default gen_random_uuid(),
  old_session_id uuid not null,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  token_hash text not null unique,
  return_path text not null default '/portaal',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint portal_reauth_challenges_expiry_check check (
    expires_at > created_at and expires_at <= created_at + interval '5 minutes'
  ),
  constraint portal_reauth_challenges_return_path_check check (
    return_path = '/portaal' or return_path like '/portaal/%'
  ),
  constraint portal_reauth_challenges_token_hash_check check (token_hash ~ '^[a-f0-9]{64}$')
);

create table public.portal_child_preferences (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  reduced_motion boolean not null default false,
  celebrations_enabled boolean not null default true,
  sound_enabled boolean not null default false,
  read_aloud_enabled boolean not null default false,
  theme_key text,
  theme_release text,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid not null references auth.users (id) on delete cascade,
  primary key (tenant_id, participant_id),
  constraint portal_child_preferences_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint portal_child_preferences_theme_fk
    foreign key (theme_key, theme_release)
    references public.portal_theme_release (theme_key, release) on delete restrict,
  constraint portal_child_preferences_theme_pair_check check (
    (theme_key is null and theme_release is null)
    or (theme_key is not null and theme_release is not null)
  )
);

create table public.portal_parent_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  guardian_user_id uuid not null references auth.users (id) on delete cascade,
  source_session_id uuid not null,
  request_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid references auth.users (id) on delete set null,
  constraint portal_parent_requests_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint portal_parent_requests_type_check check (
    request_type in ('lesson_help', 'activity_interest', 'open_parent_portal')
  ),
  constraint portal_parent_requests_payload_check check (
    jsonb_typeof(payload_json) = 'object'
  ),
  constraint portal_parent_requests_idempotency_check check (
    length(idempotency_key) between 16 and 128
  ),
  constraint portal_parent_requests_status_check check (
    status in ('open', 'acknowledged', 'resolved', 'dismissed')
  ),
  unique (tenant_id, source_session_id, idempotency_key)
);

create table public.portal_child_media_approvals (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  media_id uuid not null,
  approved_by_guardian_user_id uuid not null references auth.users (id) on delete cascade,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_guardian_user_id uuid references auth.users (id) on delete set null,
  primary key (tenant_id, participant_id, media_id),
  constraint portal_child_media_approvals_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint portal_child_media_approvals_media_fk
    foreign key (tenant_id, media_id)
    references public.participant_media (tenant_id, id) on delete cascade,
  constraint portal_child_media_approvals_revocation_check check (
    (revoked_at is null and revoked_by_guardian_user_id is null)
    or (revoked_at is not null and revoked_by_guardian_user_id is not null)
  )
);

create index portal_parent_requests_rate_limit_idx
  on public.portal_parent_requests (tenant_id, guardian_user_id, created_at desc);

alter table public.portal_child_preferences enable row level security;
alter table public.portal_child_preferences force row level security;
alter table public.portal_parent_requests enable row level security;
alter table public.portal_parent_requests force row level security;
alter table public.portal_child_media_approvals enable row level security;
alter table public.portal_child_media_approvals force row level security;

revoke all on table app_private.portal_session_contexts from public, anon, authenticated;
revoke all on table app_private.portal_parent_session_contexts from public, anon, authenticated;
revoke all on table app_private.portal_session_audit_events from public, anon, authenticated;
revoke all on table app_private.portal_reauth_challenges from public, anon, authenticated;
revoke all on table public.portal_child_preferences from public, anon, authenticated;
revoke all on table public.portal_parent_requests from public, anon, authenticated;
revoke all on table public.portal_child_media_approvals from public, anon, authenticated;
grant all on table app_private.portal_session_contexts to service_role;
grant all on table app_private.portal_parent_session_contexts to service_role;
grant all on table app_private.portal_session_audit_events to service_role;
grant all on table app_private.portal_reauth_challenges to service_role;
grant all on table public.portal_child_preferences to service_role;
grant all on table public.portal_parent_requests to service_role;
grant all on table public.portal_child_media_approvals to service_role;
grant select on table public.portal_child_preferences to authenticated;
grant select on table public.portal_parent_requests to authenticated;
grant select on table public.portal_child_media_approvals to authenticated;

create policy portal_child_preferences_authenticated_deny
  on public.portal_child_preferences for all to authenticated
  using (false) with check (false);

create policy portal_parent_requests_authenticated_deny
  on public.portal_parent_requests for all to authenticated
  using (false) with check (false);

create policy portal_child_media_approvals_authenticated_deny
  on public.portal_child_media_approvals for all to authenticated
  using (false) with check (false);

insert into public.tenant_swim_rollouts (
  tenant_id,
  feature_key,
  status,
  readiness_json,
  config_json
)
select
  tenants.id,
  feature.key,
  'disabled',
  jsonb_build_object('security_reviewed', false, 'visual_matrix_reviewed', false),
  '{}'::jsonb
from public.tenants
cross join (
  values
    ('swim.portal.parent_child_split'),
    ('swim.portal.child_mode'),
    ('swim.portal.parent_requests'),
    ('swim.portal.direct_child_login')
) as feature (key)
on conflict (tenant_id, feature_key) do nothing;

create or replace function app_private.jwt_session_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  value text;
begin
  value := auth.jwt() ->> 'session_id';
  if value is null or value !~ '^[0-9a-fA-F-]{36}$' then
    return null;
  end if;
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function app_private.is_child_portal_session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app_private.portal_session_contexts context
    where context.session_id = app_private.jwt_session_id()
      and context.auth_user_id = auth.uid()
      and context.mode = 'child'
      and context.locked_at is null
      and context.revoked_at is null
      and context.expires_at > now()
      and exists (
        select 1 from public.tenant_memberships membership
        where membership.tenant_id = context.tenant_id
          and membership.user_id = context.auth_user_id
          and membership.status = 'active'
          and membership.role in ('parent', 'athlete')
      )
      and (
        exists (
          select 1 from public.participant_guardians guardian
          where guardian.tenant_id = context.tenant_id
            and guardian.participant_id = context.participant_id
            and guardian.guardian_user_id = context.auth_user_id
            and guardian.status = 'active'
            and guardian.access_level in ('primary', 'secondary')
        )
        or exists (
          select 1 from public.participants participant
          where participant.tenant_id = context.tenant_id
            and participant.id = context.participant_id
            and participant.guardian_user_id = context.auth_user_id
            and participant.status = 'active'
        )
      )
      and exists (
        select 1 from public.tenant_swim_rollouts rollout
        where rollout.tenant_id = context.tenant_id
          and rollout.feature_key = 'swim.portal.parent_child_split'
          and rollout.status in ('pilot', 'enabled')
      )
      and exists (
        select 1 from public.tenant_swim_rollouts rollout
        where rollout.tenant_id = context.tenant_id
          and rollout.feature_key = 'swim.portal.child_mode'
          and rollout.status in ('pilot', 'enabled')
      )
  );
$$;

create or replace function app_private.is_portal_session_restricted()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from app_private.portal_session_contexts context
      where context.session_id = app_private.jwt_session_id()
        and context.auth_user_id = auth.uid()
    )
    or (
      exists (
        select 1
        from public.tenant_memberships membership
        join public.tenant_swim_rollouts rollout
          on rollout.tenant_id = membership.tenant_id
         and rollout.feature_key = 'swim.portal.parent_child_split'
         and rollout.status in ('pilot', 'enabled')
        where membership.user_id = auth.uid()
          and membership.status = 'active'
          and membership.role in ('parent', 'athlete')
      )
      and not exists (
        select 1
        from app_private.portal_parent_session_contexts parent_context
        join auth.sessions session
          on session.id = parent_context.session_id
         and session.user_id = parent_context.auth_user_id
        join public.tenant_memberships membership
          on membership.tenant_id = parent_context.tenant_id
         and membership.user_id = parent_context.auth_user_id
         and membership.status = 'active'
         and membership.role in ('parent', 'athlete')
        where parent_context.session_id = app_private.jwt_session_id()
          and parent_context.auth_user_id = auth.uid()
      )
    );
$$;

create or replace function app_private.initialize_parent_portal_session_for_service(
  p_session_id uuid,
  p_user_id uuid,
  p_tenant_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_tenant_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text, 0));

  if not exists (
    select 1 from auth.sessions session
    where session.id = p_session_id and session.user_id = p_user_id
  ) then
    raise exception 'invalid_auth_session' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = p_tenant_id
      and membership.user_id = p_user_id
      and membership.status = 'active'
      and membership.role in ('parent', 'athlete')
  ) then
    return false;
  end if;
  if not exists (
    select 1 from public.tenant_swim_rollouts rollout
    where rollout.tenant_id = p_tenant_id
      and rollout.feature_key = 'swim.portal.parent_child_split'
      and rollout.status in ('pilot', 'enabled')
  ) then
    return false;
  end if;
  if exists (
    select 1 from app_private.portal_session_contexts context
    where context.session_id = p_session_id
  ) then
    return false;
  end if;

  select parent_context.tenant_id into previous_tenant_id
  from app_private.portal_parent_session_contexts parent_context
  where parent_context.session_id = p_session_id
  for update;

  insert into app_private.portal_parent_session_contexts (
    session_id, auth_user_id, tenant_id, context_version,
    initialized_at, last_verified_at
  ) values (
    p_session_id, p_user_id, p_tenant_id, 1, now(), now()
  ) on conflict (session_id) do update set
    tenant_id = excluded.tenant_id,
    last_verified_at = now();

  if previous_tenant_id is distinct from p_tenant_id then
    insert into app_private.portal_session_audit_events (
      session_id, auth_user_id, tenant_id, event_type
    ) values (
      p_session_id, p_user_id, p_tenant_id, 'parent_context_initialized'
    );
  end if;
  return true;
end;
$$;

create or replace function public.initialize_parent_portal_session_for_service(
  p_session_id uuid,
  p_user_id uuid,
  p_tenant_id uuid
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.initialize_parent_portal_session_for_service(
    p_session_id, p_user_id, p_tenant_id
  );
$$;

create or replace function app_private.portal_session_json(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select
      context.*,
      context.locked_at is null
        and context.revoked_at is null
        and context.expires_at > now()
        and exists (
          select 1 from public.tenant_memberships membership
          where membership.tenant_id = context.tenant_id
            and membership.user_id = context.auth_user_id
            and membership.status = 'active'
            and membership.role in ('parent', 'athlete')
        )
        and (
          exists (
            select 1 from public.participant_guardians guardian
            where guardian.tenant_id = context.tenant_id
              and guardian.participant_id = context.participant_id
              and guardian.guardian_user_id = context.auth_user_id
              and guardian.status = 'active'
              and guardian.access_level in ('primary', 'secondary')
          )
          or exists (
            select 1 from public.participants participant
            where participant.tenant_id = context.tenant_id
              and participant.id = context.participant_id
              and participant.guardian_user_id = context.auth_user_id
              and participant.status = 'active'
          )
        )
        and exists (
          select 1 from public.tenant_swim_rollouts rollout
          where rollout.tenant_id = context.tenant_id
            and rollout.feature_key = 'swim.portal.parent_child_split'
            and rollout.status in ('pilot', 'enabled')
        )
        and exists (
          select 1 from public.tenant_swim_rollouts rollout
          where rollout.tenant_id = context.tenant_id
            and rollout.feature_key = 'swim.portal.child_mode'
            and rollout.status in ('pilot', 'enabled')
        ) as is_active
    from app_private.portal_session_contexts context
    where context.session_id = p_session_id
      and context.auth_user_id = p_user_id
      and context.mode = 'child'
  )
  select jsonb_build_object(
    'mode', case when target.is_active then 'child' else 'locked' end,
    'sessionId', target.session_id,
    'userId', target.auth_user_id,
    'tenantId', target.tenant_id,
    'participantId', target.participant_id,
    'contextVersion', target.context_version,
    'capabilities', case when target.is_active then to_jsonb(target.capabilities) else '[]'::jsonb end,
    'expiresAt', target.expires_at,
    'lockedAt', case when target.is_active then null else coalesce(target.locked_at, target.revoked_at, target.expires_at, now()) end,
    'lockReason', case
      when target.is_active then null
      when target.lock_reason is not null then target.lock_reason
      when target.revoke_reason is not null then target.revoke_reason
      when target.expires_at <= now() then 'expired'
      else 'authorization_or_rollout_revoked'
    end
  )
  from target;
$$;

create or replace function app_private.resolve_current_portal_session()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.portal_session_json(app_private.jwt_session_id(), auth.uid());
$$;

create or replace function app_private.resolve_portal_session_for_service(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.portal_session_json(p_session_id, p_user_id);
$$;

create or replace function app_private.start_child_portal_session_for_service(
  p_session_id uuid,
  p_user_id uuid,
  p_tenant_id uuid,
  p_participant_id uuid,
  p_context_version integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_user_id uuid;
  ttl_minutes integer;
  required_capabilities constant text[] := array[
    'today.read',
    'journey.read_child_safe',
    'badges.read_child_safe',
    'schedule.read_child_safe',
    'achievements.read_child_safe',
    'approved_media.read_child_safe',
    'child_preferences.write_safe',
    'parent_request.create_safe'
  ]::text[];
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text, 0));

  if p_context_version <> 1 then
    raise exception 'unsupported_child_context_version' using errcode = '22023';
  end if;

  if not exists (
    select 1 from auth.sessions session
    where session.id = p_session_id and session.user_id = p_user_id
  ) then
    raise exception 'invalid_auth_session' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = p_tenant_id
      and membership.user_id = p_user_id
      and membership.status = 'active'
      and membership.role in ('parent', 'athlete')
  ) then
    raise exception 'parent_membership_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.participant_guardians guardian
    where guardian.tenant_id = p_tenant_id
      and guardian.participant_id = p_participant_id
      and guardian.guardian_user_id = p_user_id
      and guardian.status = 'active'
      and guardian.access_level in ('primary', 'secondary')
  ) and not exists (
    select 1 from public.participants participant
    where participant.tenant_id = p_tenant_id
      and participant.id = p_participant_id
      and participant.guardian_user_id = p_user_id
      and participant.status = 'active'
  ) then
    raise exception 'active_guardian_link_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.tenant_swim_rollouts rollout
    where rollout.tenant_id = p_tenant_id
      and rollout.feature_key = 'swim.portal.parent_child_split'
      and rollout.status in ('pilot', 'enabled')
  ) or not exists (
    select 1
    from public.tenant_swim_rollouts rollout
    where rollout.tenant_id = p_tenant_id
      and rollout.feature_key = 'swim.portal.child_mode'
      and rollout.status in ('pilot', 'enabled')
  ) then
    raise exception 'child_portal_feature_disabled' using errcode = '42501';
  end if;

  select case
    when rollout.config_json ->> 'absoluteTtlMinutes' ~ '^[0-9]{1,5}$'
      then (rollout.config_json ->> 'absoluteTtlMinutes')::integer
    else null
  end into ttl_minutes
  from public.tenant_swim_rollouts rollout
  where rollout.tenant_id = p_tenant_id
    and rollout.feature_key = 'swim.portal.child_mode';

  if ttl_minutes is null or ttl_minutes < 1 or ttl_minutes > 43200 then
    raise exception 'child_portal_ttl_not_configured' using errcode = '22023';
  end if;

  select context.auth_user_id into existing_user_id
  from app_private.portal_session_contexts context
  where context.session_id = p_session_id
  for update;

  if existing_user_id is not null then
    raise exception 'session_context_already_bound' using errcode = '42501';
  end if;

  delete from app_private.portal_parent_session_contexts parent_context
  where parent_context.session_id = p_session_id
    and parent_context.auth_user_id = p_user_id;

  insert into app_private.portal_session_contexts (
    session_id,
    auth_user_id,
    tenant_id,
    participant_id,
    mode,
    context_version,
    capabilities,
    activated_at,
    expires_at,
    locked_at,
    lock_reason,
    revoked_at,
    revoke_reason
  ) values (
    p_session_id,
    p_user_id,
    p_tenant_id,
    p_participant_id,
    'child',
    p_context_version,
    required_capabilities,
    now(),
    now() + make_interval(mins => ttl_minutes),
    null,
    null,
    null,
    null
  );

  insert into app_private.portal_session_audit_events (
    session_id, auth_user_id, tenant_id, participant_id, event_type
  ) values (
    p_session_id, p_user_id, p_tenant_id, p_participant_id, 'child_context_started'
  );

  return app_private.portal_session_json(p_session_id, p_user_id);
end;
$$;

create or replace function app_private.revoke_child_portal_session_for_service(
  p_session_id uuid,
  p_user_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked_context app_private.portal_session_contexts%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text, 0));

  update app_private.portal_session_contexts context
  set revoked_at = now(), revoke_reason = left(trim(p_reason), 160)
  where context.session_id = p_session_id
    and context.auth_user_id = p_user_id
    and context.locked_at is null
    and context.revoked_at is null
  returning context.* into revoked_context;

  if revoked_context.session_id is null then
    return false;
  end if;

  insert into app_private.portal_session_audit_events (
    session_id, auth_user_id, tenant_id, participant_id, event_type, metadata_json
  ) values (
    revoked_context.session_id,
    revoked_context.auth_user_id,
    revoked_context.tenant_id,
    revoked_context.participant_id,
    'child_context_revoked',
    jsonb_build_object('reason', revoked_context.revoke_reason)
  );
  return true;
end;
$$;

create or replace function public.resolve_current_portal_session()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.resolve_current_portal_session();
$$;

create or replace function public.resolve_portal_session_for_service(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.resolve_portal_session_for_service(p_session_id, p_user_id);
$$;

create or replace function public.start_child_portal_session_for_service(
  p_session_id uuid,
  p_user_id uuid,
  p_tenant_id uuid,
  p_participant_id uuid,
  p_context_version integer default 1
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.start_child_portal_session_for_service(
    p_session_id,
    p_user_id,
    p_tenant_id,
    p_participant_id,
    p_context_version
  );
$$;

create or replace function public.revoke_child_portal_session_for_service(
  p_session_id uuid,
  p_user_id uuid,
  p_reason text
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.revoke_child_portal_session_for_service(p_session_id, p_user_id, p_reason);
$$;

create or replace function app_private.issue_portal_reauth_challenge_for_service(
  p_old_session_id uuid,
  p_user_id uuid,
  p_tenant_id uuid,
  p_token_hash text,
  p_return_path text default '/portaal'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_id uuid;
  target_participant_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_old_session_id::text, 0));

  if p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_reauth_token_hash' using errcode = '22023';
  end if;
  if p_return_path <> '/portaal' and p_return_path not like '/portaal/%' then
    raise exception 'invalid_reauth_return_path' using errcode = '22023';
  end if;

  select context.participant_id into target_participant_id
  from app_private.portal_session_contexts context
  where context.session_id = p_old_session_id
    and context.auth_user_id = p_user_id
    and context.tenant_id = p_tenant_id
    and context.locked_at is null
    and context.revoked_at is null
    and context.expires_at > now()
  for update;

  if target_participant_id is null then
    raise exception 'child_context_required' using errcode = '42501';
  end if;

  update app_private.portal_session_contexts context
  set locked_at = now(), lock_reason = 'parent_reauth_required'
  where context.session_id = p_old_session_id
    and context.auth_user_id = p_user_id;

  insert into app_private.portal_reauth_challenges (
    old_session_id,
    auth_user_id,
    tenant_id,
    token_hash,
    return_path,
    expires_at
  ) values (
    p_old_session_id,
    p_user_id,
    p_tenant_id,
    p_token_hash,
    p_return_path,
    now() + interval '5 minutes'
  ) returning id into challenge_id;

  insert into app_private.portal_session_audit_events (
    session_id, auth_user_id, tenant_id, participant_id, event_type
  ) values (
    p_old_session_id, p_user_id, p_tenant_id, target_participant_id, 'parent_reauth_required'
  );

  return challenge_id;
end;
$$;

create or replace function app_private.consume_portal_reauth_challenge_for_service(
  p_user_id uuid,
  p_token_hash text,
  p_new_session_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge app_private.portal_reauth_challenges%rowtype;
begin
  if p_new_session_id is null or p_new_session_id = (
    select target.old_session_id
    from app_private.portal_reauth_challenges target
    where target.auth_user_id = p_user_id and target.token_hash = p_token_hash
    limit 1
  ) or not exists (
    select 1 from auth.sessions session
    where session.id = p_new_session_id and session.user_id = p_user_id
  ) or exists (
    select 1 from app_private.portal_session_contexts context
    where context.session_id = p_new_session_id
  ) then
    return null;
  end if;

  update app_private.portal_reauth_challenges target
  set consumed_at = now()
  where target.auth_user_id = p_user_id
    and target.token_hash = p_token_hash
    and target.consumed_at is null
    and target.expires_at > now()
  returning target.* into challenge;

  if challenge.id is null then
    return null;
  end if;

  insert into app_private.portal_session_audit_events (
    session_id, auth_user_id, tenant_id, event_type, metadata_json
  ) values (
    challenge.old_session_id,
    challenge.auth_user_id,
    challenge.tenant_id,
    'parent_reauth_completed',
    jsonb_build_object('newSessionId', p_new_session_id)
  );

  return challenge.return_path;
end;
$$;

create or replace function public.issue_portal_reauth_challenge_for_service(
  p_old_session_id uuid,
  p_user_id uuid,
  p_tenant_id uuid,
  p_token_hash text,
  p_return_path text default '/portaal'
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.issue_portal_reauth_challenge_for_service(
    p_old_session_id, p_user_id, p_tenant_id, p_token_hash, p_return_path
  );
$$;

create or replace function public.consume_portal_reauth_challenge_for_service(
  p_user_id uuid,
  p_token_hash text,
  p_new_session_id uuid
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.consume_portal_reauth_challenge_for_service(
    p_user_id, p_token_hash, p_new_session_id
  );
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

create or replace function app_private.create_child_parent_request_for_service(
  p_session_id uuid,
  p_user_id uuid,
  p_tenant_id uuid,
  p_participant_id uuid,
  p_request_type text,
  p_payload_json jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
  resource_key text;
begin
  if not exists (
    select 1 from app_private.portal_session_contexts context
    where context.session_id = p_session_id
      and context.auth_user_id = p_user_id
      and context.tenant_id = p_tenant_id
      and context.participant_id = p_participant_id
      and context.locked_at is null
      and context.revoked_at is null
      and context.expires_at > now()
      and 'parent_request.create_safe' = any(context.capabilities)
  ) then
    raise exception 'parent_request_capability_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.tenant_swim_rollouts rollout
    where rollout.tenant_id = p_tenant_id
      and rollout.feature_key = 'swim.portal.parent_requests'
      and rollout.status in ('pilot', 'enabled')
  ) then
    raise exception 'parent_requests_feature_disabled' using errcode = '42501';
  end if;

  if p_request_type not in ('lesson_help', 'activity_interest', 'open_parent_portal')
    or jsonb_typeof(p_payload_json) <> 'object'
    or exists (
      select 1 from jsonb_object_keys(p_payload_json) as payload_key(key)
      where payload_key.key not in ('lessonId', 'activityId')
    )
    or (p_payload_json ? 'lessonId' and (p_payload_json ->> 'lessonId') !~ '^[0-9a-fA-F-]{36}$')
    or (p_payload_json ? 'activityId' and (p_payload_json ->> 'activityId') !~ '^[0-9a-fA-F-]{36}$')
    or (p_request_type = 'lesson_help' and not (
      p_payload_json ? 'lessonId' and not (p_payload_json ? 'activityId')
    ))
    or (p_request_type = 'activity_interest' and not (
      p_payload_json ? 'activityId' and not (p_payload_json ? 'lessonId')
    ))
    or (p_request_type = 'open_parent_portal' and p_payload_json <> '{}'::jsonb)
  then
    raise exception 'invalid_structured_parent_request' using errcode = '22023';
  end if;

  if p_request_type = 'lesson_help' and not (
    exists (
      select 1
      from public.sessions session
      join public.group_memberships membership
        on membership.tenant_id = session.tenant_id
       and membership.group_id = session.group_id
       and membership.participant_id = p_participant_id
       and membership.status in ('active', 'trial')
      where session.tenant_id = p_tenant_id
        and session.id = (p_payload_json ->> 'lessonId')::uuid
        and session.status = 'scheduled'
        and session.ends_at > now()
    )
    or exists (
      select 1
      from public.graduation_events event
      join public.graduation_event_participants invite
        on invite.tenant_id = event.tenant_id
       and invite.event_id = event.id
       and invite.participant_id = p_participant_id
       and invite.invite_status = 'confirmed'
       and invite.status in ('confirmed', 'invited')
      where event.tenant_id = p_tenant_id
        and event.id = (p_payload_json ->> 'lessonId')::uuid
        and event.status = 'published'
        and event.ends_at > now()
    )
  ) then
    raise exception 'current_child_lesson_required' using errcode = '22023';
  end if;

  if p_request_type = 'activity_interest' and not exists (
    select 1
    from public.sessions session
    join public.groups target_group
      on target_group.tenant_id = session.tenant_id
     and target_group.id = session.group_id
     and target_group.status = 'active'
     and target_group.offering_type in ('vacation_course', 'turbo_course', 'temporary_series')
    join public.group_memberships membership
      on membership.tenant_id = session.tenant_id
     and membership.group_id = session.group_id
     and membership.participant_id = p_participant_id
     and membership.status in ('active', 'trial')
    where session.tenant_id = p_tenant_id
      and session.id = (p_payload_json ->> 'activityId')::uuid
      and session.status = 'scheduled'
      and session.ends_at > now()
  ) then
    raise exception 'published_child_activity_required' using errcode = '22023';
  end if;

  resource_key := case
    when p_request_type = 'lesson_help' then p_payload_json ->> 'lessonId'
    when p_request_type = 'activity_interest' then p_payload_json ->> 'activityId'
    else p_participant_id::text
  end;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_tenant_id::text || ':' || p_participant_id::text || ':' || p_request_type || ':' || resource_key,
      0
    )
  );

  select request.id into request_id
  from public.portal_parent_requests request
  where request.tenant_id = p_tenant_id
    and request.participant_id = p_participant_id
    and request.guardian_user_id = p_user_id
    and request.request_type = p_request_type
    and request.payload_json = p_payload_json
    and request.status in ('open', 'acknowledged')
  order by request.created_at desc
  limit 1;

  if request_id is not null then
    return request_id;
  end if;

  if (
    select count(*)
    from public.portal_parent_requests request
    where request.tenant_id = p_tenant_id
      and request.guardian_user_id = p_user_id
      and request.created_at > now() - interval '1 hour'
  ) >= 3 then
    raise exception 'parent_request_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.portal_parent_requests (
    tenant_id,
    participant_id,
    guardian_user_id,
    source_session_id,
    request_type,
    payload_json,
    idempotency_key
  ) values (
    p_tenant_id,
    p_participant_id,
    p_user_id,
    p_session_id,
    p_request_type,
    p_payload_json,
    p_idempotency_key
  ) on conflict (tenant_id, source_session_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into request_id;

  insert into app_private.portal_session_audit_events (
    session_id, auth_user_id, tenant_id, participant_id, event_type,
    metadata_json
  ) values (
    p_session_id, p_user_id, p_tenant_id, p_participant_id,
    'child_request_created',
    jsonb_build_object('requestId', request_id, 'requestType', p_request_type)
  );
  return request_id;
end;
$$;

create or replace function app_private.set_child_media_approval_for_service(
  p_session_id uuid,
  p_user_id uuid,
  p_tenant_id uuid,
  p_participant_id uuid,
  p_media_id uuid,
  p_approved boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text, 0));

  if not exists (
    select 1 from auth.sessions session
    where session.id = p_session_id and session.user_id = p_user_id
  ) then
    raise exception 'invalid_auth_session' using errcode = '42501';
  end if;

  if exists (
    select 1 from app_private.portal_session_contexts context
    where context.session_id = p_session_id
  ) then
    raise exception 'parent_session_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.participant_guardians guardian
    where guardian.tenant_id = p_tenant_id
      and guardian.participant_id = p_participant_id
      and guardian.guardian_user_id = p_user_id
      and guardian.status = 'active'
      and guardian.access_level in ('primary', 'secondary')
  ) and not exists (
    select 1
    from public.participants participant
    where participant.tenant_id = p_tenant_id
      and participant.id = p_participant_id
      and participant.guardian_user_id = p_user_id
  ) then
    raise exception 'mutable_guardian_link_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.tenant_swim_rollouts rollout
    where rollout.tenant_id = p_tenant_id
      and rollout.feature_key = 'swim.portal.child_mode'
      and rollout.status in ('pilot', 'enabled')
  ) then
    raise exception 'child_portal_feature_disabled' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.participant_media media
    where media.tenant_id = p_tenant_id
      and media.participant_id = p_participant_id
      and media.id = p_media_id
      and media.status = 'published'
      and media.expires_at > now()
      and media.malware_scan_status in ('clean', 'not_required')
  ) then
    raise exception 'published_media_required' using errcode = '22023';
  end if;

  if p_approved then
    insert into public.portal_child_media_approvals (
      tenant_id, participant_id, media_id, approved_by_guardian_user_id,
      approved_at, revoked_at, revoked_by_guardian_user_id
    ) values (
      p_tenant_id, p_participant_id, p_media_id, p_user_id,
      now(), null, null
    ) on conflict (tenant_id, participant_id, media_id) do update set
      approved_by_guardian_user_id = excluded.approved_by_guardian_user_id,
      approved_at = excluded.approved_at,
      revoked_at = null,
      revoked_by_guardian_user_id = null;
  else
    update public.portal_child_media_approvals approval
      set revoked_at = now(), revoked_by_guardian_user_id = p_user_id
    where approval.tenant_id = p_tenant_id
      and approval.participant_id = p_participant_id
      and approval.media_id = p_media_id
      and approval.revoked_at is null;
    if not found then
      raise exception 'active_media_approval_required' using errcode = '22023';
    end if;
  end if;

  insert into app_private.portal_session_audit_events (
    session_id, auth_user_id, tenant_id, participant_id, event_type,
    metadata_json
  ) values (
    p_session_id, p_user_id, p_tenant_id, p_participant_id,
    case when p_approved then 'child_media_approved' else 'child_media_approval_revoked' end,
    jsonb_build_object('mediaId', p_media_id)
  );
  return true;
end;
$$;

create or replace function public.save_child_portal_preferences_for_service(
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
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.save_child_portal_preferences_for_service(
    p_session_id, p_user_id, p_tenant_id, p_participant_id,
    p_reduced_motion, p_celebrations_enabled, p_sound_enabled,
    p_read_aloud_enabled, p_theme_key, p_theme_release
  );
$$;

create or replace function public.create_child_parent_request_for_service(
  p_session_id uuid,
  p_user_id uuid,
  p_tenant_id uuid,
  p_participant_id uuid,
  p_request_type text,
  p_payload_json jsonb,
  p_idempotency_key text
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.create_child_parent_request_for_service(
    p_session_id, p_user_id, p_tenant_id, p_participant_id,
    p_request_type, p_payload_json, p_idempotency_key
  );
$$;

create or replace function public.set_child_media_approval_for_service(
  p_session_id uuid,
  p_user_id uuid,
  p_tenant_id uuid,
  p_participant_id uuid,
  p_media_id uuid,
  p_approved boolean
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  select app_private.set_child_media_approval_for_service(
    p_session_id, p_user_id, p_tenant_id, p_participant_id,
    p_media_id, p_approved
  );
$$;

create or replace function app_private.enforce_portal_session_data_api()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_path text := coalesce(current_setting('request.path', true), '');
begin
  if app_private.is_portal_session_restricted()
    and request_path <> '/rpc/resolve_current_portal_session' then
    raise exception 'child_session_data_api_blocked' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app_private.jwt_session_id() from public, anon;
revoke all on function app_private.is_child_portal_session_active() from public, anon;
revoke all on function app_private.is_portal_session_restricted() from public, anon;
revoke all on function app_private.portal_session_json(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.enforce_portal_session_data_api() from public, anon;
revoke all on function app_private.resolve_current_portal_session() from public, anon;
revoke all on function app_private.resolve_portal_session_for_service(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.initialize_parent_portal_session_for_service(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.start_child_portal_session_for_service(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function app_private.revoke_child_portal_session_for_service(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.issue_portal_reauth_challenge_for_service(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function app_private.consume_portal_reauth_challenge_for_service(uuid, text, uuid) from public, anon, authenticated;
revoke all on function app_private.save_child_portal_preferences_for_service(uuid, uuid, uuid, uuid, boolean, boolean, boolean, boolean, text, text) from public, anon, authenticated;
revoke all on function app_private.create_child_parent_request_for_service(uuid, uuid, uuid, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function app_private.set_child_media_approval_for_service(uuid, uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function app_private.jwt_session_id() to authenticated, service_role;
grant execute on function app_private.is_child_portal_session_active() to authenticated, service_role;
grant execute on function app_private.is_portal_session_restricted() to authenticated, service_role;
grant execute on function app_private.enforce_portal_session_data_api() to authenticated, service_role;
grant execute on function app_private.resolve_current_portal_session() to authenticated, service_role;
grant execute on function app_private.resolve_portal_session_for_service(uuid, uuid) to service_role;
grant execute on function app_private.initialize_parent_portal_session_for_service(uuid, uuid, uuid) to service_role;
grant execute on function app_private.start_child_portal_session_for_service(uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function app_private.revoke_child_portal_session_for_service(uuid, uuid, text) to service_role;
grant execute on function app_private.issue_portal_reauth_challenge_for_service(uuid, uuid, uuid, text, text) to service_role;
grant execute on function app_private.consume_portal_reauth_challenge_for_service(uuid, text, uuid) to service_role;
grant execute on function app_private.save_child_portal_preferences_for_service(uuid, uuid, uuid, uuid, boolean, boolean, boolean, boolean, text, text) to service_role;
grant execute on function app_private.create_child_parent_request_for_service(uuid, uuid, uuid, uuid, text, jsonb, text) to service_role;
grant execute on function app_private.set_child_media_approval_for_service(uuid, uuid, uuid, uuid, uuid, boolean) to service_role;

revoke all on function public.resolve_current_portal_session() from public, anon;
grant execute on function public.resolve_current_portal_session() to authenticated;

revoke all on function public.resolve_portal_session_for_service(uuid, uuid) from public, anon, authenticated;
revoke all on function public.initialize_parent_portal_session_for_service(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_child_portal_session_for_service(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.revoke_child_portal_session_for_service(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_portal_session_for_service(uuid, uuid) to service_role;
grant execute on function public.initialize_parent_portal_session_for_service(uuid, uuid, uuid) to service_role;
grant execute on function public.start_child_portal_session_for_service(uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function public.revoke_child_portal_session_for_service(uuid, uuid, text) to service_role;
revoke all on function public.issue_portal_reauth_challenge_for_service(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.consume_portal_reauth_challenge_for_service(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.issue_portal_reauth_challenge_for_service(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.consume_portal_reauth_challenge_for_service(uuid, text, uuid) to service_role;
revoke all on function public.save_child_portal_preferences_for_service(uuid, uuid, uuid, uuid, boolean, boolean, boolean, boolean, text, text) from public, anon, authenticated;
revoke all on function public.create_child_parent_request_for_service(uuid, uuid, uuid, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.set_child_media_approval_for_service(uuid, uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.save_child_portal_preferences_for_service(uuid, uuid, uuid, uuid, boolean, boolean, boolean, boolean, text, text) to service_role;
grant execute on function public.create_child_parent_request_for_service(uuid, uuid, uuid, uuid, text, jsonb, text) to service_role;
grant execute on function public.set_child_media_approval_for_service(uuid, uuid, uuid, uuid, uuid, boolean) to service_role;

do $$
declare
  table_row record;
begin
  for table_row in
    select namespace.nspname as schema_name, relation.relname as table_name
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity
  loop
    execute format(
      'drop policy if exists portal_child_session_restrictive on %I.%I',
      table_row.schema_name,
      table_row.table_name
    );
    execute format(
      'create policy portal_child_session_restrictive on %I.%I as restrictive for all to authenticated using (not app_private.is_portal_session_restricted()) with check (not app_private.is_portal_session_restricted())',
      table_row.schema_name,
      table_row.table_name
    );
  end loop;
end;
$$;

drop policy if exists portal_child_session_restrictive on storage.objects;
create policy portal_child_session_restrictive
  on storage.objects as restrictive for all to authenticated
  using (not app_private.is_portal_session_restricted())
  with check (not app_private.is_portal_session_restricted());

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists portal_child_session_restrictive on realtime.messages';
    execute 'create policy portal_child_session_restrictive on realtime.messages as restrictive for all to authenticated using (not app_private.is_portal_session_restricted()) with check (not app_private.is_portal_session_restricted())';
  end if;
end;
$$;

alter role authenticator set pgrst.db_pre_request = 'app_private.enforce_portal_session_data_api';
notify pgrst, 'reload config';

comment on table app_private.portal_session_contexts is
  'Server-owned, JWT session_id-bound child-mode lock with persistent locked/revoked tombstones. Only genuine absence means parent mode.';
comment on table app_private.portal_parent_session_contexts is
  'Server-verified parent initialization for rollout tenants; a direct Data API request cannot create or select this context.';
comment on function app_private.enforce_portal_session_data_api() is
  'Fail-closed PostgREST guard: child, expired, locked and revoked sessions may only resolve their own portal context.';
comment on table public.portal_parent_requests is
  'Structured, idempotent child-to-parent requests; no free-form message or arbitrary command payload.';
