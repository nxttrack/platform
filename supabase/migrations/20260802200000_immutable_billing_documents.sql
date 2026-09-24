-- Immutable VAT invoices and credit notes. Consumer prices are gross amounts;
-- VAT is extracted at issue time and snapshotted with all issuer/recipient data.

create table public.tenant_billing_profiles (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  legal_name text not null,
  trade_name text,
  address_line_1 text,
  address_line_2 text,
  postal_code text,
  city text,
  country_code text not null default 'NL',
  chamber_of_commerce_number text,
  vat_number text,
  iban text,
  billing_email text,
  phone text,
  vat_scheme text not null default 'standard',
  default_vat_rate_basis_points integer not null default 2100,
  prices_include_vat boolean not null default true,
  invoice_prefix text not null default 'INV',
  credit_note_prefix text not null default 'CN',
  payment_terms_days integer not null default 14,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_billing_profiles_legal_name_check
    check (length(trim(legal_name)) between 2 and 160),
  constraint tenant_billing_profiles_country_check
    check (country_code ~ '^[A-Z]{2}$'),
  constraint tenant_billing_profiles_vat_scheme_check
    check (vat_scheme in ('standard', 'exempt', 'small_business')),
  constraint tenant_billing_profiles_vat_rate_check
    check (default_vat_rate_basis_points in (0, 900, 2100)),
  constraint tenant_billing_profiles_gross_price_check
    check (prices_include_vat),
  constraint tenant_billing_profiles_prefix_check check (
    invoice_prefix ~ '^[A-Z0-9-]{2,12}$'
    and credit_note_prefix ~ '^[A-Z0-9-]{2,12}$'
  ),
  constraint tenant_billing_profiles_terms_check
    check (payment_terms_days between 0 and 90)
);

insert into public.tenant_billing_profiles (tenant_id, legal_name)
select tenant.id, tenant.name
from public.tenants tenant
on conflict (tenant_id) do nothing;

create or replace function app_private.ensure_tenant_billing_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.tenant_billing_profiles (tenant_id, legal_name)
  values (new.id, new.name)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

create trigger tenants_ensure_billing_profile
  after insert on public.tenants
  for each row execute function app_private.ensure_tenant_billing_profile();

create trigger tenant_billing_profiles_set_updated_at
  before update on public.tenant_billing_profiles
  for each row execute function app_private.set_updated_at();

create table public.billing_document_number_sequences (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  document_type text not null,
  sequence_year integer not null,
  last_number integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, document_type, sequence_year),
  constraint billing_document_number_sequences_type_check
    check (document_type in ('invoice', 'credit_note')),
  constraint billing_document_number_sequences_year_check
    check (sequence_year between 2000 and 9999),
  constraint billing_document_number_sequences_number_check
    check (last_number >= 0)
);

alter table public.billing_invoices
  add column document_type text not null default 'invoice',
  add column original_invoice_id uuid,
  add column template_version text not null default 'invoice_standard_v1',
  add column renderer_version text not null default 'billing_pdf_v1',
  add column issuer_snapshot_json jsonb not null default '{}'::jsonb,
  add column recipient_snapshot_json jsonb not null default '{}'::jsonb,
  add column vat_scheme text not null default 'standard',
  add column default_vat_rate_basis_points integer not null default 2100,
  add column finalized_at timestamptz,
  add column finalized_by_user_id uuid references auth.users (id) on delete set null,
  add column correction_reason text,
  add column content_hash text;

alter table public.billing_invoices
  add constraint billing_invoices_original_invoice_fk
    foreign key (tenant_id, original_invoice_id)
    references public.billing_invoices (tenant_id, id) on delete restrict,
  add constraint billing_invoices_document_type_check
    check (document_type in ('invoice', 'credit_note')),
  add constraint billing_invoices_template_version_check
    check (template_version = 'invoice_standard_v1'),
  add constraint billing_invoices_renderer_version_check
    check (renderer_version = 'billing_pdf_v1'),
  add constraint billing_invoices_snapshots_check check (
    jsonb_typeof(issuer_snapshot_json) = 'object'
    and jsonb_typeof(recipient_snapshot_json) = 'object'
  ),
  add constraint billing_invoices_vat_scheme_check
    check (vat_scheme in ('standard', 'exempt', 'small_business')),
  add constraint billing_invoices_vat_rate_check
    check (default_vat_rate_basis_points in (0, 900, 2100)),
  add constraint billing_invoices_document_relation_check check (
    (document_type = 'invoice' and original_invoice_id is null)
    or (document_type = 'credit_note' and original_invoice_id is not null)
  ),
  add constraint billing_invoices_finalization_check check (
    (status = 'draft' and finalized_at is null and content_hash is null)
    or (
      status <> 'draft'
      and finalized_at is not null
      and content_hash ~ '^[0-9a-f]{64}$'
    )
  ),
  add constraint billing_invoices_correction_reason_check check (
    document_type <> 'credit_note'
    or length(trim(coalesce(correction_reason, ''))) >= 3
  );

