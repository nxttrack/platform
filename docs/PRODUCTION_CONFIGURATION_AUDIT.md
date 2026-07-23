# Production configuration audit

Audit date: 2026-07-23

Repository baseline at audit start: `db2e47152614f8ed4d79ce338fd208c488fbbd2b`

Live production SHA observed at audit start: `ba8932b5ecc5c4148c1b5d6d14b27ba6628df281`

Status: production foundation present; release remains no-go until the open controls below pass for the final exact SHA.

Latest successful read-only candidate audit: <https://github.com/nxttrack/platform/actions/runs/30005553727> for
`983abaa13e1bab545b8773aa740d9eaaa21d9bef`. All 40 environment/project checks, the production host foundation,
the transaction-read-only database inventory and all eight mail configuration checks passed. The production
database remains empty with 65 pending repository migrations.

Latest read-only migration rehearsal: <https://github.com/nxttrack/platform/actions/runs/30003666813>. Supabase
CLI dry-run listed all 65 migrations and the database fingerprints before and after were identical.

Exact-SHA CI passed in <https://github.com/nxttrack/platform/actions/runs/30002916927>. Exact-SHA staging
deployment, all browser gates, 56 visual captures and release-evidence upload passed in
<https://github.com/nxttrack/platform/actions/runs/30002927818>.

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

The GitHub production environment now has a `SENDGRID_API_KEY`; the foundation audit proves its presence without
printing or using it. This is the first-release/bootstrap fallback. After schema initialization, the singleton
database setting is authoritative and the provider must be enabled through Platform Admin, as on staging. Send
and record one controlled production test after that activation.

## Open go-live controls

- [ ] Upgrade production Supabase to Pro and record provider backup retention.
- [x] Implement and test the encrypted off-platform Storage backup/restore route for both private buckets on
  staging; run `30012250717` proves export, encryption, restore, remote checksum and zero-object cleanup.
- [ ] Store the production encryption passphrase independently and create the first encrypted production
  Storage recovery point during the approved release window.
- [x] Add a production SendGrid API key and pass the non-sending provider/DNS foundation audit.
- [ ] Enable the database-backed production provider and pass a controlled delivery test after first install.
- [ ] Run foundation audit and migration rehearsal for the final exact SHA.
- [x] Confirm screenshots and release evidence persist as downloadable GitHub artifacts.
- [ ] Rehearse and record the one-time owner path. The chosen route is a one-run deploy input while persistent
  bootstrap/reset variables remain `false`; the script preserves existing security fields and never prints a
  generated undelivered password.
- [ ] Complete the generated exact-SHA go/no-go form.
