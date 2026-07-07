# Phase 5 - Public Tenant Site And Intake

Last updated: 2026-07-07

Status: implemented in code and migrations. Live staging migration, tenant DNS validation, and RLS/advisor checks are still pending.

## Goal

Let new parents enter through a real tenant website on `<slug>.nxttrack.nl`, view active programs, and submit an intake request.

## Implemented

- Tenant public homepage on tenant subdomains.
- Program overview at `/programmas` backed by active tenant programs, stages and capacity.
- Dynamic intake page at `/intake`.
- Intake options:
  - enrollment
  - trial
  - waitlist
  - information request
- Intake schema:
  - `intake_forms`
  - `intake_questions`
  - `intake_submissions`
  - `intake_answers`
  - `tenant_events`
- Server action for public intake submission.
- Basic `intake.received` event creation.
- Admin intake inbox at `/admin/intake`.

## Canon Alignment

- Trial lesson, registration, waitlist and information request are one intake entrypoint.
- Intake captures parent-mediated participant details.
- Intake is program-aware but does not place a child automatically.
- Waitlist and placement automation remain later scope.

## Explicit Non-Goals

- No waitlist scoring.
- No placement assistant.
- No automatic account invite for parents.
- No recurring session generator.
- No payment/subscription changes.
- No outbound email notification beyond the stored event.

## Verification

Local verification expected before merging:

```txt
pnpm typecheck
pnpm auth:audit
pnpm db:audit
pnpm build
pnpm db:migrate
```

Staging verification required before marking Phase 5 fully complete:

- Apply Phase 3, Phase 4 and Phase 5 migrations to staging.
- Confirm `<slug>.nxttrack.nl` routes to tenant public pages.
- Create or use an active tenant with active programs.
- Submit all four intake options.
- Confirm `/admin/intake` shows the submissions and `intake.received` events.
- Run Supabase advisors/security checks and RLS tests.
