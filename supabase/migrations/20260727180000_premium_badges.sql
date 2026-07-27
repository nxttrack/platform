-- Premium badge system: global canon, tenant configuration, gender-aware copy,
-- approval-safe awards, collections, share templates and analytics.

alter table public.participants
  add column if not exists gender text not null default 'unknown';

alter table public.participants
  drop constraint if exists participants_gender_check,
  add constraint participants_gender_check check (gender in ('boy', 'girl', 'unknown'));

alter table public.intake_submissions
  add column if not exists participant_gender text not null default 'unknown';

alter table public.intake_submissions
  drop constraint if exists intake_submissions_participant_gender_check,
  add constraint intake_submissions_participant_gender_check check (participant_gender in ('boy', 'girl', 'unknown'));

alter table public.waitlist_entries
  add column if not exists participant_gender text not null default 'unknown';

alter table public.waitlist_entries
  drop constraint if exists waitlist_entries_participant_gender_check,
  add constraint waitlist_entries_participant_gender_check check (participant_gender in ('boy', 'girl', 'unknown'));

create table public.platform_badge_settings (
  id boolean primary key default true,
  badges_module_available boolean not null default true,
  automatic_badges_available boolean not null default true,
  manual_badges_available boolean not null default true,
  tenant_custom_badges_allowed boolean not null default true,
  badge_collections_available boolean not null default true,
  surprise_badges_available boolean not null default true,
  share_images_available boolean not null default true,
  badge_email_available boolean not null default true,
  badge_notifications_available boolean not null default true,
  tenant_badge_rename_allowed boolean not null default true,
  tenant_message_suggestions_allowed boolean not null default true,
  tenant_template_override_allowed boolean not null default false,
  badge_analytics_available boolean not null default true,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_badge_settings_singleton check (id)
);

insert into public.platform_badge_settings (id) values (true)
on conflict (id) do nothing;

create table public.badge_catalog_definitions (
  id uuid primary key default gen_random_uuid(),
  badge_key text not null unique,
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
  badge_type text not null default 'automatic',
  trigger_type text,
  trigger_config_json jsonb not null default '{}'::jsonb,
  audience text not null default 'all',
  icon_name text not null default 'award',
  artwork_json jsonb not null default '{}'::jsonb,
  is_surprise boolean not null default false,
  allow_custom_message boolean not null default true,
  notifications_enabled boolean not null default true,
  emails_enabled boolean not null default true,
  share_enabled boolean not null default true,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_catalog_key_check check (badge_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint badge_catalog_category_check check (category in ('start', 'attendance', 'skills', 'stages', 'diplomas', 'makeup', 'compliments', 'courage', 'technique', 'specials')),
  constraint badge_catalog_type_check check (badge_type in ('automatic', 'manual')),
  constraint badge_catalog_audience_check check (audience in ('all', 'boys', 'girls')),
  constraint badge_catalog_status_check check (status in ('draft', 'active', 'archived')),
  constraint badge_catalog_trigger_check check (
    (badge_type = 'automatic' and trigger_type is not null)
    or badge_type = 'manual'
  )
);

create table public.badge_themes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  theme_key text not null,
  name text not null,
  description text,
  palette_json jsonb not null default '{}'::jsonb,
  typography_json jsonb not null default '{}'::jsonb,
  decoration_json jsonb not null default '{}'::jsonb,
  logo_path text,
  status text not null default 'active',
  is_default boolean not null default false,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_themes_scope_unique unique nulls not distinct (tenant_id, theme_key),
  constraint badge_themes_status_check check (status in ('draft', 'active', 'archived')),
  constraint badge_themes_key_check check (theme_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

create unique index badge_themes_one_default_global_idx
  on public.badge_themes (is_default) where tenant_id is null and is_default;
create unique index badge_themes_one_default_tenant_idx
  on public.badge_themes (tenant_id) where tenant_id is not null and is_default;

create table public.tenant_badge_module_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  badges_enabled boolean not null default true,
  automatic_badges_enabled boolean not null default true,
  manual_badges_enabled boolean not null default true,
  custom_badges_enabled boolean not null default false,
  collections_enabled boolean not null default true,
  surprise_badges_enabled boolean not null default true,
  show_unearned_badges boolean not null default true,
  show_locked_surprise_badges boolean not null default true,
  share_images_enabled boolean not null default true,
  badge_notifications_enabled boolean not null default true,
  badge_emails_enabled boolean not null default false,
  instructor_can_award_directly boolean not null default false,
  manual_badge_requires_admin_approval boolean not null default true,
  active_theme_id uuid references public.badge_themes (id) on delete set null,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_badge_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  catalog_definition_id uuid not null references public.badge_catalog_definitions (id) on delete restrict,
  enabled boolean not null default true,
  name_default text,
  name_boy text,
  name_girl text,
  description_default text,
  description_boy text,
  description_girl text,
  share_text_default text,
  share_text_boy text,
  share_text_girl text,
  notifications_enabled boolean,
  emails_enabled boolean,
  share_enabled boolean,
  message_suggestions_enabled boolean not null default true,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_badge_settings_unique unique (tenant_id, catalog_definition_id),
  constraint tenant_badge_settings_tenant_id_id_unique unique (tenant_id, id)
);

create table public.tenant_custom_badges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  badge_key text not null,
  name_default text not null,
  name_boy text,
  name_girl text,
  description_default text not null,
  description_boy text,
  description_girl text,
  share_text_default text,
  share_text_boy text,
  share_text_girl text,
  category text not null default 'specials',
  audience text not null default 'all',
  icon_name text not null default 'sparkles',
  artwork_json jsonb not null default '{}'::jsonb,
  is_surprise boolean not null default false,
  status text not null default 'draft',
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_custom_badges_key_unique unique (tenant_id, badge_key),
  constraint tenant_custom_badges_tenant_id_id_unique unique (tenant_id, id),
  constraint tenant_custom_badges_key_check check (badge_key ~ '^custom_[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint tenant_custom_badges_audience_check check (audience in ('all', 'boys', 'girls')),
  constraint tenant_custom_badges_status_check check (status in ('draft', 'active', 'archived'))
);

create table public.badge_message_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  catalog_definition_id uuid references public.badge_catalog_definitions (id) on delete cascade,
  custom_badge_id uuid,
  suggestion_key text not null,
  suggestion_default text not null,
  suggestion_boy text,
  suggestion_girl text,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_message_suggestions_custom_fk foreign key (tenant_id, custom_badge_id)
    references public.tenant_custom_badges (tenant_id, id) on delete cascade,
  constraint badge_message_suggestions_source_check check (
    (catalog_definition_id is not null and custom_badge_id is null)
    or (catalog_definition_id is null and custom_badge_id is not null and tenant_id is not null)
  ),
  constraint badge_message_suggestions_status_check check (status in ('active', 'archived')),
  constraint badge_message_suggestions_unique unique nulls not distinct (
    tenant_id, catalog_definition_id, custom_badge_id, suggestion_key
  )
);

