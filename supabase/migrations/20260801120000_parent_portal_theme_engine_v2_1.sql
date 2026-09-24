-- NXTTRACK Parent Portal Theme Engine v2.1
-- Five immutable launch themes and an explicit five-point learner assessment contract.

create table public.portal_theme (
  theme_key text primary key,
  display_name text not null,
  description text not null,
  created_at timestamptz not null default now(),
  constraint portal_theme_key_check check (theme_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.portal_theme_release (
  theme_key text not null references public.portal_theme (theme_key) on delete restrict,
  release text not null,
  status text not null,
  portal_contract text not null,
  manifest_schema_version integer not null,
  manifest_json jsonb not null,
  content_hash text not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (theme_key, release),
  constraint portal_theme_release_semver_check check (release ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  constraint portal_theme_release_status_check check (status in ('draft', 'review', 'published', 'deprecated')),
  constraint portal_theme_release_contract_check check (portal_contract = 'parent-portal/1.1'),
  constraint portal_theme_release_schema_check check (manifest_schema_version = 2),
  constraint portal_theme_release_manifest_check check (jsonb_typeof(manifest_json) = 'object'),
  constraint portal_theme_release_hash_check check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint portal_theme_release_published_check check ((status = 'published') = (published_at is not null))
);

create table public.portal_theme_asset (
  theme_key text not null,
  theme_release text not null,
  slot text not null,
  asset_path text not null,
  content_hash text not null,
  mime_type text not null,
  intrinsic_width integer not null,
  intrinsic_height integer not null,
  is_decorative boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (theme_key, theme_release, slot),
  foreign key (theme_key, theme_release) references public.portal_theme_release (theme_key, release) on delete restrict,
  constraint portal_theme_asset_slot_check check (slot ~ '^[a-z]+(\.[a-z-]+)+$'),
  constraint portal_theme_asset_path_check check (asset_path ~ '^/portal-themes/[a-z0-9/_\.-]+$'),
  constraint portal_theme_asset_hash_check check (content_hash ~ '^[a-f0-9]{64}$'),
  constraint portal_theme_asset_mime_check check (mime_type in ('image/avif', 'image/webp', 'image/png')),
  constraint portal_theme_asset_dimensions_check check (intrinsic_width > 0 and intrinsic_height > 0)
);

create table public.portal_badge_family_release (
  family_key text not null,
  release text not null,
  theme_key text not null,
  status text not null,
  fallback_recipe text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  primary key (family_key, release),
  foreign key (theme_key) references public.portal_theme (theme_key) on delete restrict,
  constraint portal_badge_family_key_check check (family_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint portal_badge_family_semver_check check (release ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  constraint portal_badge_family_status_check check (status in ('review', 'published', 'deprecated')),
  constraint portal_badge_family_hash_check check (content_hash ~ '^[a-f0-9]{64}$')
);

create table public.tenant_portal_theme_assignment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  theme_key text not null,
  theme_release text not null,
  activated_at timestamptz not null default now(),
  activated_by_platform_admin_id uuid not null references auth.users (id) on delete restrict,
  previous_assignment_id uuid references public.tenant_portal_theme_assignment (id) on delete set null,
  reason text not null,
  ticket_reference text,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (theme_key, theme_release) references public.portal_theme_release (theme_key, release) on delete restrict,
  constraint tenant_portal_theme_assignment_reason_check check (length(trim(reason)) between 3 and 1000),
  constraint tenant_portal_theme_assignment_ticket_check check (ticket_reference is null or length(ticket_reference) <= 160)
);

create unique index tenant_portal_theme_one_active_idx
  on public.tenant_portal_theme_assignment (tenant_id)
  where deactivated_at is null;

create index tenant_portal_theme_history_idx
  on public.tenant_portal_theme_assignment (tenant_id, activated_at desc);

create table public.tenant_portal_theme_schedule (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  theme_key text not null,
  theme_release text not null,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled',
  reason text not null,
  ticket_reference text,
  created_by_platform_admin_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  cancelled_at timestamptz,
  foreign key (theme_key, theme_release) references public.portal_theme_release (theme_key, release) on delete restrict,
  constraint tenant_portal_theme_schedule_status_check check (status in ('scheduled', 'executed', 'cancelled', 'failed')),
  constraint tenant_portal_theme_schedule_reason_check check (length(trim(reason)) between 3 and 1000),
  constraint tenant_portal_theme_schedule_future_check check (scheduled_for > created_at)
);

create unique index tenant_portal_theme_one_schedule_idx
  on public.tenant_portal_theme_schedule (tenant_id)
  where status = 'scheduled';

create table public.portal_theme_audit_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete set null,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  event_type text not null,
  previous_theme_key text,
  previous_theme_release text,
  next_theme_key text,
  next_theme_release text,
  reason text not null,
  ticket_reference text,
  request_correlation_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint portal_theme_audit_type_check check (event_type in ('previewed', 'scheduled', 'activated', 'rolled_back', 'schedule_cancelled', 'fallback_used')),
  constraint portal_theme_audit_metadata_check check (jsonb_typeof(metadata_json) = 'object')
);

create index portal_theme_audit_tenant_created_idx
  on public.portal_theme_audit_event (tenant_id, created_at desc);

-- Tenant-wide presentation only; it never changes the stored assessment meaning.
alter table public.tenant_settings
  add column assessment_rating_display text not null default 'smileys';

alter table public.tenant_settings
  add constraint tenant_settings_assessment_rating_display_check
  check (assessment_rating_display in ('smileys', 'stars'));

-- Existing rows originate from a table that has enforced 1..5 since its creation.
-- Explicit legacy candidates are handled separately below and never inferred from score alone.
alter table public.participant_progress_scores
  add column scale_version text,
  add column source_scale_version text,
  add column source_value integer;

update public.participant_progress_scores
set
  scale_version = 'five_point_v1',
  source_scale_version = 'five_point_v1',
  source_value = null
where scale_version is null;

alter table public.participant_progress_scores
  alter column scale_version set not null,
  alter column source_scale_version set not null,
  add constraint participant_progress_scores_scale_version_check check (scale_version = 'five_point_v1'),
  add constraint participant_progress_scores_source_scale_check check (source_scale_version in ('five_point_v1', 'three_point_legacy')),
  add constraint participant_progress_scores_source_value_check check (
    (source_scale_version = 'five_point_v1' and source_value is null)
    or (source_scale_version = 'three_point_legacy' and source_value between 1 and 3)
  );

-- Authenticated clients may read through RLS, but assessment writes must go through
-- the current server command so clients that omit five_point_v1 cannot keep writing.
revoke insert, update on public.participant_progress_scores from authenticated;

create table public.learner_assessment_legacy_source (
  progress_score_id uuid primary key references public.participant_progress_scores (id) on delete restrict,
  source_value integer not null,
  source_context text not null,
  detected_at timestamptz not null default now(),
  detected_by_user_id uuid references auth.users (id) on delete set null,
  migrated_at timestamptz,
  migrated_rating_value integer,
  constraint learner_assessment_legacy_source_value_check check (source_value between 1 and 3),
  constraint learner_assessment_legacy_context_check check (length(trim(source_context)) between 3 and 1000),
  constraint learner_assessment_legacy_migrated_value_check check (migrated_rating_value is null or migrated_rating_value in (1, 3, 5))
);

create function app_private.migrate_legacy_three_point_assessments()
returns table (migrated_count bigint, source_average numeric, normalized_average numeric)
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  affected bigint;
begin
  with candidates as (
    select source.progress_score_id, source.source_value,
      case source.source_value when 1 then 1 when 2 then 3 when 3 then 5 end as target_value
    from public.learner_assessment_legacy_source source
    where source.migrated_at is null
    for update
  ),
  updated as (
    update public.participant_progress_scores score
    set
      score = candidate.target_value,
      scale_version = 'five_point_v1',
      source_scale_version = 'three_point_legacy',
      source_value = candidate.source_value,
      positive_label = case candidate.target_value
        when 1 then 'Goed begonnen'
        when 3 then 'Mooi op weg'
        when 5 then 'Superster'
      end,
      updated_at = now()
    from candidates candidate
    where score.id = candidate.progress_score_id
    returning score.id, score.score, score.source_value
  )
  update public.learner_assessment_legacy_source source
  set
    migrated_at = now(),
    migrated_rating_value = updated.score
  from updated
  where source.progress_score_id = updated.id;

  get diagnostics affected = row_count;
  return query
  select
    affected,
    avg(source.source_value)::numeric,
    avg(((source.migrated_rating_value - 1)::numeric / 4) * 100)::numeric
  from public.learner_assessment_legacy_source source
  where source.migrated_at is not null;
end;
$$;

revoke all on function app_private.migrate_legacy_three_point_assessments() from public, anon, authenticated;
grant execute on function app_private.migrate_legacy_three_point_assessments() to service_role;

insert into public.portal_theme (theme_key, display_name, description) values
  ('nxttrack-default', 'NXTTRACK Default', 'Heldere, speels-professionele zwemschoolbasis.'),
  ('ocean-quest', 'Ocean Quest', 'Avontuurlijke parel- en eilandreis.'),
  ('dolphin-bay', 'Dolphin Bay', 'Zonnige, sociale en energieke boeienroute.'),
  ('turtle-trails', 'Turtle Trails', 'Rustige, veilige zwemtrail met schelpstappen.'),
  ('aqua-academy', 'Aqua Academy', 'Strakke, sportieve zwemacademie met checkpoints.')
on conflict (theme_key) do update
set display_name = excluded.display_name, description = excluded.description;

insert into public.portal_theme_release (
  theme_key, release, status, portal_contract, manifest_schema_version, manifest_json, content_hash, published_at
) values
  ('nxttrack-default', '2.2.2', 'published', 'parent-portal/1.1', 2, '{"registry":"web-build","assessmentScale":"five_point_v1"}', '2bca548cc63c01db6ec0796cfe0b4fe1b9339757b8bb1f0521832f420500b483', now()),
  ('ocean-quest', '1.2.2', 'published', 'parent-portal/1.1', 2, '{"registry":"web-build","assessmentScale":"five_point_v1"}', 'cab14d61c2b4d0561eb4a2cc48a9d8a89f74502507a87bc27d54a27f269f13be', now()),
  ('dolphin-bay', '1.0.1', 'published', 'parent-portal/1.1', 2, '{"registry":"web-build","assessmentScale":"five_point_v1"}', 'ef966803c76ef4feaf0ee16ea354cec143c3c343b83dfdeed0a75a92aad42e10', now()),
  ('turtle-trails', '1.0.1', 'published', 'parent-portal/1.1', 2, '{"registry":"web-build","assessmentScale":"five_point_v1"}', '33aa90e5e638f094533028d9c37be16a1c07b4d44c84f187e3bbf354883813b4', now()),
  ('aqua-academy', '1.0.1', 'published', 'parent-portal/1.1', 2, '{"registry":"web-build","assessmentScale":"five_point_v1"}', '7aecbd597126c8a1e1c439905dfc3c37e49c884609e44e0d40ca3ac7f70176f2', now())
on conflict (theme_key, release) do nothing;

insert into public.portal_badge_family_release (
  family_key, release, theme_key, status, fallback_recipe, content_hash, published_at
) values
  ('nxttrack-default-medallions', '1.0.0', 'nxttrack-default', 'review', 'badge-fallback/default-medallion-v1', '73bb5d8c99a8c9e994a04abb5ad176fde854736a89587e5b530b041f08735d79', null),
  ('ocean-quest-medallions', '1.0.0', 'ocean-quest', 'published', 'badge-fallback/ocean-medallion-v1', 'a0b99f7be532e2ec71c93c3dacd0cd0c4e7a3c1e8113d277756000a976746b1b', now()),
  ('dolphin-bay-medallions', '1.0.0', 'dolphin-bay', 'review', 'badge-fallback/bay-medallion-v1', 'ea49f63c42e7ea5f389561347690443622f11811c54402241fbd82fc0c2f3d65', null),
  ('turtle-trails-scutes', '1.0.0', 'turtle-trails', 'review', 'badge-fallback/turtle-scute-v1', '882509dc3ec95d74496f1f2aa8f5544e22d384590f80a79161d0932a6cfbabae', null),
  ('aqua-academy-crests', '1.0.0', 'aqua-academy', 'review', 'badge-fallback/academy-crest-v1', 'd6dd830a70f1fa868474f5460b599e94f67dc9cb8658ce2417c6f1b3d73c4e6a', null)
on conflict (family_key, release) do nothing;

insert into public.portal_theme_asset (
  theme_key, theme_release, slot, asset_path, content_hash, mime_type, intrinsic_width, intrinsic_height
) values
  ('nxttrack-default', '2.2.2', 'overview.hero.desktop', '/portal-themes/nxttrack-default/overview-landscape-1440.webp', 'a6fa038007e31e549d8dd2db3e7e4aae38780666551bbd6bd75eae1756945cda', 'image/webp', 1440, 810),
  ('ocean-quest', '1.2.2', 'overview.hero.desktop', '/portal-themes/ocean-quest/overview-landscape-1440.webp', 'de9175ba78c56e0a050606a703cc3bac47f2ffd96783bf72ca2dbac5ffe59816', 'image/webp', 1440, 810),
  ('ocean-quest', '1.2.2', 'overview.hero.mobile', '/portal-themes/ocean-quest/overview-portrait-640.webp', 'cc4146c25d2ef04fec30f13fec851811024cfb65572bf12865d4a64dd09db08e', 'image/webp', 640, 1001),
  ('dolphin-bay', '1.0.1', 'overview.hero.desktop', '/portal-themes/dolphin-bay/overview-landscape-1440.webp', 'fd594669bba0a25815861e68af92289ced10a14a64c082157134b813151dc11e', 'image/webp', 1440, 810),
  ('dolphin-bay', '1.0.1', 'overview.hero.mobile', '/portal-themes/dolphin-bay/overview-portrait-640.webp', 'a3e13396ed88e0997a602c3b816a119c3479783694db33532fb8a7430c682d2d', 'image/webp', 640, 1137),
  ('turtle-trails', '1.0.1', 'overview.hero.desktop', '/portal-themes/turtle-trails/overview-landscape-1440.webp', '4e533aa1f1a49924ec99760743f27df98dd8f9cbcb32feb8fe039d4130e0dbc9', 'image/webp', 1440, 810),
  ('turtle-trails', '1.0.1', 'overview.hero.mobile', '/portal-themes/turtle-trails/overview-portrait-640.webp', 'c0cafdf7d0d683c8d5cb43b33df19d521f7b3a339769d76acdbf13a8323ebd73', 'image/webp', 640, 1137),
  ('aqua-academy', '1.0.1', 'overview.hero.desktop', '/portal-themes/aqua-academy/overview-landscape-1440.webp', 'a596f09f3475ca7d8f2823f79f5eb47586770f4126c396b9b23d39cd5ad5c6b7', 'image/webp', 1440, 810),
  ('aqua-academy', '1.0.1', 'overview.hero.mobile', '/portal-themes/aqua-academy/overview-portrait-640.webp', '82fb8009275b46c8d13456fb43b4ce66fdd48c59b34a8e58ac0b75e88fbc482c', 'image/webp', 640, 1137)
on conflict (theme_key, theme_release, slot) do nothing;

create function app_private.activate_tenant_portal_theme(
  target_tenant_id uuid,
  target_theme_key text,
  target_theme_release text,
  target_actor_user_id uuid,
  target_reason text,
  target_ticket_reference text default null,
  target_request_correlation_id text default null,
  target_event_type text default 'activated'
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
    select 1 from public.platform_memberships membership
    where membership.user_id = target_actor_user_id
      and membership.status = 'active'
      and membership.role in ('platform_owner', 'platform_admin')
  ) then
    raise exception 'platform theme manager required';
  end if;
  if target_event_type not in ('activated', 'rolled_back') then
    raise exception 'invalid activation event';
  end if;
  if length(trim(target_reason)) < 3 then raise exception 'activation reason required'; end if;
  perform 1 from public.tenants where id = target_tenant_id for update;
  if not found then raise exception 'tenant not found'; end if;
  if not exists (
    select 1 from public.portal_theme_release
    where theme_key = target_theme_key and release = target_theme_release and status = 'published'
  ) then
    raise exception 'published compatible release not found';
  end if;

  select * into previous_assignment
  from public.tenant_portal_theme_assignment
  where tenant_id = target_tenant_id and deactivated_at is null
  for update;

  if previous_assignment.theme_key = target_theme_key and previous_assignment.theme_release = target_theme_release then
    return previous_assignment.id;
  end if;

  update public.tenant_portal_theme_assignment
  set deactivated_at = now()
  where tenant_id = target_tenant_id and deactivated_at is null;

  insert into public.tenant_portal_theme_assignment (
    tenant_id, theme_key, theme_release, activated_by_platform_admin_id,
    previous_assignment_id, reason, ticket_reference
  ) values (
    target_tenant_id, target_theme_key, target_theme_release, target_actor_user_id,
    previous_assignment.id, trim(target_reason), nullif(trim(target_ticket_reference), '')
  )
  returning id into next_assignment_id;

  insert into public.portal_theme_audit_event (
    tenant_id, actor_user_id, event_type,
    previous_theme_key, previous_theme_release, next_theme_key, next_theme_release,
    reason, ticket_reference, request_correlation_id
  ) values (
    target_tenant_id, target_actor_user_id, target_event_type,
    previous_assignment.theme_key, previous_assignment.theme_release, target_theme_key, target_theme_release,
    trim(target_reason), nullif(trim(target_ticket_reference), ''), target_request_correlation_id
  );

  return next_assignment_id;
end;
$$;

create function app_private.schedule_tenant_portal_theme(
  target_tenant_id uuid,
  target_theme_key text,
  target_theme_release text,
  target_scheduled_for timestamptz,
  target_actor_user_id uuid,
  target_reason text,
  target_ticket_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare schedule_id uuid;
begin
  if not exists (
    select 1 from public.platform_memberships membership
    where membership.user_id = target_actor_user_id and membership.status = 'active'
      and membership.role in ('platform_owner', 'platform_admin')
  ) then raise exception 'platform theme manager required'; end if;
  if target_scheduled_for <= now() then raise exception 'schedule must be in the future'; end if;
  if not exists (
    select 1 from public.portal_theme_release
    where theme_key = target_theme_key and release = target_theme_release and status = 'published'
  ) then raise exception 'published compatible release not found'; end if;

  update public.tenant_portal_theme_schedule
  set status = 'cancelled', cancelled_at = now()
  where tenant_id = target_tenant_id and status = 'scheduled';

  insert into public.tenant_portal_theme_schedule (
    tenant_id, theme_key, theme_release, scheduled_for, reason, ticket_reference, created_by_platform_admin_id
  ) values (
    target_tenant_id, target_theme_key, target_theme_release, target_scheduled_for,
    trim(target_reason), nullif(trim(target_ticket_reference), ''), target_actor_user_id
  ) returning id into schedule_id;

  insert into public.portal_theme_audit_event (
    tenant_id, actor_user_id, event_type, next_theme_key, next_theme_release, reason, ticket_reference,
    metadata_json
  ) values (
    target_tenant_id, target_actor_user_id, 'scheduled', target_theme_key, target_theme_release,
    trim(target_reason), nullif(trim(target_ticket_reference), ''),
    jsonb_build_object('scheduledFor', target_scheduled_for)
  );
  return schedule_id;
end;
$$;

create function app_private.execute_due_portal_theme_schedules(target_limit integer default 50)
returns table (schedule_id uuid, assignment_id uuid, status text)
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  scheduled public.tenant_portal_theme_schedule%rowtype;
  activated_assignment_id uuid;
begin
  for scheduled in
    select *
    from public.tenant_portal_theme_schedule
    where status = 'scheduled' and scheduled_for <= now()
    order by scheduled_for
    for update skip locked
    limit greatest(1, least(target_limit, 200))
  loop
    begin
      activated_assignment_id := app_private.activate_tenant_portal_theme(
        scheduled.tenant_id,
        scheduled.theme_key,
        scheduled.theme_release,
        scheduled.created_by_platform_admin_id,
        scheduled.reason,
        scheduled.ticket_reference,
        scheduled.id::text,
        'activated'
      );
      update public.tenant_portal_theme_schedule
      set status = 'executed', executed_at = now()
      where id = scheduled.id;
      schedule_id := scheduled.id;
      assignment_id := activated_assignment_id;
      status := 'executed';
      return next;
    exception when others then
      update public.tenant_portal_theme_schedule
      set status = 'failed'
      where id = scheduled.id;
      schedule_id := scheduled.id;
      assignment_id := null;
      status := 'failed';
      return next;
    end;
  end loop;
end;
$$;

create function public.activate_tenant_portal_theme(
  target_tenant_id uuid,
  target_theme_key text,
  target_theme_release text,
  target_actor_user_id uuid,
  target_reason text,
  target_ticket_reference text default null,
  target_request_correlation_id text default null,
  target_event_type text default 'activated'
)
returns uuid
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.activate_tenant_portal_theme(
    target_tenant_id, target_theme_key, target_theme_release, target_actor_user_id,
    target_reason, target_ticket_reference, target_request_correlation_id, target_event_type
  );
$$;

create function public.schedule_tenant_portal_theme(
  target_tenant_id uuid,
  target_theme_key text,
  target_theme_release text,
  target_scheduled_for timestamptz,
  target_actor_user_id uuid,
  target_reason text,
  target_ticket_reference text default null
)
returns uuid
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.schedule_tenant_portal_theme(
    target_tenant_id, target_theme_key, target_theme_release, target_scheduled_for,
    target_actor_user_id, target_reason, target_ticket_reference
  );
$$;

create function public.execute_due_portal_theme_schedules(target_limit integer default 50)
returns table (schedule_id uuid, assignment_id uuid, status text)
language sql
security invoker
set search_path = public, app_private, pg_temp
as $$
  select * from app_private.execute_due_portal_theme_schedules(target_limit);
$$;

revoke all on function app_private.activate_tenant_portal_theme(uuid, text, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function app_private.schedule_tenant_portal_theme(uuid, text, text, timestamptz, uuid, text, text) from public, anon, authenticated;
revoke all on function app_private.execute_due_portal_theme_schedules(integer) from public, anon, authenticated;
revoke all on function public.activate_tenant_portal_theme(uuid, text, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.schedule_tenant_portal_theme(uuid, text, text, timestamptz, uuid, text, text) from public, anon, authenticated;
revoke all on function public.execute_due_portal_theme_schedules(integer) from public, anon, authenticated;
grant execute on function app_private.activate_tenant_portal_theme(uuid, text, text, uuid, text, text, text, text) to service_role;
grant execute on function app_private.schedule_tenant_portal_theme(uuid, text, text, timestamptz, uuid, text, text) to service_role;
grant execute on function app_private.execute_due_portal_theme_schedules(integer) to service_role;
grant execute on function public.activate_tenant_portal_theme(uuid, text, text, uuid, text, text, text, text) to service_role;
grant execute on function public.schedule_tenant_portal_theme(uuid, text, text, timestamptz, uuid, text, text) to service_role;
grant execute on function public.execute_due_portal_theme_schedules(integer) to service_role;

grant select on public.portal_theme to authenticated;
grant all on public.portal_theme to service_role;
grant select on public.portal_theme_release to authenticated;
grant all on public.portal_theme_release to service_role;
grant select on public.portal_theme_asset to authenticated;
grant all on public.portal_theme_asset to service_role;
grant select on public.portal_badge_family_release to authenticated;
grant all on public.portal_badge_family_release to service_role;
grant select on public.tenant_portal_theme_assignment to authenticated;
grant all on public.tenant_portal_theme_assignment to service_role;
grant select on public.tenant_portal_theme_schedule to authenticated;
grant all on public.tenant_portal_theme_schedule to service_role;
grant select on public.portal_theme_audit_event to authenticated;
grant all on public.portal_theme_audit_event to service_role;
grant select on public.learner_assessment_legacy_source to authenticated;
grant all on public.learner_assessment_legacy_source to service_role;

alter table public.portal_theme enable row level security;
alter table public.portal_theme_release enable row level security;
alter table public.portal_theme_asset enable row level security;
alter table public.portal_badge_family_release enable row level security;
alter table public.tenant_portal_theme_assignment enable row level security;
alter table public.tenant_portal_theme_schedule enable row level security;
alter table public.portal_theme_audit_event enable row level security;
alter table public.learner_assessment_legacy_source enable row level security;

alter table public.portal_theme force row level security;
alter table public.portal_theme_release force row level security;
alter table public.portal_theme_asset force row level security;
alter table public.portal_badge_family_release force row level security;
alter table public.tenant_portal_theme_assignment force row level security;
alter table public.tenant_portal_theme_schedule force row level security;
alter table public.portal_theme_audit_event force row level security;
alter table public.learner_assessment_legacy_source force row level security;

create policy "Platform staff can view portal theme catalog" on public.portal_theme
  for select to authenticated using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy "Platform staff can view portal theme releases" on public.portal_theme_release
  for select to authenticated using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy "Platform staff can view portal theme assets" on public.portal_theme_asset
  for select to authenticated using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy "Platform staff can view badge family releases" on public.portal_badge_family_release
  for select to authenticated using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy "Platform staff can view theme assignments" on public.tenant_portal_theme_assignment
  for select to authenticated using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy "Platform staff can view theme schedules" on public.tenant_portal_theme_schedule
  for select to authenticated using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy "Platform staff can view theme audit" on public.portal_theme_audit_event
  for select to authenticated using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy "Platform managers can inspect explicit legacy assessment sources" on public.learner_assessment_legacy_source
  for select to authenticated using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));

comment on table public.portal_theme_release is 'Immutable parent portal manifest releases. Published rows are never edited in application flows.';
comment on table public.portal_theme_audit_event is 'Append-only audit events for platform-controlled theme operations.';
comment on table public.learner_assessment_legacy_source is 'Explicit legacy evidence; records are never inferred solely from a numeric score.';
