alter table public.tenant_notifications
  drop constraint if exists tenant_notifications_type_check,
  add constraint tenant_notifications_type_check check (type in ('progress_score', 'badge_award', 'graduation_invite', 'certificate_issued', 'payment_due', 'payment_overdue', 'payment_received', 'admin_message', 'task_assigned', 'document_published', 'report_ready', 'system'));

create table public.tenant_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  author_user_id uuid references auth.users (id) on delete set null,
  title text not null,
  body text not null,
  audience text not null default 'tenant_staff',
  visibility text not null default 'internal',
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_messages_audience_check check (audience in ('tenant_staff', 'instructors', 'parents', 'all_tenant')),
  constraint tenant_messages_visibility_check check (visibility in ('internal', 'portal')),
  constraint tenant_messages_status_check check (status in ('draft', 'published', 'archived')),
  constraint tenant_messages_published_check check ((status = 'published' and published_at is not null) or status <> 'published'),
  constraint tenant_messages_tenant_id_id_unique unique (tenant_id, id)
);

create table public.tenant_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  created_by_user_id uuid references auth.users (id) on delete set null,
  assigned_to_user_id uuid references auth.users (id) on delete set null,
  related_participant_id uuid,
  title text not null,
  description text,
  priority text not null default 'normal',
  status text not null default 'open',
  due_on date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_tasks_participant_fk foreign key (tenant_id, related_participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint tenant_tasks_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint tenant_tasks_status_check check (status in ('open', 'in_progress', 'done', 'cancelled')),
  constraint tenant_tasks_completed_check check ((status = 'done' and completed_at is not null) or status <> 'done'),
  constraint tenant_tasks_tenant_id_id_unique unique (tenant_id, id)
);

create table public.tenant_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  uploaded_by_user_id uuid references auth.users (id) on delete set null,
  title text not null,
  description text,
  audience text not null default 'tenant_staff',
  visibility text not null default 'internal',
  status text not null default 'active',
  file_name text,
  file_path text,
  mime_type text,
  size_bytes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_documents_audience_check check (audience in ('tenant_staff', 'instructors', 'parents', 'all_tenant')),
  constraint tenant_documents_visibility_check check (visibility in ('internal', 'portal')),
  constraint tenant_documents_status_check check (status in ('active', 'archived')),
  constraint tenant_documents_size_check check (size_bytes is null or size_bytes >= 0),
  constraint tenant_documents_tenant_id_id_unique unique (tenant_id, id)
);

create table public.tenant_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  report_key text not null,
  title text not null,
  period_start date,
  period_end date,
  metrics jsonb not null default '{}'::jsonb,
  generated_by_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_report_snapshots_key_check check (report_key in ('operations', 'intake', 'billing', 'progress', 'custom')),
  constraint tenant_report_snapshots_status_check check (status in ('active', 'archived')),
  constraint tenant_report_snapshots_period_check check (period_start is null or period_end is null or period_start <= period_end),
  constraint tenant_report_snapshots_tenant_id_id_unique unique (tenant_id, id)
);

create index tenant_messages_tenant_status_idx on public.tenant_messages (tenant_id, status, audience, created_at desc);
create index tenant_messages_published_idx on public.tenant_messages (tenant_id, visibility, audience, published_at desc) where status = 'published';
create index tenant_tasks_tenant_status_idx on public.tenant_tasks (tenant_id, status, priority, due_on);
create index tenant_tasks_assignee_idx on public.tenant_tasks (assigned_to_user_id, status, due_on);
create index tenant_tasks_participant_idx on public.tenant_tasks (tenant_id, related_participant_id, status);
create index tenant_documents_tenant_status_idx on public.tenant_documents (tenant_id, status, audience, created_at desc);
create index tenant_documents_portal_idx on public.tenant_documents (tenant_id, visibility, audience, created_at desc) where status = 'active';
create index tenant_report_snapshots_tenant_key_idx on public.tenant_report_snapshots (tenant_id, report_key, created_at desc);

create trigger tenant_messages_set_updated_at
  before update on public.tenant_messages
  for each row execute function app_private.set_updated_at();

create trigger tenant_tasks_set_updated_at
  before update on public.tenant_tasks
  for each row execute function app_private.set_updated_at();

create trigger tenant_documents_set_updated_at
  before update on public.tenant_documents
  for each row execute function app_private.set_updated_at();

create trigger tenant_report_snapshots_set_updated_at
  before update on public.tenant_report_snapshots
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.tenant_messages to authenticated;
grant select, insert, update, delete on public.tenant_tasks to authenticated;
grant select, insert, update, delete on public.tenant_documents to authenticated;
grant select, insert, update, delete on public.tenant_report_snapshots to authenticated;

grant all on public.tenant_messages to service_role;
grant all on public.tenant_tasks to service_role;
grant all on public.tenant_documents to service_role;
grant all on public.tenant_report_snapshots to service_role;

alter table public.tenant_messages enable row level security;
alter table public.tenant_tasks enable row level security;
alter table public.tenant_documents enable row level security;
alter table public.tenant_report_snapshots enable row level security;

create policy "Scoped users can view tenant messages"
  on public.tenant_messages
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or (
      status = 'published'
      and audience in ('instructors', 'all_tenant')
      and app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
    )
    or (
      status = 'published'
      and visibility = 'portal'
      and audience in ('parents', 'all_tenant')
      and app_private.current_user_has_tenant_role(tenant_id, array['parent'])
    )
  );

create policy "Tenant staff can manage tenant messages"
  on public.tenant_messages
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view tenant tasks"
  on public.tenant_tasks
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or assigned_to_user_id = (select auth.uid())
    or (
      related_participant_id is not null
      and app_private.current_user_can_instruct_participant(related_participant_id)
    )
  );

create policy "Tenant staff can manage tenant tasks"
  on public.tenant_tasks
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view tenant documents"
  on public.tenant_documents
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or (
      status = 'active'
      and audience in ('instructors', 'all_tenant')
      and app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
    )
    or (
      status = 'active'
      and visibility = 'portal'
      and audience in ('parents', 'all_tenant')
      and app_private.current_user_has_tenant_role(tenant_id, array['parent'])
    )
  );

create policy "Tenant staff can manage tenant documents"
  on public.tenant_documents
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can view report snapshots"
  on public.tenant_report_snapshots
  for select
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can manage report snapshots"
  on public.tenant_report_snapshots
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
