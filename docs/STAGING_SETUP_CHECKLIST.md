# Staging Setup Checklist

Last updated: 2026-06-23

Status: preparation checklist only. Do not make VPS, DNS, Supabase, or production changes from this document without explicit approval.

## Purpose

Staging is the first target environment for the rebuild. This checklist makes staging concrete before app scaffolding and deployment work starts.

## Required Decisions

- [ ] Confirm staging app domain.
- [ ] Confirm staging platform admin domain.
- [ ] Confirm staging tenant wildcard domain strategy.
- [ ] Confirm Supabase staging project.
- [ ] Confirm GitHub runner host and labels.
- [ ] Confirm staging app port.
- [ ] Confirm systemd service name.
- [ ] Confirm whether staging needs basic auth, IP allowlisting, or noindex only.

Recommended defaults unless changed:

```txt
APP_URL=https://staging.nxttrack.nl
NEXT_PUBLIC_APP_URL=https://staging.nxttrack.nl
PLATFORM_ADMIN_URL=https://admin.staging.nxttrack.nl
TENANT_DOMAIN_SUFFIX=staging.nxttrack.nl
TENANT_BASE_DOMAINS=nxttrack.nl,staging.nxttrack.nl
PLATFORM_HOSTNAMES=staging.nxttrack.nl,admin.staging.nxttrack.nl
RESERVED_TENANT_SUBDOMAINS=admin,api,app,platform,staging,www
DEFAULT_TENANT_SLUG=aquaswim-demo
PORT=3801
SERVICE_NAME=nxttrack-staging
BASE_PATH=/
APP_ENV=staging
NODE_ENV=production
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
TENANT_BASE_DOMAINS
PLATFORM_HOSTNAMES
RESERVED_TENANT_SUBDOMAINS
DEFAULT_TENANT_SLUG
BASE_PATH
SERVICE_NAME
RUN_DB_MIGRATIONS
DB_MIGRATE_DRY_RUN
SMTP_PORT
SMTP_FROM_EMAIL
SMTP_FROM_NAME
```

Required values for staging database bootstrapping:

```txt
RUN_DB_MIGRATIONS=true
DB_MIGRATE_DRY_RUN=false
```

If `RUN_DB_MIGRATIONS` is false or missing, the app can deploy while Supabase still has no NXTTRACK tables. Staging deploys now force migrations on the `staging` branch, but the environment still needs a valid `DATABASE_URL` secret.

Secrets:

```txt
DATABASE_URL
SESSION_SECRET
JWT_SECRET
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Supabase Auth runtime notes:

- `NEXT_PUBLIC_SUPABASE_URL` and a public key are required for login/auth.
- The deploy workflow accepts public Supabase values as GitHub variables or secrets.
- Supported URL names: `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`.
- Supported public key names: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, or `SUPABASE_ANON_KEY`.
- Supported service-role names: `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`.
- The deploy fails before activation if the public URL or public key is missing.

Email secrets to add only when email code exists:

```txt
SMTP_HOST
SMTP_USER
SMTP_PASS
SENDGRID_API_KEY
```

Payment secrets to add only when Mollie/iDEAL integration is approved:

```txt
MOLLIE_API_KEY
MOLLIE_WEBHOOK_SECRET
MOLLIE_PROFILE_ID
```

## DNS Checklist

- [ ] `staging.nxttrack.nl` resolves to the VPS.
- [ ] `admin.staging.nxttrack.nl` resolves to the VPS.
- [ ] `*.staging.nxttrack.nl` strategy is confirmed before tenant wildcard routing.
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

## Caddy Checklist

Target routing shape:

```txt
staging.nxttrack.nl {
  reverse_proxy 127.0.0.1:3801
}

admin.staging.nxttrack.nl {
  reverse_proxy 127.0.0.1:3801
}

*.staging.nxttrack.nl {
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
- [ ] `pnpm build` succeeds.
- [ ] `pnpm run db:migrate` succeeds or is a documented no-op before schema work.
- [ ] Release symlink switches to new release.
- [ ] `systemctl restart nxttrack-staging` succeeds.
- [ ] `caddy reload` succeeds.
- [ ] Health endpoint returns success.
- [ ] `pnpm run smoke:staging` passes after deploy.
- [ ] Health endpoint commit matches the pushed commit.
- [ ] Old releases remain available for rollback.

## Acceptance Criteria

Staging is ready for Phase 2 when:

- GitHub Environment `staging` exists with required variables/secrets.
- VPS prerequisites are confirmed.
- Caddy staging route plan is confirmed.
- systemd target shape is confirmed.
- Supabase staging project is identified.
- Migration runner decision is recorded.
- No production environment is touched.
