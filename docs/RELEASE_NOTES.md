# Release Notes

## Staging Quality Bar

Date: 2026-06-25

Scope:

- Added quality smoke checks for public intake, placement, parent, instructor, payments, and documents.
- Added Playwright browser E2E smoke coverage and made `E2E_BASE_URL` mandatory for staging/production CI pushes.
- Added responsive, accessibility, and Lovable visual comparison gates.
- Added structured health and readiness responses with release metadata.
- Added structured logging and server error reporting helpers.
- Added tenant website CMS maturity: manageable news, agenda, SEO/social settings, domain status, and tenant asset uploads.
- Added production observability maturity: external log sink hooks, error reporting hook, persistent deployment release metadata, platform admin release visibility, and monitorable uptime/ready contract.
- Added UI/UX enterprise audit notes, route-aware shell navigation, mobile/tablet shell menu and tenant CTA contrast hardening.
- Added Lovable pixel QA Playwright suite with desktop/mobile screenshot baselines and CI artifact upload on visual mismatch.
- Added staging fallback resolution for `E2E_BASE_URL` so browser E2E uses the AquaSwim staging tenant when the repository variable is not configured.

Verification:

- `pnpm run e2e:smoke`
- `pnpm run e2e:browser`
- `pnpm run e2e:visual`
- `pnpm run ui:audit`
- `pnpm run ui:lovable`
- `pnpm run release:gate`

Production promotion notes:

- Promote only after staging smoke checks pass against the deployed `E2E_BASE_URL`.
- Confirm `/api/health` returns `ok=true`.
- Confirm `/api/health/ready` returns `ok=true` in the target runtime.
- Keep manual payment flow active until Mollie/iDEAL is explicitly approved.
