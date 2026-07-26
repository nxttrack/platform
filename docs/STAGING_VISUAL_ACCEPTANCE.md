# Staging Visual Acceptance

Last updated: 2026-07-23

Status: automated SHA-bound staging capture, engineering review and product-owner approval are complete for premium candidate `e9a57c95216e60303a8e3544ee7d2da6df2e5082`.

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
7. uploads the screenshots and manifest as a 14-day GitHub Actions review artifact;
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

If GitHub artifact storage is temporarily unavailable, the workflow emits compact per-route contact sheets to the job log. This fallback is intended only for immediate visual review; it does not replace the SHA-bound 14-day artifact once storage becomes available.

## Product-Owner Approval

Danny Goldenbelt approved the 14 Priority A routes across mobile, tablet, desktop and wide viewports on 2026-07-23 for SHA `02fde48a197a72e80c624adee3ccddc836852807`. The review found no visual release blocker. It accepts the richer data-backed parent/admin composition, expanded planning and waitlist workflows, the quiet instructor state and current staging data density as intentional differences. Final photography and copy, more compact mobile admin workflows, better use of wide desktop space and production-ready demo/seed names remain non-blocking follow-ups.

`LOVABLE_VISUAL_CHECK_CONFIRMED=true` was set in the staging environment for this recorded approval.

The product owner reconfirmed the complete current visual set on 2026-07-23 for premium candidate
`e9a57c95216e60303a8e3544ee7d2da6df2e5082`. Run
<https://github.com/nxttrack/platform/actions/runs/30000489255> retained all 56 PNG files plus `capture.json`
and `release-evidence.json`. The downloaded manifest reports 14 routes, four viewports, zero failures and zero
runtime failures; every PNG byte count and SHA-256 matched its manifest entry. The current visuals are therefore
accepted without a visual release blocker.

## Framework Security Revalidation

A new maintenance candidate upgrades Next.js from `16.2.9` to the patched Active LTS release `16.2.11` without
changing application components, styling or content. The visual confirmation is temporarily reopened so the
new live SHA can be captured and compared with the approved `02fde48a197a72e80c624adee3ccddc836852807`
contact sheets. The confirmation may be restored only after all Priority A routes and viewports complete and
the comparison finds no framework-induced visual regression.

The SHA-bound revalidation completed on 2026-07-23 for maintenance application SHA
`c8bf0a5f8c6b8930a1067f51a55deda0b62af60d`. All 56 screenshots, Phase 16, the complete Sprint 4 browser suite,
quality budgets and 52 Phase 15 checks passed. All 14 compact contact sheets were reconstructed from the workflow
log because GitHub artifact quota recalculation remained delayed. Pixel comparison against the approved
`02fde48a197a72e80c624adee3ccddc836852807` contact sheets found three exact matches and at most 0.124% strong
pixel difference elsewhere. Inspection classified those differences as regenerated seed identifiers and rows;
no layout, styling or responsive regression was found. The visual confirmation may therefore be restored for
the final exact-SHA gate run.

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

## Canon Parity Implementation Pass

Implemented after the first live review and captured on release `892da450a1f475944e4bc610fe12d572630bdbc1`:

- Tenant public routes now share a sticky branded header, desktop navigation, a Radix Sheet mobile menu, intake/login calls to action and a complete public footer.
- Tenant home now follows the reference hierarchy more closely: trust marker, outcome-led hero, program availability panel, three-step journey and richer program cards.
- Parent progress now presents a child-first swim route with progress ring, stage context, latest compliment, skill progress bars and badges while retaining real scores and visibility rules.
- Instructor home now turns a date-sensitive empty dashboard into a useful quiet-day state with upcoming lessons and preparation shortcuts.
- The instructor dossier visual capture now opens the assessment tab so it compares the same workflow state as the pinned reference.
- Admin planning now presents the real day/week plan before creation and availability controls. The richer capacity, conflict, catch-up and placement workflows remain the accepted production information architecture pending product-owner sign-off.

## Latest Release-Candidate Engineering Review

Reviewed staging release: `892da450a1f475944e4bc610fe12d572630bdbc1` on 2026-07-21.

- All 56 screenshots completed for the exact SHA exposed by live health.
- Tenant public shell, parent progress, instructor quiet-day state, instructor assessment capture and admin information hierarchy render coherently across all four viewports.
- Marketing placeholder instructions were replaced by intentional NXTTRACK editorial panels; approved photography is now a product choice rather than a broken-state blocker.
- Direct full-page review of marketing home and swim schools found no clipping, blank content or hierarchy regression.
- Phase 16, Supabase Advisors, four-role RLS and 42 live Playwright checks passed after capture.
- GitHub artifact upload still hit delayed storage-quota recalculation; compact contact sheets were emitted successfully to the workflow log.

Known remaining visual work is limited to the product decision on approved photography/final copy, seeded data density and acceptance of the richer data-backed parent/admin composition. The visual confirmation gate remains unset until the product-owner decision is recorded in [Sprint 1](SPRINT_01_RELEASE_CANDIDATE_EVIDENCE.md).
