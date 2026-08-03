# Learning and capacity intelligence

This document records the operational contract for NXTTRACK's first rule-based
capacity and learning intelligence layer. The implementation is swim-first, but
uses programs, stages, participants, groups, sessions and resources so that the
same boundaries can support other lesson-based sectors later.

## Product boundaries

- Every result is advisory and tenant-scoped.
- No external AI, model, API or secret is used.
- No forecast is a promise to a parent.
- Absence and no-show signals never create an opening or remove a place.
- A child is never automatically placed, rejected, unsubscribed or invited to
  a graduation event.
- Messages remain participant-scoped drafts. This feature has no send state.
- Journey Bot data is excluded by default. It can only be included in
  development or staging, remains labelled, and cannot create live follow-up
  tasks or drafts.
- Names are only shown inside staff-authorized detail views. Aggregated
  bottlenecks require observations for at least five participants.

## Capacity forecast

`forecastCapacity({ tenantId, horizonWeeks, filters })` supports 4, 8 and 12
weeks and returns group, program, stage, weekday, time block, location,
resource, current capacity, occupied capacity, expected openings, expected
bottlenecks, weighted waitlist demand, risk, confidence, reasons and safe links.

Inputs:

- current weighted group membership;
- fixed group and resource capacity;
- dated membership endings;
- historical completed/cancelled memberships over 12 weeks;
- graduation readiness for current group members;
- expected stage transfers;
- waitlist preferences;
- active instructor assignments and availability;
- scheduled resource use.

The forecast weights uncertain signals deliberately:

- dated endings count as stated;
- readiness openings count at 65%;
- historical exits count at 50%;
- possible transfers are distributed across eligible target-stage groups;
- waitlist demand is distributed across every matching group;
- no-show and attendance risk are excluded from openings.

Risk bands are `healthy`, `watch`, `bottleneck` and `critical`. The detailsheet
always displays source evidence, confidence and the operational blockers. The
admin route is `/admin/rapportages/capaciteit`; its planboard link opens the
existing agenda without pretending that an unimplemented simulation mode
exists. Next Best Actions consumes the eight-week forecast.

Canon v3.0 extends this advisory layer with deterministic availability bands,
scenario counts, reviewed expiring soft reservations, versioned daily
snapshots and measured forecast accuracy. The exact formula, cohort and
operational contract is documented in
[SWIM_FLOW_ANALYTICS_AND_FORECASTS.md](SWIM_FLOW_ANALYTICS_AND_FORECASTS.md).

## Attendance and dropout signals

`detectAttendanceRisks(tenantId)` detects:

- repeated absence in 30 days;
- three absences in the last five expected lessons;
- a rising group pattern;
- repeated late cancellations;
- a completed lesson without a check-in;
- a long absence without recorded contact.

Paused memberships are not treated as expected attendance. Every signal
contains evidence, a neutral suggested action and
`do_not_auto_decide = true`. Admins can create a task or a non-sendable contact
draft after reviewing the signal. Journey signals are view-only.

## Progress bottlenecks

`detectProgressBottlenecks({ tenantId, period, programId?, stageId?, groupId? })`
uses append-only assessments and only returns sufficiently large samples. A
score update creates a new `participant_progress_assessments` observation
through a database trigger. When an assessment has no session, its group is
resolved from the active enrollment membership at assessment time.

The output includes skill, scope, affected and total counts, trend, categorical
confidence, reasons, source participant IDs and a positive suggested lesson
focus. Admins can create an instructor task or add the point to the next
session. Instructors see at most three group focus points.

## Diploma readiness

`calculateDiplomaReadiness({ tenantId, participantId, programId })` compares
active required skills, each skill's configurable completion threshold,
repeated assessment stability, recent attendance and a human recommendation.

It returns one of:

- `laag`;
- `in_ontwikkeling`;
- `bijna_klaar`;
- `hoog_vertrouwen`;
- `klaar_voor_admin_review`.

The UI deliberately shows no exact readiness percentage. Low sample volume
reduces confidence. `klaar_voor_admin_review` requires stable evidence and a
human `ready` recommendation. Invited and completed records are terminal for
instructor edits. Adding a child to an event and sending an invitation remain
separate admin actions.

## Personal lesson focus

`generateLessonFocusCards({ tenantId, sessionId })` generates at most three
positive points per participant from current low skills, unstable skills,
neutral attendance context, group bottlenecks and explicitly confirmed manual
focus. Raw progress-note text is not copied into generated cards because those
records do not yet carry reliable content classification.

Cards are stored per session and participant, preserve a human treated state,
include source fingerprints and support approved catch-up participants. The
instructor UI uses touch targets of at least 44 pixels and exposes only compact
lesson context, never a full sensitive dossier.

## Data and authorization

Migration `20260726230000_learning_capacity_intelligence.sql` adds:

- configurable completion fields to `progress_items`;
- append-only `participant_progress_assessments`;
- `lesson_focus_cards`;
- non-sendable `participant_contact_drafts`;
- advisory Next Best Action types.

All new tables are tenant-keyed, have tenant-safe foreign keys, enable and force
RLS, grant authenticated users read-only access through scoped policies, and
reserve mutations for the service role after server-side role and ownership
checks. Journey-derived rows carry `is_test` and `journey_run_id` and cascade
with their source records.

## Verification

The predictive test suite covers calculations, safety boundaries, schema/RLS,
Journey separation, readiness uncertainty and the three-point focus cap.
Database verification must also apply all migrations to a clean Supabase
Postgres instance and prove that both an insert and a score update append an
assessment observation.
