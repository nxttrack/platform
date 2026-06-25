alter table public.invoices
  drop constraint if exists invoices_collection_method_check;

alter table public.invoices
  add constraint invoices_collection_method_check check (collection_method in ('manual', 'mollie', 'sepa_direct_debit', 'external'));

alter table public.payment_records
  drop constraint if exists payment_records_method_check;

alter table public.payment_records
  add constraint payment_records_method_check check (payment_method in ('manual_bank_transfer', 'cash', 'card_terminal', 'ideal', 'mollie', 'direct_debit', 'external'));

alter table public.finance_export_requests
  drop constraint if exists finance_export_requests_type_check;

alter table public.finance_export_requests
  add constraint finance_export_requests_type_check check (export_type in ('invoices', 'payments', 'refunds', 'ledger', 'sepa_collections'));

create table public.sepa_collection_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider_config_id uuid references public.payment_provider_configs (id) on delete set null,
  status text not null default 'draft',
  mode text not null default 'manual_review',
  creditor_name text,
  creditor_reference text,
  default_collection_day integer not null default 1,
  min_notice_days integer not null default 5,
  mandate_intro text,
  parent_consent_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sepa_collection_settings_id_tenant_unique unique (id, tenant_id),
  constraint sepa_collection_settings_unique_tenant unique (tenant_id),
  constraint sepa_collection_settings_status_check check (status in ('draft', 'configured', 'active', 'paused', 'disabled')),
  constraint sepa_collection_settings_mode_check check (mode in ('manual_review', 'prepare_only', 'submit_to_mollie')),
  constraint sepa_collection_settings_collection_day_check check (default_collection_day between 1 and 28),
  constraint sepa_collection_settings_notice_days_check check (min_notice_days between 0 and 30)
);

create table public.sepa_mandates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  guardian_profile_id uuid references public.profiles (id) on delete set null,
  provider text not null default 'mollie',
  provider_customer_id text,
  provider_mandate_id text,
  mandate_reference text not null,
  account_holder_name text,
  iban_last4 text,
  iban_country text,
  status text not null default 'draft',
  consent_given_at timestamptz,
  signed_at timestamptz,
  valid_from date,
  revoked_at timestamptz,
  revoked_reason text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sepa_mandates_provider_check check (provider in ('mollie', 'external')),
  constraint sepa_mandates_status_check check (status in ('draft', 'pending_first_payment', 'pending', 'valid', 'invalid', 'revoked', 'expired', 'failed')),
  constraint sepa_mandates_iban_last4_check check (iban_last4 is null or iban_last4 ~ '^[0-9A-Z]{2,4}$'),
  constraint sepa_mandates_iban_country_check check (iban_country is null or iban_country ~ '^[A-Z]{2}$'),
  constraint sepa_mandates_id_tenant_unique unique (id, tenant_id),
  constraint sepa_mandates_reference_unique unique (tenant_id, mandate_reference),
  constraint sepa_mandates_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint sepa_mandates_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade
);

create unique index sepa_mandates_one_valid_per_enrollment_idx
  on public.sepa_mandates (tenant_id, enrollment_id)
  where status in ('pending_first_payment', 'pending', 'valid');

create table public.sepa_collection_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null default 'mollie',
  mode text not null default 'test',
  run_number text not null,
  title text not null,
  period_start date,
  period_end date,
  requested_collection_date date not null,
  status text not null default 'draft',
  invoice_count integer not null default 0,
  total_amount_cents integer not null default 0,
  currency text not null default 'EUR',
  provider_batch_id text,
  file_path text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  submitted_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sepa_collection_runs_provider_check check (provider in ('mollie', 'external')),
  constraint sepa_collection_runs_mode_check check (mode in ('test', 'live')),
  constraint sepa_collection_runs_status_check check (status in ('draft', 'ready', 'submitted', 'processing', 'processed', 'partially_failed', 'failed', 'cancelled')),
  constraint sepa_collection_runs_amount_check check (total_amount_cents >= 0),
  constraint sepa_collection_runs_invoice_count_check check (invoice_count >= 0),
  constraint sepa_collection_runs_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint sepa_collection_runs_period_check check (period_start is null or period_end is null or period_start <= period_end),
  constraint sepa_collection_runs_id_tenant_unique unique (id, tenant_id),
  constraint sepa_collection_runs_number_unique unique (tenant_id, run_number)
);

