# Phase 8 - Instructor Shell

Last updated: 2026-07-07

Status: implemented in code and migrations. Live staging migration, assigned instructor test data, RLS/advisor checks and tablet workflow validation are still pending.

## Goal

Let instructors run the swim hall workflow on a tablet: see today's assigned sessions, open a group roster, register attendance, inspect student details, write progress notes, separate internal from parent-visible notes and award simple badges.

## Implemented

- Instructor dashboard at `/instructor`.
- Assigned sessions agenda at `/instructor/agenda`.
- Assigned group list at `/instructor/groepen`.
- Assigned student list at `/instructor/leerlingen`.
- Group roster and attendance route at `/instructor/group/[id]`.
- Student detail route at `/instructor/student/[id]`.
- Attendance registration:
  - present
  - absent
  - late
  - excused
  - trial
- Session completion action.
- Progress notes with visibility:
  - `internal`
  - `parent_visible`
- Badge action foundation through participant badge awards.
- Instructor domain loader scoped to assigned groups and sessions, with tenant staff override.
- Server actions validate assigned group/session access before writes.
- Phase 8 schema:
  - `session_attendance`
  - `progress_notes`
  - `badge_definitions`
  - `participant_badge_awards`
- RLS helper functions:
  - `app_private.current_user_can_instruct_participant`
  - `app_private.current_user_can_record_session_for_participant`
- Explicit grants and RLS policies for all new public tables.

## Canon Alignment

- Instructors see only assigned groups/sessions unless they also have tenant staff/admin roles.
- Attendance is tied to session, participant and enrollment.
- Internal notes and parent-visible notes are separated at schema and policy level.
- Badge awards are a foundation, not a full badge catalogue or achievement system.
- Tablet-first workflow favors large roster rows and direct actions.

## Explicit Non-Goals

- No full assessment rubric.
- No attendance analytics.
- No instructor messaging.
- No document center.
- No badge catalogue management UI.
- No automatic parent notifications for notes/badges yet.

## Verification

Local verification expected before merging:

```txt
pnpm typecheck
pnpm auth:audit
pnpm db:audit
pnpm build
pnpm db:migrate
```

Staging verification required before marking Phase 8 fully complete:

- Apply Phase 3 through Phase 8 migrations to staging.
- Create an instructor tenant user.
- Assign the instructor to one group and one direct session.
- Confirm `/instructor`, `/instructor/agenda`, `/instructor/groepen`, `/instructor/leerlingen`, `/instructor/group/[id]` and `/instructor/student/[id]` load only assigned data.
- Register attendance for present, absent, late and excused.
- Complete a session.
- Add one internal progress note and one parent-visible progress note.
- Award a badge.
- Confirm unrelated instructors cannot see or write to unassigned rosters.
- Run Supabase advisors/security checks and RLS tests for tenant admin, assigned instructor, unassigned instructor and linked parent.
