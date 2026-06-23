# Phase 1 - Lovable UI Audit

Last updated: 2026-06-23

## Status

Lovable UI audit has started and repository access is confirmed.

Reference repository: `nxttrack/swim-school-pro`

Access status:

- GitHub connector access: confirmed.
- Local git clone: blocked by local Git credentials prompting for a password. The repo itself is accessible through GitHub API/connector.
- Code search index: not reliable for this private repo, so route inventory uses `src/routeTree.gen.ts` and direct file reads.

No UI has been moved into `nxttrack/platform` yet.

## Audit Rule

Lovable is the visual source of truth.

Do not redesign. Do not flatten into generic defaults. Do not replace the visual language with plain shadcn-style screens. If production constraints require adaptation, document the reason and choose the least disruptive change.

## Lovable Stack Observed

From `package.json`, `vite.config.ts`, root route, styles, and route tree:

```txt
Runtime/prototype: TanStack Router / TanStack Start / Vite
Language: TypeScript / React
Styling: Tailwind CSS v4 plus CSS variables
Animation: Framer Motion
Icons: lucide-react
Charts: Recharts
UI primitives: Radix where needed
Validation/form libs: zod and related helpers present
Lovable config: @lovable.dev/vite-tanstack-config
```

Production direction in `nxttrack/platform` remains Next.js. Lovable code should be treated as design and interaction reference, not as a mandatory runtime architecture.

## Route Inventory

Verified from `src/routeTree.gen.ts`.

### Public Tenant Website

```txt
/
/agenda
/intake
/login
/nieuws
/programmas
```

Purpose:

- Default tenant marketing page.
- Tenant news and agenda.
- Program marketplace.
- Intake/proefles/inschrijving entry.
- Login entry.

### NXTTRACK Marketing

```txt
/nxttrack
/nxttrack/zwemscholen
/nxttrack/wachtrij-planning
/nxttrack/trainer-app
/nxttrack/ouderportaal
/nxttrack/backoffice
/nxttrack/badges-diplomas
/nxttrack/prijzen
/nxttrack/demo
/nxttrack/contact
/nxttrack/login
/nxttrack/privacy
```

Purpose:

- NXTTRACK.nl marketing surface.
- Swim-school-first positioning.
- Module explanations for parent portal, trainer app, waitlist/planning, backoffice, badges/diplomas, pricing, demo, contact, privacy.

### Parent Portal

```txt
/parent
/parent/lessen
/parent/voortgang
/parent/diplomas
/parent/badges
/parent/afzwemmen
/parent/berichten
/parent/documenten
/parent/profiel
```

Purpose:

- Parent dashboard.
- Lessons and catch-up flow.
- Progress overview.
- Diplomas and digital vault.
- Badges and achievements.
- Afzwem readiness/events.
- Messages, documents, profile.

### Instructor Shell

```txt
/instructor
/instructor/agenda
/instructor/groepen
/instructor/leerlingen
/instructor/berichten
/instructor/taken
/instructor/documenten
/instructor/group/$id
/instructor/student/$id
```

Purpose:

- Instructor day view.
- Agenda and groups.
- Student list.
- Active group/session attendance.
- Student assessment with tabs for progress, scoring, notes, badges.
- Messages, tasks, documents.

### Tenant Admin Shell

```txt
/admin
/admin/agenda
/admin/leerlingen
/admin/afzwemmen
/admin/rapportages
/admin/berichten
/admin/taken
/admin/groepen
/admin/documenten
/admin/programma
/admin/intake
/admin/wachtlijst
/admin/instellingen
```

Purpose:

- Tenant operations dashboard.
- Planning board and agenda.
- Participants/students.
- Afzwem module.
- Reports.
- Messages, tasks, groups, documents.
- Programs, intake, waitlist, settings.

### Showcase

```txt
/showcase/reis
```

Purpose:

- End-to-end journey demo/reference flow.

## Shell Inventory

### Root Shell

File: `src/routes/__root.tsx`

Observed behavior:

