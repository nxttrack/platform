alter table public.billing_events
  drop constraint if exists billing_events_type_check,
  add constraint billing_events_type_check check (type in (
    'payment_due',
    'payment_overdue',
    'payment_paid',
    'payment_failed',
    'payment_session_created',
    'payment_session_failed',
    'payment_provider_webhook',
    'subscription_created',
    'subscription_changed',
    'subscription_paused',
    'subscription_cancelled',
    'subscription_completed',
    'invoice_created',
    'invoice_exported'
  ));

create table public.billing_provider_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null default 'manual',
  mode text not null default 'test',
  status text not null default 'draft',
  display_name text not null default 'Manual billing',
  secret_reference text,
  webhook_secret_reference text,
  public_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_provider_configs_provider_check check (provider in ('manual', 'mollie', 'ideal', 'other')),
  constraint billing_provider_configs_mode_check check (mode in ('test', 'live')),
  constraint billing_provider_configs_status_check check (status in ('draft', 'active', 'disabled')),
  constraint billing_provider_configs_tenant_id_id_unique unique (tenant_id, id),
  constraint billing_provider_configs_tenant_provider_mode_unique unique (tenant_id, provider, mode)
);

alter table public.subscriptions
  add column if not exists collection_method text not null default 'manual',
  add column if not exists provider_config_id uuid,
  add column if not exists billing_anchor_day integer,
  add column if not exists current_period_start date,
  add column if not exists current_period_end date,
  add column if not exists lifecycle_status_reason text,
  add column if not exists paused_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.subscriptions
  drop constraint if exists subscriptions_collection_method_check,
  add constraint subscriptions_collection_method_check check (collection_method in ('manual', 'provider')),
  drop constraint if exists subscriptions_billing_anchor_day_check,
  add constraint subscriptions_billing_anchor_day_check check (billing_anchor_day is null or billing_anchor_day between 1 and 28),
  drop constraint if exists subscriptions_provider_config_fk,
  add constraint subscriptions_provider_config_fk foreign key (tenant_id, provider_config_id) references public.billing_provider_configs (tenant_id, id) on delete restrict,
  drop constraint if exists subscriptions_period_check,
  add constraint subscriptions_period_check check (current_period_end is null or current_period_start is null or current_period_start <= current_period_end);

create table public.payment_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_config_id uuid,
  subscription_id uuid,
  manual_payment_id uuid,
  participant_id uuid,
  guardian_user_id uuid references auth.users (id) on delete set null,
  provider text not null default 'manual',
  provider_session_id text,
  idempotency_key text,
  checkout_url text,
  amount_cents integer not null,
  currency text not null default 'EUR',
  status text not null default 'draft',
  failure_code text,
  failure_message text,
  return_url text,
  webhook_received_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_sessions_provider_config_fk foreign key (tenant_id, provider_config_id) references public.billing_provider_configs (tenant_id, id) on delete restrict,
  constraint payment_sessions_subscription_fk foreign key (tenant_id, subscription_id) references public.subscriptions (tenant_id, id) on delete cascade,
  constraint payment_sessions_manual_payment_fk foreign key (tenant_id, manual_payment_id) references public.manual_payments (tenant_id, id) on delete cascade,
  constraint payment_sessions_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint payment_sessions_provider_check check (provider in ('manual', 'mollie', 'ideal', 'other')),
  constraint payment_sessions_status_check check (status in ('draft', 'pending', 'authorized', 'paid', 'failed', 'expired', 'cancelled')),
  constraint payment_sessions_amount_check check (amount_cents >= 0),
  constraint payment_sessions_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint payment_sessions_source_check check (subscription_id is not null or manual_payment_id is not null),
  constraint payment_sessions_tenant_id_id_unique unique (tenant_id, id)
);

