-- Offer capabilities must never travel in URLs, access logs, referrers or
-- browser history. Verification uses an emailed short-lived code and promotes
-- it to a 15-minute HttpOnly session cookie.

alter table public.slot_offers
  alter column token_hash drop not null,
  add column if not exists verification_code_hash text,
  add column if not exists verification_attempts integer not null default 0,
  add column if not exists verified_session_hash text,
  add column if not exists verified_session_expires_at timestamptz;

alter table public.slot_offers
  add constraint slot_offers_verification_attempts_check
    check (verification_attempts between 0 and 5);

create unique index if not exists slot_offers_verified_session_hash_unique
  on public.slot_offers (verified_session_hash)
  where verified_session_hash is not null;

-- Invalidate every legacy URL bearer capability. Open offers must be reissued
-- so their recipient receives a verification code through the trusted channel.
update public.slot_offers
set
  status = case when status = 'sent' then 'revoked' else status end,
  token_hash = null,
  delivery_error = case
    when status = 'sent' then 'Legacy URL capability revoked; reissue offer with verification code.'
    else delivery_error
  end
where token_hash is not null;
