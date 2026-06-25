# NXTTRACK Smart Flow Canon

Reviewed on: 2026-06-25

Status: definitive planning canon for the smart, modern, interactive NXTTRACK flow layer. This document extends the main product canon. It does not replace `docs/NXTTRACK_CANON.md`.

## 1. Purpose

NXTTRACK must become more than a digital administration system. The platform should actively connect registration, learner level, group planning, instructor capacity, lesson attendance, progress, flow-through, afzwem readiness, diploma records, messages, tasks, payments, and reports.

The showpiece of the platform is the Smart Flow Engine:

> The right learner, at the right level, in the right group, at the right moment, with the right instructor, inside the right capacity.

The Smart Flow Engine is not one hidden algorithm. It is a set of explainable engines, workflows, dashboards, decisions, and audit trails that help swim schools make better daily decisions without losing control.

## 2. Source Material

This canon is based on:

- The attached document `NXTTRACK - Canon & Faseplan voor de Slimme Functies`.
- The current `nxttrack/platform` codebase on `staging`.
- The existing NXTTRACK canon, architecture plan, roadmap, and Swim Start enterprise gap analysis.
- The current Supabase migrations, App Router pages, server actions, shell structure, and staging deployment flow.

## 3. Non-Negotiable Domain Rules

These rules are locked for the smart layer:

- Program is the offered product or learning track.
- Stage is the learner's current level inside a program.
- Group is a recurring class with a fixed schedule, resource, instructor, and capacity.
- Session is one concrete lesson date and time.
- Resource is a pool, lane, field, room, location, or other scarce planning asset.
- Instructor is the person teaching a group or session.
- Enrollment means a learner follows a program.
- Group membership means a learner is placed in a specific group.
- Subscription or payment plan is the billing contract and must stay separate from stage and group.
- Progress is development inside modules, stages, or program outcomes.
- Badge is a positive achievement or milestone.
- Certificate or diploma is the official result.

The most important separation:

```txt
Stage movement is learning movement.
Group movement is planning movement.
Subscription movement is billing movement.
```

A child moving from Badje 1 to Badje 2 usually keeps the same subscription. Billing changes only when the paid product, frequency, contract, or payment plan changes.

## 4. Automation Policy

NXTTRACK originally described three high-level automation modes:

- Manual: the system shows data and an admin decides.
- Semi-automatic: the system recommends, scores, explains, and prepares actions; an admin approves.
- Automatic: the system executes configured actions within tenant-approved rules.

Phase S12 refines these into the operational automation ladder used in the product:

1. `disabled`: the engine is visible but does not automate.
2. `recommend_only`: the engine only produces insight and explanation.
3. `recommend_and_prepare`: the engine may prepare a draft action, but never execute.
4. `execute_with_approval`: the system prepares execution and requires explicit admin approval.
5. `execute_automatically`: the system may execute only when tenant feature flags and safety gates pass.

The default product posture remains `recommend_and_prepare`.

Fully automatic placement, flow-through, slot offers, and diploma actions may only be enabled when:

- Tenant settings explicitly allow them.
- Rules are explainable.
- Decisions are logged.
- Admin override is possible.
- Parent-facing communication is clear.
- RLS and role isolation are verified.
- Safety limits pass:
  - max automatic slot offers per day;
  - no automatic placement below the confidence/score threshold;
  - no automatic placement when duplicate risk exists;
  - no automatic flow-through without an available target group;
  - no automatic diploma action without a registered result.
- Tenant-level feature flags allow the relevant engine.
- Every automatic or blocked action is stored in `automation_execution_logs`.

## 5. AI Policy

AI is an assistant layer, not a decision-maker.

Allowed:

- Intake summaries.
- Admin explanations for existing rules-based recommendations.
- Parent message draft suggestions.
- Parent-friendly progress note rewrites.
- Report insight summaries.
- Risk or attention signal summaries.

Required guardrails:

- AI suggestions must be labelled as suggestions.
- AI cannot be the only source of truth.
- AI output must be editable.
- Sensitive data handling must be reviewed before activation.
- Admins remain accountable for the final decision.
- Every generated, blocked or failed suggestion is auditable.

The platform uses:

- `tenant_ai_assistant_settings` for per-tenant capability settings, model, prompt version, context level and sensitive-data review status.
- `ai_assistant_suggestions` for AI draft output, provider errors, blocked attempts, prompt snapshots, source-of-truth pointers, editable text and human decision.

Not allowed:

