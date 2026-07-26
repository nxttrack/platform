# Phase 15 - Staging Truth And Security Validation

Status: implemented as a strict staging validation gate. The gate passes only when the real staging environment can run migrations, Supabase advisors, role-based RLS checks, live Playwright smoke tests and the strict launch gate.

## Goal

Prove that the MVP code works against `https://staging.nxttrack.nl` and that organization isolation is intact before broader operational flow validation starts.

## Implemented

- `pnpm run phase15:staging` orchestrates the full Phase 15 validation.
- Supabase migrations are forced on for the Phase 15 run through `RUN_DB_MIGRATIONS=true`.
- Supabase advisors run through `pnpm run db:advisors` with `--fail-on error`.
- RLS role smoke is required for platform owner, organization admin, instructor and parent.
- `admin@nxttrack.nl` is enforced as the platform-owner validation account.
- Tenant-scoped REST checks verify that visible rows with `tenant_id` stay inside the user's own organization.
- Authenticated Playwright workflows fail when required `E2E_*` credentials are missing.
- Live Playwright runs against `PLAYWRIGHT_BASE_URL=https://staging.nxttrack.nl`.
- The strict staging launch gate runs after RLS and Playwright pass.
- The staging deploy workflow runs Phase 15 by default on the `staging` branch unless `RUN_PHASE_15_VALIDATION=false` is explicitly set.

## Required Staging Secrets

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- `E2E_PLATFORM_OWNER_PASSWORD`
- `E2E_TENANT_ADMIN_PASSWORD`
- `E2E_INSTRUCTOR_PASSWORD`
- `E2E_PARENT_PASSWORD`

## Required Staging Variables

- `APP_ENV=staging`
- `APP_URL=https://staging.nxttrack.nl`
- `NEXT_PUBLIC_APP_URL=https://staging.nxttrack.nl`
- `E2E_PLATFORM_OWNER_EMAIL=admin@nxttrack.nl`
- `E2E_TENANT_ADMIN_EMAIL`
- `E2E_INSTRUCTOR_EMAIL`
- `E2E_PARENT_EMAIL`
- `LOVABLE_VISUAL_CHECK_CONFIRMED=true`
- `SUPABASE_BACKUPS_CONFIRMED=true`
- `ROLLBACK_REHEARSAL_CONFIRMED=true`

## Optional Variables

- `RUN_PHASE_15_VALIDATION=false` bypasses the deploy-time Phase 15 gate.
- `PHASE15_SKIP_PLAYWRIGHT_INSTALL=true` skips the Chromium install step when the runner already has browsers installed.
- `SUPABASE_ADVISOR_TYPE=all`
- `SUPABASE_ADVISOR_LEVEL=error`
- `SUPABASE_ADVISOR_FAIL_ON=error`
- `DB_MIGRATE_INCLUDE_ALL=true` allows out-of-order local migrations to be included during `db push`.

## Acceptance

- All migrations apply cleanly to staging.
- Supabase advisors return no unresolved error-level findings.
- The four required roles can sign in and pass RLS checks.
- Tenant-scoped data visible to organization roles does not leak across organizations.
- Live Playwright staging smoke and authenticated workflows pass.
- Strict staging launch gate is green.