create table public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_config_id uuid,
  payment_session_id uuid,
  manual_payment_id uuid,
  provider text not null default 'manual',
  provider_event_id text,
  event_type text not null,
  processing_status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_provider_events_provider_config_fk foreign key (tenant_id, provider_config_id) references public.billing_provider_configs (tenant_id, id) on delete restrict,
  constraint payment_provider_events_session_fk foreign key (tenant_id, payment_session_id) references public.payment_sessions (tenant_id, id) on delete restrict,
  constraint payment_provider_events_manual_payment_fk foreign key (tenant_id, manual_payment_id) references public.manual_payments (tenant_id, id) on delete restrict,
  constraint payment_provider_events_provider_check check (provider in ('manual', 'mollie', 'ideal', 'other')),
  constraint payment_provider_events_status_check check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  constraint payment_provider_events_tenant_id_id_unique unique (tenant_id, id)
);

create table public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  subscription_id uuid,
  manual_payment_id uuid,
  participant_id uuid,
  guardian_user_id uuid references auth.users (id) on delete set null,
  invoice_number text,
  status text not null default 'draft',
  issued_on date,
  due_on date,
  paid_on date,
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  currency text not null default 'EUR',
  export_status text not null default 'not_ready',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_invoices_subscription_fk foreign key (tenant_id, subscription_id) references public.subscriptions (tenant_id, id) on delete restrict,
  constraint billing_invoices_manual_payment_fk foreign key (tenant_id, manual_payment_id) references public.manual_payments (tenant_id, id) on delete restrict,
  constraint billing_invoices_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint billing_invoices_status_check check (status in ('draft', 'issued', 'sent', 'paid', 'void', 'exported')),
  constraint billing_invoices_export_status_check check (export_status in ('not_ready', 'ready', 'exported')),
  constraint billing_invoices_amount_check check (subtotal_cents >= 0 and tax_cents >= 0 and total_cents >= 0),
  constraint billing_invoices_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint billing_invoices_paid_on_check check ((status = 'paid' and paid_on is not null) or status <> 'paid'),
  constraint billing_invoices_tenant_id_id_unique unique (tenant_id, id),
  constraint billing_invoices_tenant_number_unique unique (tenant_id, invoice_number)
);

create table public.billing_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_id uuid not null,
  manual_payment_id uuid,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_amount_cents integer not null,
  tax_rate_basis_points integer not null default 0,
  total_cents integer not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_invoice_lines_invoice_fk foreign key (tenant_id, invoice_id) references public.billing_invoices (tenant_id, id) on delete cascade,
  constraint billing_invoice_lines_manual_payment_fk foreign key (tenant_id, manual_payment_id) references public.manual_payments (tenant_id, id) on delete restrict,
  constraint billing_invoice_lines_amount_check check (quantity > 0 and unit_amount_cents >= 0 and tax_rate_basis_points >= 0 and total_cents >= 0),
  constraint billing_invoice_lines_tenant_id_id_unique unique (tenant_id, id)
);

create table public.billing_export_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  export_key text not null,
  export_type text not null default 'invoices',
  status text not null default 'draft',
  period_start date,
  period_end date,
  row_count integer not null default 0,
  file_path text,
  generated_by_user_id uuid references auth.users (id) on delete set null,
  generated_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_export_batches_type_check check (export_type in ('invoices', 'payments', 'subscriptions', 'provider_events')),
  constraint billing_export_batches_status_check check (status in ('draft', 'ready', 'exported', 'failed')),
  constraint billing_export_batches_period_check check (period_start is null or period_end is null or period_start <= period_end),
  constraint billing_export_batches_count_check check (row_count >= 0),
  constraint billing_export_batches_tenant_id_id_unique unique (tenant_id, id),
  constraint billing_export_batches_tenant_key_unique unique (tenant_id, export_key)
);

