create index if not exists groups_tenant_weekday_time_idx
  on public.groups (tenant_id, weekday, starts_at, ends_at)
  where status in ('draft', 'active', 'paused');

create index if not exists groups_tenant_resource_time_idx
  on public.groups (tenant_id, resource_id, weekday, starts_at, ends_at)
  where resource_id is not null and status in ('draft', 'active', 'paused');

create index if not exists groups_tenant_instructor_time_idx
  on public.groups (tenant_id, instructor_id, weekday, starts_at, ends_at)
  where instructor_id is not null and status in ('draft', 'active', 'paused');

create index if not exists sessions_tenant_group_start_idx
  on public.sessions (tenant_id, group_id, starts_at);

create index if not exists sessions_tenant_resource_time_idx
  on public.sessions (tenant_id, resource_id, starts_at, ends_at)
  where resource_id is not null and status in ('scheduled', 'completed');

create index if not exists sessions_tenant_instructor_time_idx
  on public.sessions (tenant_id, instructor_id, starts_at, ends_at)
  where instructor_id is not null and status in ('scheduled', 'completed');

create index if not exists session_attendance_reporting_idx
  on public.session_attendance (tenant_id, session_id, status, recorded_at desc);

create index if not exists lesson_catch_up_requests_admin_lifecycle_idx
  on public.lesson_catch_up_requests (tenant_id, status, requested_at desc);
