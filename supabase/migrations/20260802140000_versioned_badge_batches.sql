-- Immutable badge releases, transactional award batches and a strict surprise
-- boundary. Every multi-award command creates one aggregate notification per
-- eligible recipient, never one notification per badge.

update public.participants set gender = 'unknown_legacy' where gender = 'unknown';
update public.intake_submissions set participant_gender = 'unknown_legacy' where participant_gender = 'unknown';
update public.waitlist_entries set participant_gender = 'unknown_legacy' where participant_gender = 'unknown';
update public.participant_badge_awards
set participant_gender_snapshot = 'unknown_legacy'
where participant_gender_snapshot = 'unknown';

alter table public.participants
  alter column gender set default 'unknown_legacy',
  drop constraint participants_gender_check,
  add constraint participants_gender_check check (gender in ('boy', 'girl', 'unknown_legacy'));
alter table public.intake_submissions
  alter column participant_gender set default 'unknown_legacy',
  drop constraint intake_submissions_participant_gender_check,
  add constraint intake_submissions_participant_gender_check
    check (participant_gender in ('boy', 'girl', 'unknown_legacy'));
alter table public.waitlist_entries
  alter column participant_gender set default 'unknown_legacy',
  drop constraint waitlist_entries_participant_gender_check,
  add constraint waitlist_entries_participant_gender_check
    check (participant_gender in ('boy', 'girl', 'unknown_legacy'));
alter table public.participant_badge_awards
  alter column participant_gender_snapshot set default 'unknown_legacy',
  drop constraint participant_badge_awards_gender_check,
  add constraint participant_badge_awards_gender_check
    check (participant_gender_snapshot in ('boy', 'girl', 'unknown_legacy'));

alter table public.badge_catalog_definitions
  add column updated_by_user_id uuid references auth.users (id) on delete set null;
alter table public.tenant_custom_badges
  add column updated_by_user_id uuid references auth.users (id) on delete set null;

create table public.badge_definition_releases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  catalog_definition_id uuid references public.badge_catalog_definitions (id) on delete restrict,
  custom_badge_id uuid,
  release_number integer not null,
  stable_key text not null,
  name_default text not null,
  name_boy text,
  name_girl text,
  description_default text not null,
  description_boy text,
  description_girl text,
  share_text_default text,
  share_text_boy text,
  share_text_girl text,
  category text not null,
  badge_type text not null,
  trigger_type text,
  rule_json jsonb not null default '{}'::jsonb,
  audience text not null default 'all',
  icon_name text not null,
  artwork_asset_id uuid references public.badge_studio_assets (id) on delete restrict,
  is_surprise boolean not null default false,
  notifications_enabled boolean not null default true,
  emails_enabled boolean not null default false,
  share_enabled boolean not null default true,
  published_by_user_id uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint badge_definition_releases_custom_fk
    foreign key (tenant_id, custom_badge_id)
    references public.tenant_custom_badges (tenant_id, id) on delete restrict,
  constraint badge_definition_releases_source_check check (
    (tenant_id is null and catalog_definition_id is not null and custom_badge_id is null)
    or (tenant_id is not null and catalog_definition_id is null and custom_badge_id is not null)
  ),
  constraint badge_definition_releases_number_check check (release_number > 0),
  constraint badge_definition_releases_key_check check (stable_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint badge_definition_releases_category_check
    check (category in ('start', 'attendance', 'skills', 'stages', 'diplomas', 'makeup', 'compliments', 'courage', 'technique', 'specials')),
  constraint badge_definition_releases_type_check check (badge_type in ('automatic', 'manual')),
  constraint badge_definition_releases_trigger_check check (
    (badge_type = 'automatic' and trigger_type is not null and rule_json ? 'kind')
    or (badge_type = 'manual' and trigger_type is null)
  ),
  constraint badge_definition_releases_rule_check check (jsonb_typeof(rule_json) = 'object'),
  constraint badge_definition_releases_audience_check check (audience in ('all', 'boys', 'girls')),
  constraint badge_definition_releases_tenant_id_id_unique unique nulls not distinct (tenant_id, id)
);

create unique index badge_definition_releases_catalog_version_idx
  on public.badge_definition_releases (catalog_definition_id, release_number)
  where catalog_definition_id is not null;
create unique index badge_definition_releases_custom_version_idx
  on public.badge_definition_releases (tenant_id, custom_badge_id, release_number)
  where custom_badge_id is not null;
create index badge_definition_releases_key_idx
  on public.badge_definition_releases (tenant_id, stable_key, release_number desc);

create table public.badge_release_lifecycle (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  badge_release_id uuid not null references public.badge_definition_releases (id) on delete restrict,
  availability text not null default 'available',
  reason text,
  changed_by_user_id uuid references auth.users (id) on delete set null,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint badge_release_lifecycle_availability_check
    check (availability in ('available', 'not_for_new_awards', 'retired')),
  constraint badge_release_lifecycle_tenant_id_id_unique unique nulls not distinct (tenant_id, id)
);

