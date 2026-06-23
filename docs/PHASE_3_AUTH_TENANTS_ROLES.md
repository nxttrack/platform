# Phase 3 - Auth, Tenants, Roles and Terminology

Last updated: 2026-06-24

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
- Identity-boundary migration prepared for profiles, tenants, tenant domains, tenant settings, tenant memberships, platform memberships, explicit grants and RLS policies.
- Proxy adds internal tenant-routing request headers based on configured platform hostnames, tenant base domains and reserved subdomains.
- Private route guard contracts added as pure decision logic. They can classify public routes, tenant shell access, platform shell access and default shell destinations without redirects or database calls.
- CI now audits private shell route contracts so shell prefixes, route folders and `noindex` metadata stay aligned.

## Explicit Non-Goals

- No login or signup UI.
- No protected route redirects.
- No Supabase project connection.
- No migration applied to a live database.
- No tenant resolution from hostname.
- No SendGrid or SMTP sending.
- No Mollie or payment integration.

## Auth Strategy

NXTTRACK will use Supabase Auth with SSR cookies. The frontend must use the publishable Supabase key. Secret keys and database URLs are server-only.

The proxy currently refreshes sessions when Supabase is configured, but it does not block or redirect users yet. Route protection starts after tenant resolution and role mapping are approved.

Private route shells are centrally mapped to their intended role sets. The guard contract can evaluate access decisions from trusted platform and tenant membership context, but it is not wired into redirects or runtime enforcement yet. The current contract is a foundation for later server-side guards and RLS tests.

Guard denial reasons are explicit:

- `tenant_context_required`
- `tenant_membership_required`
- `platform_membership_required`
- `role_not_allowed`

This keeps UI routing decisions separate from security. Real authorization must still be enforced by server-side checks and Supabase RLS based on trusted database membership records.

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

Tenant routing config is environment-driven:

- `PLATFORM_HOSTNAMES`
- `TENANT_BASE_DOMAINS`
- `RESERVED_TENANT_SUBDOMAINS`

The proxy may attach internal `x-nxttrack-*` request headers for later server-side tenant lookup. These headers are not an authorization boundary.

## Supabase Schema Direction

The first migration covers only the identity boundary:

- `tenants`
- `profiles`
- `tenant_memberships`
- `tenant_domains`
- `tenant_settings`
- `platform_memberships`

The identity migration includes explicit Data API grants and RLS. New Supabase defaults in 2026 require grants to be deliberate; RLS does not replace grants.

## Open Decisions Before Real Auth

- Staging Supabase project reference and URL.
- Publishable key and server secret strategy in GitHub environments.
- Whether platform users can belong to tenants too.
- Whether child/athlete login is separate in MVP or parent-mediated only.
- Hostname/subdomain strategy for tenant resolution on staging.
- Initial invite flow for tenant admins and instructors.
