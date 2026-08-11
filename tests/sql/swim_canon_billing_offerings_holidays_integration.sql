begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '16000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'billing-admin@example.test',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '16000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'billing-parent@example.test',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

update public.profiles
set full_name = case
    when id = '16000000-0000-4000-8000-000000000001' then 'Billing Admin'
    else 'Testouder'
  end,
  email = case
    when id = '16000000-0000-4000-8000-000000000001' then 'billing-admin@example.test'
    else 'billing-parent@example.test'
  end
where id in (
  '16000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000002'
);

insert into public.tenants (id, slug, name)
values ('26000000-0000-4000-8000-000000000001', 'billing-v3-test', 'Billing v3 Test');

insert into public.tenant_memberships (tenant_id, user_id, role, status) values
  ('26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000001', 'tenant_admin', 'active'),
  ('26000000-0000-4000-8000-000000000001', '16000000-0000-4000-8000-000000000002', 'parent', 'active');

update public.tenant_billing_profiles
set legal_name = 'Billing v3 Test B.V.',
    address_line_1 = 'Waterlaan 21',
    postal_code = '1234 AB',
    city = 'Amsterdam',
    billing_email = 'facturen@example.test',
    chamber_of_commerce_number = '12345678',
    vat_number = 'NL001234567B01',
    default_vat_rate_basis_points = 2100
where tenant_id = '26000000-0000-4000-8000-000000000001';

insert into public.programs (id, tenant_id, name, code, status)
values (
  '36000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  'Zwem-ABC',
  'billing-abc',
  'active'
);

insert into public.program_stages (id, tenant_id, program_id, name, code, status)
values (
  '46000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  '36000000-0000-4000-8000-000000000001',
  'Badje één',
  'billing-badje-een',
  'active'
);

insert into public.participants (
  id, tenant_id, guardian_user_id, display_name, status
) values (
  '56000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000002',
  'Testzwemmer',
  'active'
);

insert into public.enrollments (
  id, tenant_id, participant_id, guardian_user_id, program_id, current_stage_id,
  status, starts_on
) values (
  '66000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000002',
  '36000000-0000-4000-8000-000000000001',
  '46000000-0000-4000-8000-000000000001',
  'active',
  current_date
);

insert into public.payment_plans (
  id, tenant_id, program_id, code, name, amount_cents, currency,
  billing_interval, payment_terms_days, status
) values
  (
    '76000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    '36000000-0000-4000-8000-000000000001',
    'monthly-test', 'Maandbetaling', 10000, 'EUR', 'monthly', 14, 'active'
  ),
  (
    '76000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001',
    '36000000-0000-4000-8000-000000000001',
    'turbo-test', 'Turbopakket', 12100, 'EUR', 'one_time', 7, 'active'
  );

insert into public.subscriptions (
  id, tenant_id, participant_id, enrollment_id, guardian_user_id,
  payment_plan_id, status, starts_on, next_due_on, amount_cents, currency,
  billing_interval
) values (
  '86000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000001',
  '66000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000001',
  'active', current_date, current_date, 10000, 'EUR', 'monthly'
);

insert into public.manual_payments (
  id, tenant_id, subscription_id, participant_id, enrollment_id,
  guardian_user_id, amount_cents, currency, due_on, status, reference
) values (
  '96000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  '86000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000001',
  '66000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000002',
  10000, 'EUR', current_date + 14, 'due', 'Augustus zwemles'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '16000000-0000-4000-8000-000000000001',
    'role', 'service_role'
  )::text,
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

create temporary table billing_v3_results (
  result_key text primary key,
  result_id uuid
);

insert into billing_v3_results values (
  'invoice',
  public.issue_invoice_for_payment(
    '26000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    'Zwemles augustus',
    null,
    '16000000-0000-4000-8000-000000000001',
    'billing-invoice-idempotency-v3'
  )
);

do $$
declare
  invoice_id uuid := (select result_id from billing_v3_results where result_key = 'invoice');
  retry_id uuid;
begin
  select public.issue_invoice_for_payment(
    '26000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    'Zwemles augustus',
    null,
    '16000000-0000-4000-8000-000000000001',
    'billing-invoice-idempotency-v3'
  ) into retry_id;
  if retry_id <> invoice_id then
    raise exception 'Invoice issue command is not idempotent';
  end if;
  if (
    select (subtotal_cents, tax_cents, total_cents)
    from public.billing_invoices
    where id = invoice_id
  ) <> row(8264, 1736, 10000) then
    raise exception 'Inclusive 21 percent VAT split is incorrect';
  end if;
  if (
    select invoice_number from public.billing_invoices where id = invoice_id
  ) !~ '^INV-[0-9]{4}-000001$' then
    raise exception 'Sequential invoice number is invalid';
  end if;
  begin
    update public.billing_invoices set total_cents = 9999 where id = invoice_id;
    raise exception 'Final invoice content unexpectedly mutated';
  exception when others then
    if sqlerrm = 'Final invoice content unexpectedly mutated' then raise; end if;
  end;
