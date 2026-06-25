# NXTTRACK Smart Flow Phaseplan

Reviewed on: 2026-06-25

Status: proposed next-level implementation plan. This plan starts from the current `staging` codebase. It does not restart the original rebuild roadmap.

## 1. Goal

The current platform has broad Swim Start coverage. The next goal is to make NXTTRACK's smart, modern, interactive layer the product showpiece.

This phaseplan focuses on the Smart Flow Engine:

```txt
intake -> stage recommendation -> waitlist -> placement -> slot offer -> enrollment -> lessons -> progress -> flow-through -> afzwem -> diploma
```

The work must stay swim-first in visible UX and generic in internal architecture.

## 2. Current Baseline

Already available in code:

- Public tenant website and intake routes.
- Intake submissions and intake events.
- Waitlist entries.
- Placement suggestions.
- Slot offer accept/decline flow.
- Enrollment and group membership models.
- Group/session/resource/instructor planning foundation.
- Conflict checks during session generation.
- Parent and instructor portals.
- Attendance, notes, progress, badges, and stage transition proposals.
- Afzwem events and certificate records.
- Manual payments, reminders, corrections, and export preparation.
- Messages, templates, SMTP first, SendGrid-ready adapter, outbox, retries, and event hooks.
- Tasks, documents, reports, imports, audit logs, observability, and platform admin foundations.

Main gap:

The platform has many workflow parts, but the smart decisions are not yet a coherent, explainable, tenant-configurable engine layer.

## 3. Recommended Order

Do not build more isolated pages first. Build the smart foundation, then improve each workflow on top of it.

Recommended order:

1. Smart engine architecture.
2. Smart intake and stage recommendation.
3. Capacity ledger and hold model.
4. Waitlist scoring.
5. Placement Assistant 2.0.
6. Slot offer and placement hardening.
7. Lesson and makeup intelligence.
8. Progress and badge intelligence.
9. Flow-through engine.
10. Diploma readiness and afzwem radar.
11. Smart dashboard and reporting.
12. Advanced automation and AI assistant.

## Phase S0 - Smart Engine Architecture Consolidation

### Goal

Create one reusable pattern for every smart recommendation and decision.

### Current Base

The code already has placement suggestions, stage transition proposals, intake events, message events, report exports, audit logs, and domain actions.

### Build

- Add a shared Smart Flow vocabulary in docs and code comments where useful.
- Define a canonical decision shape:
  - engine key
  - tenant id
  - subject type and subject id
  - input snapshot
  - rule version
  - score
  - confidence
  - reasons
  - blockers
  - recommendation
  - human decision
  - override reason
  - result
  - audit event
- Decide whether to introduce a generic `smart_decisions` table now or extend each module table with the same JSON structure.
- Create engine settings per tenant:
  - mode: manual, semi-automatic, automatic
  - weights
  - thresholds
  - expiry and hold durations
  - notification behavior
- Document the rule versioning policy.
- Create shared helper functions for `reasons_json`, `blockers_json`, and audit entries.

### UX

- Admin sees why a recommendation exists.
- Admin can approve, reject, or override with reason.
- Parent only sees clear human language, not internal scoring.

### Acceptance

- At least intake recommendation and placement recommendation use the same decision shape.
- Every decision stores input snapshot and reasons.
- Override requires a reason.
- Audit log records decision lifecycle.

### Not In This Phase

- Fully automatic placement.
- AI decisions.
- Rebuilding all existing pages.

## Phase S1 - Smart Intake And Stage Recommendation

### Goal

Turn intake into the start of the smart flow.

### Current Base

Public intake already stores intake type, parent and child data, preferred days, time windows, custom answers, and status events.

### Build

- Add intake config versioning.
- Add richer intake question types:
  - single select
  - multi select
  - yes/no
  - number
  - date
  - free text
  - consent
  - swim-experience scale
- Add conditional question rules.
- Add stage recommendation rules per program.
- Add recommendation output:
  - recommended stage
  - confidence
  - reasons
  - missing information
  - admin override
- Add duplicate detection at submit and admin review:
  - same child name plus birthdate
  - same guardian email
  - similar name
  - active enrollment check
- Add intake confirmation message event.
- Add admin intake review panel with recommendation, duplicate warning, and next action.

### Data

- Extend or version `intake_form_configs`.
- Store recommendation snapshot on intake submission or smart decision record.
- Add duplicate match records or structured metadata.

