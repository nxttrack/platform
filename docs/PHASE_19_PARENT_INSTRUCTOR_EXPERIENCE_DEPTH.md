# Phase 19 - Parent And Instructor Experience Depth

Status: implemented in code and ready for staging validation.

Phase 19 makes the parent and instructor shells more complete for daily self-service and lesson delivery.

## Delivered

- Parent communication route on `/portaal/berichten`.
- Parent message center with:
  - published portal messages for parents
  - notifications for progress, badges, documents, payments and graduation
  - mark-as-read action
- Parent dashboard mobile quick actions for lessons, progress and messages.
- Parent documents view with visibility summary and parent-only document framing.
- Parent progress view with achievement summary metrics.
- Instructor communication route on `/instructor/berichten`.
- Instructor task route on `/instructor/taken`.
- Instructor task status actions for open, in progress and done.
- Instructor documents view with internal/team visibility framing.
- Instructor dashboard quick actions for messages and tasks.
- Instructor agenda and home roster counts now include approved catch-up participants.
- Instructor roster detail now has:
  - session attendance counters
  - one-tap present/absent/late registration
  - existing note-based attendance flow preserved

## Security Notes

- No new database tables were required.
- Parent messages are filtered to `status = published`, `visibility = portal`, and audience `parents` or `all_tenant`.
- Instructor messages are filtered to published messages for `instructors` or `all_tenant`.
- Parent document loading still requires portal visibility.
- Instructor document loading can include internal team documents.
- Notification read updates are scoped to the signed-in recipient.
- Instructor task updates are allowed only for tenant operators, assigned users or instructors linked to the related participant.

## Staging Validation

Validate on staging after deployment:

- Publish a parent portal message and confirm it appears on `/portaal/berichten`.
- Publish an instructor message and confirm it appears on `/instructor/berichten`.
- Confirm parent users do not see internal instructor documents.
- Confirm instructors can see internal instructor documents.
- Create an assigned instructor task and confirm status changes from `/instructor/taken`.
- Mark parent and instructor notifications as read.
- Confirm approved catch-up participants count in instructor agenda and roster.
- Register attendance with one-tap buttons on a tablet viewport.
