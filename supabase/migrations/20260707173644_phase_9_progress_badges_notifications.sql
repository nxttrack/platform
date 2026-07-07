alter table public.badge_definitions
  add column if not exists icon_name text,
  add column if not exists sort_order integer not null default 0;

create table public.progress_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid,
  stage_id uuid,
  code text,
  name text not null,
  description text,
  template_key text,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint progress_modules_program_fk foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete restrict,
  constraint progress_modules_stage_fk foreign key (tenant_id, stage_id) references public.program_stages (tenant_id, id) on delete restrict,
  constraint progress_modules_status_check check (status in ('active', 'archived')),
  constraint progress_modules_tenant_id_id_unique unique (tenant_id, id),
  constraint progress_modules_tenant_code_unique unique (tenant_id, code)
);

create table public.progress_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_id uuid not null,
  code text,
  name text not null,
  description text,
  positive_goal text,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint progress_items_module_fk foreign key (tenant_id, module_id) references public.progress_modules (tenant_id, id) on delete cascade,
  constraint progress_items_status_check check (status in ('active', 'archived')),
  constraint progress_items_tenant_id_id_unique unique (tenant_id, id),
  constraint progress_items_tenant_module_id_unique unique (tenant_id, module_id, id),
  constraint progress_items_tenant_module_code_unique unique (tenant_id, module_id, code)
);

create table public.participant_progress_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid,
  module_id uuid not null,
  item_id uuid not null,
  session_id uuid,
  score integer not null,
  positive_label text not null,
  note text,
  visibility text not null default 'parent_visible',
  status text not null default 'active',
  scored_by_user_id uuid references auth.users (id) on delete set null,
  scored_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_progress_scores_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint participant_progress_scores_enrollment_fk foreign key (tenant_id, enrollment_id, participant_id) references public.enrollments (tenant_id, id, participant_id) on delete restrict,
  constraint participant_progress_scores_module_fk foreign key (tenant_id, module_id) references public.progress_modules (tenant_id, id) on delete restrict,
  constraint participant_progress_scores_item_fk foreign key (tenant_id, module_id, item_id) references public.progress_items (tenant_id, module_id, id) on delete restrict,
  constraint participant_progress_scores_session_fk foreign key (tenant_id, session_id) references public.sessions (tenant_id, id) on delete restrict,
  constraint participant_progress_scores_score_check check (score between 1 and 5),
  constraint participant_progress_scores_visibility_check check (visibility in ('internal', 'parent_visible')),
  constraint participant_progress_scores_status_check check (status in ('active', 'archived')),
  constraint participant_progress_scores_tenant_id_id_unique unique (tenant_id, id),
  constraint participant_progress_scores_unique_current unique (tenant_id, participant_id, item_id)
);

create table public.tenant_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  participant_id uuid,
  type text not null,
  title text not null,
  message text not null,
  status text not null default 'unread',
  related_progress_score_id uuid,
  related_badge_award_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint tenant_notifications_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint tenant_notifications_progress_score_fk foreign key (tenant_id, related_progress_score_id) references public.participant_progress_scores (tenant_id, id) on delete restrict,
  constraint tenant_notifications_badge_award_fk foreign key (tenant_id, related_badge_award_id) references public.participant_badge_awards (tenant_id, id) on delete restrict,
  constraint tenant_notifications_type_check check (type in ('progress_score', 'badge_award', 'system')),
  constraint tenant_notifications_status_check check (status in ('unread', 'read', 'archived')),
  constraint tenant_notifications_read_at_check check ((status = 'read' and read_at is not null) or (status <> 'read'))
);

create index if not exists badge_definitions_tenant_sort_idx on public.badge_definitions (tenant_id, status, sort_order, name);
create index progress_modules_tenant_status_idx on public.progress_modules (tenant_id, status, sort_order);
create index progress_modules_program_stage_idx on public.progress_modules (tenant_id, program_id, stage_id, sort_order);
create index progress_items_module_idx on public.progress_items (tenant_id, module_id, status, sort_order);
create index participant_progress_scores_participant_idx on public.participant_progress_scores (tenant_id, participant_id, scored_at desc);
create index participant_progress_scores_item_idx on public.participant_progress_scores (tenant_id, item_id, score);
create index tenant_notifications_recipient_idx on public.tenant_notifications (recipient_user_id, status, created_at desc);
create index tenant_notifications_participant_idx on public.tenant_notifications (tenant_id, participant_id, created_at desc);

