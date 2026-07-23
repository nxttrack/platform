alter table public.payment_sessions
  add column if not exists consent_terms_version text,
  add column if not exists consent_initiated_at timestamptz,
  add column if not exists consent_initiated_by_user_id uuid references auth.users (id) on delete set null;

alter table public.payment_sessions
  drop constraint if exists payment_sessions_first_consent_check,
  add constraint payment_sessions_first_consent_check check (
    sequence_type <> 'first'
    or (
      consent_terms_version is not null
      and consent_initiated_at is not null
      and consent_initiated_by_user_id is not null
    )
  );

alter table public.billing_collection_attempts
  add column if not exists prenotification_id uuid,
  add column if not exists prenotification_delivery_status text;

alter table public.billing_collection_attempts
  drop constraint if exists billing_collection_attempts_status_check,
  add constraint billing_collection_attempts_status_check check (status in ('scheduled', 'prenotified', 'processing', 'pending', 'authorized', 'paid', 'failed', 'expired', 'cancelled'));

alter table public.tenant_notifications
  drop constraint if exists tenant_notifications_tenant_id_id_unique,
  add constraint tenant_notifications_tenant_id_id_unique unique (tenant_id, id);

alter table public.billing_collection_attempts
  drop constraint if exists billing_collection_attempts_prenotification_fk,
  add constraint billing_collection_attempts_prenotification_fk foreign key (tenant_id, prenotification_id) references public.tenant_notifications (tenant_id, id) on delete restrict,
  drop constraint if exists billing_collection_attempts_delivery_check,
  add constraint billing_collection_attempts_delivery_check check (
    prenotification_delivery_status is null
    or prenotification_delivery_status in ('sent', 'in_app', 'failed')
  ),
  drop constraint if exists billing_collection_attempts_processing_delivery_check,
  add constraint billing_collection_attempts_processing_delivery_check check (
    status not in ('processing', 'pending', 'authorized', 'paid')
    or prenotification_delivery_status = 'sent'
  );

create index billing_collection_attempts_delivery_idx
  on public.billing_collection_attempts (tenant_id, prenotification_delivery_status, scheduled_for)
  where status in ('prenotified', 'processing', 'pending');
