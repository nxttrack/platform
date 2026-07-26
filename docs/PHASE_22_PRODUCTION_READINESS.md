# Phase 22 - Production Readiness And Commercial Launch

Status: completed on 23 July 2026. The approved exact SHA
`08624b16d07bc1536ec4ef3739ff54c48ef7a39e` is live in production with database health, owner access,
database-backed mail delivery, encrypted Storage backup and monitoring proven.

Canonical production procedures:

- [Production configuration audit](PRODUCTION_CONFIGURATION_AUDIT.md)
- [Production release and runtime rollback](PRODUCTION_RELEASE_RUNBOOK.md)
- [Production database and Storage restore](PRODUCTION_DATABASE_RESTORE_RUNBOOK.md)
- [Production incident and monitoring checklist](PRODUCTION_INCIDENT_MONITORING_CHECKLIST.md)
- [Exact-SHA go/no-go template](PRODUCTION_GO_NO_GO_TEMPLATE.md)

## Completed Evidence

- Canonical releases originate from `main`.
- The live staging health endpoint proves the deployed commit and database reachability.
- Migrations, Supabase advisors, four-role RLS smoke tests and live browser tests run in the staging deployment workflow.
- The previous runtime release was activated, checked and replaced by the original healthy release in the rollback rehearsal.
- All 56 canonical staging screenshots are captured against the exact deployed SHA.
- Placeholder instructions and internal Lovable terminology no longer appear as public-facing marketing copy.
- Product-owner visual approval is recorded with no visual release blocker.
- The staging release-candidate workflow passes all Phase 15/16 and Sprint 4 gates.
- Final accepted candidate: `e4b7125ea4efd9fddfc18550c3ddf3fbd7373fcb`.
- Exact-SHA CI: <https://github.com/nxttrack/platform/actions/runs/30002916927>.
- Exact-SHA staging deployment and browser evidence:
  <https://github.com/nxttrack/platform/actions/runs/30002927818>.
- Exact-SHA production migration dry-run:
  <https://github.com/nxttrack/platform/actions/runs/30003666813>.

## Logical Backup/Restore Rehearsal

The manual `Staging backup restore rehearsal` workflow reads the staging `DATABASE_URL`, creates a PostgreSQL custom-format dump of the application-owned `public` and `app_private` schemas, and restores it into an isolated disposable PostgreSQL 17 container.

Latest successful evidence: candidate `892da450a1f475944e4bc610fe12d572630bdbc1` restored all 63 public tables and 65 rows with exact source/target count parity in <https://github.com/nxttrack/platform/actions/runs/29818495140>.

The rehearsal:

1. never writes to the staging source database;
2. restores schema, functions, constraints, RLS policies and application data;
3. compares the source and restored row count for every public table;
4. requires all 63 public tables to be present;
5. records the commit, dump size and dump SHA-256 in the workflow summary;
6. destroys the temporary dump and restore database when the job exits.

Dispatch it from `main` with confirmation `REHEARSE_RESTORE`.

This proves that an application-level logical export is readable and restorable. It deliberately does not claim that Supabase-managed Auth, Storage, provider retention or point-in-time recovery is configured. Those controls remain a separate provider-side check before `SUPABASE_BACKUPS_CONFIRMED=true` may be set.

## Closed Manual Gates

- Production Supabase is Pro and exposes daily physical restore points.
- Encrypted object backup covers `tenant-documents` and `diploma-vault`; the strict post-migration export
  records both buckets and zero objects.
- `participant-media` was added later and requires a new three-bucket backup/restore rehearsal before its
  release gate may be closed.
- The database-backed production SendGrid provider delivered a controlled message.
- The bootstrapped owner received the message, logged in and changed the temporary password.
- The production Slack drill was received and the post-activation monitor probe passed.
- The exact-SHA go/no-go record names the release, recovery point, rollback target and human confirmations.

## Production Boundary After Launch

This completion applies only to the named production SHA. A green staging gate for later work is necessary
evidence, not automatic authorization to promote another SHA. Sprint 6 billing work remains staging-only
until sandbox payment, duplicate webhook and reconciliation evidence is accepted.