update public.billing_invoices invoice
set document_type = 'invoice',
    template_version = 'invoice_standard_v1',
    renderer_version = 'billing_pdf_v1',
    issuer_snapshot_json = jsonb_build_object(
      'legacy', true,
      'legal_name', tenant.name
    ),
    recipient_snapshot_json = jsonb_build_object('legacy', true),
    vat_scheme = case when invoice.tax_cents > 0 then 'standard' else 'exempt' end,
    default_vat_rate_basis_points = case when invoice.tax_cents > 0 then 2100 else 0 end,
    finalized_at = case when invoice.status = 'draft' then null else invoice.created_at end,
    content_hash = case
      when invoice.status = 'draft' then null
      else encode(
        extensions.digest(
          concat_ws(
            ':',
            invoice.id::text,
            coalesce(invoice.invoice_number, ''),
            invoice.total_cents::text,
            invoice.currency,
            invoice.created_at::text
          ),
          'sha256'
        ),
        'hex'
      )
    end
from public.tenants tenant
where tenant.id = invoice.tenant_id;

create unique index billing_invoices_one_payment_invoice_unique
  on public.billing_invoices (tenant_id, manual_payment_id)
  where document_type = 'invoice' and manual_payment_id is not null;

create index billing_invoices_original_idx
  on public.billing_invoices (tenant_id, original_invoice_id, status)
  where original_invoice_id is not null;

alter table public.billing_invoice_lines
  add column net_amount_cents integer,
  add column vat_amount_cents integer,
  add column gross_amount_cents integer,
  add column line_snapshot_json jsonb not null default '{}'::jsonb;

update public.billing_invoice_lines line
set net_amount_cents = greatest(0, line.total_cents),
    vat_amount_cents = 0,
    gross_amount_cents = greatest(0, line.total_cents),
    line_snapshot_json = jsonb_build_object('legacy', true);

alter table public.billing_invoice_lines
  alter column net_amount_cents set not null,
  alter column vat_amount_cents set not null,
  alter column gross_amount_cents set not null,
  add constraint billing_invoice_lines_vat_amounts_check check (
    net_amount_cents >= 0
    and vat_amount_cents >= 0
    and gross_amount_cents >= 0
    and net_amount_cents + vat_amount_cents = gross_amount_cents
    and total_cents = gross_amount_cents
  ),
  add constraint billing_invoice_lines_snapshot_check
    check (jsonb_typeof(line_snapshot_json) = 'object');

create table public.billing_document_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  original_invoice_id uuid not null,
  credit_note_id uuid not null,
  billing_refund_id uuid,
  adjustment_type text not null,
  status text not null default 'issued',
  amount_cents integer not null,
  currency text not null default 'EUR',
  reason text not null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_document_adjustments_original_fk
    foreign key (tenant_id, original_invoice_id)
    references public.billing_invoices (tenant_id, id) on delete restrict,
  constraint billing_document_adjustments_credit_fk
    foreign key (tenant_id, credit_note_id)
    references public.billing_invoices (tenant_id, id) on delete restrict,
  constraint billing_document_adjustments_refund_fk
    foreign key (tenant_id, billing_refund_id)
    references public.billing_refunds (tenant_id, id) on delete restrict,
  constraint billing_document_adjustments_type_check
    check (adjustment_type in ('credit_only', 'refund', 'offset')),
  constraint billing_document_adjustments_status_check
    check (status in ('issued', 'refund_pending', 'settled', 'cancelled')),
  constraint billing_document_adjustments_amount_check check (amount_cents > 0),
  constraint billing_document_adjustments_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint billing_document_adjustments_reason_check check (length(trim(reason)) >= 3),
  constraint billing_document_adjustments_unique_credit
    unique (tenant_id, credit_note_id),
  constraint billing_document_adjustments_tenant_id_id_unique
    unique (tenant_id, id)
);