### Acceptance

- Parent can submit a configured intake.
- Admin sees a recommended stage with reasons.
- Admin can override the recommendation with a reason.
- Duplicate warnings are visible before conversion to waitlist/enrollment.
- Intake status timeline remains clear.

### Not In This Phase

- Automatic group placement.
- Payment creation.
- Parent account provisioning beyond existing invite preparation.

## Phase S2 - Capacity Engine

### Goal

Make capacity reliable enough for smart placement and flow-through.

### Current Base

Groups have capacity. Placement counts active group memberships. Session generation checks resource and instructor conflicts.

### Build

- Introduce capacity snapshot rules for:
  - fixed spots
  - active memberships
  - pending slot offers
  - reserved spots
  - trial spots
  - makeup spots
  - future starts
  - ending memberships
- Add capacity holds:
  - created by slot offer
  - created by flow-through target reservation
  - expires automatically
  - releases on decline, expiry, or cancel
- Add resource and instructor conflict summary to group/session planning.
- Add overbooking policy per tenant or group.
- Add capacity explanation object for UI.

### UX

- Admin sees open, held, reserved, and blocked capacity separately.
- Placement Assistant shows why a group is available or blocked.
- Planning page shows conflicts as actionable warnings.

### Acceptance

- Slot offers reduce available capacity while pending.
- Declined/expired offers release capacity.
- Capacity checks can explain their result.
- Existing active group memberships are not double-counted.

### Not In This Phase

- Automatic waitlist rematch.
- Makeup slot marketplace.

## Phase S3 - Smart Waitlist

### Goal

Make the waitlist fair, searchable, explainable, and useful for placement.

### Current Base

Waitlist entries exist with status, program, recommended stage, preferred days, preferred time windows, and source intake.

### Build

- Add waitlist scoring rules:
  - priority date
  - stage match
  - preferred day match
  - preferred time match
  - sibling or family policy
  - trial or regular registration preference
  - admin priority flag
  - urgency or tenant-specific reason
- Store score and reasons.
- Add filters:
  - program
  - stage
  - preferred day
  - status
  - priority
  - duplicate risk
  - last contacted
- Add waitlist event timeline.
- Add admin override and priority reason.
- Trigger candidate re-evaluation when group capacity changes.

### Acceptance

- Admin can see ranked waitlist candidates.
- Every rank has an explanation.
- Priority overrides are audited.
- Placement Assistant can use the waitlist score.

### Not In This Phase

- Automatically sending offers.
- AI ranking.

## Phase S4 - Placement Assistant 2.0

### Goal

Make placement the main smart showpiece for tenant admins.

### Current Base

Admins can create a placement suggestion from a selected waitlist entry and group. The current score uses simple fit signals.

### Build

- Add two matching modes:
  - best groups for one learner
  - best learners for one group
- Add match scoring:
  - program match
  - stage match
  - preferred day/time fit
  - capacity availability
  - resource availability
  - instructor availability
  - waitlist priority
  - start date fit
  - blockers
- Add compare view for candidate/group options.
- Add batch suggestion creation.
- Add suggested next action:
  - offer slot
  - request more info
  - keep waiting
  - manual review
- Add explanation panel in Dutch.
- Add audit trail for approve, reject, override, and offer sent.

### Acceptance

- Admin can open a waitlist entry and see ranked group options.
- Admin can open a group and see ranked candidates.
- The assistant explains score and blockers.
- Admin can approve a suggestion into a slot offer.
- Suggestion does not change billing.

### Not In This Phase

- Fully automatic placement.
- Direct payment integration.

## Phase S5 - Slot Offer And Placement Completion

### Goal

Make the offer-to-placement flow robust enough for real parents.

### Current Base

Slot offers exist with token, public accept/decline, expiry, status, and message events. Accept creates enrollment and group membership.

### Build

- Add capacity hold integration.
- Add offer reminder schedule.
- Add clear expiry behavior.
- Add resend/cancel actions.
- Add parent-facing accept/decline UX polish.
- Add decline reason capture.
- Add final placement transaction boundary:
  - create or update enrollment
  - create group membership
  - close waitlist entry
  - release hold
  - update intake lifecycle
  - create parent notification
  - create audit log
- Add failure recovery if one step fails.

### Acceptance

- Pending offer holds capacity.
- Accept creates the right enrollment and group membership exactly once.
- Decline and expiry release capacity.
- Admin can resend or cancel.
- Parent receives clear confirmation.

