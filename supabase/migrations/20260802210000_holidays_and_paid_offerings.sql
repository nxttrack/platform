-- Paid vacation/turbo offerings share the authoritative group, enrollment,
-- capacity, payment and Mollie boundaries. Holiday publication records
-- non-destructive occurrence exceptions and financial review proposals.

create table public.group_offerings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  group_id uuid not null,
  curriculum_version_id uuid,
  payment_plan_id uuid,
  provider_config_id uuid,
  title text not null,
  description text,
  booking_opens_at timestamptz,
  booking_closes_at timestamptz,
  pricing_model text not null default 'free',
  price_cents integer not null default 0,
  currency text not null default 'EUR',
  vat_rate_basis_points integer not null default 2100,
  payment_mode text not null default 'free',
  seat_hold_minutes integer not null default 1440,
  terms_version text not null default 'offering_terms_v1',
  cancellation_policy text not null default 'manual_review',
  status text not null default 'draft',
  published_at timestamptz,
  published_by_user_id uuid references auth.users (id) on delete set null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_offerings_group_fk
    foreign key (tenant_id, group_id)
    references public.groups (tenant_id, id) on delete restrict,
  constraint group_offerings_curriculum_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete restrict,
  constraint group_offerings_payment_plan_fk
    foreign key (tenant_id, payment_plan_id)
    references public.payment_plans (tenant_id, id) on delete restrict,
  constraint group_offerings_provider_fk
    foreign key (tenant_id, provider_config_id)
    references public.billing_provider_configs (tenant_id, id) on delete restrict,
  constraint group_offerings_title_check check (length(trim(title)) between 3 and 160),
  constraint group_offerings_description_check
    check (description is null or length(description) <= 2000),
  constraint group_offerings_booking_period_check
    check (booking_opens_at is null or booking_closes_at is null or booking_opens_at < booking_closes_at),
  constraint group_offerings_pricing_check
    check (pricing_model in ('free', 'per_lesson', 'package')),
  constraint group_offerings_amount_check check (price_cents >= 0),
  constraint group_offerings_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint group_offerings_vat_check check (vat_rate_basis_points in (0, 900, 2100)),
  constraint group_offerings_payment_mode_check
    check (payment_mode in ('free', 'manual', 'direct_mollie', 'periodic_debit')),
  constraint group_offerings_payment_consistency_check check (
    (
      pricing_model = 'free'
      and price_cents = 0
      and payment_mode = 'free'
      and payment_plan_id is null
      and provider_config_id is null
    )
    or (
      pricing_model <> 'free'
      and price_cents > 0
      and payment_mode <> 'free'
      and payment_plan_id is not null
    )
  ),
  constraint group_offerings_provider_consistency_check check (
    (payment_mode in ('direct_mollie', 'periodic_debit') and provider_config_id is not null)
    or (payment_mode in ('free', 'manual') and provider_config_id is null)
  ),
  constraint group_offerings_hold_check check (seat_hold_minutes between 15 and 2880),
  constraint group_offerings_terms_check check (terms_version ~ '^[a-z0-9_]{3,80}$'),
  constraint group_offerings_cancellation_policy_check
    check (cancellation_policy in ('non_refundable', 'manual_review', 'refund_until_start')),
  constraint group_offerings_status_check
    check (status in ('draft', 'published', 'closed', 'archived')),
  constraint group_offerings_publication_check check (
    (status = 'published' and published_at is not null and published_by_user_id is not null)
    or status <> 'published'
  ),
  constraint group_offerings_group_unique unique (tenant_id, group_id),
  constraint group_offerings_tenant_id_id_unique unique (tenant_id, id)
);

create table public.offering_registrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  offering_id uuid not null,
  group_id uuid not null,
  enrollment_id uuid not null,
  participant_id uuid not null,
  guardian_user_id uuid references auth.users (id) on delete set null,
  capacity_bucket text not null default 'regular',
  status text not null default 'held',
  hold_expires_at timestamptz,
  reserved_amount_cents integer not null default 0,
  currency text not null default 'EUR',
  terms_version text not null,
  terms_accepted_at timestamptz,
  subscription_id uuid,
  manual_payment_id uuid,
  payment_session_id uuid,
  group_membership_id uuid,
  idempotency_key text not null,
  failure_reason text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offering_registrations_offering_fk
    foreign key (tenant_id, offering_id)
    references public.group_offerings (tenant_id, id) on delete restrict,
  constraint offering_registrations_group_fk
    foreign key (tenant_id, group_id)
    references public.groups (tenant_id, id) on delete restrict,
  constraint offering_registrations_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete restrict,
  constraint offering_registrations_subscription_fk
    foreign key (tenant_id, subscription_id)
    references public.subscriptions (tenant_id, id) on delete restrict,
  constraint offering_registrations_payment_fk
    foreign key (tenant_id, manual_payment_id)
    references public.manual_payments (tenant_id, id) on delete restrict,
  constraint offering_registrations_payment_session_fk
    foreign key (tenant_id, payment_session_id)
    references public.payment_sessions (tenant_id, id) on delete restrict,
  constraint offering_registrations_membership_fk
    foreign key (tenant_id, group_membership_id)
    references public.group_memberships (tenant_id, id) on delete restrict,
  constraint offering_registrations_bucket_check
    check (capacity_bucket in ('regular', 'flex', 'trial')),
  constraint offering_registrations_status_check
    check (status in (
      'held', 'pending_payment', 'confirming', 'confirmed',
      'payment_review', 'expired', 'cancelled', 'refunded'
    )),
  constraint offering_registrations_hold_check check (
    (
      status in ('held', 'pending_payment')
      and hold_expires_at is not null
    )
    or status not in ('held', 'pending_payment')
  ),
  constraint offering_registrations_amount_check check (reserved_amount_cents >= 0),
  constraint offering_registrations_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint offering_registrations_terms_check check (
    length(terms_version) between 3 and 80
    and terms_accepted_at is not null
  ),
  constraint offering_registrations_idempotency_check
    check (length(idempotency_key) between 8 and 200),
  constraint offering_registrations_tenant_id_id_unique unique (tenant_id, id),
  constraint offering_registrations_idempotency_unique unique (tenant_id, idempotency_key)
);

create unique index offering_registrations_one_live_participant_unique
  on public.offering_registrations (tenant_id, offering_id, participant_id)
  where status in (
    'held', 'pending_payment', 'confirming', 'confirmed', 'payment_review'
  );
create index offering_registrations_expiry_idx
  on public.offering_registrations (tenant_id, status, hold_expires_at)
  where status in ('held', 'pending_payment');
create index offering_registrations_payment_idx
  on public.offering_registrations (tenant_id, manual_payment_id, status)
  where manual_payment_id is not null;

create trigger group_offerings_set_updated_at
  before update on public.group_offerings
  for each row execute function app_private.set_updated_at();
create trigger offering_registrations_set_updated_at
  before update on public.offering_registrations
  for each row execute function app_private.set_updated_at();