create index billing_document_adjustments_original_idx
  on public.billing_document_adjustments (tenant_id, original_invoice_id, status);

create trigger billing_document_adjustments_set_updated_at
  before update on public.billing_document_adjustments
  for each row execute function app_private.set_updated_at();

create or replace function app_private.protect_final_billing_invoice()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status <> 'draft' and (
    new.tenant_id is distinct from old.tenant_id
    or new.subscription_id is distinct from old.subscription_id
    or new.manual_payment_id is distinct from old.manual_payment_id
    or new.participant_id is distinct from old.participant_id
    or new.guardian_user_id is distinct from old.guardian_user_id
    or new.invoice_number is distinct from old.invoice_number
    or new.issued_on is distinct from old.issued_on
    or new.due_on is distinct from old.due_on
    or new.subtotal_cents is distinct from old.subtotal_cents
    or new.tax_cents is distinct from old.tax_cents
    or new.total_cents is distinct from old.total_cents
    or new.currency is distinct from old.currency
    or new.notes is distinct from old.notes
    or new.document_type is distinct from old.document_type
    or new.original_invoice_id is distinct from old.original_invoice_id
    or new.template_version is distinct from old.template_version
    or new.renderer_version is distinct from old.renderer_version
    or new.issuer_snapshot_json is distinct from old.issuer_snapshot_json
    or new.recipient_snapshot_json is distinct from old.recipient_snapshot_json
    or new.vat_scheme is distinct from old.vat_scheme
    or new.default_vat_rate_basis_points is distinct from old.default_vat_rate_basis_points
    or new.finalized_at is distinct from old.finalized_at
    or new.finalized_by_user_id is distinct from old.finalized_by_user_id
    or new.correction_reason is distinct from old.correction_reason
    or new.content_hash is distinct from old.content_hash
  ) then
    raise exception 'Final billing document content is immutable';
  end if;
  if old.status <> 'draft' and new.status = 'draft' then
    raise exception 'Final billing document cannot return to draft';
  end if;
  return new;
end;
$$;

create trigger billing_invoices_protect_final
  before update on public.billing_invoices
  for each row execute function app_private.protect_final_billing_invoice();

create or replace function app_private.protect_final_billing_invoice_line()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  target_tenant_id uuid := coalesce(new.tenant_id, old.tenant_id);
  target_status text;
begin
  select invoice.status into target_status
  from public.billing_invoices invoice
  where invoice.tenant_id = target_tenant_id
    and invoice.id = target_invoice_id;
  if target_status is null then
    raise exception 'Billing document not found';
  end if;
  if target_status <> 'draft' then
    raise exception 'Final billing document lines are immutable';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger billing_invoice_lines_protect_final
  before insert or update or delete on public.billing_invoice_lines
  for each row execute function app_private.protect_final_billing_invoice_line();