- Fully automatic placement without admin approval.
- AI-only stage assignment.
- AI-only afzwem readiness.
- AI-only diploma issuing.
- AI-only scoring or ranking.
- Decisions that cannot be audited, edited or overridden.

## 6. Smart Engine Map

The smart layer is composed of the following engines.

| Engine | Purpose | Current codebase status | Enterprise target |
| --- | --- | --- | --- |
| Intake Engine | Capture registration, trial, waitlist, preferences, consent, and custom program answers. | Public intake creates `intake_submissions`, stores intake type, participant/guardian data, preferred days and time windows, answers, and events. | Versioned configurable forms, conditional questions, duplicate detection, consent, spam protection, confirmation messages, and admin triage. |
| Stage Recommendation Engine | Recommend a starting stage from intake answers, age, experience, and tenant rules. | Mostly manual. Admin can select or store a recommended stage when converting intake to waitlist. | Rule-based scoring with explainable reasons, confidence level, override, versioned rules, and audit. |
| Capacity Engine | Understand open spots by group, resource, instructor, stage, trial spots, makeup spots, and reserved capacity. | Placement checks active group memberships against group capacity; sessions check resource and instructor conflicts. | Capacity ledger, reservations, waitlist holds, trial/makeup capacity, conflict snapshots, overbooking policy, and release triggers. |
| Waitlist Engine | Rank and manage candidates waiting for a suitable spot. | Waitlist entries exist with statuses, preferred days/time windows, recommended stage, and placement actions. | Scored queues, fairness rules, priority reasons, stale-entry detection, family/sibling flags, and automatic rematch suggestions. |
| Placement Engine | Match waitlist candidates to suitable groups. | Admin creates suggestions for a selected group; score uses simple preferred-day, stage, and capacity signals. | Ranked candidate/group matching, explainable blockers, score weights, batch suggestions, admin compare view, and audit trail. |
| Slot Offer Engine | Send a time-limited offer to parent and process accept/decline. | Slot offers exist with token, status, expiry, public accept/decline, and message queue hooks. | Reminder schedule, expiry release, admin resend/cancel, parent UX polish, delivery tracking, and offer analytics. |
| Lesson Engine | Turn group planning into concrete sessions and daily lesson operations. | Admin can generate sessions from recurring groups; conflicts are checked; instructor attendance exists. | Reliable recurrence rules, cancellation/reschedule, makeup capacity, lesson mode, parent-visible changes, and calendar feeds. |
| Progress Engine | Track learning development per program, stage, module, and lesson context. | Module progress, progress updates, notes, stage proposals, parent progress pages, and instructor actions exist. | Rubrics, stage/module definitions, evidence history, bulk assessment, approval gates, and reporting. |
| Badge Engine | Award positive milestones and show achievement cards. | Badge definitions, badge awards, achievement cards, and parent notifications exist. | Badge rules, templates, parent/child cards, sharing/download preparation, and achievement timeline. |
| Flow-Through Engine | Move learners to next stage/group while releasing old capacity. | Stage transition proposals can be approved and can update enrollment stage. | Transfer planning, new group reservation, old spot release, waitlist rematch, parent notification, and billing separation enforcement. |
| Diploma Readiness Engine | Detect learners who are close to official milestone readiness. | Afzwem readiness criteria tables and pages exist, but readiness is mostly manual. | Readiness radar using progress, attendance, instructor approval, and program criteria with explainable status. |
| Milestone Event Engine | Plan afzwem moments and invite ready learners. | Afzwem events, participants, invitation/result actions, and notifications exist. | Capacity-aware event planning, invitation workflow, reminders, result states, and waitlist for milestone events. |
| Certificate Engine | Generate and store official certificates/diplomas. | Certificate/diploma records and parent vault pages exist; download/share preparation exists. | File generation, signed downloads, share links, versioning, retention, and audit per access. |
| Notification Engine | Send parent/admin/instructor updates through internal messages and email. | Message templates, outbox, SMTP/SendGrid-ready adapter, event hooks, retry dashboard, and template previews exist. | Complete event map, delivery SLAs, preferences, tenant sender governance, retries, and audit. |
| Task Engine | Create admin tasks from operational events. | Task records and pages exist. | Event-driven task creation, ownership, due dates, severity, snooze/resolve, and smart dashboard integration. |
| Reporting Engine | Show operational health and explain the effect of smart decisions. | Query-backed dashboards, filters, export jobs, permissions, and audit foundations exist. | Live smart dashboards, bottleneck/risk signals, funnel reporting, forecast views, and enterprise exports. |

