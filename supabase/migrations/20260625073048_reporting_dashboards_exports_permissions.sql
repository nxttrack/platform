alter table public.report_export_requests
  drop constraint if exists report_export_requests_type_check;

alter table public.report_export_requests
  add constraint report_export_requests_type_check
    check (report_type in ('occupancy', 'waitlist', 'progress', 'attendance', 'payments', 'revenue'));

alter table public.report_export_requests
  add column if not exists program_id uuid,
  add column if not exists stage_id uuid,
  add column if not exists group_id uuid,
  add column if not exists instructor_id uuid,
  add column if not exists status_filter text,
  add column if not exists date_from date,
  add column if not exists date_to date,
  add column if not exists row_count integer,
  add column if not exists export_scope text not null default 'tenant_admin';

alter table public.report_export_requests
  drop constraint if exists report_export_requests_period_check,
  drop constraint if exists report_export_requests_row_count_check,
  drop constraint if exists report_export_requests_export_scope_check;

alter table public.report_export_requests
  add constraint report_export_requests_period_check
    check (date_from is null or date_to is null or date_from <= date_to),
  add constraint report_export_requests_row_count_check
    check (row_count is null or row_count >= 0),
  add constraint report_export_requests_export_scope_check
    check (export_scope in ('tenant_admin', 'instructor', 'platform_admin'));

alter table public.report_export_requests
  drop constraint if exists report_export_requests_program_tenant_fk,
  drop constraint if exists report_export_requests_stage_tenant_fk,
  drop constraint if exists report_export_requests_group_tenant_fk,
  drop constraint if exists report_export_requests_instructor_tenant_fk;

alter table public.report_export_requests
  add constraint report_export_requests_program_tenant_fk
    foreign key (program_id, tenant_id) references public.programs (id, tenant_id),
  add constraint report_export_requests_stage_tenant_fk
    foreign key (stage_id, tenant_id) references public.stages (id, tenant_id),
  add constraint report_export_requests_group_tenant_fk
    foreign key (group_id, tenant_id) references public.groups (id, tenant_id),
  add constraint report_export_requests_instructor_tenant_fk
    foreign key (instructor_id, tenant_id) references public.instructors (id, tenant_id);

create index if not exists report_export_requests_filter_idx
  on public.report_export_requests (tenant_id, report_type, program_id, stage_id, group_id, instructor_id, created_at desc);

create table public.report_permission_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  report_key text not null,
  role text not null,
  can_view boolean not null default true,
  can_export boolean not null default false,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_permission_grants_key_check check (report_key in ('occupancy', 'waitlist', 'progress', 'attendance', 'payments', 'revenue', 'exports')),
  constraint report_permission_grants_role_check check (role in ('tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor')),
  constraint report_permission_grants_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint report_permission_grants_unique unique (tenant_id, report_key, role)
);

create index report_permission_grants_tenant_role_idx
  on public.report_permission_grants (tenant_id, role, report_key);

create trigger report_permission_grants_set_updated_at
  before update on public.report_permission_grants
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.report_permission_grants to authenticated;
grant all on public.report_permission_grants to service_role;

alter table public.report_permission_grants enable row level security;

create policy "Tenant staff can view report permission grants"
  on public.report_permission_grants
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

create policy "Tenant admins can manage report permission grants"
  on public.report_permission_grants
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  );

create policy "Tenant admins can update report permission grants"
  on public.report_permission_grants
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  );

create trigger report_permission_grants_audit_events
  after insert or update or delete on public.report_permission_grants
  for each row execute function app_private.record_audit_event();

do $$
declare
  demo_tenant_id uuid;
  seed_report_key text;
  grant_role text;
begin
  select id into demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if demo_tenant_id is null then
    return;
  end if;

  foreach seed_report_key in array array['occupancy', 'waitlist', 'progress', 'attendance', 'payments', 'revenue', 'exports']
  loop
    foreach grant_role in array array['tenant_owner', 'tenant_admin', 'tenant_staff']
    loop
      insert into public.report_permission_grants (
        tenant_id,
        report_key,
        role,
        can_view,
        can_export,
        metadata
      )
      values (
        demo_tenant_id,
        seed_report_key,
        grant_role,
        true,
        true,
        '{"seed":"reporting_dashboards_exports_permissions"}'::jsonb
      )
      on conflict (tenant_id, report_key, role) do update
        set can_view = excluded.can_view,
            can_export = excluded.can_export,
            metadata = excluded.metadata;
    end loop;
  end loop;

  foreach seed_report_key in array array['occupancy', 'waitlist', 'progress', 'attendance']
  loop
    insert into public.report_permission_grants (
      tenant_id,
      report_key,
      role,
      can_view,
      can_export,
      metadata
    )
    values (
      demo_tenant_id,
      seed_report_key,
      'instructor',
      true,
      false,
      '{"seed":"reporting_dashboards_exports_permissions"}'::jsonb
    )
    on conflict (tenant_id, report_key, role) do update
      set can_view = excluded.can_view,
          can_export = excluded.can_export,
          metadata = excluded.metadata;
  end loop;
end $$;