create or replace function app_private.next_billing_document_number(
  target_tenant_id uuid,
  target_document_type text,
  target_sequence_year integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_prefix text;
  target_number integer;
begin
  if target_document_type not in ('invoice', 'credit_note') then
    raise exception 'Invalid billing document type';
  end if;

  select case
      when target_document_type = 'invoice' then profile.invoice_prefix
      else profile.credit_note_prefix
    end
  into target_prefix
  from public.tenant_billing_profiles profile
  where profile.tenant_id = target_tenant_id;

  insert into public.billing_document_number_sequences (
    tenant_id, document_type, sequence_year, last_number
  )
  values (target_tenant_id, target_document_type, target_sequence_year, 1)
  on conflict (tenant_id, document_type, sequence_year)
  do update set
    last_number = billing_document_number_sequences.last_number + 1,
    updated_at = now()
  returning last_number into target_number;

  return concat(target_prefix, '-', target_sequence_year, '-', lpad(target_number::text, 6, '0'));
end;
$$;

create or replace function app_private.issue_invoice_for_payment(
  target_tenant_id uuid,
  target_payment_id uuid,
  target_description text,
  target_notes text,
  actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payment public.manual_payments%rowtype;
  profile public.tenant_billing_profiles%rowtype;
  tenant_timezone text;
  tenant_logo_url text;
  guardian_name text;
  guardian_email text;
  participant_name text;
  target_invoice_id uuid;
  target_invoice_number text;
  target_issued_on date;
  target_status text;
  target_vat_rate integer;
  target_tax_cents integer;
  target_net_cents integer;
  issuer_snapshot jsonb;
  recipient_snapshot jsonb;
  request_hash text;
  document_hash text;
  existing_receipt public.domain_command_receipts%rowtype;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  if not app_private.user_has_swim_permission(actor_user_id, target_tenant_id, 'invoice.issue') then
    raise exception 'Insufficient invoice issue permission';
  end if;
  if length(target_idempotency_key) not between 8 and 200 then
    raise exception 'Invalid idempotency key';
  end if;

  request_hash := encode(
    extensions.digest(
      concat_ws(
        ':',
        target_payment_id::text,
        trim(coalesce(target_description, '')),
        trim(coalesce(target_notes, ''))
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
    if existing_receipt.command_type <> 'billing.invoice.issue'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key payload mismatch';
    end if;
    return (existing_receipt.result_json ->> 'invoice_id')::uuid;
  end if;

  select * into payment
  from public.manual_payments
  where tenant_id = target_tenant_id and id = target_payment_id
  for update;
  if not found then
    raise exception 'Payment not found in tenant';
  end if;
  if payment.status in ('waived', 'cancelled') then
    raise exception 'Payment is not invoiceable';
  end if;

  select * into profile
  from public.tenant_billing_profiles
  where tenant_id = target_tenant_id
  for share;
  if not found
    or profile.address_line_1 is null
    or profile.postal_code is null
    or profile.city is null
    or profile.billing_email is null
  then
    raise exception 'Tenant billing profile is incomplete';
  end if;

  select coalesce(settings.timezone, 'Europe/Amsterdam')
  into tenant_timezone
  from public.tenant_settings settings
  where settings.tenant_id = target_tenant_id;
  target_issued_on := (now() at time zone coalesce(tenant_timezone, 'Europe/Amsterdam'))::date;

  select branding.logo_url into tenant_logo_url
  from public.tenant_branding branding
  where branding.tenant_id = target_tenant_id
    and branding.status = 'active';
  select participant.display_name into participant_name
  from public.participants participant
  where participant.tenant_id = target_tenant_id
    and participant.id = payment.participant_id;
  if payment.guardian_user_id is not null then
    select guardian.full_name, guardian.email
    into guardian_name, guardian_email
    from public.profiles guardian
    where guardian.id = payment.guardian_user_id;
  end if;

  target_vat_rate := case
    when profile.vat_scheme = 'standard' then profile.default_vat_rate_basis_points
    else 0
  end;
  target_tax_cents := case
    when target_vat_rate = 0 then 0
    else round(
      payment.amount_cents::numeric * target_vat_rate::numeric
      / (10000 + target_vat_rate)::numeric
    )::integer
  end;
  target_net_cents := payment.amount_cents - target_tax_cents;
  target_status := case when payment.status = 'paid' then 'paid' else 'issued' end;

  issuer_snapshot := jsonb_build_object(
    'legal_name', profile.legal_name,
    'trade_name', profile.trade_name,
    'address_line_1', profile.address_line_1,
    'address_line_2', profile.address_line_2,
    'postal_code', profile.postal_code,
    'city', profile.city,
    'country_code', profile.country_code,
    'chamber_of_commerce_number', profile.chamber_of_commerce_number,
    'vat_number', profile.vat_number,
    'iban', profile.iban,
    'billing_email', profile.billing_email,
    'phone', profile.phone,
    'logo_url', tenant_logo_url
  );
  recipient_snapshot := jsonb_build_object(
    'guardian_name', coalesce(guardian_name, 'Ouder/verzorger'),
    'guardian_email', guardian_email,
    'participant_name', participant_name
  );

  select invoice.id into target_invoice_id
  from public.billing_invoices invoice
  where invoice.tenant_id = target_tenant_id
    and invoice.manual_payment_id = target_payment_id
    and invoice.document_type = 'invoice';
  if found then
    return target_invoice_id;
  end if;

  target_invoice_number := app_private.next_billing_document_number(
    target_tenant_id, 'invoice', extract(year from target_issued_on)::integer
  );
  target_invoice_id := gen_random_uuid();

  insert into public.billing_invoices (
    id, tenant_id, subscription_id, manual_payment_id, participant_id,
    guardian_user_id, invoice_number, status, issued_on, due_on, paid_on,
    subtotal_cents, tax_cents, total_cents, currency, export_status, notes,
    document_type, template_version, renderer_version, issuer_snapshot_json,
    recipient_snapshot_json, vat_scheme, default_vat_rate_basis_points
  )
  values (
    target_invoice_id, target_tenant_id, payment.subscription_id, payment.id,
    payment.participant_id, payment.guardian_user_id, target_invoice_number,
    'draft', target_issued_on, payment.due_on,
    case when target_status = 'paid' then coalesce(payment.paid_on, target_issued_on) else null end,
    target_net_cents, target_tax_cents, payment.amount_cents, payment.currency,
    'ready', nullif(trim(coalesce(target_notes, '')), ''),
    'invoice', 'invoice_standard_v1', 'billing_pdf_v1', issuer_snapshot,
    recipient_snapshot, profile.vat_scheme, target_vat_rate
  );

  insert into public.billing_invoice_lines (
    tenant_id, invoice_id, manual_payment_id, description, quantity,
    unit_amount_cents, tax_rate_basis_points, total_cents, sort_order,
    net_amount_cents, vat_amount_cents, gross_amount_cents, line_snapshot_json
  )
  values (
    target_tenant_id, target_invoice_id, payment.id,
    coalesce(
      nullif(trim(coalesce(target_description, '')), ''),
      payment.reference,
      'Zwemles betaling'
    ),
    1, target_net_cents, target_vat_rate, payment.amount_cents, 0,
    target_net_cents, target_tax_cents, payment.amount_cents,
    jsonb_build_object(
      'source', 'manual_payment',
      'manual_payment_id', payment.id,
      'gross_price', true
    )
  );

  document_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'id', target_invoice_id,
        'number', target_invoice_number,
        'type', 'invoice',
        'issued_on', target_issued_on,
        'due_on', payment.due_on,
        'currency', payment.currency,
        'net_cents', target_net_cents,
        'vat_cents', target_tax_cents,
        'gross_cents', payment.amount_cents,
        'vat_rate_basis_points', target_vat_rate,
        'issuer', issuer_snapshot,
        'recipient', recipient_snapshot,
        'description', coalesce(
          nullif(trim(coalesce(target_description, '')), ''),
          payment.reference,
          'Zwemles betaling'
        )
      )::text,
      'sha256'
    ),
    'hex'
  );
  update public.billing_invoices
  set status = target_status,
      finalized_at = now(),
      finalized_by_user_id = actor_user_id,
      content_hash = document_hash
  where tenant_id = target_tenant_id and id = target_invoice_id;

  insert into public.billing_events (
    tenant_id, subscription_id, manual_payment_id, participant_id,
    guardian_user_id, type, status, occurred_at, message
  )
  values (
    target_tenant_id, payment.subscription_id, payment.id, payment.participant_id,
    payment.guardian_user_id, 'invoice_issued', 'processed', now(),
    concat('Factuur ', target_invoice_number, ' definitief uitgegeven.')
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    payload_json
  )
  values (
    target_tenant_id, 'billing.invoice.issued', 'billing_invoice',
    target_invoice_id, actor_user_id,
    jsonb_build_object(
      'invoice_id', target_invoice_id,
      'invoice_number', target_invoice_number,
      'manual_payment_id', payment.id,
      'participant_id', payment.participant_id,
      'gross_cents', payment.amount_cents,
      'vat_cents', target_tax_cents,
      'currency', payment.currency
    )
  );
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type,
    subject_id, reason, after_json
  )
  values (
    target_tenant_id, actor_user_id, 'invoice.issue', 'billing.invoice.issued',
    'billing_invoice', target_invoice_id, target_notes,
    jsonb_build_object(
      'invoice_number', target_invoice_number,
      'content_hash', document_hash,
      'gross_cents', payment.amount_cents,
      'vat_cents', target_tax_cents
    )
  );
  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  )
  values (
    target_tenant_id, target_idempotency_key, 'billing.invoice.issue',
    'billing_invoice', target_invoice_id, actor_user_id, request_hash,
    jsonb_build_object(
      'invoice_id', target_invoice_id,
      'invoice_number', target_invoice_number,
      'content_hash', document_hash
    )
  );
  return target_invoice_id;
