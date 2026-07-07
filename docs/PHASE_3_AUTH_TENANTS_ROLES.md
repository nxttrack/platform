# Phase 3 - Auth, Tenants, Roles and Terminology

Last updated: 2026-07-07

Status: auth, invite, tenant-shell guards, and password reset are implemented in code. Live staging migration, bootstrap, mail delivery, Supabase advisors, and role/RLS validation still need to run against the real staging project.

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
- Private shells have `noindex` metadata and server-side guards wired to trusted Supabase auth context.
- Tenant host resolution is prepared as a pure parsing contract. Database tenant lookup still waits for the first approved Supabase migration.
- Identity-boundary migration prepared for profiles, tenants, tenant domains, tenant settings, tenant memberships, platform memberships, explicit grants and RLS policies.
- Proxy adds internal tenant-routing request headers based on configured platform hostnames, tenant base domains and reserved subdomains.
- Private route guard contracts added as pure decision logic. They can classify public routes, tenant shell access, platform shell access and default shell destinations without redirects or database calls.
- CI now audits private shell route contracts so shell prefixes, route folders and `noindex` metadata stay aligned.
- Trusted auth context contracts added for verified Supabase users, platform memberships, tenant memberships and active tenant selection.
- Identity-boundary mapping added so the first real auth wiring can build context from `profiles`, `tenant_memberships`, `platform_memberships` and tenant settings without trusting client-provided roles.
- CI now audits the web auth boundary for unsafe authorization patterns such as server-side `getSession()`, editable user metadata and public secret env vars.
- Auth-flow migration added for `profiles.email`, `user_security`, `auth_invitations`, `password_reset_challenges`, grants, RLS, and trigger timestamps.
- Login page wired to Supabase Auth with safe `next` redirects.
- NXTTRACK-managed invitation flow added for platform admin and tenant admin shells.
- New users receive a temporary password and must change it on first login.
- Existing users can receive additional tenant/platform access without resetting their password.
- Password reset flow added with a six-digit email code, expiry, attempt limits, confirmation, and strength indicator.
- Platform owner bootstrap script added for `admin@nxttrack.nl`.
- Deploy workflow can run migrations and optional platform-owner bootstrap when explicitly enabled.

## Still Pending On Staging

- Apply migrations to the staging Supabase project.
- Run Supabase advisors/security checks against staging.
- Bootstrap `admin@nxttrack.nl` as first platform owner.
- Confirm SendGrid/SMTP delivery for invites and password reset codes.
- Verify server guards and RLS with platform owner, tenant admin, instructor, and parent users.
- Confirm tenant lookup through `<slug>.nxttrack.nl` on real DNS/proxy traffic.
- No Mollie or payment integration.

## Auth Strategy

NXTTRACK will use Supabase Auth with SSR cookies. The frontend must use the publishable Supabase key. Secret keys and database URLs are server-only.

The proxy refreshes sessions when Supabase is configured and attaches host/tenant routing headers. Server components enforce route protection through trusted auth context and database membership records.

Private route shells are centrally mapped to their intended role sets. Layouts for `/platform`, `/admin`, `/instructor`, and `/portaal` call server-side guards before rendering. Platform admin is allowed only on platform admin, staging, or local platform hosts.

Guard denial reasons are explicit:

- `tenant_context_required`
- `tenant_membership_required`
- `platform_membership_required`
- `role_not_allowed`

This keeps UI routing decisions separate from security. Authorization is enforced by server-side checks and must still be verified against Supabase RLS on staging.

Trusted auth context is now defined as a server-side contract:

- user identity comes from a verified Supabase Auth user;
- display profile comes from `profiles`;
- platform roles come from active `platform_memberships`;
- tenant roles come from active `tenant_memberships` joined to active tenants;
- active tenant is selected by explicit tenant id/slug or only when the user has exactly one tenant;
- authorization must fail closed when membership rows cannot be loaded.

The first runtime use of this context is read-only guard wiring plus invite/reset bookkeeping. Product modules should wait until the staging RLS checks pass.

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

## Locked Decisions For Real Auth

- Staging Supabase project secrets already exist in GitHub Environments.
- The workflow accepts the existing GitHub secret names and maps them to the app runtime:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
  - `DATABASE_URL`
- First platform-owner email: `admin@nxttrack.nl`.
- Platform users may also be tenant members, but every tenant membership remains tenant-scoped.
- Child/athlete access is parent-mediated in MVP.
- Staging host strategy: `staging.nxttrack.nl` is the staging environment host only.
- Tenant host strategy: `<slug>.nxttrack.nl`.
- Platform hosts:
  - `www.nxttrack.nl` for NXTTRACK marketing.
  - `admin.nxttrack.nl` for platform admin backoffice.
- Tenant role shells:
  - `/portaal` for logged-in athletes/parents.
  - `/instructor` for logged-in instructors.
  - `/admin` for tenant admin backoffice.
- Invite flow is owned by NXTTRACK, not Supabase email templates.

## Invite And Password Flow

- Tenant/platform admins create invitations from NXTTRACK.
- NXTTRACK creates or prepares the Supabase Auth user server-side.
- NXTTRACK sends the invite email through the approved SMTP/SendGrid channel.
- The invite email contains a temporary password and a link to the NXTTRACK login page.
- First login must force a password change.
- Password change form must require confirmation, strength validation, and a visible strength indicator.
- Password reset/change-by-email uses a six-digit code sent by email plus a link back to the NXTTRACK form.
- After the six-digit code is verified, the user can set a new password with the same validation rules as registration.
- Supabase Auth remains the identity provider, but NXTTRACK owns the user-facing email content and flow.

## Phase 3 Activation Checklist

To finish Phase 3 on staging:

- Confirm Supabase staging project and GitHub Environment secrets.
- Run the identity-boundary migration against staging after a migration rehearsal/advisor pass.
- Run the auth-flow migration against staging.
- Bootstrap the first `platform_owner` membership for `admin@nxttrack.nl`.
- Verify login, invite, forced-password-change, and six-digit reset flows with real email delivery.
- Verify trusted auth context in server-side private route protection.
- Resolve active tenant from `<slug>.nxttrack.nl` and trusted database memberships.
- Verify RLS with at least one platform user, one tenant admin, one instructor, and one parent test user.
