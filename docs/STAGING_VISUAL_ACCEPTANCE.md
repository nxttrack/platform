# Staging Visual Acceptance

Last updated: 2026-07-21

Status: automated SHA-bound staging capture and the first engineering side-by-side review are complete. Product-owner approval remains open because several production flows intentionally differ materially from the pinned Lovable composition.

## Goal

Capture the production implementation for the same 14 Priority A routes and four viewports as the pinned Lovable reference. Evidence must belong to the exact commit exposed by the live health endpoint.

## Automated Flow

The staging deployment now:

1. activates the exact `main` commit;
2. seeds and verifies the Phase 16 operational state and controlled role accounts;
3. authenticates as parent, instructor and tenant admin;
4. resolves the seeded instructor group and student identifiers;
5. captures all 56 Priority A production screenshots;
6. records dimensions, byte size, SHA-256 and browser/runtime failures in `capture.json`;
7. uploads the screenshots and manifest as a 90-day GitHub Actions artifact;
8. completes Phase 15 security validation and the strict launch gate.

Phase 16 deliberately precedes Phase 15 on a first staging release: Phase 15 requires the controlled role accounts that Phase 16 creates or resets. Visual capture precedes the strict launch gate because `LOVABLE_VISUAL_CHECK_CONFIRMED` may only be set after the artifact exists and has been reviewed.

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

If GitHub artifact storage is temporarily unavailable, the workflow emits compact per-route contact sheets to the job log. This fallback is intended only for immediate visual review; it does not replace the SHA-bound 90-day artifact once storage becomes available.

## Remaining Approval

- Download the Lovable and staging artifacts.
- Review every route at matching viewport dimensions.
- Classify differences as accepted, fix required, or data/runtime intentional.
- Record product-owner approval and the reviewed staging release SHA.
- Do not set `LOVABLE_VISUAL_CHECK_CONFIRMED=true` until that review is complete.

## First Live Engineering Review

Reviewed staging release: `cab337c71a02024fa2b77201f6a4f6f6657beb70` on 2026-07-21.

- All 56 screenshots were captured for the 14 Priority A routes and four canonical viewports.
- The review found a real tenant-host routing defect: `aquaswim-demo.staging.nxttrack.nl` was treated as a nested production hostname. Staging now declares `TENANT_BASE_DOMAINS=staging.nxttrack.nl`, and the capture asserts the seeded tenant and program content instead of accepting the platform or unavailable pages.
- Marketing home and swim-school pages are coherent and responsive at all reviewed widths. Photography remains placeholder/reference drift.
- Tenant public pages are functional and tenant-aware, but still need a shared public header/footer, approved hero imagery and closer content hierarchy before visual approval.
- Parent pages are coherent and data-backed. Home, lessons and especially progress use a materially different information hierarchy from Lovable and need a product decision before they can be approved as parity.
- Instructor group and dossier flows are operational and responsive. The seeded dashboard is sparse for today's date, and the dossier capture opens on the production default tab instead of the Lovable assessment state; both need a deliberate empty-state/capture decision.
- Admin pages are operationally deeper than the reference. The dashboard uses real data, the agenda is now a planning-and-capacity workflow, and the waitlist includes placement assistance. This is functional evolution rather than a broken route, but it is not pixel parity and needs explicit product-owner acceptance.

Engineering classification:

| Classification | Routes | Outcome |
| --- | --- | --- |
| Fix completed | tenant home, programs, intake | Tenant hostname resolution and seeded-content assertions are live. |
| Coherent, known asset drift | marketing home, marketing swim schools | Responsive; photography and final visual polish remain. |
| Data/runtime intentional | tenant programs, instructor home/group, admin dashboard/waitlist | Seed volume and date-sensitive operational data differ from the static canon. |
| Product decision required | tenant public shell, parent home/lessons/progress, instructor dossier state, admin agenda/waitlist composition | Production is functional but materially diverges from the pinned layout or information architecture. |

This engineering review is deliberately not recorded as product-owner approval, so `LOVABLE_VISUAL_CHECK_CONFIRMED` remains unset.
