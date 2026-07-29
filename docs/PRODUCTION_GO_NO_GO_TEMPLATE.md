# NXTTRACK production go/no-go

Generated at: `{{GENERATED_AT}}`

Candidate SHA: `{{CANDIDATE_SHA}}`

Staging release run ID: `{{STAGING_RUN_ID}}`

Production foundation run ID: `{{FOUNDATION_RUN_ID}}`

Production migration rehearsal run ID: `{{MIGRATION_REHEARSAL_RUN_ID}}`

This form is valid for this exact 40-character SHA only. A code, workflow, dependency, migration or runbook change invalidates the decision and requires a new form and fresh evidence.

## Release identity

- [ ] `git rev-parse origin/main` equals `{{CANDIDATE_SHA}}`.
- [ ] `https://staging.nxttrack.nl/api/health` reports commit `{{CANDIDATE_SHA}}`, `ok=true` and a passing database probe.
- [ ] Staging run `{{STAGING_RUN_ID}}` succeeded for this SHA.
- [ ] Priority A screenshots and release evidence are downloadable artifacts on that run.
- [ ] Product-owner visual approval is recorded for this SHA or an explicitly documented maintenance-equivalent SHA.

## Production foundation

- [ ] Foundation run `{{FOUNDATION_RUN_ID}}` succeeded for this SHA.
- [ ] Production and staging Supabase fingerprints differ; production `DATABASE_URL` and API URL identify the same project.
- [ ] Caddy configuration validates; apex, `www`, `admin` and wildcard tenant TLS routes are present.
- [ ] `nxttrack-production` and port `3800` pass the read-only host audit.
- [ ] Production Supabase is Pro and the backup retention visible in the dashboard is recorded.
- [ ] A separate backup/export route exists for objects in `tenant-documents`, `diploma-vault`, `participant-media` and `badge-studio-assets`.

## Database and security

- [ ] Migration rehearsal `{{MIGRATION_REHEARSAL_RUN_ID}}` succeeded for this SHA and its before/after fingerprint is unchanged.
- [ ] The exact set of pending migrations has been reviewed.
- [ ] Security advisor, migration, RLS and dependency audits are green.
- [ ] `RUN_DB_MIGRATIONS` is changed only for the approved migration window and will be returned to `false` immediately afterwards.
- [ ] Runtime rollback target and database recovery point are recorded before writes start.

## Identity and communications

- [ ] `BOOTSTRAP_PLATFORM_OWNER=false` and `BOOTSTRAP_PLATFORM_OWNER_RESET_PASSWORD=false` in the production environment.
- [ ] If an initial owner is still required, the separate one-time bootstrap procedure and immediate secret removal are approved.
- [ ] The `bootstrap_platform_owner` dispatch input is `true` only for the approved first install and persistent
      bootstrap/reset variables remain `false`.
- [ ] Production SendGrid/SMTP provider secret, `noreply@nxttrack.nl`, `NXTTRACK`, SPF, DKIM and DMARC have passed the communications audit.
- [ ] A controlled production delivery test has status `sent`; no test recipient or secret appears in logs.

## Operations

- [ ] Incident owner, support owner and alert destination are confirmed.
- [ ] Monitoring values and post-deploy activation time are recorded.
- [ ] Deploy operator and rollback operator are present for the release window.
- [ ] A 30-minute post-release observation window is reserved.

## Decision

- Decision: `GO / NO-GO`
- Decision time (UTC):
- Product owner:
- Technical operator:
- Incident owner:
- Approval reference:
- Known accepted risks:
- Rollback target:
- Database recovery point:
