# Phase 22 - Production Readiness And Commercial Launch

Status: launch-readiness foundation in progress. Staging is technically healthy; production remains blocked on explicit product-owner approval and provider-side backup confirmation.

## Completed Evidence

- Canonical releases originate from `main`.
- The live staging health endpoint proves the deployed commit and database reachability.
- Migrations, Supabase advisors, four-role RLS smoke tests and live browser tests run in the staging deployment workflow.
- The previous runtime release was activated, checked and replaced by the original healthy release in the rollback rehearsal.
- All 56 canonical staging screenshots are captured against the exact deployed SHA.
- Placeholder instructions and internal Lovable terminology no longer appear as public-facing marketing copy.

## Logical Backup/Restore Rehearsal

The manual `Staging backup restore rehearsal` workflow reads the staging `DATABASE_URL`, creates a PostgreSQL custom-format dump of the application-owned `public` and `app_private` schemas, and restores it into an isolated disposable PostgreSQL 17 container.

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

- Product owner reviews the SHA-bound staging contact sheets and explicitly accepts intentional canon differences before `LOVABLE_VISUAL_CHECK_CONFIRMED=true` is set.
- Infrastructure owner checks Supabase backup retention and restore options for the staging project before `SUPABASE_BACKUPS_CONFIRMED=true` is set.
- Production environment, monitoring destinations, support ownership and commercial launch timing are approved separately.

## Production Boundary

No production deployment, DNS change, data copy or launch approval is part of this phase pass. A green staging gate is necessary evidence, not automatic authorization to promote to production.

