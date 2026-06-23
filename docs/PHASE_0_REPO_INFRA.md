# Phase 0 - Repo and Infrastructure Foundation

Last updated: 2026-06-23

## Status

Phase 0 is documentation and foundation work only. The goal is to lock the final repository, deployment direction, environment strategy, secrets strategy, migration approach, and operational assumptions before product implementation starts.

No product features are allowed in this phase.

## Decisions Locked

- `nxttrack/platform` is the final rebuild repository.
- `nxtdev` and earlier prototypes are reference only.
- `nxttrack/swim-school-pro` is the Lovable UI source of truth.
- The first target is staging, not a commercial launch tenant.
- Deployment direction is VPS plus Caddy plus systemd plus self-hosted GitHub runner.
- Email provider direction is SendGrid, using SMTP first.
- Payments are manual first, with a fast path prepared for Mollie/iDEAL.
- Core product architecture remains multi-tenant and sector-flexible.
- Swimming labels may appear in tenant-facing UI, but core models must stay generic.

## Current Repository State

Repository: `nxttrack/platform`

Default branch: `main`

Current known production files:

- `.github/workflows/deploy.yml`

The existing deploy workflow already defines the intended deploy skeleton:

- Trigger on pushes to `staging` and `production`.
- Run on a self-hosted runner with labels `[self-hosted, linux, x64, nxttrack]`.
- Select the GitHub Environment from the branch name.
- Prepare release directories under `/var/www/nxttrack/{staging|production}`.
- Write a shared `.env` file from GitHub environment variables and secrets.
- Run `pnpm install --frozen-lockfile`.
- Run `pnpm build`.
- Run `pnpm run db:migrate`.
- Activate the release via a `current` symlink.
- Restart the systemd service from `SERVICE_NAME`.
- Reload Caddy.
- Keep the five newest releases.

Important: the app scaffold and package scripts do not exist yet. The workflow is a target shape, not yet a proven deploy.

## Planned Repository Structure

This is the structure to implement when app scaffolding is approved:

```txt
.github/workflows/
  deploy.yml
apps/
  web/
    app/
      (marketing)/
      (tenant-public)/
      (parent)/
      (instructor)/
      (tenant-admin)/
      (platform-admin)/
    components/
      lovable/
      shell/
      ui/
    lib/
      auth/
      domain/
      supabase/
      tenants/
      terminology/
    styles/
    public/
supabase/
  migrations/
  seed/
  policies/
scripts/
  db/
  deploy/
docs/
```

Notes:

- `apps/web` is the production Next.js app target.
- `components/lovable` is the first landing zone for carefully ported Lovable UI building blocks.
- `lib/domain` should hold generic concepts such as program, stage, group, session, resource, enrollment, membership, progress, badge, certificate, and payment plan.
- `lib/terminology` should translate generic domain concepts into swim-school labels per tenant/sector.
- `supabase/migrations` is the only place for database schema changes after approval.

## Environment Strategy

Use GitHub Environments for `staging` and later `production`.

Staging variables expected by the current workflow:

```txt
APP_ENV=staging
NODE_ENV=production
PORT=<staging app port>
APP_URL=<staging public URL>
NEXT_PUBLIC_APP_URL=<staging public URL>
PLATFORM_ADMIN_URL=<staging platform admin URL>
TENANT_DOMAIN_SUFFIX=<staging tenant suffix>
BASE_PATH=/
SERVICE_NAME=nxttrack-staging
```

Recommended staging defaults to confirm with infra owner:

```txt
APP_URL=https://staging.nxttrack.nl
NEXT_PUBLIC_APP_URL=https://staging.nxttrack.nl
PLATFORM_ADMIN_URL=https://admin.staging.nxttrack.nl
TENANT_DOMAIN_SUFFIX=staging.nxttrack.nl
SERVICE_NAME=nxttrack-staging
```

Production variables should remain unset or protected until production is approved.

## Secrets Strategy

Secrets expected by the current workflow:

