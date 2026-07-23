# Sprint 2 - Production Foundation

Status: the core production foundation is technically proven for the accepted application candidate. Production
mail, provider backup controls and final promotion authorization remain separate go-live gates. No production
migration or deployment is authorized by this work.

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
- [x] Added a separate dry-run migration rehearsal with before/after database fingerprint equality.
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

Latest evidence: <https://github.com/nxttrack/platform/actions/runs/29870133969>

- Environment contract: all checks pass, including API reachability, distinct staging/production project fingerprints and internal production secret consistency.
- Host foundation: passes for release/shared directories, systemd, active Caddy, read-only Caddyfile adaptation, explicit apex/`www`/`admin`/wildcard routes, port `3800`, public TLS and wildcard DNS.
- Database inventory: transaction-read-only pass on PostgreSQL 17.6.
- Empty production baseline: 0 public tables, 0 Auth users, 0 Storage objects, no remote migration history and 62 repository migrations pending.
- No production database or runtime state was changed by the audit.

Current candidate evidence:

- Read-only foundation audit: <https://github.com/nxttrack/platform/actions/runs/30002149086>
- Audited SHA: `e9a57c95216e60303a8e3544ee7d2da6df2e5082`
- Environment/project contract: all 40 checks pass; staging and production Supabase identities are different.
- Host: release/shared directories, systemd, Caddy, apex/`www`/admin/wildcard routes, TLS, DNS and port `3800` pass.
- Database inventory: PostgreSQL 17.6, 0 public tables, 0 Auth users, 0 Storage objects and 65 pending repository migrations.
- The overall workflow stops only on the absent production SendGrid/SMTP secret. Sender, timeout, SPF, DMARC and
  DKIM pass. Provider-secret activation and controlled delivery belong to the communications/go-live gate.
- No production database or runtime state was changed.

## Protection And Authority

GitHub currently reports no protection rules for the `production` environment. An attempt to enable environment branch/reviewer protection returned HTTP 422 because the repository billing plan does not support the required protection rule. The accepted technical compensating controls are:

1. manual workflow dispatch from `main` only;
2. exact full SHA equality with a staging-validated commit;
3. literal `PROMOTE_PRODUCTION` confirmation;
4. a non-empty recorded approval reference;
5. no automatic production trigger;
6. a separate explicit user authorization before Sprint 5 promotion.
7. successful foundation-audit and migration-rehearsal run IDs bound to the exact production SHA.

Initial-launch ownership record:

```txt
Release authority: Danny Goldenbelt
Rollback owner: Danny Goldenbelt
Infrastructure owner: Danny Goldenbelt
Approval record location: generated exact-SHA go/no-go form plus linked GitHub Actions runs
Environment reviewer limitation/decision: GitHub plan does not expose environment reviewers; accepted
  compensation is manual main-only dispatch, literal confirmation, exact-SHA evidence and explicit authorization
```

## Remaining Sprint Tasks

- [x] Run the read-only audit and record its exact result.
- [x] Restore or replace the unreachable production Supabase project and update the production-only secret set.
- [x] Resolve every failed environment, project-isolation or host-foundation check.
- [x] Identify the production Supabase project boundary and owner without exposing credentials.
- [x] Produce a read-only production database inventory; do not run migrations.
- [x] Confirm DNS/TLS intent for `nxttrack.nl`, `www.nxttrack.nl`, `admin.nxttrack.nl` and `*.nxttrack.nl`.
- [x] Record release authority, rollback owner and infrastructure owner.
- [x] Configure GitHub environment reviewers, or accept and name the SHA-bound evidence/confirmation controls as the billing-plan compensation.
- [x] Write the migration rehearsal and rollback plan for Sprint 5.

Detailed plan: [Production Migration And Rollback Plan](SPRINT_02_PRODUCTION_MIGRATION_PLAN.md).

## Definition Of Done

- Production configuration contains no accidental staging host or credential reference.
- Staging and production Supabase project identities are demonstrably different.
- Production database state is inventoried without mutation.
- Host, systemd, Caddy, TLS and release-directory prerequisites are known and resolved.
- Release authority, approval evidence and rollback ownership are recorded.
- Production remains undeployed until explicit Sprint 5 authorization.