create or replace function app_private.prevent_published_offering_content_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status in ('published', 'closed', 'archived') and (
    new.tenant_id is distinct from old.tenant_id
    or new.group_id is distinct from old.group_id
    or new.curriculum_version_id is distinct from old.curriculum_version_id
    or new.payment_plan_id is distinct from old.payment_plan_id
    or new.provider_config_id is distinct from old.provider_config_id
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.booking_opens_at is distinct from old.booking_opens_at
    or new.booking_closes_at is distinct from old.booking_closes_at
    or new.pricing_model is distinct from old.pricing_model
    or new.price_cents is distinct from old.price_cents
    or new.currency is distinct from old.currency
    or new.vat_rate_basis_points is distinct from old.vat_rate_basis_points
    or new.payment_mode is distinct from old.payment_mode
    or new.seat_hold_minutes is distinct from old.seat_hold_minutes
    or new.terms_version is distinct from old.terms_version
    or new.cancellation_policy is distinct from old.cancellation_policy
    or new.published_at is distinct from old.published_at
    or new.published_by_user_id is distinct from old.published_by_user_id
  ) then
    raise exception 'Published offering content is immutable; create a new group offering';
  end if;
  if old.status <> 'draft' and new.status = 'draft' then
    raise exception 'Published offering cannot return to draft';
  end if;
  return new;
end;
$$;

create trigger group_offerings_immutable
  before update on public.group_offerings
  for each row execute function app_private.prevent_published_offering_content_mutation();

create or replace function app_private.offering_price_cents(
  target_offering public.group_offerings
)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  occurrence_count integer;
begin
  if target_offering.pricing_model = 'free' then return 0; end if;
  if target_offering.pricing_model = 'package' then return target_offering.price_cents; end if;
  select count(*)::integer into occurrence_count
  from public.sessions session
  where session.tenant_id = target_offering.tenant_id
    and session.group_id = target_offering.group_id
    and session.status = 'scheduled';
  if occurrence_count < 1 then
    raise exception 'Per-lesson offering requires at least one published occurrence';
  end if;
  return target_offering.price_cents * occurrence_count;
end;
$$;

create or replace function app_private.evaluate_group_offering(
  target_tenant_id uuid,
  target_offering_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  offering public.group_offerings%rowtype;
  target_group public.groups%rowtype;
  plan public.payment_plans%rowtype;
  provider public.billing_provider_configs%rowtype;
  profile public.tenant_billing_profiles%rowtype;
  occurrence_count integer;
  blocking jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  total_price integer := 0;
begin
  select * into offering
  from public.group_offerings
  where tenant_id = target_tenant_id and id = target_offering_id;
  if not found then raise exception 'Offering not found in tenant'; end if;
  select * into target_group
  from public.groups
  where tenant_id = target_tenant_id and id = offering.group_id;
  select count(*)::integer into occurrence_count
  from public.sessions
  where tenant_id = target_tenant_id
    and group_id = offering.group_id
    and status = 'scheduled';

  if target_group.offering_type = 'regular' then
    blocking := blocking || jsonb_build_array(jsonb_build_object(
      'code', 'regular_group', 'message', 'Tijdelijk aanbod vereist een vakantie-, turbo- of seriegroep.'
    ));
  end if;
  if target_group.status <> 'active' then
    blocking := blocking || jsonb_build_array(jsonb_build_object(
      'code', 'group_inactive', 'message', 'De groep moet actief zijn.'
    ));
  end if;
  if occurrence_count < 1 then
    blocking := blocking || jsonb_build_array(jsonb_build_object(
      'code', 'no_occurrences', 'message', 'Publiceer eerst minstens één conflictvrij lesmoment.'
    ));
  end if;

  if offering.pricing_model <> 'free' then
    select * into plan from public.payment_plans
    where tenant_id = target_tenant_id and id = offering.payment_plan_id;
    if plan.id is null or plan.status <> 'active' then
      blocking := blocking || jsonb_build_array(jsonb_build_object(
        'code', 'payment_plan', 'message', 'Koppel een actief betaalplan.'
      ));
    elsif offering.payment_mode <> 'periodic_debit'
      and plan.billing_interval not in ('one_time', 'manual')
    then
      blocking := blocking || jsonb_build_array(jsonb_build_object(
        'code', 'payment_interval', 'message', 'Eenmalig aanbod vereist een eenmalig of handmatig betaalplan.'
      ));
    end if;
    select * into profile from public.tenant_billing_profiles
    where tenant_id = target_tenant_id;
    if profile.address_line_1 is null
      or profile.postal_code is null
      or profile.city is null
      or profile.billing_email is null
    then
      blocking := blocking || jsonb_build_array(jsonb_build_object(
        'code', 'billing_profile', 'message', 'Maak het factuurprofiel compleet.'
      ));
    end if;
  end if;

  if offering.payment_mode in ('direct_mollie', 'periodic_debit') then
    select * into provider from public.billing_provider_configs
    where tenant_id = target_tenant_id and id = offering.provider_config_id;
    if provider.id is null
      or provider.provider <> 'mollie'
      or provider.status <> 'active'
      or provider.secret_reference is null
    then
      blocking := blocking || jsonb_build_array(jsonb_build_object(
        'code', 'mollie_provider', 'message', 'Koppel een actieve Mollie-configuratie.'
      ));
    end if;
    if offering.payment_mode = 'periodic_debit'
      and coalesce((provider.public_config ->> 'recurring_enabled')::boolean, false) is not true
    then
      blocking := blocking || jsonb_build_array(jsonb_build_object(
        'code', 'mollie_recurring', 'message', 'Schakel de bestaande Mollie-incassoflow in.'
      ));
    end if;
  end if;

  begin
    total_price := app_private.offering_price_cents(offering);
  exception when others then
    blocking := blocking || jsonb_build_array(jsonb_build_object(
      'code', 'price', 'message', sqlerrm
    ));
  end;
  if offering.booking_opens_at is null or offering.booking_closes_at is null then
    warnings := warnings || jsonb_build_array(jsonb_build_object(
      'code', 'booking_window', 'message', 'Zonder boekingsvenster is het aanbod direct en onbeperkt in tijd zichtbaar.'
    ));
  end if;

  return jsonb_build_object(
    'contractVersion', 'group_offering_v3',
    'canPublish', jsonb_array_length(blocking) = 0,
    'blocking', blocking,
    'warnings', warnings,
    'occurrenceCount', occurrence_count,
    'totalPriceCents', total_price,
    'currency', offering.currency
  );
end;
$$;

create or replace function app_private.publish_group_offering(
  target_tenant_id uuid,
  target_offering_id uuid,
  actor_user_id uuid,
  target_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  offering public.group_offerings%rowtype;
  evaluation jsonb;
  request_hash text;
  existing_receipt public.domain_command_receipts%rowtype;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  if not app_private.user_has_swim_permission(actor_user_id, target_tenant_id, 'group.publish') then
    raise exception 'Insufficient group publication permission';
  end if;
  request_hash := encode(
    extensions.digest(target_offering_id::text, 'sha256'),
    'hex'
  );
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if found then
    if existing_receipt.command_type <> 'group.offering.publish'
      or existing_receipt.request_hash <> request_hash
    then raise exception 'Idempotency key payload mismatch'; end if;
    return existing_receipt.result_json;
  end if;

  select * into offering
  from public.group_offerings
  where tenant_id = target_tenant_id and id = target_offering_id
  for update;
  if not found or offering.status <> 'draft' then
    raise exception 'Offering is not publishable';
  end if;
  perform 1 from public.groups
  where tenant_id = target_tenant_id and id = offering.group_id
  for update;
  evaluation := app_private.evaluate_group_offering(target_tenant_id, target_offering_id);
  if (evaluation ->> 'canPublish')::boolean is not true then
    raise exception 'Offering publication validation failed';
  end if;

  update public.group_offerings
  set status = 'published',
      published_at = now(),
      published_by_user_id = actor_user_id
  where tenant_id = target_tenant_id and id = target_offering_id;
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    payload_json
  ) values (
    target_tenant_id, 'group.offering.published', 'group_offering',
    target_offering_id, actor_user_id, evaluation
  );
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type,
    subject_id, after_json
  ) values (
    target_tenant_id, actor_user_id, 'group.publish',
    'group.offering.published', 'group_offering', target_offering_id, evaluation
  );
  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id, target_idempotency_key, 'group.offering.publish',
    'group_offering', target_offering_id, actor_user_id, request_hash,
    evaluation || jsonb_build_object('offeringId', target_offering_id)
  );
  return evaluation || jsonb_build_object('offeringId', target_offering_id);