```txt
DATABASE_URL
SESSION_SECRET
JWT_SECRET
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Email secrets to add when notification code is approved:

```txt
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<sendgrid api key>
SMTP_FROM_EMAIL=<verified sender>
SMTP_FROM_NAME=NXTTRACK
```

Mollie/iDEAL secrets to reserve for later payment integration:

```txt
MOLLIE_API_KEY
MOLLIE_WEBHOOK_SECRET
MOLLIE_PROFILE_ID
```

Rules:

- Never commit `.env` files.
- Do not expose service-role Supabase keys to client code.
- Keep staging and production secrets separate.
- Add new secrets to GitHub Environments only when the consuming code exists.
- Extend `.github/workflows/deploy.yml` before expecting newly added secrets to be available on the VPS.

## Migration Approach

Target approach after approval:

- Database migrations live in `supabase/migrations`.
- Migrations are append-only after merge.
- Staging runs migrations automatically during deploy via `pnpm run db:migrate`.
- Migration commands must be idempotent enough to fail safely when already applied.
- Destructive changes require a documented expand/contract migration plan.
- Production migration policy is separate and must be approved before production launch.

Open implementation decision:

- Choose exact migration runner when the Next.js/Supabase scaffold is created. Options are Supabase CLI, direct SQL runner, or a controlled Postgres migration tool.

Current blocker:

- `pnpm run db:migrate` is referenced by the existing workflow but does not exist yet because the app scaffold is not created.

## Deployment Flow

The target staging flow is:

1. Developer merges approved code into `staging`.
2. GitHub Actions runs on the self-hosted runner.
3. The workflow writes `/var/www/nxttrack/staging/shared/.env` from GitHub Environment variables/secrets.
4. The workflow creates a timestamped release directory.
5. Dependencies are installed with pnpm.
6. The app is built.
7. Database migrations run against the staging database.
8. The `current` symlink is switched atomically.
9. systemd restarts `nxttrack-staging`.
10. Caddy reloads its config.
11. Old releases are cleaned up.

VPS prerequisites:

```txt
Linux VPS
Caddy installed and managed by systemd
Node.js LTS installed
pnpm installed
rsync installed
self-hosted GitHub runner installed with label nxttrack
deploy user/group present, including nxttrack-deploy
/var/www/nxttrack/staging/releases present
/var/www/nxttrack/staging/shared present
systemd service nxttrack-staging present
Caddy route for staging domain to localhost PORT
```

Systemd target shape:

```txt
WorkingDirectory=/var/www/nxttrack/staging/current
EnvironmentFile=/var/www/nxttrack/staging/shared/.env
ExecStart=<approved Next.js production start command>
Restart=always
```

The exact `ExecStart` depends on the approved Next.js package scripts.

## Caddy Strategy

Staging should route public traffic to the local app port behind Caddy.

Target shape:

```txt
staging.nxttrack.nl {
  reverse_proxy 127.0.0.1:<PORT>
}

admin.staging.nxttrack.nl {
  reverse_proxy 127.0.0.1:<PORT>
}

*.staging.nxttrack.nl {
  reverse_proxy 127.0.0.1:<PORT>
}
```

Wildcard tenant routing requires DNS and Caddy certificate validation to be confirmed before use.

## Security Hardening

Minimum staging baseline:

- Firewall only allows SSH, HTTP, and HTTPS.
- SSH uses key auth only.
- GitHub runner runs with least practical privileges.
- systemd service runs as a non-root app user.
- Shared `.env` file mode stays restricted.
- Supabase service-role key is server-only.
- Caddy terminates TLS.
- Deploy logs must not print secrets.
- Staging domains should not be indexed if they contain demo or test data.

## Backups, Monitoring, Rollback

Backups:

- Supabase database backups must be enabled for staging before real customer-like data enters staging.
- File/storage backup policy must be decided before documents/diplomas are generated.

Monitoring:

- Start with systemd/journald logs, Caddy access/error logs, and a simple uptime check.
- Add application-level error tracking before production.

Rollback:

- Current workflow keeps previous release directories.
- Manual rollback can repoint `/var/www/nxttrack/staging/current` to a previous release and restart `nxttrack-staging`.
- Automated rollback should wait until smoke tests exist.
- Database rollback is not automatic; use forward fixes or explicit rollback migrations.

## Phase 0 Acceptance Criteria

- Final repo is confirmed as `nxttrack/platform`.
- Staging-first deploy direction is documented.
- Current deploy workflow assumptions are documented.
- Planned repo structure is documented.
- Environment variables and secrets are documented.
- Migration approach is documented.
- No product features have been implemented.

## What Not To Do In Phase 0

- Do not scaffold the production app yet without approval.
- Do not connect Supabase yet.
- Do not add database migrations yet.
- Do not implement auth, roles, payments, notifications, or tenant routing.
- Do not change the deploy workflow unless the app scaffold and scripts are approved.
- Do not use `nxtdev` as the active codebase.

## Open Questions

1. What exact staging domains should be used: `staging.nxttrack.nl`, `admin.staging.nxttrack.nl`, and wildcard tenant subdomains, or another naming scheme?
2. Which Supabase project is staging?
3. Should the self-hosted runner deploy only from protected `staging`, or also from manual dispatch on selected branches?
4. Which Next.js deployment mode should be used: standalone output, custom server, or standard `next start`?
5. Should staging have basic auth or IP allowlisting before public demos?
6. When should production branch/environment be created and protected?
