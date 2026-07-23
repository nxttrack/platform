# Phase 22 - Production Readiness And Commercial Launch

Status: staging release candidate approved and technically healthy. Exact-SHA foundation and migration-rehearsal
evidence are available for the accepted application candidate; production remains no-go until Pro backup
controls, database-backed production mail activation, controlled delivery and final go/no-go are complete.

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

## Remaining Manual Gates

- Upgrade production Supabase to Pro, record provider backup retention and establish a separate backup for Storage object bytes.
- Enable the database-backed production SendGrid provider after first install and record a controlled successful
  delivery. The GitHub first-release/bootstrap secret already passes its non-sending audit.
- Re-run foundation, migration rehearsal and staging evidence only when the promoted SHA changes.
- Record production monitoring destinations, incident/support ownership and commercial launch timing.
- Complete and sign the generated exact-SHA go/no-go form.

## Production Boundary

No production deployment, DNS change, data copy or launch approval is part of this phase pass. A green staging gate is necessary evidence, not automatic authorization to promote to production.
