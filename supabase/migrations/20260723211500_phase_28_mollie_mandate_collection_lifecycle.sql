create table public.billing_provider_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_config_id uuid not null,
  guardian_user_id uuid references auth.users (id) on delete set null,
  provider text not null default 'mollie',
  provider_customer_id text not null,
  status text not null default 'active',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_provider_customers_config_fk foreign key (tenant_id, provider_config_id) references public.billing_provider_configs (tenant_id, id) on delete restrict,
  constraint billing_provider_customers_provider_check check (provider in ('mollie')),
  constraint billing_provider_customers_provider_id_check check (provider_customer_id ~ '^cst_[A-Za-z0-9]+$'),
  constraint billing_provider_customers_status_check check (status in ('active', 'disabled')),
  constraint billing_provider_customers_tenant_id_id_unique unique (tenant_id, id),
  constraint billing_provider_customers_guardian_unique unique (tenant_id, provider_config_id, guardian_user_id),
  constraint billing_provider_customers_provider_id_unique unique (tenant_id, provider, provider_customer_id)
);

create table public.billing_mandates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_config_id uuid not null,
  provider_customer_id uuid not null,
  guardian_user_id uuid references auth.users (id) on delete set null,
  provider text not null default 'mollie',
  provider_mandate_id text not null,
  method text not null,
  status text not null default 'pending',
  signature_date date,
  mandate_reference text,
  account_holder text,
  account_last4 text,
  consent_source text not null default 'mollie_first_payment',
  consent_terms_version text,
  consent_recorded_at timestamptz,
  revoked_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_mandates_config_fk foreign key (tenant_id, provider_config_id) references public.billing_provider_configs (tenant_id, id) on delete restrict,
  constraint billing_mandates_customer_fk foreign key (tenant_id, provider_customer_id) references public.billing_provider_customers (tenant_id, id) on delete cascade,
  constraint billing_mandates_provider_check check (provider in ('mollie')),
  constraint billing_mandates_provider_id_check check (provider_mandate_id ~ '^mdt_[A-Za-z0-9]+$'),
  constraint billing_mandates_method_check check (method in ('directdebit', 'creditcard', 'paypal')),
  constraint billing_mandates_status_check check (status in ('pending', 'valid', 'invalid', 'revoked')),
  constraint billing_mandates_account_last4_check check (account_last4 is null or account_last4 ~ '^[A-Za-z0-9]{4}$'),
  constraint billing_mandates_consent_source_check check (consent_source in ('mollie_first_payment', 'provider_import', 'manual_sepa')),
  constraint billing_mandates_revoked_at_check check ((status = 'revoked' and revoked_at is not null) or status <> 'revoked'),
  constraint billing_mandates_tenant_id_id_unique unique (tenant_id, id),
  constraint billing_mandates_provider_id_unique unique (tenant_id, provider, provider_mandate_id)
);

alter table public.subscriptions
  add column if not exists billing_provider_customer_id uuid,
  add column if not exists billing_mandate_id uuid;

alter table public.subscriptions
  drop constraint if exists subscriptions_billing_provider_customer_fk,
  add constraint subscriptions_billing_provider_customer_fk foreign key (tenant_id, billing_provider_customer_id) references public.billing_provider_customers (tenant_id, id) on delete restrict,
  drop constraint if exists subscriptions_billing_mandate_fk,
  add constraint subscriptions_billing_mandate_fk foreign key (tenant_id, billing_mandate_id) references public.billing_mandates (tenant_id, id) on delete restrict,
  drop constraint if exists subscriptions_billing_mandate_pair_check,
  add constraint subscriptions_billing_mandate_pair_check check (
    billing_mandate_id is null
    or billing_provider_customer_id is not null
  );

create table public.billing_collection_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_config_id uuid not null,
  subscription_id uuid not null,
  manual_payment_id uuid not null,
  billing_provider_customer_id uuid not null,
  billing_mandate_id uuid not null,
  guardian_user_id uuid references auth.users (id) on delete set null,
  sequence_type text not null default 'recurring',
  attempt_number integer not null default 1,
  status text not null default 'scheduled',
  scheduled_for timestamptz not null,
  prenotified_at timestamptz,
  initiated_at timestamptz,
  completed_at timestamptz,
  provider_payment_id text,
  idempotency_key uuid not null,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_collection_attempts_config_fk foreign key (tenant_id, provider_config_id) references public.billing_provider_configs (tenant_id, id) on delete restrict,
  constraint billing_collection_attempts_subscription_fk foreign key (tenant_id, subscription_id) references public.subscriptions (tenant_id, id) on delete cascade,
  constraint billing_collection_attempts_payment_fk foreign key (tenant_id, manual_payment_id) references public.manual_payments (tenant_id, id) on delete cascade,
  constraint billing_collection_attempts_customer_fk foreign key (tenant_id, billing_provider_customer_id) references public.billing_provider_customers (tenant_id, id) on delete restrict,
  constraint billing_collection_attempts_mandate_fk foreign key (tenant_id, billing_mandate_id) references public.billing_mandates (tenant_id, id) on delete restrict,
  constraint billing_collection_attempts_sequence_check check (sequence_type = 'recurring'),
  constraint billing_collection_attempts_attempt_check check (attempt_number between 1 and 10),
  constraint billing_collection_attempts_status_check check (status in ('scheduled', 'prenotified', 'processing', 'pending', 'paid', 'failed', 'cancelled')),
  constraint billing_collection_attempts_provider_payment_check check (provider_payment_id is null or provider_payment_id ~ '^tr_[A-Za-z0-9]+$'),
  constraint billing_collection_attempts_prenotice_check check (
    status = 'scheduled'
    or prenotified_at is not null
  ),
  constraint billing_collection_attempts_completion_check check (
    status not in ('paid', 'failed', 'cancelled')
    or completed_at is not null
  ),
  constraint billing_collection_attempts_tenant_id_id_unique unique (tenant_id, id),
  constraint billing_collection_attempts_payment_attempt_unique unique (tenant_id, manual_payment_id, attempt_number),
  constraint billing_collection_attempts_idempotency_unique unique (tenant_id, idempotency_key)
);

