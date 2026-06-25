# NXTTRACK Registration Fee Payment Plan

Last updated: 2026-06-25

Status: planning only. This document defines the architecture for optional registration fee payment in the dynamic intake and waitlist flow. It does not implement migrations, Mollie activation, or production payment logic yet.

## 1. Goal

NXTTRACK must support optional `inschrijfgeld` / registration fee payment per tenant and program. The flow must be part of the normal intake, waitlist, placement, and payment lifecycle, not a separate hardcoded payment path.

The fee is a billing concept only. It must not change stage, group, subscription, or billing plan by itself.

## 2. Current State

### Dynamic Intake

- Public intake already resolves tenant, program, intake type, intake configuration, preferred days/time windows, parent/guardian data, child data, and custom answers.
- `intake_submissions` store status and recommendation metadata, but do not currently store payment status.
- Intake submission creates status events and can queue an `intake_submitted` message.
- Duplicate detection and smart intake recommendation are already prepared in the intake action layer.

### Program And Public Settings

- `program_public_settings` already controls public program visibility and options such as trial, registration, and waitlist.
- Program public copy and intake settings are manageable in tenant admin.
- There is no program-level registration fee policy yet.

### Waitlist And Placement

- `waitlist_entries` are created from intakes and move through statuses such as queued, matched, offered, placed, declined, rejected, and cancelled.
- Placement suggestions and slot offers already exist.
- Slot offer acceptance creates enrollment and group membership.
- Waitlist and placement currently do not block on registration fee payment.

### Billing And Payments

- `invoices`, `payment_records`, `payment_events`, refunds, numbering rules, finance exports, and provider configs exist.
- Existing invoices and payment records are enrollment-bound. `invoices.enrollment_id` and `payment_records.enrollment_id` are required.
- Parent payment visibility currently depends on enrollment access. That is correct for subscriptions and invoices, but not enough for pre-enrollment registration fees.
- Mollie/iDEAL is prepared as an adapter direction, but live Mollie checkout is not active yet. Manual payment is the current safe operational baseline.

### Communication

- Message templates, dispatch tracking, retry/failure states, and event hooks exist.
- Registration fee-specific messages are not yet defined.

## 3. Recommended Flow

Registration fee behavior should be a tenant/program decision. NXTTRACK should support both common flows:

- Flow A: parent pays immediately after intake, then the waitlist entry becomes active.
- Flow B: intake creates a pending payment state, parent receives a payment link, and the waitlist entry becomes active after payment.

The safest first implementation is Flow B, because it fits asynchronous Mollie webhooks, lets admins recover failed payments, keeps the intake record even when payment is abandoned, and avoids losing duplicate/review context.

### Recommended Modes

Per program:

- `disabled`: no registration fee.
- `required_before_waitlist`: intake creates a payment obligation; waitlist entry is pending/inactive until paid or waived.
- `required_before_placement`: waitlist entry can be active, but placement suggestion approval or slot offer sending is blocked until paid or waived.
- `manual_review`: admin decides whether to send, waive, or mark the fee as paid.

### Preferred Flow B

1. Parent opens the tenant program page and sees that registration fee is required.
2. Parent submits the configured intake form.
3. NXTTRACK creates the `intake_submission`.
4. NXTTRACK creates or links a registration fee payment obligation.
5. If the program requires payment before waitlist, the waitlist entry is created as pending payment or the intake stays in `payment_pending`.
6. Parent receives a payment link by confirmation page and message.
7. Mollie webhook or manual admin action marks the payment as paid, failed, expired, waived, or refunded.
8. If paid/waived and the policy is `required_before_waitlist`, the waitlist entry becomes active.
9. If paid/waived and the policy is `required_before_placement`, the placement assistant can approve a suggestion or send a slot offer.
10. Every payment lifecycle transition writes payment event and audit data.

### Flow A Constraint

Immediate redirect to iDEAL may be added later, but only after records are created first. The platform should never rely on "pay first, create intake later", because that makes webhook reconciliation, duplicate detection, and support recovery fragile.

## 4. Data Model Proposal

Do not force registration fees into the current enrollment-bound invoice model as the first step. Add a pre-enrollment one-off payment concept and reconcile it later when needed.

### Program Registration Fee Settings

Recommended table: `program_registration_fee_settings`

Core fields:

- `id`
- `tenant_id`
- `program_id`
- `enabled`
- `amount_cents`
- `currency`
- `required_before_waitlist`
- `required_before_placement`
- `due_days`
- `reminder_after_days`
- `provider_preference` such as manual, mollie, tenant_default
- `status`
- `metadata`
- timestamps

