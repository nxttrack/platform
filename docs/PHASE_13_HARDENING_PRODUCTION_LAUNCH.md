# Phase 13 - Hardening & Production Launch

Last updated: 2026-06-24

Status: staging hardening baseline. Production promotion remains manual and requires product owner approval.

## Goal

Phase 13 turns the Phase 1-12 rebuild into a releaseable staging baseline. It does not add new product modules. It locks security checks, smoke tests, deployment checks, backup/restore procedure, monitoring/logging expectations, and the staging-to-production promotion checklist.

## Scope

- Security review for auth, env vars, public routes, Supabase access, deployment workflow and secrets.
- RLS and migration contract tests for public tables, grants, anon exposure and update policies.
- E2E smoke tests for staging public URLs and health endpoints.
- Performance pass for build output, route shape and standalone asset readiness.
- Backup/restore procedure for Supabase and VPS release directories.
- Monitoring/logging plan for app, Caddy, systemd, GitHub Actions and Supabase.
- VPS/Caddy/systemd/GitHub runner deployment checks.
- Staging release checklist.
- Production promotion checklist.

## What Is Done In Phase 13

### Release Gate

Run before a staging release:

```bash
pnpm run release:gate
```

This runs:

- TypeScript check.
- Auth boundary audit.
- Migration/RLS contract audit.
- Release security readiness audit.
- Production build.
- Standalone static asset preparation.
- Migration command guard.

### Security Audit

Run directly:

```bash
pnpm run security:audit
```

This checks:

- `.env.example` contains the expected staging/prod variables.
- No browser-exposed env variable contains secret/service/database credentials.
- Web app source does not reference service-role credentials.
- Public Supabase tables enable RLS.
- Public Supabase tables have explicit `service_role` grants.
- Anon grants stay on the allowlisted public intake/tenant/slot-offer surfaces.
- Deployment workflow keeps staging/production branch guards, lockfile install, build, migration, standalone assets, systemd restart, Caddy reload and health checks.
- Phase 13 release docs exist.

### Staging Smoke Test

Run after deploy:

```bash
EXPECTED_COMMIT=<sha> pnpm run smoke:staging
```

Defaults:

```txt
STAGING_SMOKE_BASE_URL=https://staging.nxttrack.nl
STAGING_SMOKE_TENANT_URL=https://aquaswim-demo.staging.nxttrack.nl
```

Checks:

- Platform health endpoint.
- Tenant health endpoint.
- NXTTRACK marketing page.
- Tenant homepage.
- Tenant program overview.
- Tenant login page.

### CI/Deploy

- CI now runs on `main`, `staging` and `production`.
- Deploy still triggers on `staging` and `production`.
- Deploy writes SMTP/SendGrid env values into the shared runtime env.
- Deploy verifies `/api/health` after activating the release.
- Deploy verifies the default tenant health endpoint when `DEFAULT_TENANT_SLUG` and `TENANT_DOMAIN_SUFFIX` are present.

## RLS Test Coverage

Current automated RLS coverage is migration-contract based:

- Every created `public` table must enable RLS.
- Every created `public` table must have explicit grants.
- Policies must use `TO authenticated` or explicit anon/auth combinations.
- Update policies must include `WITH CHECK`.
- Auth metadata must not use editable `user_metadata` / `raw_user_meta_data`.
- Known public anon access is allowlisted only for tenant discovery, public program/intake, and slot-offer response insertion.

Manual RLS tests before production:

- Tenant admin from tenant A cannot read or mutate tenant B records.
- Instructor can read only assigned/instruction-scoped data.
- Parent can read only linked participant/enrollment data.
- Anon can read public tenant/program/intake config but cannot read intake submissions, waitlist, payments, documents, tasks, messages or private learner data.
- Slot offer anon response can insert only the allowed token/response/note columns.

## Performance Pass

Current automated coverage:

- `next build` must pass.
- Standalone output must be produced.
- Static assets must be copied into `.next/standalone/apps/web`.
- `poweredByHeader` is disabled.

Manual performance checks before production:

- Staging marketing and tenant public pages load without missing CSS/assets.
- Admin shell first load is acceptable on mobile and desktop.
- Supabase-heavy admin pages do not load unbounded rows.
- Health endpoint responds quickly from platform and tenant domains.
- Caddy logs do not show repeated 5xx/timeout responses after deploy.

