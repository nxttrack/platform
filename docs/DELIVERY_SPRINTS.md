# NXTTRACK Delivery Sprints

Status: active delivery plan from technically completed Sprint 4 staging release `cb9c0b621de67125923a4cd92f1c04d9f3717a06` toward controlled production launch and post-launch product growth. Sprint 5 remains gated by the two human release confirmations and explicit production authorization.

## Working Agreement

- One sprint has one measurable outcome and explicit evidence.
- `main` remains the only implementation and release source.
- Staging must expose the exact sprint-end commit before a sprint can be accepted.
- Manual approvals are never inferred from a successful technical check.
- Production promotion requires its own authorization; completing a sprint does not silently grant it.
- Payment-provider activation moves before launch only when the MVP scope decision requires online payment at launch.

## Sprint Overview

| Sprint | Outcome | Primary evidence | Depends on |
| --- | --- | --- | --- |
| 1. Release-candidate evidence | Strict staging gate is green and the reviewed SHA is named | Visual sign-off, managed-backup confirmation, 0-warning gate | Current staging release |
| 2. Production foundation | Production environment is isolated, protected and fully specified | Environment audit, secret/host matrix, migration rehearsal plan | Sprint 1 |
| 3. Communications and observability | Users can receive mail and operators receive actionable alerts | Delivery tests, uptime/5xx/mail alert drills, support ownership | Sprint 2 |
| 4. Full-journey quality and security | Critical mutations, accessibility, performance and security are release-proven | Browser mutation suite, budgets, P0/P1 review | Sprints 2-3 |
| 5. Controlled production rehearsal and launch | Exact approved SHA can deploy, recover and operate in production | Deploy/rollback evidence, smoke results, launch approval | Sprints 1-4 |
| 6. Billing activation | Optional online payments work without coupling billing to learning progress | Provider/webhook/refund tests and reconciliation | MVP scope decision |
| 7. Intelligence and assistance | Explainable insights and drafts assist users without deciding for them | Reason codes, audit log, opt-in and human approval | Stable production data |
| 8. Experience depth and growth | High-value UX enhancements improve speed, delight and conversion | Product metrics and usability validation | Production baseline |

## Sprint 1 - Release-Candidate Evidence

Goal: turn the technically healthy staging build into an explicitly reviewed release candidate.

Scope:

- Refresh the visual acceptance record against the latest live SHA.
- Obtain product-owner classification of intentional canon differences.
- Verify Supabase-managed backup retention, Auth/Storage coverage and restore options.
- Keep logical backup/restore evidence reproducible.
- Reduce GitHub artifact retention pressure and preserve a log fallback.
- Synchronize live-status documentation.
- Rerun the strict staging gate with truthful confirmations.

Definition of done:

- Product owner, review date and reviewed SHA are recorded.
- Infrastructure owner, backup policy and review date are recorded.
- `LOVABLE_VISUAL_CHECK_CONFIRMED=true` and `SUPABASE_BACKUPS_CONFIRMED=true` are set only after those records exist.
- Strict staging gate reports `0 failure(s), 0 warning(s)`.
- The accepted candidate SHA is live and named as the input for Sprint 2.

Detailed execution: [Sprint 1 - Release Candidate Evidence](SPRINT_01_RELEASE_CANDIDATE_EVIDENCE.md).

## Sprint 2 - Production Foundation

Goal: make the existing GitHub production environment safe and unambiguous before any production migration or deploy.

Scope:

- Verify that the production Supabase project is separate from staging and that every secret points to the intended project.
- Remove the production `E2E_BASE_URL` reference to staging.
- Define production hostname routing for platform marketing, admin and tenant domains.
- Add migration, health, bootstrap and rollback variables with production-safe defaults.
- Add environment reviewers or document the compensating manual control when GitHub plan limits block protection rules.
- Confirm Caddy, systemd, TLS, release directories and port `3800`.
- Produce a read-only production database inventory and migration rehearsal plan.

Definition of done:

- Production configuration contains no staging host or credential reference.
- No migration or deployment has run against an unidentified database.
- Release authority, required confirmation and rollback owner are documented.
- Production remains undeployed until Sprint 5 authorization.