create table public.badge_award_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid,
  command_type text not null,
  source_event_type text,
  source_event_id uuid,
  source_session_id uuid,
  reason text,
  visibility text not null default 'parent_visible',
  status text not null default 'processing',
  requested_count integer not null default 0,
  awarded_count integer not null default 0,
  skipped_count integer not null default 0,
  notification_count integer not null default 0,
  idempotency_key text not null,
  requested_by_user_id uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_award_batches_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint badge_award_batches_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete restrict,
  constraint badge_award_batches_session_fk
    foreign key (tenant_id, source_session_id)
    references public.sessions (tenant_id, id) on delete restrict,
  constraint badge_award_batches_command_check
    check (command_type in ('automatic', 'manual', 'remaining_badges')),
  constraint badge_award_batches_visibility_check check (visibility in ('internal', 'parent_visible')),
  constraint badge_award_batches_status_check check (status in ('processing', 'completed', 'failed')),
  constraint badge_award_batches_count_check check (
    requested_count >= 0
    and awarded_count >= 0
    and skipped_count >= 0
    and notification_count >= 0
    and awarded_count + skipped_count <= requested_count
  ),
  constraint badge_award_batches_idempotency_check check (length(idempotency_key) between 8 and 200),
  constraint badge_award_batches_tenant_id_id_unique unique (tenant_id, id),
  constraint badge_award_batches_idempotency_unique unique (tenant_id, idempotency_key)
);

create table public.badge_award_batch_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  batch_id uuid not null,
  badge_release_id uuid not null references public.badge_definition_releases (id) on delete restrict,
  award_id uuid,
  eligibility_status text not null,
  outcome text not null,
  outcome_reason text,
  created_at timestamptz not null default now(),
  constraint badge_award_batch_items_batch_fk
    foreign key (tenant_id, batch_id)
    references public.badge_award_batches (tenant_id, id) on delete cascade,
  constraint badge_award_batch_items_eligibility_check
    check (eligibility_status in ('eligible', 'ineligible')),
  constraint badge_award_batch_items_outcome_check
    check (outcome in ('awarded', 'duplicate', 'ineligible', 'disabled')),
  constraint badge_award_batch_items_unique unique (tenant_id, batch_id, badge_release_id),
  constraint badge_award_batch_items_tenant_id_id_unique unique (tenant_id, id)
);

alter table public.participant_badge_awards
  add column badge_release_id uuid references public.badge_definition_releases (id) on delete restrict,
  add column award_batch_id uuid,
  add constraint participant_badge_awards_batch_fk
    foreign key (tenant_id, award_batch_id)
    references public.badge_award_batches (tenant_id, id) on delete restrict;

alter table public.badge_award_batch_items
  add constraint badge_award_batch_items_award_fk
  foreign key (tenant_id, award_id)
  references public.participant_badge_awards (tenant_id, id) on delete restrict;

create unique index participant_badge_awards_release_lifetime_idx
  on public.participant_badge_awards (tenant_id, participant_id, badge_release_id)
  where badge_release_id is not null and status = 'awarded';
create index participant_badge_awards_batch_idx
  on public.participant_badge_awards (tenant_id, award_batch_id, awarded_at);

create table public.badge_batch_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  batch_id uuid not null,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  tenant_notification_id uuid,
  delivery_status text not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_batch_notifications_batch_fk
    foreign key (tenant_id, batch_id)
    references public.badge_award_batches (tenant_id, id) on delete restrict,
  constraint badge_batch_notifications_notification_fk
    foreign key (tenant_id, tenant_notification_id)
    references public.tenant_notifications (tenant_id, id) on delete restrict,
  constraint badge_batch_notifications_delivery_check
    check (delivery_status in ('queued', 'sent', 'skipped', 'failed')),
  constraint badge_batch_notifications_recipient_unique unique (tenant_id, batch_id, recipient_user_id),
  constraint badge_batch_notifications_tenant_id_id_unique unique (tenant_id, id)
);

alter table public.tenant_notifications
  add column related_badge_award_batch_id uuid,
  add constraint tenant_notifications_badge_award_batch_fk
    foreign key (tenant_id, related_badge_award_batch_id)
    references public.badge_award_batches (tenant_id, id) on delete restrict;

alter table public.tenant_notifications
  drop constraint tenant_notifications_entity_check,
  add constraint tenant_notifications_entity_check check (
    (entity_type is null and entity_id is null)
    or (
      entity_type in (
        'intake',
        'waitlist_entry',
        'participant',
        'group',
        'session',
        'payment',
        'message_thread',
        'graduation_event',
        'certificate',
        'task',
        'badge_award',
        'badge_award_batch'
      )
      and entity_id is not null
    )
  );

create index badge_award_batches_participant_idx
  on public.badge_award_batches (tenant_id, participant_id, created_at desc);
create index badge_award_batch_items_batch_idx
  on public.badge_award_batch_items (tenant_id, batch_id, outcome);
create index badge_batch_notifications_batch_idx
  on public.badge_batch_notifications (tenant_id, batch_id, delivery_status);

create trigger badge_award_batches_set_updated_at
  before update on public.badge_award_batches
  for each row execute function app_private.set_updated_at();
create trigger badge_batch_notifications_set_updated_at
  before update on public.badge_batch_notifications
  for each row execute function app_private.set_updated_at();

create or replace function app_private.prevent_published_badge_release_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Published badge releases and referenced artwork are immutable';
end;
$$;

revoke all on function app_private.prevent_published_badge_release_mutation() from public, anon, authenticated;
grant execute on function app_private.prevent_published_badge_release_mutation() to service_role;

create trigger badge_definition_releases_immutable
  before update or delete on public.badge_definition_releases
  for each row execute function app_private.prevent_published_badge_release_mutation();

create or replace function app_private.prevent_released_badge_asset_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.badge_definition_releases release
    where release.artwork_asset_id = old.id
  ) then
    raise exception 'Published badge releases and referenced artwork are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function app_private.prevent_released_badge_asset_mutation() from public, anon, authenticated;
