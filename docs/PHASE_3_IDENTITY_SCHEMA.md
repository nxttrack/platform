# Phase 3 - Identity Schema

Last updated: 2026-06-24

Status: migration prepared in repo, not applied to staging.

## Goal

Create the first trusted identity boundary for NXTTRACK: users, tenants, tenant domains, tenant memberships, platform memberships, and tenant settings.

## Included Tables

- `profiles`: one row per Supabase Auth user.
- `tenants`: organization/customer workspace.
- `tenant_domains`: tenant subdomain or custom-domain ownership records.
- `tenant_settings`: locale, timezone and terminology sector.
- `tenant_memberships`: tenant-scoped user roles.
- `platform_memberships`: global platform roles.

## Security Model

- Authorization data lives in database rows, not editable user metadata.
- Every public table has RLS enabled.
- Tables exposed to Supabase Data API include explicit grants.
- `anon` receives no grants in this migration.
- `authenticated` receives only read access needed for scoped identity queries plus limited profile self-update.
- `service_role` receives explicit table grants for future trusted server-side admin flows.
- RLS policies use `TO authenticated` with user, tenant or platform predicates.
- CI runs `pnpm run db:audit` to statically check public table RLS, explicit grants, policy clauses and forbidden authorization patterns.

## Helper Functions

The migration creates helper functions in `app_private`, a non-exposed schema:

- `current_user_has_platform_role`
- `current_user_has_tenant_role`
- `current_user_can_view_profile`

These helpers are `security definer` because RLS policies need stable membership checks without recursive policy evaluation. They are kept out of `public`, use an explicit `search_path`, and only evaluate the current `auth.uid()`.

## Explicit Non-Goals

- No live Supabase connection.
- No migration runner activation by default.
- No seed data.
- No login/signup UI.
- No route redirects.
- No programs, groups, sessions, resources, billing, intake or waitlist schema.
- No custom-domain verification automation.

## Open Before Applying To Staging

- Confirm Supabase staging project reference and database URL.
- Confirm when staging should set `RUN_DB_MIGRATIONS=true`.
- Run Supabase advisors against the staging project before merge-to-deploy.
- Decide initial platform owner bootstrap process.
- Decide whether parent-mediated child access is MVP default.