alter table public.payment_sessions
  add column if not exists sequence_type text not null default 'oneoff',
  add column if not exists billing_provider_customer_id uuid,
  add column if not exists billing_mandate_id uuid,
  add column if not exists collection_attempt_id uuid;

alter table public.payment_sessions
  drop constraint if exists payment_sessions_sequence_type_check,
  add constraint payment_sessions_sequence_type_check check (sequence_type in ('oneoff', 'first', 'recurring')),
  drop constraint if exists payment_sessions_billing_provider_customer_fk,
  add constraint payment_sessions_billing_provider_customer_fk foreign key (tenant_id, billing_provider_customer_id) references public.billing_provider_customers (tenant_id, id) on delete restrict,
  drop constraint if exists payment_sessions_billing_mandate_fk,
  add constraint payment_sessions_billing_mandate_fk foreign key (tenant_id, billing_mandate_id) references public.billing_mandates (tenant_id, id) on delete restrict,
  drop constraint if exists payment_sessions_collection_attempt_fk,
  add constraint payment_sessions_collection_attempt_fk foreign key (tenant_id, collection_attempt_id) references public.billing_collection_attempts (tenant_id, id) on delete restrict,
  drop constraint if exists payment_sessions_sequence_links_check,
  add constraint payment_sessions_sequence_links_check check (
    (sequence_type = 'oneoff')
    or (sequence_type = 'first' and billing_provider_customer_id is not null)
    or (
      sequence_type = 'recurring'
      and billing_provider_customer_id is not null
      and billing_mandate_id is not null
      and collection_attempt_id is not null
    )
  );

alter table public.billing_events
  add column if not exists payment_session_id uuid;

alter table public.billing_events
  drop constraint if exists billing_events_payment_session_fk,
  add constraint billing_events_payment_session_fk foreign key (tenant_id, payment_session_id) references public.payment_sessions (tenant_id, id) on delete cascade,
  drop constraint if exists billing_events_type_check,
  add constraint billing_events_type_check check (type in (
    'payment_due',
    'payment_overdue',
    'payment_paid',
    'payment_failed',
    'payment_session_created',
    'payment_session_failed',
    'payment_provider_webhook',
    'payment_refunded',
    'payment_chargeback',
    'subscription_created',
    'subscription_changed',
    'subscription_paused',
    'subscription_cancelled',
    'subscription_completed',
    'mandate_pending',
    'mandate_activated',
    'mandate_revoked',
    'collection_prenotified',
    'collection_started',
    'collection_retry_scheduled',
    'reconciliation_exception',
    'invoice_created',
    'invoice_exported'
  ));

create index billing_provider_customers_guardian_idx
  on public.billing_provider_customers (guardian_user_id, status);
create index billing_mandates_guardian_status_idx
  on public.billing_mandates (guardian_user_id, status, updated_at desc);
create index billing_mandates_customer_idx
  on public.billing_mandates (tenant_id, provider_customer_id, status);
create index subscriptions_mandate_idx
  on public.subscriptions (tenant_id, billing_mandate_id, status);
create index billing_collection_attempts_schedule_idx
  on public.billing_collection_attempts (tenant_id, status, scheduled_for);
create index billing_collection_attempts_guardian_idx
  on public.billing_collection_attempts (guardian_user_id, status, scheduled_for desc);
create unique index payment_sessions_collection_attempt_unique
  on public.payment_sessions (tenant_id, collection_attempt_id)
  where collection_attempt_id is not null;
create unique index billing_events_session_type_unique
  on public.billing_events (tenant_id, payment_session_id, type)
  where payment_session_id is not null;

create trigger billing_provider_customers_set_updated_at
  before update on public.billing_provider_customers
  for each row execute function app_private.set_updated_at();

create trigger billing_mandates_set_updated_at
  before update on public.billing_mandates
  for each row execute function app_private.set_updated_at();

create trigger billing_collection_attempts_set_updated_at
  before update on public.billing_collection_attempts
  for each row execute function app_private.set_updated_at();

grant select on public.billing_provider_customers to authenticated;
grant select on public.billing_mandates to authenticated;
grant select on public.billing_collection_attempts to authenticated;

grant all on public.billing_provider_customers to service_role;
grant all on public.billing_mandates to service_role;
grant all on public.billing_collection_attempts to service_role;

alter table public.billing_provider_customers enable row level security;
alter table public.billing_provider_customers force row level security;
alter table public.billing_mandates enable row level security;
alter table public.billing_mandates force row level security;
alter table public.billing_collection_attempts enable row level security;
alter table public.billing_collection_attempts force row level security;

create policy "Scoped users can view billing provider customers"
  on public.billing_provider_customers
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or guardian_user_id = (select auth.uid())
  );

create policy "Scoped users can view billing mandates"
  on public.billing_mandates
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or guardian_user_id = (select auth.uid())
  );

create policy "Scoped users can view collection attempts"
  on public.billing_collection_attempts
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or guardian_user_id = (select auth.uid())
  );