end;
$$;

create or replace function app_private.expire_offering_holds(
  target_tenant_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expired_count integer := 0;
begin
  with expired as (
    update public.offering_registrations registration
    set status = 'expired',
        failure_reason = 'seat_hold_expired'
    where registration.status in ('held', 'pending_payment')
      and registration.hold_expires_at <= now()
      and (target_tenant_id is null or registration.tenant_id = target_tenant_id)
    returning registration.tenant_id, registration.subscription_id,
      registration.manual_payment_id, registration.payment_session_id
  ), cancelled_sessions as (
    update public.payment_sessions session
    set status = 'expired',
        failure_code = coalesce(session.failure_code, 'seat_hold_expired'),
        failure_message = coalesce(session.failure_message, 'Offering seat hold expired.')
    from expired
    where expired.payment_session_id = session.id
      and expired.tenant_id = session.tenant_id
      and session.status in ('draft', 'pending')
  ), cancelled_payments as (
    update public.manual_payments payment
    set status = 'cancelled',
        notes = concat_ws(' · ', payment.notes, 'Aanbodreservering verlopen')
    from expired
    where expired.manual_payment_id = payment.id
      and expired.tenant_id = payment.tenant_id
      and payment.status in ('due', 'overdue')
  ), cancelled_subscriptions as (
    update public.subscriptions subscription
    set status = 'cancelled',
        lifecycle_status_reason = 'offering_seat_hold_expired',
        cancelled_at = now()
    from expired
    where expired.subscription_id = subscription.id
      and expired.tenant_id = subscription.tenant_id
      and subscription.status = 'paused'
  )
  select count(*)::integer into expired_count from expired;
  return expired_count;
end;
$$;

create or replace function app_private.reserve_group_offering_seat(
  target_tenant_id uuid,
  target_offering_id uuid,
  target_enrollment_id uuid,
  target_capacity_bucket text,
  target_terms_accepted boolean,
  actor_user_id uuid,
  target_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  offering public.group_offerings%rowtype;
  target_group public.groups%rowtype;
  enrollment public.enrollments%rowtype;
  plan public.payment_plans%rowtype;
  existing_receipt public.domain_command_receipts%rowtype;
  existing_registration public.offering_registrations%rowtype;
  request_hash text;
  target_registration_id uuid := gen_random_uuid();
  target_subscription_id uuid;
  target_payment_id uuid;
  target_session_id uuid;
  target_membership_id uuid;
  target_amount integer;
  hold_until timestamptz;
  regular_used numeric;
  flex_used numeric;
  trial_used numeric;
  total_used numeric;
  bucket_used numeric;
  bucket_limit numeric;
  actor_allowed boolean;
  result_json jsonb;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  if target_capacity_bucket not in ('regular', 'flex', 'trial') then
    raise exception 'Invalid capacity bucket';
  end if;
  if target_terms_accepted is not true then
    raise exception 'Offering terms must be accepted';
  end if;
  if length(target_idempotency_key) not between 8 and 200 then
    raise exception 'Invalid idempotency key';
  end if;
  request_hash := encode(
    extensions.digest(
      concat_ws(
        ':', target_offering_id::text, target_enrollment_id::text,
        target_capacity_bucket, target_terms_accepted::text
      ),
      'sha256'
    ),
    'hex'
  );
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if found then
    if existing_receipt.command_type <> 'group.offering.reserve'
      or existing_receipt.request_hash <> request_hash
    then raise exception 'Idempotency key payload mismatch'; end if;
    return existing_receipt.result_json;
  end if;

  perform app_private.expire_offering_holds(target_tenant_id);
  select * into offering from public.group_offerings
  where tenant_id = target_tenant_id and id = target_offering_id;
  if not found or offering.status <> 'published' then
    raise exception 'Offering is not open';
  end if;
  if offering.booking_opens_at is not null and now() < offering.booking_opens_at then
    raise exception 'Offering booking has not opened';
  end if;
  if offering.booking_closes_at is not null and now() >= offering.booking_closes_at then
    raise exception 'Offering booking has closed';
  end if;

  select * into target_group from public.groups
  where tenant_id = target_tenant_id and id = offering.group_id
  for update;
  select * into enrollment from public.enrollments
  where tenant_id = target_tenant_id
    and id = target_enrollment_id
    and program_id = target_group.program_id
    and status in ('active', 'paused')
  for share;
  if not found then raise exception 'Eligible enrollment not found'; end if;

  actor_allowed := app_private.user_has_swim_permission(
    actor_user_id, target_tenant_id, 'group.manage'
  ) or exists (
    select 1 from public.participants participant
    where participant.tenant_id = target_tenant_id
      and participant.id = enrollment.participant_id
      and (
        participant.guardian_user_id = actor_user_id
        or exists (
          select 1 from public.participant_guardians guardian
          where guardian.tenant_id = target_tenant_id
            and guardian.participant_id = participant.id
            and guardian.guardian_user_id = actor_user_id
            and guardian.status = 'active'
        )
      )
  );
  if not actor_allowed then raise exception 'Insufficient offering registration permission'; end if;

  select * into existing_registration
  from public.offering_registrations registration
  where registration.tenant_id = target_tenant_id
    and registration.offering_id = target_offering_id
    and registration.participant_id = enrollment.participant_id
    and registration.status in (
      'held', 'pending_payment', 'confirming', 'confirmed', 'payment_review'
    );
  if found then
    result_json := jsonb_build_object(
      'registrationId', existing_registration.id,
      'status', existing_registration.status,
      'paymentMode', offering.payment_mode,
      'paymentSessionId', existing_registration.payment_session_id,
      'manualPaymentId', existing_registration.manual_payment_id,
      'amountCents', existing_registration.reserved_amount_cents,
      'currency', existing_registration.currency,
      'holdExpiresAt', existing_registration.hold_expires_at
    );
    return result_json;
  end if;

  select
    coalesce(sum(source.weight) filter (where source.bucket = 'regular'), 0),
    coalesce(sum(source.weight) filter (where source.bucket = 'flex'), 0),
    coalesce(sum(source.weight) filter (where source.bucket = 'trial'), 0),
    coalesce(sum(source.weight), 0)
  into regular_used, flex_used, trial_used, total_used
  from (
    select membership.capacity_bucket as bucket, membership.capacity_weight as weight
    from public.group_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.group_id = target_group.id
      and membership.status in ('active', 'trial')
    union all
    select registration.capacity_bucket, 1::numeric
    from public.offering_registrations registration
    where registration.tenant_id = target_tenant_id
      and registration.group_id = target_group.id
      and registration.status in ('held', 'pending_payment', 'confirming', 'payment_review')
      and registration.hold_expires_at > now()
  ) source;
  if total_used + 1 > target_group.hard_capacity then
    raise exception 'Physical group capacity exceeded';
  end if;
  bucket_used := case target_capacity_bucket
    when 'regular' then regular_used
    when 'flex' then flex_used
    else trial_used
  end;
  bucket_limit := case target_capacity_bucket
    when 'regular' then target_group.regular_capacity
    when 'flex' then target_group.flex_capacity
    else target_group.trial_capacity
  end;
  if target_capacity_bucket = 'flex'
    and target_group.capacity_borrowing in ('flex_from_regular', 'bidirectional')
  then bucket_limit := bucket_limit + greatest(target_group.regular_capacity - regular_used, 0);
  elsif target_capacity_bucket = 'regular'
    and target_group.capacity_borrowing = 'bidirectional'
  then bucket_limit := bucket_limit + greatest(target_group.flex_capacity - flex_used, 0);
  end if;
  if bucket_used + 1 > bucket_limit then
    raise exception 'Requested capacity bucket is full';
  end if;

  target_amount := app_private.offering_price_cents(offering);
  hold_until := now() + make_interval(mins => offering.seat_hold_minutes);

  if offering.payment_mode = 'free' then
    insert into public.offering_registrations (
      id, tenant_id, offering_id, group_id, enrollment_id, participant_id,
      guardian_user_id, capacity_bucket, status, hold_expires_at,
      reserved_amount_cents, currency, terms_version, terms_accepted_at,
      idempotency_key, confirmed_at
    ) values (
      target_registration_id, target_tenant_id, offering.id, target_group.id,
      enrollment.id, enrollment.participant_id, enrollment.guardian_user_id,
      target_capacity_bucket, 'confirming', null, 0, offering.currency,
      offering.terms_version, now(), target_idempotency_key, now()
    );
    insert into public.group_memberships (
      tenant_id, group_id, enrollment_id, participant_id, status, starts_on,
      capacity_bucket
    ) values (
      target_tenant_id, target_group.id, enrollment.id, enrollment.participant_id,
      case when target_capacity_bucket = 'trial' then 'trial' else 'active' end,
      current_date, target_capacity_bucket
    ) returning id into target_membership_id;
    update public.offering_registrations
    set status = 'confirmed', group_membership_id = target_membership_id
    where tenant_id = target_tenant_id and id = target_registration_id;
  else
    select * into plan from public.payment_plans
    where tenant_id = target_tenant_id and id = offering.payment_plan_id;
    target_subscription_id := gen_random_uuid();
    target_payment_id := gen_random_uuid();
    insert into public.subscriptions (
      id, tenant_id, participant_id, enrollment_id, guardian_user_id,
      payment_plan_id, status, starts_on, ends_on, next_due_on, amount_cents,
      currency, billing_interval, collection_method, provider_config_id,
      lifecycle_status_reason, notes
    ) values (
      target_subscription_id, target_tenant_id, enrollment.participant_id,
      enrollment.id, enrollment.guardian_user_id, plan.id, 'paused',
      current_date, null, current_date, target_amount, offering.currency,
      plan.billing_interval,
      case when offering.payment_mode in ('direct_mollie', 'periodic_debit') then 'provider' else 'manual' end,
      offering.provider_config_id, 'offering_payment_pending',
      concat('Aanbod: ', offering.title)
    );
    insert into public.manual_payments (
      id, tenant_id, subscription_id, participant_id, enrollment_id,
      guardian_user_id, amount_cents, currency, due_on, status, reference,
      notes, recorded_by_user_id
    ) values (
      target_payment_id, target_tenant_id, target_subscription_id,
      enrollment.participant_id, enrollment.id, enrollment.guardian_user_id,
      target_amount, offering.currency,
      current_date + plan.payment_terms_days, 'due',
      concat('Aanbod ', offering.title),
      concat('Reservering ', target_registration_id), actor_user_id
    );
    if offering.payment_mode = 'direct_mollie' then
      if target_idempotency_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'Direct Mollie registration requires a UUID v4 idempotency key';
      end if;
      target_session_id := gen_random_uuid();
      insert into public.payment_sessions (
        id, tenant_id, provider_config_id, subscription_id, manual_payment_id,
        participant_id, guardian_user_id, provider, sequence_type,
        idempotency_key, amount_cents, currency, status, return_url,
        expires_at
      ) values (
        target_session_id, target_tenant_id, offering.provider_config_id,
        target_subscription_id, target_payment_id, enrollment.participant_id,
        enrollment.guardian_user_id, 'mollie', 'oneoff',
        target_idempotency_key, target_amount, offering.currency, 'draft',
        null, hold_until
      );
    end if;
    insert into public.offering_registrations (
      id, tenant_id, offering_id, group_id, enrollment_id, participant_id,
      guardian_user_id, capacity_bucket, status, hold_expires_at,
      reserved_amount_cents, currency, terms_version, terms_accepted_at,
      subscription_id, manual_payment_id, payment_session_id, idempotency_key
    ) values (
      target_registration_id, target_tenant_id, offering.id, target_group.id,
      enrollment.id, enrollment.participant_id, enrollment.guardian_user_id,
      target_capacity_bucket, 'pending_payment', hold_until, target_amount,
      offering.currency, offering.terms_version, now(),
      target_subscription_id, target_payment_id, target_session_id,
      target_idempotency_key
    );
  end if;

  result_json := jsonb_build_object(
    'registrationId', target_registration_id,
    'status', case when offering.payment_mode = 'free' then 'confirmed' else 'pending_payment' end,
    'paymentMode', offering.payment_mode,
    'paymentSessionId', target_session_id,
    'manualPaymentId', target_payment_id,
    'amountCents', target_amount,
    'currency', offering.currency,
    'holdExpiresAt', case when offering.payment_mode = 'free' then null else hold_until end
  );
  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id, target_idempotency_key, 'group.offering.reserve',
    'offering_registration', target_registration_id, actor_user_id,
    request_hash, result_json
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    payload_json
  ) values (
    target_tenant_id,
    case when offering.payment_mode = 'free'
      then 'group.offering.registration.confirmed'
      else 'group.offering.registration.held'
    end,
    'offering_registration', target_registration_id, actor_user_id,
    result_json
  );
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type,
    subject_id, after_json
  ) values (
    target_tenant_id, actor_user_id, 'group.read',
    'group.offering.registration.created', 'offering_registration',
    target_registration_id, result_json
  );
  return result_json;
