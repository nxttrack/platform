# Phase 3 - Core Domain Foundation

Last updated: 2026-06-24

Status: completed foundation with limited tenant-admin CRUD. No payment automation, placement automation or hard deletes yet.

## Goal

Create the generic NXTTRACK domain base for swim-first usage without locking the core to swimming-only concepts.

This phase turns the tenant admin skeletons into data-backed pages for the core domain:

- Programs
- Stages
- Groups
- Sessions
- Resources
- Enrollments
- Instructors

## Implemented Domain Tables

The migration `20260624103000_core_domain_foundation.sql` adds:

- `programs`
- `stages`
- `subscription_plans`
- `resources`
- `instructors`
- `groups`
- `sessions`
- `participants`
- `enrollments`
- `group_memberships`
- `progress`
- `badges`
- `certificates`

Every table has a `tenant_id` and RLS enabled. The migration grants `select` to `authenticated` and `all` to `service_role`, then relies on policies to restrict rows by tenant membership.

The migration `20260624113000_core_domain_admin_crud.sql` completes the Phase 3 admin CRUD foundation:

- tenant-consistent composite foreign keys for cross-table relationships;
- authenticated insert/update grants for Phase 3 mutable tables;
- insert/update RLS policies for tenant owner/admin/staff;
- no hard-delete grants for authenticated users.

## Important Domain Decision

Subscription and payment logic is separate from stage progression.

- `stages` represent learning progress, such as Badje 1 or Badje 2.
- `subscription_plans` represent billing, price and lesson frequency.
- `enrollments` connect a participant to both:
  - `current_stage_id`
  - `subscription_plan_id`

A child moving from Badje 1 to Badje 2 normally keeps the same subscription plan. Billing should only change when the selected product, frequency or contract changes.

The DB audit now checks this separation:

- `enrollments` must include both `current_stage_id` and `subscription_plan_id`.
- `stages` must not contain billing/payment/subscription columns.
- `subscription_plans` must not be tied to stage or badge progression.
- Phase 3 mutable tables must have insert/update grants and policies.
- Phase 3 must not grant hard delete to authenticated users.

## RLS Strategy

Catalog/planning tables are tenant-scoped and visible to tenant members:

- programs
- stages
- subscription plans
- resources
- groups
- sessions
- badges

Sensitive operational tables are tenant-scoped and visible only to platform roles plus tenant staff/instructors for now:

- instructors
- participants
- enrollments
- group memberships
- progress
- certificates

Parent/athlete row-level access needs a guardian/participant relationship model in a later phase before it can be safely opened.

Write access is intentionally narrower:

- platform roles can write via policy for support/admin scenarios;
- tenant owners, tenant admins and tenant staff can insert/update Phase 3 operational records;
- instructors, parents and athletes cannot write these admin records in Phase 3;
- hard deletes are not exposed; status fields are used for draft/paused/archived/inactive states.

## Demo Seed

The migration seeds one demo swim-school tenant:

- Tenant: AquaSwim Demo
- Programs: Zwemdiploma A, Zwemdiploma B
- Stages: Badje 1, Badje 2, Badje 3, Afzwem-ready
- Subscription plans: Zwemles 1x per week, Zwemles 2x per week
- Resources: Bad 1 - baan 1, Bad 1 - baan 2
- Instructors: Sophie Jansen, Milan de Vries
- Groups: Zeesterren A1, Dolfijnen A2
- Participants/enrollments: Emma de Vries, Noah Bakker

Swim-specific labels are seed data only; the table names and relationships remain sector-neutral.

## Admin UI

The tenant admin shell now has data-backed limited CRUD views:

- `/admin/programs`
- `/admin/stages`
- `/admin/groups`
- `/admin/sessions`
- `/admin/resources`
- `/admin/enrollments`
- `/admin/instructors`

Compatibility routes still work:

- `/admin/programma` maps to Programs
- `/admin/groepen` maps to Groups
- `/admin/agenda` maps to Sessions
- `/admin/leerlingen` maps to Enrollments

Supported create/update scope:

- Programs
- Stages
- Subscription plans
- Resources
- Instructors
- Groups
- Sessions
- Participants
- Enrollments
- Group memberships

The UI writes through server actions that use the user's Supabase session and normal RLS. The web app does not use the service role key for these mutations.

## Explicit Non-Goals

- No Supabase Edge Functions.
- No payment provider integration.
- No Mollie/iDEAL flow.
- No automatic placement assistant.
- No real attendance or assessment workflow.
- No parent-specific participant RLS until guardian relationships exist.
- No hard-delete UI or hard-delete grants.
- No progress, badge or certificate mutation UI; those belong to later workflow phases.

## Next Step

Phase 3 is complete when the migration has been applied to staging and the tenant admin shell can read/create/update the supported records under RLS. The next implementation work should move into the Phase 4 public tenant site and dynamic intake flow, unless product owner wants extra polishing on Phase 3 form UX first.
