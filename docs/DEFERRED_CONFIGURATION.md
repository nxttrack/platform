# Deferred Configuration Register

Status: intentionally deferred by the product owner on 22 July 2026. Revisit after all planned implementation phases are complete and before final launch acceptance.

## Monitoring And Communications

Do not enable scheduled monitoring or send a synthetic alert yet. Preserve the following staging defaults:

| Setting | Deferred value/state |
| --- | --- |
| `EMAIL_DELIVERY_TIMEOUT_MS` | `15000` |
| `MONITOR_TIMEOUT_MS` | `15000` |
| `MONITOR_WINDOW_MINUTES` | `15` |
| `MAIL_FAILURE_THRESHOLD` | `0` |
| `MAIL_SKIPPED_THRESHOLD` | `0` |
| `MONITORING_ENABLED` | remain unset/false |

Final configuration still requires:

- transactional mail provider and verified sender;
- DKIM selector and controlled external delivery evidence;
- independent alert webhook and its `generic`, `slack`, `teams` or `discord` format;
- named incident and support owners;
- explicit log-retention policy;
- successful manual operational probe;
- one explicitly confirmed synthetic alert received by the incident owner;
- only then: `MONITORING_ENABLED=true`.

Canonical activation procedures are [Communication Delivery Runbook](COMMUNICATION_DELIVERY_RUNBOOK.md) and [Operations And Incident Runbook](OPERATIONS_INCIDENT_RUNBOOK.md).
