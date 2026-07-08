# NXTTRACK Implementation Roadmap

Last updated: 2026-06-23

Status: dependency-based roadmap. Implementation starts only after product owner approval.

## Roadmap Principles

- Document first, plan second, build third.
- Preserve Lovable UI; do not redesign.
- Build foundations before feature depth.
- Keep swim-first visible labels but generic internals.
- Tenant isolation and security are foundation work.
- Staging is the first target.
- Manual payments come before Mollie/iDEAL automation.
- SendGrid SMTP comes before advanced notification channels.

## Phase 0 - Repository And Infrastructure Foundation

Goal:

Lock the final repository, staging deployment direction, environment/secrets strategy, migration approach, and operational assumptions.

Scope:

- `nxttrack/platform` as final repo.
- `nxtdev` reference-only.
- Existing deploy workflow review.
- Planned repo structure.
- GitHub Environments.
- VPS/Caddy/systemd/GitHub runner assumptions.
- Staging-first deployment target.

Tasks:

- Document final repo and source-of-truth rules.
- Document planned `apps/web`, `supabase/migrations`, `scripts`, and `docs` structure.
- Document env/secrets matrix.
- Document deploy flow and rollback approach.
- Document migration approach and blocker.
- Confirm staging domains, Supabase staging project, and runner policy.

Dependencies:

- Access to `nxttrack/platform`.
- Access to infrastructure owner decisions.

Affected areas:

- Repository root.
- Docs.
- GitHub Actions.
- VPS deployment plan.

Risks:

- Existing workflow references package scripts that do not exist yet.
- Building in old/reference repo.
- Guessing migration runner too early.

Acceptance criteria:

- Phase 0 doc exists and is reviewed.
- Staging-first direction is explicit.
- Env/secrets are listed.
- Migration approach is documented.
- No product features are added.

What not to do:

- Do not scaffold product features.
- Do not connect Supabase yet.
- Do not change database schema.
- Do not deploy production.

## Phase 1 - Lovable UI Audit And Design Baseline

Goal:

Inventory Lovable UI before moving or consolidating any UI.

Scope:

- Access to `nxttrack/swim-school-pro`.
- Routes.
- Shells.
- Components.
- Tokens.
- Responsive behavior.
- Mock data.
- Design-to-production mapping.

Tasks:

- Inspect `src/routeTree.gen.ts`.
- Inspect public, parent, instructor, admin, and marketing route groups.
- Inspect `PageKit`, `AppShell`, and shell UI primitives.
- Inspect `styles.css` tokens.
- Inspect `mock.ts` domain assumptions.
- Create screenshot baseline plan for key routes.
- List conflicts and decisions.

Dependencies:

- Phase 0 repo decision.
- Lovable repo access.

Affected areas:

- Docs.
- Future design system.
- Future route mapping.

Risks:

- Visual drift if UI is ported without screenshot baseline.
- Replacing Lovable with generic UI.
- Copying TanStack runtime into final Next.js app by accident.

Acceptance criteria:

- Lovable access confirmed.
- Routes/shells/components/tokens/mock data documented.
- Design-to-production mapping documented.
- No UI is moved yet.

What not to do:

- Do not redesign.
- Do not port UI yet.
- Do not delete mock data before it is mapped.

## Phase 2 - App Scaffold, Design Tokens And Route Skeletons

Goal:

Create the Next.js production app shell without business features.

Scope:

- `apps/web` scaffold.
- Next.js App Router route groups.
- Tailwind v4 setup.
- Lovable-derived tokens.
- Shared shell primitives.
- Health endpoint.
- Basic build/start scripts.

Tasks:

- Create the approved app/package structure.
- Add `pnpm build`, `pnpm start`, and placeholder `pnpm run db:migrate` strategy.
- Add global fonts and Lovable tokens.
- Add route skeletons for marketing, tenant public, parent, instructor, tenant admin, platform admin.
- Add no real data integration yet.
- Add health check endpoint for staging smoke tests.

Dependencies:

- Phase 0 approval.
- Phase 1 approval.

Affected areas:

- `apps/web`.
- package scripts.
- styles.
- route skeletons.

Risks:

- Starting business logic before shell structure is stable.
- Token drift from Lovable.
- Existing deploy workflow still failing if scripts are incomplete.

Acceptance criteria:

- App builds locally.
- Route skeletons render without data.
- Health endpoint works.
- No product workflow is implemented.

What not to do:

- Do not implement auth.
- Do not create schema.
- Do not wire real tenant data.

## Phase 3 - Auth, Tenants, Roles And Terminology

Goal:

Establish secure multi-tenant identity and terminology foundations.

Scope:

- Supabase Auth.
- Tenant resolution.
- Platform admin separation.
- Tenant memberships.
- Parent/instructor/admin roles.
- Terminology mapping.
- Route guards.

Tasks:

- Define tenant and role schema migrations.
- Implement host-aware tenant lookup.
- Implement guard helpers.
- Implement role routing.
- Add generic-to-swim terminology provider.
- Add noindex metadata for private routes.
- Add RLS tests for tenant isolation.

Dependencies:

- Phase 2.
- Migration runner decision.
- Supabase staging project.

Affected areas:

- Supabase migrations.
- Auth helpers.
- Middleware.
- Shell routing.

Risks:

- Cross-tenant data leak.
- Platform admin and tenant admin mixed.
- Swim labels hardcoded in core.

Acceptance criteria:

- Tenant admin cannot access another tenant.
- Parent sees only own child context.
- Instructor access is scoped.
- Swim labels come from terminology.

What not to do:

- Do not build business modules yet.
- Do not add payment/provider code.

## Phase 4 - Programs, Stages, Groups, Sessions, Resources And Capacity

Goal:

Build the operational learning model that everything else depends on.

Scope:

- Programs.
- Stages.
- Groups.
- Sessions.
- Resources.
- Instructor assignments.
- Capacity basics.
- Separation from billing.

Tasks:

- Add schema for programs/stages/groups/sessions/resources.
- Add enrollment and group membership foundation.
- Add resource capacity and session capacity.
- Build admin CRUD screens using Lovable patterns.
- Add capacity status helpers.
- Document billing separation in admin UI copy.

Dependencies:

- Phase 3.

Affected areas:

- Tenant admin.
- Domain model.
- Future public programs.
- Future parent/instructor flows.

Risks:

- Confusing stage with subscription.
- Planning without resource capacity.
- Overbuilding drag-and-drop too early.

Acceptance criteria:

- Admin can create program, stage, group, session, resource.
- Admin can assign instructor/resource.
- Capacity status is visible.
- Stage movement does not require billing change.

What not to do:

- Do not build dynamic intake yet.
- Do not integrate payments.
- Do not build advanced planning UI.

## Phase 5 - Public Tenant Site And Dynamic Intake

Goal:

Let visitors discover programs and submit structured intake requests.

Scope:

- Public tenant shell.
- Program marketplace.
- Dynamic intake.
- Registration/trial/waitlist/information options.
- Intake submissions and answers.

Tasks:

- Port Lovable public shell and marketing primitives.
- Implement program marketplace from real programs.
- Implement intake form resolver.
- Store submissions and answers.
- Add spam protection/rate limits.
- Add intake received notification event.

Dependencies:

- Phase 4.
- Phase 1 design mapping.

Affected areas:

- Public routes.
- Intake tables.
- Notifications.
- Tenant admin intake list.

Risks:

- Duplicate forms for trial and registration.
- Public insert abuse.
- Exposing private tenant data.

Acceptance criteria:

- Visitor selects a program.
- Visitor chooses intake option.
- Visitor submits preferences.
- Admin can see structured submission.

What not to do:

- Do not auto-place children.
- Do not require online payment.

## Phase 6 - Waitlist, Placement Assistant And Slot Offers

Goal:

Convert intake into transparent placement decisions.

Scope:

- Waitlist entries.
- Stage recommendation.
- Placement scoring.
- Slot offers.
- Token accept/decline pages.

Tasks:

- Add waitlist fields for program, stage, preferences, priority date.
- Implement placement scoring helper.
- Build admin placement panel.
- Build slot offer lifecycle.
- Add token security and expiration.
- Trigger capacity-available events.

Dependencies:

- Phase 5.
- Phase 4 capacity.

Affected areas:

- Tenant admin.
- Public token pages.
- Notifications.
- Audit logs.

Risks:

- Race conditions on capacity.
- Token leakage.
- Misleading automation.

Acceptance criteria:

- Admin sees placement suggestions with rationale.
- Admin sends slot offer.
- Parent accepts/declines securely.
- Accepted offer places child in group.

What not to do:

- Do not implement blind auto-placement.
- Do not silently create paid subscriptions without accepted terms.

## Phase 7 - Parent Portal And Mijn Lessen

Goal:

Give families a real portal for lessons, child journey, and self-service.

Scope:

- Parent dashboard.
- Child selector.
- Mijn lessen.
- Upcoming/past sessions.
- Cancellation.
- Catch-up credits.
- Messages/documents/profile basics.

Tasks:

- Port Lovable parent shell.
- Wire dashboard to real child/enrollment/session data.
- Implement lesson list and details.
- Implement cancellation policy.
- Implement catch-up credit foundation.
- Add parent notifications.

Dependencies:

- Phase 6 placement.
- Phase 4 sessions.

Affected areas:

- Parent shell.
- Sessions.
- Attendance/catch-up.
- Notifications.

Risks:

- Parent seeing wrong child.
- Catch-up overbooking.
- Internal notes leaking.

Acceptance criteria:

- Parent sees current child/program/stage/group.
- Parent sees upcoming lessons.
- Parent can cancel according to policy.
- Valid cancellation can create catch-up credit.

What not to do:

- Do not build full child portal yet.
- Do not expose admin-only data.

## Phase 8 - Instructor Portal And Assessment Workflow

Goal:

Make instructors productive on tablet during lessons.

Scope:

- Instructor dashboard.
- Agenda.
- Group/session roster.
- Attendance.
- Student assessment.
- Notes.
- Badge action foundation.

Tasks:

- Port Lovable instructor shell.
- Implement agenda -> group -> student flow.
- Wire assigned sessions.
- Save attendance.
- Save progress scores.
- Separate internal and parent-visible notes.
- Add badge award action foundation.

Dependencies:

- Phase 4.
- Phase 7 for parent-visible outputs.

Affected areas:

- Instructor shell.
- Sessions/attendance.
- Progress.
- Notes.

Risks:

- Touch workflow too slow.
- Instructor permissions too broad.
- Offline/poolside constraints postponed too long.

Acceptance criteria:

- Instructor sees assigned sessions.
- Instructor records attendance.
- Instructor records assessment.
- Parent-visible note is visible to parent; internal note is not.

What not to do:

- Do not make all students visible to every instructor.
- Do not build analytics here.

## Phase 9 - Progress, Badges And Achievement Cards

Goal:

Deliver the motivating learner journey.

Scope:

- Progress modules/items.
- Scoring labels.
- Parent progress view.
- Badge catalog.
- Badge awards.
- Achievement cards.

Tasks:

- Seed swim progress templates.
- Implement tenant progress configuration basics.
- Show active stage/module to parent.
- Trigger badge awards manually or by rules.
- Generate parent notifications.
- Prepare share-card privacy controls.

Dependencies:

- Phase 8.
- Phase 7.

Affected areas:

- Parent portal.
- Instructor portal.
- Tenant admin config.
- Notifications.

Risks:

- Negative progress language.
- Showing too much complexity to parents.
- Privacy leaks through sharing.

Acceptance criteria:

- Parent sees positive progress.
- Instructor scores update allowed parent view.
- Badge award notifies parent.
- Stage movement remains separate from billing.

What not to do:

- Do not build public social sharing until privacy is approved.

## Phase 10 - Afzwem Module And Digital Diploma Vault

Goal:

Support readiness, event planning, results, and diplomas.

Scope:

- Milestone readiness.
- Afzwem events.
- Parent invites.
- Result registration.
- Certificates/diplomas.
- Diploma vault.

Tasks:

- Model milestone events.
- Build readiness view.
- Build tenant admin afzwem planning.
- Build parent afzwem page.
- Register result.
- Generate/store certificate record.
- Store PDF/image in private storage.

Dependencies:

- Phase 9.
- Phase 4 resources/sessions.

Affected areas:

