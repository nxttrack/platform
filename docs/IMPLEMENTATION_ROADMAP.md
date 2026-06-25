# NXTTRACK Implementation Roadmap

Last updated: 2026-06-25

Status: dependency-based roadmap. Implementation starts only after product owner approval.

## Current Sprint Numbering Note

The original roadmap below was created before implementation started and used Phase 4 for core operational domain work and Phase 5 for public tenant intake.

The approved working sprint order now treats the completed core domain foundation as Phase 3 and the public tenant site/intake foundation as Phase 4. The dependency order is unchanged:

1. identity and shells;
2. core domain;
3. public tenant site and intake;
4. waitlist, placement assistant and slot offers.

## Roadmap Principles

- Document first, plan second, build third.
- Preserve Lovable UI; do not redesign.
- Build foundations before feature depth.
- Keep swim-first visible labels but generic internals.
- Tenant isolation and security are foundation work.
- Staging is the first target.
- Manual payments come before Mollie/iDEAL automation.
- SendGrid SMTP comes before advanced notification channels.

## Feature Comparison Expansion Principles

The latest swim-school feature comparison adds important future modules. They are now official roadmap domains, but they do not all belong in MVP.

Dependency rules:

- Multi-language readiness must be prepared early because it affects copy, templates, tenant settings, public pages, and communication.
- Registration fee and SEPA/incasso readiness belong near billing architecture, but live collection comes after manual payments are reliable.
- Communication channel modeling must exist before WhatsApp, SMS, emergency broadcast, and segmented messaging.
- Staff competencies can start as a basic model before competency-aware scheduling and leave planning.
- Integration settings can exist as placeholders before any external provider is activated.
- Hardware access control and auto attendance are enterprise/later because they depend on provider selection, hardware contracts, privacy policy, and audit rules.
- Safety and compliance tracking is enterprise/later because it needs careful legal wording and tenant-defined standards. NXTTRACK must not claim automatic NRZ compliance.

Roadmap placement:

| Placement | Modules/features |
| --- | --- |
| Early architecture preparation | Multi-language readiness, registration fee model, SEPA/incasso readiness, communication channel model, staff competencies basic model, integration settings placeholder |
| Growth / Pro modules | Batch payments, one-off payments, flexrooster, auto-fill empty spots, webshop, credit/extra-lesson sales, staff leave planning, segmented communication, tenant helpdesk, knowledge base |
| Enterprise / later modules | QR/barcode/RFID access control, auto attendance through access control, Safety & Compliance Engine, incident/BHV/complaints/checklists, advanced integrations, WhatsApp Business API, SMS fallback, advanced multilingual templates |

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

## Phase 14 - Architecture Readiness For Growth Modules

Goal:

Prepare cross-cutting foundations for future paid/pro/enterprise modules without activating broad feature logic.

Scope:

- Multi-language readiness.
- Registration fee model.
- SEPA/incasso readiness.
- Communication channel model.
- Staff competency basic model.
- Integration settings placeholder.

Tasks:

- Add locale/language strategy to tenant settings, public content, templates, and notification copy.
- Extend billing vocabulary for registration fees, one-off payments, payment periods, and SEPA/incasso placeholders.
- Add communication channel taxonomy: app, email, push, WhatsApp, SMS, emergency.
- Add staff profile/competency/credential vocabulary with swim examples and generic internals.
- Add integration settings placeholder for Mollie, bookkeeping, WhatsApp Business, SMS, access hardware, CRM/ticket systems, webhooks, and API keys.
- Update secrets registry before any external provider is wired.

Dependencies:

- Phase 3 identity/roles.
- Phase 11 manual payments.
- Phase 12 communication/documents/reports.

Affected areas:

- Tenant settings.
- Billing architecture.
- Communication templates.
- Staff domain.
- Integration settings.
- Docs and environment placeholders.

Risks:

- Overbuilding provider logic before product policy is approved.
- Mixing payment collection with stage/group movement.
- Storing secrets in tenant data without an approved secret-storage design.

Acceptance criteria:

- Canonical names and future fields are documented.
- UI can later expose settings without renaming core concepts.
- No external provider is called.
- No real secrets are committed.

What not to do:

- Do not implement Mollie, SEPA, WhatsApp, SMS, hardware, or bookkeeping calls.
- Do not create production automation for these modules.

## Phase 15 - Billing & Incasso Engine

Goal:

Move from manual payments to robust billing operations while preserving the separation between billing, stage, and placement.

Scope:

- iDEAL.
- SEPA incasso.
- Registration fee.
- One-off payments.
- Batch payments.
- Payment periods.
- Payment reminders.
- Failed payment signals.
- Financial overviews.

Tasks:

- Define invoice numbering, period, and fee rules.
- Add registration fee and one-off payment lifecycle.
- Add SEPA mandate/collection readiness.
- Add payment batch planning and export/reconciliation.
- Add failed payment and overdue signals.
- Add parent/admin financial views.
- Prepare Mollie activation behind provider settings and webhook verification.

Dependencies:

- Phase 11 payment foundation.
- Phase 14 billing readiness.
- Provider/secret approval.

Acceptance criteria:

- Admin can distinguish subscription, registration fee, one-off payment, and credit purchase.
- Batch payments are visible and auditable.
- Failed payment signals can drive reminders.
- Stage/group changes do not change billing unless an explicit billing action exists.

What not to do:

- Do not activate automatic SEPA or Mollie collection before manual flow and provider tests are approved.

## Phase 16 - Flexrooster, Flex Fill, Webshop And Credits

Goal:

Add commercial flexibility around sessions, open spots, credits, and purchasable activities.

Scope:

- Flex schedule beside regular schedule.
- Open spot detection.
- Auto-fill empty lesson spots.
- Make-up credit placement.
- Trial lesson placement.
- Extra paid lesson placement.
- Priority rules for open spots.
- Webshop for activities, products/articles, extra lessons, make-up credits, and vacation lessons.
- Credits/entitlements generated after purchase.

Tasks:

- Model flexible sessions and open capacity slots.
- Define entitlement/credit types and expiry rules.
- Connect credit eligibility to session capacity.
- Add priority rules for open-spot fill.
- Add webshop catalog and purchasable time slots.
- Create fulfillment hooks that generate credits or booking rights after confirmed payment/manual approval.

Dependencies:

- Phase 4 sessions/resources/capacity.
- Phase 7 catch-up foundation.
- Phase 11/15 billing state.
- Phase S2 capacity holds.

Acceptance criteria:

- Admin sees regular capacity and flex capacity separately.
- Credits can be used only for eligible sessions.
- Webshop purchase creates a traceable entitlement, not silent stage movement.

What not to do:

- Do not auto-fill a spot without tenant-configured priority and approval settings.

## Phase 17 - Staff Competency & Leave Engine

Goal:

Make staffing data useful for safe scheduling and operational continuity.

Scope:

- Staff profile information.
- Instructor competencies.
- Certificates.
- BHV/EHBO tracking.
- Leave requests.
- Leave approval.
- Replacement signals.
- Competency-aware scheduling.

Tasks:

- Extend staff profiles with competencies and credentials.
- Track certificate validity, BHV/EHBO metadata, and expiry signals.
- Add leave request and approval flow.
- Show replacement signals when leave conflicts with scheduled sessions.
- Add planning warnings when required competencies are missing.

Dependencies:

- Phase 3 roles.
- Phase 4 instructor/group/session planning.
- Phase 14 staff competency readiness.

Acceptance criteria:

- Admin can see whether a scheduled instructor matches tenant requirements.
- Leave requests affect planning warnings.
- Expiring credentials are visible and auditable.

What not to do:

- Do not claim regulatory compliance from stored credentials alone.

## Phase 18 - Communication Escalation, Helpdesk And Knowledge Base

Goal:

Create professional tenant support and escalation workflows.

Scope:

- App notification first.
- Email second.
- Push if available.
- WhatsApp only for urgent reminders or no response.
- SMS fallback only if needed.
- Emergency broadcast.
- Segmented communication.
- Parent support tickets.
- Ticket categories and status flow.
- Internal notes.
- Context from child/program/group/payment.
- Customer knowledge base and suggested help articles.
- Self-service FAQ.

Tasks:

- Add channel policy and consent rules.
- Add segmented audience builder.
- Add emergency broadcast workflow with audit.
- Add ticket model and support workspace.
- Add article/FAQ model with tenant and platform content.
- Suggest help articles based on ticket category/context.

Dependencies:

- Phase 12 messages/tasks/documents.
- Phase 14 communication channel model.
- Provider/secret approval for WhatsApp/SMS/push.

Acceptance criteria:

- Parent tickets are tenant-scoped and context-aware.
- Internal support notes do not leak to parents.
- Escalation channels are controlled by policy and audit.

What not to do:

- Do not use WhatsApp or SMS for normal bulk marketing without explicit consent and provider approval.

## Phase 19 - Access Control, Auto Attendance, Safety & Advanced Integrations

Goal:

Add enterprise-grade physical access, safety administration, and external integrations.

Scope:

- QR check-in.
- Barcode check-in.
- RFID check-in.
- Lesson time validation.
- Access only during assigned lesson windows.
- Automatic attendance with manual correction.
- Incident registration.
- Accident registration.
- BHV records.
- Complaints management.
- Checklists.
- Instructor certification tracking.
- Tenant-defined standards.
- NRZ-related tracking without claiming automatic compliance.
- Bookkeeping integrations.
- WhatsApp Business API.
- SMS provider.
- Access control hardware.
- CRM/ticket systems.
- Webhooks and API keys.

Tasks:

- Add access credential and check-in event model.
- Validate check-ins against assigned session windows.
- Convert trusted check-in events into attendance suggestions or records according to tenant policy.
- Add correction and audit workflow for instructors/admins.
- Add safety/incident/complaint/checklist modules.
- Add tenant-defined standards and evidence tracking.
- Add advanced integration registry, webhooks, API keys, retry logs, and audit.

Dependencies:

- Phase 4 sessions/resources.
- Phase 8 attendance.
- Phase 13 hardening.
- Phase 14 integration placeholders.
- Legal/provider/hardware decisions.

Acceptance criteria:

- Access events are tenant-scoped, auditable, and correctable.
- Auto attendance cannot silently override human corrections.
- Safety records are private and permissioned.
- Integrations use registered secrets/placeholders only.

What not to do:

- Do not claim NRZ or legal compliance automatically.
- Do not activate hardware integrations without provider-specific testing.

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
12. Phase 14 because growth modules share settings, terminology, channel, billing and integration foundations.
13. Phase 15 because advanced billing/incasso depends on the manual payment foundation.
14. Phase 16 because flex fill and webshop depend on capacity, sessions, credits and billing.
15. Phase 17 because competency-aware scheduling depends on staff and planning data.
16. Phase 18 because escalation/helpdesk depends on mature communication and context records.
17. Phase 19 because access hardware, auto attendance, safety/compliance and advanced integrations require hardened permissions, audit, providers and legal decisions.

## Immediate Next Proposal After PR Approval

After approval of this documentation PR:

1. Confirm staging domains and DNS plan.
2. Confirm Supabase staging project.
3. Confirm migration runner.
4. Create screenshot baseline list for Lovable routes.
5. Start Phase 2 app scaffold only after those decisions are closed.
