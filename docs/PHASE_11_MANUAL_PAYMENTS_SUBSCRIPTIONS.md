# Phase 11 - Manual Payments And Subscriptions

Last updated: 2026-07-07

Status: implemented in code and migrations. Live staging migration, RLS/advisor checks and end-to-end manual billing validation are still pending.

## Goal

Make billing visible without Mollie/iDEAL, so the MVP has a commercial foundation while payment provider automation remains later scope.

## Implemented

- Phase 11 schema:
  - `payment_plans`
  - `subscriptions`
  - `manual_payments`
  - `billing_events`
- Notification type extension for:
  - `payment_due`
  - `payment_overdue`
  - `payment_received`
- Tenant admin route at `/admin/betalingen`.
- Admin can create payment plans with amount, currency, interval, billing day and payment terms.
- Admin can attach subscriptions to active enrollments.
- Admin can create manual payment rows.
- Admin can update manual payment status:
  - due
  - overdue
  - paid
  - waived
  - cancelled
- Billing events are recorded for subscription creation and payment status signals.
- Parent notifications are created for due, overdue and received payment signals.
- Parent route at `/portaal/betalingen`.
- Parent payment view shows subscriptions, open payments, overdue payments, paid payments and billing events.
- RLS policies for plans, subscriptions, manual payments and billing events.

## Canon Alignment

- Manual billing is visible, auditable and tenant-scoped.
- Parent access remains parent-mediated and participant-scoped.
- No service-role credentials or provider secrets are exposed to the browser.
- Billing tables are generic enough for later sports/sectors.
- Payment provider integration remains a future layer on top of subscriptions/manual payments.

## Explicit Non-Goals

- No Mollie/iDEAL checkout yet.
- No SEPA/direct debit.
- No invoice PDF generation.
- No automatic recurring billing job.
- No ledger/accounting export.
- No payment reminders by e-mail/SMS yet; notifications are in-app rows.
- No revenue analytics beyond the admin overview.

## Verification

Local verification expected before merging:

```txt
pnpm typecheck
pnpm auth:audit
pnpm db:audit
pnpm build
pnpm db:migrate
```

Staging verification required before marking Phase 11 fully complete:

- Apply Phase 3 through Phase 11 migrations to staging.
- Run Supabase advisors/security checks.
- As tenant admin, create a payment plan.
- Attach a subscription to an active enrollment.
- Create due, overdue and paid manual payment rows.
- Confirm billing events are created.
- Confirm linked parent sees only their own subscriptions/payments in `/portaal/betalingen`.
- Confirm unrelated parent cannot see another family billing data.
- Confirm tenant admin can update manual payment status.
- Confirm payment notifications appear for linked parents.
- Confirm no automatic provider flow is exposed.