## Backup And Restore Procedure

### Supabase

Before production promotion:

- Confirm Supabase project tier and backup policy.
- Confirm daily backups are enabled.
- Record current database size and backup retention.
- Before any production migration, create or verify a fresh restore point/backup according to the Supabase project plan.
- Store the backup timestamp in the release notes.

Restore rehearsal for staging:

- Restore staging backup into a separate restore target or branch.
- Run `pnpm run db:audit` against source migrations before re-applying changes.
- Run smoke checks against the restored environment if DNS/runtime is available.

Important limitation:

- File rollback does not roll database schema back. Database issues require a forward fix migration or an explicitly reviewed rollback migration.

### VPS Release Directories

The deploy flow keeps timestamped releases under:

```txt
/var/www/nxttrack/staging/releases
/var/www/nxttrack/production/releases
```

Rollback uses the previous release directory by moving `current` back and restarting the service. See `docs/VPS_DEPLOY_RUNBOOK.md`.

## Monitoring And Logging

Minimum staging monitoring:

- GitHub Actions deploy result.
- `/api/health` for platform and default tenant domain.
- `systemctl status nxttrack-staging`.
- `journalctl -u nxttrack-staging`.
- Caddy status/logs.
- Supabase dashboard health, database errors and auth errors.

Minimum production monitoring before promotion:

- External uptime monitor for production platform domain.
- External uptime monitor for default tenant domain.
- Alert destination for deploy failures and healthcheck failures.
- Log access procedure for app, Caddy and Supabase.
- Owner assigned for incident response.

## VPS/Caddy/Systemd Runner Checks

Staging must have:

- Self-hosted GitHub runner online with labels `self-hosted`, `linux`, `x64`, `nxttrack`.
- `pnpm install --frozen-lockfile` succeeds on runner.
- `pnpm build` succeeds on runner.
- `node scripts/deploy/prepare-standalone-assets.mjs` runs after build.
- `pnpm run db:migrate` is either enabled with `RUN_DB_MIGRATIONS=true` or intentionally no-op with a recorded reason.
- systemd service restarts successfully.
- Caddy reload succeeds.
- Health endpoint returns the deployed commit.

Production must repeat the same checks with production env, DNS, Caddy site block and service name before any promotion.

## Staging Release Checklist

- [ ] Work is committed on `staging`.
- [ ] `pnpm run release:gate` passes locally or in CI.
- [ ] Push to `staging` succeeds.
- [ ] GitHub Actions deploy succeeds.
- [ ] `/api/health` returns the pushed commit on `https://staging.nxttrack.nl`.
- [ ] `/api/health` returns the pushed commit on `https://aquaswim-demo.staging.nxttrack.nl`.
- [ ] `pnpm run smoke:staging` passes.
- [ ] Caddy/systemd logs show no repeated errors.
- [ ] Supabase migration status is understood: applied or intentionally no-op.

## Production Promotion Checklist

Production promotion may start only after product owner approval.

- [ ] Staging release candidate commit is selected.
- [ ] Product owner approves canon/roadmap state and staging behavior.
- [ ] Production GitHub Environment exists with variables/secrets.
- [ ] Production Supabase project exists and backup policy is confirmed.
- [ ] Production DNS and Caddy routes are confirmed.
- [ ] Production systemd service exists and uses non-root runtime where practical.
- [ ] Production `.env` permissions are restricted.
- [ ] `RUN_DB_MIGRATIONS` decision is explicit for production.
- [ ] Backup/restore procedure has a named owner.
- [ ] Monitoring/alerts are active.
- [ ] Rollback target and rollback owner are defined.
- [ ] Promote by merging/pushing approved commit from `staging` to `production`.
- [ ] Verify production `/api/health`.
- [ ] Run production smoke checklist with production URLs.

## Acceptance Criteria

Phase 13 is complete when:

- Release gate exists and passes.
- Security audit exists and passes.
- Staging smoke test exists and can verify deployed commit.
- Deployment workflow verifies health after activation.
- Backup/restore, monitoring/logging, staging release and production promotion checklists are documented.
- No production deployment is performed without explicit approval.
