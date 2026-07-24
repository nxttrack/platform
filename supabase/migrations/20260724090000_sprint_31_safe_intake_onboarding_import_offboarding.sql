-- Sprint 31: safe public intake, guided tenant lifecycle and reversible imports.

create table public.public_intake_rate_limits (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  fingerprint_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  last_request_at timestamptz not null default now(),
  primary key (tenant_id, fingerprint_hash, window_started_at),
  constraint public_intake_rate_limits_count_check check (request_count > 0)
);

alter table public.intake_submissions
  add column dedupe_key text,
  add column duplicate_state text not null default 'unique',
  add column duplicate_of_submission_id uuid,
  add column abuse_fingerprint text,
  add constraint intake_submissions_duplicate_state_check
    check (duplicate_state in ('unique', 'possible_duplicate', 'confirmed_duplicate', 'dismissed')),
  add constraint intake_submissions_duplicate_of_fk
    foreign key (tenant_id, duplicate_of_submission_id)
    references public.intake_submissions (tenant_id, id) on delete set null;

create index intake_submissions_dedupe_idx
  on public.intake_submissions (tenant_id, dedupe_key, received_at desc)
  where dedupe_key is not null;
create index intake_submissions_duplicate_state_idx
  on public.intake_submissions (tenant_id, duplicate_state, received_at desc);

create or replace function public.consume_public_intake_rate_limit(
  target_tenant_id uuid,
  target_fingerprint_hash text,
  target_window_started_at timestamptz,
  target_limit integer
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  next_count integer;
begin
  if target_limit < 1 or length(target_fingerprint_hash) < 32 then
    return false;
  end if;

  insert into public.public_intake_rate_limits (
    tenant_id,
    fingerprint_hash,
    window_started_at,
    request_count,
    last_request_at
  )
  values (
    target_tenant_id,
    target_fingerprint_hash,
    target_window_started_at,
    1,
    now()
  )
  on conflict (tenant_id, fingerprint_hash, window_started_at)
  do update set
    request_count = public.public_intake_rate_limits.request_count + 1,
    last_request_at = now()
  returning request_count into next_count;

  delete from public.public_intake_rate_limits
  where window_started_at < now() - interval '2 days';

  return next_count <= target_limit;
end;
$$;

revoke all on function public.consume_public_intake_rate_limit(uuid, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.consume_public_intake_rate_limit(uuid, text, timestamptz, integer) to service_role;

create table public.tenant_onboarding_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete set null,
  status text not null default 'draft',
  current_step text not null default 'organization',
  draft_data jsonb not null default '{}'::jsonb,
  checklist jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users (id) on delete set null,
  completed_by_user_id uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_onboarding_runs_status_check
    check (status in ('draft', 'provisioning', 'attention_required', 'ready', 'opened', 'cancelled')),
  constraint tenant_onboarding_runs_step_check
    check (current_step in ('organization', 'owner', 'identity', 'program', 'operations', 'staff', 'billing', 'opening'))
);

alter table public.import_jobs
  add column validation_report jsonb not null default '{}'::jsonb,
  add column rollback_manifest jsonb not null default '[]'::jsonb,
  add column rolled_back_by_user_id uuid references auth.users (id) on delete set null,
  add column rolled_back_at timestamptz;

create table public.import_job_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  import_job_id uuid not null,
  event_type text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint import_job_events_job_fk foreign key (tenant_id, import_job_id)
    references public.import_jobs (tenant_id, id) on delete cascade,
  constraint import_job_events_type_check
    check (event_type in ('uploaded', 'mapping_saved', 'validated', 'dry_run', 'applied', 'failed', 'rolled_back', 'cancelled'))
);

create index import_job_events_job_idx
  on public.import_job_events (tenant_id, import_job_id, created_at desc);

create table public.tenant_offboarding_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  status text not null default 'requested',
  reason text,
  retention_ends_at timestamptz not null,
  export_manifest jsonb not null default '{}'::jsonb,
  export_completed_at timestamptz,
  closed_at timestamptz,
  deletion_approved_at timestamptz,
  requested_by_user_id uuid references auth.users (id) on delete set null,
  approved_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_offboarding_runs_status_check
    check (status in ('requested', 'export_ready', 'retention', 'closed', 'deletion_approved', 'cancelled'))
);

create unique index tenant_offboarding_one_active_idx
  on public.tenant_offboarding_runs (tenant_id)
  where status not in ('cancelled');

create table public.tenant_deletion_tombstones (
  id uuid primary key default gen_random_uuid(),
  former_tenant_id uuid not null,
  former_slug text not null,
  former_name text not null,
  offboarding_run_id uuid not null,
  export_manifest jsonb not null,
  approved_by_user_id uuid references auth.users (id) on delete set null,
  deleted_at timestamptz not null default now(),
  constraint tenant_deletion_tombstones_former_tenant_unique unique (former_tenant_id)
);

create trigger tenant_onboarding_runs_set_updated_at
  before update on public.tenant_onboarding_runs
  for each row execute function app_private.set_updated_at();
create trigger tenant_offboarding_runs_set_updated_at
  before update on public.tenant_offboarding_runs
  for each row execute function app_private.set_updated_at();

grant all on public.public_intake_rate_limits to service_role;
grant select on public.public_intake_rate_limits to authenticated;
grant select, insert, update, delete on public.tenant_onboarding_runs to authenticated;
grant all on public.tenant_onboarding_runs to service_role;
grant select, insert, update, delete on public.import_job_events to authenticated;
grant all on public.import_job_events to service_role;
grant select, insert, update, delete on public.tenant_offboarding_runs to authenticated;
grant all on public.tenant_offboarding_runs to service_role;
grant select on public.tenant_deletion_tombstones to authenticated;
grant all on public.tenant_deletion_tombstones to service_role;

alter table public.public_intake_rate_limits enable row level security;
alter table public.tenant_onboarding_runs enable row level security;
alter table public.import_job_events enable row level security;
alter table public.tenant_offboarding_runs enable row level security;
alter table public.tenant_deletion_tombstones enable row level security;

alter table public.public_intake_rate_limits force row level security;
alter table public.tenant_onboarding_runs force row level security;
alter table public.import_job_events force row level security;
alter table public.tenant_offboarding_runs force row level security;
alter table public.tenant_deletion_tombstones force row level security;

create policy "No client access to intake counters" on public.public_intake_rate_limits
  for select to authenticated
  using (false);
create policy "Platform admins manage onboarding" on public.tenant_onboarding_runs
  for all to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
  with check (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));
create policy "Tenant admins view import audit" on public.import_job_events
  for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Platform admins manage offboarding" on public.tenant_offboarding_runs
  for all to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
  with check (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));
create policy "Platform owners view deletion tombstones" on public.tenant_deletion_tombstones
  for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner']));
