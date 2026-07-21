# NXTTRACK Platform

This repository is the final rebuild of NXTTRACK.

Current working mode: Phase 22 launch-readiness foundation on top of the completed repository, canon, staging and operational-flow passes. Live staging now proves migrations, role isolation, browser workflows, SHA-bound visual capture and runtime rollback. Product-owner visual approval, provider-side Supabase backup confirmation and production authorization remain explicit release gates. Production is not approved.

## Source of truth

- Final rebuild repository: `nxttrack/platform`
- Canonical implementation and release branch: `main`
- Lovable UI reference repository: `nxttrack/swim-school-pro`
- Legacy/reference workspace: `nxtdev` or earlier local prototypes, reference only
- Remote `staging` and `production` branches: historical deployment/reference lines, not implementation sources
- First deployment target: staging environment

Run `pnpm run release:truth` to verify the repository and release-source invariants and to report local branch divergence.

## Current implementation status

The repository has moved beyond the original documentation-only phase:

- Phase 0: repo, infrastructure direction, environment strategy, migration approach, and staging deploy flow are documented.
- Phase 1: the Lovable source is pinned to commit `ced1290b239f61566a542825c9ed8a9229cc3282`; 14 Priority A routes have been captured at four viewports, current UI drift is documented, and the shadcn/Radix direction is locked. Product-owner approval and production-side comparison remain.
- Phase 2: the Next.js foundation has exact Lovable OKLCH tokens, repository-owned shadcn configuration, Radix interaction primitives, pathname-aware shells and restored parent routes. Authenticated engineering comparison is complete; product-owner approval remains.
- Phase 3: Supabase SSR, identity/auth flows, trusted server guards and route audits are implemented; live migration, bootstrap and four-role RLS validation pass on staging.
- Phase 4: the core domain, RLS/grants and tenant-admin create flows are implemented and live-migration/RLS validated on staging.
- Phase 5: tenant public site, program overview, dynamic intake and admin inbox are implemented; tenant DNS, seeded intake and RLS behavior pass on staging.
- Phase 6: waitlist, placement scoring, slot offers, accept/decline conversion and audit trail are implemented; staging operational and role checks pass. External production mail delivery remains Sprint 3 scope.
- Phase 7: parent dashboard, lessons, cancellation, catch-up and profile flows are implemented; controlled parent data and role isolation pass on staging.
- Phase 8: instructor dashboard, roster, attendance, dossier, notes and badge foundation are implemented; staging tablet-oriented routes and instructor isolation pass.
- Phase 9: structured progress, positive scoring, badges and notifications are implemented; seeded progress/badge visibility and role checks pass on staging.
- Phase 10: afzwem readiness/events, invitations, results, certificates and private diploma vault are implemented and visible in the staging operational flow.
- Phase 11: subscriptions, manual payments and billing events are implemented and staging-visible; full user-driven mutation coverage remains Sprint 4 scope.
- Phase 12: operations dashboard, messages, tasks, documents and reports are implemented and role-visible on staging; deeper mutation coverage remains Sprint 4 scope.
- Phase 13: hardening automation, RLS coverage audit, service-only auth deny policies, Playwright smoke/visual/performance tests, deploy hardening gates, enriched health smoke, runtime asset/MIME smoke, authenticated Playwright workflows and RLS role smoke scaffolding are implemented in code.
- Phase 14: canon alignment and productization is implemented in code. Runtime scaffold copy is removed, `/platform` is a real overview, `/admin/instellingen` exists, backoffice navigation resolves, and user-facing terminology is cleaned up.
- Phase 15: staging truth and security validation is implemented as a strict gate. It runs migrations, Supabase advisors, required RLS role checks, live staging health, live Playwright and strict launch confirmations against `https://staging.nxttrack.nl`.
- Phase 16: end-to-end operational flow validation is implemented as a repeatable staging runner. It seeds a demo swim school, runs intake to placement, attendance, progress, badge, billing, afzwem and diploma records, then verifies admin, instructor and parent dashboards.
- Phase 17: transactional communication, delivery diagnostics, private document storage and diploma-file access are implemented and staging-visible; external mail delivery remains Sprint 3 scope.
- Phase 18: planning conflict detection, instructor availability, capacity-aware catch-up requests and approval are implemented and staging-visible.
- Phase 19: parent/instructor communication, tasks, documents and tablet-oriented lesson depth are implemented and staging-visible; full mutation and usability coverage remains Sprint 4 scope.
- Phase 20: billing-provider configuration, payment-session/event, invoice/export and subscription-lifecycle boundaries are implemented without activating a live payment provider.

The Phase 16 runner proves seeded integration state and authenticated dashboard visibility; it does not yet replace the complete browser-driven mutation suite planned for Sprint 4. Automatic payment providers, Smart Flow/AI and production promotion follow the dependencies in the delivery sprint plan.

