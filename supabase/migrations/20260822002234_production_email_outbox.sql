-- Production mail boundary: fail-closed transport state, durable enqueue, atomic
-- worker claims and explicit provider-acceptance semantics.

alter table public.email_delivery_attempts
  add column if not exists accepted_at timestamptz;

alter table public.auth_invitations
  add column if not exists provider_accepted_at timestamptz;

alter table public.tenant_notifications
  add column if not exists provider_accepted_at timestamptz;

alter table public.slot_offers
  add column if not exists provider_accepted_at timestamptz;

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  message_type text not null,
  idempotency_key text not null,
  payload_reference_type text,
  payload_reference_id uuid,
  payload jsonb not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  provider text,
  provider_message_id text,
  last_error_code text,
  last_error_message text,
  accepted_at timestamptz,
  dead_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_outbox_business_key_unique
    unique nulls not distinct (tenant_id, message_type, idempotency_key),
  constraint email_outbox_message_type_check
    check (message_type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  constraint email_outbox_idempotency_key_check
    check (length(idempotency_key) between 8 and 200),
  constraint email_outbox_payload_reference_check
    check (
      (payload_reference_type is null and payload_reference_id is null)
      or (payload_reference_type ~ '^[a-z][a-z0-9_.-]{1,79}$' and payload_reference_id is not null)
    ),
  constraint email_outbox_payload_object_check
    check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 65536),
  constraint email_outbox_status_check
    check (status in ('queued', 'processing', 'retry', 'accepted', 'dead', 'cancelled')),
  constraint email_outbox_attempts_check
    check (attempts >= 0 and attempts <= max_attempts),
  constraint email_outbox_max_attempts_check
    check (max_attempts between 1 and 10),
  constraint email_outbox_claim_state_check
    check (
      (status = 'processing' and claim_token is not null and claimed_at is not null and lease_expires_at is not null)
      or status <> 'processing'
    ),
  constraint email_outbox_provider_check
    check (provider is null or provider in ('sendgrid_api', 'smtp')),
  constraint email_outbox_error_bounds_check
    check (
      (last_error_code is null or length(last_error_code) <= 80)
      and (last_error_message is null or length(last_error_message) <= 1000)
    )
);

create index email_outbox_claim_idx
  on public.email_outbox (status, next_attempt_at, created_at)
  where status in ('queued', 'retry', 'processing');
create index email_outbox_tenant_status_idx
  on public.email_outbox (tenant_id, status, created_at desc);
create index email_outbox_reference_idx
  on public.email_outbox (payload_reference_type, payload_reference_id)
  where payload_reference_id is not null;

create table public.email_outbox_events (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.email_outbox (id) on delete restrict,
  tenant_id uuid references public.tenants (id) on delete cascade,
  event_type text not null,
  attempt_number integer not null,
  claim_token uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint email_outbox_events_type_check
    check (event_type in ('enqueued', 'claimed', 'lease_recovered', 'accepted', 'retry_scheduled', 'dead', 'cancelled')),
  constraint email_outbox_events_attempt_check check (attempt_number >= 0),
  constraint email_outbox_events_details_check
    check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096)
);

create index email_outbox_events_outbox_idx
  on public.email_outbox_events (outbox_id, created_at);
create index email_outbox_events_tenant_idx
  on public.email_outbox_events (tenant_id, created_at desc);

create trigger email_outbox_set_updated_at
  before update on public.email_outbox
  for each row execute function app_private.set_updated_at();

create function app_private.prevent_email_outbox_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'Email outbox events are append-only';
end;
$$;

create trigger email_outbox_events_append_only
  before update or delete on public.email_outbox_events
  for each row execute function app_private.prevent_email_outbox_event_mutation();

