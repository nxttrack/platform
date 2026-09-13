-- Idempotency is byte-exact. Restrict provider-effect keys to one canonical,
-- lowercase ASCII representation so whitespace/case/Unicode lookalikes cannot
-- deliberately bypass an existing durable key.
alter table public.email_outbox
  add constraint email_outbox_idempotency_key_canonical_check
  check (idempotency_key ~ '^[a-z0-9][a-z0-9:._@+\-]{7,199}$')
  not valid;

do $$
begin
  if not exists (
    select 1 from public.email_outbox
    where idempotency_key !~ '^[a-z0-9][a-z0-9:._@+\-]{7,199}$'
  ) then
    alter table public.email_outbox
      validate constraint email_outbox_idempotency_key_canonical_check;
  end if;
end;
$$;

create function app_private.prevent_noncanonical_email_outbox_key()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.idempotency_key !~ '^[a-z0-9][a-z0-9:._@+\-]{7,199}$' then
    raise exception 'Invalid canonical email idempotency key';
  end if;
  return new;
end;
$$;

create trigger email_outbox_canonical_idempotency_key
  before insert or update of idempotency_key on public.email_outbox
  for each row execute function app_private.prevent_noncanonical_email_outbox_key();

revoke all on function app_private.prevent_noncanonical_email_outbox_key()
  from public, anon, authenticated;
grant execute on function app_private.prevent_noncanonical_email_outbox_key()
  to service_role;