Constraints:

- `amount_cents >= 0`
- only one active settings row per tenant/program
- if `enabled = false`, amount can be zero

### One-Off Payment / Payment Obligation

Recommended table: `one_off_payments` or `payment_obligations`

Core fields:

- `id`
- `tenant_id`
- `program_id`
- `intake_submission_id`
- `waitlist_entry_id`
- `participant_id` nullable until participant exists
- `enrollment_id` nullable until enrollment exists
- `payment_purpose` = `registration_fee`
- `amount_cents`
- `currency`
- `status` = not_required, pending, link_created, paid, failed, expired, waived, refunded, cancelled
- `provider` = manual, mollie, external
- `payment_method` = manual_bank_transfer, ideal, mollie, external
- `provider_payment_id`
- `provider_checkout_url`
- `provider_status`
- `due_at`
- `expires_at`
- `paid_at`
- `failed_at`
- `failure_reason`
- `waived_by`
- `waived_at`
- `waiver_reason`
- `metadata`
- timestamps

Idempotency:

- Unique active registration fee per `tenant_id + intake_submission_id + payment_purpose`.
- Mollie `provider_payment_id` must be unique per provider.
- Webhooks must be idempotent.

### Payment Events

Two safe options:

- Preferred first: add `one_off_payment_events` to avoid disturbing existing invoice/payment triggers.
- Later consolidation: extend `payment_events` with nullable `one_off_payment_id` after RLS and reporting are adjusted.

Event types:

- `created`
- `payment_link_created`
- `message_sent`
- `paid`
- `failed`
- `expired`
- `reminder_sent`
- `waived`
- `refunded`
- `cancelled`
- `reconciled_to_invoice`

### Intake Submission Fields

Add denormalized fields for admin/read model performance:

- `registration_fee_required`
- `registration_fee_payment_status`
- `registration_fee_payment_id`

These should mirror the payment obligation, not become the source of truth.

### Waitlist Entry Fields

Add denormalized fields:

- `payment_status`
- `registration_fee_payment_id`
- optional status extension: `pending_payment`

If the existing waitlist status enum/check constraint is extended, keep existing statuses intact. Do not replace `queued`; use `pending_payment` only for entries that should not be ranked yet.

### Relationship To Invoices

Registration fee can later be represented in finance exports or invoices, but the pre-enrollment source of truth should be the one-off payment. After placement/enrollment, NXTTRACK may:

- keep the fee as a separate paid one-off payment, or
- reconcile it to an invoice line for accounting, if tenant policy requires invoices for registration fees.

## 5. Admin UX

### Program Settings

Tenant admin should configure:

- registration fee on/off
- amount and currency
- whether payment is required before waitlist or before placement
- due days and reminder timing
- payment provider mode: manual now, Mollie/iDEAL when enabled
- parent-facing explanation text

### Intake Review

Admin should see:

- registration fee required
- amount
- current payment status
- payment due/expiry date
- duplicate warning next to payment state
- whether the intake can be converted to waitlist
- whether placement is blocked

Actions:

- create/resend payment link
- mark paid manually, with reason
- waive fee, with mandatory reason
- cancel payment obligation
- open payment events/audit

### Waitlist And Placement

Waitlist rows should show:

- payment status
- pending since date
- not paid after X days
- blocked placement signal

Placement assistant should block or warn:

- `required_before_placement` and unpaid: no slot offer until paid/waived.
- `required_before_waitlist` and unpaid: candidate should not be ranked as active.

## 6. Parent UX

Parent-facing copy should be clear and human:

- what the registration fee is
- why it is required
- amount and currency
- whether it activates the waitlist position or is needed before placement
- how long the link is valid
- what happens after payment

Parent pages/states:

- intake form shows fee summary before submit
- submitted state with "Betaal inschrijfgeld" call-to-action when Mollie/iDEAL is active
- manual payment fallback text when online payment is not active
- payment pending state
- payment confirmed state
- payment failed/expired state with retry instructions
- waitlist active confirmation after payment

No internal score, rule, webhook, or reconciliation language should be shown to parents.

## 7. Mollie / Payment Requirements

Mollie is needed for iDEAL and later SEPA/incasso. The current adapter is prepared but intentionally not live. Registration fee payment should start with manual/admin-safe handling and then activate Mollie once the one-off payment lifecycle is stable.