- Tenant admin.
- Parent portal.
- Storage.
- Notifications.

Risks:

- Sensitive result language.
- Diploma privacy.
- PDF generation scope creep.

Acceptance criteria:

- Admin schedules afzwem moment.
- Parent receives and views details.
- Result is registered.
- Diploma appears in vault.

What not to do:

- Do not build template editor in MVP.
- Do not make diplomas public by default.

## Phase 11 - Payments And Subscriptions

Goal:

Add billing visibility and manual payment management without distorting progress logic.

Scope:

- Payment plans.
- Subscriptions.
- Manual payment records/status.
- Admin payment overview.
- Parent payment view.
- Mollie boundary prepared.

Tasks:

- Finalize billing schema.
- Link enrollment/subscription/payment plan.
- Add manual status management.
- Add payment due/overdue notifications.
- Add provider abstraction for Mollie later.

Dependencies:

- Phase 4 domain model.
- Phase 6 placement if subscription starts after accepted slot.

Affected areas:

- Billing tables.
- Tenant admin.
- Parent portal.
- Notifications.

Risks:

- Treating stage as plan.
- Starting billing before accepted placement.
- Exposing payment secrets.

Acceptance criteria:

- Admin sees payment/subscription status.
- Parent sees relevant payment status.
- Manual payment flow works.
- Stage changes do not alter subscription by default.

What not to do:

- Do not integrate Mollie until approved.
- Do not block swim flow on online payments.

## Phase 12 - Tenant Admin Operations, Reports, Messages, Tasks And Documents

Goal:

Round out daily operations and reporting.

Scope:

- Tenant dashboard aggregations.
- Planning board improvements.
- Reports.
- Documents.
- Messages.
- Tasks.
- Role-based visibility.

Tasks:

- Wire admin dashboard KPIs.
- Improve planning board views.
- Add reports and filters.
- Add document storage policies.
- Add message center.
- Add task statuses and assignments.
- Add notification hooks.

Dependencies:

- Phase 4 through 11.
- Storage strategy.

Affected areas:

- Tenant admin.
- Parent/instructor portals.
- Storage.
- Notifications.

Risks:

- Sensitive documents visible to wrong role.
- Slow dashboard queries.
- Notification spam.

Acceptance criteria:

- Admin sees real operational metrics.
- Documents respect visibility.
- Messages and tasks work for intended roles.
- Reports use canonical definitions.

What not to do:

- Do not build complex CRM.
- Do not add external integrations unless approved.

## Phase 13 - Polish, Testing, Security And Staging Launch Readiness

Goal:

Harden staging and prepare for eventual production approval.

Scope:

- Visual QA.
- Responsive QA.
- RLS/security tests.
- Performance.
- Accessibility.
- Monitoring.
- Backups.
- Deployment verification.
- Rollback rehearsal.

Tasks:

- Run typecheck/lint/tests.
- Run RLS tests.
- Run Playwright smoke suite.
- Compare critical screens to Lovable screenshots.
- Test staging deploy.
- Verify Caddy/systemd/runner health.
- Verify env/secrets.
- Verify Supabase backups.
- Rehearse rollback.

Dependencies:

- MVP phases.

Affected areas:

- Entire app.
- VPS.
- Supabase.
- GitHub Actions.

Risks:

- Visual drift.
- Hidden tenant leaks.
- Failing migrations.
- Missing backups.

Acceptance criteria:

- Staging deploy is green.
- Critical flows pass.
- No known P0/P1 security issues.
- Rollback procedure is tested.
- Product owner approves next environment step.

What not to do:

- Do not add new product scope during hardening.
- Do not deploy production without approval.

## Phase 14 - Canon Alignment And Productization

Goal:

Turn the implemented staging MVP into a coherent product surface that matches the NXTTRACK canon.

Scope:

- Runtime scaffold copy removal.
- Platform admin overview.
- Tenant admin settings.
- Terminology cleanup.
- Navigation cleanup.
- Visible MVP route coverage.

Tasks:

- Replace `/platform` placeholder with a useful platform overview.
- Add `/admin/instellingen` for organization settings and policies.
- Remove Phase 2/skeleton wording from runtime pages.
- Replace user-facing tenant terminology with organization/swim-school wording.
- Remove or fix navigation links that point to missing routes.
- Update docs so implementation status, staging status and product readiness are distinct.