end;
$$;

create or replace function app_private.confirm_offering_registration_from_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  registration public.offering_registrations%rowtype;
  target_membership_id uuid;
begin
  if new.status <> 'paid' or old.status = 'paid' then return new; end if;
  select * into registration
  from public.offering_registrations
  where tenant_id = new.tenant_id
    and manual_payment_id = new.id
    and status in ('held', 'pending_payment', 'payment_review')
  for update;
  if not found then return new; end if;

  perform 1 from public.groups
  where tenant_id = registration.tenant_id and id = registration.group_id
  for update;
  begin
    update public.offering_registrations
    set status = 'confirming', hold_expires_at = null
    where tenant_id = registration.tenant_id and id = registration.id;
    insert into public.group_memberships (
      tenant_id, group_id, enrollment_id, participant_id, status, starts_on,
      capacity_bucket
    ) values (
      registration.tenant_id, registration.group_id, registration.enrollment_id,
      registration.participant_id,
      case when registration.capacity_bucket = 'trial' then 'trial' else 'active' end,
      current_date, registration.capacity_bucket
    ) returning id into target_membership_id;
    update public.subscriptions
    set status = 'active',
        lifecycle_status_reason = 'offering_payment_confirmed',
        paused_at = null
    where tenant_id = registration.tenant_id and id = registration.subscription_id;
    update public.offering_registrations
    set status = 'confirmed',
        group_membership_id = target_membership_id,
        confirmed_at = now(),
        failure_reason = null
    where tenant_id = registration.tenant_id and id = registration.id;
    insert into public.domain_outbox_events (
      tenant_id, event_type, aggregate_type, aggregate_id, payload_json
    ) values (
      registration.tenant_id, 'group.offering.registration.confirmed',
      'offering_registration', registration.id,
      jsonb_build_object(
        'registrationId', registration.id,
        'manualPaymentId', new.id,
        'groupMembershipId', target_membership_id
      )
    );
  exception when others then
    update public.offering_registrations
    set status = 'payment_review',
        hold_expires_at = null,
        failure_reason = 'paid_but_capacity_requires_review'
    where tenant_id = registration.tenant_id and id = registration.id;
    insert into public.domain_outbox_events (
      tenant_id, event_type, aggregate_type, aggregate_id, payload_json
    ) values (
      registration.tenant_id, 'group.offering.registration.payment_review',
      'offering_registration', registration.id,
      jsonb_build_object(
        'registrationId', registration.id,
        'manualPaymentId', new.id,
        'reason', 'paid_but_capacity_requires_review'
      )
    );
  end;
  return new;
