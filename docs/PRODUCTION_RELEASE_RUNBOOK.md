# Production release and runtime rollback runbook

Status: prepared, not authorization to deploy. Production promotion remains blocked until every exact-SHA go/no-go item is complete.

Last reviewed: 2026-09-20. For the next ordinary deployment, preserve the existing owner account, mail configuration and monitoring activation. The first-install steps below apply only when those capabilities are being provisioned for the first time or through an explicitly authorized recovery. This document records preparation, not completion of a new application deployment.

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

The workflow may only be dispatched from `main`. It requires literal production confirmation, a staging SHA equal to the workflow SHA, a recorded approval reference and successful staging/foundation/migration-rehearsal run IDs for that same SHA. The staging run must contain a successful deploy and the complete successful staging browser gate; skipped validation steps are not sufficient. Production migration recovery uses the same `staging_release_run_id` evidence binding.

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

- For a first install, verify the agreed Supabase production plan and record the provider's backup retention. The original infrastructure baseline calls for Pro; an existing deployment must be checked against its recorded SLA before changing its subscription. This checklist is not evidence of the current project's plan.
- Confirm a complete encrypted object backup for all seven required buckets: `tenant-documents`, `diploma-vault`, `participant-media`, `badge-studio-assets`, `tenant-media-assets`, `portal-theme-assets` and `portal-theme-imports`. Database backups contain Storage metadata, not the object bytes. Follow the [Storage backup runbook](STORAGE_BACKUP_RUNBOOK.md).
- Check the scheduled-operations installation prerequisites before activation. The next normal deployment installs the content-versioned worker and backup scripts; existing workers continue until then. See [Operational preparation](audits/2026-09-20-deploy-readiness/operations.md) for installation, retained encryption keys, verification and the distinct local/artifact retention periods.
- Complete [Upload security](UPLOAD_SECURITY_RUNBOOK.md): ClamD is current and reachable by the production service, `UPLOAD_MALWARE_SCAN_MODE=required`, and clean/fail-closed upload probes pass.
- Record the current live production SHA from `/api/health` and the current symlink target on the VPS.
- Confirm Caddy validates and `nxttrack-production` is healthy before touching it.
- Keep persistent `BOOTSTRAP_PLATFORM_OWNER` and its reset flag `false`. Select the one-run
  `bootstrap_platform_owner` dispatch input only for the approved first install; it does not change the stored
  environment variable.
- Set `RUN_DB_MIGRATIONS=true` only when the reviewed first-install/change set is authorized. Return it to `false` immediately after the successful release.
- Verify the existing mail configuration and approved sender through the foundation audit. For an ordinary deployment, preserve the authoritative database-backed settings and the existing `EMAIL_SENDING_ENABLED` value; do not enable a disabled sender simply because a release is being deployed. The SendGrid first-release/bootstrap fallback is relevant only for the authorized first-install flow.
- Record a one-time owner-creation step only when a first install or explicit recovery requires it. Existing owners keep their account and password during ordinary deployment; do not leave bootstrap or password-reset flags enabled as persistent production configuration.
- Keep `NEWSLETTER_DELIVERY_ENABLED=false` for the current concept-only newsletter implementation.

## 3. Dispatch production

Use Actions > Deploy NXTTRACK > Run workflow on `main`:

| Input | Required value |
| --- | --- |
| `target` | `production` |
| `staging_release_sha` | exact `RELEASE_SHA` |
| `staging_release_run_id` | successful exact-SHA staging run, including the full browser-validation job |
| `production_confirmation` | `PROMOTE_PRODUCTION` |
| `production_approval_reference` | immutable approval reference |
| `production_foundation_run_id` | successful exact-SHA run ID |
| `production_migration_rehearsal_run_id` | successful exact-SHA run ID |
| `bootstrap_platform_owner` | `true` only for the approved first install; otherwise `false` |

Watch every step. The workflow checks repository truth, evidence binding, migrations, hardening, build, atomic symlink activation, systemd, Caddy, health, runtime routes and 90-day production release evidence. Do not manually bypass a failed step.

## 4. Immediate verification

Within five minutes:

1. `https://nxttrack.nl/api/health` reports `ok=true`, `env=production`, `commitSha=RELEASE_SHA`, and both `checks.database.status=pass` and `checks.schemaCompatibility.status=pass`. Use `EXPECTED_RELEASE_SHA` and `EXPECTED_APP_ENV=production` for the health command.
2. Apex, `www` and `admin` have valid TLS and expected routing.
3. A controlled tenant hostname resolves through the wildcard route.
4. Verify that the existing platform owner can log in. Only a newly created or explicitly reset first-install/recovery account must change its generated temporary password; ordinary deployment does not reset it.
5. Verify the existing database-backed production mail settings in Platform Admin. The singleton row is authoritative after migration; the environment fallback does not override an intentionally disabled or incomplete row. Enable SendGrid only as part of an authorized first activation, after its configuration and sender checks pass.
6. For an authorized first mail activation or a delivery-affecting configuration change, send one controlled test to an explicitly authorized recipient and verify the delivery record, provider response, inbox receipt and authentication headers. For an ordinary deployment with unchanged mail settings, inspect existing evidence and queue health; the release itself does not instruct sending a new message. Sandbox validation alone does not prove inbox delivery.
7. Confirm the production release-evidence artifact is downloadable.
8. Restore `RUN_DB_MIGRATIONS=false` and reconfirm both bootstrap flags are `false`.
9. Start the 30-minute observation window and preserve the existing monitoring configuration. A first monitoring activation follows the separate checklist below.

First production monitoring activation uses `Operational monitor` with `target=production`. Run a manual `probe`,
then a separately confirmed `drill`; only after both pass and the alert is received may the production
environment variable `MONITORING_ENABLED` be changed to `true`. The scheduled workflow evaluates staging and
production independently, with environment-scoped URLs, database credentials and alert configuration. An ordinary deployment preserves a previously activated monitor; repeat the external drill only when separately authorized and required by a monitoring change. See [Operations and incident runbook](OPERATIONS_INCIDENT_RUNBOOK.md).

## Runtime rollback

Use runtime rollback for an application regression when the database remains compatible. It does not undo database writes or migrations. Never select a target just because its directory is newest: failed builds and older incompatible applications may still be retained.

1. Declare the incident and stop further deploys.
2. Record current health, failing SHA, last known-good SHA and timestamps.
3. On the VPS, list release directories and resolve the current symlink without changing them.
4. Select an exact known-good release directory built by the trusted workflow, with its immutable `artifacts/exact-source-sha.json` and matching production release evidence.
5. Run the check-only command below. It checks containment inside the production release root, certified Git ancestry, environment identity, packaged schema contract, identical migration trees and current exact-SHA database/schema health before switching anything. A complete source checkout with full Git history and the certified Node version is required.
6. For an incident rollback that must remain active, perform the separately reviewed recovery using the validated artifact and matching environment metadata. A bare symlink change is insufficient because all canonical releases use `shared/.env`, including its release SHA. Preserve the original environment before changing it.
7. Re-run exact-SHA health, public routes, admin routing, tenant routing and login smoke checks; record the active SHA and preserve evidence.

The repository rehearsal requires **both** the environment and exact release directory. Start with read-only validation:

```bash
scripts/release/rehearse-runtime-rollback.sh production \
  /var/www/nxttrack/production/releases/<known-good-release> --check-only
```

For an authorized live rehearsal, run the same command without `--check-only`. This temporarily activates the validated candidate in maintenance mode, with mail and internal workers disabled, verifies its exact SHA and database/schema health, then restores the exact original environment and release. It also attempts restoration on errors and signals. If restoration fails, it retains the private environment snapshot and reports its path. A rehearsal always restores the original release; it is not an incident command that leaves the candidate active.

Inactive releases inherit the shared environment's current SHA. The rehearsal accepts this only when `.env` actually links to this deployment's shared file and an immutable artifact and matching release evidence independently identify the candidate. It never rewrites an artifact to make a mismatch pass. Build timestamps unavailable from the original inactive artifact's environment are left empty during the temporary rehearsal rather than copied from the current build.

The automated rehearsal deliberately accepts only the same migration tree and schema contract as the healthy active release. A cross-schema rollback, a July-era pre-V4 build, missing evidence or an unrelated Git lineage stops before activation. Use a forward fix or a separately verified database recovery for those cases. Do not run SQL down-migrations automatically; existing session authorization determines whether a separate destructive-action approval is still needed.

## Stop conditions

Immediately choose no-go or rollback when any of these occurs:

- live health SHA differs from the approved SHA;
- database probe, migration or RLS audit fails;
- apex/admin/tenant routing or TLS is inconsistent;
- platform owner cannot authenticate or crosses a tenant boundary;
- a required and authorized controlled mail test fails;
- release evidence cannot be retained;
- no known-good runtime target or database recovery point is available.

## One-time platform owner

The deploy-integrated bootstrap runs after migrations and before release activation when its one-run input is explicitly selected. Persistent production variables remain `false`; ordinary deployments leave `bootstrap_platform_owner=false` and preserve the existing owner. The first-install/recovery input is the only create/repair trigger.

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
