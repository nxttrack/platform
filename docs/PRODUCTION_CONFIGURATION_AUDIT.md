# Production configuration audit

Audit date: 2026-07-23

Repository baseline at audit start: `db2e47152614f8ed4d79ce338fd208c488fbbd2b`

Live production SHA observed at audit start: `ba8932b5ecc5c4148c1b5d6d14b27ba6628df281`

Status: production foundation present; release remains no-go until the open controls below pass for the final exact SHA.

Latest read-only candidate audit: <https://github.com/nxttrack/platform/actions/runs/30002149086> for
`e9a57c95216e60303a8e3544ee7d2da6df2e5082`. All 40 environment/project checks, the production host foundation
and the transaction-read-only database inventory passed. The production database remains empty with 65 pending
repository migrations. The workflow's only failure is the absent production SendGrid/SMTP provider secret.

Latest read-only migration rehearsal: <https://github.com/nxttrack/platform/actions/runs/30002255154>. Supabase
CLI dry-run listed all 65 migrations and the database fingerprints before and after were identical.

## GitHub production environment

The `production` environment exists. Repository billing currently exposes no GitHub environment protection rules, so the manual confirmation, exact-SHA evidence binding, canonical `main` source and non-automatic production dispatch remain mandatory compensating controls.

Required routing/runtime variables are present and consistent: production environment/Node mode, apex/admin URLs, `nxttrack.nl` tenant suffix/base domain, reserved subdomains, port `3800`, service `nxttrack-production`, strict database/commit health checks and critical runtime smoke routes.

Bootstrap controls are safe:

- `BOOTSTRAP_PLATFORM_OWNER=false`
- `BOOTSTRAP_PLATFORM_OWNER_RESET_PASSWORD=false`
- no production bootstrap temporary-password secret is present

Dedicated `AUTH_CODE_PEPPER` and `EMAIL_SETTINGS_SECRET` secrets were added during this audit. Existing Supabase/session secrets remain environment-scoped. Legacy Supabase anon/service-role names are accepted by the deploy fallback; migration to publishable/secret key names is non-blocking.

## Domains, Caddy, service and port

- `nxttrack.nl`, `www.nxttrack.nl`, `admin.nxttrack.nl` and a wildcard tenant hostname resolve to `128.140.93.95`.
- All three public production hosts answer over TLS through Caddy.
- The live health endpoint reports environment `production` at the older SHA recorded above; this is not the final release candidate.
- Exact Caddy configuration, systemd state, release/shared directories and port reservation are revalidated by the read-only production foundation workflow on every candidate SHA.

## Supabase linkage

The foundation audit proves without printing credentials that:

- production `DATABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` identify the same project;
- the production API endpoint responds;
- production and staging project fingerprints differ;
- database inventory runs inside `BEGIN READ ONLY` and reports migration/RLS/Auth/Storage state.

Provider backup retention cannot be accepted while the production project is on Free. Upgrade to Pro and record the dashboard retention before go-live. Storage object bytes need a separate backup path.

## SendGrid and mail

Public DNS currently exposes SPF, DMARC and SendGrid DKIM selectors `s1`/`s2`. Production now records:

- `SMTP_FROM_EMAIL=noreply@nxttrack.nl`
- `SMTP_FROM_NAME=NXTTRACK`
- `EMAIL_DKIM_SELECTOR=s1`
- `EMAIL_DELIVERY_TIMEOUT_MS=15000`

Open blocker: the GitHub production environment has no `SENDGRID_API_KEY`/SMTP password, and a first-install database cannot yet supply an encrypted platform setting. Add the production provider secret before the final foundation audit, then send and record one controlled production test after schema initialization.

## Open go-live controls

- [ ] Upgrade production Supabase to Pro and record provider backup retention.
- [ ] Implement/test off-platform Storage object backups for both private buckets.
- [ ] Add a production SendGrid API key or SMTP password and pass a controlled delivery test.
- [ ] Run foundation audit and migration rehearsal for the final exact SHA.
- [x] Confirm screenshots and release evidence persist as downloadable GitHub artifacts.
- [ ] Decide and rehearse the one-time production owner creation path if the production Auth schema remains empty; keep the deploy bootstrap flag disabled by default and remove any temporary password immediately.
- [ ] Complete the generated exact-SHA go/no-go form.
