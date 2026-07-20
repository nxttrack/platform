# Phase 1 - Lovable UI Audit

Last updated: 2026-07-20

## Status

The Lovable source audit and local Priority A capture are complete for the pinned reference commit. Product-owner visual approval and production comparison remain open.

Reference repository: `nxttrack/swim-school-pro`

Pinned source:

- Repository: `nxttrack/swim-school-pro`.
- Commit: `ced1290b239f61566a542825c9ed8a9229cc3282`.
- GitHub connector access: confirmed.
- Read-only local clone for audit/capture: confirmed.
- Previous audit commit: `b74cbaf30abf99440472b740272f04c3550cfe93`.
- Delta since the previous audit: 12 commits affecting `package.json`, `bun.lock` and the public homepage hero.

UI was already transferred into `nxttrack/platform` before this re-audit. Phase 1 is therefore a recovery audit: establish the reference truth, identify drift, and prevent further UI work from compounding it.

## 2026-07-20 Re-Audit Outcome

### Reference Inventory

- 54 generated route URLs across tenant-public, parent, instructor, tenant-admin, marketing and showcase surfaces.
- 56 route source files.
- 46 shadcn-style UI primitive files.
- 26 direct Radix primitive packages.
- Framer Motion for entrance, drawer and active-navigation transitions.
- Recharts for operational dashboard charts.
- `PageKit`, `AppShell`, five shell primitives and a full responsive public shell.

### Current Next.js Inventory

- 51 page routes.
- Six shared component files.
- Two client components.
- No `components.json` shadcn registry configuration.
- No Radix dependency set.
- No Framer Motion dependency.
- No Recharts dependency.

The route surface is broader than the component system. Most domain pages exist, but they are assembled from server-rendered page-local markup rather than a consistent interactive primitive layer.

### Highest-Priority Drift

| Area | Lovable reference | Current implementation | Required next action |
| --- | --- | --- | --- |
| Shell navigation | Path-aware active state with animated indicator | First item is always marked active | Split server context from a small client navigation shell and use the actual pathname |
| Mobile shell | Menu button, overlay, 280px drawer and close behavior | Static logo only; desktop navigation disappears | Restore accessible Radix Sheet/Dialog-based navigation with focus management |
| Shell primitives | `PageHeader`, `Card`, `StatusPill`, `ProgressRing`, `WaitlistDot` | First three only | Port the two missing semantic primitives before screen polish |
| Marketing primitives | Nine PageKit exports with photo, image-placeholder and floating-card treatment | Six exports; no `Photo`, `ImagePlaceholder` or `FloatCard` | Restore the reference primitives and keep Next.js image semantics |
| Motion | Page entrances, drawer motion, active nav and floating cards | Mostly absent | Add restrained motion with reduced-motion support |
| Charts | Recharts-based occupancy, intake and revenue visualizations | Static/hand-built output | Introduce chart primitives only for canon-backed metrics |
| Parent routes | `/parent/*` reference including badges and afzwemmen | Canonical `/portaal/*`; direct badges and afzwemmen pages absent | Keep `/portaal`, add the two missing canon routes |
| Marketing subpages | Designed module-specific pages | Most slugs render one generic hero | Restore module-specific composition from the reference |
| Tokens | Exact OKLCH token system and full semantic aliases | Approximate hex mapping and fewer aliases | Preserve exact source tokens, then layer tenant overrides |

### Design-System Decisions Locked

1. Keep production on Next.js; do not copy TanStack Start routing.
2. Use shadcn component ownership and Radix behavior primitives as the accessibility foundation.
3. Lovable tokens and compositions remain the visual layer; default shadcn styling is not the target.
4. Keep `/portaal/*` as the production localization of `/parent/*`, as locked by the canon.
5. Keep platform admin guards and data access separate from tenant-admin logic even when primitives are shared.
6. Build a thin client interaction layer around server-rendered data instead of converting whole pages to client components.
7. Introduce motion selectively and honor `prefers-reduced-motion`.
8. Do not add a chart until its metric, empty state and data boundary are explicit.

### Screenshot Evidence

The Priority A matrix contains 14 routes at four viewports: 56 screenshots in total. The local capture completed with zero runtime failures.

- Evidence directory: `artifacts/lovable-baseline/ced1290b239f61566a542825c9ed8a9229cc3282`.
- Image bytes: `24,131,324`.
- Aggregate checksum over ordered route/viewport hashes: `72f9f3610d8473b298e2735ef9fa44e9a94c6eb931c0a4b1e49eb6e9c1659194`.
- Tracked capture contract: `docs/lovable-baseline/manifest.json`.
- Capture command: `LOVABLE_BASE_URL=<reference-url> pnpm design:capture-lovable`.

The Lovable repository contains a zero-byte `public/zwemdemo-logo.png`; the actual 18,574-byte logo is stored as `public/zwemdemo-logoUrlogo.png` and referenced through Lovable's hosted asset path. The local audit server used that exact image as a path fixture. This must be cleaned up in the reference repository or accounted for in every local capture.

### Phase 2 Follow-Up

Phase 2 resolves the first foundation set: exact tokens, shadcn ownership, Radix mobile Sheet, pathname-aware navigation, the missing semantic primitives, consolidated photo handling and direct parent badges/afzwem routes. The drift table above remains the record of the Phase 1 starting point; module-specific composition, charts and approved production comparison remain open.

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

1. Approve the captured Priority A reference baseline.
2. Restore the exact global tokens, shadows, radius and semantic aliases in the Next.js app.
3. Establish shadcn/Radix ownership and accessibility conventions without importing default visual direction.
4. Restore `AppShell` active navigation and mobile drawer behavior.
5. Restore the missing shell and marketing primitives.
6. Compare each production route against the pinned reference at matching viewports.
7. Replace remaining generic/page-local UI module by module while keeping real domain adapters intact.
8. Add stable visual regression assertions after intentional differences are approved.

## What Not To Do In Phase 1

- Do not redesign the Lovable UI.
- Do not simplify the visual system before documenting a technical reason.
- Do not move UI before screenshots and component inventory are complete.
- Do not connect real auth/data/payments while auditing.
- Do not rename routes unless route strategy is approved.
- Do not replace the Lovable shell with generic starter templates.

## Phase 1 Acceptance Criteria

- [x] Access to `nxttrack/swim-school-pro` is confirmed.
- [x] The reference is pinned to a full commit SHA.
- [x] Routes and shells are inventoried.
- [x] Components, Radix dependencies and design tokens are inventoried.
- [x] Responsive and motion patterns are documented.
- [x] Mock data and domain implications are documented.
- [x] Design-to-production mapping is documented.
- [x] Priority A is captured at four viewports with checksums.
- [x] Current implementation drift is documented.
- [x] The shadcn/Radix implementation direction is locked.
- [ ] Product owner approves the Priority A visual baseline.
- [ ] Production screenshots are compared at the same commit and viewports.

## Open Questions

1. Which intentional production differences are approved after side-by-side Priority A review?
2. Should the reference repository's malformed duplicate logo file be repaired at source?
3. Which tenant theme fields may override base tokens in the first design-system release?
4. Should screenshot images remain workflow artifacts, or should selected approved goldens be committed?
