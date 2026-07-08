# NXTTRACK Platform

This repository is the final rebuild of NXTTRACK.

Current working mode: staged MVP implementation with staging validation and canon-alignment productization still required. Phase 3 through Phase 13 are implemented in code, but live Supabase migrations, tenant DNS, RLS/advisor validation, Playwright staging smoke and end-to-end staging tests are still required before the MVP can be considered product-owner-review ready. Phase 14 starts the cleanup from implemented scaffolding to a coherent product surface.

## Source of truth

- Final rebuild repository: `nxttrack/platform`
- Lovable UI reference repository: `nxttrack/swim-school-pro`
- Legacy/reference workspace: `nxtdev` or earlier local prototypes, reference only
- First deployment target: staging environment

## Current implementation status

The repository has moved beyond the original documentation-only phase:

- Phase 0: repo, infrastructure direction, environment strategy, migration approach, and staging deploy flow are documented.
- Phase 1: Lovable UI audit is documented; Lovable remains the visual source of truth.
- Phase 2: Next.js app scaffold, route skeletons, Lovable-derived tokens, health endpoint, and deploy scripts are present.
- Phase 3: Supabase SSR utilities, identity-boundary migration, auth-flow migration, login, invite, forced password change, six-digit reset, trusted server guards, and route-access audits are implemented in code. Staging migration/bootstrap/RLS validation is still pending.
- Phase 4: core domain model migration, RLS/grants, tenant admin pages, and create flows for programs, stages, resources, groups, sessions, instructor assignments, enrollments, memberships, and capacity basics are implemented in code. Staging migration/RLS validation is still pending.
- Phase 5: tenant public homepage, program overview, dynamic intake, intake submissions/answers, `intake.received` event, and admin intake inbox are implemented in code. Staging tenant DNS and RLS validation are still pending.
- Phase 6: waitlist entries, preferences, placement scoring, admin placement panel, slot offer tokens, public accept/decline flow, placement-to-core-domain conversion, and audit trail are implemented in code. Staging e-mail, RLS/advisor validation and end-to-end tests are still pending.
- Phase 7: parent portal dashboard, children/athletes, current program/stage/group, lessons, lesson details, cancellation policy, catch-up credits, profile basics, parent access links and RLS updates are implemented in code. Staging parent/tenant data and RLS validation are still pending.
- Phase 8: instructor dashboard, assigned sessions agenda, group roster, attendance registration, student detail, progress notes, internal versus parent-visible note separation, badge action foundation and instructor-scoped RLS are implemented in code. Staging tablet workflow and RLS validation are still pending.
- Phase 9: structured progress modules/items, 5-level positive scoring, swim progress templates, badge catalog install, parent progress view, badge awards and parent notifications for visible progress/badges are implemented in code. Staging RLS/advisor validation and role-based progress tests are still pending.
- Phase 10: afzwem readiness, afzwem events, parent invite/status, result registration, certificate records and private parent diploma vault are implemented in code. Staging RLS/advisor validation and end-to-end afzwem tests are still pending.
- Phase 11: payment plans, subscriptions, manual payment status, admin payment overview, parent payment view and due/overdue billing events are implemented in code. Staging RLS/advisor validation and manual billing end-to-end tests are still pending.
- Phase 12: admin operations dashboard, messages, tasks, documents, basic reports, report snapshots, role-based visibility and notification hooks are implemented in code. Staging RLS/advisor validation and role-based operation tests are still pending.
- Phase 13: hardening automation, RLS coverage audit, service-only auth deny policies, Playwright smoke/visual/performance tests, deploy hardening gates, enriched health smoke, runtime asset/MIME smoke, authenticated Playwright workflows and RLS role smoke scaffolding are implemented in code. Staging execution, seeded authenticated role runs, backups check, Lovable visual comparison and rollback rehearsal are still pending.
- Phase 14: canon alignment and productization is implemented in code. Runtime scaffold copy is removed, `/platform` is a real overview, `/admin/instellingen` exists, backoffice navigation resolves, and user-facing terminology is cleaned up. Staging validation continues in Phase 15.

Automatic payment provider work, advanced scheduling, full assessments and other product modules should still wait until Phase 3/4/5/6/7/8/9/10/11/12/13 are applied to staging and the identity/RLS/domain/intake/placement/parent-portal/instructor/progress/diploma/billing/admin-operations/hardening boundary is verified with real users.

## Canon and planning docs

- [NXTTRACK Canon](docs/NXTTRACK_CANON.md)
- [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md)
- [Implementation Roadmap](docs/IMPLEMENTATION_ROADMAP.md)

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

## Operational prep docs

- [Staging Setup Checklist](docs/STAGING_SETUP_CHECKLIST.md)
- [VPS Deployment Runbook](docs/VPS_DEPLOY_RUNBOOK.md)
- [Migration Strategy Decision](docs/MIGRATION_STRATEGY_DECISION.md)
- [Lovable Screenshot Baseline](docs/LOVABLE_SCREENSHOT_BASELINE.md)

## Deployment baseline

The repository already contains `.github/workflows/deploy.yml`. It targets `staging` and `production` branches using a self-hosted GitHub runner, Caddy, systemd, shared `.env` files, release directories, and symlink activation.

The staging environment is the only first target. Production remains a future target and should not be treated as launch-ready until explicitly approved.
