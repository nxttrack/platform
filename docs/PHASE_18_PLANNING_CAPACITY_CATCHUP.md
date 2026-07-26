# Phase 18 - Planning, Capacity And Catch-Up Depth

Status: implemented in code and ready for staging validation.

Phase 18 upgrades the operational planning backbone from CRUD lists to a daily planning cockpit.

## Delivered

- Admin planboard on `/admin/agenda` with:
  - day and 14-day week view
  - session occupancy summaries
  - resource conflict warnings
  - instructor overlap warnings
  - instructor availability warnings
  - over-capacity warnings
- Instructor availability data model and admin input.
- Catch-up request data model.
- Parent catch-up selection flow on `/portaal/lessen`.
- Admin catch-up approval/decline flow on `/admin/agenda`.
- Approved catch-up participants appear in instructor session rosters.
- Capacity calculations include:
  - active/trial group memberships
  - requested and approved catch-up holds
  - session capacity overrides
  - group capacity fallback

## Data Model

- `instructor_availability`
  - tenant-scoped availability/unavailability windows
  - weekday and time range based
  - instructor self-management allowed by RLS, tenant staff management allowed
- `catch_up_requests`
  - links a `catch_up_credit` to a preferred/assigned session
  - one open request per credit
  - statuses: `requested`, `approved`, `declined`, `cancelled`, `used`
- `tenant_settings`
  - `catch_up_requires_admin_approval`
  - `catch_up_booking_window_days`

## Operational Notes

- Drag-and-drop remains intentionally out of scope for this phase.
- Conflicts are computed at read time so they cannot drift from source schedules.
- Approval checks capacity again before reserving the credit.
- Parent auto-approval is supported when `catch_up_requires_admin_approval = false`.

## Staging Validation

Validate on staging after deployment:

- Create overlapping sessions on the same resource and confirm admin conflict.
- Assign one instructor to overlapping sessions and confirm conflict.
- Add instructor availability and confirm unavailable sessions are flagged.
- Cancel a parent lesson on time and confirm a catch-up credit is created.
- Request a catch-up option from `/portaal/lessen`.
- Approve the catch-up request from `/admin/agenda`.
- Confirm the participant appears in the instructor session roster.
- Confirm capacity warnings count requested/approved catch-up holds.
