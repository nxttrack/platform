# Phase 14 - Canon Alignment And Productization

Status: implemented in code. Staging validation remains part of Phase 15.

## Goal

Convert the implemented staging MVP from phase/scaffold surfaces into a coherent product experience that matches the NXTTRACK canon.

Phase 14 does not add a new domain module. It makes the existing modules believable, navigable and reviewable:

- Remove runtime scaffold language.
- Replace placeholder backoffice routes with useful product surfaces.
- Align user-facing terminology with the canon.
- Complete visible MVP route coverage.
- Keep staging validation explicit instead of implying production readiness.

## Scope

- Platform admin overview at `/platform`.
- Backoffice settings route at `/admin/instellingen`.
- Runtime copy cleanup for Phase 2/skeleton wording.
- User-facing terminology cleanup from technical tenant language to organization/swim-school language.
- Navigation cleanup so every visible link resolves to a real route.
- Documentation update for the remaining execution phases.

## Tasks

- Replace the platform admin placeholder with a real overview:
  - organizations,
  - domains,
  - platform roles,
  - active organization members,
  - platform email status,
  - staging readiness signals.
- Add `/admin/instellingen` for organization settings:
  - organization identity,
  - terminology sector,
  - locale and timezone,
  - cancellation and catch-up policy.
- Remove Phase 2/scaffold copy from runtime pages.
- Replace user-facing "tenant" copy with organization/swim-school wording where possible.
- Keep technical table names and internal code terminology stable unless a migration explicitly changes them.
- Document the post-Phase-14 execution plan.

## Acceptance

Phase 14 is complete when:

- `/platform` no longer renders a placeholder.
- `/admin/instellingen` exists and loads for organization admins.
- Main runtime surfaces no longer show Phase 2/skeleton wording.
- Backoffice navigation does not point to missing routes.
- README and roadmap describe the current state and next phases without suggesting the MVP is already product-owner-review ready.
- Typecheck passes.

## Out Of Scope

- Mollie/iDEAL automation.
- Full custom-domain self-service.
- Full child login.
- Advanced AI.
- Drag-and-drop planning.
- Diploma template editor.
- Production launch.

## Next Phases

Phase 14 prepares the product surface. The remaining work should continue in these execution phases:

- Phase 15 - Staging Truth And Security Validation.
- Phase 16 - End-To-End Operational Flows.
- Phase 17 - Communication, Storage And Documents.
- Phase 18 - Planning, Capacity And Catch-Up Depth.
- Phase 19 - Parent And Instructor Experience Depth.
- Phase 20 - Billing Automation Boundary.
- Phase 21 - Intelligence, Insights And Automation.
- Phase 22 - Production Readiness And Commercial Launch.
