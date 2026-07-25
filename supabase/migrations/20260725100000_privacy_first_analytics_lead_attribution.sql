alter table public.tenant_settings
  add column analytics_enabled boolean not null default false,
  add column google_analytics_measurement_id text;

alter table public.tenant_settings
  add constraint tenant_settings_google_analytics_measurement_id_check check (
    google_analytics_measurement_id is null
    or google_analytics_measurement_id ~ '^G-[A-Z0-9]{6,20}$'
  ),
  add constraint tenant_settings_analytics_configuration_check check (
    not analytics_enabled or google_analytics_measurement_id is not null
  );

alter table public.intake_submissions
  add column attribution_channel text not null default 'direct',
  add column attribution_source text not null default 'direct',
  add column attribution_medium text,
  add column attribution_campaign text,
  add column attribution_content text,
  add column attribution_term text,
  add column attribution_referrer_host text,
  add column attribution_landing_path text not null default '/',
  add column attribution_has_ad_click_id boolean not null default false,
  add column attribution_captured_at timestamptz,
  add column analytics_consent text not null default 'unknown',
  add column analytics_consent_version text;

alter table public.intake_submissions
  add constraint intake_submissions_attribution_channel_check check (
    attribution_channel in (
      'direct',
      'organic_search',
      'paid_search',
      'organic_social',
      'paid_social',
      'email',
      'referral',
      'campaign'
    )
  ),
  add constraint intake_submissions_attribution_source_length_check check (char_length(attribution_source) between 1 and 120),
  add constraint intake_submissions_attribution_medium_length_check check (attribution_medium is null or char_length(attribution_medium) <= 80),
  add constraint intake_submissions_attribution_campaign_length_check check (attribution_campaign is null or char_length(attribution_campaign) <= 160),
  add constraint intake_submissions_attribution_content_length_check check (attribution_content is null or char_length(attribution_content) <= 160),
  add constraint intake_submissions_attribution_term_length_check check (attribution_term is null or char_length(attribution_term) <= 160),
  add constraint intake_submissions_attribution_referrer_host_check check (
    attribution_referrer_host is null
    or (
      char_length(attribution_referrer_host) <= 253
      and attribution_referrer_host ~ '^[a-z0-9.-]+$'
    )
  ),
  add constraint intake_submissions_attribution_landing_path_check check (
    char_length(attribution_landing_path) between 1 and 240
    and attribution_landing_path like '/%'
    and attribution_landing_path not like '//%'
  ),
  add constraint intake_submissions_analytics_consent_check check (
    analytics_consent in ('unknown', 'denied', 'granted')
  ),
  add constraint intake_submissions_analytics_consent_version_check check (
    analytics_consent_version is null or char_length(analytics_consent_version) <= 40
  );

create index intake_submissions_tenant_attribution_idx
  on public.intake_submissions (tenant_id, attribution_channel, received_at desc)
  where not is_test;

create index intake_submissions_tenant_campaign_idx
  on public.intake_submissions (tenant_id, attribution_campaign, received_at desc)
  where not is_test and attribution_campaign is not null;

comment on column public.intake_submissions.attribution_has_ad_click_id is
  'Only records that a supported ad click identifier was present. The identifier value itself is deliberately not stored.';

comment on column public.intake_submissions.analytics_consent is
  'Consent state at form submission. Google Analytics remains blocked unless this value was granted in the browser.';
