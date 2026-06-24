create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  subscription_plan_id uuid references public.subscription_plans (id) on delete set null,
  invoice_number text not null,
  title text not null,
  description text,
  period_start date,
  period_end date,
  issued_on date not null default current_date,
  due_on date,
  amount_due_cents integer not null default 0,
  amount_paid_cents integer not null default 0,
  currency text not null default 'EUR',
  status text not null default 'open',
  collection_method text not null default 'manual',
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_amount_due_check check (amount_due_cents >= 0),
  constraint invoices_amount_paid_check check (amount_paid_cents >= 0),
  constraint invoices_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint invoices_status_check check (status in ('draft', 'open', 'partially_paid', 'paid', 'overdue', 'void')),
  constraint invoices_collection_method_check check (collection_method in ('manual', 'mollie', 'external')),
  constraint invoices_period_check check (period_start is null or period_end is null or period_start <= period_end),
  constraint invoices_id_tenant_unique unique (id, tenant_id),
  constraint invoices_unique_number unique (tenant_id, invoice_number),
  constraint invoices_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint invoices_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint invoices_subscription_plan_tenant_fk foreign key (subscription_plan_id, tenant_id) references public.subscription_plans (id, tenant_id)
);

create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  provider text not null default 'manual',
  provider_payment_id text,
  provider_checkout_url text,
  payment_method text not null default 'manual_bank_transfer',
  amount_cents integer not null default 0,
  currency text not null default 'EUR',
  status text not null default 'recorded',
  received_on date,
  recorded_by_profile_id uuid references public.profiles (id) on delete set null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_records_provider_check check (provider in ('manual', 'mollie', 'external')),
  constraint payment_records_method_check check (payment_method in ('manual_bank_transfer', 'cash', 'card_terminal', 'ideal', 'mollie', 'external')),
  constraint payment_records_status_check check (status in ('recorded', 'pending', 'paid', 'failed', 'refunded', 'cancelled')),
  constraint payment_records_amount_check check (amount_cents >= 0),
  constraint payment_records_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint payment_records_id_tenant_unique unique (id, tenant_id),
  constraint payment_records_invoice_tenant_fk foreign key (invoice_id, tenant_id) references public.invoices (id, tenant_id) on delete cascade,
  constraint payment_records_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint payment_records_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade
);

create table public.payment_provider_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null,
  mode text not null default 'test',
  status text not null default 'disabled',
  display_name text not null,
  external_profile_id text,
  webhook_secret_reference text,
  api_key_secret_reference text,
  capabilities text[] not null default array[]::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_provider_configs_provider_check check (provider in ('manual', 'mollie')),
  constraint payment_provider_configs_mode_check check (mode in ('test', 'live')),
  constraint payment_provider_configs_status_check check (status in ('disabled', 'configured', 'active')),
  constraint payment_provider_configs_id_tenant_unique unique (id, tenant_id),
  constraint payment_provider_configs_unique_provider unique (tenant_id, provider, mode)
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete cascade,
  payment_record_id uuid references public.payment_records (id) on delete cascade,
  provider text not null default 'manual',
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payment_events_provider_check check (provider in ('manual', 'mollie', 'external')),
  constraint payment_events_id_tenant_unique unique (id, tenant_id),
  constraint payment_events_invoice_tenant_fk foreign key (invoice_id, tenant_id) references public.invoices (id, tenant_id) on delete cascade,
  constraint payment_events_payment_record_tenant_fk foreign key (payment_record_id, tenant_id) references public.payment_records (id, tenant_id) on delete cascade
);

create index invoices_tenant_status_idx on public.invoices (tenant_id, status, due_on);
create index invoices_enrollment_id_idx on public.invoices (enrollment_id);
create index invoices_participant_id_idx on public.invoices (participant_id);
create index payment_records_invoice_id_idx on public.payment_records (invoice_id);
create index payment_records_participant_id_idx on public.payment_records (participant_id);
create index payment_records_provider_payment_idx on public.payment_records (provider, provider_payment_id);
create index payment_provider_configs_tenant_provider_idx on public.payment_provider_configs (tenant_id, provider, mode);
create index payment_events_invoice_id_idx on public.payment_events (invoice_id);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function app_private.set_updated_at();

create trigger payment_records_set_updated_at
  before update on public.payment_records
  for each row execute function app_private.set_updated_at();

create trigger payment_provider_configs_set_updated_at
  before update on public.payment_provider_configs
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.invoices to authenticated;
grant select, insert, update on public.payment_records to authenticated;
grant select, insert, update on public.payment_provider_configs to authenticated;
grant select, insert on public.payment_events to authenticated;

grant all on public.invoices to service_role;
grant all on public.payment_records to service_role;
grant all on public.payment_provider_configs to service_role;
grant all on public.payment_events to service_role;

