# Phase 7 - Parent/Athlete Portal

Last updated: 2026-07-07

Status: implemented in code and migrations. Live staging migration, RLS/advisor checks, tenant test data, and end-to-end parent validation are still pending.

## Goal

Give parents a usable self-service portal for parent-mediated athlete access: dashboard, children, current placement, lessons, cancellation policy, catch-up credits and profile basics.

## Implemented

- Parent portal dashboard at `/portaal`.
- Children/athletes overview at `/portaal/kinderen`.
- Lessons overview at `/portaal/lessen`.
- Lesson detail route at `/portaal/lessen/[id]`.
- Profile basics at `/portaal/profiel`.
- Basic current-route view at `/portaal/voortgang`.
- Parent-mediated access table:
  - `participant_guardians`
- Lesson cancellation table:
  - `lesson_cancellations`
- Catch-up credit table:
  - `catch_up_credits`
- Tenant cancellation policy settings:
  - cutoff hours
  - credit window days
  - whether timely cancellations grant credits
- Profile phone field for parent self-service.
- RLS update for `current_user_can_view_participant` to include explicit guardian links.
- Admin/manual participant creation now backfills `participant_guardians`.
- Slot offer acceptance links participants to a known active tenant parent/athlete user when the offer e-mail matches an existing user.
- Parent lesson cancellation server action:
  - validates participant access
  - validates active group membership
  - applies cancellation cutoff policy
  - creates catch-up credit for timely cancellations
  - prevents duplicate cancellation for the same session and participant

## Canon Alignment

- MVP child access remains parent-mediated.
- Parents see only participants explicitly linked to their tenant user.
- Current program, stage/badje and group are visible without exposing instructor-only assessment details.
- Lesson cancellation is self-service but policy-bound.
- Catch-up credits are basic operational credits, not full scheduling automation.

## Explicit Non-Goals

- No child-owned login.
- No attendance, assessment, badges or diploma vault.
- No automatic catch-up booking into another session.
- No payment/subscription view.
- No parent messaging or document center.
- No tenant admin UI for editing cancellation policy yet.

## Verification

Local verification expected before merging:

```txt
pnpm typecheck
pnpm auth:audit
pnpm db:audit
pnpm build
pnpm db:migrate
```

Staging verification required before marking Phase 7 fully complete:

- Apply Phase 3 through Phase 7 migrations to staging.
- Create a tenant parent user with role `parent`.
- Link at least one participant through `participant_guardians` or `guardian_user_id`.
- Confirm `/portaal`, `/portaal/kinderen`, `/portaal/lessen`, `/portaal/lessen/[id]`, `/portaal/voortgang` and `/portaal/profiel` load only for the linked parent.
- Cancel a future lesson before the cutoff and confirm one catch-up credit is created.
- Cancel a lesson inside the cutoff and confirm no credit is created.
- Confirm duplicate cancellations are blocked.
- Run Supabase advisors/security checks and RLS tests for tenant admin, instructor, linked parent and unrelated parent.
