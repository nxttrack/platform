# Phase 10 - Afzwemmen And Diploma Vault

Last updated: 2026-07-07

Status: implemented in code and migrations. Live staging migration, RLS/advisor checks and end-to-end afzwem validation are still pending.

## Goal

Support the swim-school diploma moment so the core journey can run from intake to placement, lessons, progress, afzwemmen and diploma vault.

## Implemented

- Phase 10 schema:
  - `graduation_readiness`
  - `graduation_events`
  - `graduation_event_participants`
  - `certificate_records`
- Notification type extension for:
  - `graduation_invite`
  - `certificate_issued`
- Tenant admin route at `/admin/afzwemmen`.
- Admin can mark afzwem readiness per active enrollment and current stage.
- Admin can plan afzwem events with program, stage, resource, capacity and time window.
- Admin can invite ready participants to an afzwem event.
- Parent in-app notifications are created for afzwem invites.
- Parent route at `/portaal/diplomas`.
- Parents can confirm or decline afzwem invites.
- Admin can register results:
  - passed
  - failed
  - deferred
- Passing result issues or updates a certificate record.
- Parent in-app notifications are created when a certificate is issued.
- Private diploma vault shows issued certificate records only for linked parent-mediated children.
- RLS policies for readiness, events, event participants and certificate records.

## Canon Alignment

- UI is swim-first: afzwemmen, badje, diploma vault.
- Core schema stays broadly reusable: readiness, graduation events, event participants and certificate records.
- Parent-mediated access remains the MVP model.
- Diploma records are private by default and only visible to tenant staff, assigned instructors and linked parents.
- Tenant staff own event planning and certificate issuance.

## Explicit Non-Goals

- No PDF certificate generation yet.
- No Supabase Storage bucket or signed file downloads yet.
- No automated readiness calculation from progress scores yet.
- No public afzwem calendar.
- No payment/billing lock around diploma release.
- No e-mail delivery for invites/certificates yet; notifications are in-app rows.
- No formal diploma template designer yet.

## Verification

Local verification expected before merging:

```txt
pnpm typecheck
pnpm auth:audit
pnpm db:audit
pnpm build
pnpm db:migrate
```

Staging verification required before marking Phase 10 fully complete:

- Apply Phase 3 through Phase 10 migrations to staging.
- Run Supabase advisors/security checks.
- As tenant admin, mark one participant nearly ready and one participant ready.
- Create one afzwem event with capacity.
- Invite a ready participant.
- As linked parent, confirm the invite from `/portaal/diplomas`.
- As unrelated parent, confirm the invite and certificate records are not visible.
- As tenant admin, register a passed result and issue a certificate.
- As linked parent, confirm the certificate appears in the private diploma vault.
- Register failed/deferred results and confirm no certificate is issued.
- Confirm assigned instructor visibility is participant-scoped.
- Confirm unassigned instructor cannot see unrelated readiness/certificate records.