create table public.sepa_collection_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  collection_run_id uuid not null references public.sepa_collection_runs (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  payment_record_id uuid references public.payment_records (id) on delete set null,
  mandate_id uuid not null references public.sepa_mandates (id) on delete restrict,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  amount_cents integer not null,
  currency text not null default 'EUR',
  sequence_type text not null default 'recurring',
  status text not null default 'queued',
  provider_payment_id text,
  scheduled_collection_date date,
  processed_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sepa_collection_items_amount_check check (amount_cents > 0),
  constraint sepa_collection_items_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint sepa_collection_items_sequence_check check (sequence_type in ('first', 'recurring')),
  constraint sepa_collection_items_status_check check (status in ('queued', 'pending', 'submitted', 'paid', 'failed', 'cancelled', 'skipped')),
  constraint sepa_collection_items_id_tenant_unique unique (id, tenant_id),
  constraint sepa_collection_items_run_invoice_unique unique (tenant_id, collection_run_id, invoice_id),
  constraint sepa_collection_items_run_tenant_fk foreign key (collection_run_id, tenant_id) references public.sepa_collection_runs (id, tenant_id) on delete cascade,
  constraint sepa_collection_items_invoice_tenant_fk foreign key (invoice_id, tenant_id) references public.invoices (id, tenant_id) on delete cascade,
  constraint sepa_collection_items_mandate_tenant_fk foreign key (mandate_id, tenant_id) references public.sepa_mandates (id, tenant_id) on delete restrict,
  constraint sepa_collection_items_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint sepa_collection_items_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade
);

create table public.sepa_incasso_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  mandate_id uuid references public.sepa_mandates (id) on delete cascade,
  collection_run_id uuid references public.sepa_collection_runs (id) on delete cascade,
  collection_item_id uuid references public.sepa_collection_items (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sepa_incasso_events_id_tenant_unique unique (id, tenant_id),
  constraint sepa_incasso_events_mandate_tenant_fk foreign key (mandate_id, tenant_id) references public.sepa_mandates (id, tenant_id) on delete cascade,
  constraint sepa_incasso_events_run_tenant_fk foreign key (collection_run_id, tenant_id) references public.sepa_collection_runs (id, tenant_id) on delete cascade,
  constraint sepa_incasso_events_item_tenant_fk foreign key (collection_item_id, tenant_id) references public.sepa_collection_items (id, tenant_id) on delete cascade
);

create index sepa_collection_settings_tenant_status_idx on public.sepa_collection_settings (tenant_id, status);
create index sepa_mandates_tenant_status_idx on public.sepa_mandates (tenant_id, status, created_at desc);
create index sepa_mandates_provider_customer_idx on public.sepa_mandates (provider, provider_customer_id);
create index sepa_mandates_provider_mandate_idx on public.sepa_mandates (provider, provider_mandate_id);
create index sepa_collection_runs_tenant_status_idx on public.sepa_collection_runs (tenant_id, status, requested_collection_date desc);
create index sepa_collection_items_run_status_idx on public.sepa_collection_items (tenant_id, collection_run_id, status);
create index sepa_collection_items_invoice_idx on public.sepa_collection_items (tenant_id, invoice_id);
create index sepa_collection_items_provider_payment_idx on public.sepa_collection_items (provider_payment_id) where provider_payment_id is not null;
create index sepa_incasso_events_tenant_created_idx on public.sepa_incasso_events (tenant_id, created_at desc);

create trigger sepa_collection_settings_set_updated_at
  before update on public.sepa_collection_settings
  for each row execute function app_private.set_updated_at();

create trigger sepa_mandates_set_updated_at
  before update on public.sepa_mandates
  for each row execute function app_private.set_updated_at();

create trigger sepa_collection_runs_set_updated_at
  before update on public.sepa_collection_runs
  for each row execute function app_private.set_updated_at();

create trigger sepa_collection_items_set_updated_at
  before update on public.sepa_collection_items
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.sepa_collection_settings to authenticated;
grant select, insert, update on public.sepa_mandates to authenticated;
grant select, insert, update on public.sepa_collection_runs to authenticated;
grant select, insert, update on public.sepa_collection_items to authenticated;
grant select, insert on public.sepa_incasso_events to authenticated;

grant all on public.sepa_collection_settings to service_role;
grant all on public.sepa_mandates to service_role;
grant all on public.sepa_collection_runs to service_role;
grant all on public.sepa_collection_items to service_role;
grant all on public.sepa_incasso_events to service_role;

alter table public.sepa_collection_settings enable row level security;
alter table public.sepa_mandates enable row level security;
alter table public.sepa_collection_runs enable row level security;
alter table public.sepa_collection_items enable row level security;
alter table public.sepa_incasso_events enable row level security;

create policy "Tenant staff can manage sepa settings"
  on public.sepa_collection_settings
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

create policy "Participants and staff can view sepa mandates"
  on public.sepa_mandates
  for select
  to authenticated
  using (app_private.current_user_can_access_enrollment(tenant_id, enrollment_id));

create policy "Tenant staff can insert sepa mandates"
  on public.sepa_mandates
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update sepa mandates"
  on public.sepa_mandates
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

create policy "Tenant staff can manage sepa collection runs"
  on public.sepa_collection_runs
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

create policy "Tenant staff can manage sepa collection items"
  on public.sepa_collection_items
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

create policy "Tenant staff can view sepa incasso events"
  on public.sepa_incasso_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert sepa incasso events"
  on public.sepa_incasso_events
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create or replace function app_private.refresh_sepa_collection_run_totals()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  target_run_id uuid;
  target_tenant_id uuid;
