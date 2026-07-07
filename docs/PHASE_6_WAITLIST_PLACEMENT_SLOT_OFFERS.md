# Phase 6 - Waitlist, Placement Assistant And Slot Offers

Last updated: 2026-07-07

Status: implemented in code and migrations. Live staging migration, tenant DNS validation, e-mail provider validation, and RLS/advisor checks are still pending.

## Goal

Convert intake into placement: waitlist entries, preference-aware group scoring, admin placement decisions, and a parent-facing slot offer accept/decline flow.

## Implemented

- Waitlist schema:
  - `waitlist_entries`
  - `waitlist_preferences`
  - `placement_recommendations`
  - `placement_scores`
  - `slot_offers`
  - `placement_audit_events`
- Explicit grants and RLS policies for tenant staff on all Phase 6 tables.
- Intake-to-waitlist action from `/admin/wachtlijst`.
- Stage recommendation based on the first active program stage.
- Placement scoring based on:
  - active groups in the same program
  - remaining group capacity
  - recommended stage match
  - preferred weekday match
- Admin placement panel at `/admin/wachtlijst`.
- Slot offer creation with signed token link.
- Transactional e-mail handoff through the configured mail adapter.
- Public offer page at `/plaatsing-aanbod`.
- Accept flow that creates:
  - participant
  - enrollment
  - group membership
  - accepted slot offer state
  - placed waitlist state
  - audit event
- Decline, expired, invalid and already-responded states.
- Audit trail for waitlist creation, recommendation, scoring, offer creation, offer send, accept, decline and expiry.

## Canon Alignment

- Parent-mediated intake remains the entrypoint.
- Placement is tenant-scoped and staff-controlled.
- Slot offers are tokenized links, not open public row access.
- Acceptance converts the operational intent into the core domain model.
- Capacity is checked again during acceptance to avoid overbooking after an offer was sent.

## Explicit Non-Goals

- No automatic parent account invite after accepted placement.
- No payment or subscription collection.
- No recurring lesson schedule generation.
- No instructor workload optimization.
- No multi-offer conflict resolution beyond capacity recheck.
- No e-mail template CMS.

## Verification

Local verification expected before merging:

```txt
pnpm typecheck
pnpm auth:audit
pnpm db:audit
pnpm build
pnpm db:migrate
```

Staging verification required before marking Phase 6 fully complete:

- Apply Phase 3, Phase 4, Phase 5 and Phase 6 migrations to staging.
- Confirm `<slug>.nxttrack.nl/admin/wachtlijst` loads for tenant admins only.
- Convert a real intake submission to a waitlist entry.
- Score the waitlist entry and confirm group ranking uses capacity and preferences.
- Create a slot offer and confirm the outbound e-mail or fallback link.
- Open `/plaatsing-aanbod?token=...` without a logged-in session.
- Accept an offer and confirm participant, enrollment and group membership are created.
- Decline an offer and confirm waitlist and audit states.
- Run Supabase advisors/security checks and RLS tests for platform owner, tenant admin, instructor and parent.