### Not In This Phase

- Mollie/iDEAL payment activation.
- Automatic recurring billing.

## Phase S6 - Lesson And Makeup Engine

### Goal

Make lessons, attendance, cancellation, and makeup requests operationally smart.

### Current Base

Sessions can be generated from recurring groups. Instructors can record attendance. Parents can request catch-up lessons. Admin can update catch-up status.

### Build

- Define cancellation rules:
  - who may cancel
  - deadline
  - allowed reasons
  - whether makeup credit is granted
- Add makeup credit records.
- Add makeup candidate session matching:
  - same program
  - same or compatible stage
  - available makeup capacity
  - date/time preference
  - instructor/resource constraints
- Add parent self-service request or selection flow.
- Add admin approval mode.
- Add parent and instructor notifications.
- Add attendance-to-makeup trigger.

### Acceptance

- Absence can create a makeup credit when rules allow.
- Parent can request or choose a suitable makeup moment.
- Admin can approve/reject.
- Capacity is respected.
- Attendance reports include makeup impact.

### Not In This Phase

- Fully automatic makeup placement without tenant approval.

## Phase S7 - Progress And Badge Engine 2.0

### Goal

Make progress useful for instructors, parents, and smart flow-through.

### Current Base

Progress updates, module progress, badges, badge awards, achievement cards, notes, compliments, and stage transition proposals exist.

### Build

- Add program stage module/rubric management.
- Add progress criteria per stage.
- Add quick assessment templates for instructor lesson mode.
- Add bulk progress updates.
- Add badge rules:
  - manual
  - progress-triggered recommendation
  - admin/instructor approval
- Add parent-friendly achievement card copy.
- Add history and evidence timeline.
- Add notification events for progress and badges.

### Acceptance

- Instructor can update progress quickly during or after lesson.
- Parent sees understandable progress, not raw admin data.
- Badge recommendation has reasons.
- Stage transition proposal uses progress evidence.

### Not In This Phase

- Automatic stage movement.
- Diploma readiness automation.

## Phase S8 - Flow-Through Engine

### Goal

Move learners through stages and groups while protecting capacity and billing separation.

### Current Base

Stage transition proposals exist and can update enrollment stage.

### Build

- Add flow-through recommendation:
  - current stage complete
  - next stage
  - possible target groups
  - capacity result
  - preferred day/time fit
  - instructor/resource constraints
  - old spot release date
- Add approval workflow:
  - approve transition only
  - approve transition plus new group
  - postpone
  - reject
- Add group membership end/start date actions.
- Add capacity hold for target group.
- Add old capacity release trigger.
- Trigger waitlist rematch after old spot release.
- Add parent notification.
- Guard billing separation:
  - no subscription change unless explicit billing action.

### Acceptance

- Admin can approve learner movement from one stage/group to another.
- Old spot becomes available at the right time.
- Waitlist rematch is triggered.
- Billing remains unchanged unless admin changes billing.
- Parent and instructor see the change.

### Not In This Phase

- Fully automatic learner movement.

## Phase S9 - Diploma Readiness And Afzwem Radar

### Goal

Make afzwem readiness visible, explainable, and actionable.

### Current Base

Afzwem events, participants, readiness criteria records, result registration, notifications, and certificate records exist.

### Build

- Add readiness radar:
  - progress criteria
  - required modules
  - attendance threshold
  - instructor approval
  - badges or milestones
  - minimum period or session count
  - missing criteria
- Add readiness statuses:
  - not ready
  - almost ready
  - ready for review
  - invited
  - completed
- Add admin review action.
- Add afzwem event candidate suggestions.
- Add invitation reminders.
- Add result registration guardrails.
- Add diploma creation flow.

### Acceptance

- Admin can see who is almost ready and why.
- Admin can invite ready learners to an afzwem event.
- Result creates or updates certificate record.
- Parent receives notification.

### Not In This Phase

- Fully automatic diploma issuing without result registration.

## Phase S10 - Certificate And Diploma Vault Completion

### Goal

Make certificates and diplomas trustworthy and parent-ready.

### Current Base

Certificate and document records exist. Parent vault pages and share/download preparation exist.

### Build

- Add certificate file generation or upload policy.
- Add signed download URLs.
- Add parent share links.
- Add versioning.
- Add retention policy.
- Add download/share audit.
- Add revoked certificate handling.
- Add visual diploma template later, if approved.

