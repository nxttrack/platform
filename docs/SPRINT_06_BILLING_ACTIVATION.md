# Sprint 6 - Billing Activation

Status: active, staging-first. The checkout and webhook safety increment is implemented locally; a Mollie test
credential and controlled sandbox transaction are still required before tenant activation.

## Outcome

Optional online payment works without making billing the source of truth for enrollment, placement or learning
progress. Manual billing remains available at every stage.

## Increment A - Checkout And Webhook Safety

Delivered:

- one browser-rendered UUID v4 is reused across duplicate form submissions;
- the database permits only one unfinished provider attempt per manual payment and provider config;
- retries are accepted only when provider, payment, amount and currency match exactly;
- a paid or otherwise closed manual payment cannot start another checkout;
- test provider configs require a `test_` key and live configs require a `live_` key;
- active provider configuration validates the environment reference and same-origin HTTPS return URL;
- classic Mollie webhooks accept only bounded form-urlencoded input;
- provider metadata, exact decimal amount and currency are verified after retrieving the payment from Mollie;
- repeated provider and webhook-error events have deterministic database idempotency keys;
- only valid, unexpired HTTPS Mollie checkout links appear in the parent portal;
- failed, expired and cancelled attempts show distinct operational messages;
- unfinished `ideal` and `other` provider adapters cannot be activated accidentally;
- Node contract tests run in CI and the local hardening command.

Relevant migration:
`20260723153000_phase_27_billing_activation_hardening.sql`.

## Increment B - Staging Sandbox Evidence

Prerequisite:

- add a staging-only GitHub Environment secret such as `MOLLIE_API_KEY` containing a Mollie `test_...` key;
- do not add a live key and do not configure production yet.

Execution:

1. Deploy the exact Sprint 6 candidate to staging and apply all migrations.
2. Save an active Mollie `test` provider config with `ENV:MOLLIE_API_KEY`.
3. Create one open manual payment and start checkout from the admin screen.
4. Complete the Mollie hosted test checkout from the parent journey.
5. Confirm the webhook returns `200`, the session and manual payment are `paid`, and exactly one
   `payment_paid` billing event exists.
6. Submit the same classic webhook at least twice and confirm no second business effect appears.
7. Double-submit checkout creation and confirm only one unfinished provider attempt exists.
8. Exercise failed, cancelled and expired test states and confirm the parent/admin status plus fallback path.
9. Reconcile the provider payment ID, amount, currency and local records.
10. Retain the exact SHA, workflow logs and redacted database assertions as release evidence.

Mollie caches an idempotent request by `Idempotency-Key`, and classic payment webhooks contain a payment ID
that must be retrieved and verified through the API. Follow the
[Mollie idempotency contract](https://docs.mollie.com/reference/api-idempotency) and
[classic webhook contract](https://docs.mollie.com/reference/webhooks-new).

## Increment C - Financial Operations

Still required after the first sandbox pass:

- explicit refund creation, partial refund state and authorization;
- chargeback/dispute intake and operational tasking;
- reconciliation exceptions and repeatable export;
- retry policy for interrupted provider creation;
- invoice numbering/tax/accounting decisions;
- recurring/SEPA mandate lifecycle only after the commercial model is approved;
- controlled live transaction, refund and settlement evidence.

### Bounded recurring SEPA rehearsal

The staging-only `Staging Mollie incasso rehearsal` workflow proves the provider contract without activating
recurring collection for production tenants. It creates an isolated Mollie test customer and direct-debit
mandate, creates a €1.43 `sequenceType: recurring` payment without a customer checkout URL, moves the payment
to `paid` through Mollie's test-only `changePaymentState` page, and verifies the existing provider-verified
webhook path plus exactly-once local effects.

The workflow requires the literal confirmation `REHEARSE_MOLLIE_INCASSO_TEST`, an exact SHA already deployed
to staging, and a `test_` credential. Its artifact is redacted and deliberately excludes the test-state URL.
This rehearsal is evidence for the technical incasso path only. Customer consent capture, mandate lifecycle
storage, advance notice, retries, chargebacks, reconciliation and live activation remain separate release
work.

## Go/No-Go Boundary

No live key, production provider row, real charge or recurring mandate is authorized by this sprint document.
Production activation needs a separately approved exact SHA, sandbox evidence, finance ownership, refund and
reconciliation procedure, and a controlled live transaction.
