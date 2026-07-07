# NXTTRACK Technical Architecture

Last updated: 2026-06-23

Status: technical planning draft. No production features are implemented by this document.

## 1. Tech Stack

Final platform target:

- Next.js App Router.
- TypeScript.
- React.
- Tailwind CSS v4.
- Lovable-derived design tokens and components.
- shadcn/Radix primitives only where useful.
- Framer Motion for Lovable-equivalent motion.
- lucide-react icons.
- Recharts for dashboard charts.
- Supabase Auth.
- Supabase Postgres.
- Supabase Storage.
- Supabase RLS.
- pnpm.
- VPS deployment through GitHub self-hosted runner.
- Caddy reverse proxy.
- systemd services.
- SendGrid SMTP first for email.
- Manual payments first.
- Mollie/iDEAL later.

Lovable source repo stack:

- TanStack Router / TanStack Start / Vite.
- Tailwind CSS v4.
- Framer Motion.
- lucide-react.
- Recharts.
- Radix.
- `@lovable.dev/vite-tanstack-config`.

Decision: Lovable is the UI and interaction source of truth, not the final runtime architecture. Final implementation uses Next.js.

## 2. Repository Structure

Final repository:

- `nxttrack/platform`

Reference only:

- `nxtdev` and earlier prototypes.
- `nxttrack/swim-school-pro` for Lovable UI.

Target structure after app scaffold approval:

```txt
.github/workflows/
  deploy.yml
apps/
  web/
    app/
      (marketing)/
      (tenant-public)/
      (portaal)/
      (instructor)/
      (tenant-admin)/
      (platform-admin)/
      api/
      auth/
    components/
      lovable/
      marketing/
      shell/
      ui/
      portaal/
      instructor/
      admin/
      platform/
    lib/
      auth/
      domain/
      supabase/
      tenants/
      terminology/
      intake/
      placement/
      notifications/
      payments/
      storage/
      validation/
      mock-data/
    styles/
    public/
supabase/
  migrations/
  seed/
  policies/
scripts/
  db/
  deploy/
docs/
```

Rules:

- Do not scaffold product features until approval.
- Keep mock/demo data isolated and typed.
- Do not import old reference code by bulk copy.
- Move Lovable UI screen-by-screen after audit and screenshot baselines.

## 3. App Router Structure

Production routing should be host-aware.

Target route groups:

```txt
app/
  (marketing)/
    page.tsx
    nxttrack/...
  (tenant-public)/
    page.tsx
    agenda/...
    intake/...
    login/...
    nieuws/...
    programmas/...
  (portaal)/
    portaal/...
  (instructor)/
    instructor/...
  (tenant-admin)/
    admin/...
  (platform-admin)/
    platform/...
  api/
  auth/
```

Host resolution:

- `www.nxttrack.nl` -> NXTTRACK marketing.
- `nxttrack.nl` -> NXTTRACK marketing or redirect to `www.nxttrack.nl`.
- `admin.nxttrack.nl` -> platform admin backoffice.
- `<slug>.nxttrack.nl` -> tenant public website and tenant role shells.
- `<slug>.nxttrack.nl/portaal` -> logged-in athletes/parents, parent-mediated in MVP.
- `<slug>.nxttrack.nl/instructor` -> logged-in instructors.
- `<slug>.nxttrack.nl/admin` -> tenant admin backoffice.
- `staging.nxttrack.nl` -> staging environment only.
- Custom domains -> tenant lookup after domain verification.

Local development can keep `/t/[slug]` as a fallback if useful.

## 4. Shell Structure

Required shells:

- `MarketingShell` for NXTTRACK marketing.
- `PublicTenantShell` for tenant public website.
- `PortaalShell` for guardian/family and parent-mediated athlete portal.
- `ChildPortalSurface` inside parent shell for MVP.
- `InstructorShell` for tablet-first lesson work.
- `TenantAdminShell` for tenant operations.
- `PlatformAdminShell` for global platform operations.

Lovable shell sources:

- Public tenant shell: `src/routes/_public.tsx`.
- Shared app shell: `src/components/shell/AppShell.tsx`.
- Parent shell reference: Lovable `src/routes/parent.tsx`; production route is `/portaal`.
- Instructor shell: `src/routes/instructor.tsx`.
- Tenant admin shell: `src/routes/admin.tsx`.
- Root shell: `src/routes/__root.tsx`.

