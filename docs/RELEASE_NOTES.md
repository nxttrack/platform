# Release Notes

## Staging Quality Bar

Date: 2026-06-25

Scope:

- Added quality smoke checks for public intake, placement, parent, instructor, payments, and documents.
- Added responsive, accessibility, and Lovable visual comparison gates.
- Added structured health and readiness responses with release metadata.
- Added structured logging and server error reporting helpers.

Verification:

- `pnpm run e2e:smoke`
- `pnpm run ui:audit`
- `pnpm run ui:lovable`
- `pnpm run release:gate`

Production promotion notes:

- Promote only after staging smoke checks pass against the deployed `E2E_BASE_URL`.
- Confirm `/api/health` returns `ok=true`.
- Confirm `/api/health/ready` returns `ok=true` in the target runtime.
- Keep manual payment flow active until Mollie/iDEAL is explicitly approved.
