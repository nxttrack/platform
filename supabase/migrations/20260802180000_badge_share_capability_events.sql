-- Capability-aware share telemetry. A hand-off is not the same as a provider post.

alter table public.badge_analytics_events
  drop constraint badge_analytics_events_type_check,
  add constraint badge_analytics_events_type_check check (
    event_type in (
      'evaluated',
      'earned',
      'pending_approval',
      'approved',
      'rejected',
      'revoked',
      'viewed',
      'shared',
      'downloaded',
      'notification_sent',
      'email_sent',
      'delivery_skipped',
      'asset_generated',
      'share_started',
      'share_fallback',
      'share_handed_off'
    )
  );

alter table public.badge_share_assets
  add column privacy_contract_version text not null default 'child_share_v1',
  add constraint badge_share_assets_privacy_contract_check
    check (privacy_contract_version = 'child_share_v1');

comment on column public.badge_share_assets.privacy_contract_version is
  'Share assets contain only approved first-name badge copy and versioned artwork; no birth date, schedule, location or guardian data.';
comment on table public.badge_analytics_events is
  'Privacy-minimal badge lifecycle and share telemetry. share_handed_off means only that a supported client hand-off returned successfully, never that a provider published content.';
