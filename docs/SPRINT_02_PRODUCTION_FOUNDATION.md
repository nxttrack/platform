# Sprint 2 - Production Foundation

Status: preflight in progress. Acceptance remains dependent on Sprint 1's two explicit human confirmations. No production migration or deployment is authorized by this work.

## Sprint Outcome

Make the existing GitHub `production` environment isolated, fail-closed and inspectable before any production database or runtime is changed.

## Baseline Inventory

Read-only GitHub environment inventory on 2026-07-21 found:

- the `production` environment exists but has no environment protection rules;
- `APP_URL`, `NEXT_PUBLIC_APP_URL`, `PLATFORM_ADMIN_URL`, port `3800` and service `nxttrack-production` were already present;
- `E2E_BASE_URL` incorrectly referenced `aquaswim-demo.staging.nxttrack.nl`;
- six legacy-named production secrets exist: database URL, public Supabase URL/key, service-role key and session/JWT secrets;
- secret names alone cannot prove that production and staging use different Supabase projects;
- migration, bootstrap, strict-health, routing and smoke defaults were incomplete.

## Implemented Preflight Controls

- [x] Removed the production `E2E_BASE_URL` staging reference.
- [x] Added explicit production marketing, admin, tenant and reserved-host routing variables.
- [x] Set `RUN_DB_MIGRATIONS=false`, `DB_MIGRATE_DRY_RUN=false` and `DB_MIGRATE_INCLUDE_ALL=false`.
- [x] Set owner bootstrap and password reset defaults to `false`.
- [x] Require database health, release commit metadata and strict health behavior.
- [x] Added explicit public runtime smoke routes.
- [x] Added a manually dispatched, read-only `Production foundation audit` workflow.
- [x] Compare staging and production Supabase project identities using one-way SHA-256 fingerprints; raw project identities and credentials are never printed.
- [x] Verify that production `DATABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` refer to the same project.
- [x] Added a read-only runner audit for production directories, systemd, Caddy and port reservation.
- [x] Added a transaction-read-only production database inventory with repository/remote migration parity reporting.
- [x] Require a recorded `production_approval_reference` for any future production deployment.

## Read-Only Audit

Dispatch `.github/workflows/production-foundation-audit.yml` from `main` with:

```txt
confirmation=AUDIT_PRODUCTION_FOUNDATION
```

The workflow may read environment configuration and host state, but it cannot:

- run migrations;
- bootstrap a user;
- restart systemd or reload Caddy;
- write deployment directories;
- change DNS;
- deploy the application.
- write to the production database; PostgreSQL enforces `default_transaction_read_only=on` for the inventory connection.

Expected evidence:

```txt
Environment contract: pass / blocked
Supabase project isolation: pass / blocked
Production host foundation: pass / blocked
Audit run:
Audited SHA:
```

## Protection And Authority

GitHub currently reports no protection rules for the `production` environment. Until required reviewers can be configured, the compensating controls are:

1. manual workflow dispatch from `main` only;
2. exact full SHA equality with a staging-validated commit;
3. literal `PROMOTE_PRODUCTION` confirmation;
4. a non-empty recorded approval reference;
5. no automatic production trigger;
6. a separate explicit user authorization before Sprint 5 promotion.

Open ownership record:

```txt
Release authority:
Rollback owner:
Infrastructure owner:
Approval record location:
Environment reviewer limitation/decision:
```

## Remaining Sprint Tasks

- [ ] Run the read-only audit and record its exact result.
- [ ] Resolve every failed environment, project-isolation or host-foundation check.
- [ ] Identify the production Supabase project and owner without exposing credentials.
- [ ] Produce a read-only production database inventory; do not run migrations.
- [ ] Confirm DNS/TLS intent for `nxttrack.nl`, `www.nxttrack.nl`, `admin.nxttrack.nl` and `*.nxttrack.nl`.
- [ ] Record release authority, rollback owner and infrastructure owner.
- [ ] Configure GitHub environment reviewers, or accept and name the compensating control.
- [ ] Write the migration rehearsal and rollback plan for Sprint 5.

## Definition Of Done

- Production configuration contains no accidental staging host or credential reference.
- Staging and production Supabase project identities are demonstrably different.
- Production database state is inventoried without mutation.
- Host, systemd, Caddy, TLS and release-directory prerequisites are known and resolved.
- Release authority, approval evidence and rollback ownership are recorded.
- Production remains undeployed until explicit Sprint 5 authorization.