grant execute on function app_private.prevent_released_badge_asset_mutation() to service_role;

create trigger badge_studio_assets_release_immutable
  before update or delete on public.badge_studio_assets
  for each row execute function app_private.prevent_released_badge_asset_mutation();

insert into public.badge_definition_releases (
  catalog_definition_id,
  release_number,
  stable_key,
  name_default,
  name_boy,
  name_girl,
  description_default,
  description_boy,
  description_girl,
  share_text_default,
  share_text_boy,
  share_text_girl,
  category,
  badge_type,
  trigger_type,
  rule_json,
  audience,
  icon_name,
  artwork_asset_id,
  is_surprise,
  notifications_enabled,
  emails_enabled,
  share_enabled,
  published_by_user_id
)
select
  definition.id,
  1,
  definition.badge_key,
  definition.name_default,
  definition.name_boy,
  definition.name_girl,
  definition.description_default,
  definition.description_boy,
  definition.description_girl,
  definition.share_text_default,
  definition.share_text_boy,
  definition.share_text_girl,
  definition.category,
  definition.badge_type,
  definition.trigger_type,
  case
    when definition.badge_type = 'automatic'
      then jsonb_build_object('kind', 'structured_trigger', 'config', definition.trigger_config_json)
    else '{}'::jsonb
  end,
  definition.audience,
  definition.icon_name,
  definition.artwork_asset_id,
  definition.is_surprise,
  definition.notifications_enabled,
  definition.emails_enabled,
  definition.share_enabled,
  definition.updated_by_user_id
from public.badge_catalog_definitions definition
where definition.status = 'active'
on conflict do nothing;

insert into public.badge_definition_releases (
  tenant_id,
  custom_badge_id,
  release_number,
  stable_key,
  name_default,
  name_boy,
  name_girl,
  description_default,
  description_boy,
  description_girl,
  share_text_default,
  share_text_boy,
  share_text_girl,
  category,
  badge_type,
  trigger_type,
  rule_json,
  audience,
  icon_name,
  artwork_asset_id,
  is_surprise,
  notifications_enabled,
  emails_enabled,
  share_enabled,
  published_by_user_id
)
select
  custom.tenant_id,
  custom.id,
  1,
  custom.badge_key,
  custom.name_default,
  custom.name_boy,
  custom.name_girl,
  custom.description_default,
  custom.description_boy,
  custom.description_girl,
  custom.share_text_default,
  custom.share_text_boy,
  custom.share_text_girl,
  custom.category,
  'manual',
  null,
  '{}'::jsonb,
  custom.audience,
  custom.icon_name,
  custom.artwork_asset_id,
  custom.is_surprise,
  true,
  false,
  true,
  coalesce(custom.updated_by_user_id, custom.created_by_user_id)
from public.tenant_custom_badges custom
where custom.status = 'active'
on conflict do nothing;

insert into public.badge_release_lifecycle (tenant_id, badge_release_id, availability, reason)
select release.tenant_id, release.id, 'available', 'Initial immutable release'
from public.badge_definition_releases release;

create or replace function app_private.publish_active_badge_definition_release()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_release_id uuid;
  next_release_number integer;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select coalesce(max(release.release_number), 0) + 1
    into next_release_number
  from public.badge_definition_releases release
  where release.catalog_definition_id = new.id;

  insert into public.badge_definition_releases (
    catalog_definition_id,
    release_number,
    stable_key,
    name_default,
    name_boy,
    name_girl,
    description_default,
    description_boy,
    description_girl,
    share_text_default,
    share_text_boy,
    share_text_girl,
    category,
    badge_type,
    trigger_type,
    rule_json,
    audience,
    icon_name,
    artwork_asset_id,
    is_surprise,
    notifications_enabled,
    emails_enabled,
    share_enabled,
    published_by_user_id
  ) values (
    new.id,
    next_release_number,
    new.badge_key,
    new.name_default,
    new.name_boy,
    new.name_girl,
    new.description_default,
    new.description_boy,
    new.description_girl,
    new.share_text_default,
    new.share_text_boy,
    new.share_text_girl,
    new.category,
    new.badge_type,
    case when new.badge_type = 'automatic' then new.trigger_type else null end,
    case
      when new.badge_type = 'automatic'
        then jsonb_build_object('kind', 'structured_trigger', 'config', new.trigger_config_json)
      else '{}'::jsonb
    end,
    new.audience,
    new.icon_name,
    new.artwork_asset_id,
    new.is_surprise,
    new.notifications_enabled,
    new.emails_enabled,
    new.share_enabled,
    new.updated_by_user_id
  )
  returning id into target_release_id;

  insert into public.badge_release_lifecycle (
    tenant_id,
    badge_release_id,
    availability,
    reason,
    changed_by_user_id
  ) values (
    null,
    target_release_id,
    'available',
    'Published from Badge Studio',
    new.updated_by_user_id
  );

  return new;
end;
$$;

revoke all on function app_private.publish_active_badge_definition_release() from public, anon, authenticated;
grant execute on function app_private.publish_active_badge_definition_release() to service_role;

create trigger badge_catalog_publish_immutable_release
  after insert or update on public.badge_catalog_definitions
  for each row execute function app_private.publish_active_badge_definition_release();

