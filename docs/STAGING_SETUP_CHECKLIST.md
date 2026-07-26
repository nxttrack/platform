# Staging Setup Checklist

Last updated: 2026-07-07

Status: staging decision checklist. Do not make VPS, DNS, Supabase, or production changes from this document without explicit approval.

## Purpose

Staging is the first target environment for the rebuild. This checklist makes staging concrete before app scaffolding and deployment work starts.

## Required Decisions

- [ ] Confirm staging app domain.
- [x] Confirm platform marketing domain: `www.nxttrack.nl`.
- [x] Confirm platform admin domain: `admin.nxttrack.nl`.
- [x] Confirm tenant domain strategy: `<slug>.nxttrack.nl`.
- [x] Confirm staging domain strategy: only `staging.nxttrack.nl` for the staging environment.
- [ ] Confirm Supabase staging project.
- [ ] Confirm GitHub runner host and labels.
- [ ] Confirm staging app port.
- [ ] Confirm systemd service name.
- [ ] Confirm whether staging needs basic auth, IP allowlisting, or noindex only.
- [ ] Confirm when `RUN_DB_MIGRATIONS=true` may be enabled.
- [ ] Confirm initial platform-owner bootstrap user email.

Recommended defaults unless changed:

```txt
APP_URL=https://staging.nxttrack.nl
NEXT_PUBLIC_APP_URL=https://staging.nxttrack.nl
PLATFORM_ADMIN_URL=https://admin.nxttrack.nl
TENANT_DOMAIN_SUFFIX=nxttrack.nl
PLATFORM_HOSTNAMES=localhost,127.0.0.1,::1,staging.nxttrack.nl
PLATFORM_MARKETING_HOSTNAMES=www.nxttrack.nl,nxttrack.nl
PLATFORM_ADMIN_HOSTNAMES=admin.nxttrack.nl
STAGING_HOSTNAMES=staging.nxttrack.nl
TENANT_BASE_DOMAINS=nxttrack.nl,localhost
RESERVED_TENANT_SUBDOMAINS=admin,api,app,platform,staging,www
PORT=3801
SERVICE_NAME=nxttrack-staging
BASE_PATH=/
APP_ENV=staging
NODE_ENV=production
RUN_DB_MIGRATIONS=false
DB_MIGRATE_DRY_RUN=false
BOOTSTRAP_PLATFORM_OWNER=false
BOOTSTRAP_PLATFORM_OWNER_EMAIL=admin@nxttrack.nl
BOOTSTRAP_PLATFORM_OWNER_RESET_PASSWORD=false
RUN_PLAYWRIGHT_SMOKE=false
```

## GitHub Environment: staging

Create or verify GitHub Environment `staging` in `nxttrack/platform`.

Variables:

```txt
APP_ENV
NODE_ENV
PORT
APP_URL
NEXT_PUBLIC_APP_URL
PLATFORM_ADMIN_URL
TENANT_DOMAIN_SUFFIX
PLATFORM_HOSTNAMES
PLATFORM_MARKETING_HOSTNAMES
PLATFORM_ADMIN_HOSTNAMES
STAGING_HOSTNAMES
TENANT_BASE_DOMAINS
RESERVED_TENANT_SUBDOMAINS
BASE_PATH
SERVICE_NAME
RUN_DB_MIGRATIONS
DB_MIGRATE_DRY_RUN
BOOTSTRAP_PLATFORM_OWNER
BOOTSTRAP_PLATFORM_OWNER_EMAIL
BOOTSTRAP_PLATFORM_OWNER_RESET_PASSWORD
RUN_PLAYWRIGHT_SMOKE
SMTP_FROM
SMTP_FROM_EMAIL
SMTP_FROM_NAME
EMAIL_DELIVERY_TIMEOUT_MS
```

Secrets:

```txt
DATABASE_URL
SESSION_SECRET
JWT_SECRET
AUTH_CODE_PEPPER
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
BOOTSTRAP_PLATFORM_OWNER_TEMP_PASSWORD
SENDGRID_API_KEY
```

Notes:

- The app accepts both `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the existing GitHub `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- The workflow writes `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from either value, so the current GitHub secrets do not need to be renamed immediately.
- The app accepts `SUPABASE_SECRET_KEY` as the server-only name and the workflow can source it from the existing `SUPABASE_SERVICE_ROLE_KEY`.
- Do not expose any service-role or secret key through a `NEXT_PUBLIC_` variable.
- Keep `RUN_DB_MIGRATIONS=false` until the Supabase staging project, database URL, migration command, and bootstrap plan are approved.
- Set `DB_MIGRATE_DRY_RUN=true` only for a migration rehearsal when the Supabase CLI supports the selected dry-run flow.
- Set `BOOTSTRAP_PLATFORM_OWNER=true` only for the environment where `admin@nxttrack.nl` should be ensured as first platform owner.
- Set `RUN_PLAYWRIGHT_SMOKE=true` only after Chromium is available on the runner or the optional Playwright install step is approved.
- Prefer SendGrid delivery for bootstrap/invite/reset mail. If `SENDGRID_API_KEY` and a from-address are missing, use a one-time `BOOTSTRAP_PLATFORM_OWNER_TEMP_PASSWORD` secret for bootstrap and rotate it after first login.

Email/runtime mail configuration:

```txt
SENDGRID_API_KEY
SMTP_FROM
SMTP_FROM_EMAIL
SMTP_FROM_NAME
EMAIL_DELIVERY_TIMEOUT_MS
```

Payment secrets to add only when Mollie/iDEAL integration is approved:

```txt
MOLLIE_API_KEY
MOLLIE_WEBHOOK_SECRET
MOLLIE_PROFILE_ID
```

## DNS Checklist

- [ ] `staging.nxttrack.nl` resolves to the VPS.
- [ ] `www.nxttrack.nl` resolves to the VPS when platform marketing is ready.
- [ ] `admin.nxttrack.nl` resolves to the VPS when platform admin is ready.
- [ ] Tenant domains use `<slug>.nxttrack.nl`.
- [ ] No `*.staging.nxttrack.nl` tenant wildcard is used.
- [ ] Caddy can issue certificates for staging domains.
- [ ] No production DNS is changed during staging setup.

## VPS Checklist

- [ ] Node.js LTS/runtime for app deployment is installed.
- [ ] pnpm is installed.
- [ ] Caddy is installed and managed by systemd.
- [ ] Self-hosted GitHub runner is installed.
- [ ] Runner has labels `self-hosted`, `linux`, `x64`, `nxttrack`.
- [ ] `rsync` is installed.
- [ ] Deploy user/group model is confirmed.
- [ ] `/var/www/nxttrack/staging/releases` exists.
- [ ] `/var/www/nxttrack/staging/shared` exists.
- [ ] Staging `.env` is owned/readable only by intended deploy/app users.
- [ ] systemd service `nxttrack-staging` exists after app scaffold is ready.
- [ ] Supabase CLI is installed on the runner before `RUN_DB_MIGRATIONS=true`.

## Caddy Checklist

Target routing shape:

```txt
staging.nxttrack.nl {
  reverse_proxy 127.0.0.1:3801
}

www.nxttrack.nl {
  reverse_proxy 127.0.0.1:3801
}

admin.nxttrack.nl {
  reverse_proxy 127.0.0.1:3801
}

