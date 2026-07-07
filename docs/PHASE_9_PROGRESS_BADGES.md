# Phase 9 - Progress And Badges

Last updated: 2026-07-07

Status: implemented in code and migrations. Live staging migration, RLS/advisor checks and role-based progress/badge validation are still pending.

## Goal

Make progress positively visible so NXTTRACK feels like a swim-school product, not only an administration shell.

## Implemented

- Progress domain schema:
  - `progress_modules`
  - `progress_items`
  - `participant_progress_scores`
  - `tenant_notifications`
- 5-level positive scoring:
  - `Ik ontdek het`
  - `Ik probeer het`
  - `Ik groei erin`
  - `Ik kan het bijna zelf`
  - `Ik kan het zelfstandig`
- Swim progress template with modules for:
  - water confidence
  - movement and technique
  - water safety
  - stamina and independence
- Badge catalog template with initial swim-school badges.
- Instructor action to install the NXTTRACK swim progress and badge template per tenant.
- Instructor student detail scoring per module/item.
- Parent-visible versus internal score visibility.
- Badge awards can now be linked to catalog definitions.
- Parent notifications are created for parent-visible progress scores and badge awards.
- Parent progress view shows:
  - current route
  - progress modules
  - item score labels
  - parent-visible notes
  - badge awards
  - latest progress/badge notifications
- RLS policies for progress modules, items, scores and notifications.

## Canon Alignment

- Core tables stay generic: progress module, progress item, participant score, badge and notification.
- Swim-first meaning lives in the installed template and UI copy.
- Scoring language is positive and growth-oriented.
- Parents only see parent-visible progress and their own linked children.
- Instructors can score only participants they may instruct.
- Tenant staff/admins retain operational override.

## Explicit Non-Goals

- No full assessment rubric editor yet.
- No automated diploma/afzwem readiness logic yet.
- No badge wall route outside `/portaal/voortgang` yet.
- No notification preference center yet.
- No e-mail/push delivery for notifications yet; notifications are in-app rows.
- No analytics or reports on progress trends yet.

## Verification

Local verification expected before merging:

```txt
pnpm typecheck
pnpm auth:audit
pnpm db:audit
pnpm build
pnpm db:migrate
```

Staging verification required before marking Phase 9 fully complete:

- Apply Phase 3 through Phase 9 migrations to staging.
- Install the swim progress template for one tenant.
- Confirm `progress_modules`, `progress_items`, `participant_progress_scores`, `badge_definitions`, `participant_badge_awards` and `tenant_notifications` pass RLS/advisor checks.
- As platform owner, confirm tenant data is visible only through the intended platform/admin paths.
- As tenant admin, confirm progress template/catalog can be viewed and managed.
- As assigned instructor, score a participant and award a badge.
- As unassigned instructor, confirm unrelated participants cannot be viewed or scored.
- As linked parent, confirm only parent-visible scores, badges and notifications appear.
- As unrelated parent, confirm no other participant progress is visible.
- Run Supabase advisors/security checks after migration.
