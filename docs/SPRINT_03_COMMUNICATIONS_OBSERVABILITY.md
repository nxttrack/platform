# Sprint 3 - Communications, Monitoring And Operations

Status: complete. Communications and operational monitoring are active and proven on staging. Invite,
password-reset and tenant-notification retry delivery were accepted by SendGrid through the real application
flows and received in the controlled external inbox.

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

Current evidence on 23 July 2026:

- [Production foundation run 30005553727](https://github.com/nxttrack/platform/actions/runs/30005553727)
  passes the provider-secret, sender, SPF, DMARC and DKIM checks without sending mail.
- [Communications audit 30005867738](https://github.com/nxttrack/platform/actions/runs/30005867738) proves the
  active database-backed SendGrid configuration, verified sender, four successful controlled platform tests in
  the last 30 days, SPF, DMARC, SendGrid DKIM public key, named incident/support owners, 30-day log retention and
  database-aware staging health. It is fail-closed on only the absent alert webhook and disabled schedule.
- [Operational probe 30005869686](https://github.com/nxttrack/platform/actions/runs/30005869686) passes all 16
  health, route, asset and read-only mail-window checks with zero failed, skipped or stuck deliveries in the
  current 15-minute window. No alert was sent.
- [Slack drill 30009018133](https://github.com/nxttrack/platform/actions/runs/30009018133) was accepted by the
  webhook and visibly received by Danny Goldenbelt in `nxttrack-alerts` at 14:56 Europe/Amsterdam.
- `MONITORING_ENABLED=true` was recorded for staging at 12:57:30 UTC.
- [Final communications audit 30009137492](https://github.com/nxttrack/platform/actions/runs/30009137492)
  passed every mail, DNS, ownership, retention, alert-destination, schedule and health control.
- [Post-activation probe 30009139430](https://github.com/nxttrack/platform/actions/runs/30009139430) passed all
  16 operational checks without sending another alert.
- [Controlled communications rehearsal 30009871228](https://github.com/nxttrack/platform/actions/runs/30009871228)
  passed on exact SHA `1f4e4a340040b1550bac05b68ff856fea5bf8a4f`. It used the real platform invitation,
  public password-reset and tenant-admin retry actions against one explicitly approved staging recipient.
  SendGrid accepted all three deliveries. The retry preserved the controlled failed attempt and created a
  separate successful attempt.
- [Post-rehearsal operational probe 30010019404](https://github.com/nxttrack/platform/actions/runs/30010019404)
  passed on the same SHA without sending an alert.
- [Post-rehearsal communications audit 30010021296](https://github.com/nxttrack/platform/actions/runs/30010021296)
  passed on the same SHA without sending mail.
- Danny Goldenbelt confirmed receipt of all three controlled messages on 23 July 2026. Provider acceptance and
  external inbox delivery are therefore both proven. Message-header capture remains a production-release
  evidence item, not an open Sprint 3 implementation task.

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
- [x] Configure SendGrid API in staging through platform-global settings.
- [x] Verify sender/domain ownership, SPF, DKIM and DMARC.
- [x] Deliver and record controlled operational test mail to an external inbox.
- [x] Deliver one invite and one password-reset message to a controlled account; provider acceptance is recorded.
- [x] Confirm external inbox receipt for the controlled invitation, reset and retry messages.
- [x] Prove provider-auth failure diagnostics and platform-test recovery without overwriting failed evidence.
- [x] Exercise the tenant-notification retry action once with a controlled recipient.
- [x] Prove the dormant operational monitor with a non-alerting 16-check staging probe.
- [x] Configure the Slack destination for health/5xx/database/asset/mail alerts.
- [x] Run a synthetic alert drill received by the named incident owner.
- [x] Record Danny Goldenbelt as incident/support owner and set log retention to 30 days.
- [x] Add an executable incident and recovery runbook; ownership fields remain to be filled through environment configuration.
- [x] Add a controlled-delivery, failure-diagnosis and retry runbook.

## Definition Of Done

- Controlled external delivery succeeds and failures are diagnosable.
- Synthetic failures create alerts received by the named owner.
- Support and incident ownership are explicit.
- Operations do not depend on repository archaeology.
