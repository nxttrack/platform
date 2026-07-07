alter table public.tenant_notifications
  drop constraint if exists tenant_notifications_type_check,
  add constraint tenant_notifications_type_check check (type in ('progress_score', 'badge_award', 'graduation_invite', 'certificate_issued', 'payment_due', 'payment_overdue', 'payment_received', 'system'));

create table public.payment_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid,
  code text,
  name text not null,
  description text,
  amount_cents integer not null,
  currency text not null default 'EUR',
  billing_interval text not null default 'monthly',
  billing_day integer,
  payment_terms_days integer not null default 14,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_plans_program_fk foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete restrict,
  constraint payment_plans_amount_check check (amount_cents >= 0),
  constraint payment_plans_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint payment_plans_interval_check check (billing_interval in ('monthly', 'quarterly', 'yearly', 'one_time', 'manual')),
  constraint payment_plans_billing_day_check check (billing_day is null or billing_day between 1 and 28),
  constraint payment_plans_terms_check check (payment_terms_days >= 0 and payment_terms_days <= 90),
  constraint payment_plans_status_check check (status in ('draft', 'active', 'archived')),
  constraint payment_plans_tenant_id_id_unique unique (tenant_id, id),
  constraint payment_plans_tenant_code_unique unique (tenant_id, code)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid not null,
  guardian_user_id uuid references auth.users (id) on delete set null,
  payment_plan_id uuid not null,
  status text not null default 'active',
  starts_on date not null default current_date,
  ends_on date,
  next_due_on date,
  amount_cents integer not null,
  currency text not null default 'EUR',
  billing_interval text not null default 'monthly',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint subscriptions_enrollment_fk foreign key (tenant_id, enrollment_id, participant_id) references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint subscriptions_payment_plan_fk foreign key (tenant_id, payment_plan_id) references public.payment_plans (tenant_id, id) on delete restrict,
  constraint subscriptions_status_check check (status in ('active', 'paused', 'cancelled', 'completed')),
  constraint subscriptions_amount_check check (amount_cents >= 0),
  constraint subscriptions_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint subscriptions_interval_check check (billing_interval in ('monthly', 'quarterly', 'yearly', 'one_time', 'manual')),
  constraint subscriptions_date_check check (ends_on is null or starts_on <= ends_on),
  constraint subscriptions_tenant_id_id_unique unique (tenant_id, id)
);

create table public.manual_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  subscription_id uuid not null,
  participant_id uuid not null,
  enrollment_id uuid not null,
  guardian_user_id uuid references auth.users (id) on delete set null,
  amount_cents integer not null,
  currency text not null default 'EUR',
  due_on date not null,
  paid_on date,
  status text not null default 'due',
  reference text,
  method text,
  notes text,
  recorded_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manual_payments_subscription_fk foreign key (tenant_id, subscription_id) references public.subscriptions (tenant_id, id) on delete cascade,
  constraint manual_payments_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint manual_payments_enrollment_fk foreign key (tenant_id, enrollment_id, participant_id) references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint manual_payments_amount_check check (amount_cents >= 0),
  constraint manual_payments_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint manual_payments_status_check check (status in ('due', 'overdue', 'paid', 'waived', 'cancelled')),
  constraint manual_payments_paid_on_check check ((status = 'paid' and paid_on is not null) or status <> 'paid'),
  constraint manual_payments_tenant_id_id_unique unique (tenant_id, id)
);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  subscription_id uuid,
  manual_payment_id uuid,
  participant_id uuid,
  guardian_user_id uuid references auth.users (id) on delete set null,
  type text not null,
  status text not null default 'open',
  occurred_at timestamptz not null default now(),
  message text not null,
  created_at timestamptz not null default now(),
  constraint billing_events_subscription_fk foreign key (tenant_id, subscription_id) references public.subscriptions (tenant_id, id) on delete cascade,
  constraint billing_events_manual_payment_fk foreign key (tenant_id, manual_payment_id) references public.manual_payments (tenant_id, id) on delete cascade,
  constraint billing_events_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint billing_events_type_check check (type in ('payment_due', 'payment_overdue', 'payment_paid', 'subscription_created', 'subscription_changed')),
  constraint billing_events_status_check check (status in ('open', 'processed', 'ignored')),
  constraint billing_events_tenant_id_id_unique unique (tenant_id, id)
);

create index payment_plans_tenant_status_idx on public.payment_plans (tenant_id, status, sort_order);
create index subscriptions_participant_idx on public.subscriptions (tenant_id, participant_id, status);
create index subscriptions_guardian_idx on public.subscriptions (guardian_user_id, status, next_due_on);
create index subscriptions_plan_idx on public.subscriptions (tenant_id, payment_plan_id, status);
create index manual_payments_subscription_idx on public.manual_payments (tenant_id, subscription_id, due_on desc);
create index manual_payments_guardian_status_idx on public.manual_payments (guardian_user_id, status, due_on);
create index manual_payments_due_idx on public.manual_payments (tenant_id, status, due_on);
create index billing_events_tenant_type_idx on public.billing_events (tenant_id, type, occurred_at desc);
create index billing_events_guardian_idx on public.billing_events (guardian_user_id, occurred_at desc);

create trigger payment_plans_set_updated_at
  before update on public.payment_plans
  for each row execute function app_private.set_updated_at();

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function app_private.set_updated_at();

create trigger manual_payments_set_updated_at
  before update on public.manual_payments
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.payment_plans to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;
grant select, insert, update, delete on public.manual_payments to authenticated;
grant select, insert, update, delete on public.billing_events to authenticated;

grant all on public.payment_plans to service_role;
grant all on public.subscriptions to service_role;
grant all on public.manual_payments to service_role;
grant all on public.billing_events to service_role;

alter table public.payment_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.manual_payments enable row level security;
alter table public.billing_events enable row level security;

create policy "Tenant members can view payment plans"
  on public.payment_plans
  for select
  to authenticated
  using (
    app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );

create policy "Tenant staff can manage payment plans"
  on public.payment_plans
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view subscriptions"
  on public.subscriptions
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or guardian_user_id = (select auth.uid())
    or app_private.current_user_can_view_participant(participant_id)
  );

create policy "Tenant staff can manage subscriptions"
  on public.subscriptions
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view manual payments"
  on public.manual_payments
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or guardian_user_id = (select auth.uid())
    or app_private.current_user_can_view_participant(participant_id)
  );

create policy "Tenant staff can manage manual payments"
  on public.manual_payments
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view billing events"
  on public.billing_events
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

create policy "Tenant staff can manage billing events"
  on public.billing_events
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
