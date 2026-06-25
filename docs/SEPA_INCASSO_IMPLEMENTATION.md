# SEPA Incasso Implementation

Last updated: 2026-06-25

Status: implemented foundation for SEPA direct debit through Mollie, with safe prepared mode for staging and live submission only when real Mollie environment secrets are configured.

## Product Rules

- SEPA incasso runs through Mollie first.
- Billing remains separate from stage/badje progression.
- A SEPA batch updates invoice/payment state only. It does not change subscriptions, stages, groups, or enrollments.
- Real secrets are never stored in the database. Provider settings store status, mode, capabilities and secret references only.
- Tenant admins can prepare batches before live Mollie submission is enabled.

## Data Model

Migration:

```txt
supabase/migrations/20260625184526_sepa_incasso_engine.sql
```

Tables:

- `sepa_collection_settings`: tenant-level SEPA mode, creditor copy, collection-day rules and consent text.
- `sepa_mandates`: Mollie customer/mandate references per enrollment.
- `sepa_collection_runs`: batch header for a requested collection date.
- `sepa_collection_items`: invoice-level direct debit items inside a batch.
- `sepa_incasso_events`: audit timeline for settings, mandates, batches, submissions and outcomes.

Existing payment tables extended:

- `invoices.collection_method` includes `sepa_direct_debit`.
- `payment_records.payment_method` includes `direct_debit`.
- `finance_export_requests.export_type` includes `sepa_collections`.

## Admin Flow

Tenant admin:

1. Configures Mollie provider status/capabilities.
2. Configures SEPA settings: mode, creditor text, notice days and collection day.
3. Adds or updates a mandate for an enrollment.
4. Creates a SEPA collection run.
5. Reviews queued items.
6. Submits/prepares the run.
7. Records outcomes manually or lets the Mollie webhook update linked payments.

Modes:

- `manual_review`: admin keeps the flow review-only.
- `prepare_only`: NXTTRACK creates internal pending payment records without calling Mollie.
- `submit_to_mollie`: NXTTRACK calls Mollie `/v2/payments` when `MOLLIE_API_KEY` is configured.

## Mollie Boundary

The adapter builds a Mollie `directdebit` payment payload with:

- amount
- description
- customer id
- mandate id
- sequence type
- webhook URL
- metadata linking tenant, invoice, SEPA run and SEPA item

Webhook route:

```txt
/api/mollie/payments/webhook
```

The webhook:

- verifies `MOLLIE_WEBHOOK_SECRET` when configured
- fetches the payment status from Mollie when `MOLLIE_API_KEY` is real
- falls back to posted status in prepared/test contexts
- updates `payment_records`
- updates `sepa_collection_items`
- writes `payment_events` and `sepa_incasso_events`
- recalculates the batch status

## Required Environment

Required for live Mollie submission:

```txt
APP_URL=https://staging.nxttrack.nl
NEXT_PUBLIC_APP_URL=https://staging.nxttrack.nl
MOLLIE_API_KEY=placeholder_add_later
MOLLIE_WEBHOOK_SECRET=placeholder_add_later
MOLLIE_PROFILE_ID=placeholder_add_later
```

Conditional:

```txt
SEPA_CREDITOR_ID=placeholder_add_later
```

## Security And RLS

- All SEPA tables have RLS enabled.
- Tenant staff can manage SEPA settings, mandates, runs, items and events.
- Parents/participants can only view SEPA mandates through existing enrollment access rules.
- Service role is only used for webhook/admin server-side operations.
- Audit triggers record important mutations.

## Operational Notes

- The current implementation does not create Mollie customers or first-payment mandates. A valid mandate must be supplied before recurring direct debit is queued.
- `prepare_only` is the default safe staging posture.
- `submit_to_mollie` must be tested with Mollie test credentials before production.
- Failed or cancelled collection items require a reason when recorded manually.
- Finance exports now support `sepa_collections`.

## Testing Plan

- Migration audit must pass.
- Typecheck/build must pass.
- Staging acceptance:
  - configure SEPA settings
  - add valid demo mandate
  - create collection run
  - submit in `prepare_only`
  - record paid/failed/cancelled outcome
  - download SEPA finance export
  - verify invoice status follows payment record status
  - verify webhook accepts a prepared/test status with configured secret