create trigger progress_modules_set_updated_at
  before update on public.progress_modules
  for each row execute function app_private.set_updated_at();

create trigger progress_items_set_updated_at
  before update on public.progress_items
  for each row execute function app_private.set_updated_at();

create trigger participant_progress_scores_set_updated_at
  before update on public.participant_progress_scores
  for each row execute function app_private.set_updated_at();

create function app_private.current_user_can_notify_participant_guardian(target_participant_id uuid, target_recipient_user_id uuid)
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
        participant.guardian_user_id = target_recipient_user_id
        or exists (
          select 1
          from public.participant_guardians guardian
          where guardian.tenant_id = participant.tenant_id
            and guardian.participant_id = participant.id
            and guardian.guardian_user_id = target_recipient_user_id
            and guardian.status = 'active'
        )
      )
      and (
        app_private.current_user_can_manage_tenant_domain(participant.tenant_id)
        or app_private.current_user_can_instruct_participant(participant.id)
      )
  );
$$;

revoke all on function app_private.current_user_can_notify_participant_guardian(uuid, uuid) from public;

grant execute on function app_private.current_user_can_notify_participant_guardian(uuid, uuid) to authenticated;
grant execute on function app_private.current_user_can_notify_participant_guardian(uuid, uuid) to service_role;

grant select, insert, update, delete on public.progress_modules to authenticated;
grant select, insert, update, delete on public.progress_items to authenticated;
grant select, insert, update, delete on public.participant_progress_scores to authenticated;
grant select, insert, update, delete on public.tenant_notifications to authenticated;

grant all on public.progress_modules to service_role;
grant all on public.progress_items to service_role;
grant all on public.participant_progress_scores to service_role;
grant all on public.tenant_notifications to service_role;

alter table public.progress_modules enable row level security;
alter table public.progress_items enable row level security;
alter table public.participant_progress_scores enable row level security;
alter table public.tenant_notifications enable row level security;

create policy "Tenant members can view progress modules"
  on public.progress_modules
  for select
  to authenticated
  using (
    app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );

create policy "Tenant staff and instructors can manage progress modules"
  on public.progress_modules
  for all
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
  )
  with check (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
  );

create policy "Tenant members can view progress items"
  on public.progress_items
  for select
  to authenticated
  using (
    app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );

create policy "Tenant staff and instructors can manage progress items"
  on public.progress_items
  for all
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
  )
  with check (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
  );

create policy "Scoped users can view progress scores"
  on public.participant_progress_scores
  for select
  to authenticated
  using (
    app_private.current_user_can_instruct_participant(participant_id)
    or (
      visibility = 'parent_visible'
      and app_private.current_user_can_view_participant(participant_id)
    )
  );

create policy "Assigned instructors can manage progress scores"
  on public.participant_progress_scores
  for all
  to authenticated
  using (app_private.current_user_can_instruct_participant(participant_id))
  with check (app_private.current_user_can_instruct_participant(participant_id));

create policy "Recipients and tenant staff can view notifications"
  on public.tenant_notifications
  for select
  to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
  );

create policy "Recipients and tenant staff can update notifications"
  on public.tenant_notifications
  for update
  to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
  )
  with check (
    recipient_user_id = (select auth.uid())
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
  );

create policy "Tenant staff and assigned instructors can create notifications"
  on public.tenant_notifications
  for insert
  to authenticated
  with check (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or (
      participant_id is not null
      and app_private.current_user_can_notify_participant_guardian(participant_id, recipient_user_id)
    )
  );

create policy "Tenant staff can delete notifications"
  on public.tenant_notifications
  for delete
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));
