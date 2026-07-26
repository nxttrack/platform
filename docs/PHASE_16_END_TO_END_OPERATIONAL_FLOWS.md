# Phase 16 - End-To-End Operational Flows

Status: implemented as an idempotent staging flow runner with authenticated dashboard coverage.

## Goal

Prove that the canonical swim-school journey works without manual database intervention:

1. Parent intake.
2. Admin waitlist conversion.
3. Placement scoring.
4. Slot offer accept and decline states.
5. Parent-mediated participant placement.
6. Instructor attendance, progress note and badge.
7. Parent progress and badge visibility.
8. Manual subscription and payment visibility.
9. Afzwem readiness, event, result and diploma vault visibility.

## Implemented

- `pnpm run phase16:flow` creates or reuses a stable technical E2E organization. It is deliberately separate
  from the managed Waterlijn showcase.
- The runner ensures tenant admin, instructor and parent test accounts exist and can sign in.
- Demo data is created with stable codes/references so the runner can be repeated.
- The accepted placement path creates the participant, enrollment, group membership and parent access.
- A separate declined slot-offer path verifies the decline lifecycle.
- Attendance, parent-visible progress, badge and notification records are created.
- Billing creates a payment plan, subscription, manual payment and payment notification.
- Afzwem creates readiness, event participant, result, certificate and parent notifications.
- Role-scoped Supabase checks verify admin, instructor and parent visibility.
- `apps/web/tests/e2e/phase16-operational.spec.ts` signs in with real staging accounts and checks the dashboards.
- The staging deploy workflow runs Phase 16 after Phase 15 unless `RUN_PHASE_16_FLOW=false`.

## Required Staging Secrets

- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `AUTH_CODE_PEPPER`, `SESSION_SECRET` or `JWT_SECRET`
- `E2E_TENANT_ADMIN_PASSWORD`
- `E2E_INSTRUCTOR_PASSWORD`
- `E2E_PARENT_PASSWORD`

## Required Staging Variables

- `APP_URL=https://staging.nxttrack.nl`
- `NEXT_PUBLIC_APP_URL=https://staging.nxttrack.nl`
- `E2E_TENANT_ADMIN_EMAIL`
- `E2E_INSTRUCTOR_EMAIL`
- `E2E_PARENT_EMAIL`

## Optional Variables

- `RUN_PHASE_16_FLOW=false` bypasses the deploy-time Phase 16 gate.
- `PHASE16_TENANT_SLUG=nxttrack-e2e`
- `PHASE16_TENANT_HOSTNAME=nxttrack-e2e.staging.nxttrack.nl`
- `PHASE16_TENANT_NAME=NXTTRACK technische E2E-fixture`
- `PHASE16_RESET_E2E_PASSWORDS=true` lets the runner reset the E2E account passwords to the configured secrets.
- `PHASE16_SKIP_PLAYWRIGHT=true` runs database and RLS role checks without browser dashboard checks.
- `PHASE16_SKIP_PLAYWRIGHT_INSTALL=true` skips browser install when the runner already has Chromium.

Existing staging environments may temporarily retain the historical internal slug and hostname
`aquaswim-demo`. The runner normalizes its visible tenant name and branding to NXTTRACK E2E, so that identifier
cannot be confused with the canonical showcase. It should be renamed in GitHub environment variables during a
separate controlled fixture migration; changing the slug without updating the controlled E2E accounts and
stored screenshot host would unnecessarily break release validation.

## Acceptance

- One complete tenant flow passes against staging.
- No manual database edits are required during the flow.
- Tenant admin, instructor and parent dashboards show the resulting data.
- The generated state file stays in `artifacts/` and is not committed.