### Acceptance

- Parent can download a diploma securely.
- Every access is audited.
- Admin can see certificate version and status.
- Share links can be revoked.

### Not In This Phase

- Public verification registry unless explicitly approved.

## Phase S11 - Smart Admin Dashboard And Reporting

### Goal

Give tenant admins one operational command center.

### Current Base

Admin dashboards, reports, export jobs, filters, and report permissions exist.

### Build

- Add smart dashboard cards:
  - new intakes needing review
  - duplicate risks
  - groups with available spots
  - groups over capacity or blocked
  - best placement opportunities
  - slot offers expiring soon
  - failed messages
  - overdue payments
  - makeup backlog
  - stage transitions awaiting approval
  - afzwem-ready learners
- Add drilldowns to exact workflow pages.
- Add trend charts:
  - intake funnel
  - waitlist age
  - occupancy
  - attendance
  - progress readiness
  - revenue/payment status
- Add export options behind dropdowns.
- Add report audit events.

### Acceptance

- Admin can see what requires action today.
- Every smart signal links to a workflow.
- Reports are query-backed and filterable.
- Exports remain permission-gated and audited.

### Not In This Phase

- Predictive AI forecasts.

## Phase S12 - Advanced Automation

### Goal

Allow tenants to safely increase automation after semi-automatic workflows are proven.

### Current Base

Manual and semi-automatic workflows exist. Automation settings need consolidation.

### Build

- Add automation settings per engine:
  - disabled
  - recommend only
  - recommend and prepare
  - execute with approval
  - execute automatically
- Add automation safety limits:
  - max auto offers per day
  - no auto placement below confidence threshold
  - no auto placement when duplicate risk exists
  - no auto flow-through without available target group
  - no auto diploma without registered result
- Add automation logs and rollback support where possible.
- Add tenant-level feature flags.

### Acceptance

- A tenant can opt into stronger automation per engine.
- Every automatic action is logged.
- Safety limits prevent risky execution.

### Implementation Notes

Phase S12 adds:

- `automation_level` on `tenant_smart_engine_settings`.
- `safety_limits` and `feature_flags` per smart engine.
- `tenant_feature_flags` for tenant-level kill switches and rollout state.
- `automation_execution_logs` for prepared, approval-required, executed, blocked, failed, rollback and rollback-unavailable states.
- `/admin/automatisering` for tenant admins to manage automation settings safely.

The first production-safe default remains `recommend_and_prepare`. `execute_automatically` is guarded by feature flags and safety checks and does not introduce AI-generated decisions.

### Not In This Phase

- AI-generated decisions.

## Phase S13 - AI Assistant Layer

### Goal

Add AI as an assistant after the rules-based system is stable.

### Build

- Intake summary assistant.
- Admin explanation assistant.
- Parent message draft assistant.
- Progress note rewrite assistant.
- Report insight assistant.
- Risk signal summary assistant.

### Rules

- AI suggestions must be labelled as suggestions.
- AI cannot be the only source of truth.
- AI output must be editable.
- Sensitive data handling must be reviewed before activation.

### Acceptance

- AI improves speed and clarity without taking over decisions.
- Admin remains accountable for final decisions.

## 4. First Recommended Sprint

Start with Phase S0 and Phase S1 together as one focused sprint:

Sprint name: Smart Intake And Decision Foundation

Scope:

- Decision shape and rule version policy.
- Intake config versioning.
- Stage recommendation rules for Zwemdiploma A.
- Recommendation reasons and confidence.
- Duplicate detection for intake review.
- Admin override with reason.
- Audit event for recommendation and override.

Why first:

- It uses the current intake foundation.
- It creates the smart-decision pattern needed by placement, flow-through, and readiness.
- It gives the product owner a visible smart upgrade quickly.
- It avoids premature fully automatic placement.

Acceptance:

- A new intake produces a recommended stage.
- Admin sees why.
- Admin can override.
- The decision is auditable.
- The same decision shape can be reused by placement.

## 5. Implementation Guardrails

- Keep the Lovable visual direction.
- Keep public and parent language swim-first.
- Keep internal models sector-flexible.
- Keep subscription/payment separate from stage and group.
- Do not introduce fully automatic behavior before the semi-automatic workflow is proven.
- Every smart recommendation must be explainable.
- Every important mutation must be audited.
- Every parent-impacting decision must have a communication path.
- RLS and role isolation must be tested before staging acceptance.
