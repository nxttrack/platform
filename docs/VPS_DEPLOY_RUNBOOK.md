# VPS Deployment Runbook

Last updated: 2026-06-23

Status: operational runbook draft. Do not execute infrastructure changes without explicit approval.

## Purpose

This runbook describes how the staging deployment is intended to work for `nxttrack/platform` using the existing GitHub Actions workflow, a self-hosted GitHub runner, Caddy, systemd, and release directories.

## Current Workflow

Existing file:

```txt
.github/workflows/deploy.yml
```

Current triggers:

```txt
push to staging
push to production
workflow_dispatch
```

Current runner labels:

```txt
self-hosted
linux
x64
nxttrack
```

Current release root:

```txt
/var/www/nxttrack/staging
/var/www/nxttrack/production
```

Production is not the first target. Staging is the first target.

## Staging Directory Layout

Target layout:

```txt
/var/www/nxttrack/staging/
  current -> /var/www/nxttrack/staging/releases/<timestamp>-<sha>
  releases/
    <timestamp>-<sha>/
  shared/
    .env
```

Rules:

- `current` always points to the active release.
- `shared/.env` is reused by releases through symlinks.
- Old releases are kept for rollback.
- The workflow currently keeps the five newest releases.

## Deployment Flow

Target flow from the existing workflow:

1. Push approved changes to `staging`.
2. GitHub Actions selects environment `staging`.
3. Self-hosted runner checks out repo.
4. Workflow prints runtime versions.
5. Workflow creates timestamped release directory.
6. Workflow copies repo into release directory with `rsync`.
7. Workflow writes shared `.env` from GitHub variables/secrets.
8. Workflow symlinks `.env` and `.env.production` into release.
9. Workflow runs `pnpm install --frozen-lockfile`.
10. Workflow runs `pnpm build`.
11. Workflow runs `pnpm run db:migrate`.
12. Workflow updates `current` symlink atomically.
13. Workflow restarts `SERVICE_NAME`.
14. Workflow reloads Caddy.
15. Workflow removes old releases beyond retention.

## Pre-Deploy Checks

Before first staging deploy:

- [ ] App scaffold exists.
- [ ] `pnpm-lock.yaml` exists and is committed.
- [ ] `pnpm build` exists and succeeds locally/CI.
- [ ] `pnpm run db:migrate` exists.
- [ ] Health endpoint exists.
- [ ] GitHub Environment `staging` variables/secrets are complete.
- [ ] Runner labels match workflow.
- [ ] systemd service exists.
- [ ] Caddy route exists.
- [ ] Supabase staging project is confirmed.

## Health Check

Phase 2 should add a health endpoint. Target:

```txt
GET /api/health
```

Minimum response:

```json
{ "ok": true, "env": "staging" }
```

Later response may include non-sensitive checks:

- app version/sha.
- database connectivity.
- storage connectivity.
- background queue state if used.

## Useful Commands

Read service status:

```bash
sudo systemctl status nxttrack-staging
```

Restart service:

```bash
sudo systemctl restart nxttrack-staging
```

Read app logs:

```bash
sudo journalctl -u nxttrack-staging -n 200 --no-pager
```

Follow app logs:

```bash
sudo journalctl -u nxttrack-staging -f
```

Check Caddy:

```bash
sudo systemctl status caddy
sudo journalctl -u caddy -n 200 --no-pager
```

Reload Caddy:

```bash
sudo systemctl reload caddy
```

Check current release:

```bash
readlink -f /var/www/nxttrack/staging/current
```

List releases:

```bash
ls -1dt /var/www/nxttrack/staging/releases/*
```

## Manual Rollback

Use only after confirming the target previous release.

1. List releases:

```bash
ls -1dt /var/www/nxttrack/staging/releases/*
```

2. Choose previous known-good release.

3. Update symlink:

```bash
sudo ln -sfn /var/www/nxttrack/staging/releases/<previous-release> /var/www/nxttrack/staging/current.new
sudo mv -Tf /var/www/nxttrack/staging/current.new /var/www/nxttrack/staging/current
```

4. Restart service:

```bash
sudo systemctl restart nxttrack-staging
```

5. Verify health:

```bash
curl -fsS https://staging.nxttrack.nl/api/health
```

Rollback limitation:

- This only rolls back files and runtime code.
- Database migrations are not automatically rolled back.
- Use forward fixes or explicit rollback migrations for database issues.

## Troubleshooting

### GitHub job does not start

Check:

- Branch is `staging` or `production`.
- Runner is online.
- Runner labels match workflow.
- Repository has access to the runner.
- GitHub Environment rules are not blocking execution.

### Build fails

Check:

- Lockfile committed.
- Node/pnpm versions.
- Missing environment variables.
- Package scripts exist.
- Build logs do not contain secrets.

### Migration fails

Check:

- Migration command exists.
- Supabase staging URL/database URL is correct.
- Migration has not already been partially applied.
- RLS/function/view changes follow security guidelines.
- Do not retry blindly after repeated failures; inspect state first.

### Caddy returns 502

Check:

- App service is running.
- App listens on expected localhost port.
- Caddy points to correct port.
- Firewall is not relevant for localhost reverse proxy.
- App crashed during startup due to missing env.

### Wrong tenant/domain routing

Check:

- DNS resolves to VPS.
- Caddy route matches host.
- App host resolver maps domain to tenant.
- Wildcard domain/certificate setup is complete.

## Acceptance Criteria

This runbook is ready when:

- Staging deploy can be followed step-by-step.
- Rollback is documented.
- Common failure modes are documented.
- Production remains explicitly out of scope until approved.
