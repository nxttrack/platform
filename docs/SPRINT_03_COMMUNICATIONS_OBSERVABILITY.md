# Sprint 3 - Communications, Monitoring And Operations

Status: non-sending preflight started. Sprint acceptance depends on Sprint 2 ownership closure and real provider/operator configuration.

## Goal

Make account and operational communication deliverable, and make health/mail failures visible to named operators.

## Existing Product Foundation

- SendGrid API and SMTP transports are implemented.
- Platform-admin provider settings store encrypted secrets.
- Transactional templates exist for invites, password resets, slot offers and notifications.
- Delivery attempts record sent, failed and skipped outcomes.
- Database-aware health and runtime/static-asset smoke checks exist.

## Baseline Gaps

The initial GitHub environment inventory found no staging or production variables/secrets for:

- SendGrid or SMTP;
- DKIM selector;
- alert destination;
- incident owner;
- support owner;
- log retention.

No message or alert is sent during preflight.

## Non-Sending Audit

Dispatch `.github/workflows/communications-foundation-audit.yml` from `main` with:

```txt
confirmation=AUDIT_COMMUNICATIONS_FOUNDATION
```

The audit checks:

- staging health and database connectivity;
- email settings and selected provider completeness without decrypting or printing secrets;
- delivery-attempt diagnostics availability and aggregate counts only;
- SPF, DMARC and the configured DKIM selector;
- alert destination, incident owner, support owner and log-retention policy.

## Remaining Sprint Work

- [ ] Run and record the non-sending baseline audit.
- [ ] Configure SendGrid API or SMTP in staging.
- [ ] Verify sender/domain ownership, SPF, DKIM and DMARC.
- [ ] Deliver invite, password-reset and operational test mail to a controlled external inbox.
- [ ] Prove bounce/failure diagnostics and retry behavior.
- [ ] Configure health/5xx/database/asset/mail alert destinations.
- [ ] Run a synthetic alert drill received by the named incident owner.
- [ ] Record support ownership, escalation times and log retention.
- [ ] Complete incident and recovery runbooks.

## Definition Of Done

- Controlled external delivery succeeds and failures are diagnosable.
- Synthetic failures create alerts received by the named owner.
- Support and incident ownership are explicit.
- Operations do not depend on repository archaeology.