create or replace function app_private.publish_active_custom_badge_release()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_release_id uuid;
  next_release_number integer;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select coalesce(max(release.release_number), 0) + 1
    into next_release_number
  from public.badge_definition_releases release
  where release.tenant_id = new.tenant_id
    and release.custom_badge_id = new.id;

  insert into public.badge_definition_releases (
    tenant_id,
    custom_badge_id,
    release_number,
    stable_key,
    name_default,
    name_boy,
    name_girl,
    description_default,
    description_boy,
    description_girl,
    share_text_default,
    share_text_boy,
    share_text_girl,
    category,
    badge_type,
    trigger_type,
    rule_json,
    audience,
    icon_name,
    artwork_asset_id,
    is_surprise,
    notifications_enabled,
    emails_enabled,
    share_enabled,
    published_by_user_id
  ) values (
    new.tenant_id,
    new.id,
    next_release_number,
    new.badge_key,
    new.name_default,
    new.name_boy,
    new.name_girl,
    new.description_default,
    new.description_boy,
    new.description_girl,
    new.share_text_default,
    new.share_text_boy,
    new.share_text_girl,
    new.category,
    'manual',
    null,
    '{}'::jsonb,
    new.audience,
    new.icon_name,
    new.artwork_asset_id,
    new.is_surprise,
    true,
    false,
    true,
    coalesce(new.updated_by_user_id, new.created_by_user_id)
  )
  returning id into target_release_id;

  insert into public.badge_release_lifecycle (
    tenant_id,
    badge_release_id,
    availability,
    reason,
    changed_by_user_id
  ) values (
    new.tenant_id,
    target_release_id,
    'available',
    'Published from tenant Badge Studio',
    coalesce(new.updated_by_user_id, new.created_by_user_id)
  );

  return new;
end;
$$;

revoke all on function app_private.publish_active_custom_badge_release() from public, anon, authenticated;
grant execute on function app_private.publish_active_custom_badge_release() to service_role;

create trigger tenant_custom_badge_publish_immutable_release
  after insert or update on public.tenant_custom_badges
  for each row execute function app_private.publish_active_custom_badge_release();

drop policy "Authenticated users can read active badge catalog"
  on public.badge_catalog_definitions;
create policy badge_catalog_surprise_safe_read
  on public.badge_catalog_definitions for select to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or exists (
      select 1 from public.tenant_memberships membership
      where membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and membership.role in ('tenant_owner', 'tenant_admin', 'tenant_staff', 'coordinator', 'instructor')
    )
    or (
      status = 'active'
      and not is_surprise
    )
    or exists (
      select 1
      from public.participant_badge_awards award
      where award.catalog_definition_id = badge_catalog_definitions.id
        and award.status = 'awarded'
        and award.visibility = 'parent_visible'
        and app_private.current_user_can_view_participant(award.participant_id)
    )
  );

drop policy "Tenant members read badge overrides"
  on public.tenant_badge_settings;
create policy tenant_badge_settings_surprise_safe_read
  on public.tenant_badge_settings for select to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or exists (
      select 1
      from public.badge_catalog_definitions definition
      where definition.id = catalog_definition_id
        and (
          not definition.is_surprise
          or exists (
            select 1
            from public.participant_badge_awards award
            where award.tenant_id = tenant_badge_settings.tenant_id
              and award.catalog_definition_id = definition.id
              and award.status = 'awarded'
              and award.visibility = 'parent_visible'
              and app_private.current_user_can_view_participant(award.participant_id)
          )
        )
    )
  );

drop policy "Tenant members read active custom badges"
  on public.tenant_custom_badges;
create policy tenant_custom_badges_surprise_safe_read
  on public.tenant_custom_badges for select to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or (
      status = 'active'
      and not is_surprise
      and app_private.current_user_has_tenant_role(tenant_id, array['parent', 'athlete'])
    )
    or exists (
      select 1
      from public.participant_badge_awards award
      where award.tenant_id = tenant_custom_badges.tenant_id
        and award.custom_badge_id = tenant_custom_badges.id
        and award.status = 'awarded'
        and award.visibility = 'parent_visible'
        and app_private.current_user_can_view_participant(award.participant_id)
    )
  );

drop policy "Scoped users read badge collections"
  on public.badge_collections;
create policy badge_collections_surprise_safe_read
  on public.badge_collections for select to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or (tenant_id is not null and app_private.current_user_can_manage_tenant_domain(tenant_id))
    or (tenant_id is not null and app_private.current_user_has_tenant_role(tenant_id, array['instructor']))
    or (
      not is_surprise
      and (
        tenant_id is null
        or app_private.current_user_has_tenant_role(tenant_id, array['parent', 'athlete'])
      )
    )
    or exists (
      select 1
      from public.badge_collection_items collection_item
      join public.participant_badge_awards award
        on (
          award.catalog_definition_id = collection_item.catalog_definition_id
          or award.custom_badge_id = collection_item.custom_badge_id
        )
      where collection_item.collection_id = badge_collections.id
        and award.status = 'awarded'
        and award.visibility = 'parent_visible'
        and app_private.current_user_can_view_participant(award.participant_id)
    )
  );

drop policy "Scoped users read badge collection items"
  on public.badge_collection_items;
create policy badge_collection_items_surprise_safe_read
  on public.badge_collection_items for select to authenticated
  using (
    exists (
      select 1
      from public.badge_collections collection
      where collection.id = collection_id
        and (
          app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
          or (collection.tenant_id is not null and app_private.current_user_can_manage_tenant_domain(collection.tenant_id))
          or (collection.tenant_id is not null and app_private.current_user_has_tenant_role(collection.tenant_id, array['instructor']))
          or not collection.is_surprise
          or exists (
            select 1
            from public.participant_badge_awards award
            where (
              award.catalog_definition_id = badge_collection_items.catalog_definition_id
              or award.custom_badge_id = badge_collection_items.custom_badge_id
            )
              and award.status = 'awarded'
              and award.visibility = 'parent_visible'
              and app_private.current_user_can_view_participant(award.participant_id)
          )
        )
    )
  );

