-- Rule-based weekly management briefs. Always drafts; never sent automatically.

create table public.management_summary_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft',
  title text not null,
  narrative text not null,
  metrics_json jsonb not null default '{}'::jsonb,
  evidence_json jsonb not null default '[]'::jsonb,
  generation_method text not null default 'rule_based',
  generated_by_user_id uuid references auth.users (id) on delete set null,
  approved_by_user_id uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint management_summary_drafts_period_check check (period_start <= period_end),
  constraint management_summary_drafts_status_check check (status in ('draft', 'approved', 'archived')),
  constraint management_summary_drafts_title_check check (length(trim(title)) between 3 and 160),
  constraint management_summary_drafts_narrative_check check (length(trim(narrative)) between 20 and 10000),
  constraint management_summary_drafts_metrics_check check (jsonb_typeof(metrics_json) = 'object'),
  constraint management_summary_drafts_evidence_check check (jsonb_typeof(evidence_json) = 'array'),
  constraint management_summary_drafts_method_check check (generation_method = 'rule_based'),
  constraint management_summary_drafts_approval_check check (
    (status = 'approved' and approved_by_user_id is not null and approved_at is not null)
    or status <> 'approved'
  ),
  constraint management_summary_drafts_tenant_id_id_unique unique (tenant_id, id),
  constraint management_summary_drafts_week_unique unique (tenant_id, period_start, period_end)
);

create index management_summary_drafts_tenant_period_idx
  on public.management_summary_drafts (tenant_id, period_end desc, status);
create trigger management_summary_drafts_set_updated_at
  before update on public.management_summary_drafts
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.management_summary_drafts to authenticated;
grant all on public.management_summary_drafts to service_role;
alter table public.management_summary_drafts enable row level security;
alter table public.management_summary_drafts force row level security;
create policy "Tenant administrators manage management summary drafts"
  on public.management_summary_drafts for all to authenticated
  using (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']))
  with check (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']));

comment on table public.management_summary_drafts is
  'Rule-based operational management brief. Generation creates a draft only; approval never sends it.';
