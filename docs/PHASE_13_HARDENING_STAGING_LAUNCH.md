# Phase 13 - Hardening And Staging Launch

Status: hardening automation implemented in code; staging execution and manual launch confirmations are still pending.

## Scope

Phase 13 adds the staging-MVP launch gates needed before product-owner review:

- Static RLS/security coverage audit for all public Supabase tables.
- Explicit deny policies for service-only auth helper tables.
- Playwright smoke tests for health, public routes, private route protection, screenshots, basic accessibility and performance budgets.
- Deploy workflow hardening audits before build.
- Post-deploy health endpoint smoke.
- Optional Playwright staging smoke behind `RUN_PLAYWRIGHT_SMOKE=true`.
- Staging launch gate script with manual confirmations for RLS role tests, Lovable visual review, backups and rollback rehearsal.

## Scripts

Run local hardening:

```bash
pnpm run hardening:local
```

Run Playwright smoke after a production build:

```bash
pnpm build
pnpm --filter @nxttrack/web exec playwright install chromium
pnpm run test:e2e
```

Run against staging:

```bash
PLAYWRIGHT_BASE_URL=https://staging.nxttrack.nl pnpm run test:e2e
APP_URL=https://staging.nxttrack.nl pnpm run staging:health
```

Run strict launch gate only when manual confirmations are true:

```bash
STAGING_LAUNCH_STRICT=true \
APP_ENV=staging \
APP_URL=https://staging.nxttrack.nl \
RLS_STAGING_TESTS_CONFIRMED=true \
PLAYWRIGHT_STAGING_SMOKE_CONFIRMED=true \
LOVABLE_VISUAL_CHECK_CONFIRMED=true \
SUPABASE_BACKUPS_CONFIRMED=true \
ROLLBACK_REHEARSAL_CONFIRMED=true \
pnpm run staging:gate
```

## Required Manual Confirmations

These cannot be truthfully completed by code alone:

- Apply all migrations to staging, including the Phase 13 hardening migration.
- Run Supabase advisors against staging.
- Test RLS with platform owner, tenant admin, instructor and parent accounts.
- Run Playwright against `https://staging.nxttrack.nl`.
- Compare captured screenshots with the Lovable baseline.
- Confirm Supabase backups and restore policy for the staging project.
- Rehearse rollback on the VPS by switching to a previous release and switching back.

## Acceptance

Staging MVP can be marked 100% only when:

- `pnpm run hardening:local` passes.
- Staging deploy workflow passes through hardening, build, migration policy and health smoke.
- `PLAYWRIGHT_BASE_URL=https://staging.nxttrack.nl pnpm run test:e2e` passes.
- Supabase staging advisors have no unresolved critical security findings.
- Manual confirmations in `pnpm run staging:gate` pass with `STAGING_LAUNCH_STRICT=true`.
