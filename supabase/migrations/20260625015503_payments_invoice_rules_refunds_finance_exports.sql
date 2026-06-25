create table public.invoice_numbering_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  rule_name text not null default 'Standaard factuurnummering',
  prefix text not null default 'INV',
  next_number integer not null default 1,
  padding integer not null default 4,
  period_mode text not null default 'monthly',
  due_days integer not null default 14,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_numbering_rules_id_tenant_unique unique (id, tenant_id),
  constraint invoice_numbering_rules_next_number_check check (next_number > 0),
  constraint invoice_numbering_rules_padding_check check (padding between 2 and 12),
  constraint invoice_numbering_rules_due_days_check check (due_days between 0 and 90),
  constraint invoice_numbering_rules_period_mode_check check (period_mode in ('manual', 'monthly', 'quarterly', 'yearly')),
  constraint invoice_numbering_rules_status_check check (status in ('active', 'inactive'))
);

alter table public.invoices
  add column if not exists invoice_sequence integer,
  add column if not exists period_mode text not null default 'manual',
  add column if not exists reminder_count integer not null default 0,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists overdue_checked_at timestamptz,
  add column if not exists corrected_at timestamptz,
  add column if not exists corrected_by_profile_id uuid references public.profiles (id) on delete set null,
  add column if not exists correction_reason text,
  add column if not exists refunded_amount_cents integer not null default 0;

alter table public.invoices
  drop constraint if exists invoices_period_mode_check;

alter table public.invoices
  add constraint invoices_period_mode_check check (period_mode in ('manual', 'monthly', 'quarterly', 'yearly'));

alter table public.invoices
  drop constraint if exists invoices_refunded_amount_check;

alter table public.invoices
  add constraint invoices_refunded_amount_check check (refunded_amount_cents >= 0);

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  payment_record_id uuid references public.payment_records (id) on delete set null,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  provider text not null default 'manual',
  amount_cents integer not null,
  currency text not null default 'EUR',
  status text not null default 'recorded',
  reason text,
  refunded_on date,
  recorded_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_refunds_amount_check check (amount_cents > 0),
  constraint payment_refunds_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint payment_refunds_provider_check check (provider in ('manual', 'mollie', 'external')),
  constraint payment_refunds_status_check check (status in ('requested', 'recorded', 'processed', 'failed', 'cancelled')),
  constraint payment_refunds_id_tenant_unique unique (id, tenant_id),
  constraint payment_refunds_invoice_tenant_fk foreign key (invoice_id, tenant_id) references public.invoices (id, tenant_id) on delete cascade,
  constraint payment_refunds_payment_record_tenant_fk foreign key (payment_record_id, tenant_id) references public.payment_records (id, tenant_id) on delete set null,
  constraint payment_refunds_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint payment_refunds_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade
);

create table public.finance_export_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  export_type text not null default 'payments',
  export_format text not null default 'csv',
  period_start date,
  period_end date,
  status text not null default 'requested',
  file_path text,
  row_count integer,
  requested_by_profile_id uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_export_requests_type_check check (export_type in ('invoices', 'payments', 'refunds', 'ledger')),
  constraint finance_export_requests_format_check check (export_format in ('csv', 'json')),
  constraint finance_export_requests_status_check check (status in ('requested', 'processing', 'ready', 'failed', 'cancelled')),
  constraint finance_export_requests_period_check check (period_start is null or period_end is null or period_start <= period_end),
  constraint finance_export_requests_row_count_check check (row_count is null or row_count >= 0),
  constraint finance_export_requests_id_tenant_unique unique (id, tenant_id)
);

create index if not exists invoice_numbering_rules_tenant_status_idx on public.invoice_numbering_rules (tenant_id, status);
create unique index if not exists invoice_numbering_rules_one_active_idx
  on public.invoice_numbering_rules (tenant_id)
  where status = 'active';
