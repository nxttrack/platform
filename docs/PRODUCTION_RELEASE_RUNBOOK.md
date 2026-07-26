# Production release and runtime rollback runbook

Status: prepared, not authorization to deploy. Production promotion remains blocked until every exact-SHA go/no-go item is complete.

## Fixed production contract

| Item | Value |
| --- | --- |
| Canonical branch | `main` |
| Release source | a full SHA already validated on staging |
| Platform URL | `https://nxttrack.nl` |
| Admin URL | `https://admin.nxttrack.nl` |
| Tenant suffix | `nxttrack.nl` |
| VPS base directory | `/var/www/nxttrack/production` |
| systemd service | `nxttrack-production` |
| application port | `3800` |
| Active release | `/var/www/nxttrack/production/current` |
| Shared environment | `/var/www/nxttrack/production/shared/.env` |

The workflow may only be dispatched from `main`. It requires literal production confirmation, a staging SHA equal to the workflow SHA, a recorded approval reference and successful foundation/migration-rehearsal run IDs for that same SHA.

## 1. Prepare exact-SHA evidence

```bash
git fetch origin main
git rev-parse origin/main
```

Record the full value as `RELEASE_SHA`. Do not use a seven-character abbreviation in approvals.

1. Deploy `RELEASE_SHA` to staging and wait for the deploy plus browser-validation job.
2. Verify the live staging health commit, all 56 Priority A screenshots and release-evidence artifacts.
3. Dispatch `production-foundation-audit.yml` from `main` with `AUDIT_PRODUCTION_FOUNDATION`.
4. Dispatch `production-migration-rehearsal.yml` from `main` with `REHEARSE_PRODUCTION_MIGRATIONS`.
5. Confirm both runs succeeded for `RELEASE_SHA`, not merely for the branch name.
6. Generate the form:

```bash
RELEASE_CANDIDATE_SHA="$RELEASE_SHA" \
STAGING_RELEASE_RUN_ID="<run-id>" \
PRODUCTION_FOUNDATION_RUN_ID="<run-id>" \
PRODUCTION_MIGRATION_REHEARSAL_RUN_ID="<run-id>" \
pnpm run release:create-go-no-go
```

Complete the generated file under `artifacts/production-go-no-go/` and store the signed decision outside the mutable workspace.

## 2. Pre-deploy controls

- Upgrade the production Supabase project to Pro and record the visible backup retention.
- Confirm an object-backup route for `tenant-documents` and `diploma-vault`; database backups contain Storage metadata, not the object bytes.
- Complete [Upload security](UPLOAD_SECURITY_RUNBOOK.md): ClamD is current and reachable by the production service, `UPLOAD_MALWARE_SCAN_MODE=required`, and clean/fail-closed upload probes pass.
- Record the current live production SHA from `/api/health` and the current symlink target on the VPS.
- Confirm Caddy validates and `nxttrack-production` is healthy before touching it.
- Keep persistent `BOOTSTRAP_PLATFORM_OWNER` and its reset flag `false`. Select the one-run
  `bootstrap_platform_owner` dispatch input only for the approved first install; it does not change the stored
  environment variable.
- Set `RUN_DB_MIGRATIONS=true` only when the reviewed first-install/change set is authorized. Return it to `false` immediately after the successful release.
- Ensure the SendGrid first-release/bootstrap fallback and approved sender pass the foundation audit.
- Record the separately authorized one-time owner-creation step. Do not leave bootstrap or password-reset flags
  enabled as persistent production configuration.

## 3. Dispatch production

Use Actions > Deploy NXTTRACK > Run workflow on `main`:

| Input | Required value |
| --- | --- |
| `target` | `production` |
| `staging_release_sha` | exact `RELEASE_SHA` |
| `production_confirmation` | `PROMOTE_PRODUCTION` |
| `production_approval_reference` | immutable approval reference |
| `production_foundation_run_id` | successful exact-SHA run ID |
| `production_migration_rehearsal_run_id` | successful exact-SHA run ID |
| `bootstrap_platform_owner` | `true` only for the approved first install; otherwise `false` |

