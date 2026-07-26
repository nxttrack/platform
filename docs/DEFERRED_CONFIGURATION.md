# Deferred Configuration Register

Status: staging and production configuration activated and proven on 23 July 2026.

## Monitoring And Communications

The previously deferred staging settings were activated after provider, ownership and alert-receipt evidence
passed:

| Setting | Deferred value/state |
| --- | --- |
| `EMAIL_DELIVERY_TIMEOUT_MS` | `15000` |
| `MONITOR_TIMEOUT_MS` | `15000` |
| `MONITOR_WINDOW_MINUTES` | `15` |
| `MAIL_FAILURE_THRESHOLD` | `0` |
| `MAIL_SKIPPED_THRESHOLD` | `0` |
| `MONITORING_ENABLED` | `true` on staging and production |

Completed staging evidence:

- database-backed SendGrid provider, verified sender, SPF, DKIM and DMARC;
- controlled platform test plus invitation, password-reset and retry deliveries received externally;
- Slack alert webhook and `slack` payload format;
- Danny Goldenbelt as incident and support owner;
- 30-day log-retention policy;
- successful manual operational probes;
- synthetic alert received in `nxttrack-alerts`;
- scheduled monitoring enabled on staging.

Production repeated the activation order with production-scoped settings. Slack drill `30018850003` was
received, database-backed SendGrid delivery was confirmed, monitoring was enabled at approximately
15:14 UTC and post-activation probe `30019582728` passed.

Canonical activation procedures are [Communication Delivery Runbook](COMMUNICATION_DELIVERY_RUNBOOK.md) and [Operations And Incident Runbook](OPERATIONS_INCIDENT_RUNBOOK.md).
