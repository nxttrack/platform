# Phase 20 - Billing Automation Boundary

Status: implemented in code and ready for staging validation.

Phase 20 prepares online payment automation without turning billing into the source of truth for learning progress, stage movement or lesson placement.

## Delivered

- Provider boundary data model:
  - `billing_provider_configs`
  - `payment_sessions`
  - `payment_provider_events`
- Invoice/export preparation data model:
  - `billing_invoices`
  - `billing_invoice_lines`
  - `billing_export_batches`
- Subscription lifecycle fields:
  - collection method
  - provider config reference
  - billing anchor
  - current period
  - lifecycle timestamps and reason
- Admin billing UI now supports:
  - provider configuration with secret references
  - lifecycle run for overdue payments
  - subscription lifecycle updates
  - payment session preparation
  - failed payment registration
  - invoice creation from manual payments
  - invoice export batch preparation
- Parent billing UI now shows:
  - subscription collection method
  - invoices
  - provider payment attempts
  - existing manual payment status and billing events
- Provider abstraction in `apps/web/lib/domain/payment-provider.ts` for:
  - payment session drafts
  - provider labels
  - webhook normalization

## Boundary Rules

- No Mollie/iDEAL API calls are made in this phase.
- Provider secrets are not stored in database rows.
- Provider config rows only store `secret_reference` and `webhook_secret_reference`.
- Manual billing remains intact and remains the MVP fallback path.
- Failed provider attempts do not automatically move a child, stage, group or enrollment.
- Subscription status changes do not alter program stage or swim progress.

## Lifecycle Behavior

- The admin lifecycle run marks past-due manual payments as overdue.
- Overdue transitions create billing events, parent notifications and admin follow-up tasks.
- Failed payment sessions create provider events, billing events and admin follow-up tasks.
- Invoice creation is explicit from a manual payment.
- Export batches prepare invoice export state but do not generate final accounting files yet.

## Staging Validation

Validate on staging after deployment:

- Add a manual provider config and confirm it appears in admin.
- Add a Mollie test config using secret references only, not raw secrets.
- Create a manual payment and prepare an invoice.
- Prepare a provider payment session for the manual payment.
- Mark the provider payment session failed and confirm a follow-up task is created.
- Run lifecycle on an overdue payment and confirm status, event, notification and task.
- Change a subscription to paused/cancelled/completed and confirm the enrollment/stage remains unchanged.
- Confirm parent sees invoice and payment session status in `/portaal/betalingen`.
- Confirm unrelated parents cannot see another family's invoices or sessions through RLS.