*.nxttrack.nl {
  reverse_proxy 127.0.0.1:3801
}
```

Checklist:

- [ ] Staging routes point only to localhost app port.
- [ ] App ports are not publicly exposed.
- [ ] Caddy reload succeeds.
- [ ] TLS certificate issuance works.
- [ ] Logs are available for troubleshooting.

## systemd Checklist

Target shape after app scaffold approval:

```txt
WorkingDirectory=/var/www/nxttrack/staging/current
EnvironmentFile=/var/www/nxttrack/staging/shared/.env
ExecStart=<approved app start command>
Restart=always
```

Checklist:

- [ ] Service uses non-root app user where practical.
- [ ] Service reads shared env file.
- [ ] Service restarts on failure.
- [ ] `journalctl -u nxttrack-staging` shows logs.
- [ ] Service restart does not require interactive shell state.

## Deployment Smoke Checklist

Run only after app scaffold exists:

- [ ] Push to `staging` triggers deploy workflow.
- [ ] Runner picks up the job.
- [ ] Workflow writes shared env file.
- [ ] `pnpm install --frozen-lockfile` succeeds.
- [ ] `pnpm run typecheck` succeeds.
- [ ] `pnpm run auth:audit` succeeds.
- [ ] `pnpm run db:audit` succeeds.
- [ ] `pnpm run db:rls-audit` succeeds.
- [ ] `pnpm run staging:gate` records launch warnings without blocking non-strict deploy.
- [ ] `pnpm build` succeeds.
- [ ] `pnpm run db:migrate` succeeds or is a documented no-op before schema work.
- [ ] With `RUN_DB_MIGRATIONS=true`, the identity-boundary migration applies before release activation.
- [ ] With `BOOTSTRAP_PLATFORM_OWNER=true`, `admin@nxttrack.nl` is ensured as `platform_owner`.
- [ ] Login works for platform owner and forces password change when bootstrapped with a temporary password.
- [ ] Invite email delivery works through NXTTRACK-managed SendGrid/SMTP configuration.
- [ ] Release symlink switches to new release.
- [ ] `systemctl restart nxttrack-staging` succeeds.
- [ ] `caddy reload` succeeds.
- [ ] Health endpoint returns success.
- [ ] Optional `RUN_PLAYWRIGHT_SMOKE=true` deploy smoke passes against `APP_URL`.
- [ ] Old releases remain available for rollback.

## Phase 13 Hardening Gates

Run before product-owner review:

```bash
pnpm run hardening:local
APP_URL=https://staging.nxttrack.nl pnpm run staging:health
PLAYWRIGHT_BASE_URL=https://staging.nxttrack.nl pnpm run test:e2e
```

Manual confirmations required before strict launch gate:

```txt
RLS_STAGING_TESTS_CONFIRMED=true
PLAYWRIGHT_STAGING_SMOKE_CONFIRMED=true
LOVABLE_VISUAL_CHECK_CONFIRMED=true
SUPABASE_BACKUPS_CONFIRMED=true
ROLLBACK_REHEARSAL_CONFIRMED=true
```

Strict launch gate:

```bash
STAGING_LAUNCH_STRICT=true APP_ENV=staging APP_URL=https://staging.nxttrack.nl pnpm run staging:gate
```

## Acceptance Criteria

Staging is ready for Phase 2 when:

- GitHub Environment `staging` exists with required variables/secrets.
- VPS prerequisites are confirmed.
- Caddy staging route plan is confirmed.
- systemd target shape is confirmed.
- Supabase staging project is identified.
- Migration runner decision is recorded and `RUN_DB_MIGRATIONS` policy is explicit.
- Initial platform-owner bootstrap user is approved: `admin@nxttrack.nl`.
- No production environment is touched.

## Product Owner / Infra Owner Actions Needed

Provide or confirm these before Phase 3 can become real on staging:

1. Domains and DNS target:
   - `staging.nxttrack.nl` for staging environment
   - `www.nxttrack.nl` for NXTTRACK marketing
   - `admin.nxttrack.nl` for platform admin
   - `<slug>.nxttrack.nl` for tenant sites and tenant role shells
2. VPS/runner details:
   - runner host
   - labels `self-hosted`, `linux`, `x64`, `nxttrack`
   - app port
   - systemd service name
3. Supabase staging project:
   - project URL
   - publishable key
   - database URL for migrations
   - server-only secret key strategy
4. Migration policy:
   - first deploy with `RUN_DB_MIGRATIONS=false`
   - migration rehearsal or advisor run
   - then enable `RUN_DB_MIGRATIONS=true`
5. Bootstrap:
   - first platform-owner email: `admin@nxttrack.nl`
   - set `BOOTSTRAP_PLATFORM_OWNER=true` only for the first staging bootstrap run
   - provide `BOOTSTRAP_PLATFORM_OWNER_TEMP_PASSWORD` or working SendGrid/from-address configuration
   - parent/child access is parent-mediated for MVP
