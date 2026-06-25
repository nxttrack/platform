# Payment Batches Foundation

Last updated: 2026-06-25

Status: MVP foundation implemented for tenant-admin preview, approval and safe prepared processing. Real provider execution remains disabled until Mollie/iDEAL or SEPA incasso is explicitly activated with real environment secrets.

## Product Rules

- Payment batches are billing operations only.
- A batch never changes stage, group, attendance, progress, badge or certificate state.
- Monthly and quarterly tuition use the linked subscription plan amount.
- Registration fee, extra activity, diploma-event fee, holiday course and manual correction batches use an explicit one-off amount in the batch form.
- SEPA direct debit runs through Mollie later. The current payment-batch processing path is intentionally stubbed.

## Data Model

Migration:

```txt
supabase/migrations/20260625191853_payment_batches_foundation.sql
```

Tables:

- `payment_batches`: tenant-scoped batch header with type, period, payment method, totals, approval metadata and status.
- `payment_batch_items`: tenant-scoped participant/enrollment preview lines with amount, status, warnings, blockers, snapshots and optional links to invoices/payments later.

Batch statuses:

```txt
draft
ready
approved
processing
completed
partially_failed
failed
cancelled
```

Item statuses:

```txt
pending
skipped
ready
processing
paid
failed
cancelled
```

Supported batch types:

- `monthly_tuition`
- `quarterly_tuition`
- `registration_fee`
- `extra_activity`
- `diploma_event_fee`
- `holiday_course`
- `manual_correction`

## Admin Flow

Tenant admin can:

1. Open Backoffice -> Betalingen.
2. Create a concept payment batch.
3. Choose batch type, payment method, period, due date, optional program filter and optional one-off amount.
4. Review preview lines with participant, program, subscription plan, amount, warnings and blockers.
5. Skip individual lines with a reason.
6. Approve a batch when at least one line is ready and no ready line has blockers.
7. Move an approved batch to prepared processing. This currently stores an internal processing snapshot only.

## Exceptions

Preview lines can contain warnings or blockers.

Warnings:

- missing guardian e-mail
- Mollie provider not active
- existing open invoice for the selected period
- subscription interval mismatch

Blockers:

- missing subscription plan
- inactive subscription plan
- zero subscription/manual amount
- missing manual amount
- missing SEPA mandate for SEPA batches
- currency mismatch

Warnings keep the line visible and approvable. Blockers mark the line as skipped until an admin fixes the source data or intentionally creates a different batch.

## Provider Boundary

The current execution path is safe by design:

- Manual batches: preview/approval only.
- SEPA batches: require valid mandate data before a line can be ready, but do not submit a provider call from payment batches yet.
- Mollie/iDEAL batches: warn when Mollie is not active and do not create live payments yet.
- External batches: preview and approval only.

When real provider execution is approved, the next step should create a separate, idempotent execution worker that can turn approved batch items into invoices, payment links, SEPA collection runs or payment records.

## Security And RLS

- Both batch tables have RLS enabled.
- Tenant staff/platform roles can manage tenant batch headers and items.
- Participants/guardians can only select batch items when existing enrollment access rules allow the related enrollment.
- Audit triggers record inserts, updates and deletes through the shared `audit_logs` mechanism.
- Totals are recomputed with a private trigger function in `app_private`.

## Secrets

No new secrets are required for preview, approval or stubbed processing.

Later live execution may require:

```txt
MOLLIE_API_KEY=placeholder_add_later
MOLLIE_WEBHOOK_SECRET=placeholder_add_later
MOLLIE_PROFILE_ID=placeholder_add_later
```

These placeholders already live in `.env.example` and `docs/REQUIRED_SECRETS.md`.

## Testing Plan

- Migration audit passes.
- RLS test suite passes.
- Typecheck and production build pass.
- Staging acceptance:
  - create monthly tuition batch
  - verify totals are calculated from active subscription plans
  - create one-off registration fee or activity batch with explicit amount
  - verify missing plan/amount/mandate exceptions
  - skip an item with a reason
  - approve a batch
  - run prepared processing and confirm no provider call is made