end;
$$;

create or replace function app_private.issue_credit_note(
  target_tenant_id uuid,
  target_original_invoice_id uuid,
  target_amount_cents integer,
  target_reason text,
  target_adjustment_type text,
  actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  original_invoice public.billing_invoices%rowtype;
  credited_cents integer;
  target_credit_id uuid;
  target_credit_number text;
  target_issued_on date;
  target_tax_cents integer;
  target_net_cents integer;
  request_hash text;
  document_hash text;
  existing_receipt public.domain_command_receipts%rowtype;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  if not app_private.user_has_swim_permission(actor_user_id, target_tenant_id, 'invoice.credit') then
    raise exception 'Insufficient invoice credit permission';
  end if;
  if target_amount_cents <= 0 then
    raise exception 'Credit amount must be positive';
  end if;
  if length(trim(coalesce(target_reason, ''))) < 3 then
    raise exception 'Credit reason must contain at least three characters';
  end if;
  if target_adjustment_type not in ('credit_only', 'refund', 'offset') then
    raise exception 'Invalid adjustment type';
  end if;
  if length(target_idempotency_key) not between 8 and 200 then
    raise exception 'Invalid idempotency key';
  end if;

  request_hash := encode(
    extensions.digest(
      concat_ws(
        ':',
        target_original_invoice_id::text,
        target_amount_cents::text,
        trim(target_reason),
        target_adjustment_type
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
    if existing_receipt.command_type <> 'billing.credit_note.issue'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key payload mismatch';
    end if;
    return (existing_receipt.result_json ->> 'credit_note_id')::uuid;
  end if;

  select * into original_invoice
  from public.billing_invoices invoice
  where invoice.tenant_id = target_tenant_id
    and invoice.id = target_original_invoice_id
  for update;
  if not found
    or original_invoice.document_type <> 'invoice'
    or original_invoice.status = 'draft'
    or original_invoice.status = 'void'
  then
    raise exception 'Original invoice is not creditable';
  end if;

  select coalesce(sum(credit.total_cents), 0)::integer
  into credited_cents
  from public.billing_invoices credit
  where credit.tenant_id = target_tenant_id
    and credit.original_invoice_id = original_invoice.id
    and credit.document_type = 'credit_note'
    and credit.status <> 'void';
  if target_amount_cents > original_invoice.total_cents - credited_cents then
    raise exception 'Credit amount exceeds remaining invoice amount';
  end if;

  target_issued_on := current_date;
  target_tax_cents := case
    when original_invoice.default_vat_rate_basis_points = 0 then 0
    else round(
      target_amount_cents::numeric
      * original_invoice.default_vat_rate_basis_points::numeric
      / (10000 + original_invoice.default_vat_rate_basis_points)::numeric
    )::integer
  end;
  target_net_cents := target_amount_cents - target_tax_cents;
  target_credit_id := gen_random_uuid();
  target_credit_number := app_private.next_billing_document_number(
    target_tenant_id, 'credit_note', extract(year from target_issued_on)::integer
  );

  insert into public.billing_invoices (
    id, tenant_id, subscription_id, manual_payment_id, participant_id,
    guardian_user_id, invoice_number, status, issued_on, due_on, paid_on,
    subtotal_cents, tax_cents, total_cents, currency, export_status, notes,
    document_type, original_invoice_id, template_version, renderer_version,
    issuer_snapshot_json, recipient_snapshot_json, vat_scheme,
    default_vat_rate_basis_points, correction_reason
  )
  values (
    target_credit_id, target_tenant_id, original_invoice.subscription_id,
    original_invoice.manual_payment_id, original_invoice.participant_id,
    original_invoice.guardian_user_id, target_credit_number, 'draft',
    target_issued_on, target_issued_on, null, target_net_cents, target_tax_cents,
    target_amount_cents, original_invoice.currency, 'ready', trim(target_reason),
    'credit_note', original_invoice.id, original_invoice.template_version,
    original_invoice.renderer_version, original_invoice.issuer_snapshot_json,
    original_invoice.recipient_snapshot_json, original_invoice.vat_scheme,
    original_invoice.default_vat_rate_basis_points, trim(target_reason)
  );
  insert into public.billing_invoice_lines (
    tenant_id, invoice_id, manual_payment_id, description, quantity,
    unit_amount_cents, tax_rate_basis_points, total_cents, sort_order,
    net_amount_cents, vat_amount_cents, gross_amount_cents, line_snapshot_json
  )
  values (
    target_tenant_id, target_credit_id, original_invoice.manual_payment_id,
    concat('Correctie op ', original_invoice.invoice_number, ': ', trim(target_reason)),
    1, target_net_cents, original_invoice.default_vat_rate_basis_points,
    target_amount_cents, 0, target_net_cents, target_tax_cents,
    target_amount_cents,
    jsonb_build_object(
      'source', 'credit_note',
      'original_invoice_id', original_invoice.id,
      'original_invoice_number', original_invoice.invoice_number,
      'gross_price', true
    )
  );

  document_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'id', target_credit_id,
        'number', target_credit_number,
        'type', 'credit_note',
        'original_invoice_id', original_invoice.id,
        'original_invoice_number', original_invoice.invoice_number,
        'issued_on', target_issued_on,
        'currency', original_invoice.currency,
        'net_cents', target_net_cents,
        'vat_cents', target_tax_cents,
        'gross_cents', target_amount_cents,
        'reason', trim(target_reason),
        'issuer', original_invoice.issuer_snapshot_json,
        'recipient', original_invoice.recipient_snapshot_json
      )::text,
      'sha256'
    ),
    'hex'
  );
  update public.billing_invoices
  set status = 'issued',
      finalized_at = now(),
      finalized_by_user_id = actor_user_id,
      content_hash = document_hash
  where tenant_id = target_tenant_id and id = target_credit_id;

  insert into public.billing_document_adjustments (
    tenant_id, original_invoice_id, credit_note_id, adjustment_type, status,
    amount_cents, currency, reason, created_by_user_id
  )
  values (
    target_tenant_id, original_invoice.id, target_credit_id,
    target_adjustment_type,
    case when target_adjustment_type = 'refund' then 'refund_pending' else 'issued' end,
    target_amount_cents, original_invoice.currency, trim(target_reason), actor_user_id
  );
  insert into public.billing_events (
    tenant_id, subscription_id, manual_payment_id, participant_id,
    guardian_user_id, type, status, occurred_at, message
  )
  values (
    target_tenant_id, original_invoice.subscription_id,
    original_invoice.manual_payment_id, original_invoice.participant_id,
    original_invoice.guardian_user_id, 'credit_note_issued', 'processed', now(),
    concat(
      'Creditnota ', target_credit_number, ' uitgegeven voor ',
      original_invoice.invoice_number, '.'
    )
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    payload_json
  )
  values (
    target_tenant_id, 'billing.credit_note.issued', 'billing_invoice',
    target_credit_id, actor_user_id,
    jsonb_build_object(
      'credit_note_id', target_credit_id,
      'credit_note_number', target_credit_number,
      'original_invoice_id', original_invoice.id,
      'gross_cents', target_amount_cents,
      'vat_cents', target_tax_cents,
      'adjustment_type', target_adjustment_type
    )
  );
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type,
    subject_id, reason, before_json, after_json
  )
  values (
    target_tenant_id, actor_user_id, 'invoice.credit',
    'billing.credit_note.issued', 'billing_invoice', target_credit_id,
    trim(target_reason),
    jsonb_build_object(
      'original_invoice_id', original_invoice.id,
      'remaining_creditable_cents', original_invoice.total_cents - credited_cents
    ),
    jsonb_build_object(
      'credit_note_number', target_credit_number,
      'gross_cents', target_amount_cents,
      'content_hash', document_hash
    )
  );
  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  )
  values (
    target_tenant_id, target_idempotency_key, 'billing.credit_note.issue',
    'billing_invoice', target_credit_id, actor_user_id, request_hash,
    jsonb_build_object(
      'credit_note_id', target_credit_id,
      'credit_note_number', target_credit_number,
      'content_hash', document_hash
    )
  );
  return target_credit_id;