Watch every step. The workflow checks repository truth, evidence binding, migrations, hardening, build, atomic symlink activation, systemd, Caddy, health, runtime routes and 90-day production release evidence. Do not manually bypass a failed step.

## 4. Immediate verification

Within five minutes:

1. `https://nxttrack.nl/api/health` reports `ok=true`, `env=production`, a passing database probe and `commit=RELEASE_SHA`.
2. Apex, `www` and `admin` have valid TLS and expected routing.
3. A controlled tenant hostname resolves through the wildcard route.
4. The initial platform owner can log in and must change the temporary password.
5. In Platform Admin, enable the database-backed production SendGrid settings. The singleton row is authoritative
   after migration; the environment fallback does not override an intentionally disabled or incomplete row.
6. Send one controlled mail and verify the delivery record, SendGrid response, inbox receipt and authentication
   headers.
7. Confirm the production release-evidence artifact is downloadable.
8. Restore `RUN_DB_MIGRATIONS=false` and reconfirm both bootstrap flags are `false`.
9. Start the 30-minute observation window and enable production monitoring only as described in the monitoring checklist.

Production monitoring activation uses `Operational monitor` with `target=production`. Run a manual `probe`,
then a separately confirmed `drill`; only after both pass and the alert is received may the production
environment variable `MONITORING_ENABLED` be changed to `true`. The scheduled workflow evaluates staging and
production independently, with environment-scoped URLs, database credentials and alert configuration.

## Runtime rollback

Use runtime rollback for an application regression when the database remains compatible. It does not undo database writes or migrations.

1. Declare the incident and stop further deploys.
2. Record current health, failing SHA, last known-good SHA and timestamps.
3. On the VPS, list release directories and resolve the current symlink without changing them.
4. Select the exact previous release directory already built by the trusted workflow.
5. Atomically repoint `current`, restart `nxttrack-production`, and reload Caddy only if its configuration changed.
6. Re-run health, public routes, admin routing, tenant routing and login smoke checks.
7. Record the active rollback SHA and preserve logs/evidence.

The repository rehearsal command is:

```bash
scripts/release/rehearse-runtime-rollback.sh production
```

Do not run SQL down-migrations automatically. If schema or data must be restored, follow the database restore runbook and require separate destructive-action approval.

## Stop conditions

Immediately choose no-go or rollback when any of these occurs:

- live health SHA differs from the approved SHA;
- database probe, migration or RLS audit fails;
- apex/admin/tenant routing or TLS is inconsistent;
- platform owner cannot authenticate or crosses a tenant boundary;
- controlled mail fails;
- release evidence cannot be retained;
- no known-good runtime target or database recovery point is available.

## One-time platform owner

The deploy-integrated bootstrap runs after migrations and before release activation. Persistent production
variables remain `false`; the first-install workflow input is the only create/repair trigger.

The script:

- refuses a staging rehearsal if the expected owner does not already exist;
- creates or repairs the profile, security row and active `platform_owner` membership;
- preserves existing security fields during an idempotent repair;
- marks a newly created/reset account for forced password change;
- uses the production SendGrid fallback to deliver a generated temporary password;
- never prints a generated password when delivery is unavailable;
- re-reads profile, security and membership postconditions before reporting success.

Staging rehearsal is performed by `Staging platform-owner bootstrap rehearsal` with:

```txt
confirmation=REHEARSE_EXISTING_PLATFORM_OWNER
```

That rehearsal never creates an Auth user, changes a password or sends mail. It proves the idempotent
create/repair boundary against the existing controlled staging owner. The earlier staging bootstrap plus
successful human login proves the create/reset/login path.

Passing rehearsal evidence: [run 30012816446](https://github.com/nxttrack/platform/actions/runs/30012816446)
on exact SHA `a4b16b74da8d2653d53d5de8f766748863674955`.