Required placeholders already exist in `.env.example`:

```txt
MOLLIE_API_KEY=placeholder_add_later
MOLLIE_WEBHOOK_SECRET=placeholder_add_later
MOLLIE_PROFILE_ID=placeholder_add_later
```

Rules:

- Never expose Mollie secrets through `NEXT_PUBLIC_`.
- Webhooks must be handled server-side and verified.
- Store provider payment id and provider status.
- Return URL should take the parent to a safe status page, not directly mark the fee paid.
- Only a verified provider webhook or trusted admin action may mark paid.
- Support Mollie test/live separation through provider config and deployment secrets.
- Do not activate Mollie/iDEAL until manual flow and webhook recovery are tested.

## 8. Email And Notification Requirements

New message/event templates:

- `registration-fee-required`
- `registration-fee-payment-link`
- `registration-fee-reminder`
- `registration-fee-paid`
- `registration-fee-failed`
- `registration-fee-expired`
- `registration-fee-waived`
- `waitlist-activated-after-payment`

Template variables:

- tenant name
- program name
- participant/child name
- guardian name
- amount and currency
- due date
- payment link
- waitlist status
- support contact

The confirmation message should be queued from the intake flow. Reminders should be scheduled from the payment obligation due/expiry data.

## 9. RLS And Security Notes

- Public intake submission may create a payment obligation, but must not be able to mark it paid.
- Payment checkout URLs should be generated server-side only.
- Until parent account provisioning exists, parent access to pre-enrollment payment status should use short-lived/tokenized public links or email magic context, not enrollment-based RLS.
- Tenant admins can view/manage only payments for their tenant.
- Platform admins can inspect cross-tenant payment health only through platform-scoped support/admin policies.
- Waive, manual paid, cancel, resend, and refund actions require audit logs.
- Override/waiver actions require a reason.
- Duplicate or abandoned payment attempts must not create duplicate active waitlist entries.
- Webhooks must be idempotent and must validate tenant/payment ownership before updates.

## 10. Implementation Tasks

1. Add program registration fee settings migration.
2. Add one-off payment/payment obligation migration with RLS.
3. Add one-off payment events or extend payment events safely.
4. Add denormalized registration fee status fields to intake submissions and waitlist entries.
5. Add tenant admin program settings UI for fee policy.
6. Update public program/detail/intake pages to show fee amount and policy.
7. Update intake submit action to create payment obligation when required.
8. Add manual payment admin actions: mark paid, waive, cancel, resend payment request.
9. Gate waitlist activation and placement approval according to policy.
10. Add parent payment status page/state.
11. Add registration fee message templates and event hooks.
12. Add Mollie one-off payment adapter after manual lifecycle is stable.
13. Add webhook handler and return/status handling.
14. Add reporting and finance export mapping.
15. Add audit log entries for every payment lifecycle action.

## 11. Testing Plan

### Unit / Data Tests

- Program with fee disabled creates normal intake/waitlist.
- Fee required before waitlist creates pending payment and does not rank active waitlist.
- Fee required before placement allows waitlist but blocks slot offer until paid/waived.
- Duplicate submit does not create duplicate payment obligations.
- Manual paid/waived transitions are audited and require reason where appropriate.
- Webhook replay is idempotent.

### RLS Tests

- Tenant admin A cannot see tenant B payment obligations.
- Parent/guardian cannot see unrelated payment status.
- Public token can only view the intended payment status.
- Public token cannot mutate payment status.

### E2E Smoke Tests

- Public intake with no fee.
- Public intake with fee required before waitlist.
- Admin marks fee paid and waitlist becomes active.
- Admin waives fee with reason and placement unlocks.
- Payment pending blocks placement where configured.
- Mollie test checkout flow when provider is activated later.

### Operational Tests

- Failed payment produces admin-visible status and retry action.
- Expired link releases or keeps waitlist state according to tenant policy.
- Reminder message is queued at the right time.
- Finance report distinguishes registration fee from subscription invoices.

## 12. Open Product Questions

- Should registration fee be refundable when an intake is rejected or duplicate?
- Should tenants be allowed to waive per family, per sibling, or per campaign?
- Should fee amount include VAT and invoice numbering immediately, or start as one-off payment receipt first?
- Should payment before waitlist be the default for all swim-school tenants, or only a configurable option?
- Should pending-payment waitlist entries preserve priority date from intake submission or from payment date?
- Should manual bank transfer be allowed as a parent-facing option, or admin-only for now?