end;
$$;

create or replace function public.issue_invoice_for_payment(
  target_tenant_id uuid,
  target_payment_id uuid,
  target_description text,
  target_notes text,
  actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.issue_invoice_for_payment(
    target_tenant_id,
    target_payment_id,
    target_description,
    target_notes,
    actor_user_id,
    target_idempotency_key
  );
$$;

create or replace function public.issue_credit_note(
  target_tenant_id uuid,
  target_original_invoice_id uuid,
  target_amount_cents integer,
  target_reason text,
  target_adjustment_type text,
  actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.issue_credit_note(
    target_tenant_id,
    target_original_invoice_id,
    target_amount_cents,
    target_reason,
    target_adjustment_type,
    actor_user_id,
    target_idempotency_key
  );
$$;

alter table public.billing_events
  drop constraint billing_events_type_check,
  add constraint billing_events_type_check check (type in (
    'payment_due',
    'payment_overdue',
    'payment_paid',
    'payment_failed',
    'payment_refunded',
    'payment_refund_failed',
    'payment_chargeback',
    'payment_chargeback_reversed',
    'payment_session_created',
    'payment_session_failed',
    'payment_provider_webhook',
    'subscription_created',
    'subscription_changed',
    'subscription_paused',
    'subscription_cancelled',
    'subscription_completed',
    'mandate_pending',
    'mandate_activated',
    'mandate_valid',
    'mandate_invalid',
    'mandate_revoked',
    'collection_prenotified',
    'collection_scheduled',
    'collection_started',
    'collection_retry_scheduled',
    'collection_paid',
    'collection_failed',
    'reconciliation_exception',
    'invoice_created',
    'invoice_issued',
    'credit_note_issued',
    'invoice_exported'
  ));

revoke insert, update, delete on public.billing_invoices from authenticated;
revoke insert, update, delete on public.billing_invoice_lines from authenticated;
drop policy if exists "Tenant staff can manage billing invoices" on public.billing_invoices;
drop policy if exists "Tenant staff can manage billing invoice lines" on public.billing_invoice_lines;

grant select, insert, update on public.tenant_billing_profiles to authenticated;
grant select on public.billing_document_number_sequences to authenticated;
grant select on public.billing_document_adjustments to authenticated;
grant all on public.tenant_billing_profiles to service_role;
grant all on public.billing_document_number_sequences to service_role;
grant all on public.billing_document_adjustments to service_role;

alter table public.tenant_billing_profiles enable row level security;
alter table public.tenant_billing_profiles force row level security;
alter table public.billing_document_number_sequences enable row level security;
alter table public.billing_document_number_sequences force row level security;
alter table public.billing_document_adjustments enable row level security;
alter table public.billing_document_adjustments force row level security;

create policy tenant_billing_profiles_read
  on public.tenant_billing_profiles for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'billing.read'));