create index billing_provider_configs_tenant_status_idx on public.billing_provider_configs (tenant_id, status, provider, mode);
create index subscriptions_provider_idx on public.subscriptions (tenant_id, provider_config_id, collection_method);
create index payment_sessions_tenant_status_idx on public.payment_sessions (tenant_id, status, created_at desc);
create index payment_sessions_manual_payment_idx on public.payment_sessions (tenant_id, manual_payment_id, status);
create unique index payment_sessions_provider_session_unique on public.payment_sessions (tenant_id, provider, provider_session_id) where provider_session_id is not null;
create unique index payment_sessions_idempotency_unique on public.payment_sessions (tenant_id, idempotency_key) where idempotency_key is not null;
create index payment_provider_events_session_idx on public.payment_provider_events (tenant_id, payment_session_id, received_at desc);
create index payment_provider_events_status_idx on public.payment_provider_events (tenant_id, processing_status, received_at desc);
create unique index payment_provider_events_provider_event_unique on public.payment_provider_events (tenant_id, provider, provider_event_id) where provider_event_id is not null;
create index billing_invoices_tenant_status_idx on public.billing_invoices (tenant_id, status, due_on desc);
create index billing_invoices_guardian_idx on public.billing_invoices (guardian_user_id, status, due_on);
create index billing_invoice_lines_invoice_idx on public.billing_invoice_lines (tenant_id, invoice_id, sort_order);
create index billing_export_batches_tenant_status_idx on public.billing_export_batches (tenant_id, status, generated_at desc);

create trigger billing_provider_configs_set_updated_at
  before update on public.billing_provider_configs
  for each row execute function app_private.set_updated_at();

create trigger payment_sessions_set_updated_at
  before update on public.payment_sessions
  for each row execute function app_private.set_updated_at();

create trigger billing_invoices_set_updated_at
  before update on public.billing_invoices
  for each row execute function app_private.set_updated_at();

create trigger billing_invoice_lines_set_updated_at
  before update on public.billing_invoice_lines
  for each row execute function app_private.set_updated_at();

create trigger billing_export_batches_set_updated_at
  before update on public.billing_export_batches
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.billing_provider_configs to authenticated;
grant select, insert, update, delete on public.payment_sessions to authenticated;
grant select, insert, update, delete on public.payment_provider_events to authenticated;
grant select, insert, update, delete on public.billing_invoices to authenticated;
grant select, insert, update, delete on public.billing_invoice_lines to authenticated;
grant select, insert, update, delete on public.billing_export_batches to authenticated;

grant all on public.billing_provider_configs to service_role;
grant all on public.payment_sessions to service_role;
grant all on public.payment_provider_events to service_role;
grant all on public.billing_invoices to service_role;
grant all on public.billing_invoice_lines to service_role;
grant all on public.billing_export_batches to service_role;

alter table public.billing_provider_configs enable row level security;
alter table public.payment_sessions enable row level security;
alter table public.payment_provider_events enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_invoice_lines enable row level security;
alter table public.billing_export_batches enable row level security;

create policy "Tenant staff can view provider configs"
  on public.billing_provider_configs
  for select
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can manage provider configs"
  on public.billing_provider_configs
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view payment sessions"
  on public.payment_sessions
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or guardian_user_id = (select auth.uid())
    or (
      participant_id is not null
      and app_private.current_user_can_view_participant(participant_id)
    )
  );

create policy "Tenant staff can manage payment sessions"
  on public.payment_sessions
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can view provider events"
  on public.payment_provider_events
  for select
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can manage provider events"
  on public.payment_provider_events
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view billing invoices"
  on public.billing_invoices
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or guardian_user_id = (select auth.uid())
    or (
      participant_id is not null
      and app_private.current_user_can_view_participant(participant_id)
    )
  );

create policy "Tenant staff can manage billing invoices"
  on public.billing_invoices
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view billing invoice lines"
  on public.billing_invoice_lines
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.billing_invoices invoice
      where invoice.tenant_id = billing_invoice_lines.tenant_id
        and invoice.id = billing_invoice_lines.invoice_id
        and (
          app_private.current_user_can_manage_tenant_domain(invoice.tenant_id)
          or invoice.guardian_user_id = (select auth.uid())
          or (
            invoice.participant_id is not null
            and app_private.current_user_can_view_participant(invoice.participant_id)
          )
        )
    )
  );

create policy "Tenant staff can manage billing invoice lines"
  on public.billing_invoice_lines
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can view billing export batches"
  on public.billing_export_batches
  for select
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can manage billing export batches"
  on public.billing_export_batches
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