end;
$$;

insert into billing_v3_results values (
  'credit',
  public.issue_credit_note(
    '26000000-0000-4000-8000-000000000001',
    (select result_id from billing_v3_results where result_key = 'invoice'),
    1210,
    'Correctie één les',
    'credit_only',
    '16000000-0000-4000-8000-000000000001',
    'billing-credit-idempotency-v3'
  )
);

do $$
declare
  credit_id uuid := (select result_id from billing_v3_results where result_key = 'credit');
begin
  if (
    select (document_type, subtotal_cents, tax_cents, total_cents)
    from public.billing_invoices where id = credit_id
  ) <> row('credit_note'::text, 1000, 210, 1210) then
    raise exception 'Credit note VAT split is incorrect';
  end if;
  if (select invoice_number from public.billing_invoices where id = credit_id)
    !~ '^CN-[0-9]{4}-000001$'
  then
    raise exception 'Sequential credit-note number is invalid';
  end if;
  if (select total_cents from public.billing_invoices where id = (
    select result_id from billing_v3_results where result_key = 'invoice'
  )) <> 10000 then
    raise exception 'Credit note rewrote original invoice';
  end if;
end;
$$;

insert into public.resources (
  id, tenant_id, kind, name, code, capacity, safety_capacity, status
) values (
  '27000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  'pool', 'Turbobad', 'turbo-pool', 8, 8, 'active'
);

insert into public.groups (
  id, tenant_id, program_id, stage_id, default_resource_id, name, code,
  status, capacity, offering_type, regular_capacity, flex_capacity,
  trial_capacity, hard_capacity, capacity_borrowing
) values
  (
    '37000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    '36000000-0000-4000-8000-000000000001',
    '46000000-0000-4000-8000-000000000001',
    '27000000-0000-4000-8000-000000000001',
    'Gratis vakantiecursus', 'free-holiday', 'active', 2,
    'vacation_course', 2, 0, 0, 2, 'none'
  ),
  (
    '37000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001',
    '36000000-0000-4000-8000-000000000001',
    '46000000-0000-4000-8000-000000000001',
    '27000000-0000-4000-8000-000000000001',
    'Betaalde turbocursus', 'paid-turbo', 'active', 2,
    'turbo_course', 2, 0, 0, 2, 'none'
  );

insert into public.sessions (
  id, tenant_id, group_id, resource_id, starts_at, ends_at, status
) values
  (
    '47000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000001',
    '37000000-0000-4000-8000-000000000001',
    '27000000-0000-4000-8000-000000000001',
    '2026-12-21T09:00:00Z', '2026-12-21T10:00:00Z', 'scheduled'
  ),
  (
    '47000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000001',
    '37000000-0000-4000-8000-000000000002',
    '27000000-0000-4000-8000-000000000001',
    '2026-12-22T09:00:00Z', '2026-12-22T10:00:00Z', 'scheduled'
  );

insert into public.group_offerings (
  id, tenant_id, group_id, title, pricing_model, price_cents, currency,
  vat_rate_basis_points, payment_mode, seat_hold_minutes, terms_version,
  cancellation_policy, status, created_by_user_id
) values (
  '57000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  '37000000-0000-4000-8000-000000000001',
  'Gratis kerstcursus', 'free', 0, 'EUR', 2100, 'free', 60,
  'offering_terms_v1', 'manual_review', 'draft',
  '16000000-0000-4000-8000-000000000001'
);

select public.publish_group_offering(
  '26000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000001',
  'offering-free-publish-v3'
);

do $$
declare
  result jsonb;
begin
  result := public.reserve_group_offering_seat(
    '26000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000001',
    '66000000-0000-4000-8000-000000000001',
    'regular', true,
    '16000000-0000-4000-8000-000000000002',
    'offering-free-reserve-v3'
  );
  if result ->> 'status' <> 'confirmed' then
    raise exception 'Free offering was not immediately confirmed';
  end if;
  if (
    select count(*) from public.group_memberships
    where group_id = '37000000-0000-4000-8000-000000000001'
      and participant_id = '56000000-0000-4000-8000-000000000001'
      and status = 'active'
  ) <> 1 then
    raise exception 'Free offering did not create one membership';
  end if;