create policy tenant_billing_profiles_manage
  on public.tenant_billing_profiles for insert to authenticated
  with check (app_private.current_user_has_swim_permission(tenant_id, 'billing.manage'));
create policy tenant_billing_profiles_update
  on public.tenant_billing_profiles for update to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'billing.manage'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'billing.manage'));
create policy billing_document_number_sequences_read
  on public.billing_document_number_sequences for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'billing.manage'));
create policy billing_document_adjustments_read
  on public.billing_document_adjustments for select to authenticated
  using (
    app_private.current_user_has_swim_permission(tenant_id, 'billing.read')
    or exists (
      select 1
      from public.billing_invoices credit
      where credit.tenant_id = billing_document_adjustments.tenant_id
        and credit.id = billing_document_adjustments.credit_note_id
        and (
          credit.guardian_user_id = (select auth.uid())
          or (
            credit.participant_id is not null
            and app_private.current_user_can_view_participant(credit.participant_id)
          )
        )
    )
  );

revoke all on function app_private.ensure_tenant_billing_profile() from public, anon, authenticated;
revoke all on function app_private.next_billing_document_number(uuid, text, integer) from public, anon, authenticated;
revoke all on function app_private.issue_invoice_for_payment(uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function app_private.issue_credit_note(uuid, uuid, integer, text, text, uuid, text) from public, anon, authenticated;
grant execute on function app_private.issue_invoice_for_payment(uuid, uuid, text, text, uuid, text) to service_role;
grant execute on function app_private.issue_credit_note(uuid, uuid, integer, text, text, uuid, text) to service_role;
revoke all on function public.issue_invoice_for_payment(uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.issue_credit_note(uuid, uuid, integer, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.issue_invoice_for_payment(uuid, uuid, text, text, uuid, text) to service_role;
grant execute on function public.issue_credit_note(uuid, uuid, integer, text, text, uuid, text) to service_role;

comment on table public.tenant_billing_profiles is
  'Tenant legal and VAT settings. Consumer prices are gross; the default VAT rate is 21 percent.';
comment on table public.billing_invoices is
  'Immutable finalized invoices and credit notes with versioned renderer and issuer/recipient snapshots.';
comment on function app_private.issue_invoice_for_payment(uuid, uuid, text, text, uuid, text) is
  'Service-only, permission-bound and idempotent invoice issue command with sequential number, inclusive VAT extraction, audit and outbox.';
comment on function app_private.issue_credit_note(uuid, uuid, integer, text, text, uuid, text) is
  'Service-only, permission-bound and idempotent credit-note command. Never rewrites the original final invoice.';
