# Phase 2 - Design System And Interactive Shell Foundation

Last updated: 2026-07-20

Status: implemented locally. Authenticated visual comparison and product-owner acceptance remain external gates.

## Goal

Repair the UI foundation identified in the Phase 1 recovery audit without changing the Next.js runtime, domain services or authorization boundaries.

## Implemented

### shadcn And Radix Foundation

- Added repository-owned `apps/web/components.json` configuration.
- Added a shared `cn` helper using `clsx` and `tailwind-merge`.
- Added class-variance-authority for deliberate component variants.
- Added a Radix Dialog-backed Sheet primitive for accessible mobile navigation.
- Added `tw-animate-css` for open/close state transitions.
- Kept React Server Components enabled.

shadcn and Radix own behavior and component code; they do not replace the Lovable visual language.

### Exact Lovable Tokens

`apps/web/app/globals.css` now contains the pinned Lovable OKLCH system:

- background, foreground, card and popover;
- primary, secondary, muted and accent;
- input, border and focus ring;
- navy, aqua and semantic state colors;
- chart and sidebar aliases;
- radius and soft/card/glow shadows;
- aquatic background gradients.

The lime marketing accent stays explicit as `#B6FF2E`, matching the reference instead of overloading the semantic `accent` token.

### Interactive AppShell

- The authenticated layouts still load identity, tenant and domain context on the server.
- Navigation data crossing the client boundary is serializable.
- Active navigation uses the real pathname and selects the longest matching route.
- Active links expose `aria-current="page"`.
- Mobile navigation uses a focus-managed Radix Sheet with overlay, close control and Escape behavior.
- Navigation links close the mobile drawer after selection.
- The active indicator uses restrained Framer Motion and respects reduced-motion preferences.
- The notification control links to the real messages route; search remains visibly non-interactive until a real search route exists.

### Shared Lovable Primitives

Restored or consolidated:

- `PageHeader`;
- `Card`;
- variant-driven `StatusPill`;
- accessible `ProgressRing`;
- `WaitlistDot`;
- `Photo` and `ImagePlaceholder` with Next.js Image support;
- `FloatCard` with reduced-motion behavior;
- one shared marketing Photo primitive instead of a duplicate page-local implementation.

### Canonical Route Parity

Added focused, data-backed parent routes:

- `/portaal/badges`;
- `/portaal/afzwemmen`.

The afzwem route supports the existing confirmation/decline server actions. `/portaal/diplomas` remains the private diploma vault.

### Marketing Route-Group Shell And Priority A Composition

- All `/nxttrack/*` pages now share one route-group header and footer instead of only the homepage rendering marketing chrome.
- Desktop and mobile marketing navigation are pathname-aware and expose `aria-current="page"`.
- Mobile marketing navigation uses the same focus-managed Radix Sheet foundation as authenticated shells.
- `/nxttrack/zwemscholen` now follows the pinned Lovable composition: split hero, operational callouts, lifecycle modules, hierarchy, poolside workflow, security and final CTA.
- Reference photography remains an explicit asset/approval gap; polished placeholders preserve layout dimensions until approved source assets are promoted.
- Ouderportaal, trainer app, backoffice, wachtrij/planning and badges/diploma's now have distinct Lovable-derived product narratives instead of a shared generic hero.
- Pricing, demo, contact, privacy and login use dedicated conversion/information compositions.
- Demo and contact expose an honest e-mail handoff until protected lead ingestion exists; they no longer simulate a successful submission.
- Marketing login routes users to the existing protected parent, instructor or admin login flow and never collects credentials itself.

### Typed Operational Charts

- Recharts v3 is pinned behind repository-owned shadcn-style `ChartContainer`, typed `ChartConfig`, legend and accessible-table primitives.
- Every chart enables Recharts `accessibilityLayer`; visually hidden data tables preserve the underlying values for assistive technology.
- Admin dashboard and reports receive only serializable chart arrays derived from authenticated server data.
- Capacity charts use real group membership/capacity, intake charts group real submission status, and payment charts aggregate real manual-payment value by status.
- Mock time series from the Lovable reference were deliberately not promoted into production.