Dependencies:

- Phase 3 through 13 code baseline.
- NXTTRACK canon.

Affected areas:

- Platform admin.
- Tenant admin.
- Public copy.
- Navigation.
- Docs.

Risks:

- Hiding real staging blockers behind nicer copy.
- Mixing platform admin and tenant admin data.
- Renaming technical internals while only user-facing terminology needs cleanup.

Acceptance criteria:

- `/platform` is no longer a placeholder.
- `/admin/instellingen` exists.
- Runtime UI no longer exposes Phase 2/scaffold language.
- Backoffice navigation resolves.
- README and phase docs reflect real status.

What not to do:

- Do not add new business domains.
- Do not remove staging warnings that are still true.
- Do not rename database tables for cosmetic terminology.

## Phase 15 - Staging Truth And Security Validation

Goal:

Prove that the MVP code works against the real staging environment and that tenant isolation is intact.

Scope:

- Supabase migrations.
- Supabase advisors.
- RLS tests.
- Seeded role accounts.
- Staging smoke and launch gates.

Tasks:

- Fix the failing staging migration execution.
- Apply all migrations to staging.
- Run Supabase advisors and resolve or explicitly accept findings.
- Confirm `admin@nxttrack.nl` platform owner access.
- Run RLS checks with platform owner, tenant admin, instructor and parent.
- Run `PLAYWRIGHT_BASE_URL=https://staging.nxttrack.nl pnpm run test:e2e`.
- Run strict launch gate with truthful confirmations.

Acceptance criteria:

- No critical advisor findings remain unresolved.
- Role smoke tests pass with required credentials.
- Live Playwright staging smoke passes.
- Strict staging gate is green.

## Phase 16 - End-To-End Operational Flows

Goal:

Prove that the canonical swim-school journey works without manual database intervention.

Scope:

- Intake to diploma happy path.
- Admin, parent and instructor workflows.
- Real staging accounts and seeded demo data.

Tasks:

- Create a demo swim school organization with stable data.
- Automate parent intake, waitlist conversion, placement scoring and slot offer.
- Test slot offer accept/decline.
- Confirm participant appears in parent portal and instructor roster.
- Record attendance, progress, badge and parent-visible note.
- Confirm payment/subscription visibility.
- Confirm afzwem readiness, event, result and diploma record.
- Add authenticated Playwright coverage for the complete happy path.

Acceptance criteria:

- One complete tenant flow passes on staging.
- No manual database edits are required during the flow.
- Core role dashboards show the resulting data correctly.

## Phase 17 - Communication, Storage And Documents

Goal:

Make communication and files production-shaped instead of metadata-only.

Scope:

- SendGrid/API mail delivery.
- Templates.
- Notification status.
- Supabase Storage.
- Documents and diploma files.

Tasks:

- Add organization-aware mail templates and sender behavior.
- Log delivery attempts and failures.
- Add document upload/download with storage policies.
- Add private diploma/certificate file storage.
- Add parent/instructor document views.
- Add retry/admin diagnostics for failed mail.

Acceptance criteria:

- Invites, reset codes, slot offers and notifications send through the configured provider.
- Documents and diplomas are stored privately and served only to authorized roles.
- Admin can see delivery/file status.

## Phase 18 - Planning, Capacity And Catch-Up Depth

Goal:

Upgrade the operational planning backbone from basic CRUD to daily scheduling support.

Scope:

- Planboard depth.
- Resource/lane capacity.
- Instructor availability.
- Catch-up scheduling.
- Conflict detection.

Tasks:

- Add day/week planning views.
- Surface resource, lane and instructor conflicts.
- Add capacity colors and occupancy summaries.
- Add catch-up request/selection flow.
- Add admin approval where policy requires it.
- Prepare drag-and-drop as later enhancement, not a blocker.

Acceptance criteria:

- Admin can see planning conflicts before they affect lessons.
- Catch-up credits can be converted into real lesson options.
- Capacity calculations remain consistent across admin, parent and instructor views.

## Phase 19 - Parent And Instructor Experience Depth

