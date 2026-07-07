# Phase 4 - Core Domain Model

Last updated: 2026-07-07

Status: implemented in code and migrations. Live staging migration/RLS validation still depends on the staging Supabase run from Phase 3/4.

## Goal

Make the operational swim-school backbone real without building intake, waitlist automation, progress scoring, payments, or messaging yet.

## Implemented

- Tenant-scoped domain migration for:
  - `programs`
  - `program_stages`
  - `resources`
  - `groups`
  - `sessions`
  - `group_instructor_assignments`
  - `session_instructor_assignments`
  - `participants`
  - `enrollments`
  - `group_memberships`
- Capacity basics:
  - group capacity
  - resource capacity
  - session capacity override
  - membership capacity weight
  - server-side capacity check before group placement
- RLS/grants for all Phase 4 tables.
- Admin dashboard backed by real tenant domain counts.
- Tenant admin pages:
  - `/admin/programma`
  - `/admin/resources`
  - `/admin/groepen`
  - `/admin/agenda`
  - `/admin/leerlingen`
- Server actions for creating programs, stages, resources, groups, sessions, instructor assignments, participants, enrollments, and group memberships.

## Canon Alignment

- Program/stage/group/session/resource are learning and operations concepts.
- Stage/badje is not a subscription or billing plan.
- Participants are tenant-scoped and can be parent-mediated through `guardian_user_id`.
- Instructors are assigned to groups/sessions through tenant-scoped assignment records.
- Capacity starts with explicit operational limits; waitlist and placement automation come later.

## Explicit Non-Goals

- No intake or waitlist flow.
- No automated placement assistant.
- No attendance, progress scoring, notes, badges, afzwem, diplomas, or payments.
- No recurring-session generator yet.
- No edit/delete UI beyond create/list basics.

## Verification

Local verification expected before merging:

```txt
pnpm typecheck
pnpm auth:audit
pnpm db:audit
pnpm build
pnpm db:migrate
```

Staging verification required before marking Phase 4 fully complete:

- Apply Phase 3 and Phase 4 migrations to staging.
- Re-run Supabase advisors/security checks.
- Verify RLS with platform owner, tenant admin, instructor, and parent users.
- Create a sample program, badje/stage, resource, group, session, instructor assignment, participant, enrollment, and group membership on staging.