create function public.enqueue_email_outbox(
  target_tenant_id uuid,
  target_message_type text,
  target_idempotency_key text,
  target_payload jsonb,
  target_payload_reference_type text default null,
  target_payload_reference_id uuid default null,
  target_max_attempts integer default 5
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  outbox_id uuid;
  existing_payload jsonb;
  existing_payload_reference_type text;
  existing_payload_reference_id uuid;
  existing_max_attempts integer;
  inserted boolean := false;
begin
  if target_message_type is null or target_message_type !~ '^[a-z][a-z0-9_.-]{1,79}$' then
    raise exception 'Invalid email message type';
  end if;
  if target_idempotency_key is null or length(target_idempotency_key) not between 8 and 200 then
    raise exception 'Invalid email idempotency key';
  end if;
  if target_payload is null or jsonb_typeof(target_payload) <> 'object' or octet_length(target_payload::text) > 65536 then
    raise exception 'Invalid email outbox payload';
  end if;
  if target_max_attempts not between 1 and 10 then
    raise exception 'Invalid maximum attempts';
  end if;
  if (target_payload_reference_type is null) <> (target_payload_reference_id is null) then
    raise exception 'Incomplete email payload reference';
  end if;
  if target_payload_reference_type is not null
    and target_payload_reference_type !~ '^[a-z][a-z0-9_.-]{1,79}$'
  then
    raise exception 'Invalid email payload reference type';
  end if;
  if target_tenant_id is not null
    and not exists (select 1 from public.tenants tenant where tenant.id = target_tenant_id)
  then
    raise exception 'Email outbox tenant not found';
  end if;

  insert into public.email_outbox (
    tenant_id,
    message_type,
    idempotency_key,
    payload_reference_type,
    payload_reference_id,
    payload,
    max_attempts
  ) values (
    target_tenant_id,
    target_message_type,
    target_idempotency_key,
    target_payload_reference_type,
    target_payload_reference_id,
    target_payload,
    target_max_attempts
  )
  on conflict on constraint email_outbox_business_key_unique do nothing
  returning id into outbox_id;

  if outbox_id is not null then
    inserted := true;
  else
    select
      item.id,
      item.payload,
      item.payload_reference_type,
      item.payload_reference_id,
      item.max_attempts
    into
      outbox_id,
      existing_payload,
      existing_payload_reference_type,
      existing_payload_reference_id,
      existing_max_attempts
    from public.email_outbox item
    where item.tenant_id is not distinct from target_tenant_id
      and item.message_type = target_message_type
      and item.idempotency_key = target_idempotency_key;

    if outbox_id is null then
      raise exception 'Email outbox idempotency conflict could not be resolved';
    end if;
    if existing_payload <> target_payload
      or existing_payload_reference_type is distinct from target_payload_reference_type
      or existing_payload_reference_id is distinct from target_payload_reference_id
      or existing_max_attempts <> target_max_attempts
    then
      raise exception 'Email idempotency key reused with different input';
    end if;
  end if;

  if inserted then
    insert into public.email_outbox_events (
      outbox_id, tenant_id, event_type, attempt_number, details
    ) values (
      outbox_id,
      target_tenant_id,
      'enqueued',
      0,
      jsonb_build_object('messageType', target_message_type)
    );
  end if;

  return outbox_id;
end;
$$;

create function public.claim_email_outbox(
  target_limit integer default 25,
  target_lease_seconds integer default 300
)
returns table (
  outbox_id uuid,
  tenant_id uuid,
  message_type text,
  payload_reference_type text,
  payload_reference_id uuid,
  payload jsonb,
  attempt_number integer,
  claim_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  item record;
  next_claim_token uuid;
  next_attempt integer;
  next_lease_expires_at timestamptz;
begin
  if target_limit not between 1 and 100 then raise exception 'Invalid email claim limit'; end if;
  if target_lease_seconds not between 30 and 3600 then raise exception 'Invalid email claim lease'; end if;

  -- A worker can disappear during its final permitted attempt. Do not leave
  -- that lease stranded in processing forever: terminalize it before claiming
  -- more work, while holding each affected row lock in this statement.
  with exhausted as (
    update public.email_outbox candidate
    set status = 'dead',
        claim_token = null,
        claimed_at = null,
        lease_expires_at = null,
        last_error_code = 'lease_expired_attempts_exhausted',
        last_error_message = 'The final worker lease expired before completion.',
        dead_at = now()
    where candidate.status = 'processing'
      and candidate.lease_expires_at <= now()
      and candidate.attempts >= candidate.max_attempts
    returning candidate.id, candidate.tenant_id, candidate.attempts
  )
  insert into public.email_outbox_events (
    outbox_id, tenant_id, event_type, attempt_number, details
  )
  select
    exhausted.id,
    exhausted.tenant_id,
    'dead',
    exhausted.attempts,
    jsonb_build_object('errorCode', 'lease_expired_attempts_exhausted')
  from exhausted;

  for item in
    select candidate.*
    from public.email_outbox candidate
    where (
      candidate.status in ('queued', 'retry')
      and candidate.next_attempt_at <= now()
      and candidate.attempts < candidate.max_attempts
    ) or (
      candidate.status = 'processing'
      and candidate.lease_expires_at <= now()
      and candidate.attempts < candidate.max_attempts
    )
    order by candidate.next_attempt_at, candidate.created_at
    for update skip locked
    limit target_limit
  loop
    next_claim_token := gen_random_uuid();
    next_attempt := item.attempts + 1;
    next_lease_expires_at := now() + make_interval(secs => target_lease_seconds);

    update public.email_outbox
    set status = 'processing',
        attempts = next_attempt,
        claim_token = next_claim_token,
        claimed_at = now(),
        lease_expires_at = next_lease_expires_at
    where id = item.id;

    insert into public.email_outbox_events (
      outbox_id, tenant_id, event_type, attempt_number, claim_token, details
    ) values (
      item.id,
      item.tenant_id,
      case when item.status = 'processing' then 'lease_recovered' else 'claimed' end,
      next_attempt,
      next_claim_token,
      '{}'::jsonb
    );

    outbox_id := item.id;
    tenant_id := item.tenant_id;
    message_type := item.message_type;
    payload_reference_type := item.payload_reference_type;
    payload_reference_id := item.payload_reference_id;
    payload := item.payload;
    attempt_number := next_attempt;
    claim_token := next_claim_token;
    lease_expires_at := next_lease_expires_at;
    return next;
  end loop;
end;
$$;

create function public.complete_email_outbox(
  target_outbox_id uuid,
  target_claim_token uuid,
  target_outcome text,
  target_provider text default null,
  target_provider_message_id text default null,
  target_error_code text default null,
  target_error_message text default null,
  target_retry_delay_seconds integer default null
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  item public.email_outbox%rowtype;
  result_status text;
  retry_at timestamptz;
begin
  select * into item
  from public.email_outbox candidate
  where candidate.id = target_outbox_id
  for update;

  if item.id is null then raise exception 'Email outbox item not found'; end if;
  if item.claim_token is distinct from target_claim_token then raise exception 'Email outbox claim token mismatch'; end if;
  if item.status <> 'processing' then
    if item.status in ('accepted', 'retry', 'dead', 'cancelled') then return item.status; end if;
    raise exception 'Email outbox item is not processing';
  end if;
  if target_outcome not in ('accepted', 'retry', 'dead') then raise exception 'Invalid email completion outcome'; end if;
  if target_provider is not null and target_provider not in ('sendgrid_api', 'smtp') then raise exception 'Invalid email provider'; end if;

  if target_outcome = 'accepted' then
    if target_provider is null then raise exception 'Accepted email requires a provider'; end if;
    update public.email_outbox
    set status = 'accepted',
        provider = target_provider,
        provider_message_id = nullif(left(target_provider_message_id, 255), ''),
        last_error_code = null,
        last_error_message = null,
        accepted_at = now(),
        dead_at = null,
        next_attempt_at = now()
    where id = item.id;
    result_status := 'accepted';
  elsif target_outcome = 'retry' and item.attempts < item.max_attempts then
    if target_retry_delay_seconds is null or target_retry_delay_seconds not between 1 and 86400 then
      raise exception 'Retry outcome requires a bounded delay';
    end if;
    retry_at := now() + make_interval(secs => target_retry_delay_seconds);
    update public.email_outbox
    set status = 'retry',
        provider = target_provider,
        provider_message_id = nullif(left(target_provider_message_id, 255), ''),
        last_error_code = nullif(left(target_error_code, 80), ''),
        last_error_message = nullif(left(target_error_message, 1000), ''),
        next_attempt_at = retry_at,
        dead_at = null
    where id = item.id;
    result_status := 'retry';
  else
    update public.email_outbox
    set status = 'dead',
        provider = target_provider,
        provider_message_id = nullif(left(target_provider_message_id, 255), ''),
        last_error_code = coalesce(nullif(left(target_error_code, 80), ''), 'attempts_exhausted'),
        last_error_message = nullif(left(target_error_message, 1000), ''),
        dead_at = now()
    where id = item.id;
    result_status := 'dead';
  end if;

  insert into public.email_outbox_events (
    outbox_id, tenant_id, event_type, attempt_number, claim_token, details
  ) values (
    item.id,
    item.tenant_id,
    case result_status when 'accepted' then 'accepted' when 'retry' then 'retry_scheduled' else 'dead' end,
    item.attempts,
    target_claim_token,
    jsonb_strip_nulls(jsonb_build_object(
      'provider', target_provider,
      'errorCode', nullif(left(target_error_code, 80), ''),
      'nextAttemptAt', retry_at
    ))
  );

  return result_status;
end;
$$;

revoke all on table public.email_outbox from public, anon, authenticated;
revoke all on table public.email_outbox_events from public, anon, authenticated;
-- Explicit authenticated grants satisfy the repository's privilege inventory;
-- FORCE RLS plus the absence of policies still denies every row operation.
grant select on table public.email_outbox to authenticated;
grant select on table public.email_outbox_events to authenticated;
grant all on table public.email_outbox to service_role;
grant select, insert on table public.email_outbox_events to service_role;

alter table public.email_outbox enable row level security;
alter table public.email_outbox force row level security;
alter table public.email_outbox_events enable row level security;
alter table public.email_outbox_events force row level security;

create policy email_outbox_authenticated_deny
  on public.email_outbox
  for select
  to authenticated
  using (false);

create policy email_outbox_events_authenticated_deny
  on public.email_outbox_events
  for select
  to authenticated
  using (false);

revoke all on function app_private.prevent_email_outbox_event_mutation() from public, anon, authenticated;
revoke all on function public.enqueue_email_outbox(uuid, text, text, jsonb, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_email_outbox(integer, integer) from public, anon, authenticated;
revoke all on function public.complete_email_outbox(uuid, uuid, text, text, text, text, text, integer) from public, anon, authenticated;

grant execute on function app_private.prevent_email_outbox_event_mutation() to service_role;
grant execute on function public.enqueue_email_outbox(uuid, text, text, jsonb, text, uuid, integer) to service_role;
grant execute on function public.claim_email_outbox(integer, integer) to service_role;
grant execute on function public.complete_email_outbox(uuid, uuid, text, text, text, text, text, integer) to service_role;