## 7. Current Codebase Assessment

The current platform is no longer a pure skeleton. It already contains a broad Swim Start foundation.

Already present:

- Multi-tenant route structure and role shells for public, admin, parent, instructor, and platform admin.
- Tenant domain and slug resolution.
- Supabase migrations for identity, domain models, intake, waitlist, placement, slot offers, parent portal, instructor portal, progress, badges, afzwem, certificates, manual payments, messages, tasks, documents, reports, imports, platform admin, and observability.
- Public tenant pages for homepage, programs, program detail, intake, news, agenda, and slot offers.
- Tenant admin pages for intake, waitlist, placement suggestions, slot offers, programs, stages, groups, sessions, resources, learners, guardians, instructors, messages, documents, payments, reports, imports, settings, news, templates, newsletters, and mail settings.
- Parent portal pages for dashboard, lessons, profile, notifications, documents, progress, diplomas, badges, and payments.
- Instructor portal pages for agenda, groups, rosters, attendance, student assessment, notes, compliments, progress, messages, tasks, and documents.
- Manual payment flow with invoice/payment records, corrections, refunds, reminders, and finance export preparation.
- Communication foundation with SMTP first and SendGrid-ready adapter.
- Document vault foundation with records, visibility, upload/download preparation, versioning and retention concepts.
- E2E and QA foundations including Playwright, visual QA, release notes, and observability documentation.

The foundation is valuable, but the smart system is not yet enterprise-grade. Many smart flows are still page-level workflows instead of a cohesive, explainable engine layer.

## 8. Main Enterprise Gaps

### 8.1 Smart Decisions Are Not Yet First-Class Records

Current smart decisions are partly stored as placement suggestions, stage transition proposals, events, message logs, and audit logs. The system needs a more consistent smart-decision pattern:

- Input snapshot.
- Rule version.
- Score.
- Reasons.
- Blockers.
- Recommendation.
- Human decision.
- Override reason.
- Resulting actions.
- Audit event.

This should apply to stage recommendations, waitlist ranking, placement suggestions, flow-through, afzwem readiness, and eventually AI suggestions.

### 8.2 Intake Needs More Intelligence

Current intake stores answers and preferences. It should become the start of the smart flow:

- Dynamic question versioning.
- Program-specific stage signals.
- Duplicate detection before and after submit.
- Consent and legal capture.
- Suggested starting stage.
- Suggested intake route: trial, registration, waitlist.
- Admin review queue with confidence and reasons.

### 8.3 Capacity Is Still Too Simple

Current placement capacity mainly counts active group memberships. Enterprise capacity must understand:

- Fixed capacity.
- Reserved capacity.
- Trial capacity.
- Makeup capacity.
- Temporary holds from slot offers.
- Resource and instructor conflicts.
- Group lifecycle.
- Session-level changes.
- Future capacity after flow-through.

### 8.4 Placement Is Semi-Smart But Not Yet a Showpiece

Current placement works as a useful admin action. The showpiece needs:

- Ranking candidates for a group.
- Ranking groups for a candidate.
- Reasons and blockers per match.
- Fairness and priority rules.
- Admin compare view.
- Batch suggestions.
- Slot-offer readiness checks.
- Automatic rematch when a spot becomes available.

### 8.5 Flow-Through Is Not Complete

Stage transition approval can update enrollment stage, but smart flow-through requires:

- Proposed next stage.
- Candidate target groups.
- Capacity hold in target group.
- End date for old group membership.
- Start date for new group membership.
- Old spot release.
- Waitlist rematch trigger.
- Parent notification.
- No automatic billing change unless billing plan changes.

### 8.6 Diploma Readiness Is Too Manual

The afzwem and certificate surfaces exist. The next level is a readiness radar:

- Completed progress criteria.
- Attendance threshold.
- Instructor approval.
- Required badges or modules.
- Minimum period or session count.
- Readiness score.
- Missing items.
- Invitation recommendation.

### 8.7 Parent And Instructor UX Must Feel Active

The portals should not be data mirrors. They should guide the next action:

- Parent sees what is next, what changed, and what requires action.
- Instructor sees today's lesson, attention points, progress prompts, and quick actions.
- Admin sees bottlenecks, expiring offers, full groups, available spots, waiting candidates, overdue payments, failed messages, and readiness signals.

### 8.8 Automation Needs Tenant Settings

Every smart engine needs tenant-specific configuration:

- Manual, semi-automatic, or automatic mode.
- Rule weights.
- Offer expiry.
- Capacity hold duration.
- Priority policies.
- Makeup eligibility.
- Flow-through approval policy.
- Afzwem readiness criteria.
- Message templates.

Defaults should be Swim Start-ready, but editable later.

## 9. Smart Flow MVP Definition

The first showpiece version should prove the full intake-to-placement loop:

1. Parent selects Zwemdiploma A.
2. Parent completes dynamic intake.
3. System stores preferences and intake answers.
4. System recommends a stage with explanation.
5. System places candidate in smart waitlist queue.
6. Admin opens Placement Assistant.
7. System suggests best group options and explains fit.
8. Admin approves a slot offer.
9. Parent accepts or declines the offer.
10. On accept, enrollment and group membership are created.
11. Parent sees lessons.
12. Instructor sees learner in roster.
13. Attendance and progress can be recorded.
14. Badge or progress notification reaches parent.

The extended showpiece adds:

15. Cancellation creates makeup eligibility.
16. Parent can request or choose suitable makeup moment.
17. Progress triggers stage transition proposal.
18. Approved flow-through releases old spot.
19. Waitlist rematch is triggered.
20. Afzwem readiness radar identifies candidates.
21. Afzwem event invitation is sent.
22. Result creates a digital diploma record.

## 10. Enterprise Definition Of Done

For a smart engine to be enterprise-worthy, it must have:

- A documented rule contract.
- Tenant-configurable settings or locked defaults.
- Input validation.
- Explainable output.
- Manual override with reason.
- Audit log.
- RLS-safe data access.
- Empty, pending, success, error, and conflict states.
- Mobile and desktop UX.
- E2E or integration test coverage for the critical path.
- Clear separation between stage, group, and subscription.
- Communication hooks where parents or admins need to know.

## 11. Implementation Principle

Do not replace the current foundation. Consolidate it into a coherent smart layer.

The next work should focus on:

- Turning existing workflows into reusable engine contracts.
- Adding explainable recommendations.
- Adding decision snapshots and audit.
- Improving admin, parent, and instructor UX around next-best-actions.
- Keeping automation semi-automatic until confidence is earned.

## 12. Phase S0 Architecture Decision

Phase S0 introduces a generic smart decision layer instead of extending every module table with a different scoring shape.

The platform uses:

- `tenant_smart_engine_settings` for per-tenant engine mode, rule version, weights, thresholds, expiry settings, hold settings, notification settings, and metadata.
- `smart_decisions` for explainable recommendations and human decisions.

The first engines wired to this shape are:

- `intake_recommendation`
- `placement`

This gives every later smart engine the same contract:

```txt
input snapshot -> rule version -> score/confidence -> reasons/blockers -> recommendation -> human decision -> result -> audit
```

The default automation mode remains `semi_automatic`.

Rule versioning is documented in `docs/SMART_FLOW_RULE_VERSIONING.md`.

## 13. Phase S1 Intake Decision Policy

Phase S1 turns intake into the first real smart flow entrypoint.

The platform now supports:

- Intake config versioning through `intake_form_configs.config_version`.
- Rich question types: text, textarea, single select, multi select, yes/no, number, date, free text, consent, and swim-experience scale.
- Conditional question rules for public intake.
- Program-level `stage_recommendation_rules`.
- Recommendation snapshots on `intake_submissions`.
- Duplicate snapshots on `intake_submissions`.
- Open duplicate matches in `intake_duplicate_matches`.
- Admin override when moving intake to waitlist.

The recommendation remains semi-automatic:

```txt
intake answers -> rule evaluation -> recommended stage -> admin review -> waitlist stage selection
```

If the admin chooses a different stage than the smart recommendation, an override reason is required. This keeps stage recommendation explainable without forcing automatic placement.

Duplicate detection currently checks:

- same child name plus birthdate
- same guardian email
- similar child name
- active enrollment on a matched participant

Duplicate detection is advisory. It warns the admin before conversion to waitlist or enrollment. It does not automatically block the parent submission.

## 14. Phase S2 Capacity Engine Policy

Phase S2 makes capacity an explainable engine instead of a page-level count.

Capacity is calculated from:

- fixed group capacity
- optional resource capacity
- active group memberships
- future group membership starts
- ending memberships within the next planning window
- active capacity holds
- pending slot offers without a hold, for legacy safety
- reserved spots
- trial spots
- makeup spots
- group overbooking policy

The canonical S2 capacity shape stores and exposes:

```txt
fixed spots
active memberships
future starts
ending memberships
pending slot offers
held spots
reserved spots
trial spots
makeup spots
open spots
blocked or overbooked spots
overbooking policy
reasons
blockers
```