begin
  target_run_id := coalesce(new.collection_run_id, old.collection_run_id);
  target_tenant_id := coalesce(new.tenant_id, old.tenant_id);

  update public.sepa_collection_runs
  set invoice_count = (
        select count(*)::integer
        from public.sepa_collection_items
        where tenant_id = target_tenant_id
          and collection_run_id = target_run_id
          and status not in ('cancelled', 'skipped')
      ),
      total_amount_cents = (
        select coalesce(sum(amount_cents), 0)::integer
        from public.sepa_collection_items
        where tenant_id = target_tenant_id
          and collection_run_id = target_run_id
          and status not in ('cancelled', 'skipped')
      )
  where tenant_id = target_tenant_id
    and id = target_run_id;

  return coalesce(new, old);
end $$;

revoke all on function app_private.refresh_sepa_collection_run_totals() from public;

create trigger sepa_collection_items_refresh_run_totals
  after insert or update or delete on public.sepa_collection_items
  for each row execute function app_private.refresh_sepa_collection_run_totals();

create trigger sepa_collection_settings_audit_events
  after insert or update or delete on public.sepa_collection_settings
  for each row execute function app_private.record_audit_event();

create trigger sepa_mandates_audit_events
  after insert or update or delete on public.sepa_mandates
  for each row execute function app_private.record_audit_event();

create trigger sepa_collection_runs_audit_events
  after insert or update or delete on public.sepa_collection_runs
  for each row execute function app_private.record_audit_event();

create trigger sepa_collection_items_audit_events
  after insert or update or delete on public.sepa_collection_items
  for each row execute function app_private.record_audit_event();

do $$
declare
  demo_tenant_id uuid;
  mollie_config_id uuid;
  sample_invoice_id uuid;
  sample_enrollment_id uuid;
  sample_participant_id uuid;
begin
  select id into demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if demo_tenant_id is null then
    return;
  end if;

  update public.payment_provider_configs
  set display_name = 'Mollie iDEAL & SEPA voorbereiding',
      capabilities = array['ideal', 'checkout', 'webhook', 'mandates', 'sepa_direct_debit', 'recurring'],
      metadata = jsonb_build_object('adapter', 'prepared_no_live_calls', 'sepa', true)
  where tenant_id = demo_tenant_id
    and provider = 'mollie'
    and mode = 'test'
  returning id into mollie_config_id;

  insert into public.sepa_collection_settings (
    tenant_id,
    provider_config_id,
    status,
    mode,
    creditor_name,
    creditor_reference,
    default_collection_day,
    min_notice_days,
    mandate_intro,
    parent_consent_text,
    metadata
  )
  values (
    demo_tenant_id,
    mollie_config_id,
    'configured',
    'prepare_only',
    'AquaSwim Demo',
    'MOLLIE-SEPA-PREPARED',
    1,
    5,
    'Ouders geven toestemming voor automatische incasso via Mollie na een eerste betaling.',
    'Ik machtig de zwemschool om lesgeld via automatische incasso af te schrijven volgens de overeengekomen voorwaarden.',
    '{"source":"sepa_incasso_engine"}'::jsonb
  )
  on conflict (tenant_id) do update
    set provider_config_id = excluded.provider_config_id,
        status = excluded.status,
        mode = excluded.mode,
        creditor_name = excluded.creditor_name,
        creditor_reference = excluded.creditor_reference,
        default_collection_day = excluded.default_collection_day,
        min_notice_days = excluded.min_notice_days,
        mandate_intro = excluded.mandate_intro,
        parent_consent_text = excluded.parent_consent_text,
        metadata = excluded.metadata;

  select i.id, i.enrollment_id, i.participant_id
    into sample_invoice_id, sample_enrollment_id, sample_participant_id
  from public.invoices i
  where i.tenant_id = demo_tenant_id
  order by i.created_at asc
  limit 1;

  if sample_invoice_id is not null then
    insert into public.sepa_mandates (
      tenant_id,
      enrollment_id,
      participant_id,
      provider,
      provider_customer_id,
      provider_mandate_id,
      mandate_reference,
      account_holder_name,
      iban_last4,
      iban_country,
      status,
      consent_given_at,
      signed_at,
      valid_from,
      metadata
    )
    values (
      demo_tenant_id,
      sample_enrollment_id,
      sample_participant_id,
      'mollie',
      'cst_demo_aquaswim',
      'mdt_demo_aquaswim',
      'AQUA-SEPA-DEMO-0001',
      'Demo Ouder',
      '1234',
      'NL',
      'valid',
      now(),
      now(),
      current_date,
      '{"source":"demo_seed","mollie_sequence":"first_payment_completed"}'::jsonb
    )
    on conflict (tenant_id, mandate_reference) do update
      set provider_customer_id = excluded.provider_customer_id,
          provider_mandate_id = excluded.provider_mandate_id,
          account_holder_name = excluded.account_holder_name,
          iban_last4 = excluded.iban_last4,
          iban_country = excluded.iban_country,
          status = excluded.status,
          consent_given_at = excluded.consent_given_at,
          signed_at = excluded.signed_at,
          valid_from = excluded.valid_from,
          metadata = excluded.metadata;
  end if;
end $$;