Detailed execution: [Sprint 2 - Production Foundation](SPRINT_02_PRODUCTION_FOUNDATION.md).

## Sprint 3 - Communications, Monitoring And Operations

Goal: make account flows deliverable and failures visible to an accountable operator.

Scope:

- Configure SendGrid or SMTP with verified sender, SPF, DKIM and DMARC.
- Test invite, password reset and operational delivery with bounce/failure diagnostics.
- Monitor health, 5xx, Supabase connectivity, asset MIME failures and mail failures.
- Define log retention, alert destinations, escalation ownership and response times.
- Complete support, incident and recovery runbooks.

Definition of done:

- Mail delivery succeeds to a controlled external inbox and failures are observable.
- Synthetic failures generate alerts received by the named owner.
- On-call/support ownership and incident steps are usable without repository archaeology.

Detailed execution: [Sprint 3 - Communications And Observability](SPRINT_03_COMMUNICATIONS_OBSERVABILITY.md).

## Sprint 4 - Full-Journey Quality And Security

Goal: prove user-driven mutations rather than only seeded state and dashboard visibility.

Scope:

- Browser-drive intake, waitlist, offer, enrollment, attendance, progress, badge, diploma, cancellation, catch-up, payment and document/communication flows.
- Add accessibility and performance budgets for critical mobile, tablet and desktop routes.
- Complete P0/P1 security review, including database-owner behavior for the 63 tables that do not `FORCE ROW LEVEL SECURITY`.
- Test duplicate submission, expired tokens, permission denial, error and recovery states.
- Validate parent mobile and instructor tablet workflows with realistic data density.

Definition of done:

- Critical journey mutations pass against staging without direct database intervention.
- No known P0/P1 security, accessibility or availability issue remains.
- Performance budgets and accepted exceptions are recorded.

Detailed execution: [Sprint 4 - Full-Journey Quality And Security](SPRINT_04_FULL_JOURNEY_QUALITY_SECURITY.md).

## Sprint 5 - Controlled Production Rehearsal And Launch

Goal: promote one frozen, approved candidate with proven recovery and support.

Scope:

- Freeze MVP scope and name the exact approved staging SHA.
- Take/verify provider backup and migration restore point.
- Rehearse production deploy, health, browser smoke and runtime rollback.
- Validate DNS, TLS, Caddy, systemd and tenant routing.
- Record go/no-go participants, decision, support window and rollback triggers.
- Promote only after explicit production authorization.

Definition of done:

- Production exposes the approved SHA and all critical smoke checks pass.
- Rollback is executable within the agreed recovery objective.
- Product, infrastructure and support owners sign off.

## Sprint 6 - Billing Activation

Goal: activate online payment only if commercial scope requires it.

Scope:

- Mollie/iDEAL credentials, payment sessions and signed/idempotent webhooks.
- Failed, expired, refunded and disputed payment handling.
- Invoice/export and reconciliation workflow.
- Admin/parent status clarity while stage movement remains independent.

Definition of done:

- Provider sandbox and controlled live transaction evidence exists.
- Duplicate webhooks cannot duplicate business effects.
- Manual billing remains a supported fallback.

## Sprint 7 - Intelligence, Insights And Automation

Goal: assist placement, planning, communication and reporting while humans retain control.

Scope:

- Explainable placement alternatives and capacity insights.
- Waitlist conversion, instructor workload and progress bottleneck reports.
- Optional AI message and report drafts.
- Consent/opt-in, audit trail, reason display and human approval.

Definition of done:

- No sensitive child, placement or billing outcome is silently decided.
- Every recommendation has visible inputs/reasons and can be ignored.
- AI-assisted actions are attributable and auditable.

## Sprint 8 - Experience Depth And Growth

Goal: prioritize refinements using production evidence.

Candidate backlog:

- Approved photography and richer campaign content.
- Global interactive search.
- Drag-and-drop planning.
- Richer demo data and visual regression goldens.
- Additional motion and micro-interactions.
- Dashboard personalization and scheduled reports.
- Conversion and onboarding experiments.

Definition of done:

- Each selected enhancement has a user/problem metric and usability acceptance.
- Nice-to-haves do not bypass security, privacy or release controls.
