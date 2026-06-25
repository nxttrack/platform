# UI/UX Enterprise Audit

Date: 2026-06-25

Scope: full NXTTRACK platform UI compared against the local Lovable reference in `tmp/swim-school-pro-reference`.

## Lovable Reference Checked

- `src/styles.css`: color tokens, radius, soft gradients, card shadows and page background.
- `src/components/marketing/PageKit.tsx`: hero rhythm, CTA contrast, section spacing, feature cards and final CTA.
- `src/components/marketing/SiteHeader.tsx`: sticky header, mobile menu, primary/secondary CTA styling.
- `src/components/shell/AppShell.tsx`: sidebar structure, mobile drawer behavior, active route styling, top bar density.
- Public tenant routes: homepage, programs, intake, news and agenda patterns.
- Parent, instructor and admin route families: shell rhythm, page headers, cards, forms and data-heavy screens.

## Fixes Applied In This Sprint

- Private shells now receive the current pathname from the Next proxy and mark the correct navigation item active.
- Tenant admin, platform admin, parent and instructor shells now expose a real mobile/tablet navigation menu instead of a dead header icon.
- Mobile shell navigation keeps Lovable grouping, large tap targets, visible active state and scroll containment for long admin sidebars.
- Tenant public websites now calculate `--primary-foreground` from the configured brand color, preventing dark-on-dark or light-on-light CTA text.
- Tenant public brand color also drives focus ring color, keeping tenant branding consistent without sacrificing contrast.
- Shell content spacing now has a smoother mobile/tablet progression (`p-4`, `sm:p-5`, `md:p-8`).

## Current Enterprise UI Contract

- Public marketing and tenant pages keep the Lovable visual language: soft swim gradients, large imagery, rounded cards, compact trust markers and clear CTA hierarchy.
- Operational shells keep Lovable structure: fixed desktop sidebar, sticky top bar, grouped navigation, card-based dense work surfaces and mobile-first instructor/parent access.
- Forms use labeled controls, visible focus rings, minimum 44px touch targets where actions are expected and consistent pending/error/success infrastructure through action forms.
- Data-heavy admin pages must remain scan-friendly: grouped sidebar, filters/search, table enhancement, empty states and detail routes.

## Remaining Visual QA Notes

- Pixel-level screenshot comparison is automated through `pnpm run e2e:visual` for desktop and mobile. CI stores branch baselines in the GitHub Actions cache and uploads visual diffs as artifacts on mismatch. Private dashboard baselines require `E2E_ADMIN_EMAIL`, `E2E_PARENT_EMAIL` and `E2E_INSTRUCTOR_EMAIL` fixture credentials so the suite captures real dashboards instead of login boundaries. Set `VISUAL_REQUIRE_AUTH=true` once those fixtures are available.
- The NXTTRACK marketing page is intentionally close to Lovable, but still uses Next-specific links/assets. Any future redesign must be tracked against the Lovable reference first.
- Tenant-selected colors can now remain readable on CTAs, but tenant admins should still be guided toward accessible brand palettes in future CMS validation.

## Verification Commands

- `pnpm run ui:audit`
- `pnpm run ui:lovable`
- `pnpm run e2e:visual`
- `pnpm run e2e:visual:update`
- `pnpm run e2e:browser -- --list`
- `pnpm run typecheck`
- `pnpm run build`