end;
$$;

create trigger manual_payments_confirm_offering_registration
  after update of status on public.manual_payments
  for each row execute function app_private.confirm_offering_registration_from_payment();

-- Capacity enforcement includes soft seat holds so direct administrator placement
-- cannot silently consume a seat that is already reserved for checkout.
create or replace function app_private.enforce_membership_capacity_bucket()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_group public.groups%rowtype;
  regular_used numeric := 0;
  flex_used numeric := 0;
  trial_used numeric := 0;
  total_used numeric := 0;
  bucket_limit numeric := 0;
begin
  if new.status not in ('active', 'trial') then return new; end if;
  if new.status = 'trial' and new.capacity_bucket <> 'trial' then
    raise exception 'Trial memberships must use the trial capacity bucket';
  end if;
  select * into target_group
  from public.groups lesson_group
  where lesson_group.tenant_id = new.tenant_id and lesson_group.id = new.group_id
  for update;
  if target_group.id is null then raise exception 'Group not found'; end if;

  select
    coalesce(sum(source.weight) filter (where source.bucket = 'regular'), 0),
    coalesce(sum(source.weight) filter (where source.bucket = 'flex'), 0),
    coalesce(sum(source.weight) filter (where source.bucket = 'trial'), 0),
    coalesce(sum(source.weight), 0)
  into regular_used, flex_used, trial_used, total_used
  from (
    select membership.capacity_bucket as bucket, membership.capacity_weight as weight
    from public.group_memberships membership
    where membership.tenant_id = new.tenant_id
      and membership.group_id = new.group_id
      and membership.status in ('active', 'trial')
      and (tg_op = 'INSERT' or membership.id <> new.id)
    union all
    select registration.capacity_bucket, 1::numeric
    from public.offering_registrations registration
    where registration.tenant_id = new.tenant_id
      and registration.group_id = new.group_id
      and registration.status in ('held', 'pending_payment', 'payment_review')
      and (
        registration.hold_expires_at is null
        or registration.hold_expires_at > now()
      )
  ) source;
  if total_used + new.capacity_weight > target_group.hard_capacity then
    raise exception 'Physical group capacity exceeded';
  end if;
  bucket_limit := case new.capacity_bucket
    when 'regular' then target_group.regular_capacity
    when 'flex' then target_group.flex_capacity
    else target_group.trial_capacity
  end;
  if new.capacity_bucket = 'flex'
    and target_group.capacity_borrowing in ('flex_from_regular', 'bidirectional')
  then bucket_limit := bucket_limit + greatest(target_group.regular_capacity - regular_used, 0);
  elsif new.capacity_bucket = 'regular'
    and target_group.capacity_borrowing = 'bidirectional'
  then bucket_limit := bucket_limit + greatest(target_group.flex_capacity - flex_used, 0);
  end if;
  if (
    case new.capacity_bucket
      when 'regular' then regular_used
      when 'flex' then flex_used
      else trial_used
    end
  ) + new.capacity_weight > bucket_limit then
    raise exception 'Requested capacity bucket is full';
  end if;
  return new;
end;
$$;

-- Non-destructive holiday exceptions and explicit financial proposals.
alter table public.season_blackout_periods
  add column financial_handling text not null default 'no_change',
  add column credit_per_lesson_cents integer,
  add column impact_snapshot_json jsonb not null default '{}'::jsonb,
  add constraint season_blackout_periods_financial_handling_check
    check (financial_handling in (
      'no_change', 'manual_review', 'credit_per_lesson', 'refund_review'
    )),
  add constraint season_blackout_periods_credit_check check (
    (
      financial_handling = 'credit_per_lesson'
      and credit_per_lesson_cents is not null
      and credit_per_lesson_cents > 0
    )
    or (
      financial_handling <> 'credit_per_lesson'
      and credit_per_lesson_cents is null
    )
  ),
  add constraint season_blackout_periods_impact_snapshot_check
    check (jsonb_typeof(impact_snapshot_json) = 'object');

