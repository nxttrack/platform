alter table public.billing_provider_configs
  drop constraint if exists billing_provider_configs_mollie_secret_reference_check,
  add constraint billing_provider_configs_mollie_secret_reference_check check (
    provider <> 'mollie'
    or secret_reference is null
    or secret_reference ~ '^(?:(?:GITHUB_ENV|ENV):)?MOLLIE_[A-Z0-9_]+$'
  );

alter table public.payment_sessions
  drop constraint if exists payment_sessions_idempotency_key_format_check,
  add constraint payment_sessions_idempotency_key_format_check check (
    idempotency_key is null
    or idempotency_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  );

create unique index if not exists payment_sessions_one_open_provider_attempt
  on public.payment_sessions (tenant_id, manual_payment_id, provider_config_id)
  where manual_payment_id is not null
    and provider_config_id is not null
    and status in ('draft', 'pending', 'authorized');