- Loads Inter and Plus Jakarta Sans.
- Provides TanStack Query client.
- Provides root error and 404 views.
- Includes global stylesheet.
- Sets NXTTRACK demo metadata.

Production mapping:

- Next.js root layout should preserve fonts, metadata direction, global styles, error states, and page shell behavior.

### Public Tenant Shell

File: `src/routes/_public.tsx`

Observed behavior:

- Sticky translucent header.
- Tenant logo in header and footer.
- Desktop nav plus mobile menu toggle.
- Nav items: Home, Nieuws, Agenda, Programma's, Proefles, Inschrijven.
- CTA buttons: Inloggen, Inschrijven.
- Footer includes programs, demo roles, contact.

Production mapping:

- Public tenant routes should keep this header/footer structure, with tenant branding and terminology data-driven.
- `Proefles` and `Inschrijven` currently both point to intake; production should model these as intake options, not separate core flows unless approved.

### Shared AppShell

File: `src/components/shell/AppShell.tsx`

Used by:

- Parent portal.
- Instructor shell.
- Tenant admin shell.

Observed behavior:

- Desktop sidebar width: 260px.
- Mobile drawer with overlay.
- Sticky top bar.
- Brand block with NXTTRACK mark and shell subtitle.
- Active nav indicator with Framer Motion `layoutId`.
- Search box visible from large screens.
- Notification button with badge.
- User avatar initials.
- Accent variants: parent, instructor, admin, public.

Production mapping:

- Keep AppShell behavior and layout as closely as possible.
- Replace hardcoded demo names with authenticated user, tenant, role, and branding data.
- Keep visible swim labels in tenant demo context, but make internal shell logic generic.

## Component Inventory

### Marketing Components

File: `src/components/marketing/PageKit.tsx`

Observed components:

```txt
PageHero
PageSection
FeatureGrid
CheckList
Photo / ImagePlaceholder
HeroVisual
FloatCard
FinalCTA
```

Observed patterns:

- Split hero when visual is present.
- Kicker pill with lime dot.
- Primary and secondary CTAs.
- Motion entrance animations.
- Full-width sections with `max-w-7xl` content.
- Feature cards with rounded corners, border, white background, soft shadow.
- Hero visuals use large rounded frames, ring, gradient overlay, caption chip.
- Floating cards around hero visuals are hidden on small screens.

Production mapping:

- These components should be ported first as marketing design primitives.
- Do not replace them with generic card grids.
- Keep image treatment, floating cards, spacing, and CTA hierarchy.

### Shell Components

File: `src/components/shell/ui.tsx`

Observed components:

```txt
PageHeader
Card
StatusPill
ProgressRing
WaitlistDot
```

Production mapping:

- These are the starting point for backoffice/portal primitives.
- `Card` is rounded-3xl in Lovable; if production design standards require smaller radius, document and approve before changing.
- `StatusPill`, `ProgressRing`, and `WaitlistDot` map directly to real domain states.

## Design Tokens Observed

File: `src/styles.css`

Fonts:

```txt
Display: Plus Jakarta Sans
Sans: Inter
```

Core visual language:

```txt
Background: very light aqua/slate
Foreground: deep blue/slate
Primary: blue
Aqua accent
Navy accent
Success/warning/danger semantic colors
Large radius scale, base radius 1rem
Soft/card/glow shadows
```

CSS variables include:

```txt
--background
--foreground
--card
--primary
--secondary
--muted
--accent
--border
--ring
--navy
--aqua
--aqua-soft
--success
--warning
--danger
--shadow-soft
--shadow-card
--shadow-glow
```

Marketing-specific colors observed in components:

```txt
#1D4ED8 - strong blue
#B6FF2E - lime accent
#0F172A - dark CTA block
```

Production mapping:

- Convert these tokens into the Next.js app design system before moving screens.
- Keep token names stable enough to support future sectors.
- Add tenant branding as overrides, not replacements for the NXTTRACK base language.

## Responsive Behavior Observed

Patterns:

- `md` breakpoint for desktop navigation vs mobile drawer/menu.
- `lg` breakpoint for two-column hero layouts and app content grids.
- `max-w-screen-2xl` for public tenant shell.
- `max-w-7xl` for marketing pages.
- Cards use responsive grids such as `md:grid-cols-2`, `lg:grid-cols-3`, `lg:grid-cols-4`, `lg:grid-cols-5`.
- Hero floating cards are hidden on small screens with `hidden sm:block` or `hidden md:block`.
- Search is hidden until large screens with `hidden lg:flex`.

Production mapping:

- Responsive behavior should be screenshot-tested before and after porting.
- Mobile drawer/header behavior must be preserved.
- Marketing hero visual treatment should degrade cleanly without overlapping text.

## Mock Data Inventory

File: `src/lib/mock.ts`

Observed data groups:

```txt
tenant
family
programs
journey
skills
upcomingLessons
catchUpMoments
badges
skillRows
instructorAgenda
groupStudents
adminKpis
adminAgenda
occupancyData
revenueData
messagesList
```

Domain concepts already present in mock data:

```txt
Tenant
Family/parent/child
Program
Current module/stage
Next module/stage
Instructor
Waitlist level
Lesson/session
Catch-up lesson
Badge
Skill/progress row
Group students
Attendance/presence
Admin KPIs
Capacity/occupancy
Revenue
Messages
```

Important modeling note:

- Lovable uses swim labels such as `Badje`, `Diploma A`, `Zwemschool Demo`, `Bad 1`, and `Zwemlessen`.
- Production core must translate these into generic domain models: stage, program, tenant, resource, session, enrollment, progress, certificate.
- Subscription/payment plan must not be confused with stage/level. Moving from one badje/stage to another usually changes group/stage, not billing.

## Design-to-Production Mapping

| Lovable route/screen | Production module | UI readiness | Backend/domain needed |
| --- | --- | --- | --- |
| `/` | Public Tenant Website | Shell and public layout ready as reference | Tenant branding, programs, news, agenda, intake entry |
| `/programmas` | Program Marketplace | Route exists | Programs, pricing display, capacity/waitlist summary |
| `/intake` | Dynamic Intake | Route exists | Intake schema, intake answers, preference capture, trial/registration/waitlist option |
| `/parent` | Parent Portal Home | Strong reference UI | Auth, family, enrollment, next lesson, progress summaries |
| `/parent/lessen` | Lessons / Catch-up | Route exists | Sessions, attendance, catch-up eligibility, capacity |
| `/parent/voortgang` | Progress System | Route exists | Skills, stage progress, instructor feedback |
| `/parent/badges` | Achievements | Route exists | Badges, achievement cards, visibility/share settings |
| `/parent/afzwemmen` | Afzwem Module | Route exists | Milestone readiness, event planning, result status |
| `/parent/diplomas` | Digital Diploma Vault | Route exists | Certificates, files, verification/share links |
| `/instructor` | Instructor Today | Strong reference UI | Assigned sessions, groups, tasks, alerts |
| `/instructor/group/$id` | Group/Session Workflow | Strong reference UI | Session roster, attendance, group membership |
| `/instructor/student/$id` | Progress Assessment | Strong reference UI | Assessment items, scoring, notes, badge awarding |
| `/admin` | Tenant Ops Dashboard | Strong reference UI | KPIs, occupancy, intake/waitlist, alerts, finance summary |
| `/admin/agenda` | Planning Board | Route exists | Groups, sessions, resources, instructors, conflicts |
| `/admin/leerlingen` | Participants | Route exists | Participants, guardians, enrollments, group memberships |
| `/admin/programma` | Programs/Stages | Route exists | Program/stage setup, sector terminology |
| `/admin/intake` | Intake Management | Route exists | Intake forms, submissions, decisions |
| `/admin/wachtlijst` | Waitlist/Placement | Route exists | Matching, slot offers, acceptance/decline flow |
| `/admin/afzwemmen` | Afzwem Operations | Route exists | Readiness, planning, results, diploma generation |
| `/admin/rapportages` | Reporting | Route exists | Reports, exports, charts |
| `/admin/berichten` | Messages | Route exists | Templates, recipients, SendGrid SMTP |
| `/admin/taken` | Tasks | Route exists | Operational tasks and assignments |
| `/admin/documenten` | Documents | Route exists | Files, folders, permissions |
| `/nxttrack/*` | NXTTRACK Marketing | Strong reference UI | CMS/static content decision and final copy |

