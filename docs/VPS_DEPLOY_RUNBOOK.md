# VPS Deployment Runbook

Last updated: 2026-09-20

Status: preparation for the next V4 deployment to staging and production. The flow below describes the repository implementation prepared on this date. Deployment evidence must come from the actual selected release run; this document does not record a new application deployment.

## Purpose and targets

The canonical deployment uses `nxttrack/platform`, `.github/workflows/deploy.yml`, a self-hosted GitHub runner with labels `self-hosted, linux, x64, nxttrack`, Caddy, systemd and immutable release directories. Dispatch manually from `main`, first to staging and then to production with the same complete 40-character commit SHA.

| Target | Base directory | Service | Public URL | Port |
| --- | --- | --- | --- | --- |
| staging | `/var/www/nxttrack/staging` | `nxttrack-staging` | `https://staging.nxttrack.nl` | `3801` |
| production | `/var/www/nxttrack/production` | `nxttrack-production` | `https://nxttrack.nl` | `3800` |

Production promotion requires the successful staging run ID for that exact SHA, including its complete browser-validation job, plus successful production foundation-audit and migration dry-run IDs for the same SHA. A successful deploy step with skipped or failed browser checks is insufficient. The required inputs and evidence procedure are in [Production release runbook](PRODUCTION_RELEASE_RUNBOOK.md).

## Release and operations layout

The same layout applies to both targets:

```txt
/var/www/nxttrack/<target>/
  current -> releases/<timestamp>-<sha>
  releases/
    <timestamp>-<sha>/
      .env.candidate
      .env -> ../../shared/.env         # after activation
      .env.production -> ../../shared/.env
      artifacts/exact-source-sha.json
  shared/
    .env
    deployment-<run>-<attempt>.previous.json
    deployment-<run>-<attempt>.previous.env
    operations-v4/
      backup-passphrase
      versions/<content-digest>/
      current -> versions/<content-digest>
    storage-backups-v4/
```

Before activation, a candidate's `.env` and `.env.production` point to its own private `.env.candidate`. Builds and their checks therefore do not replace the running application's shared configuration. Every deployment snapshots and validates the existing active release identity and environment, including when no migrations are requested. Secret-bearing files stay permission-restricted and must not be copied into logs or public evidence.

Release cleanup retains the five newest directories **and** protects the active release and the snapshotted previous known-good release, even when either falls outside the five newest. A directory's age alone does not establish that it is a usable rollback candidate.

The versioned operations layout is installed by the next successful normal deployment. Existing operational scripts and cron entries from the earlier V4 rollout remain in use until that installer runs; preparation alone does not replace live workers.

## Deployment flow

1. Select the approved full SHA on canonical `main`. Production additionally binds the three successful same-SHA evidence runs: complete staging validation, production foundation audit and migration rehearsal.
2. The self-hosted runner checks out that immutable SHA with full Git history and uses Node `24.18.0` and pnpm `10.24.0`.
3. Check repository/source truth, the environment contract and production evidence before preparing the release.
4. Copy repository files into a new timestamped directory. Validate the active release's immutable identity and save its exact environment and release path as the rollback snapshot. Inconsistent metadata stops the deployment.
5. Write the private candidate environment and link the candidate's environment files to it. Install dependencies with the frozen lockfile and run the required code, dependency, authentication, migration, RLS and product-contract checks.
6. Build and package the standalone application. Persist its immutable source artifact. For a normal release, run the read-only operations installation preflight against both the active environment and candidate configuration before activation.
7. If migrations are requested, only now place the existing runtime into verified maintenance containment: preserve its SHA, disable mail/newsletter/internal workers, restart and prove that unsafe requests are blocked. Run read-only database preflight, the authorized migrations and post-migration checks. Without requested migrations, the existing runtime stays available during candidate preparation.
8. Assert the candidate's complete database/schema compatibility before activation. Bootstrap remains an explicit one-run operation where applicable; routine deployments preserve the existing owner account.
9. Publish the candidate environment atomically, relink its environment files to the shared runtime file, switch `current` atomically, restart the selected service and reload Caddy. A shared environment changed concurrently by an operator is rejected instead of overwritten silently.
10. Verify health against the **expected SHA and expected environment**, with database and schema compatibility both passing. Run public and private route smoke checks.
11. For a normal release, install the content-versioned scheduled-operation scripts and reconcile the two target-specific cron entries under the shared installer lock. Other environment schedules and unrelated operator entries are preserved. The installer validates installed content and readback and restores its previous pointer/schedule on failure.
12. Finish the deployment job by retaining its applicable release evidence and pruning old release directories while protecting the active and previous known-good releases. Staging's complete validation evidence still depends on the following browser job.
13. For staging, finish the full browser and operational validation job. That includes real flow, themes, parent/child/instructor/admin scenarios, isolation, accessibility/performance, communications and database checks. Retain its evidence; production is eligible only after that entire same-SHA gate succeeds. Failed gates require investigation; do not bypass them.

The operations preflight requires an active cron service, the supported host utilities, valid scheduled-job authentication, the candidate's heartbeat authentication, and an independently retained encryption key compatible with the installed key. Key rotation is a separate recovery operation that preserves access to older encrypted backups.

## Pre-deploy checks

Before the next release:

