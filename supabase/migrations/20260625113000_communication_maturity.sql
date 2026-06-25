alter table public.message_outbox
  add column if not exists event_key text,
  add column if not exists source_table text,
  add column if not exists source_record_id uuid;

alter table public.message_templates
  add column if not exists last_preview_errors text[] not null default array[]::text[];

create index if not exists message_outbox_retry_dashboard_idx
  on public.message_outbox (tenant_id, status, delivery_status, next_retry_at, last_attempt_at);

create index if not exists message_outbox_event_source_idx
  on public.message_outbox (tenant_id, event_key, source_table, source_record_id);

alter table public.communication_provider_configs
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_test_status text,
  add column if not exists last_test_error text;

alter table public.communication_provider_configs
  drop constraint if exists communication_provider_configs_last_test_status_check;

alter table public.communication_provider_configs
  add constraint communication_provider_configs_last_test_status_check
  check (last_test_status is null or last_test_status in ('not_tested', 'success', 'failed'));

do $$
declare
  demo_tenant_id uuid;
begin
  select id into demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if demo_tenant_id is null then
    return;
  end if;

  insert into public.communication_provider_configs (
    tenant_id,
    provider,
    mode,
    status,
    display_name,
    from_email,
    from_name,
    api_key_secret_reference,
    metadata
  )
  values (
    demo_tenant_id,
    'sendgrid',
    'live',
    'configured',
    'SendGrid API live',
    'noreply@nxttrack.nl',
    'NXTTRACK demo',
    'SENDGRID_API_KEY',
    '{"adapter":"live_ready","fallback":"smtp"}'::jsonb
  )
  on conflict (tenant_id, provider, mode) do update
    set status = excluded.status,
        display_name = excluded.display_name,
        from_email = excluded.from_email,
        from_name = excluded.from_name,
        api_key_secret_reference = excluded.api_key_secret_reference,
        metadata = excluded.metadata;

  insert into public.message_templates (
    tenant_id,
    code,
    name,
    channel,
    audience,
    subject_template,
    body_template,
    status,
    required_variables,
    tags,
    sort_order,
    metadata
  )
  values
    (
      demo_tenant_id,
      'intake-submitted',
      'Intake ontvangen',
      'email',
      'parent',
      'We hebben de inschrijving voor {{participant_name}} ontvangen',
      'Hallo {{parent_name}},\n\nWe hebben de {{intake_type}} voor {{participant_name}} ontvangen. De zwemschool beoordeelt de aanvraag en neemt contact op zodra er een passende vervolgstap is.\n\nNXTTRACK',
      'active',
      array['parent_name', 'participant_name', 'intake_type'],
      array['intake', 'parent'],
      5,
      '{"event_key":"intake_submitted"}'::jsonb
    ),
    (
      demo_tenant_id,
      'slot-offer-sent',
      'Plek aangeboden',
      'email',
      'parent',
      'Er is een plek beschikbaar voor {{participant_name}}',
      'Hallo {{parent_name}},\n\nEr is een plek beschikbaar voor {{participant_name}}. Bekijk en bevestig het aanbod via {{slot_offer_url}}.\n\nNXTTRACK',
      'active',
      array['parent_name', 'participant_name', 'slot_offer_url'],
      array['placement', 'slot_offer', 'parent'],
      12,
      '{"event_key":"slot_offer_sent"}'::jsonb
    ),
    (
      demo_tenant_id,
      'payment-reminder',
      'Betalingsherinnering',
      'email',
      'parent',
      'Betalingsherinnering {{invoice_number}}',
      'Hallo {{parent_name}},\n\nEr staat nog {{remaining_amount}} open voor {{invoice_title}}. Log in op het ouderportaal voor de actuele betaalstatus.\n\nNXTTRACK',
      'active',
      array['parent_name', 'invoice_number', 'invoice_title', 'remaining_amount'],
      array['payment', 'reminder', 'parent'],
      22,
      '{"event_key":"payment_reminder"}'::jsonb
    ),
    (
      demo_tenant_id,
      'badge-awarded',
      'Badge behaald',
      'email',
      'parent',
      '{{participant_name}} heeft een badge behaald',
      'Hallo {{parent_name}},\n\n{{participant_name}} heeft de badge {{badge_name}} behaald. Bekijk de achievement card in het ouderportaal.\n\nNXTTRACK',
      'active',
      array['parent_name', 'participant_name', 'badge_name'],
      array['progress', 'badge', 'parent'],
      32,
      '{"event_key":"badge_awarded"}'::jsonb
    ),
    (
      demo_tenant_id,
      'afzwem-invited',
      'Afzwem uitnodiging',
      'email',
      'parent',
      '{{participant_name}} is uitgenodigd voor afzwemmen',
      'Hallo {{parent_name}},\n\n{{participant_name}} is uitgenodigd voor {{event_title}} op {{event_date}}. Details staan in het ouderportaal.\n\nNXTTRACK',
      'active',
      array['parent_name', 'participant_name', 'event_title', 'event_date'],
      array['afzwem', 'parent'],
      42,
      '{"event_key":"afzwem_invited"}'::jsonb
    ),
    (
      demo_tenant_id,
      'diploma-issued',
      'Diploma beschikbaar',
      'email',
      'parent',
      'Diploma beschikbaar voor {{participant_name}}',
      'Hallo {{parent_name}},\n\nHet diploma {{certificate_title}} voor {{participant_name}} staat klaar in de digitale diploma kluis.\n\nNXTTRACK',
      'active',
      array['parent_name', 'participant_name', 'certificate_title'],
      array['diploma', 'document', 'parent'],
      52,
      '{"event_key":"diploma_issued"}'::jsonb
    )
  on conflict (tenant_id, code) do update
    set name = excluded.name,
        channel = excluded.channel,
        audience = excluded.audience,
        subject_template = excluded.subject_template,
        body_template = excluded.body_template,
        status = excluded.status,
        required_variables = excluded.required_variables,
        tags = excluded.tags,
        sort_order = excluded.sort_order,
        metadata = excluded.metadata;
end $$;
