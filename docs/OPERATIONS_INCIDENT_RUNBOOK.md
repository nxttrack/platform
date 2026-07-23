# Operations And Incident Runbook

Status: active on staging. Danny Goldenbelt is the named incident/support owner, log retention is 30 days and
the 15-minute schedule was enabled only after a Slack drill was received.

## Configuration Contract

The staging GitHub environment owns the operational configuration:

| Setting | Kind | Purpose |
| --- | --- | --- |
| `MONITORING_ENABLED` | variable | Set to `true` only after the alert drill is received |
| `ALERT_WEBHOOK_URL` | secret | Independent operator destination; do not use the monitored mail path |
| `ALERT_WEBHOOK_FORMAT` | variable | `generic`, `slack`, `teams` or `discord` |
| `INCIDENT_OWNER` | variable | Named primary incident owner |
| `SUPPORT_OWNER` | variable | Named user-support owner |
| `LOG_RETENTION_DAYS` | variable | Agreed retention, at least 7 days |
| `MONITOR_WINDOW_MINUTES` | variable | Delivery failure lookback; default 15 |
| `MAIL_FAILURE_THRESHOLD` | variable | Allowed failed attempts in the window; default 0 |
| `MAIL_SKIPPED_THRESHOLD` | variable | Allowed skipped attempts in the window; default 0 |

The scheduled monitor checks database-aware health, public-route 5xx responses, static asset status/MIME and aggregate failed, skipped or stuck mail attempts. It never reads recipient addresses or message bodies.
Alert payloads include the named incident/support owners, environment, commit SHA, failed check identifiers and
the Actions run URL, but no recipient addresses, message bodies or credentials.

Activation evidence on 23 July 2026:

- [Slack drill 30009018133](https://github.com/nxttrack/platform/actions/runs/30009018133) was accepted and
  received in `nxttrack-alerts` by Danny Goldenbelt at 14:56 Europe/Amsterdam.
- `MONITORING_ENABLED=true` was set at 12:57:30 UTC.
- [Communications audit 30009137492](https://github.com/nxttrack/platform/actions/runs/30009137492) passed all
  foundation checks.
- [Post-activation probe 30009139430](https://github.com/nxttrack/platform/actions/runs/30009139430) passed all
  16 checks without sending another alert.

## Activation And Drill

1. Configure the independent webhook and its format in the staging environment.
2. Name `INCIDENT_OWNER` and `SUPPORT_OWNER`; set `LOG_RETENTION_DAYS`.
3. Dispatch `Operational monitor` from `main` in `probe` mode with `RUN_OPERATIONAL_PROBE`.
4. Resolve every failed probe before continuing.
5. Dispatch it in `drill` mode with `SEND_SYNTHETIC_ALERT`.
6. Record who received the alert, its timestamp and the Actions run URL.
7. Only then set `MONITORING_ENABLED=true`; the monitor runs every 15 minutes.

## Triage

1. The incident owner acknowledges the alert and opens its GitHub Actions run URL.
2. Classify impact: P0 is cross-tenant confidentiality/integrity or total outage; P1 blocks a critical account/operational journey; P2 is degraded or isolated.
3. Confirm `https://staging.nxttrack.nl/api/health`, including `checks.database.status` and `commitSha`.
4. Check the failed monitor IDs: `health-*`, `route-*`, `asset-*` or `mail-*` identify the subsystem without exposing user data.
5. On the host, inspect `systemctl status nxttrack-staging`, `journalctl -u nxttrack-staging` and Caddy status/logs within the agreed retention window.
6. For mail, inspect aggregate delivery diagnostics and the relevant authorized admin screen; never paste credentials, recipient addresses or message content into an incident ticket.

## Containment And Recovery

- P0: stop affected writes or isolate the release, notify the release authority and follow the rollback procedure immediately.
- Release regression: use the canonical staging rollback rehearsal/runbook and verify the restored commit through `/api/health`.
- Database failure: do not apply ad-hoc migrations; establish provider health and migration state first.
- Asset MIME failure: verify standalone asset packaging and Caddy routing before restarting services.
- Mail failure: disable transactional delivery if repeated attempts could spam recipients; repair provider/sender configuration and use one controlled test.

Recovery requires a green manual `probe`, a passing database-aware health response, and confirmation that the original user-facing journey works. Record cause, impact window, actions, owner and follow-up. A green probe proves technical recovery; the named incident owner closes the incident.