### Shared Form And Data Primitives

- Added repository-owned shadcn-style Button, Input, Textarea, Field, NativeSelect and responsive Table primitives.
- The central admin form helpers now compose these primitives, so program, group, billing, task, document and graduation forms inherit consistent focus, disabled and invalid states.
- Public login, password-reset, tenant-intake and platform/tenant invitation flows use the same labelled control foundation.
- Password strength exposes a real progressbar value and a linked textual description.
- Report snapshots use a semantic responsive table; card/list patterns remain in place where records are not truly tabular.
- Native select is deliberate for server-action forms and progressive enhancement. Radix Select is reserved for interactions that need richer client-side behavior.

### Proven Workflow Interactions

- The Priority A instructor student dossier now follows the pinned Lovable information model with separate Voortgang, Beoordelen, Notities and Badges tabs.
- Radix Tabs supplies arrow-key navigation, focus behavior and active-panel semantics while all authorization, queries and mutations remain server-owned.
- The default Voortgang panel gives a read-only dossier summary; editing controls live only in their relevant panels, reducing tablet density during lessons.
- Parent lesson cancellation now uses a Radix AlertDialog before the existing server action runs.
- The confirmation copy states whether the current cancellation window does or does not grant an inhaalcredit. The optional reason remains part of the progressively enhanced form submission.

## Architecture Boundary

```txt
Server layouts
  -> auth + tenant resolution + domain data
  -> serializable shell props
  -> AppShell client interaction boundary
       -> pathname-aware navigation
       -> Radix mobile Sheet
       -> reduced-motion active indicator
  -> server-rendered page children
```

No service-role data access, authorization decision or domain mutation moved into a client component.

## Automated Contract

Run:

```bash
pnpm design:audit
```

The audit checks the pinned Lovable manifest, source-to-production mappings, shadcn configuration, required dependencies, exact tokens, shell interaction hooks, restored primitives and canonical routes. CI and deploy both run this gate.

## Acceptance Criteria

- [x] shadcn ownership/configuration exists.
- [x] Radix-backed mobile drawer exists.
- [x] Active navigation is pathname-aware and accessible.
- [x] Exact Lovable OKLCH tokens are present.
- [x] Missing shell and PageKit primitives are restored.
- [x] Parent badges and afzwem routes exist.
- [x] Server auth/data boundaries remain intact.
- [x] TypeScript and production build pass.
- [x] Public browser smoke passes.
- [x] Marketing subpages share accessible route-aware chrome.
- [x] Priority A swim-school marketing composition is restored.
- [x] Every canonical marketing subpage has a dedicated composition.
- [x] Marketing contact and login actions hand off to real platform capabilities.
- [x] Typed, accessible Recharts v3 primitives render approved real-data operational metrics.
- [x] Shared form and table primitives cover core admin, auth and intake workflows.
- [x] Instructor assessment, note and badge workflows use an accessible tab composition.
- [x] Consequential lesson cancellation requires explicit confirmation with policy outcome copy.
- [ ] Authenticated desktop/mobile screenshots are compared with the pinned Priority A baseline.
- [ ] Product owner approves intentional visual differences.

## Remaining UI Work

- Promote approved reference photography assets into repository-owned public assets.
- Add tooltips only where an icon or score explanation cannot remain self-explanatory through visible copy.
- Run the added authenticated mobile-drawer and active-link Playwright assertions on staging and retain the evidence.
- Capture production at the exact Priority A viewports and record side-by-side evidence.
- Continue component extraction from page-local CRUD markup only where repeated behavior is proven.

## Non-Goals

- No generic shadcn redesign.
- No client-side auth or data loading migration.
- No broad rewrite of existing domain pages.
- No production deployment.
- No claim of full visual parity before screenshot approval.
