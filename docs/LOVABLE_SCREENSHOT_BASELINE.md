# Lovable Screenshot Baseline

Last updated: 2026-07-20

Status: Priority A reference capture completed locally for the pinned commit; product-owner approval and production-side comparison remain open.

## Purpose

Lovable is the visual source of truth. Because UI transfer started before an approved baseline existed, this recovery baseline pins the reference so the production implementation can be compared without further visual drift.

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

Store generated screenshots outside production code:

```txt
artifacts/lovable-baseline/<commit>/<route-slug>/<viewport>.png
```

Example:

```txt
artifacts/lovable-baseline/<commit>/parent-home/mobile.png
artifacts/lovable-baseline/<commit>/parent-home/desktop.png
```

The directory is gitignored. Commit the manifest and evidence summary; retain approved images as workflow/release artifacts unless selected goldens are explicitly approved for version control.

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

Pinned Lovable commit:

```txt
ced1290b239f61566a542825c9ed8a9229cc3282
```

## Completed Local Capture

The tracked capture matrix lives in `docs/lovable-baseline/manifest.json`.

Result on 2026-07-20:

```txt
Priority A routes: 14
Viewports per route: 4
Screenshots: 56 / 56
Runtime failures: 0
Image bytes: 24,131,324
Aggregate checksum: 72f9f3610d8473b298e2735ef9fa44e9a94c6eb931c0a4b1e49eb6e9c1659194
```

Local output:

```txt
artifacts/lovable-baseline/ced1290b239f61566a542825c9ed8a9229cc3282/
```

The artifact directory is intentionally gitignored. Each capture has its own SHA-256 in `capture.json`. Run against a checked-out reference or preview URL with:

```bash
LOVABLE_BASE_URL=http://127.0.0.1:4173 pnpm design:capture-lovable
```

Local source caveat: `public/zwemdemo-logo.png` is zero bytes in the reference repository. For this capture, the actual `public/zwemdemo-logoUrlogo.png` was exposed at the hosted asset path recorded in `src/assets/zwemdemo-logo.png.asset.json`.

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

- [x] Local access to `nxttrack/swim-school-pro` is working.
- [x] Exact Lovable commit SHA is selected.
- [x] Chromium capture automation is implemented.
- [x] Priority A routes are reachable without private runtime credentials.
- [x] Capture output is gitignored and checksummed.

## Acceptance Criteria Before UI Porting

- [x] Priority A screenshots captured.
- [x] Priority A drift notes documented.
- [x] Token mapping exists in technical architecture/design docs.
- [x] AppShell/PageKit primitives are mapped to production components.
- [x] Differences requiring approval are listed.
- [ ] Product owner has approved the reference images.
- [ ] Matching production captures and comparison evidence exist.

## What Not To Do Yet

- Do not port UI before Priority A baseline exists.
- Do not rewrite Lovable patterns during screenshot capture.
- Do not use screenshots as the only source for domain behavior; pair them with route/component audit.
