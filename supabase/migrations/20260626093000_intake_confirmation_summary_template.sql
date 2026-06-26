update public.message_templates
set body_template = 'Hallo {{parent_name}},

Gelukt! Jouw inschrijving voor {{tenant_name}} is ontvangen.

Onderstaand vind je een samenvatting van het ingevulde formulier:

{{summary}}

{{tenant_name}} neemt per e-mail contact met je op over de vervolgstap.

NXTTRACK',
    required_variables = array['parent_name', 'participant_name', 'intake_type', 'tenant_name', 'summary'],
    metadata = coalesce(metadata, '{}'::jsonb) || '{"updated_by":"intake_confirmation_summary_template"}'::jsonb
where code = 'intake-submitted'
  and body_template = 'Hallo {{parent_name}},\n\nWe hebben de {{intake_type}} voor {{participant_name}} ontvangen. De zwemschool beoordeelt de aanvraag en neemt contact op zodra er een passende vervolgstap is.\n\nNXTTRACK';