create index if not exists invoices_tenant_overdue_idx on public.invoices (tenant_id, status, due_on);
create index if not exists payment_refunds_invoice_idx on public.payment_refunds (tenant_id, invoice_id, created_at desc);
create index if not exists payment_refunds_participant_idx on public.payment_refunds (tenant_id, participant_id, created_at desc);
create index if not exists finance_export_requests_tenant_status_idx on public.finance_export_requests (tenant_id, status, created_at desc);

create trigger invoice_numbering_rules_set_updated_at
  before update on public.invoice_numbering_rules
  for each row execute function app_private.set_updated_at();

create trigger payment_refunds_set_updated_at
  before update on public.payment_refunds
  for each row execute function app_private.set_updated_at();

create trigger finance_export_requests_set_updated_at
  before update on public.finance_export_requests
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.invoice_numbering_rules to authenticated;
grant select, insert, update on public.payment_refunds to authenticated;
grant select, insert, update on public.finance_export_requests to authenticated;

grant all on public.invoice_numbering_rules to service_role;
grant all on public.payment_refunds to service_role;
grant all on public.finance_export_requests to service_role;

alter table public.invoice_numbering_rules enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.finance_export_requests enable row level security;

create policy "Tenant staff can manage invoice numbering rules"
  on public.invoice_numbering_rules
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

create policy "Participants and staff can view payment refunds"
  on public.payment_refunds
  for select
  to authenticated
  using (app_private.current_user_can_access_enrollment(tenant_id, enrollment_id));

create policy "Tenant staff can insert payment refunds"
  on public.payment_refunds
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update payment refunds"
  on public.payment_refunds
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

create policy "Tenant staff can manage finance exports"
  on public.finance_export_requests
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

create or replace function app_private.sync_invoice_refund_status()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  refunded_total integer;
begin
  select coalesce(sum(amount_cents), 0)::integer into refunded_total
  from public.payment_refunds
  where tenant_id = new.tenant_id
    and invoice_id = new.invoice_id
    and status in ('recorded', 'processed');

  update public.invoices
  set refunded_amount_cents = refunded_total
  where tenant_id = new.tenant_id
    and id = new.invoice_id;

  insert into public.payment_events (
    tenant_id,
    invoice_id,
    payment_record_id,
    provider,
    event_type,
    payload,
    created_by_profile_id
  )
  values (
    new.tenant_id,
    new.invoice_id,
    new.payment_record_id,
    new.provider,
    'refund_' || new.status,
    jsonb_build_object('refund_id', new.id, 'amount_cents', new.amount_cents, 'currency', new.currency, 'reason', new.reason),
    new.recorded_by_profile_id
  );

  return new;
end $$;

revoke all on function app_private.sync_invoice_refund_status() from public;

create trigger payment_refunds_sync_invoice_status
  after insert or update on public.payment_refunds
  for each row execute function app_private.sync_invoice_refund_status();

create trigger invoice_numbering_rules_audit_events
  after insert or update or delete on public.invoice_numbering_rules
  for each row execute function app_private.record_audit_event();

create trigger payment_refunds_audit_events
  after insert or update or delete on public.payment_refunds
  for each row execute function app_private.record_audit_event();

create trigger finance_export_requests_audit_events
  after insert or update or delete on public.finance_export_requests
  for each row execute function app_private.record_audit_event();

do $$
declare
  demo_tenant_id uuid;
begin
  select id into demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if demo_tenant_id is null then
    return;
  end if;

  insert into public.invoice_numbering_rules (
    tenant_id,
    rule_name,
    prefix,
    next_number,
    padding,
    period_mode,
    due_days,
    status,
    metadata
  )
  values (
    demo_tenant_id,
    'AquaSwim maandfacturen',
    'AQUA',
    3,
    4,
    'monthly',
    14,
    'active',
    '{"source":"payments_invoice_rules_refunds_finance_exports"}'::jsonb
  )
  on conflict (tenant_id) where status = 'active' do update
    set rule_name = excluded.rule_name,
        prefix = excluded.prefix,
        next_number = greatest(invoice_numbering_rules.next_number, excluded.next_number),
        padding = excluded.padding,
        period_mode = excluded.period_mode,
        due_days = excluded.due_days,
        metadata = excluded.metadata;
end $$;