create table public.schedule_occurrence_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  blackout_id uuid not null,
  session_id uuid not null,
  exception_type text not null,
  before_status text not null,
  effective_status text not null,
  status text not null default 'applied',
  reason text,
  applied_by_user_id uuid references auth.users (id) on delete set null,
  applied_at timestamptz not null default now(),
  reversed_by_user_id uuid references auth.users (id) on delete set null,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint schedule_occurrence_exceptions_blackout_fk
    foreign key (tenant_id, blackout_id)
    references public.season_blackout_periods (tenant_id, id) on delete restrict,
  constraint schedule_occurrence_exceptions_session_fk
    foreign key (tenant_id, session_id)
    references public.sessions (tenant_id, id) on delete restrict,
  constraint schedule_occurrence_exceptions_type_check
    check (exception_type in ('holiday_closure', 'site_closure')),
  constraint schedule_occurrence_exceptions_status_check
    check (status in ('applied', 'reversed')),
  constraint schedule_occurrence_exceptions_unique
    unique (tenant_id, blackout_id, session_id),
  constraint schedule_occurrence_exceptions_tenant_id_id_unique
    unique (tenant_id, id)
);

create table public.season_financial_adjustment_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  blackout_id uuid not null,
  session_id uuid not null,
  participant_id uuid not null,
  subscription_id uuid,
  policy text not null,
  estimated_gross_cents integer,
  currency text not null default 'EUR',
  status text not null default 'proposed',
  data_quality text not null default 'complete',
  resolution_invoice_id uuid,
  resolution_credit_note_id uuid,
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint season_financial_proposals_blackout_fk
    foreign key (tenant_id, blackout_id)
    references public.season_blackout_periods (tenant_id, id) on delete restrict,
  constraint season_financial_proposals_session_fk
    foreign key (tenant_id, session_id)
    references public.sessions (tenant_id, id) on delete restrict,
  constraint season_financial_proposals_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete restrict,
  constraint season_financial_proposals_subscription_fk
    foreign key (tenant_id, subscription_id)
    references public.subscriptions (tenant_id, id) on delete restrict,
  constraint season_financial_proposals_invoice_fk
    foreign key (tenant_id, resolution_invoice_id)
    references public.billing_invoices (tenant_id, id) on delete restrict,
  constraint season_financial_proposals_credit_fk
    foreign key (tenant_id, resolution_credit_note_id)
    references public.billing_invoices (tenant_id, id) on delete restrict,
  constraint season_financial_proposals_policy_check
    check (policy in ('manual_review', 'credit_per_lesson', 'refund_review')),
  constraint season_financial_proposals_amount_check
    check (estimated_gross_cents is null or estimated_gross_cents > 0),
  constraint season_financial_proposals_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint season_financial_proposals_status_check
    check (status in ('proposed', 'approved', 'resolved', 'dismissed')),
  constraint season_financial_proposals_quality_check
    check (data_quality in ('complete', 'subscription_missing', 'amount_unknown')),
  constraint season_financial_proposals_unique
    unique (tenant_id, blackout_id, session_id, participant_id),
  constraint season_financial_proposals_tenant_id_id_unique unique (tenant_id, id)
);

create index schedule_occurrence_exceptions_blackout_idx
  on public.schedule_occurrence_exceptions (tenant_id, blackout_id, status);
create index season_financial_adjustment_proposals_review_idx
  on public.season_financial_adjustment_proposals (tenant_id, status, blackout_id);
create trigger season_financial_adjustment_proposals_set_updated_at
  before update on public.season_financial_adjustment_proposals
  for each row execute function app_private.set_updated_at();

