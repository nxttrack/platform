# Staging Visual Acceptance

Last updated: 2026-07-20

Status: automated SHA-bound staging capture is implemented; the first live capture and product-owner side-by-side approval remain open.

## Goal

Capture the production implementation for the same 14 Priority A routes and four viewports as the pinned Lovable reference. Evidence must belong to the exact commit exposed by the live health endpoint.

## Automated Flow

The staging deployment now:

1. activates the exact `main` commit;
2. completes Phase 15 security validation;
3. seeds and verifies the Phase 16 operational state;
4. authenticates as parent, instructor and tenant admin;
5. resolves the seeded instructor group and student identifiers;
6. captures all 56 Priority A production screenshots;
7. records dimensions, byte size, SHA-256 and browser/runtime failures in `capture.json`;
8. uploads the screenshots and manifest as a 90-day GitHub Actions artifact.

The capture fails when live health exposes another release SHA, authentication redirects back to login, a route fails, a browser/runtime error occurs, or fewer than 56 images are produced.

## Manual Command

After Phase 16 has written `artifacts/phase16-state.json`:

```bash
GITHUB_SHA=<full-live-sha> \
E2E_TENANT_ADMIN_PASSWORD=<secret> \
E2E_INSTRUCTOR_PASSWORD=<secret> \
E2E_PARENT_PASSWORD=<secret> \
pnpm design:capture-production
```

Optional overrides:

```txt
PRODUCTION_BASE_URL
PRODUCTION_TENANT_BASE_URL
PRODUCTION_BASELINE_OUTPUT
PHASE16_STATE_PATH
```

## Evidence Layout

```txt
artifacts/production-baseline/<release-sha>/
  capture.json
  tenant-home/mobile.png
  ...
  marketing-swim-schools/wide.png
```

Images remain gitignored. The GitHub artifact is the review handoff; approved selected goldens should only be committed after explicit product-owner approval.

## Remaining Approval

- Download the Lovable and staging artifacts.
- Review every route at matching viewport dimensions.
- Classify differences as accepted, fix required, or data/runtime intentional.
- Record product-owner approval and the reviewed staging release SHA.
- Do not set `LOVABLE_VISUAL_CHECK_CONFIRMED=true` until that review is complete.