Goal:

Make the two daily user shells feel polished, fast and role-specific.

Scope:

- Parent portal completeness.
- Instructor tablet workflow.
- Messages, tasks and documents.
- Achievement presentation.

Tasks:

- Add parent messages and documents views.
- Add parent badge/achievement view if not sufficiently covered by progress.
- Add instructor messages, tasks and documents routes.
- Improve mobile parent portal ergonomics.
- Improve tablet-first instructor roster and assessment flow.
- Add stronger empty states and loading/error copy.

Acceptance criteria:

- Parent can self-serve lessons, progress, payments, documents and communication.
- Instructor can handle a lesson from tablet without backoffice detours.
- Private notes and documents remain correctly separated.

## Phase 20 - Billing Automation Boundary

Goal:

Prepare commercial automation without letting billing distort the learning model.

Scope:

- Mollie/iDEAL boundary.
- Invoice/export preparation.
- Failed payment lifecycle.
- Subscription lifecycle.

Tasks:

- Define provider abstraction for payment sessions and webhooks.
- Add payment event history.
- Add failed/overdue workflows and admin follow-up tasks.
- Add invoice/export data model where needed.
- Keep stage movement independent from subscription changes.

Acceptance criteria:

- Manual billing remains intact.
- Payment provider work can start without schema rework.
- Admin and parent payment status remain understandable.

## Phase 21 - Intelligence, Insights And Automation

Goal:

Add next-gen assistance while keeping humans in control of placement, progress and billing decisions.

Scope:

- Placement recommendations.
- Planning suggestions.
- Operational insights.
- AI-assisted messaging/reporting.

Tasks:

- Add explainable placement suggestions with alternatives.
- Add waitlist conversion and capacity insights.
- Add instructor workload and progress bottleneck reports.
- Add optional AI draft assistance for messages and summaries.
- Add audit and opt-in controls for AI-assisted behavior.

Acceptance criteria:

- AI assists but never silently decides placement, billing or sensitive child outcomes.
- Admins can see the reason behind recommendations.
- Insights map to canonical reports and operational decisions.

## Phase 22 - Production Readiness And Commercial Launch

Goal:

Move from staging MVP to a controlled production launch.

Scope:

- Production environment.
- Monitoring.
- Backup/restore proof.
- Rollback proof.
- Security review.
- Product-owner approval.

Tasks:

- Harden production secrets and environment protection.
- Add monitoring and alerting for health, 5xx, asset MIME failures, Supabase errors and mail failures.
- Rehearse restore and rollback.
- Run accessibility and performance pass.
- Freeze MVP scope for launch candidate.
- Prepare launch checklist and support runbook.

Acceptance criteria:

- Product owner signs off.
- No known P0/P1 security or availability issues remain.
- Production deploy and rollback are proven.
- Support and monitoring are operational.

## Recommended Implementation Order

1. Phase 0 because repo, deployment, and secrets block safe work.
2. Phase 1 because Lovable must be preserved before UI work.
3. Phase 2 because the app scaffold must match deploy assumptions.
4. Phase 3 because tenant isolation protects every later module.
5. Phase 4 because programs/groups/sessions/resources are the backbone.
6. Phase 5 and 6 because intake, waitlist, and placement create participants.
7. Phase 7 and 8 because parent and instructor flows depend on placement and sessions.
8. Phase 9 and 10 because progress, badges, afzwem, and diplomas depend on assessments.
9. Phase 11 because billing must attach to enrollment/placement without controlling progress.
10. Phase 12 because reports and operations need real domain data.
11. Phase 13 because hardening comes after the MVP surface exists.
12. Phase 14 because implemented code must become a coherent product surface before review.
13. Phase 15 because staging truth and security validation must be proven before broader flows.
14. Phase 16 because the complete swim-school journey must work without database intervention.
15. Phase 17 through Phase 22 because communication, planning depth, experience polish, billing automation, intelligence and production launch depend on a stable staging MVP.

## Immediate Next Proposal After PR Approval

After Phase 14 starts:

1. Remove runtime scaffold copy.
2. Build the platform overview.
3. Add tenant admin settings.
4. Re-run typecheck/build.
5. Resume Phase 15 staging validation.