create table public.badge_collections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  collection_key text not null,
  name text not null,
  description text,
  artwork_json jsonb not null default '{}'::jsonb,
  is_surprise boolean not null default false,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_collections_scope_unique unique nulls not distinct (tenant_id, collection_key),
  constraint badge_collections_status_check check (status in ('draft', 'active', 'archived')),
  constraint badge_collections_key_check check (collection_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

create table public.badge_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.badge_collections (id) on delete cascade,
  catalog_definition_id uuid references public.badge_catalog_definitions (id) on delete cascade,
  custom_badge_id uuid references public.tenant_custom_badges (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint badge_collection_items_source_check check (
    (catalog_definition_id is not null and custom_badge_id is null)
    or (catalog_definition_id is null and custom_badge_id is not null)
  ),
  constraint badge_collection_items_catalog_unique unique (collection_id, catalog_definition_id),
  constraint badge_collection_items_custom_unique unique (collection_id, custom_badge_id)
);

create table public.badge_share_template_sets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  set_key text not null,
  name text not null,
  description text,
  theme_id uuid references public.badge_themes (id) on delete set null,
  status text not null default 'draft',
  is_default boolean not null default false,
  created_by_user_id uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_share_template_sets_scope_unique unique nulls not distinct (tenant_id, set_key),
  constraint badge_share_template_sets_status_check check (status in ('draft', 'published', 'archived'))
);

create table public.badge_share_templates (
  id uuid primary key default gen_random_uuid(),
  template_set_id uuid not null references public.badge_share_template_sets (id) on delete cascade,
  format text not null,
  width integer not null,
  height integer not null,
  layers_json jsonb not null default '[]'::jsonb,
  preview_data_url text,
  status text not null default 'draft',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_share_templates_format_check check (format in ('square', 'story', 'landscape', 'certificate')),
  constraint badge_share_templates_size_check check (width between 320 and 2400 and height between 320 and 2400),
  constraint badge_share_templates_layers_check check (jsonb_typeof(layers_json) = 'array'),
  constraint badge_share_templates_status_check check (status in ('draft', 'published', 'archived')),
  constraint badge_share_templates_unique unique (template_set_id, format)
);

alter table public.participant_badge_awards
  add column if not exists catalog_definition_id uuid references public.badge_catalog_definitions (id) on delete restrict,
  add column if not exists custom_badge_id uuid,
  add column if not exists award_key text,
  add column if not exists approval_status text not null default 'approved',
  add column if not exists reviewed_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists resolved_badge_key text,
  add column if not exists resolved_name text,
  add column if not exists resolved_description text,
  add column if not exists resolved_share_text text,
  add column if not exists participant_gender_snapshot text not null default 'unknown',
  add column if not exists trigger_event_type text,
  add column if not exists trigger_context_json jsonb not null default '{}'::jsonb,
  add column if not exists delivery_status text not null default 'not_requested',
  add column if not exists share_status text not null default 'not_requested';

alter table public.participant_badge_awards
  add constraint participant_badge_awards_custom_fk foreign key (tenant_id, custom_badge_id)
    references public.tenant_custom_badges (tenant_id, id) on delete restrict,
  drop constraint if exists participant_badge_awards_status_check,
  add constraint participant_badge_awards_status_check check (status in ('pending', 'awarded', 'rejected', 'revoked')),
  add constraint participant_badge_awards_approval_check check (approval_status in ('pending', 'approved', 'rejected')),
  add constraint participant_badge_awards_gender_check check (participant_gender_snapshot in ('boy', 'girl', 'unknown')),
  add constraint participant_badge_awards_delivery_check check (delivery_status in ('not_requested', 'queued', 'sent', 'skipped', 'failed')),
  add constraint participant_badge_awards_share_check check (share_status in ('not_requested', 'queued', 'generated', 'failed')),
  add constraint participant_badge_awards_definition_source_check check (
    num_nonnulls(badge_definition_id, catalog_definition_id, custom_badge_id) <= 1
  );

create unique index participant_badge_awards_idempotency_idx
  on public.participant_badge_awards (tenant_id, participant_id, award_key)
  where award_key is not null and status <> 'revoked';

create table public.badge_share_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  award_id uuid not null,
  template_id uuid references public.badge_share_templates (id) on delete set null,
  requested_by_user_id uuid references auth.users (id) on delete set null,
  format text not null,
  status text not null default 'queued',
  storage_path text,
  preview_data_url text,
  caption text,
  error_message text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_share_assets_award_fk foreign key (tenant_id, award_id)
    references public.participant_badge_awards (tenant_id, id) on delete cascade,
  constraint badge_share_assets_format_check check (format in ('square', 'story', 'landscape', 'certificate')),
  constraint badge_share_assets_status_check check (status in ('queued', 'generating', 'generated', 'failed')),
  constraint badge_share_assets_unique unique (tenant_id, award_id, format)
);

