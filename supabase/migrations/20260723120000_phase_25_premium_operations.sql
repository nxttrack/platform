create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_key text not null,
  resource_key text not null,
  name text not null,
  view_state jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_views_role_check check (role_key in ('parent', 'instructor', 'admin', 'platform_admin')),
  constraint saved_views_tenant_id_id_unique unique (tenant_id, id),
  constraint saved_views_user_resource_name_unique unique (tenant_id, user_id, resource_key, name)
);

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  event_key text not null,
  action_key text not null,
  conditions jsonb not null default '[]'::jsonb,
  action_config jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  run_count integer not null default 0,
  last_run_at timestamptz,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_rules_status_check check (status in ('draft', 'active', 'paused', 'archived')),
  constraint automation_rules_run_count_check check (run_count >= 0),
  constraint automation_rules_tenant_id_id_unique unique (tenant_id, id)
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  rule_id uuid not null,
  event_key text not null,
  source_id text,
  idempotency_key text not null,
  status text not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint automation_runs_rule_fk foreign key (tenant_id, rule_id) references public.automation_rules (tenant_id, id) on delete cascade,
  constraint automation_runs_status_check check (status in ('queued', 'running', 'completed', 'skipped', 'failed', 'cancelled')),
  constraint automation_runs_tenant_id_id_unique unique (tenant_id, id),
  constraint automation_runs_idempotency_unique unique (tenant_id, idempotency_key)
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  import_type text not null,
  source_name text not null,
  status text not null default 'uploaded',
  mapping jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  valid_count integer not null default 0,
  invalid_count integer not null default 0,
  duplicate_count integer not null default 0,
  created_by_user_id uuid references auth.users (id) on delete set null,
  applied_by_user_id uuid references auth.users (id) on delete set null,
  applied_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_jobs_type_check check (import_type in ('participants', 'guardians', 'groups', 'enrollments', 'payments', 'mixed')),
  constraint import_jobs_status_check check (status in ('uploaded', 'mapping', 'validated', 'ready', 'applying', 'completed', 'failed', 'cancelled', 'rolled_back')),
  constraint import_jobs_counts_check check (row_count >= 0 and valid_count >= 0 and invalid_count >= 0 and duplicate_count >= 0),
  constraint import_jobs_tenant_id_id_unique unique (tenant_id, id)
);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  import_job_id uuid not null,
  row_number integer not null,
  source_data jsonb not null,
  normalized_data jsonb not null default '{}'::jsonb,
  validation_status text not null default 'pending',
  validation_errors jsonb not null default '[]'::jsonb,
  duplicate_key text,
  target_table text,
  target_id uuid,
  created_at timestamptz not null default now(),
  constraint import_rows_job_fk foreign key (tenant_id, import_job_id) references public.import_jobs (tenant_id, id) on delete cascade,
  constraint import_rows_number_check check (row_number > 0),
  constraint import_rows_status_check check (validation_status in ('pending', 'valid', 'invalid', 'duplicate', 'applied', 'skipped', 'rolled_back')),
  constraint import_rows_tenant_id_id_unique unique (tenant_id, id),
  constraint import_rows_job_number_unique unique (tenant_id, import_job_id, row_number)
);

create table public.tenant_branding (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  product_name text,
  logo_url text,
  primary_color text not null default '#1d4ed8',
  accent_color text not null default '#06b6d4',
  email_from_name text,
  email_footer text,
  portal_welcome text,
  custom_css text,
  pwa_enabled boolean not null default false,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_branding_primary_color_check check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint tenant_branding_accent_color_check check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint tenant_branding_status_check check (status in ('draft', 'active', 'disabled')),
  constraint tenant_branding_tenant_unique unique (tenant_id),
  constraint tenant_branding_tenant_id_id_unique unique (tenant_id, id)
);

create table public.media_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  guardian_user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null,
  status text not null default 'pending',
  granted_at timestamptz,
  withdrawn_at timestamptz,
  expires_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_consents_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint media_consents_status_check check (status in ('pending', 'granted', 'denied', 'withdrawn', 'expired')),
  constraint media_consents_tenant_id_id_unique unique (tenant_id, id),
  constraint media_consents_scope_unique unique (tenant_id, participant_id, guardian_user_id, purpose)
);

create index saved_views_user_resource_idx on public.saved_views (tenant_id, user_id, resource_key);
create index automation_rules_status_idx on public.automation_rules (tenant_id, status, event_key);
create index automation_runs_rule_status_idx on public.automation_runs (tenant_id, rule_id, status, created_at desc);
create index import_jobs_status_idx on public.import_jobs (tenant_id, status, created_at desc);
create index import_rows_job_status_idx on public.import_rows (tenant_id, import_job_id, validation_status, row_number);
create index media_consents_participant_idx on public.media_consents (tenant_id, participant_id, status);

create trigger saved_views_set_updated_at before update on public.saved_views for each row execute function app_private.set_updated_at();
create trigger automation_rules_set_updated_at before update on public.automation_rules for each row execute function app_private.set_updated_at();
create trigger import_jobs_set_updated_at before update on public.import_jobs for each row execute function app_private.set_updated_at();
create trigger tenant_branding_set_updated_at before update on public.tenant_branding for each row execute function app_private.set_updated_at();
create trigger media_consents_set_updated_at before update on public.media_consents for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.saved_views to authenticated;
grant select, insert, update, delete on public.automation_rules to authenticated;
grant select on public.automation_runs to authenticated;
grant select, insert, update, delete on public.import_jobs to authenticated;
grant select, insert, update, delete on public.import_rows to authenticated;
grant select, insert, update, delete on public.tenant_branding to authenticated;
grant select, insert, update on public.media_consents to authenticated;
grant all on public.saved_views to service_role;
grant all on public.automation_rules to service_role;
grant all on public.automation_runs to service_role;
grant all on public.import_jobs to service_role;
grant all on public.import_rows to service_role;
grant all on public.tenant_branding to service_role;
grant all on public.media_consents to service_role;

alter table public.saved_views enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_rows enable row level security;
alter table public.tenant_branding enable row level security;
alter table public.media_consents enable row level security;
alter table public.saved_views force row level security;
alter table public.automation_rules force row level security;
alter table public.automation_runs force row level security;
alter table public.import_jobs force row level security;
alter table public.import_rows force row level security;
alter table public.tenant_branding force row level security;
alter table public.media_consents force row level security;

create policy "Users manage own saved views" on public.saved_views for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent']));
create policy "Tenant admins manage automation rules" on public.automation_rules for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins view automation runs" on public.automation_runs for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins manage import jobs" on public.import_jobs for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins manage import rows" on public.import_rows for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins manage branding" on public.tenant_branding for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Guardians and tenant staff view media consent" on public.media_consents for select to authenticated
  using (guardian_user_id = (select auth.uid()) or app_private.current_user_can_manage_tenant_domain(tenant_id) or app_private.current_user_can_instruct_participant(participant_id));
create policy "Guardians manage own media consent" on public.media_consents for all to authenticated
  using (guardian_user_id = (select auth.uid()) and app_private.current_user_can_view_participant(participant_id))
  with check (guardian_user_id = (select auth.uid()) and app_private.current_user_can_view_participant(participant_id));
create policy "Tenant admins manage media consent" on public.media_consents for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
