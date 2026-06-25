# Production Observability

This document defines the NXTTRACK staging/production observability contract.

## Runtime Signals

- Liveness: `GET /api/health`
- Readiness: `GET /api/health/ready`
- Platform admin visibility: `/platform/settings`

Both health endpoints return:

- `ok`
- `status`
- `commit`
- `version`
- `environment`
- `deploymentTarget`
- `builtAt`
- `release`
- `observability`
- `checks`
- `timestamp`

`/api/health` confirms the process is alive. `/api/health/ready` confirms critical runtime dependencies are configured and should be used by external uptime monitors.

## Structured Logs

Application logs are structured JSON through:

```txt
apps/web/lib/observability/logger.ts
```

Configure an external sink with:

```txt
OBSERVABILITY_LOG_SINK_URL=
OBSERVABILITY_LOG_SINK_TOKEN=
OBSERVABILITY_LOG_SINK_PROVIDER=generic_http
```

The sink receives HTTP `POST` payloads with `event_type=structured_log`. The bearer token is sent only as an HTTP authorization header and is never included in health responses or admin UI.

## Error Reporting

Server errors should go through:

```txt
apps/web/lib/observability/error-reporting.ts
```

Configure external reporting with:

```txt
ERROR_REPORTING_URL=
ERROR_REPORTING_TOKEN=
ERROR_REPORTING_PROVIDER=generic_http
```

The reporter sends HTTP `POST` payloads with `event_type=server_error`, release metadata, normalized error information and contextual fields.

## Release Metadata

The deploy workflow writes runtime release env vars and records release history in Supabase:

```txt
deployment_releases
```

The runner records:

- activated release after `systemctl restart` and Caddy reload
- verified release after `/api/health` checks pass

Platform admins can see current runtime metadata and recent release records at:

```txt
/platform/settings
```

## External Uptime Monitor

Recommended checks:

```txt
https://staging.nxttrack.nl/api/health
https://staging.nxttrack.nl/api/health/ready
https://aquaswim-demo.staging.nxttrack.nl/api/health
https://aquaswim-demo.staging.nxttrack.nl/api/health/ready
```

Set `UPTIME_MONITOR_URL` to show the configured monitor host in platform admin.

Alert on:

- HTTP 5xx
- `/api/health/ready` returning `ok=false`
- commit mismatch after deploy
- missing Supabase/database readiness
- repeated error reports from the same commit

## Staging Acceptance

Before product-owner acceptance:

```txt
pnpm run release:gate
pnpm run smoke:staging
```

Confirm `/platform/settings` shows:

- current commit
- deployment target
- latest verified release
- structured log sink configured or intentionally missing
- error reporting configured or intentionally missing
- uptime monitor path and host
