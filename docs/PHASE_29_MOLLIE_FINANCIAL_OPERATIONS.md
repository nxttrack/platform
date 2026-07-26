# Phase 29 - Mollie Financial Operations

Status: implemented and provider-validated on staging. Production automation remains disabled by default.

## Outcome

NXTTRACK now has an auditable financial-operations layer around Mollie recurring payments. Payment,
refund and chargeback state comes from provider-verified API reads; billing never changes enrollment,
placement or learning progress.

## Delivered

- Atomic refund reservations with a per-payment database lock and remaining-amount enforcement.
- Explicit partial/full refund action with UUID idempotency and typed `REFUND` confirmation.
- Safe handling of indeterminate POST outcomes: never create a new request before reconciliation.
- Refund status synchronization for queued, pending, processing, refunded, failed and cancelled states.
- Chargeback intake, reversal state, urgent tenant task, guardian notification and exactly-once events.
- Provider-managed refund/chargeback states cannot be overwritten by the manual status form.
- Parent and tenant-admin ledgers show returned and charged-back amounts separately.
- Automated collection processor shared by the admin action and the scheduler.
- Scheduler authentication through `BILLING_AUTOMATION_SECRET`, constant-time comparison and a 25-item run cap.
- Independent tenant gates for recurring collection, automatic execution and automatic retries.
- Failed direct debit retries receive a fresh pre-notification and respect the longest configured delay.
- Unknown collection/refund outcomes and new chargebacks are included in the read-only operational monitor.

Relevant migrations:

- `20260723220000_phase_29_refunds_chargebacks_dunning.sql`
- `20260723221000_phase_29_refund_reservation.sql`
- `20260723221500_phase_29_refund_reservation_resync.sql`

## Safety Boundary

Automatic collection runs only when all of these are true:

1. the provider config is active Mollie;
2. recurring collection is explicitly enabled for the tenant;
3. automatic collection is independently enabled;
4. pre-notification delivery is `sent`;
5. the collection date has arrived;
6. the payment, customer and mandate are still eligible;
7. the secured environment scheduler supplies the matching secret.

Production receives no implicit activation from deployment. Its tenant flags remain false until separate
finance approval and a controlled live rehearsal.

## Staging Evidence

The application release `b7bf813a217b9e163ceb862bb15c066ed6eafdd5` passed the complete staging
deployment and browser-validation run `30048744283`. Its retained artifacts contain 56 screenshots and
`release-evidence.json`.

Provider rehearsals:

- Run `30049435689`: secured scheduler created one €1.43 recurring SEPA test payment. Two webhook calls
  resulted in exactly one paid session, provider event and billing event.
- Run `30052580245`: a €1.43 recurring SEPA test payment reached provider state `failed`. Two webhook calls
  resulted in one failure event and exactly one second attempt with one delivered pre-notification,
  scheduled 48 hours later. The temporary retry policy and subscription provider binding were restored.
- Run `30049842167`: Mollie accepted one €0.43 partial refund and returned the same refund ID for the
  idempotency replay. Provider and local state both remained `pending`; two webhook calls resulted in one
  provider event and no premature refund booking.
- Run `30049949323`: Mollie created one €1.43 test chargeback. Two webhook calls resulted in one local
  chargeback, one provider event, one billing event and one urgent follow-up task.

The refund harness was corrected in commit `bbc2211e4fa3f018dd141edfeb3d3e9651ccb12c`
after run `30049556392` demonstrated that Mollie can legitimately keep an accepted API refund pending.
NXTTRACK records completion only when provider state becomes `refunded`.

All workflows require a full SHA already deployed to staging, a Mollie `test_` key and an explicit literal
confirmation. Their artifacts contain redacted evidence and no API credentials or hosted test-state URLs.

## Live Follow-up

- Finance owner approves retry terms, customer copy, refund authority and chargeback handling.
- Run one controlled low-value live payment and refund using an approved exact SHA.
- Verify Mollie balance/settlement reconciliation read-only. Mollie business-operations APIs do not support
  test mode, so this cannot be proven in the sandbox.
- Export/accounting decisions still need final invoice numbering, VAT rules and bookkeeping mapping.
