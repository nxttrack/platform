# Sprint 3 - Communications, Monitoring And Operations

Status: non-sending baseline recorded. Sprint acceptance depends on Sprint 2 ownership closure and real provider/operator configuration.

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

Baseline evidence: [GitHub Actions run 29870813800](https://github.com/nxttrack/platform/actions/runs/29870813800), executed on commit `b927197f3b8581e85b0dc747c8adbb004f97cb30` on 21 July 2026.

Passing controls:

- staging health and database probe;
- enforced read-only database transaction;
- platform email settings and delivery-attempt schema;
- singleton platform settings row;
- SPF and DMARC DNS policies;
- aggregate delivery diagnostics (zero attempts at baseline).

Blocking controls:

- transactional email is disabled;
- no verified sender address is configured;
- the selected provider is missing its required secret/connection fields;
- no DKIM selector is configured;
- no operator alert destination is configured;
- incident and support owners are unnamed;
- log retention is unspecified.

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

## Operational Monitor

`.github/workflows/operational-monitor.yml` provides a dormant-by-default 15-minute monitor plus two manual modes:

- `probe` runs all checks without sending alerts;
- `drill` sends one explicitly confirmed synthetic alert.

The schedule only becomes active when `MONITORING_ENABLED=true`. It checks database-aware health, sampled 5xx responses, static asset MIME and aggregate mail failures/skips/stuck attempts. Alert payloads contain operational metadata only. Activation and response are defined in [Operations And Incident Runbook](OPERATIONS_INCIDENT_RUNBOOK.md).

Probe evidence: [GitHub Actions run 29871127385](https://github.com/nxttrack/platform/actions/runs/29871127385), executed on commit `747e374f80bab70aa61cc4336bb489860cf0e7f4` on 21 July 2026. All 16 checks passed without alert delivery: live application/database health, commit metadata, four public routes, static asset status/MIME, read-only mail diagnostics, and zero failed, skipped or stuck attempts.

## Remaining Sprint Work

- [x] Run and record the non-sending baseline audit.
- [ ] Configure SendGrid API or SMTP in staging.
- [ ] Verify sender/domain ownership, SPF, DKIM and DMARC.
- [ ] Deliver invite, password-reset and operational test mail to a controlled external inbox.
- [ ] Prove bounce/failure diagnostics and retry behavior.
- [x] Prove the dormant operational monitor with a non-alerting 16-check staging probe.
- [ ] Configure health/5xx/database/asset/mail alert destinations.
- [ ] Run a synthetic alert drill received by the named incident owner.
- [ ] Record support ownership, escalation times and log retention.
- [x] Add an executable incident and recovery runbook; ownership fields remain to be filled through environment configuration.

## Definition Of Done

- Controlled external delivery succeeds and failures are diagnosable.
- Synthetic failures create alerts received by the named owner.
- Support and incident ownership are explicit.
- Operations do not depend on repository archaeology.
