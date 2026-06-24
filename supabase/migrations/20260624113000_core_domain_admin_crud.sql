alter table public.programs
  add constraint programs_id_tenant_unique unique (id, tenant_id);

alter table public.stages
  add constraint stages_id_tenant_unique unique (id, tenant_id),
  add constraint stages_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete cascade;

alter table public.subscription_plans
  add constraint subscription_plans_id_tenant_unique unique (id, tenant_id);

alter table public.resources
  add constraint resources_id_tenant_unique unique (id, tenant_id);

alter table public.instructors
  add constraint instructors_id_tenant_unique unique (id, tenant_id);

alter table public.groups
  add constraint groups_id_tenant_unique unique (id, tenant_id),
  add constraint groups_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete restrict,
  add constraint groups_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id) on delete restrict,
  add constraint groups_resource_tenant_fk foreign key (resource_id, tenant_id) references public.resources (id, tenant_id),
  add constraint groups_instructor_tenant_fk foreign key (instructor_id, tenant_id) references public.instructors (id, tenant_id);

alter table public.sessions
  add constraint sessions_id_tenant_unique unique (id, tenant_id),
  add constraint sessions_group_tenant_fk foreign key (group_id, tenant_id) references public.groups (id, tenant_id) on delete cascade,
  add constraint sessions_resource_tenant_fk foreign key (resource_id, tenant_id) references public.resources (id, tenant_id),
  add constraint sessions_instructor_tenant_fk foreign key (instructor_id, tenant_id) references public.instructors (id, tenant_id);

alter table public.participants
  add constraint participants_id_tenant_unique unique (id, tenant_id);

alter table public.enrollments
  add constraint enrollments_id_tenant_unique unique (id, tenant_id),
  add constraint enrollments_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  add constraint enrollments_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete restrict,
  add constraint enrollments_stage_tenant_fk foreign key (current_stage_id, tenant_id) references public.stages (id, tenant_id),
  add constraint enrollments_subscription_plan_tenant_fk foreign key (subscription_plan_id, tenant_id) references public.subscription_plans (id, tenant_id);

alter table public.group_memberships
  add constraint group_memberships_id_tenant_unique unique (id, tenant_id),
  add constraint group_memberships_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  add constraint group_memberships_group_tenant_fk foreign key (group_id, tenant_id) references public.groups (id, tenant_id) on delete cascade;

alter table public.progress
  add constraint progress_id_tenant_unique unique (id, tenant_id),
  add constraint progress_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  add constraint progress_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id);

alter table public.badges
  add constraint badges_id_tenant_unique unique (id, tenant_id),
  add constraint badges_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete cascade,
  add constraint badges_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id) on delete cascade;

alter table public.certificates
  add constraint certificates_id_tenant_unique unique (id, tenant_id),
  add constraint certificates_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id),
  add constraint certificates_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  add constraint certificates_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete restrict;

grant insert (tenant_id, code, name, description, status, sort_order) on public.programs to authenticated;
grant update (code, name, description, status, sort_order) on public.programs to authenticated;

grant insert (tenant_id, program_id, code, name, description, status, sort_order) on public.stages to authenticated;
grant update (program_id, code, name, description, status, sort_order) on public.stages to authenticated;

grant insert (tenant_id, code, name, description, billing_interval, price_cents, currency, lesson_frequency_per_week, status) on public.subscription_plans to authenticated;
grant update (code, name, description, billing_interval, price_cents, currency, lesson_frequency_per_week, status) on public.subscription_plans to authenticated;

grant insert (tenant_id, code, name, resource_type, location_name, capacity, status) on public.resources to authenticated;
grant update (code, name, resource_type, location_name, capacity, status) on public.resources to authenticated;

grant insert (tenant_id, profile_id, display_name, email, status) on public.instructors to authenticated;
grant update (profile_id, display_name, email, status) on public.instructors to authenticated;

grant insert (tenant_id, program_id, stage_id, resource_id, instructor_id, code, name, weekday, starts_at, ends_at, capacity, status) on public.groups to authenticated;
grant update (program_id, stage_id, resource_id, instructor_id, code, name, weekday, starts_at, ends_at, capacity, status) on public.groups to authenticated;

grant insert (tenant_id, group_id, resource_id, instructor_id, starts_at, ends_at, status) on public.sessions to authenticated;
grant update (group_id, resource_id, instructor_id, starts_at, ends_at, status) on public.sessions to authenticated;

grant insert (tenant_id, external_reference, display_name, birthdate, status) on public.participants to authenticated;
grant update (external_reference, display_name, birthdate, status) on public.participants to authenticated;

grant insert (tenant_id, external_reference, participant_id, program_id, current_stage_id, subscription_plan_id, status, started_on, ended_on) on public.enrollments to authenticated;
grant update (external_reference, participant_id, program_id, current_stage_id, subscription_plan_id, status, started_on, ended_on) on public.enrollments to authenticated;

grant insert (tenant_id, enrollment_id, group_id, status, starts_on, ends_on) on public.group_memberships to authenticated;
grant update (enrollment_id, group_id, status, starts_on, ends_on) on public.group_memberships to authenticated;

create policy "Tenant staff can insert programs"
  on public.programs
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update programs"
  on public.programs
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert stages"
  on public.stages
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update stages"
  on public.stages
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert subscription plans"
  on public.subscription_plans
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update subscription plans"
  on public.subscription_plans
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert resources"
  on public.resources
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update resources"
  on public.resources
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert instructors"
  on public.instructors
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update instructors"
  on public.instructors
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert groups"
  on public.groups
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update groups"
  on public.groups
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert sessions"
  on public.sessions
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update sessions"
  on public.sessions
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert participants"
  on public.participants
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update participants"
  on public.participants
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert enrollments"
  on public.enrollments
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update enrollments"
  on public.enrollments
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert group memberships"
  on public.group_memberships
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update group memberships"
  on public.group_memberships
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );
