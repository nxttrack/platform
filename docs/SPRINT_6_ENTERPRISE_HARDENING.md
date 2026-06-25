# Sprint 6 - Enterprise Hardening

Sprint 6 makes staging safe enough for real tenant onboarding and product owner acceptance.

## Automated Gates

Run before accepting a staging release:

```bash
pnpm run typecheck
pnpm run auth:audit
pnpm run db:audit
pnpm run rls:test
pnpm run e2e:critical
pnpm run ui:audit
pnpm run security:audit
pnpm run build
```

`pnpm run release:gate` runs the full release gate used before staging or production promotion.

## What Is Covered

- Auth boundary and shell route contracts.
- RLS presence, policy coverage, update `WITH CHECK` coverage and anon grant allowlist.
- Role isolation contracts for tenant staff, parents, instructors and platform staff.
- Generic audit events for sensitive tenant/platform changes.
- Critical workflow contracts for intake, slot offers, instructor attendance/progress, parent catch-up, messaging, document downloads, reports and payments.
- Accessibility and responsive source checks.
- Lovable traceability docs and stale scaffold copy checks.

## Audit Events

Generic audit events are written for sensitive tables:

- `tenant_memberships`
- `participant_guardians`
- `enrollments`
- `group_memberships`
- `invoices`
- `payment_records`
- `message_outbox`
- `tenant_document_records`
- `report_export_requests`
- `platform_smtp_settings`

Tenant staff can read audit events for their tenant. Platform staff can read all audit events.

## Staging Acceptance Checklist

Before onboarding a real tenant on staging:

- Deployment workflow is green on the `staging` branch.
- Database migrations applied without manual SQL edits.
- `/api/health` returns `ok=true` and reports Supabase Auth configured.
- Public tenant website loads homepage, program overview, program detail and intake.
- Intake submission creates an intake record and lifecycle event.
- Tenant admin can view/update learner, guardian, enrollment, planning, payment, document and report workflows.
- Instructor can open agenda/group roster and record attendance/progress on mobile width.
- Parent can open dashboard, lessons, notifications, documents, payments and progress.
- Document uploads stay private and downloads use signed URLs.
- Payment correction creates an audit/payment event.
- Message dispatch records delivery status, retry count and failure reason.
- Reports export from real tenant data.
- No stale scaffold copy is visible in public, admin, parent or instructor surfaces.
- Key screens are checked on mobile and desktop widths against the Lovable direction.

## Known Limits

- The `e2e:critical` script runs source-level contracts by default. Set `E2E_BASE_URL=https://aquaswim-demo.staging.nxttrack.nl` to also perform HTTP route checks against staging.
- Visual QA is enforced through Lovable baseline traceability and responsive/static checks. Pixel-level screenshot comparison still requires a future Playwright baseline job once browser automation is added to CI.
