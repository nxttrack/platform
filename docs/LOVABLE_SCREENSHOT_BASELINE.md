# Lovable Screenshot Baseline

Last updated: 2026-06-23

Status: baseline plan only. No UI has been moved into `nxttrack/platform` yet.

## Purpose

Lovable is the visual source of truth. Before UI transfer or consolidation starts, capture a screenshot baseline from `nxttrack/swim-school-pro` so production implementation can be compared against the original design.

## Source Repository

```txt
nxttrack/swim-school-pro
```

Observed Lovable runtime:

```txt
TanStack Router / TanStack Start / Vite
Tailwind CSS v4
Framer Motion
lucide-react
Recharts
```

Final production runtime remains Next.js. Screenshots compare visual output, not runtime internals.

## Required Viewports

Capture at least:

```txt
Mobile: 390x844
Tablet: 768x1024
Desktop: 1440x1000
Wide desktop: 1728x1117
```

For dense admin screens, also capture:

```txt
Desktop short: 1440x800
```

## Priority Routes

### Priority A - Core Shells

Capture first:

```txt
/
/programmas
/intake
/parent
/parent/lessen
/parent/voortgang
/instructor
/instructor/group/badje-1
/instructor/student/emma
/admin
/admin/agenda
/admin/wachtlijst
/nxttrack
/nxttrack/zwemscholen
```

Reason:

- These define tenant public, parent, instructor, tenant admin, and NXTTRACK marketing patterns.
- These are the highest-risk routes for visual drift.

### Priority B - Product Modules

Capture second:

```txt
/parent/badges
/parent/afzwemmen
/parent/diplomas
/parent/berichten
/parent/documenten
/instructor/agenda
/instructor/groepen
/instructor/leerlingen
/admin/leerlingen
/admin/programma
/admin/intake
/admin/afzwemmen
/admin/rapportages
/admin/berichten
/admin/taken
/admin/groepen
/admin/documenten
/nxttrack/ouderportaal
/nxttrack/trainer-app
/nxttrack/backoffice
/nxttrack/wachtrij-planning
/nxttrack/badges-diplomas
/nxttrack/prijzen
```

### Priority C - Supporting Pages

Capture after A/B:

```txt
/agenda
/nieuws
/login
/parent/profiel
/instructor/taken
/instructor/documenten
/admin/instellingen
/nxttrack/demo
/nxttrack/contact
/nxttrack/login
/nxttrack/privacy
/showcase/reis
```

## What To Inspect Per Screenshot

For every route and viewport, note:

- Header/sidebar/mobile navigation behavior.
- Layout width and spacing.
- Typography scale.
- Card radius and shadows.
- Background color/gradients.
- CTA hierarchy.
- Icon usage.
- Chart rendering.
- Table/list density.
- Floating cards and motion end state.
- Text wrapping.
- Overlap or clipping.
- Mobile drawer behavior where applicable.

## Output Location

When screenshots are captured later, store them outside production code first:

```txt
docs/lovable-baseline/<route-slug>/<viewport>.png
```

Example:

```txt
docs/lovable-baseline/parent-home/mobile.png
docs/lovable-baseline/parent-home/desktop.png
```

If image volume becomes too large for the repo, store artifacts externally and commit only an index document with links/checksums.

## Baseline Metadata

Each captured route should record:

```txt
Route
Viewport
Commit SHA from swim-school-pro
Capture date
Browser
Known interaction state
Notes
```

Current inspected Lovable commit:

```txt
b74cbaf30abf99440472b740272f04c3550cfe93
```

## Visual Acceptance Rules

A production route passes visual baseline review when:

- Shell structure matches the Lovable route.
- Major spacing and card hierarchy are preserved.
- Colors/tokens match or are intentionally mapped.
- Responsive behavior matches the baseline intent.
- Navigation remains familiar.
- Mock/demo content has been replaced only where real data exists.
- Any differences are documented with a technical reason.

## Allowed Differences

Allowed with documentation:

- Runtime-specific markup differences from Next.js.
- Accessibility improvements.
- Data loading/empty/error states not present in Lovable.
- Tenant-driven copy differences.
- Safe replacement of demo-only assets when production asset handling exists.

Not allowed without approval:

- Replacing Lovable with generic dashboard templates.
- Removing visual depth to speed up implementation.
- Changing shell navigation patterns.
- Flattening cards/tokens into default shadcn styling.
- Dropping mobile or tablet behavior.

## Capture Prerequisites

Before screenshots can be captured:

- [ ] Local access to `nxttrack/swim-school-pro` is working, or a remote preview URL is available.
- [ ] Exact Lovable commit SHA is selected.
- [ ] Browser automation approach is selected.
- [ ] Routes are reachable without private runtime-only credentials.
- [ ] Capture output policy is confirmed.

## Acceptance Criteria Before UI Porting

- [ ] Priority A screenshots captured.
- [ ] Priority A notes documented.
- [ ] Token mapping exists in technical architecture/design docs.
- [ ] AppShell/PageKit primitives are mapped to production components.
- [ ] Differences requiring approval are listed.

## What Not To Do Yet

- Do not port UI before Priority A baseline exists.
- Do not rewrite Lovable patterns during screenshot capture.
- Do not use screenshots as the only source for domain behavior; pair them with route/component audit.
