# Phase 3 - Auth, Tenants, Roles and Terminology

Last updated: 2026-06-23

Status: foundation only, no production auth flow yet.

## Goal

Prepare the platform for Supabase Auth, tenant isolation, role-aware shells, and sector-flexible terminology without building product features prematurely.

## Implemented In This Phase

- Supabase packages added and pinned.
- SSR-safe browser/server client utilities added.
- Next.js v16 `proxy.ts` added for session refresh, using the current `getAll` / `setAll` cookie contract.
- `.env.example` added for Supabase, SMTP/SendGrid, and database secrets.
- Role vocabulary added for platform and tenant roles.
- Sector terminology mapping added so swim labels can be visible without hardcoding swim-only internal model names.
- Supabase folder created with migration guardrails.
- Lockfile generated with pnpm 10.24.0 and verified with a frozen install.
- CI pins Node 20.19.0 and pnpm 10.24.0 before frozen install, typecheck, build, and migration-command verification.
- Private shells have `noindex` metadata while real route guards are not active yet.
- Tenant host resolution is prepared as a pure parsing contract. Database tenant lookup still waits for the first approved Supabase migration.

## Explicit Non-Goals

- No login or signup UI.
- No protected route redirects.
- No Supabase project connection.
- No database migration.
- No RLS policy applied to a live database.
- No tenant resolution from hostname.
- No SendGrid or SMTP sending.
- No Mollie or payment integration.

## Auth Strategy

NXTTRACK will use Supabase Auth with SSR cookies. The frontend must use the publishable Supabase key. Secret keys and database URLs are server-only.

The proxy currently refreshes sessions when Supabase is configured, but it does not block or redirect users yet. Route protection starts after tenant resolution and role mapping are approved.

Private route shells are centrally mapped to their intended role sets. The map is not a security boundary yet; it is a contract for the later guard implementation and RLS tests.

## Role Strategy

Platform roles:

- `platform_owner`
- `platform_admin`
- `platform_support`

Tenant roles:

- `tenant_owner`
- `tenant_admin`
- `tenant_staff`
- `instructor`
- `parent`
- `athlete`

Authorization must not rely on editable user metadata. Tenant membership and role assignment must live in trusted database records and, where needed later, app metadata maintained by server-side code.

## Tenant Strategy

The internal model stays generic:

- Tenant = organization/customer workspace.
- Sector = swim school, football school, sports club, martial arts school, dance school, or generic lesson organization.
- Terminology is a presentation layer.

For swim schools, visible labels can say leerling, ouder, instructeur, badje, lesgroep, les and diploma. Internally the system still uses participant, guardian, instructor, stage, group, session and certificate.

Hostname parsing supports platform hosts, tenant subdomains, and custom domains as separate outcomes. Custom-domain ownership and tenant lookup must be backed by trusted database records in a later migration.

## Supabase Schema Direction

The first migration should cover only the identity boundary:

- `tenants`
- `profiles`
- `tenant_memberships`
- optional `tenant_domains`
- optional `tenant_settings`

The first migration must include explicit Data API grants and RLS. New Supabase defaults in 2026 require grants to be deliberate; RLS does not replace grants.

## Open Decisions Before Real Auth

- Staging Supabase project reference and URL.
- Publishable key and server secret strategy in GitHub environments.
- Whether platform users can belong to tenants too.
- Whether child/athlete login is separate in MVP or parent-mediated only.
- Hostname/subdomain strategy for tenant resolution on staging.
- Initial invite flow for tenant admins and instructors.