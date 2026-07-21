# Sprint 3 - Communications, Monitoring And Operations

Status: non-sending baseline recorded. Sprint acceptance depends on Sprint 2 ownership closure and real provider/operator configuration.

## Goal

Make account and operational communication deliverable, and make health/mail failures visible to named operators.

## Existing Product Foundation

- SendGrid API and SMTP transports are implemented.
- Platform-admin provider settings store encrypted secrets.
- Platform owners have a controlled test-mail action and platform-scoped delivery diagnostics.
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

Latest evidence: [GitHub Actions run 29871427347](https://github.com/nxttrack/platform/actions/runs/29871427347), executed on commit `c6a1dbe79bf58c6c8c0ca18289aa11b794dd2006`. It preserves all earlier passing controls and reports ten explicit blockers: the original eight plus no controlled test delivery in the previous 30 days and monitoring not yet enabled.

## Non-Sending Audit

Dispatch `.github/workflows/communications-foundation-audit.yml` from `main` with:

```txt
confirmation=AUDIT_COMMUNICATIONS_FOUNDATION
```

The audit checks:

- staging health and database connectivity;
- email settings and selected provider completeness without decrypting or printing secrets;
- delivery-attempt diagnostics availability and aggregate counts only;
- a successful controlled platform test in the previous 30 days;
- SPF, DMARC and the configured DKIM selector;
- alert destination, incident owner, support owner and log-retention policy.

## Operational Monitor

`.github/workflows/operational-monitor.yml` provides a dormant-by-default 15-minute monitor plus two manual modes:

- `probe` runs all checks without sending alerts;
- `drill` sends one explicitly confirmed synthetic alert.

The schedule only becomes active when `MONITORING_ENABLED=true`. It checks database-aware health, sampled 5xx responses, static asset MIME and aggregate mail failures/skips/stuck attempts. Alert payloads contain operational metadata only. Activation and response are defined in [Operations And Incident Runbook](OPERATIONS_INCIDENT_RUNBOOK.md).

Provider setup, controlled external delivery, failure diagnosis and manual retry are defined in [Communication Delivery Runbook](COMMUNICATION_DELIVERY_RUNBOOK.md).

Latest probe evidence: [GitHub Actions run 29872302160](https://github.com/nxttrack/platform/actions/runs/29872302160), executed after deploying commit `d496d176ea2d107cd63c1775260e30477102c25f` on 21 July 2026. All 16 checks passed without alert delivery: live application/database health, exact commit metadata, four public routes, static asset status/MIME, read-only mail diagnostics, and zero failed, skipped or stuck attempts.

Staging deployment evidence: [GitHub Actions run 29871694124](https://github.com/nxttrack/platform/actions/runs/29871694124). Release activation, health/runtime smoke, Phase 16 operational flow, Supabase Advisors, four-role RLS checks, 42 live browser checks and Priority A visual capture passed. The final strict gate stopped only on the two pre-existing, explicitly human Sprint 1 confirmations (`LOVABLE_VISUAL_CHECK_CONFIRMED` and `SUPABASE_BACKUPS_CONFIRMED`); it reported zero technical failures and two warnings.

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
- [x] Add a controlled-delivery, failure-diagnosis and retry runbook.

## Definition Of Done

- Controlled external delivery succeeds and failures are diagnosable.
- Synthetic failures create alerts received by the named owner.
- Support and incident ownership are explicit.
- Operations do not depend on repository archaeology.