- [ ] The selected source is on `main`; the lockfile and required checks pass for that exact SHA.
- [ ] GitHub environment variables/secrets select the intended service, URL, port and Supabase project. Staging and production remain separate.
- [ ] The current service, Caddy routing/TLS and exact-SHA database/schema health are healthy.
- [ ] The immutable active release artifact and shared environment identify the same SHA; the protected rollback snapshot is available.
- [ ] The candidate can build using its own environment without changing active configuration.
- [ ] Operations preflight passes, including private encryption-key retention and cron/authentication requirements.
- [ ] A fresh encrypted backup covers all seven required Storage buckets: `tenant-documents`, `diploma-vault`, `participant-media`, `badge-studio-assets`, `tenant-media-assets`, `portal-theme-assets`, `portal-theme-imports`.
- [ ] Upload scanning remains enforced and reachable; relevant database migration/RLS checks pass.
- [ ] Migrations, when requested, have the maintenance/no-write and transport/job containment settings. Routine releases keep `RUN_DB_MIGRATIONS=false`.
- [ ] Newsletter delivery remains disabled for the current concept-only feature. Persistent owner bootstrap/reset flags remain disabled.
- [ ] For production, the complete successful staging run, foundation audit and migration dry run bind to the selected SHA, with the deployment approval reference recorded.

`Deployment readiness` provides read-only checks of both currently running environments, services, worker ticks and retained backups. It records the active runtime SHA independently of the newer source checkout. It does not replace the future candidate's build, staging browser gate or production evidence requirements.

## Health check

`GET /api/health` must return an HTTP success response with all of these properties for deployment verification:

```json
{
  "ok": true,
  "app": "nxttrack-platform",
  "env": "staging",
  "commitSha": "<expected full 40-character release SHA>",
  "checks": {
    "database": { "status": "pass" },
    "schemaCompatibility": { "status": "pass" }
  }
}
```

Use explicit expectations. For a newly activated staging candidate:

```bash
APP_URL=https://staging.nxttrack.nl \
EXPECTED_APP_ENV=staging \
EXPECTED_RELEASE_SHA="$RELEASE_SHA" \
pnpm run staging:health
```

For production, use `APP_URL=https://nxttrack.nl` and `EXPECTED_APP_ENV=production`. For a read-only inspection of an existing runtime, supply that runtime's independently established SHA. A newer checkout's `GITHUB_SHA` is not evidence that the live application runs that version. A missing, skipped or failing database/schema check does not satisfy exact deployment health.

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

Use an exact known-good release, retaining its immutable source artifact and release evidence. The newest directory may be an incomplete build or an incompatible older application.

The canonical `Staging rollback rehearsal` Action on `main` requires `release_directory` and defaults `check_only=true`. It fetches full Git history and serializes with staging deploys. It validates environment, immutable identity, certified ancestry, packaged schema contract, identical migration trees and current database/schema health before changing the runtime. Set `check_only=false` only when a temporary live rehearsal is intended. The candidate runs with maintenance mode enabled and mail/internal jobs disabled; the original release and exact shared environment are restored afterwards, including after a failure.

For a VPS invocation, use a complete trusted checkout and the certified Node version. Stop conflicting manual deployment work first.

1. List releases:

```bash
ls -1dt /var/www/nxttrack/staging/releases/*
```

2. Validate the exact candidate without changing the runtime:

```bash
scripts/release/rehearse-runtime-rollback.sh staging \
  /var/www/nxttrack/staging/releases/<known-good-release> --check-only
```

3. Run the authorized rehearsal and restore the current release automatically:

```bash
scripts/release/rehearse-runtime-rollback.sh staging \
  /var/www/nxttrack/staging/releases/<known-good-release>
```

4. Verify the restored original SHA and environment, with database and schema checks both passing:

```bash
curl -fsS https://staging.nxttrack.nl/api/health
```

Rollback limitation:

- This is a temporary runtime rehearsal and restores the original artifact; an incident rollback that leaves a different artifact active is a separate operation.
- Both environment and release directory are mandatory. Production uses `production` and a production release path; no argument silently defaults to staging.
- Canonical releases share `.env`; switching only `current` does not establish a truthful release SHA. The script snapshots the environment, takes the candidate SHA from its immutable artifact and restores the original bytes afterwards. If restoration fails, it keeps the private snapshot for recovery.
- Missing/mismatched artifacts, the wrong environment, unrelated ancestry, a different migration tree or schema contract, and failed exact-SHA health stop the operation.
- Database migrations are not automatically rolled back.
- Use forward fixes or separately verified schema/data recovery for database issues. Pre-V4 July releases are not suitable rollback targets for the migrated V4 database.

## Troubleshooting

### GitHub job does not start

Check:

- Workflow source is canonical `main`; the dispatch target selects `staging` or `production`.
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
- The selected environment's Supabase URL/database URL is correct and matches the preflight evidence.
- Migration has not already been partially applied.
- RLS/function/view changes follow security guidelines.
- Do not retry blindly after repeated failures; inspect state first.

### Hardening audit fails

Check:

- `pnpm run auth:audit` output for missing private route guards.
- `pnpm run db:audit` output for forbidden Supabase patterns.
- `pnpm run db:rls-audit` output for public tables without RLS, policies or grants.
- `pnpm run staging:gate` warnings for missing manual confirmations.
- The pinned Supabase CLI version and the same toolchain used by the validated source.

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

## Acceptance criteria for the next deployment

- The exact candidate SHA passes its build and repository checks, then the complete staging validation job.
- Production promotion has the same-SHA staging, foundation and migration-rehearsal evidence and an applicable approval reference.
- Candidate preparation preserves the running environment; snapshots, explicit rollback selection and protected release retention are available.
- Activated health proves the expected SHA, environment, database and schema compatibility; route checks pass.
- Versioned operations installation and its schedule readback pass when the normal deployment runs, with subsequent successful worker/backup evidence.
- The actual release run and any separately performed live rehearsal are recorded as evidence. Prepared scripts and local tests alone are not recorded as completed live deployments or rehearsals.