end;
$$;

insert into public.group_offerings (
  id, tenant_id, group_id, payment_plan_id, title, pricing_model,
  price_cents, currency, vat_rate_basis_points, payment_mode,
  seat_hold_minutes, terms_version, cancellation_policy, status,
  created_by_user_id
) values (
  '57000000-0000-4000-8000-000000000002',
  '26000000-0000-4000-8000-000000000001',
  '37000000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000002',
  'Betaalde kerstturbo', 'package', 12100, 'EUR', 2100, 'manual',
  60, 'offering_terms_v1', 'manual_review', 'draft',
  '16000000-0000-4000-8000-000000000001'
);

select public.publish_group_offering(
  '26000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000002',
  '16000000-0000-4000-8000-000000000001',
  'offering-paid-publish-v3'
);

create temporary table offering_v3_result (result_json jsonb);
insert into offering_v3_result values (
  public.reserve_group_offering_seat(
    '26000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000002',
    '66000000-0000-4000-8000-000000000001',
    'regular', true,
    '16000000-0000-4000-8000-000000000002',
    'offering-paid-reserve-v3'
  )
);

do $$
declare
  payment_id uuid := (
    select (result_json ->> 'manualPaymentId')::uuid from offering_v3_result
  );
begin
  if (select result_json ->> 'status' from offering_v3_result) <> 'pending_payment' then
    raise exception 'Paid offering did not create a pending seat hold';
  end if;
  if exists (
    select 1 from public.group_memberships
    where group_id = '37000000-0000-4000-8000-000000000002'
      and participant_id = '56000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Paid offering placed participant before payment';
  end if;
  update public.manual_payments
  set status = 'paid', paid_on = current_date
  where id = payment_id;
  if (
    select status from public.offering_registrations
    where manual_payment_id = payment_id
  ) <> 'confirmed' then
    raise exception 'Verified payment did not confirm offering registration';
  end if;
end;
$$;

insert into public.planning_seasons (
  id, tenant_id, name, starts_on, ends_on, status, created_by_user_id
) values (
  '67000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  'Winter 2026', '2026-12-01', '2026-12-31', 'active',
  '16000000-0000-4000-8000-000000000001'
);

insert into public.season_blackout_periods (
  id, tenant_id, season_id, resource_id, name, starts_at, ends_at,
  session_handling, financial_handling, credit_per_lesson_cents, status,
  reason, created_by_user_id
) values (
  '77000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  '67000000-0000-4000-8000-000000000001',
  null, 'Kerstsluiting',
  '2026-12-22T08:00:00Z', '2026-12-22T12:00:00Z',
  'cancel', 'credit_per_lesson', 500, 'draft',
  'Zwembad gesloten',
  '16000000-0000-4000-8000-000000000001'
);

do $$
declare
  invoice_hash text := (
    select content_hash from public.billing_invoices
    where id = (select result_id from billing_v3_results where result_key = 'invoice')
  );
  result jsonb;
begin
  result := public.publish_season_blackout_v3(
    '26000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001',
    '16000000-0000-4000-8000-000000000001',
    'holiday-publish-v3-test'
  );
  if (result ->> 'historyWillBeDeleted')::boolean then
    raise exception 'Holiday publication claims to delete history';
  end if;
  if (result ->> 'finalInvoicesWillBeChanged')::boolean then
    raise exception 'Holiday publication claims to mutate final invoices';
  end if;
  if (
    select status from public.sessions
    where id = '47000000-0000-4000-8000-000000000002'
  ) <> 'cancelled' then
    raise exception 'Holiday did not apply schedule exception';
  end if;
  if (
    select count(*) from public.schedule_occurrence_exceptions
    where blackout_id = '77000000-0000-4000-8000-000000000001'
      and status = 'applied'
  ) <> 1 then
    raise exception 'Holiday exception history is missing';
  end if;
  if (
    select count(*) from public.season_financial_adjustment_proposals
    where blackout_id = '77000000-0000-4000-8000-000000000001'
      and estimated_gross_cents = 500
  ) <> 1 then
    raise exception 'Holiday financial proposal is missing';
  end if;
  if (
    select content_hash from public.billing_invoices
    where id = (select result_id from billing_v3_results where result_key = 'invoice')
  ) <> invoice_hash then
    raise exception 'Holiday publication changed a final invoice';
  end if;
end;
$$;

rollback;