create or replace function app_private.current_request_is_service_role()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

revoke all on function app_private.current_request_is_service_role() from public, anon, authenticated;
grant execute on function app_private.current_request_is_service_role() to service_role;

create or replace function app_private.preview_remaining_badges(
  target_tenant_id uuid,
  target_participant_id uuid
)
returns table (
  badge_release_id uuid,
  stable_key text,
  resolved_name text,
  is_surprise boolean,
  eligibility_status text,
  eligibility_reason text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    release.id,
    release.stable_key,
    case participant.gender
      when 'boy' then coalesce(release.name_boy, release.name_default)
      when 'girl' then coalesce(release.name_girl, release.name_default)
      else release.name_default
    end,
    release.is_surprise,
    case
      when release.audience = 'boys' and participant.gender <> 'boy' then 'ineligible'
      when release.audience = 'girls' and participant.gender <> 'girl' then 'ineligible'
      else 'eligible'
    end,
    case
      when release.audience = 'boys' and participant.gender <> 'boy' then 'audience_mismatch'
      when release.audience = 'girls' and participant.gender <> 'girl' then 'audience_mismatch'
      else 'not_yet_awarded'
    end
  from public.participants participant
  join public.badge_definition_releases release
    on release.tenant_id is null or release.tenant_id = participant.tenant_id
  where participant.tenant_id = target_tenant_id
    and participant.id = target_participant_id
    and app_private.current_user_has_swim_permission(target_tenant_id, 'badge.award_remaining')
    and (
      app_private.current_user_can_manage_tenant_domain(target_tenant_id)
      or app_private.current_user_can_instruct_participant(target_participant_id)
    )
    and not exists (
      select 1
      from public.badge_release_lifecycle lifecycle
      where lifecycle.badge_release_id = release.id
        and lifecycle.effective_at = (
          select max(latest.effective_at)
          from public.badge_release_lifecycle latest
          where latest.badge_release_id = release.id
        )
        and lifecycle.availability <> 'available'
    )
    and not exists (
      select 1
      from public.participant_badge_awards award
      where award.tenant_id = target_tenant_id
        and award.participant_id = target_participant_id
        and award.badge_release_id = release.id
        and award.status = 'awarded'
    )
  order by release.category, release.stable_key;
$$;

revoke all on function app_private.preview_remaining_badges(uuid, uuid) from public, anon;
grant execute on function app_private.preview_remaining_badges(uuid, uuid) to authenticated;
grant execute on function app_private.preview_remaining_badges(uuid, uuid) to service_role;

create or replace function app_private.award_badge_batch(
  target_tenant_id uuid,
  target_participant_id uuid,
  target_enrollment_id uuid,
  target_badge_release_ids uuid[],
  target_command_type text,
  target_source_event_type text,
  target_source_event_id uuid,
  target_source_session_id uuid,
  target_reason text,
  target_visibility text,
  target_actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_participant public.participants%rowtype;
  target_batch_id uuid;
  target_release public.badge_definition_releases%rowtype;
  target_award_id uuid;
  target_title text;
  target_description text;
  target_share_text text;
  target_requested_count integer;
  target_awarded_count integer := 0;
  target_skipped_count integer := 0;
  target_notification_count integer := 0;
  target_badge_names text;
  target_notification_id uuid;
  target_recipient_id uuid;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
  required_permission text;
begin
  if not app_private.current_request_is_service_role()
    and target_actor_user_id is distinct from (select auth.uid())
  then
    raise exception 'Actor mismatch';
  end if;
  if target_command_type not in ('automatic', 'manual', 'remaining_badges') then
    raise exception 'Unsupported badge batch command';
  end if;
  if target_visibility not in ('internal', 'parent_visible') then
    raise exception 'Unsupported visibility';
  end if;

  required_permission := case
    when target_command_type = 'remaining_badges' then 'badge.award_remaining'
    else 'badge.award'
  end;

  if not app_private.current_request_is_service_role()
    and (
      not app_private.current_user_has_swim_permission(target_tenant_id, required_permission)
      or not (
        app_private.current_user_can_manage_tenant_domain(target_tenant_id)
        or app_private.current_user_can_instruct_participant(target_participant_id)
      )
    )
  then
    raise exception 'Insufficient badge permission';
  end if;

  select * into target_participant
  from public.participants participant
  where participant.tenant_id = target_tenant_id
    and participant.id = target_participant_id
    and participant.status = 'active'
  for update;

  if target_participant.id is null then
    raise exception 'Active participant not found';
  end if;
  if target_enrollment_id is not null and not exists (
    select 1 from public.enrollments enrollment
    where enrollment.tenant_id = target_tenant_id
      and enrollment.id = target_enrollment_id
      and enrollment.participant_id = target_participant_id
  ) then
    raise exception 'Enrollment does not belong to participant';
  end if;

  select count(distinct release_id) into target_requested_count
  from unnest(coalesce(target_badge_release_ids, '{}'::uuid[])) release_id;

  if target_requested_count = 0 or target_requested_count > 100 then
    raise exception 'A badge batch must contain 1 through 100 unique releases';
  end if;
  if (
    select count(*)
    from public.badge_definition_releases release
    where release.id = any(target_badge_release_ids)
      and (release.tenant_id is null or release.tenant_id = target_tenant_id)
  ) <> target_requested_count then
    raise exception 'Badge release scope mismatch';
  end if;

  request_hash := encode(
    extensions.digest(
      concat_ws(
        ':',
        target_participant_id::text,
        target_command_type,
        (
          select string_agg(release_id::text, ',' order by release_id::text)
          from unnest(target_badge_release_ids) release_id
        ),
        target_visibility
      ),
      'sha256'
    ),
    'hex'
  );

  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;

  if existing_receipt.id is not null then
    if existing_receipt.command_type <> 'badge.award_batch'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key was already used for another command';
    end if;
    return existing_receipt.aggregate_id;
  end if;

  insert into public.badge_award_batches (
    tenant_id,
    participant_id,
    enrollment_id,
    command_type,
    source_event_type,
    source_event_id,
    source_session_id,
    reason,
    visibility,
    requested_count,
    idempotency_key,
    requested_by_user_id
  ) values (
    target_tenant_id,
    target_participant_id,
    target_enrollment_id,
    target_command_type,
    nullif(trim(coalesce(target_source_event_type, '')), ''),
    target_source_event_id,
    target_source_session_id,
    nullif(trim(coalesce(target_reason, '')), ''),
    target_visibility,
    target_requested_count,
    target_idempotency_key,
    target_actor_user_id
  )
  returning id into target_batch_id;

  for target_release in
    select release.*
    from public.badge_definition_releases release
    where release.id = any(target_badge_release_ids)
    order by release.category, release.stable_key
  loop
    if exists (
      select 1
      from public.badge_release_lifecycle lifecycle
      where lifecycle.badge_release_id = target_release.id
        and lifecycle.effective_at = (
          select max(latest.effective_at)
          from public.badge_release_lifecycle latest
          where latest.badge_release_id = target_release.id
        )
        and lifecycle.availability <> 'available'
    ) then
      insert into public.badge_award_batch_items (
        tenant_id, batch_id, badge_release_id, eligibility_status, outcome, outcome_reason
      ) values (
        target_tenant_id, target_batch_id, target_release.id, 'ineligible', 'disabled', 'release_unavailable'
      );
      target_skipped_count := target_skipped_count + 1;
      continue;
    end if;

    if (
      (target_release.audience = 'boys' and target_participant.gender <> 'boy')
      or (target_release.audience = 'girls' and target_participant.gender <> 'girl')
    ) then
      insert into public.badge_award_batch_items (
        tenant_id, batch_id, badge_release_id, eligibility_status, outcome, outcome_reason
      ) values (
        target_tenant_id, target_batch_id, target_release.id, 'ineligible', 'ineligible', 'audience_mismatch'
      );
      target_skipped_count := target_skipped_count + 1;
      continue;
    end if;

    if exists (
      select 1
      from public.participant_badge_awards award
      where award.tenant_id = target_tenant_id
        and award.participant_id = target_participant_id
        and (
          award.badge_release_id = target_release.id
          or award.resolved_badge_key = target_release.stable_key
        )
        and award.status = 'awarded'
    ) then
      insert into public.badge_award_batch_items (
        tenant_id, batch_id, badge_release_id, eligibility_status, outcome, outcome_reason
      ) values (
        target_tenant_id, target_batch_id, target_release.id, 'eligible', 'duplicate', 'already_awarded'
      );
      target_skipped_count := target_skipped_count + 1;
      continue;
    end if;

    target_title := case target_participant.gender
      when 'boy' then coalesce(target_release.name_boy, target_release.name_default)
      when 'girl' then coalesce(target_release.name_girl, target_release.name_default)
      else target_release.name_default
    end;
    target_description := case target_participant.gender
      when 'boy' then coalesce(target_release.description_boy, target_release.description_default)
      when 'girl' then coalesce(target_release.description_girl, target_release.description_default)
      else target_release.description_default
    end;
    target_share_text := case target_participant.gender
      when 'boy' then coalesce(target_release.share_text_boy, target_release.share_text_default)
      when 'girl' then coalesce(target_release.share_text_girl, target_release.share_text_default)
      else target_release.share_text_default
    end;

    insert into public.participant_badge_awards (
      tenant_id,
      participant_id,
      enrollment_id,
      catalog_definition_id,
      custom_badge_id,
      awarded_by_user_id,
      source_session_id,
      title,
      note,
      visibility,
      status,
      approval_status,
      award_key,
      resolved_badge_key,
      resolved_name,
      resolved_description,
      resolved_share_text,
      resolved_artwork_asset_id,
      participant_gender_snapshot,
      trigger_event_type,
      trigger_context_json,
      delivery_status,
      share_status,
      is_test,
      source,
      badge_release_id,
      award_batch_id
    ) values (
      target_tenant_id,
      target_participant_id,
      target_enrollment_id,
      target_release.catalog_definition_id,
      target_release.custom_badge_id,
      target_actor_user_id,
      target_source_session_id,
      target_title,
      coalesce(nullif(trim(coalesce(target_reason, '')), ''), target_description),
      target_visibility,
      'awarded',
      'approved',
      left(concat_ws(':', target_participant_id::text, target_release.stable_key, 'lifetime'), 240),
      target_release.stable_key,
      target_title,
      target_description,
      target_share_text,
      target_release.artwork_asset_id,
      target_participant.gender,
      target_source_event_type,
      jsonb_build_object(
        'eventId', target_source_event_id,
        'batchId', target_batch_id,
        'commandType', target_command_type
      ),
      'queued',
      'not_requested',
      target_participant.is_test,
      'manual',
      target_release.id,
      target_batch_id
    )
    returning id into target_award_id;

    insert into public.badge_award_batch_items (
      tenant_id,
      batch_id,
      badge_release_id,
      award_id,
      eligibility_status,
      outcome
    ) values (
      target_tenant_id,
      target_batch_id,
      target_release.id,
      target_award_id,
      'eligible',
      'awarded'
    );

    insert into public.badge_analytics_events (
      tenant_id,
      participant_id,
      award_id,
      event_type,
      actor_profile_id,
      metadata_json,
      is_test
    ) values (
      target_tenant_id,
      target_participant_id,
      target_award_id,
      'earned',
      target_actor_user_id,
      jsonb_build_object(
        'badgeKey', target_release.stable_key,
        'batchId', target_batch_id,
        'releaseNumber', target_release.release_number,
        'genderVariant', target_participant.gender
      ),
      target_participant.is_test
    );

    target_awarded_count := target_awarded_count + 1;
  end loop;

  select string_agg(award.resolved_name, ', ' order by award.awarded_at, award.id)
    into target_badge_names
  from public.participant_badge_awards award
  where award.tenant_id = target_tenant_id
    and award.award_batch_id = target_batch_id
    and award.status = 'awarded';

  if target_awarded_count > 0 and target_visibility = 'parent_visible' then
    for target_recipient_id in
      select distinct recipient_id
      from (
        select target_participant.guardian_user_id as recipient_id
        union all
        select guardian.guardian_user_id
        from public.participant_guardians guardian
        where guardian.tenant_id = target_tenant_id
          and guardian.participant_id = target_participant_id
          and guardian.status = 'active'
      ) recipients
      left join public.guardian_communication_preferences preference
        on preference.tenant_id = target_tenant_id
       and preference.guardian_user_id = recipients.recipient_id
      where recipient_id is not null
        and coalesce(preference.badge_notifications_enabled, true)
    loop
      insert into public.tenant_notifications (
        tenant_id,
        recipient_user_id,
        participant_id,
        type,
        title,
        message,
        status,
        entity_type,
        entity_id,
        action_href,
        related_badge_award_batch_id
      ) values (
        target_tenant_id,
        target_recipient_id,
        target_participant_id,
        'badge_award',
        case
          when target_awarded_count = 1 then 'Een nieuwe badge!'
          else target_awarded_count || ' nieuwe badges!'
        end,
        coalesce(target_badge_names, 'Nieuwe badges in de zwemreis.'),
        'unread',
        'badge_award_batch',
        target_batch_id,
        '/portaal/ontwikkeling/badges',
        target_batch_id
      )
      returning id into target_notification_id;

      insert into public.badge_batch_notifications (
        tenant_id,
        batch_id,
        recipient_user_id,
        tenant_notification_id,
        delivery_status
      ) values (
        target_tenant_id,
        target_batch_id,
        target_recipient_id,
        target_notification_id,
        'queued'
      );
      target_notification_count := target_notification_count + 1;
    end loop;
  end if;

  update public.participant_badge_awards
  set delivery_status = case when target_notification_count > 0 then 'sent' else 'skipped' end
  where tenant_id = target_tenant_id
    and award_batch_id = target_batch_id;

  update public.badge_award_batches
  set status = 'completed',
      awarded_count = target_awarded_count,
      skipped_count = target_skipped_count,
      notification_count = target_notification_count,
      completed_at = now()
  where tenant_id = target_tenant_id
    and id = target_batch_id;

  insert into public.domain_command_receipts (
    tenant_id,
    idempotency_key,
    command_type,
    aggregate_type,
    aggregate_id,
    actor_user_id,
    request_hash,
    result_json
  ) values (
    target_tenant_id,
    target_idempotency_key,
    'badge.award_batch',
    'badge_award_batch',
    target_batch_id,
    target_actor_user_id,
    request_hash,
    jsonb_build_object(
      'batchId', target_batch_id,
      'awardedCount', target_awarded_count,
      'skippedCount', target_skipped_count,
      'notificationCount', target_notification_count
    )
  );

  insert into public.domain_outbox_events (
    tenant_id,
    event_type,
    aggregate_type,
    aggregate_id,
    actor_user_id,
    payload_json
  ) values (
    target_tenant_id,
    'badge.batch_awarded',
    'badge_award_batch',
    target_batch_id,
    target_actor_user_id,
    jsonb_build_object(
      'participantId', target_participant_id,
      'commandType', target_command_type,
      'awardedCount', target_awarded_count,
      'notificationCount', target_notification_count
    )
  );

  insert into public.swim_audit_events (
    tenant_id,
    actor_user_id,
    permission_key,
    event_type,
    subject_type,
    subject_id,
    reason,
    after_json
  ) values (
    target_tenant_id,
    target_actor_user_id,
    required_permission,
    'badge.batch_awarded',
    'badge_award_batch',
    target_batch_id,
    target_reason,
    jsonb_build_object(
      'commandType', target_command_type,
      'awardedCount', target_awarded_count,
      'skippedCount', target_skipped_count,
      'notificationCount', target_notification_count
    )
  );

  return target_batch_id;
end;
$$;

revoke all on function app_private.award_badge_batch(
  uuid, uuid, uuid, uuid[], text, text, uuid, uuid, text, text, uuid, text
) from public, anon;
grant execute on function app_private.award_badge_batch(
  uuid, uuid, uuid, uuid[], text, text, uuid, uuid, text, text, uuid, text
) to authenticated;
grant execute on function app_private.award_badge_batch(
  uuid, uuid, uuid, uuid[], text, text, uuid, uuid, text, text, uuid, text
) to service_role;

create or replace function public.preview_remaining_badges(
  target_tenant_id uuid,
  target_participant_id uuid
)
returns table (
  badge_release_id uuid,
  stable_key text,
  resolved_name text,
  is_surprise boolean,
  eligibility_status text,
  eligibility_reason text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select *
  from app_private.preview_remaining_badges(target_tenant_id, target_participant_id);
$$;

revoke all on function public.preview_remaining_badges(uuid, uuid) from public, anon;
grant execute on function public.preview_remaining_badges(uuid, uuid) to authenticated, service_role;

create or replace function public.award_badge_batch(
  target_tenant_id uuid,
  target_participant_id uuid,
  target_enrollment_id uuid,
  target_badge_release_ids uuid[],
  target_command_type text,
  target_source_event_type text,
  target_source_event_id uuid,
  target_source_session_id uuid,
  target_reason text,
  target_visibility text,
  target_actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.award_badge_batch(
    target_tenant_id,
    target_participant_id,
    target_enrollment_id,
    target_badge_release_ids,
    target_command_type,
    target_source_event_type,
    target_source_event_id,
    target_source_session_id,
    target_reason,
    target_visibility,
    target_actor_user_id,
    target_idempotency_key
  );
$$;

revoke all on function public.award_badge_batch(
  uuid, uuid, uuid, uuid[], text, text, uuid, uuid, text, text, uuid, text
) from public, anon;
grant execute on function public.award_badge_batch(
  uuid, uuid, uuid, uuid[], text, text, uuid, uuid, text, text, uuid, text
) to authenticated, service_role;

grant select on public.badge_definition_releases to authenticated;
grant select, insert on public.badge_release_lifecycle to authenticated;
grant select on public.badge_award_batches to authenticated;
grant select on public.badge_award_batch_items to authenticated;
grant select on public.badge_batch_notifications to authenticated;

grant all on public.badge_definition_releases to service_role;
grant all on public.badge_release_lifecycle to service_role;
grant all on public.badge_award_batches to service_role;
grant all on public.badge_award_batch_items to service_role;
grant all on public.badge_batch_notifications to service_role;

alter table public.badge_definition_releases enable row level security;
alter table public.badge_release_lifecycle enable row level security;
alter table public.badge_award_batches enable row level security;
alter table public.badge_award_batch_items enable row level security;
alter table public.badge_batch_notifications enable row level security;

alter table public.badge_definition_releases force row level security;
alter table public.badge_release_lifecycle force row level security;
alter table public.badge_award_batches force row level security;
alter table public.badge_award_batch_items force row level security;
alter table public.badge_batch_notifications force row level security;

create policy badge_definition_releases_read
  on public.badge_definition_releases for select to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or (tenant_id is not null and app_private.current_user_can_manage_tenant_domain(tenant_id))
    or exists (
      select 1 from public.tenant_memberships membership
      where membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and membership.role in ('tenant_owner', 'tenant_admin', 'tenant_staff', 'coordinator', 'instructor')
    )
    or not is_surprise
    or exists (
      select 1
      from public.participant_badge_awards award
      where award.badge_release_id = badge_definition_releases.id
        and award.status = 'awarded'
        and award.visibility = 'parent_visible'
        and app_private.current_user_can_view_participant(award.participant_id)
    )
  );
create policy badge_release_lifecycle_read
  on public.badge_release_lifecycle for select to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or (tenant_id is not null and app_private.current_user_can_manage_tenant_domain(tenant_id))
    or exists (
      select 1
      from public.badge_definition_releases release
      where release.id = badge_release_id
        and (
          not release.is_surprise
          or exists (
            select 1
            from public.participant_badge_awards award
            where award.badge_release_id = release.id
              and award.status = 'awarded'
              and award.visibility = 'parent_visible'
              and app_private.current_user_can_view_participant(award.participant_id)
          )
        )
    )
  );
create policy badge_release_lifecycle_manage
  on public.badge_release_lifecycle for insert to authenticated
  with check (
    (tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
    or (tenant_id is not null and app_private.current_user_has_swim_permission(tenant_id, 'badge.publish'))
  );

create policy badge_award_batches_read
  on public.badge_award_batches for select to authenticated
  using (
    app_private.current_user_can_instruct_participant(participant_id)
  );
create policy badge_award_batch_items_read
  on public.badge_award_batch_items for select to authenticated
  using (
    exists (
      select 1 from public.badge_award_batches batch
      where batch.tenant_id = badge_award_batch_items.tenant_id
        and batch.id = badge_award_batch_items.batch_id
        and (
          app_private.current_user_can_instruct_participant(batch.participant_id)
        )
    )
  );
create policy badge_batch_notifications_read
  on public.badge_batch_notifications for select to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
  );

comment on table public.badge_definition_releases is
  'Immutable badge rule, copy and artwork snapshots. Published releases are never edited in place.';
comment on table public.badge_award_batches is
  'One idempotent command boundary for automatic, manual or remaining-badge awards.';
comment on table public.badge_batch_notifications is
  'Unique per batch and recipient, proving that multi-awards produce one aggregate notification.';
comment on function app_private.preview_remaining_badges(uuid, uuid) is
  'Permission-bound, read-only preview for the separate Ken resterende badges toe command.';