create or replace function app_private.preview_season_blackout(
  target_tenant_id uuid,
  target_blackout_id uuid,
  actor_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  blackout public.season_blackout_periods%rowtype;
  session_count integer;
  participant_count integer;
  subscription_count integer;
  estimated_cents bigint;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  if not app_private.user_has_swim_permission(actor_user_id, target_tenant_id, 'holiday.manage') then
    raise exception 'Insufficient holiday management permission';
  end if;
  select * into blackout from public.season_blackout_periods
  where tenant_id = target_tenant_id and id = target_blackout_id;
  if not found then raise exception 'Blackout not found in tenant'; end if;

  with affected_sessions as (
    select session.id, session.group_id
    from public.sessions session
    join public.groups lesson_group
      on lesson_group.tenant_id = session.tenant_id
      and lesson_group.id = session.group_id
    where session.tenant_id = target_tenant_id
      and session.status = 'scheduled'
      and session.starts_at < blackout.ends_at
      and session.ends_at > blackout.starts_at
      and (
        blackout.resource_id is null
        or coalesce(session.resource_id, lesson_group.default_resource_id) = blackout.resource_id
      )
  ), affected_participants as (
    select distinct affected_sessions.id as session_id, membership.participant_id,
      subscription.id as subscription_id
    from affected_sessions
    join public.group_memberships membership
      on membership.tenant_id = target_tenant_id
      and membership.group_id = affected_sessions.group_id
      and membership.status in ('active', 'trial')
    left join public.subscriptions subscription
      on subscription.tenant_id = membership.tenant_id
      and subscription.enrollment_id = membership.enrollment_id
      and subscription.status in ('active', 'paused')
  )
  select
    (select count(*) from affected_sessions)::integer,
    count(distinct affected_participants.participant_id)::integer,
    count(distinct affected_participants.subscription_id)::integer,
    case
      when blackout.financial_handling = 'credit_per_lesson'
      then count(*) * blackout.credit_per_lesson_cents
      else null
    end
  into session_count, participant_count, subscription_count, estimated_cents
  from affected_participants;

  return jsonb_build_object(
    'contractVersion', 'holiday_impact_v3',
    'blackoutId', blackout.id,
    'sessionCount', coalesce(session_count, 0),
    'participantCount', coalesce(participant_count, 0),
    'subscriptionCount', coalesce(subscription_count, 0),
    'financialHandling', blackout.financial_handling,
    'estimatedGrossImpactCents', estimated_cents,
    'currency', 'EUR',
    'finalInvoicesWillBeChanged', false,
    'historyWillBeDeleted', false
  );
end;
$$;

create or replace function app_private.publish_season_blackout_v3(
  target_tenant_id uuid,
  target_blackout_id uuid,
  actor_user_id uuid,
  target_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  blackout public.season_blackout_periods%rowtype;
  impact jsonb;
  request_hash text;
  existing_receipt public.domain_command_receipts%rowtype;
  changed_count integer := 0;
  proposal_count integer := 0;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  if not app_private.user_has_swim_permission(actor_user_id, target_tenant_id, 'holiday.manage') then
    raise exception 'Insufficient holiday management permission';
  end if;
  request_hash := encode(
    extensions.digest(target_blackout_id::text, 'sha256'),
    'hex'
  );
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if found then
    if existing_receipt.command_type <> 'holiday.blackout.publish'
      or existing_receipt.request_hash <> request_hash
    then raise exception 'Idempotency key payload mismatch'; end if;
    return existing_receipt.result_json;
  end if;

  select * into blackout from public.season_blackout_periods
  where tenant_id = target_tenant_id and id = target_blackout_id
  for update;
  if not found or blackout.status <> 'draft' then
    raise exception 'Blackout is not publishable';
  end if;
  impact := app_private.preview_season_blackout(
    target_tenant_id, target_blackout_id, actor_user_id
  );

  if blackout.session_handling = 'cancel' then
    insert into public.schedule_occurrence_exceptions (
      tenant_id, blackout_id, session_id, exception_type, before_status,
      effective_status, reason, applied_by_user_id
    )
    select target_tenant_id, blackout.id, session.id,
      case when blackout.resource_id is null then 'holiday_closure' else 'site_closure' end,
      session.status, 'cancelled', blackout.reason, actor_user_id
    from public.sessions session
    join public.groups lesson_group
      on lesson_group.tenant_id = session.tenant_id
      and lesson_group.id = session.group_id
    where session.tenant_id = target_tenant_id
      and session.status = 'scheduled'
      and session.starts_at < blackout.ends_at
      and session.ends_at > blackout.starts_at
      and (
        blackout.resource_id is null
        or coalesce(session.resource_id, lesson_group.default_resource_id) = blackout.resource_id
      )
    on conflict (tenant_id, blackout_id, session_id) do nothing;

    insert into public.season_schedule_change_events (
      tenant_id, blackout_id, session_id, actor_user_id, before_status, after_status
    )
    select exception.tenant_id, exception.blackout_id, exception.session_id,
      actor_user_id, exception.before_status, exception.effective_status
    from public.schedule_occurrence_exceptions exception
    where exception.tenant_id = target_tenant_id
      and exception.blackout_id = blackout.id
    on conflict (tenant_id, blackout_id, session_id) do nothing;

    update public.sessions session
    set status = exception.effective_status
    from public.schedule_occurrence_exceptions exception
    where exception.tenant_id = target_tenant_id
      and exception.blackout_id = blackout.id
      and exception.session_id = session.id
      and exception.status = 'applied'
      and session.status = exception.before_status;
    get diagnostics changed_count = row_count;

    if blackout.financial_handling <> 'no_change' then
      insert into public.season_financial_adjustment_proposals (
        tenant_id, blackout_id, session_id, participant_id, subscription_id,
        policy, estimated_gross_cents, currency, data_quality
      )
      select target_tenant_id, blackout.id, exception.session_id,
        membership.participant_id, subscription.id,
        blackout.financial_handling,
        case when blackout.financial_handling = 'credit_per_lesson'
          then blackout.credit_per_lesson_cents else null end,
        coalesce(subscription.currency, 'EUR'),
        case
          when subscription.id is null then 'subscription_missing'
          when blackout.financial_handling <> 'credit_per_lesson' then 'amount_unknown'
          else 'complete'
        end
      from public.schedule_occurrence_exceptions exception
      join public.sessions session
        on session.tenant_id = exception.tenant_id and session.id = exception.session_id
      join public.group_memberships membership
        on membership.tenant_id = session.tenant_id
        and membership.group_id = session.group_id
        and membership.status in ('active', 'trial')
      left join lateral (
        select candidate.id, candidate.currency
        from public.subscriptions candidate
        where candidate.tenant_id = membership.tenant_id
          and candidate.enrollment_id = membership.enrollment_id
          and candidate.status in ('active', 'paused')
        order by candidate.created_at desc
        limit 1
      ) subscription on true
      where exception.tenant_id = target_tenant_id
        and exception.blackout_id = blackout.id
      on conflict (tenant_id, blackout_id, session_id, participant_id) do nothing;
      get diagnostics proposal_count = row_count;
    end if;
  end if;

  update public.season_blackout_periods
  set status = 'published',
      published_by_user_id = actor_user_id,
      published_at = now(),
      impact_snapshot_json = impact
  where tenant_id = target_tenant_id and id = blackout.id;

  impact := impact || jsonb_build_object(
    'changedSessionCount', changed_count,
    'financialProposalCount', proposal_count
  );
  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id, target_idempotency_key, 'holiday.blackout.publish',
    'season_blackout', blackout.id, actor_user_id, request_hash, impact
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    payload_json
  ) values (
    target_tenant_id, 'holiday.blackout.published', 'season_blackout',
    blackout.id, actor_user_id, impact
  );
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type,
    subject_id, reason, after_json
  ) values (
    target_tenant_id, actor_user_id, 'holiday.manage',
    'holiday.blackout.published', 'season_blackout', blackout.id,
    blackout.reason, impact
  );
  return impact;
end;
$$;