Rules:

- Share visual primitives, not access-control logic.
- Keep platform admin and tenant admin separate.
- Parent shell is mobile-friendly.
- Instructor shell is tablet-first.
- Tenant admin is desktop-first but responsive.

## 5. Component Architecture

Initial Lovable-derived component groups:

Marketing primitives:

- `PageHero`.
- `PageSection`.
- `FeatureGrid`.
- `CheckList`.
- `Photo`.
- `HeroVisual`.
- `FloatCard`.
- `FinalCTA`.

Shell primitives:

- `AppShell`.
- `PageHeader`.
- `Card`.
- `StatusPill`.
- `ProgressRing`.
- `WaitlistDot`.

Production component policy:

- Port design primitives first.
- Keep components data-agnostic.
- Build domain adapters around typed props.
- Do not bake mock arrays into production components.
- Keep visible terminology tenant-driven.

## 6. Design System Strategy

Lovable design is the frontend source of truth.

Observed tokens and patterns:

- Fonts: Inter and Plus Jakarta Sans.
- Very light aqua/slate background.
- Deep blue/slate foreground.
- Primary blue.
- Aqua accent.
- Navy accent.
- Semantic success/warning/danger.
- Base radius around 1rem with 2xl/3xl card usage.
- Soft/card/glow shadows.
- Large rounded shells and dashboard cards.
- Framer Motion entrance/active states.
- Responsive grids at `md` and `lg` breakpoints.
- Mobile drawers and hidden desktop-only elements.

Observed explicit colors:

```txt
#1D4ED8 - strong blue
#B6FF2E - lime accent
#0F172A - dark CTA background
```

Policy:

- shadcn/Radix provides primitives, not the visual direction.
- Do not replace Lovable with default starter UI.
- Tenant branding overrides must sit on top of the NXTTRACK base language.
- Any visual simplification requires documented technical reason and approval.

## 7. Supabase Schema Direction

Core schema groups:

Platform and tenancy:

- `tenants`.
- `tenant_domains`.
- `sector_templates`.
- `tenant_settings`.
- `tenant_theme_overrides`.

Users and roles:

- `profiles`.
- `tenant_memberships`.
- `roles`.
- `role_permissions`.
- `tenant_member_roles`.
- `guardians`.
- `participants`.
- `guardian_participants`.

Programs and planning:

- `programs`.
- `program_stages`.
- `resources`.
- `groups`.
- `group_stages`.
- `sessions`.
- `session_resources`.
- `session_instructors`.

Enrollment:

- `enrollments`.
- `group_memberships`.

Intake and placement:

- `intake_forms`.
- `intake_form_fields`.
- `intake_submissions`.
- `submission_answers`.
- `waitlist_entries`.
- `placement_suggestions`.
- `slot_offers`.

Progress and achievements:

- `progress_modules`.
- `progress_items`.
- `progress_scores`.
- `scoring_labels`.
- `badges`.
- `badge_awards`.
- `milestone_events`.
- `milestone_event_invites`.
- `certificates`.

Attendance and catch-up:

- `attendance`.
- `attendance_notes`.
- `makeup_credits`.
- `makeup_requests`.

Billing:

- `payment_plans`.
- `subscriptions`.
- `payments`.
- `payment_events`.
- `payment_methods`.

Communication and files:

- `notifications`.
- `notification_events`.
- `messages`.
- `conversations`.
- `tasks`.
- `documents`.
- `audit_logs`.

Use `tenant_id` on every tenant-scoped table. Prefer composite tenant-safe references where practical.

## 8. RLS / Tenant Isolation Strategy

Baseline:

- Enable RLS on all private tenant-scoped tables.
- Every tenant-scoped row includes `tenant_id`.
- Tenant admins access only their tenant.
- Platform admins use a separate global policy path.
- Parents access child data through guardian links.
- Instructors access assigned sessions/groups/participants.
- Anonymous users access only public tenant content and controlled intake inserts.

Required helper policies/functions:

- `is_platform_admin()`.
- `has_tenant_access(tenant_id)`.
- `has_tenant_permission(tenant_id, permission)`.
- `is_guardian_for_participant(participant_id)`.
- `is_instructor_for_session(session_id)`.

Rules:

- UI hiding is not authorization.
- Server actions must assert access.
- Service-role operations must explicitly filter tenant scope.
- Private notes and documents require separate visibility fields.

## 9. Auth And Role Strategy

Use Supabase Auth for identity.

Role model:

- Platform admin.
- Tenant owner.
- Tenant admin.
- Tenant staff.
- Instructor.
- Guardian/parent.
- Participant/child.

Login routing:

- Platform admin -> platform admin.
- Tenant admin/staff -> tenant admin.
- Instructor -> instructor shell.
- Guardian -> `/portaal` shell.
- Multi-tenant user -> tenant switcher or last active tenant.

Session strategy:

- Resolve active tenant from host and/or membership.
- Store active tenant preference only as a convenience.
- Always verify access on server.

## 10. Data Model Overview

Canonical relationship:

```txt
Tenant
  -> Programs
      -> Stages
      -> Groups
          -> Sessions
          -> Group memberships
      -> Resources
      -> Allowed payment plans

Participant
  -> Enrollment in Program
  -> Current Stage in Program
  -> Group Membership in Group
  -> Subscription / Payment Plan
  -> Progress Scores
  -> Badge Awards
  -> Certificates
```

Critical separation:

- Program/stage/group/session/resource describe learning and operations.
- Subscription/payment plan describes billing.
- Stage movement does not imply subscription change.
- Subscription change does not imply stage movement.

## 11. Event / Automation Strategy

Use domain events for:

- Intake submitted.
- Submission waitlisted.
- Placement suggested.
- Slot offered.
- Slot accepted/declined/expired.
- Participant placed.
- Session created/changed/cancelled.
- Attendance recorded.
- Progress score recorded.
- Badge awarded.
- Stage changed.
- Capacity available.
- Afzwem invite sent.
- Result registered.
- Certificate issued.
- Payment due/paid/overdue.

Events feed:

- Notifications.
- Email.
- Audit logs.
- Future automation.

Rules:

- Use idempotency keys for notification generation.
- Keep user-visible actions auditable.
- Avoid hidden irreversible automation in MVP.

## 12. File / Storage Strategy

Use Supabase Storage for:

- Tenant logos.
- Marketing images.
- Program images.
- News media.
- Documents/manuals.
- Badge share cards.
- Diploma PDFs/images.
- Certificate templates later.

Rules:

- Public buckets only for public assets.
- Private buckets for documents, diplomas, and sensitive files.
- Paths include tenant scope.
- Storage policies enforce tenant and role access.
- Validate file type and size.
- Diplomas are private by default.

## 13. Payment Integration Strategy

MVP:

- Manual payment status.
- Payment plans and subscriptions in schema.
- Admin can manage status.
- Parent can view relevant payment state.
- No Mollie activation until approved.

Mollie/iDEAL fast-follow:

- Provider abstraction.
- Checkout session model.
- Webhook endpoint.
- Webhook signature/secret verification.
- Payment events.
- Subscription lifecycle support if needed.

Rule: payment provider keys are server-only. Billing status must not be confused with stage progress.

## 14. Notification / Email Strategy

Email provider:

- SendGrid.
- SMTP first.

SMTP environment variables when implemented:

```txt
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<sendgrid api key>
SMTP_FROM_EMAIL=<verified sender>
SMTP_FROM_NAME=NXTTRACK
```

Notifications:

- In-app first-class records.
- Email generated from domain events.
- Push later.

Template keys:

- Intake submitted.
- Waitlist confirmation.
- Slot offered.
- Slot accepted/declined.
- Placement confirmed.
- Lesson reminder.
- Cancellation/catch-up.
- Progress update.
- Badge awarded.
- Afzwem invite.
- Diploma issued.
- Payment due/overdue.

## 15. Deployment Architecture

Current `nxttrack/platform` has `.github/workflows/deploy.yml`.

Workflow target:

- Branch `staging` -> staging GitHub Environment.
- Branch `production` -> production GitHub Environment.
- Self-hosted runner labels: `[self-hosted, linux, x64, nxttrack]`.
- Release dirs: `/var/www/nxttrack/{staging|production}/releases`.
- Shared env: `/var/www/nxttrack/{staging|production}/shared/.env`.
- Active symlink: `/var/www/nxttrack/{staging|production}/current`.
- Build with pnpm.
- Run `pnpm run db:migrate`.
- Restart systemd service from `SERVICE_NAME`.
- Reload Caddy.