create table public.badge_analytics_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid,
  award_id uuid,
  event_type text not null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  is_test boolean not null default false,
  constraint badge_analytics_events_participant_fk foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete set null (participant_id),
  constraint badge_analytics_events_award_fk foreign key (tenant_id, award_id)
    references public.participant_badge_awards (tenant_id, id) on delete set null (award_id),
  constraint badge_analytics_events_type_check check (
    event_type in ('evaluated', 'earned', 'pending_approval', 'approved', 'rejected', 'revoked', 'viewed', 'shared', 'downloaded', 'notification_sent', 'email_sent', 'delivery_skipped')
  )
);

alter table public.guardian_communication_preferences
  add column if not exists badge_notifications_enabled boolean not null default true,
  add column if not exists badge_emails_enabled boolean not null default false,
  add column if not exists badge_sharing_enabled boolean not null default true,
  add column if not exists show_unearned_badges boolean not null default true,
  add column if not exists share_first_name_only boolean not null default true;

create index badge_catalog_category_idx on public.badge_catalog_definitions (category, status, sort_order);
create index tenant_badge_settings_tenant_idx on public.tenant_badge_settings (tenant_id, enabled);
create index tenant_custom_badges_tenant_idx on public.tenant_custom_badges (tenant_id, status, category);
create index badge_collections_scope_idx on public.badge_collections (tenant_id, status, sort_order);
create index badge_share_assets_award_idx on public.badge_share_assets (tenant_id, award_id, status);
create index badge_analytics_events_tenant_idx on public.badge_analytics_events (tenant_id, occurred_at desc, event_type);

create trigger platform_badge_settings_set_updated_at before update on public.platform_badge_settings
  for each row execute function app_private.set_updated_at();
create trigger badge_catalog_definitions_set_updated_at before update on public.badge_catalog_definitions
  for each row execute function app_private.set_updated_at();
create trigger badge_themes_set_updated_at before update on public.badge_themes
  for each row execute function app_private.set_updated_at();
create trigger tenant_badge_module_settings_set_updated_at before update on public.tenant_badge_module_settings
  for each row execute function app_private.set_updated_at();
create trigger tenant_badge_settings_set_updated_at before update on public.tenant_badge_settings
  for each row execute function app_private.set_updated_at();
create trigger tenant_custom_badges_set_updated_at before update on public.tenant_custom_badges
  for each row execute function app_private.set_updated_at();
create trigger badge_message_suggestions_set_updated_at before update on public.badge_message_suggestions
  for each row execute function app_private.set_updated_at();
create trigger badge_collections_set_updated_at before update on public.badge_collections
  for each row execute function app_private.set_updated_at();
create trigger badge_share_template_sets_set_updated_at before update on public.badge_share_template_sets
  for each row execute function app_private.set_updated_at();
create trigger badge_share_templates_set_updated_at before update on public.badge_share_templates
  for each row execute function app_private.set_updated_at();
create trigger badge_share_assets_set_updated_at before update on public.badge_share_assets
  for each row execute function app_private.set_updated_at();

create or replace function app_private.prevent_earned_badge_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status in ('awarded', 'revoked') then
    raise exception 'Earned badge records are immutable; revoke instead of delete.';
  end if;
  return old;
end;
$$;

create or replace function app_private.apply_participant_badge_gender_from_intake()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inferred_gender text;
begin
  if new.gender <> 'unknown' or new.source not in ('intake', 'journey_simulation_bot') then
    return new;
  end if;

  select source_row.participant_gender
  into inferred_gender
  from (
    select intake.participant_gender, intake.received_at as occurred_at
    from public.intake_submissions intake
    where intake.tenant_id = new.tenant_id
      and lower(trim(intake.participant_name)) = lower(trim(new.display_name))
      and (new.birth_date is null or intake.participant_birth_date = new.birth_date)
    union all
    select waitlist.participant_gender, waitlist.created_at
    from public.waitlist_entries waitlist
    where waitlist.tenant_id = new.tenant_id
      and lower(trim(waitlist.participant_name)) = lower(trim(new.display_name))
      and (new.birth_date is null or waitlist.participant_birth_date = new.birth_date)
  ) source_row
  where source_row.participant_gender in ('boy', 'girl')
  order by source_row.occurred_at desc
  limit 1;

  if inferred_gender is not null then
    update public.participants
    set gender = inferred_gender
    where id = new.id and tenant_id = new.tenant_id and gender = 'unknown';
  end if;
  return new;
end;
$$;

drop trigger if exists participant_badge_awards_prevent_delete on public.participant_badge_awards;
create trigger participant_badge_awards_prevent_delete
  before delete on public.participant_badge_awards
  for each row execute function app_private.prevent_earned_badge_deletion();

drop trigger if exists participants_apply_badge_gender_from_intake on public.participants;
create trigger participants_apply_badge_gender_from_intake
  after insert on public.participants
  for each row execute function app_private.apply_participant_badge_gender_from_intake();

revoke all on function app_private.prevent_earned_badge_deletion() from public, anon, authenticated;
revoke all on function app_private.apply_participant_badge_gender_from_intake() from public, anon, authenticated;

grant select on public.platform_badge_settings to authenticated;
grant select on public.badge_catalog_definitions to authenticated;
grant select, insert, update, delete on public.badge_themes to authenticated;
grant select, insert, update, delete on public.tenant_badge_module_settings to authenticated;
grant select, insert, update, delete on public.tenant_badge_settings to authenticated;
grant select, insert, update, delete on public.tenant_custom_badges to authenticated;
grant select, insert, update, delete on public.badge_message_suggestions to authenticated;
grant select, insert, update, delete on public.badge_collections to authenticated;
grant select, insert, update, delete on public.badge_collection_items to authenticated;
grant select, insert, update, delete on public.badge_share_template_sets to authenticated;
grant select, insert, update, delete on public.badge_share_templates to authenticated;
grant select, insert, update, delete on public.badge_share_assets to authenticated;
grant select, insert on public.badge_analytics_events to authenticated;