Slot offers now reserve capacity through `capacity_holds`.

The lifecycle is:

```txt
placement suggestion approved
-> slot offer created or resent
-> capacity hold created
-> pending offer reduces available capacity
-> parent accepts, declines, offer expires or admin cancels
-> hold is converted, released, expired or cancelled
```

Existing active group memberships remain the source of truth for real placement. They are not double-counted with pending slot offers. A slot offer hold is temporary capacity protection, not a group membership.

Overbooking is explicit:

- `blocked`: no placement or slot offer when capacity is full.
- `warn`: admin can continue, but UI and smart decision show warning blockers.
- `allow`: admin can continue, but audit and explanation still show that overbooking policy was used.

Admin-facing UI must show why a group is available or blocked. Parent-facing UI only receives clear human wording and never sees internal scoring details.

Not included in S2:

- automatic waitlist rematch
- makeup slot marketplace
- fully automatic placement

## 15. Phase S3 Smart Waitlist Policy

Phase S3 turns the waitlist into an explainable ranked queue.

The waitlist score uses:

- priority date
- stage match
- preferred day match
- preferred time match
- sibling or family signal
- trial, registration, waitlist, or manual source
- admin priority flag
- urgency or tenant-specific reason
- duplicate risk

The score is stored directly on `waitlist_entries` for fast admin filtering and sorting. The full decision shape is stored in `smart_decisions` with engine key `waitlist`.

The canonical S3 waitlist shape stores:

```txt
waitlist score
score reasons
score snapshot
smart decision id
admin priority
priority reason
urgency reason
tenant reason code
family signal
last contact timestamp/channel
duplicate risk
reevaluation requested timestamp
evaluated timestamp
```

Admin override is allowed, but a non-normal priority requires a reason. The override is visible in the waitlist event timeline and the smart decision lifecycle.

Waitlist timeline events include:

- created
- scored
- priority updated
- contacted
- reevaluation requested
- placement suggested
- placement rejected
- slot offered
- placed
- cancelled

When group capacity, group status, group stage, schedule, reserved spots, trial spots, makeup spots, or overbooking policy changes, matching waitlist candidates are marked for reevaluation. This does not automatically send offers. It creates an admin-visible signal and timeline event only.

The Placement Assistant must use the stored waitlist score as one input. It may still reject or block a placement based on capacity, group mismatch, duplicate blockers, or admin review.

Parent-facing messaging remains human and clear:

```txt
The swim school reviews the queue based on preferences, level, capacity, and fairness.
```

Parents do not see internal scoring, weights, or duplicate-risk logic.

Not included in S3:

- automatic offer sending
- AI ranking
- automatic waitlist rematch

## 16. Phase S4 Placement Assistant 2.0 Policy

Phase S4 makes placement the main smart admin showpiece.

The Placement Assistant supports two matching modes:

- best groups for one learner
- best learners for one group

The match score uses:

- program match
- stage match
- preferred day fit
- preferred time fit
- capacity availability
- resource availability
- instructor availability
- waitlist priority
- start date fit
- blockers

The canonical S4 placement suggestion shape stores:

```txt
assistant mode
suggested action
match score
match reasons
match blockers
match snapshot
start date
batch id
reviewed by
override reason
assistant metadata
smart decision id
```

The allowed suggested actions are:

- offer slot
- request more info
- keep waiting
- manual review

Only `offer slot` suggestions can be approved into a slot offer. Other suggestions remain admin workflow signals until the admin creates a better match or rejects/overrides with a reason.

The assistant must explain its result in Dutch. Admin-facing UI shows score, reasons, blockers, capacity status, waitlist priority and suggested next action. Parent-facing messaging never exposes internal scoring.

Batch suggestion creation is allowed for selected candidate/group pairs. Batch creation does not place a learner, does not create a group membership, and does not change billing. It only creates placement suggestions.

Audit trail is explicit:

- placement suggestion created
- batch created
- approved
- rejected
- overridden
- offer sent
- request more info
- keep waiting
- manual review

Approval flow remains:

```txt
placement suggestion
-> admin approve
-> slot offer
-> capacity hold
-> parent accept/decline
-> enrollment and group membership only after accept
```

Billing remains separate:

```txt
Placement Assistant changes placement workflow only.
It must never change subscriptions, invoices, payment plans or billing state.
```

Not included in S4:

- fully automatic placement
- direct payment integration
- automatic parent messaging for unapproved suggestions
