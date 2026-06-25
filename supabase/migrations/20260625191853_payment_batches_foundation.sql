create table public.payment_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  batch_number text not null,
  batch_type text not null,
  title text not null,
  description text,
  status text not null default 'draft',
  payment_method text not null default 'manual',
  period_start date,
  period_end date,
  due_on date,
  currency text not null default 'EUR',
  item_count integer not null default 0,
  ready_item_count integer not null default 0,
  exception_item_count integer not null default 0,
  total_amount_cents integer not null default 0,
  approved_at timestamptz,
  approved_by_profile_id uuid references public.profiles (id) on delete set null,
  processed_at timestamptz,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_batches_id_tenant_unique unique (id, tenant_id),
  constraint payment_batches_number_unique unique (tenant_id, batch_number),
  constraint payment_batches_type_check check (batch_type in ('monthly_tuition', 'quarterly_tuition', 'registration_fee', 'extra_activity', 'diploma_event_fee', 'holiday_course', 'manual_correction')),
  constraint payment_batches_status_check check (status in ('draft', 'ready', 'approved', 'processing', 'completed', 'partially_failed', 'failed', 'cancelled')),
  constraint payment_batches_method_check check (payment_method in ('manual', 'sepa_direct_debit', 'mollie', 'external')),
  constraint payment_batches_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint payment_batches_amount_check check (total_amount_cents >= 0),
  constraint payment_batches_count_check check (item_count >= 0 and ready_item_count >= 0 and exception_item_count >= 0),
  constraint payment_batches_period_check check (period_start is null or period_end is null or period_start <= period_end)
);

create table public.payment_batch_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  payment_batch_id uuid not null references public.payment_batches (id) on delete cascade,
  enrollment_id uuid references public.enrollments (id) on delete cascade,
  participant_id uuid references public.participants (id) on delete cascade,
  subscription_plan_id uuid references public.subscription_plans (id) on delete set null,
  guardian_profile_id uuid references public.profiles (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  payment_record_id uuid references public.payment_records (id) on delete set null,
  source_type text not null default 'enrollment',
  source_id uuid,
  title text not null,
  description text,
  amount_cents integer not null default 0,
  currency text not null default 'EUR',
  status text not null default 'pending',
  warning_codes text[] not null default '{}'::text[],
  blocker_codes text[] not null default '{}'::text[],
  exception_message text,
  source_snapshot jsonb not null default '{}'::jsonb,
  execution_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_batch_items_id_tenant_unique unique (id, tenant_id),
  constraint payment_batch_items_batch_tenant_fk foreign key (payment_batch_id, tenant_id) references public.payment_batches (id, tenant_id) on delete cascade,
  constraint payment_batch_items_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint payment_batch_items_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint payment_batch_items_status_check check (status in ('pending', 'skipped', 'ready', 'processing', 'paid', 'failed', 'cancelled')),
  constraint payment_batch_items_source_check check (source_type in ('enrollment', 'registration_fee', 'activity', 'milestone_event', 'holiday_course', 'manual_correction')),
  constraint payment_batch_items_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint payment_batch_items_amount_check check (amount_cents >= 0)
);

create index payment_batches_tenant_status_idx on public.payment_batches (tenant_id, status, created_at desc);
create index payment_batches_tenant_type_idx on public.payment_batches (tenant_id, batch_type, period_start, period_end);
create index payment_batch_items_batch_status_idx on public.payment_batch_items (tenant_id, payment_batch_id, status);
create index payment_batch_items_enrollment_idx on public.payment_batch_items (tenant_id, enrollment_id);
create index payment_batch_items_participant_idx on public.payment_batch_items (tenant_id, participant_id);
create index payment_batch_items_invoice_idx on public.payment_batch_items (tenant_id, invoice_id) where invoice_id is not null;

create trigger payment_batches_set_updated_at
  before update on public.payment_batches
  for each row execute function app_private.set_updated_at();

create trigger payment_batch_items_set_updated_at
  before update on public.payment_batch_items
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.payment_batches to authenticated;
grant select, insert, update on public.payment_batch_items to authenticated;

grant all on public.payment_batches to service_role;
grant all on public.payment_batch_items to service_role;

alter table public.payment_batches enable row level security;
alter table public.payment_batch_items enable row level security;

create policy "Tenant staff can manage payment batches"
  on public.payment_batches
  for all
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff and participants can view payment batch items"
  on public.payment_batch_items
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
    or (enrollment_id is not null and app_private.current_user_can_access_enrollment(tenant_id, enrollment_id))
  );

create policy "Tenant staff can insert payment batch items"
  on public.payment_batch_items
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update payment batch items"
  on public.payment_batch_items
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

create or replace function app_private.refresh_payment_batch_totals()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  target_batch_id uuid;
  target_tenant_id uuid;
begin
  target_batch_id := coalesce(new.payment_batch_id, old.payment_batch_id);
  target_tenant_id := coalesce(new.tenant_id, old.tenant_id);

  update public.payment_batches
  set item_count = (
        select count(*)::integer
        from public.payment_batch_items
        where tenant_id = target_tenant_id
          and payment_batch_id = target_batch_id
          and status <> 'cancelled'
      ),
      ready_item_count = (
        select count(*)::integer
        from public.payment_batch_items
        where tenant_id = target_tenant_id
          and payment_batch_id = target_batch_id
          and status in ('ready', 'processing', 'paid')
          and cardinality(blocker_codes) = 0
      ),
      exception_item_count = (
        select count(*)::integer
        from public.payment_batch_items
        where tenant_id = target_tenant_id
          and payment_batch_id = target_batch_id
          and (status in ('pending', 'skipped', 'failed', 'cancelled') or cardinality(blocker_codes) > 0 or cardinality(warning_codes) > 0)
      ),
      total_amount_cents = (
        select coalesce(sum(amount_cents), 0)::integer
        from public.payment_batch_items
        where tenant_id = target_tenant_id
          and payment_batch_id = target_batch_id
          and status not in ('skipped', 'cancelled')
          and cardinality(blocker_codes) = 0
      )
  where tenant_id = target_tenant_id
    and id = target_batch_id;

  return coalesce(new, old);
end $$;

revoke all on function app_private.refresh_payment_batch_totals() from public;

create trigger payment_batch_items_refresh_batch_totals
  after insert or update or delete on public.payment_batch_items
  for each row execute function app_private.refresh_payment_batch_totals();

create trigger payment_batches_audit_events
  after insert or update or delete on public.payment_batches
  for each row execute function app_private.record_audit_event();

create trigger payment_batch_items_audit_events
  after insert or update or delete on public.payment_batch_items
  for each row execute function app_private.record_audit_event();