grant all on public.platform_badge_settings to service_role;
grant all on public.badge_catalog_definitions to service_role;
grant all on public.badge_themes to service_role;
grant all on public.tenant_badge_module_settings to service_role;
grant all on public.tenant_badge_settings to service_role;
grant all on public.tenant_custom_badges to service_role;
grant all on public.badge_message_suggestions to service_role;
grant all on public.badge_collections to service_role;
grant all on public.badge_collection_items to service_role;
grant all on public.badge_share_template_sets to service_role;
grant all on public.badge_share_templates to service_role;
grant all on public.badge_share_assets to service_role;
grant all on public.badge_analytics_events to service_role;

alter table public.platform_badge_settings enable row level security;
alter table public.badge_catalog_definitions enable row level security;
alter table public.badge_themes enable row level security;
alter table public.tenant_badge_module_settings enable row level security;
alter table public.tenant_badge_settings enable row level security;
alter table public.tenant_custom_badges enable row level security;
alter table public.badge_message_suggestions enable row level security;
alter table public.badge_collections enable row level security;
alter table public.badge_collection_items enable row level security;
alter table public.badge_share_template_sets enable row level security;
alter table public.badge_share_templates enable row level security;
alter table public.badge_share_assets enable row level security;
alter table public.badge_analytics_events enable row level security;

alter table public.platform_badge_settings force row level security;
alter table public.badge_catalog_definitions force row level security;
alter table public.badge_themes force row level security;
alter table public.tenant_badge_module_settings force row level security;
alter table public.tenant_badge_settings force row level security;
alter table public.tenant_custom_badges force row level security;
alter table public.badge_message_suggestions force row level security;
alter table public.badge_collections force row level security;
alter table public.badge_collection_items force row level security;
alter table public.badge_share_template_sets force row level security;
alter table public.badge_share_templates force row level security;
alter table public.badge_share_assets force row level security;
alter table public.badge_analytics_events force row level security;

drop policy if exists "Tenant staff and instructors can manage badge definitions" on public.badge_definitions;
create policy "Tenant admins manage legacy badge definitions"
  on public.badge_definitions for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

drop policy if exists "Assigned instructors can manage badge awards" on public.participant_badge_awards;
create policy "Tenant admins manage badge awards"
  on public.participant_badge_awards for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Assigned instructors propose badges"
  on public.participant_badge_awards for insert to authenticated
  with check (
    app_private.current_user_can_instruct_participant(participant_id)
    and status = 'pending'
    and approval_status = 'pending'
  );

create policy "Authenticated users can read badge platform settings"
  on public.platform_badge_settings for select to authenticated using (true);
create policy "Platform admins manage badge platform settings"
  on public.platform_badge_settings for all to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
  with check (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));

create policy "Authenticated users can read active badge catalog"
  on public.badge_catalog_definitions for select to authenticated
  using (status = 'active' or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy "Platform admins manage badge catalog"
  on public.badge_catalog_definitions for all to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
  with check (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));