Important current gap:

- App scaffold does not exist yet.
- `pnpm build` and `pnpm run db:migrate` are target commands, not currently proven.

## 16. Environment / Secrets Strategy

GitHub Environments:

- `staging` first.
- `production` later and protected.

Variables expected by workflow:

```txt
APP_ENV
NODE_ENV
PORT
APP_URL
NEXT_PUBLIC_APP_URL
PLATFORM_ADMIN_URL
TENANT_DOMAIN_SUFFIX
PLATFORM_HOSTNAMES
PLATFORM_MARKETING_HOSTNAMES
PLATFORM_ADMIN_HOSTNAMES
STAGING_HOSTNAMES
TENANT_BASE_DOMAINS
RESERVED_TENANT_SUBDOMAINS
BASE_PATH
SERVICE_NAME
```

Secrets expected by workflow:

```txt
DATABASE_URL
SESSION_SECRET
JWT_SECRET
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Future secrets:

```txt
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_FROM_EMAIL
SMTP_FROM_NAME
MOLLIE_API_KEY
MOLLIE_WEBHOOK_SECRET
MOLLIE_PROFILE_ID
```

Rules:

- Never commit `.env`.
- Do not log secrets.
- Only `NEXT_PUBLIC_*` can be client-exposed.
- Keep service role server-only.
- Keep staging and production secrets separate.

## 17. Staging / Production Plan

First target:

- Staging only.

Recommended staging domains to confirm:

```txt
https://staging.nxttrack.nl
```

Production later:

```txt
https://www.nxttrack.nl
https://admin.nxttrack.nl
https://<slug>.nxttrack.nl
```

Staging readiness comes before any production launch planning.

## 18. Testing Strategy

Required layers:

- Typecheck.
- Lint.
- Unit tests for domain helpers.
- RLS/policy tests.
- Server action tests where practical.
- Playwright smoke tests.
- Visual screenshot comparison against Lovable routes.
- Staging deploy smoke checks.

Critical flows to cover:

- Public home.
- Program marketplace.
- Intake submit.
- Waitlist/slot offer.
- Parent Mijn lessen.
- Instructor agenda -> group -> student assessment.
- Tenant admin dashboard/planning.
- Diploma vault.
- Role routing.

## 19. Migration Strategy

Target:

- Ordered migrations in `supabase/migrations`.
- Migration command wired to `pnpm run db:migrate`.
- Staging runs migrations during deploy.
- Failed migration stops deploy before activation.
- Seeds are separate from migrations.
- Demo seed is allowed only for staging/dev.
- Production seed is minimal and explicit.

Decision still needed:

- Supabase CLI vs direct SQL runner vs migration library.

Do not create schema until this decision is approved.

## 20. Risks And Open Questions

| Area | Risk/question | Recommended handling |
| --- | --- | --- |
| Runtime | Lovable uses TanStack/Vite, final app uses Next.js | Treat Lovable as design source, not runtime source |
| Repo | Multiple historical sources exist | Build only in `nxttrack/platform` |
| Deploy | Existing workflow assumes scripts that do not exist yet | Do not deploy until app scaffold defines scripts |
| Staging domains | Exact DNS/Caddy setup must be confirmed | Lock domains before app scaffold deploy test |
| Supabase | Staging project not identified in repo docs yet | Confirm before migrations |
| RLS | Tenant leaks are high-risk | Design policies before feature depth |
| Payments | Manual first, Mollie later | Keep clean provider boundary |
| Email | SendGrid SMTP first | Add env vars only when code consumes them |
| UI | Visual drift from Lovable | Screenshot baseline before porting |
| Migration | Bad migration can block deploy | Choose runner before schema work |

## 21. Technical Conflict Resolution

| Conflict | Decision |
| --- | --- |
| Lovable TanStack/Vite vs final Next.js | Next.js final, Lovable UI preserved |
| PM2/Nginx/SSH style deploy vs Caddy/systemd/runner | Caddy/systemd/self-hosted runner wins |
| Swim-specific UI vs generic core | Tenant terminology maps generic models to swim labels |
| Trial route vs intake type | Trial is intake option |
| Program/stage vs payment plan | Keep learning/operations separate from billing |
| Tenant admin vs platform admin | Reuse visuals only; separate routes, guards, and data |
