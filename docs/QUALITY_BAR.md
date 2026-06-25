# NXTTRACK Quality Bar

This document defines the release quality checks for staging acceptance and production promotion.

## Workflow Smoke Coverage

`pnpm run e2e:smoke` validates the source-level contracts and optional HTTP smoke checks for:

- public intake
- admin placement and slot offers
- parent portal
- instructor attendance
- manual payments
- document visibility

When `E2E_BASE_URL` is configured, the smoke test also requests `/api/health`, `/api/health/ready`, public pages, login, parent, instructor, and admin boundaries. HTTP 5xx responses fail the check.

## Browser E2E Coverage

`pnpm run e2e:browser` runs the Playwright browser smoke suite for:

- public intake submission
- slot offer accept route
- admin placement workflow boundary
- parent portal boundary
- instructor attendance boundary on mobile width
- manual payment admin boundary
- private document download route

CI requires `E2E_BASE_URL` for every push to `staging` or `production`. Optional fixture secrets (`E2E_ADMIN_EMAIL`, `E2E_PARENT_EMAIL`, `E2E_INSTRUCTOR_EMAIL`, `E2E_SLOT_OFFER_TOKEN`, `E2E_DOCUMENT_ID`) promote the smoke suite from auth-boundary checks to real workflow checks.

## Responsive And Accessibility QA

`pnpm run ui:audit` checks:

- mobile responsive contracts for public tenant website, parent portal, instructor lesson mode, and admin shell
- form labels
- image alt text
- navigation labels
- visible focus-state markers
- stale scaffold copy

## Lovable Visual Comparison

`pnpm run ui:lovable` keeps marketing and tenant public pages tied to the Lovable audit baseline. It verifies the local implementation still carries the expected hero, card, responsive, spacing, and shell markers from the approved prototype direction.

## Observability

Runtime observability is based on:

- structured JSON logs through `apps/web/lib/observability/logger.ts`
- optional external structured log sink through `OBSERVABILITY_LOG_SINK_URL`
- server error reporting helper in `apps/web/lib/observability/error-reporting.ts`
- optional external error reporting through `ERROR_REPORTING_URL`
- liveness at `/api/health`
- readiness at `/api/health/ready`
- release metadata in health responses
- release history in `deployment_releases`
- platform admin visibility at `/platform/settings`

See `docs/PRODUCTION_OBSERVABILITY.md` for the monitor contract and required runtime variables.

## Release Gate

`pnpm run release:gate` must pass before staging can be considered ready for product-owner acceptance. The gate includes TypeScript, auth audit, database/RLS checks, critical workflows, quality smoke, UI audit, Lovable visual comparison, security readiness, production build, standalone asset preparation, and migration guard.