create or replace function app_private.undo_season_blackout_v3(
  target_tenant_id uuid,
  target_blackout_id uuid,
  actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_count integer := 0;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  if not app_private.user_has_swim_permission(actor_user_id, target_tenant_id, 'holiday.manage') then
    raise exception 'Insufficient holiday management permission';
  end if;
  perform 1 from public.season_blackout_periods
  where tenant_id = target_tenant_id and id = target_blackout_id
  for update;
  if not found then raise exception 'Blackout not found in tenant'; end if;

  update public.sessions session
  set status = exception.before_status
  from public.schedule_occurrence_exceptions exception
  where exception.tenant_id = target_tenant_id
    and exception.blackout_id = target_blackout_id
    and exception.session_id = session.id
    and exception.status = 'applied'
    and session.status = exception.effective_status;
  get diagnostics changed_count = row_count;
  update public.schedule_occurrence_exceptions
  set status = 'reversed', reversed_at = now(), reversed_by_user_id = actor_user_id
  where tenant_id = target_tenant_id
    and blackout_id = target_blackout_id
    and status = 'applied';
  update public.season_schedule_change_events
  set status = 'undone', undone_at = now(), undone_by_user_id = actor_user_id
  where tenant_id = target_tenant_id
    and blackout_id = target_blackout_id
    and status = 'applied';
  update public.season_financial_adjustment_proposals
  set status = 'dismissed', reviewed_at = now(), reviewed_by_user_id = actor_user_id
  where tenant_id = target_tenant_id
    and blackout_id = target_blackout_id
    and status = 'proposed';
  update public.season_blackout_periods
  set status = 'closed'
  where tenant_id = target_tenant_id
    and id = target_blackout_id
    and status = 'published';
  return changed_count;
end;
$$;

create or replace function public.evaluate_group_offering(
  target_tenant_id uuid,
  target_offering_id uuid
)
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$ select app_private.evaluate_group_offering(target_tenant_id, target_offering_id); $$;
create or replace function public.resolve_tenant_local_datetime(
  target_tenant_id uuid,
  target_local_timestamp timestamp
)
returns timestamptz
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select target_local_timestamp at time zone coalesce(
    (
      select settings.timezone
      from public.tenant_settings settings
      where settings.tenant_id = target_tenant_id
    ),
    'Europe/Amsterdam'
  );
$$;
create or replace function public.publish_group_offering(
  target_tenant_id uuid,
  target_offering_id uuid,
  actor_user_id uuid,
  target_idempotency_key text
)
returns jsonb language sql security invoker set search_path = public, pg_temp
as $$
  select app_private.publish_group_offering(
    target_tenant_id, target_offering_id, actor_user_id, target_idempotency_key
  );
$$;
create or replace function public.expire_offering_holds(
  target_tenant_id uuid default null
)
returns integer language sql security invoker set search_path = public, pg_temp
as $$
  select app_private.expire_offering_holds(target_tenant_id);
$$;
create or replace function public.reserve_group_offering_seat(
  target_tenant_id uuid,
  target_offering_id uuid,
  target_enrollment_id uuid,
  target_capacity_bucket text,
  target_terms_accepted boolean,
  actor_user_id uuid,
  target_idempotency_key text
)
returns jsonb language sql security invoker set search_path = public, pg_temp
as $$
  select app_private.reserve_group_offering_seat(
    target_tenant_id, target_offering_id, target_enrollment_id,
    target_capacity_bucket, target_terms_accepted, actor_user_id,
    target_idempotency_key
  );
$$;
create or replace function public.preview_season_blackout(
  target_tenant_id uuid,
  target_blackout_id uuid,
  actor_user_id uuid
)
returns jsonb language sql stable security invoker set search_path = public, pg_temp
as $$
  select app_private.preview_season_blackout(
    target_tenant_id, target_blackout_id, actor_user_id
  );
$$;
create or replace function public.publish_season_blackout_v3(
  target_tenant_id uuid,
  target_blackout_id uuid,
  actor_user_id uuid,
  target_idempotency_key text
)
returns jsonb language sql security invoker set search_path = public, pg_temp
as $$
  select app_private.publish_season_blackout_v3(
    target_tenant_id, target_blackout_id, actor_user_id, target_idempotency_key
  );
$$;
create or replace function public.undo_season_blackout_v3(
  target_tenant_id uuid,
  target_blackout_id uuid,
  actor_user_id uuid
)
returns integer language sql security invoker set search_path = public, pg_temp
as $$
  select app_private.undo_season_blackout_v3(
    target_tenant_id, target_blackout_id, actor_user_id
  );
$$;

grant select on public.group_offerings to authenticated;
grant select on public.offering_registrations to authenticated;
grant select on public.schedule_occurrence_exceptions to authenticated;
grant select on public.season_financial_adjustment_proposals to authenticated;
grant all on public.group_offerings to service_role;
grant all on public.offering_registrations to service_role;
grant all on public.schedule_occurrence_exceptions to service_role;
grant all on public.season_financial_adjustment_proposals to service_role;

alter table public.group_offerings enable row level security;
alter table public.group_offerings force row level security;
alter table public.offering_registrations enable row level security;
alter table public.offering_registrations force row level security;
alter table public.schedule_occurrence_exceptions enable row level security;
alter table public.schedule_occurrence_exceptions force row level security;
alter table public.season_financial_adjustment_proposals enable row level security;
alter table public.season_financial_adjustment_proposals force row level security;

create policy group_offerings_read
  on public.group_offerings for select to authenticated
  using (
    app_private.current_user_has_swim_permission(tenant_id, 'group.read')
    and (status = 'published' or app_private.current_user_has_swim_permission(tenant_id, 'group.manage'))
  );
create policy offering_registrations_read
  on public.offering_registrations for select to authenticated
  using (
    app_private.current_user_has_swim_permission(tenant_id, 'group.manage')
    or guardian_user_id = (select auth.uid())
    or app_private.current_user_can_view_participant(participant_id)
  );
create policy schedule_occurrence_exceptions_read
  on public.schedule_occurrence_exceptions for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'holiday.manage'));
create policy season_financial_adjustment_proposals_read
  on public.season_financial_adjustment_proposals for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'billing.read'));

revoke all on function app_private.prevent_published_offering_content_mutation() from public, anon, authenticated;
revoke all on function app_private.offering_price_cents(public.group_offerings) from public, anon, authenticated;
revoke all on function app_private.evaluate_group_offering(uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.publish_group_offering(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.expire_offering_holds(uuid) from public, anon, authenticated;
revoke all on function app_private.reserve_group_offering_seat(uuid, uuid, uuid, text, boolean, uuid, text) from public, anon, authenticated;
revoke all on function app_private.confirm_offering_registration_from_payment() from public, anon, authenticated;
revoke all on function app_private.preview_season_blackout(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function app_private.publish_season_blackout_v3(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.undo_season_blackout_v3(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function app_private.evaluate_group_offering(uuid, uuid) to service_role;
grant execute on function app_private.publish_group_offering(uuid, uuid, uuid, text) to service_role;
grant execute on function app_private.expire_offering_holds(uuid) to service_role;
grant execute on function app_private.reserve_group_offering_seat(uuid, uuid, uuid, text, boolean, uuid, text) to service_role;
grant execute on function app_private.preview_season_blackout(uuid, uuid, uuid) to service_role;
grant execute on function app_private.publish_season_blackout_v3(uuid, uuid, uuid, text) to service_role;
grant execute on function app_private.undo_season_blackout_v3(uuid, uuid, uuid) to service_role;

revoke all on function public.evaluate_group_offering(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resolve_tenant_local_datetime(uuid, timestamp) from public, anon, authenticated;
revoke all on function public.publish_group_offering(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.expire_offering_holds(uuid) from public, anon, authenticated;
revoke all on function public.reserve_group_offering_seat(uuid, uuid, uuid, text, boolean, uuid, text) from public, anon, authenticated;
revoke all on function public.preview_season_blackout(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.publish_season_blackout_v3(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.undo_season_blackout_v3(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.evaluate_group_offering(uuid, uuid) to service_role;
grant execute on function public.resolve_tenant_local_datetime(uuid, timestamp) to service_role;
grant execute on function public.publish_group_offering(uuid, uuid, uuid, text) to service_role;
grant execute on function public.expire_offering_holds(uuid) to service_role;
grant execute on function public.reserve_group_offering_seat(uuid, uuid, uuid, text, boolean, uuid, text) to service_role;
grant execute on function public.preview_season_blackout(uuid, uuid, uuid) to service_role;
grant execute on function public.publish_season_blackout_v3(uuid, uuid, uuid, text) to service_role;
grant execute on function public.undo_season_blackout_v3(uuid, uuid, uuid) to service_role;

comment on table public.offering_registrations is
  'Concurrency-safe seat holds and confirmed enrollment links for free, manual, Mollie and periodic temporary offerings.';
comment on table public.schedule_occurrence_exceptions is
  'Non-destructive holiday/closure exceptions; source sessions and financial history are retained.';
comment on table public.season_financial_adjustment_proposals is
  'Reviewable financial impact only. Definitive invoices are never rewritten; approved correction uses a credit note/refund flow.';
