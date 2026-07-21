# Sprint 2 - Production Migration And Rollback Plan

Status: read-only rehearsal prepared. This plan does not authorize production migration or deployment.

## Current Baseline

- Production Supabase is separate from staging.
- PostgreSQL version: 17.6.
- Application-owned public tables: 0.
- Auth users: 0.
- Storage objects: 0.
- Remote migration history: absent/0.
- Repository migration files: 62.

The empty baseline means no legacy production schema repair is expected. All application migrations must be treated as one reviewed first-install sequence.

## Read-Only Rehearsal

The manually dispatched `Production migration rehearsal` workflow:

1. requires `REHEARSE_PRODUCTION_MIGRATIONS`;
2. inventories production inside `BEGIN READ ONLY`;
3. runs `supabase db push --dry-run` through the repository migration guard;
4. inventories production again;
5. compares SHA-256 fingerprints of schema counts, RLS counts, migration versions, Auth users and Storage objects;
6. fails if the fingerprints differ.

The Supabase CLI contract states that `--dry-run` prints migrations that would be applied without applying them.

## Actual Migration Boundary

Actual production migration remains Sprint 5 work and requires all of the following:

1. Sprint 1 strict staging gate at zero failures and zero warnings.
2. Exact approved staging SHA recorded.
3. Product, infrastructure and support go/no-go owners recorded.
4. Supabase managed backup/restore point confirmed immediately before migration.
5. Production approval reference recorded.
6. Maintenance/support window active.
7. One explicit migration authorization separate from deployment authorization.
8. Post-migration Advisors, RLS, health and browser smoke evidence.

`RUN_DB_MIGRATIONS` remains `false` in the production environment until this boundary is explicitly opened.

## Rollback Strategy

Runtime rollback and database recovery are separate:

- Runtime: atomically repoint `/var/www/nxttrack/production/current` to the last known-good release and restart `nxttrack-production`.
- Database: prefer backward-compatible expand/contract migrations so the prior runtime can continue operating.
- Destructive schema reversal is not performed ad hoc.
- If a migration causes unrecoverable data/schema failure, use the confirmed Supabase restore point/PITR procedure owned by the infrastructure owner.
- Rollback triggers include failed migration, failed database-aware health, P0/P1 authorization regression, persistent 5xx, or critical tenant-routing failure.

Target recovery records still requiring owner approval:

```txt
Migration authority:
Runtime rollback owner:
Database restore owner:
Maintenance window:
Target RTO:
Target RPO:
Approval reference:
```
