create or replace function app_private.enforce_billing_refund_reservation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_payment public.manual_payments%rowtype;
  v_reserved_cents bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text || ':' || new.manual_payment_id::text, 0));

  select *
  into v_payment
  from public.manual_payments
  where tenant_id = new.tenant_id
    and id = new.manual_payment_id
  for update;

  if not found or v_payment.status <> 'paid' then
    raise exception 'refund_payment_not_paid';
  end if;

  if v_payment.currency <> new.currency then
    raise exception 'refund_currency_mismatch';
  end if;

  select coalesce(sum(amount_cents), 0)
  into v_reserved_cents
  from public.billing_refunds
  where tenant_id = new.tenant_id
    and manual_payment_id = new.manual_payment_id
    and status not in ('failed', 'cancelled');

  if v_reserved_cents + new.amount_cents > v_payment.amount_cents then
    raise exception 'refund_amount_exceeds_remaining';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_billing_refund_reservation() from public;
revoke all on function app_private.enforce_billing_refund_reservation() from anon;
revoke all on function app_private.enforce_billing_refund_reservation() from authenticated;

create trigger billing_refunds_enforce_reservation
  before insert on public.billing_refunds
  for each row execute function app_private.enforce_billing_refund_reservation();