create policy "Scoped users can read badge themes"
  on public.badge_themes for select to authenticated
  using (
    tenant_id is null
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );
create policy "Badge administrators manage themes"
  on public.badge_themes for all to authenticated
  using (
    (tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
    or (tenant_id is not null and app_private.current_user_can_manage_tenant_domain(tenant_id))
  )
  with check (
    (tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
    or (tenant_id is not null and app_private.current_user_can_manage_tenant_domain(tenant_id))
  );

create policy "Tenant members read badge module settings"
  on public.tenant_badge_module_settings for select to authenticated
  using (
    app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );
create policy "Tenant admins manage badge module settings"
  on public.tenant_badge_module_settings for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant members read badge overrides"
  on public.tenant_badge_settings for select to authenticated
  using (
    app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );
create policy "Tenant admins manage badge overrides"
  on public.tenant_badge_settings for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant members read active custom badges"
  on public.tenant_custom_badges for select to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or (
      status = 'active'
      and app_private.current_user_has_tenant_role(tenant_id, array['instructor', 'parent', 'athlete'])
    )
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );
create policy "Tenant admins manage custom badges"
  on public.tenant_custom_badges for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users read badge suggestions"
  on public.badge_message_suggestions for select to authenticated
  using (
    tenant_id is null
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );
create policy "Badge admins manage suggestions"
  on public.badge_message_suggestions for all to authenticated
  using (
    (tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
    or (tenant_id is not null and app_private.current_user_can_manage_tenant_domain(tenant_id))
  )
  with check (
    (tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
    or (tenant_id is not null and app_private.current_user_can_manage_tenant_domain(tenant_id))
  );

create policy "Scoped users read badge collections"
  on public.badge_collections for select to authenticated
  using (
    tenant_id is null
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );
create policy "Badge admins manage collections"
  on public.badge_collections for all to authenticated
  using (
    (tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
    or (tenant_id is not null and app_private.current_user_can_manage_tenant_domain(tenant_id))
  )
  with check (
    (tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
    or (tenant_id is not null and app_private.current_user_can_manage_tenant_domain(tenant_id))
  );

create policy "Scoped users read badge collection items"
  on public.badge_collection_items for select to authenticated
  using (
    exists (
      select 1
      from public.badge_collections collection
      where collection.id = collection_id
        and (
          collection.tenant_id is null
          or app_private.current_user_has_tenant_role(collection.tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
          or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
        )
    )
  );
create policy "Badge admins manage collection items"
  on public.badge_collection_items for all to authenticated
  using (
    exists (
      select 1 from public.badge_collections collection
      where collection.id = collection_id
        and (
          (collection.tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
          or (collection.tenant_id is not null and app_private.current_user_can_manage_tenant_domain(collection.tenant_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.badge_collections collection
      where collection.id = collection_id
        and (
          (collection.tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
          or (collection.tenant_id is not null and app_private.current_user_can_manage_tenant_domain(collection.tenant_id))
        )
    )
  );

create policy "Scoped users read badge template sets"
  on public.badge_share_template_sets for select to authenticated
  using (
    tenant_id is null
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );
create policy "Badge admins manage template sets"
  on public.badge_share_template_sets for all to authenticated
  using (
    (tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
    or (tenant_id is not null and app_private.current_user_can_manage_tenant_domain(tenant_id))
  )
  with check (
    (tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
    or (tenant_id is not null and app_private.current_user_can_manage_tenant_domain(tenant_id))
  );

create policy "Scoped users read badge templates"
  on public.badge_share_templates for select to authenticated
  using (
    exists (
      select 1 from public.badge_share_template_sets template_set
      where template_set.id = template_set_id
        and (
          template_set.tenant_id is null
          or app_private.current_user_has_tenant_role(template_set.tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
          or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
        )
    )
  );
create policy "Badge admins manage badge templates"
  on public.badge_share_templates for all to authenticated
  using (
    exists (
      select 1 from public.badge_share_template_sets template_set
      where template_set.id = template_set_id
        and (
          (template_set.tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
          or (template_set.tenant_id is not null and app_private.current_user_can_manage_tenant_domain(template_set.tenant_id))
        )
    )
  )
  with check (
    exists (
      select 1 from public.badge_share_template_sets template_set
      where template_set.id = template_set_id
        and (
          (template_set.tenant_id is null and app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
          or (template_set.tenant_id is not null and app_private.current_user_can_manage_tenant_domain(template_set.tenant_id))
        )
    )
  );

create policy "Scoped users manage own badge share assets"
  on public.badge_share_assets for all to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or exists (
      select 1 from public.participant_badge_awards award
      where award.id = award_id
        and award.tenant_id = tenant_id
        and award.visibility = 'parent_visible'
        and app_private.current_user_can_view_participant(award.participant_id)
    )
  )
  with check (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or exists (
      select 1 from public.participant_badge_awards award
      where award.id = award_id
        and award.tenant_id = tenant_id
        and award.visibility = 'parent_visible'
        and app_private.current_user_can_view_participant(award.participant_id)
    )
  );

create policy "Tenant admins read badge analytics"
  on public.badge_analytics_events for select to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );
create policy "Scoped actors add badge analytics"
  on public.badge_analytics_events for insert to authenticated
  with check (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or (participant_id is not null and app_private.current_user_can_view_participant(participant_id))
  );

insert into public.badge_themes (
  tenant_id, theme_key, name, description, palette_json, typography_json, decoration_json, status, is_default
) values (
  null,
  'default',
  'NXTTRACK Default',
  'Rustige premium basis met waterkleuren, hoge leesbaarheid en kindvriendelijke decoratie.',
  '{"primary":"#0877D1","secondary":"#12B8A6","accent":"#F4B740","surface":"#FFFFFF","ink":"#10243E"}'::jsonb,
  '{"heading":"system","body":"system","weight":"rounded-bold"}'::jsonb,
  '{"waves":true,"confetti":"subtle","stars":"subtle"}'::jsonb,
  'active',
  true
) on conflict (tenant_id, theme_key) do update set
  name = excluded.name,
  description = excluded.description,
  palette_json = excluded.palette_json,
  typography_json = excluded.typography_json,
  decoration_json = excluded.decoration_json,
  status = excluded.status,
  is_default = excluded.is_default;

insert into public.badge_catalog_definitions (
  badge_key, name_default, description_default, share_text_default,
  category, badge_type, trigger_type, trigger_config_json, icon_name, is_surprise, sort_order
) values
  ('swim_start_created', 'Zwemstart gemaakt', 'De zwemreis is officieel begonnen.', '{child_first_name} heeft de zwemstart gemaakt!', 'start', 'automatic', 'swim_start_created', '{}', 'waves', false, 10),
  ('first_lesson_attended', 'Eerste Plons', 'De eerste zwemles is gevolgd.', '{child_first_name} maakte de Eerste Plons!', 'attendance', 'automatic', 'attendance_count', '{"count":1}', 'droplets', false, 20),
  ('five_lessons_attended', '5 Lessen Zwemmer', 'Vijf lessen met aandacht gevolgd.', '{child_first_name} zwom al vijf lessen!', 'attendance', 'automatic', 'attendance_count', '{"count":5}', 'calendar-check', false, 30),
  ('ten_lessons_attended', '10 Lessen Kanjer', 'Tien lessen met inzet gevolgd.', '{child_first_name} is een echte lessenkanjer!', 'attendance', 'automatic', 'attendance_count', '{"count":10}', 'medal', false, 40),
  ('twenty_five_lessons_attended', '25 Lessen Volhouder', 'Een prachtige mijlpaal van vijfentwintig lessen.', '{child_first_name} blijft groeien in het water!', 'attendance', 'automatic', 'attendance_count', '{"count":25}', 'trophy', false, 50),
  ('attendance_streak_5', 'Altijd Erbij', 'Vijf lessen achter elkaar aanwezig.', '{child_first_name} was vijf keer achter elkaar erbij!', 'attendance', 'automatic', 'attendance_streak', '{"count":5}', 'flame', false, 60),
  ('attendance_streak_10', 'Super Streak', 'Tien lessen achter elkaar aanwezig.', '{child_first_name} behaalde een Super Streak!', 'attendance', 'automatic', 'attendance_streak', '{"count":10}', 'sparkles', false, 70),
  ('first_progress_item_completed', 'Eerste Stap Behaald', 'Het eerste voortgangsonderdeel is voltooid.', 'De eerste stap van {child_first_name} is behaald!', 'skills', 'automatic', 'progress_item_completed', '{"count":1}', 'footprints', false, 100),
  ('water_confidence_completed', 'Watervriend', 'Meer vertrouwen en plezier in het water.', '{child_first_name} is een echte Watervriend!', 'skills', 'automatic', 'skill_completed', '{"skill":"water_confidence"}', 'heart', false, 110),
  ('underwater_look_completed', 'Onderwater Kijken', 'Rustig onder water durven kijken.', '{child_first_name} durft onder water te kijken!', 'skills', 'automatic', 'skill_completed', '{"skill":"underwater_look"}', 'eye', false, 120),
  ('jump_into_water_completed', 'Eerste Sprong', 'Zelfstandig in het water gesprongen.', '{child_first_name} maakte een moedige sprong!', 'skills', 'automatic', 'skill_completed', '{"skill":"jump_into_water"}', 'zap', false, 130),
  ('float_back_completed', 'Rugdrijfheld', 'Ontspannen op de rug gedreven.', '{child_first_name} is een Rugdrijfheld!', 'skills', 'automatic', 'skill_completed', '{"skill":"float_back"}', 'star', false, 140),
  ('float_front_completed', 'Buikdrijfbaas', 'Sterk en ontspannen op de buik gedreven.', '{child_first_name} is een Buikdrijfbaas!', 'skills', 'automatic', 'skill_completed', '{"skill":"float_front"}', 'star', false, 150),
  ('leg_kick_completed', 'Superbenen', 'De beenslag is beheerst.', '{child_first_name} zwemt met superbenen!', 'skills', 'automatic', 'skill_completed', '{"skill":"leg_kick"}', 'activity', false, 160),
  ('breathing_completed', 'Ademkampioen', 'De ademhaling is goed toegepast.', '{child_first_name} is een Ademkampioen!', 'skills', 'automatic', 'skill_completed', '{"skill":"breathing"}', 'wind', false, 170),
  ('clothing_swim_completed', 'Kledingzwemmer', 'Veilig met kleding gezwommen.', '{child_first_name} kan ook met kleding veilig zwemmen!', 'skills', 'automatic', 'skill_completed', '{"skill":"clothing_swim"}', 'shield', false, 180),
  ('stage_1_completed', 'Badje 1 Behaald — De Zeester', 'Badje 1 is afgerond.', '{child_first_name} behaalde Badje 1!', 'stages', 'automatic', 'stage_completed', '{"stage":1}', 'star', false, 200),
  ('stage_transfer_to_2', 'Door naar Badje 2', 'Klaar voor de volgende stap.', '{child_first_name} mag door naar Badje 2!', 'stages', 'automatic', 'stage_transfer', '{"stage":2}', 'arrow-right', false, 210),
  ('stage_2_completed', 'Badje 2 Behaald — De Schildpad', 'Badje 2 is afgerond.', '{child_first_name} behaalde Badje 2!', 'stages', 'automatic', 'stage_completed', '{"stage":2}', 'shield', false, 220),
  ('stage_transfer_to_3', 'Door naar Badje 3', 'Klaar voor een nieuwe uitdaging.', '{child_first_name} mag door naar Badje 3!', 'stages', 'automatic', 'stage_transfer', '{"stage":3}', 'arrow-right', false, 230),
  ('stage_3_completed', 'Badje 3 Behaald — De Maanvis', 'Badje 3 is afgerond.', '{child_first_name} behaalde Badje 3!', 'stages', 'automatic', 'stage_completed', '{"stage":3}', 'moon', false, 240),
  ('stage_transfer_to_4', 'Door naar Badje 4', 'Klaar voor de laatste badjesfase.', '{child_first_name} mag door naar Badje 4!', 'stages', 'automatic', 'stage_transfer', '{"stage":4}', 'arrow-right', false, 250),
  ('stage_4_completed', 'Badje 4 Behaald — De Krokodil', 'Badje 4 is afgerond.', '{child_first_name} behaalde Badje 4!', 'stages', 'automatic', 'stage_completed', '{"stage":4}', 'award', false, 260),
  ('afzwem_ready', 'Afzwem-ready', 'Door een mens goedgekeurd als klaar voor afzwemmen.', '{child_first_name} is klaar voor het afzwemmoment!', 'stages', 'automatic', 'graduation_ready', '{}', 'sparkles', false, 270),
  ('certificate_a_issued', 'Diploma A Held', 'Zwemdiploma A is uitgegeven.', '{child_first_name} behaalde diploma A!', 'diplomas', 'automatic', 'certificate_issued', '{"certificate":"A"}', 'graduation-cap', false, 300),
  ('certificate_b_issued', 'Diploma B Held', 'Zwemdiploma B is uitgegeven.', '{child_first_name} behaalde diploma B!', 'diplomas', 'automatic', 'certificate_issued', '{"certificate":"B"}', 'graduation-cap', false, 310),
  ('certificate_c_issued', 'Diploma C Held', 'Zwemdiploma C is uitgegeven.', '{child_first_name} behaalde diploma C!', 'diplomas', 'automatic', 'certificate_issued', '{"certificate":"C"}', 'graduation-cap', false, 320),
  ('abc_complete', 'Zwemkampioen', 'Diploma A, B en C zijn compleet.', '{child_first_name} is een echte zwemkampioen!', 'diplomas', 'automatic', 'certificate_series_completed', '{"certificates":["A","B","C"]}', 'crown', false, 330),
  ('first_makeup_booked', 'Inhaalplanner', 'De eerste inhaalles is geboekt.', '{child_first_name} heeft een inhaalles gepland.', 'makeup', 'automatic', 'makeup_booked', '{"count":1}', 'calendar-plus', false, 350),
  ('first_makeup_attended', 'Terug in het Water', 'Een inhaalles is gevolgd.', '{child_first_name} is weer terug in het water!', 'makeup', 'automatic', 'makeup_attended', '{"count":1}', 'refresh-cw', false, 360),
  ('vacation_lesson_attended', 'Vakantiezwemmer', 'Een vakantieles is gevolgd.', '{child_first_name} bleef zwemmen in de vakantie!', 'makeup', 'automatic', 'vacation_lesson_attended', '{}', 'sun', false, 370),
  ('manual_compliment', 'Complimentje', 'Een persoonlijk compliment van de instructeur.', '{child_first_name} kreeg een mooi compliment!', 'compliments', 'manual', null, '{}', 'heart', false, 400),
  ('manual_super_effort', 'Super Inzet', 'Veel inzet en doorzettingsvermogen getoond.', '{child_first_name} liet superveel inzet zien!', 'compliments', 'manual', null, '{}', 'zap', false, 410),
  ('manual_good_listening', 'Goed Geluisterd', 'Met aandacht naar de uitleg geluisterd.', '{child_first_name} luisterde heel goed!', 'compliments', 'manual', null, '{}', 'ear', false, 420),
  ('manual_proud_moment', 'Trotsmoment', 'Een bijzonder moment om trots op te zijn.', 'Een echt trotsmoment voor {child_first_name}!', 'compliments', 'manual', null, '{}', 'star', false, 430),
  ('manual_focus_champion', 'Focuskampioen', 'Met sterke concentratie geoefend.', '{child_first_name} was een echte focuskampioen!', 'compliments', 'manual', null, '{}', 'target', false, 440),
  ('manual_helper', 'Helper van de Les', 'Sociaal en helpend gedrag getoond.', '{child_first_name} hielp anderen in de les!', 'compliments', 'manual', null, '{}', 'hand-heart', false, 450),
  ('manual_brave_diver', 'Dappere Duiker', 'Moedig onder water gedoken.', '{child_first_name} was een dappere duiker!', 'courage', 'manual', null, '{}', 'waves', false, 500),
  ('manual_brave_jump', 'Moedige Sprong', 'Een spannende sprong gemaakt.', '{child_first_name} maakte een moedige sprong!', 'courage', 'manual', null, '{}', 'zap', false, 510),
  ('manual_underwater_king', 'Onderwater Koning', 'Sterk onder water gekeken en gedoken.', '{child_first_name} heerste onder water!', 'courage', 'manual', null, '{}', 'crown', false, 520),
  ('manual_i_dared_it', 'Ik Durfde Het!', 'Een angst overwonnen.', '{child_first_name} durfde het gewoon!', 'courage', 'manual', null, '{}', 'sparkles', false, 530),
  ('manual_small_hero', 'Kleine Held', 'Een spannend moment overwonnen.', '{child_first_name} was een kleine held!', 'courage', 'manual', null, '{}', 'shield', false, 540),
  ('manual_step_forward', 'Nieuwe Stap Gezet', 'Een betekenisvolle persoonlijke stap gezet.', '{child_first_name} zette een nieuwe stap!', 'courage', 'manual', null, '{}', 'footprints', false, 550),
  ('manual_super_legs', 'Superbenen', 'Een compliment voor de beenslag.', '{child_first_name} liet superbenen zien!', 'technique', 'manual', null, '{}', 'activity', false, 600),
  ('manual_float_champion', 'Drijfkampioen', 'Prachtig en rustig gedreven.', '{child_first_name} is een drijfkampioen!', 'technique', 'manual', null, '{}', 'cloud', false, 610),
  ('manual_bubble_blower', 'Bellenblazer', 'De ademhaling en belletjes gingen goed.', '{child_first_name} blies de mooiste bellen!', 'technique', 'manual', null, '{}', 'circle-dot', false, 620),
  ('manual_jump_champion', 'Springkampioen', 'Een sterke sprong gemaakt.', '{child_first_name} is een springkampioen!', 'technique', 'manual', null, '{}', 'trophy', false, 630),
  ('manual_strong_arms', 'Sterke Armen', 'Een compliment voor de armslag.', '{child_first_name} zwom met sterke armen!', 'technique', 'manual', null, '{}', 'dumbbell', false, 640)
on conflict (badge_key) do update set
  name_default = excluded.name_default,
  description_default = excluded.description_default,
  share_text_default = excluded.share_text_default,
  category = excluded.category,
  badge_type = excluded.badge_type,
  trigger_type = excluded.trigger_type,
  trigger_config_json = excluded.trigger_config_json,
  icon_name = excluded.icon_name,
  is_surprise = excluded.is_surprise,
  sort_order = excluded.sort_order;

insert into public.badge_message_suggestions (
  tenant_id, catalog_definition_id, suggestion_key, suggestion_default, suggestion_boy, suggestion_girl, sort_order
)
select
  null,
  badge.id,
  suggestion.key,
  replace(suggestion.text, '{badge}', badge.name_default),
  replace(suggestion.text, '{badge}', coalesce(badge.name_boy, badge.name_default)),
  replace(suggestion.text, '{badge}', coalesce(badge.name_girl, badge.name_default)),
  suggestion.sort_order
from public.badge_catalog_definitions badge
cross join (
  values
    ('warm', 'Wat een mooie stap: {badge}. Blijf met zoveel plezier oefenen!', 10),
    ('short', 'Trots op jou: {badge}!', 20),
    ('growth', 'Je inzet is zichtbaar. Vandaag verdiende je {badge}.', 30)
) as suggestion(key, text, sort_order)
on conflict (tenant_id, catalog_definition_id, custom_badge_id, suggestion_key) do update set
  suggestion_default = excluded.suggestion_default,
  suggestion_boy = excluded.suggestion_boy,
  suggestion_girl = excluded.suggestion_girl,
  sort_order = excluded.sort_order;

insert into public.badge_collections (tenant_id, collection_key, name, description, status, sort_order)
values
  (null, 'collection_start', 'Zwemstart', 'De eerste momenten van de zwemreis.', 'active', 10),
  (null, 'collection_water_confidence', 'Watervertrouwen', 'Zelfvertrouwen en basisvaardigheden in het water.', 'active', 20),
  (null, 'collection_stage_1', 'Badje 1 Reis', 'Mijlpalen rond Badje 1.', 'active', 30),
  (null, 'collection_stage_2', 'Badje 2 Reis', 'Mijlpalen rond Badje 2.', 'active', 40),
  (null, 'collection_attendance', 'Aanwezigheid', 'Lessen en mooie reeksen.', 'active', 50),
  (null, 'collection_diplomas', 'Diploma''s', 'Diploma A, B, C en de complete zwemreis.', 'active', 60),
  (null, 'collection_compliments', 'Complimenten', 'Persoonlijke complimenten van instructeurs.', 'active', 70),
  (null, 'collection_specials', 'Specials', 'Verrassingen, seizoensmomenten en tenantbadges.', 'active', 80)
on conflict (tenant_id, collection_key) do update set
  name = excluded.name, description = excluded.description, status = excluded.status, sort_order = excluded.sort_order;

with mapping(collection_key, badge_key, sort_order) as (
  values
    ('collection_start', 'swim_start_created', 10),
    ('collection_start', 'first_lesson_attended', 20),
    ('collection_start', 'five_lessons_attended', 30),
    ('collection_water_confidence', 'water_confidence_completed', 10),
    ('collection_water_confidence', 'underwater_look_completed', 20),
    ('collection_water_confidence', 'jump_into_water_completed', 30),
    ('collection_water_confidence', 'manual_brave_diver', 40),
    ('collection_stage_1', 'stage_1_completed', 10),
    ('collection_stage_1', 'stage_transfer_to_2', 20),
    ('collection_stage_1', 'float_back_completed', 30),
    ('collection_stage_2', 'stage_2_completed', 10),
    ('collection_stage_2', 'stage_transfer_to_3', 20),
    ('collection_stage_2', 'leg_kick_completed', 30),
    ('collection_attendance', 'five_lessons_attended', 10),
    ('collection_attendance', 'ten_lessons_attended', 20),
    ('collection_attendance', 'twenty_five_lessons_attended', 30),
    ('collection_attendance', 'attendance_streak_5', 40),
    ('collection_attendance', 'attendance_streak_10', 50),
    ('collection_diplomas', 'certificate_a_issued', 10),
    ('collection_diplomas', 'certificate_b_issued', 20),
    ('collection_diplomas', 'certificate_c_issued', 30),
    ('collection_diplomas', 'abc_complete', 40),
    ('collection_compliments', 'manual_compliment', 10),
    ('collection_compliments', 'manual_super_effort', 20),
    ('collection_compliments', 'manual_good_listening', 30),
    ('collection_specials', 'vacation_lesson_attended', 10)
)
insert into public.badge_collection_items (collection_id, catalog_definition_id, sort_order)
select collection.id, badge.id, mapping.sort_order
from mapping
join public.badge_collections collection
  on collection.tenant_id is null and collection.collection_key = mapping.collection_key
join public.badge_catalog_definitions badge on badge.badge_key = mapping.badge_key
on conflict (collection_id, catalog_definition_id) do update set sort_order = excluded.sort_order;

insert into public.badge_share_template_sets (
  tenant_id, set_key, name, description, theme_id, status, is_default, published_at
)
select
  null, 'nxttrack_default', 'NXTTRACK Default', 'Veilige premium shareformats met alleen de voornaam van het kind.',
  theme.id, 'published', true, now()
from public.badge_themes theme
where theme.tenant_id is null and theme.theme_key = 'default'
on conflict (tenant_id, set_key) do update set
  name = excluded.name, description = excluded.description, theme_id = excluded.theme_id,
  status = excluded.status, is_default = excluded.is_default, published_at = excluded.published_at;

insert into public.badge_share_templates (template_set_id, format, width, height, layers_json, status)
select
  template_set.id,
  format.name,
  format.width,
  format.height,
  jsonb_build_array(
    jsonb_build_object('id','background','type','shape','x',0,'y',0,'width',format.width,'height',format.height,'fill','#EAF8FF','locked',true),
    jsonb_build_object('id','badge','type','badge','x',round(format.width * 0.25),'y',round(format.height * 0.16),'width',round(format.width * 0.5),'height',round(format.width * 0.5)),
    jsonb_build_object('id','title','type','text','x',round(format.width * 0.1),'y',round(format.height * 0.69),'width',round(format.width * 0.8),'height',90,'text','{badge_name_gendered}','align','center','fontSize',52,'fontWeight',800,'fill','#10243E'),
    jsonb_build_object('id','child','type','text','x',round(format.width * 0.1),'y',round(format.height * 0.8),'width',round(format.width * 0.8),'height',60,'text','{child_first_name}','align','center','fontSize',34,'fontWeight',700,'fill','#0877D1')
  ),
  'published'
from public.badge_share_template_sets template_set
cross join (
  values
    ('square', 1080, 1080),
    ('story', 1080, 1920),
    ('landscape', 1200, 630),
    ('certificate', 1600, 1131)
) as format(name, width, height)
where template_set.tenant_id is null and template_set.set_key = 'nxttrack_default'
on conflict (template_set_id, format) do update set
  width = excluded.width, height = excluded.height, layers_json = excluded.layers_json, status = excluded.status;

comment on table public.badge_catalog_definitions is
  'Global immutable-key badge canon. Existing tenant badge_definitions remains as the backwards-compatible tenant materialization.';
comment on column public.participants.gender is
  'Presentation-only badge copy selector; never usable for placement, progress, waitlist or payment decisions.';