alter table public.invoices enable row level security;
alter table public.payment_records enable row level security;
alter table public.payment_provider_configs enable row level security;
alter table public.payment_events enable row level security;

create policy "Participants and staff can view invoices"
  on public.invoices
  for select
  to authenticated
  using (app_private.current_user_can_access_enrollment(tenant_id, enrollment_id));

create policy "Tenant staff can insert invoices"
  on public.invoices
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update invoices"
  on public.invoices
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

create policy "Participants and staff can view payment records"
  on public.payment_records
  for select
  to authenticated
  using (app_private.current_user_can_access_enrollment(tenant_id, enrollment_id));

create policy "Tenant staff can insert payment records"
  on public.payment_records
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update payment records"
  on public.payment_records
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

create policy "Tenant staff can view payment provider configs"
  on public.payment_provider_configs
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert payment provider configs"
  on public.payment_provider_configs
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update payment provider configs"
  on public.payment_provider_configs
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

create policy "Tenant staff can view payment events"
  on public.payment_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert payment events"
  on public.payment_events
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create or replace function app_private.notify_guardians_for_invoice()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  target_participant public.participants%rowtype;
  guardian record;
begin
  if tg_op = 'UPDATE'
    and old.status is not distinct from new.status
    and old.amount_due_cents is not distinct from new.amount_due_cents
    and old.amount_paid_cents is not distinct from new.amount_paid_cents then
    return new;
  end if;

  select * into target_participant
  from public.participants
  where id = new.participant_id
    and tenant_id = new.tenant_id;

  for guardian in
    select profile_id
    from public.participant_guardians
    where tenant_id = new.tenant_id
      and participant_id = new.participant_id
      and status = 'active'
  loop
    insert into public.parent_notifications (
      tenant_id,
      recipient_profile_id,
      participant_id,
      enrollment_id,
      title,
      body,
      notification_type,
      status
    )
    values (
      new.tenant_id,
      guardian.profile_id,
      new.participant_id,
      new.enrollment_id,
      case when tg_op = 'INSERT' then 'Nieuwe factuur beschikbaar' else 'Betaalstatus bijgewerkt' end,
      coalesce(target_participant.display_name, 'Leerling') || ': ' || new.title || ' - ' || new.status,
      'payment',
      'unread'
    );
  end loop;

  return new;
end $$;

revoke all on function app_private.notify_guardians_for_invoice() from public;

create or replace function app_private.sync_invoice_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  target_invoice public.invoices%rowtype;
  paid_total integer;
  next_status text;
  guardian record;
  target_participant public.participants%rowtype;
begin
  select * into target_invoice
  from public.invoices
  where id = new.invoice_id
    and tenant_id = new.tenant_id;

  if not found then
    return new;
  end if;

  select coalesce(sum(amount_cents), 0)::integer into paid_total
  from public.payment_records
  where tenant_id = new.tenant_id
    and invoice_id = new.invoice_id
    and status in ('recorded', 'paid');

  if target_invoice.status = 'void' then
    next_status := 'void';
  elsif paid_total <= 0 then
    next_status := 'open';
  elsif paid_total < target_invoice.amount_due_cents then
    next_status := 'partially_paid';
  else
    next_status := 'paid';
  end if;

  update public.invoices
  set amount_paid_cents = paid_total,
      status = next_status
  where id = new.invoice_id
    and tenant_id = new.tenant_id;

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
    new.id,
    new.provider,
    'payment_record_' || new.status,
    jsonb_build_object('amount_cents', new.amount_cents, 'currency', new.currency, 'method', new.payment_method),
    new.recorded_by_profile_id
  );

  select * into target_participant
  from public.participants
  where id = new.participant_id
    and tenant_id = new.tenant_id;

  if tg_op = 'INSERT' and new.status in ('recorded', 'paid') then
    for guardian in
      select profile_id
      from public.participant_guardians
      where tenant_id = new.tenant_id
        and participant_id = new.participant_id
        and status = 'active'
    loop
      insert into public.parent_notifications (
        tenant_id,
        recipient_profile_id,
        participant_id,
        enrollment_id,
        title,
        body,
        notification_type,
        status
      )
      values (
        new.tenant_id,
        guardian.profile_id,
        new.participant_id,
        new.enrollment_id,
        'Betaling geregistreerd',
        coalesce(target_participant.display_name, 'Leerling') || ': betaling van ' || (new.amount_cents::numeric / 100)::text || ' ' || new.currency || ' is verwerkt.',
        'payment',
        'unread'
      );
    end loop;
  end if;

  return new;
end $$;

revoke all on function app_private.sync_invoice_payment_status() from public;

