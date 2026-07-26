alter table public.billing_collection_attempts
  drop constraint if exists billing_collection_attempts_completion_check,
  add constraint billing_collection_attempts_completion_check check (
    status not in ('paid', 'failed', 'expired', 'cancelled')
    or completed_at is not null
  );