## Canon and planning docs

- [NXTTRACK Canon](docs/NXTTRACK_CANON.md)
- [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md)
- [Implementation Roadmap](docs/IMPLEMENTATION_ROADMAP.md)
- [Delivery Sprints](docs/DELIVERY_SPRINTS.md)
- [Active Sprint 1](docs/SPRINT_01_RELEASE_CANDIDATE_EVIDENCE.md)
- [Sprint 2 Production Foundation](docs/SPRINT_02_PRODUCTION_FOUNDATION.md)
- [Sprint 3 Communications And Observability](docs/SPRINT_03_COMMUNICATIONS_OBSERVABILITY.md)
- [Operations And Incident Runbook](docs/OPERATIONS_INCIDENT_RUNBOOK.md)

## Phase docs

- [Phase 0 - Repo and Infra](docs/PHASE_0_REPO_INFRA.md)
- [Phase 1 - Lovable UI Audit](docs/PHASE_1_LOVABLE_UI_AUDIT.md)
- [Phase 2 - App Scaffold](docs/PHASE_2_APP_SCAFFOLD.md)
- [Phase 3 - Auth, Tenants, Roles](docs/PHASE_3_AUTH_TENANTS_ROLES.md)
- [Phase 3 - Identity Schema](docs/PHASE_3_IDENTITY_SCHEMA.md)
- [Phase 4 - Core Domain Model](docs/PHASE_4_CORE_DOMAIN_MODEL.md)
- [Phase 5 - Public Tenant Site And Intake](docs/PHASE_5_PUBLIC_TENANT_SITE_INTAKE.md)
- [Phase 6 - Waitlist, Placement Assistant And Slot Offers](docs/PHASE_6_WAITLIST_PLACEMENT_SLOT_OFFERS.md)
- [Phase 7 - Parent/Athlete Portal](docs/PHASE_7_PARENT_PORTAL.md)
- [Phase 8 - Instructor Shell](docs/PHASE_8_INSTRUCTOR_SHELL.md)
- [Phase 9 - Progress And Badges](docs/PHASE_9_PROGRESS_BADGES.md)
- [Phase 10 - Afzwemmen And Diploma Vault](docs/PHASE_10_AFZWEMMEN_DIPLOMA_VAULT.md)
- [Phase 11 - Manual Payments And Subscriptions](docs/PHASE_11_MANUAL_PAYMENTS_SUBSCRIPTIONS.md)
- [Phase 12 - Admin Operations](docs/PHASE_12_ADMIN_OPERATIONS.md)
- [Phase 13 - Hardening And Staging Launch](docs/PHASE_13_HARDENING_STAGING_LAUNCH.md)
- [Phase 14 - Canon Alignment And Productization](docs/PHASE_14_CANON_ALIGNMENT_PRODUCTIZATION.md)
- [Phase 15 - Staging Truth And Security Validation](docs/PHASE_15_STAGING_TRUTH_SECURITY_VALIDATION.md)
- [Phase 16 - End-To-End Operational Flows](docs/PHASE_16_END_TO_END_OPERATIONAL_FLOWS.md)
- [Phase 17 - Communication, Storage And Documents](docs/PHASE_17_COMMUNICATION_STORAGE_DOCUMENTS.md)
- [Phase 18 - Planning, Capacity And Catch-Up](docs/PHASE_18_PLANNING_CAPACITY_CATCHUP.md)
- [Phase 19 - Parent And Instructor Experience](docs/PHASE_19_PARENT_INSTRUCTOR_EXPERIENCE_DEPTH.md)
- [Phase 20 - Billing Automation Boundary](docs/PHASE_20_BILLING_AUTOMATION_BOUNDARY.md)
- [Phase 22 - Production Readiness](docs/PHASE_22_PRODUCTION_READINESS.md)

## Operational prep docs

- [Staging Setup Checklist](docs/STAGING_SETUP_CHECKLIST.md)
- [VPS Deployment Runbook](docs/VPS_DEPLOY_RUNBOOK.md)
- [Migration Strategy Decision](docs/MIGRATION_STRATEGY_DECISION.md)
- [Lovable Screenshot Baseline](docs/LOVABLE_SCREENSHOT_BASELINE.md)

## Deployment baseline

`.github/workflows/deploy.yml` is manually dispatched from `main` and targets the selected protected GitHub Environment. Staging runs the strict validation flow. Production additionally requires explicit confirmation and the exact full commit SHA already validated on staging.

The staging environment is the only first target. Historical `staging` and `production` branch pushes no longer constitute a release contract. See [Phase 0](docs/PHASE_0_REPO_INFRA.md) for the canonical promotion and recovery policy.