create trigger invoices_notify_guardians
  after insert or update on public.invoices
  for each row execute function app_private.notify_guardians_for_invoice();

create trigger payment_records_sync_invoice_status
  after insert or update on public.payment_records
  for each row execute function app_private.sync_invoice_payment_status();

do $$
declare
  demo_tenant_id uuid;
  emma_id uuid;
  noah_id uuid;
  emma_enrollment_id uuid;
  noah_enrollment_id uuid;
  emma_plan_id uuid;
  noah_plan_id uuid;
  invoice_id uuid;
begin
  select id into demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if demo_tenant_id is null then
    return;
  end if;

  insert into public.payment_provider_configs (
    tenant_id,
    provider,
    mode,
    status,
    display_name,
    capabilities,
    metadata
  )
  values
    (demo_tenant_id, 'manual', 'test', 'active', 'Handmatige betalingen', array['manual_status', 'manual_recording'], '{"phase":"manual_first"}'::jsonb),
    (demo_tenant_id, 'mollie', 'test', 'disabled', 'Mollie iDEAL voorbereiding', array['ideal', 'checkout', 'webhook'], '{"adapter":"prepared_no_live_calls"}'::jsonb)
  on conflict (tenant_id, provider, mode) do update
    set status = excluded.status,
        display_name = excluded.display_name,
        capabilities = excluded.capabilities,
        metadata = excluded.metadata;

  select id into emma_id
  from public.participants
  where tenant_id = demo_tenant_id
    and external_reference = 'child-emma-devries';

  select id into noah_id
  from public.participants
  where tenant_id = demo_tenant_id
    and external_reference = 'child-noah-bakker';

  select id, subscription_plan_id
    into emma_enrollment_id, emma_plan_id
  from public.enrollments
  where tenant_id = demo_tenant_id
    and participant_id = emma_id
  limit 1;

  select id, subscription_plan_id
    into noah_enrollment_id, noah_plan_id
  from public.enrollments
  where tenant_id = demo_tenant_id
    and participant_id = noah_id
  limit 1;

  if emma_enrollment_id is not null then
    insert into public.invoices (
      tenant_id,
      enrollment_id,
      participant_id,
      subscription_plan_id,
      invoice_number,
      title,
      description,
      period_start,
      period_end,
      issued_on,
      due_on,
      amount_due_cents,
      currency,
      status,
      collection_method
    )
    values (
      demo_tenant_id,
      emma_enrollment_id,
      emma_id,
      emma_plan_id,
      'AQUA-2026-0001',
      'Zwemles juli 2026',
      'Demo factuur voor handmatige betaling.',
      '2026-07-01',
      '2026-07-31',
      '2026-06-24',
      '2026-07-01',
      6995,
      'EUR',
      'open',
      'manual'
    )
    on conflict (tenant_id, invoice_number) do update
      set title = excluded.title,
          description = excluded.description,
          period_start = excluded.period_start,
          period_end = excluded.period_end,
          due_on = excluded.due_on,
          amount_due_cents = excluded.amount_due_cents,
          currency = excluded.currency,
          collection_method = excluded.collection_method
    returning id into invoice_id;
  end if;

  if noah_enrollment_id is not null then
    insert into public.invoices (
      tenant_id,
      enrollment_id,
      participant_id,
      subscription_plan_id,
      invoice_number,
      title,
      description,
      period_start,
      period_end,
      issued_on,
      due_on,
      amount_due_cents,
      currency,
      status,
      collection_method
    )
    values (
      demo_tenant_id,
      noah_enrollment_id,
      noah_id,
      noah_plan_id,
      'AQUA-2026-0002',
      'Zwemles juli 2026',
      'Demo factuur met geregistreerde handmatige betaling.',
      '2026-07-01',
      '2026-07-31',
      '2026-06-24',
      '2026-07-01',
      6995,
      'EUR',
      'open',
      'manual'
    )
    on conflict (tenant_id, invoice_number) do update
      set title = excluded.title,
          description = excluded.description,
          period_start = excluded.period_start,
          period_end = excluded.period_end,
          due_on = excluded.due_on,
          amount_due_cents = excluded.amount_due_cents,
          currency = excluded.currency,
          collection_method = excluded.collection_method
    returning id into invoice_id;

    insert into public.payment_records (
      tenant_id,
      invoice_id,
      enrollment_id,
      participant_id,
      provider,
      payment_method,
      amount_cents,
      currency,
      status,
      received_on,
      note
    )
    values (
      demo_tenant_id,
      invoice_id,
      noah_enrollment_id,
      noah_id,
      'manual',
      'manual_bank_transfer',
      6995,
      'EUR',
      'recorded',
      '2026-06-24',
      'Demo: handmatige bankbetaling geregistreerd.'
    );
  end if;
end $$;