## Conflicts / Decisions Needed

### Runtime Architecture

Source A says: Lovable is TanStack Router/TanStack Start/Vite.

Source B says: final platform architecture targets Next.js production deployment.

Risk: copying runtime architecture directly would conflict with the deployment and architecture plan.

Recommended decision: use Lovable as visual and interaction source of truth, while implementing final platform in Next.js.

Reason: the user explicitly identified `nxttrack/platform` as the final rebuild and infrastructure points to Next.js deployment.

### Swim Labels vs Generic Domain

Source A says: Lovable UI uses swim-school terms such as badje, diploma, zwemschool, bad, instructeur.

Source B says: platform must support future sectors and avoid swimming-only core models.

Risk: hardcoding swim terms into core tables and services blocks future football, dance, martial arts, and club sectors.

Recommended decision: keep swim labels in visible tenant terminology, but use generic internal models.

Reason: swim-first product focus and sector-flexible architecture can coexist through terminology mapping.

### Trial Lesson Flow

Source A says: public navigation has both Proefles and Inschrijven pointing to `/intake`.

Source B says: registration, trial, and waitlist are intake options.

Risk: building trial lesson as a separate product flow too early creates duplicated intake logic.

Recommended decision: model trial lesson as an intake option and optional program/session offer, not a separate core workflow.

Reason: one dynamic intake engine can serve registration, trial, and waitlist choices.

### Admin Shell Reuse

Source A says: Lovable has a tenant admin shell under `/admin`.

Source B says: platform admin backoffice pattern is also needed.

Risk: reusing tenant admin one-to-one for platform admin may expose tenant operations concepts in platform management.

Recommended decision: reuse shell primitives and visual language, but keep platform admin as a distinct route group and permission model.

Reason: visual consistency is useful, but platform-level operations have different data boundaries.

## Transfer Strategy After Approval

1. Capture screenshots of Lovable reference routes at desktop and mobile widths.
2. Port global fonts, tokens, shadows, radius, and semantic colors into the Next.js app.
3. Port shared marketing primitives from `PageKit`.
4. Port `AppShell` behavior and shell primitives.
5. Create route shells in the final app using mock adapters, not production data fetching yet.
6. Replace hardcoded mock data with typed domain-facing adapters module by module.
7. Add screenshot regression checks around the ported UI.

## What Not To Do In Phase 1

- Do not redesign the Lovable UI.
- Do not simplify the visual system before documenting a technical reason.
- Do not move UI before screenshots and component inventory are complete.
- Do not connect real auth/data/payments while auditing.
- Do not rename routes unless route strategy is approved.
- Do not replace the Lovable shell with generic starter templates.

## Phase 1 Acceptance Criteria

- Access to `nxttrack/swim-school-pro` is confirmed.
- Routes are inventoried.
- Shells are inventoried.
- Components and design tokens are inventoried.
- Responsive patterns are documented.
- Mock data and domain implications are documented.
- Design-to-production mapping is documented.
- Conflicts and decisions needed are documented.
- No UI transfer has started yet.

## Open Questions

1. Should final production URLs keep `/parent`, `/instructor`, and `/admin`, or should they become localized/user-facing paths later?
2. Should `/nxttrack/*` marketing live in the same Next.js app as tenant apps, or be split later for operational isolation?
3. Which tenant branding fields are required for staging: logo, colors, fonts, domain, copy, program labels?
4. Should platform admin share the same AppShell sidebar pattern visually, with a different nav and permission boundary?
5. Which Lovable routes need screenshot baselines first: all routes, or the core shells only?
