# Phase 12 - Admin Operations

Status: implemented in code and migration, pending staging database verification.

## Scope

Phase 12 completes the daily tenant backoffice surface for the staging MVP:

- Admin dashboard with real KPI aggregation across core domain, intake, waitlist, slot offers, progress, graduation and billing.
- Tenant messages with audience, visibility and publish status.
- Tenant tasks with assignee, related participant, priority, deadline and status updates.
- Tenant documents metadata register with internal or portal visibility.
- Basic reports and report snapshots.
- Role-based RLS for staff, instructors and parent-visible portal content.
- Notification hooks for published messages, assigned tasks, published documents and report snapshots.

## Routes

- `/admin` shows operational KPIs, urgent tasks, capacity and recent events.
- `/admin/berichten` manages internal and portal-visible tenant messages.
- `/admin/taken` manages daily tasks and assignee updates.
- `/admin/documenten` manages document metadata and portal visibility.
- `/admin/rapportages` shows basic reports and stores snapshots.
- `/portaal` now shows latest parent notifications.
- `/instructor` now shows latest instructor notifications.

## Database

Migration:

- `supabase/migrations/20260707195442_phase_12_admin_operations.sql`

New tables:

- `tenant_messages`
- `tenant_tasks`
- `tenant_documents`
- `tenant_report_snapshots`

Updated:

- `tenant_notifications.type` now also allows `admin_message`, `task_assigned`, `document_published` and `report_ready`.

## Remaining Verification

The code-level implementation can be typechecked and built locally. Full completion still requires:

- Applying the migration to staging.
- Running Supabase RLS/advisor checks against staging.
- Testing role visibility with tenant admin, instructor and parent accounts.
- Confirming notification delivery in real staging data.
