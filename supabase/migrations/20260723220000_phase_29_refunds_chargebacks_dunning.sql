alter table public.manual_payments
  add column if not exists refunded_cents integer not null default 0,
  add column if not exists chargeback_cents integer not null default 0;

alter table public.manual_payments
  drop constraint if exists manual_payments_status_check,
  add constraint manual_payments_status_check check (status in ('due', 'overdue', 'paid', 'refunded', 'chargeback', 'waived', 'cancelled')),
  drop constraint if exists manual_payments_refunded_cents_check,
  add constraint manual_payments_refunded_cents_check check (refunded_cents between 0 and amount_cents),
  drop constraint if exists manual_payments_chargeback_cents_check,
  add constraint manual_payments_chargeback_cents_check check (chargeback_cents between 0 and amount_cents),
  drop constraint if exists manual_payments_financial_status_check,
  add constraint manual_payments_financial_status_check check (
    (status = 'refunded' and refunded_cents = amount_cents)
    or (status = 'chargeback' and chargeback_cents > 0)
    or status not in ('refunded', 'chargeback')
  );

create table public.billing_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_config_id uuid not null,
  payment_session_id uuid not null,
  manual_payment_id uuid not null,
  participant_id uuid,
  guardian_user_id uuid references auth.users (id) on delete set null,
  provider text not null default 'mollie',
  provider_payment_id text not null,
  provider_refund_id text,
  idempotency_key uuid not null,
  amount_cents integer not null,
  currency text not null,
  status text not null default 'draft',
  description text not null,
  requested_by_user_id uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  last_synced_at timestamptz,
  failure_code text,
  failure_message text,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_refunds_config_fk foreign key (tenant_id, provider_config_id) references public.billing_provider_configs (tenant_id, id) on delete restrict,
  constraint billing_refunds_session_fk foreign key (tenant_id, payment_session_id) references public.payment_sessions (tenant_id, id) on delete restrict,
  constraint billing_refunds_payment_fk foreign key (tenant_id, manual_payment_id) references public.manual_payments (tenant_id, id) on delete restrict,
  constraint billing_refunds_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete set null,
  constraint billing_refunds_provider_check check (provider = 'mollie'),
  constraint billing_refunds_provider_payment_check check (provider_payment_id ~ '^tr_[A-Za-z0-9]+$'),
  constraint billing_refunds_provider_refund_check check (provider_refund_id is null or provider_refund_id ~ '^re_[A-Za-z0-9]+$'),
  constraint billing_refunds_amount_check check (amount_cents > 0),
  constraint billing_refunds_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint billing_refunds_status_check check (status in ('draft', 'unknown', 'queued', 'pending', 'processing', 'refunded', 'failed', 'cancelled')),
  constraint billing_refunds_completed_check check (
    status not in ('refunded', 'failed', 'cancelled')
    or completed_at is not null
  ),
  constraint billing_refunds_tenant_id_id_unique unique (tenant_id, id),
  constraint billing_refunds_idempotency_unique unique (tenant_id, idempotency_key),
  constraint billing_refunds_provider_id_unique unique (tenant_id, provider, provider_refund_id)
);

create table public.billing_chargebacks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_config_id uuid not null,
  payment_session_id uuid not null,
  manual_payment_id uuid not null,
  participant_id uuid,
  guardian_user_id uuid references auth.users (id) on delete set null,
  provider text not null default 'mollie',
  provider_payment_id text not null,
  provider_chargeback_id text not null,
  amount_cents integer not null,
  currency text not null,
  status text not null default 'received',
  reason_code text,
  occurred_at timestamptz not null,
  reversed_at timestamptz,
  last_synced_at timestamptz not null default now(),
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_chargebacks_config_fk foreign key (tenant_id, provider_config_id) references public.billing_provider_configs (tenant_id, id) on delete restrict,
  constraint billing_chargebacks_session_fk foreign key (tenant_id, payment_session_id) references public.payment_sessions (tenant_id, id) on delete restrict,
  constraint billing_chargebacks_payment_fk foreign key (tenant_id, manual_payment_id) references public.manual_payments (tenant_id, id) on delete restrict,
  constraint billing_chargebacks_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete set null,
  constraint billing_chargebacks_provider_check check (provider = 'mollie'),
  constraint billing_chargebacks_provider_payment_check check (provider_payment_id ~ '^tr_[A-Za-z0-9]+$'),
  constraint billing_chargebacks_provider_chargeback_check check (provider_chargeback_id ~ '^chb_[A-Za-z0-9]+$'),
  constraint billing_chargebacks_amount_check check (amount_cents > 0),
  constraint billing_chargebacks_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint billing_chargebacks_status_check check (status in ('received', 'reversed')),
  constraint billing_chargebacks_reversed_check check (
    (status = 'reversed' and reversed_at is not null)
    or status = 'received'
  ),
  constraint billing_chargebacks_tenant_id_id_unique unique (tenant_id, id),
  constraint billing_chargebacks_provider_id_unique unique (tenant_id, provider, provider_chargeback_id)
);

create index billing_refunds_payment_idx
  on public.billing_refunds (tenant_id, manual_payment_id, status, created_at desc);
create index billing_refunds_provider_payment_idx
  on public.billing_refunds (tenant_id, provider_payment_id, status);
create index billing_refunds_guardian_idx
  on public.billing_refunds (guardian_user_id, status, created_at desc);
create index billing_chargebacks_payment_idx
  on public.billing_chargebacks (tenant_id, manual_payment_id, status, occurred_at desc);
create index billing_chargebacks_provider_payment_idx
  on public.billing_chargebacks (tenant_id, provider_payment_id, status);
create index billing_chargebacks_guardian_idx
  on public.billing_chargebacks (guardian_user_id, status, occurred_at desc);

create trigger billing_refunds_set_updated_at
  before update on public.billing_refunds
  for each row execute function app_private.set_updated_at();

create trigger billing_chargebacks_set_updated_at
  before update on public.billing_chargebacks
  for each row execute function app_private.set_updated_at();

grant select on public.billing_refunds to authenticated;
grant select on public.billing_chargebacks to authenticated;
grant all on public.billing_refunds to service_role;
grant all on public.billing_chargebacks to service_role;

alter table public.billing_refunds enable row level security;
alter table public.billing_refunds force row level security;
alter table public.billing_chargebacks enable row level security;
alter table public.billing_chargebacks force row level security;

create policy "Scoped users can view billing refunds"
  on public.billing_refunds
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or guardian_user_id = (select auth.uid())
  );

create policy "Scoped users can view billing chargebacks"
  on public.billing_chargebacks
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or guardian_user_id = (select auth.uid())
  );
