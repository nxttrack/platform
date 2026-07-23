# Production incident and monitoring checklist

Status: prepared, deliberately not enabled before go-live.

## Approved initial monitoring values

| Variable | Value |
| --- | --- |
| `MONITOR_WINDOW_MINUTES` | `15` |
| `MONITOR_TIMEOUT_MS` | `15000` |
| `MAIL_FAILURE_THRESHOLD` | `0` |
| `MAIL_SKIPPED_THRESHOLD` | `0` |
| `EMAIL_DELIVERY_TIMEOUT_MS` | `15000` |

Threshold zero means any failed or skipped transactional delivery inside the window is actionable. Keep these values when production monitoring is activated after go-live unless an incident review approves a change.

## Go-live activation

The current scheduled `operational-monitor.yml` is staging-scoped. Do not silently repoint it. At go-live:

1. create/approve a production-scoped monitor job with its own concurrency group;
2. configure `ALERT_WEBHOOK_URL` as a production secret and identify `INCIDENT_OWNER` and `SUPPORT_OWNER`;
3. set the five values above in the production environment;
4. first run a no-alert probe, then an explicitly approved synthetic alert drill;
5. verify alert receipt, ownership and acknowledgement time;
6. only then enable the 15-minute schedule.

## Routine probe checklist

- Production health returns `ok=true`, `env=production`, exact deployed SHA and passing database check.
- Apex, admin and one wildcard tenant route answer within timeout with valid TLS.
- systemd service is active and restart count is stable.
- Caddy is active and has no repeating upstream/TLS errors.
- Database connection saturation, storage and Supabase service status are reviewed.
- Failed/skipped mail counts remain at zero; SendGrid rejections and 401/429/5xx responses are investigated immediately.
- Artifact retention and the last successful exact-SHA production evidence remain accessible.

## Incident opening checklist

1. Assign severity, incident commander, technical operator and communications owner.
2. Record UTC start, observed SHA, health response, affected tenants/users and last known-good time.
3. Freeze deploys and configuration changes unrelated to containment.
4. Capture `systemctl status nxttrack-production`, bounded journal excerpts, Caddy status/logs, Supabase status and recent delivery diagnostics without exposing secrets or message content.
5. Choose containment: runtime rollback, mail disablement, tenant isolation, maintenance/no-write state, or database recovery.
6. Update stakeholders on a fixed cadence and record every material action in UTC.

## Severity guidance

- P1: broad outage, cross-tenant exposure, destructive data event, authentication bypass or active secret compromise.
- P2: major workflow unavailable, sustained mail failure, one or more tenants blocked without data exposure.
- P3: degraded/non-critical behavior with a safe workaround.

For P1, prioritize containment and evidence preservation over feature recovery. Rotate compromised credentials, invalidate sessions where appropriate, and follow the database restore runbook only after the recovery point is approved.

## Closeout

- Exact recovered/deployed SHA and database recovery point are recorded.
- Health, routing, auth, tenant isolation, Storage and controlled mail checks pass.
- Monitoring is re-enabled and observed for at least 30 minutes.
- Customer/support communication is completed.
- Root cause, impact window, corrective actions, owners and due dates are documented.
