# Lovable Marketing Port

## Source

- Repository: `nxttrack/swim-school-pro`
- Route source: `src/routes/nxttrack.tsx` and `src/routes/nxttrack.index.tsx`
- Shared source: `src/components/marketing/SiteHeader.tsx`, `src/components/marketing/SiteFooter.tsx`
- Logo source: `src/assets/nxttrack-logo.svg`

## Platform Mapping

- Lovable `/nxttrack` layout -> `apps/web/components/marketing/nxttrack-marketing.tsx`
- Lovable `/nxttrack/` homepage -> `apps/web/app/(nxttrack-marketing)/nxttrack/page.tsx`
- Lovable logo -> `apps/web/public/lovable/nxttrack-logo.svg`
- Lovable TanStack `Link` usage -> Next.js `Link`
- Lovable `useRouterState` active state -> Next.js `usePathname`

## Technical Deviations

The page structure, copy, cards, spacing, colors, navigation, footer and mock UI are ported from the Lovable source. The exact JPEG binaries from `src/assets/nxt-*.jpg` could not be transferred through the available connector: text files and SVGs were readable, but binary blob fetch failed or returned truncated data. The port therefore keeps the Lovable image slots and fallback photo placeholders that already exist in the source component.

When normal repository clone or ZIP access is available, place these source files under `apps/web/public/lovable/` and swap the corresponding placeholders to `img` tags without changing the surrounding UI:

- `nxt-hero.jpg`
- `nxt-parent-child.jpg`
- `nxt-instructor-tablet.jpg`
- `nxt-child-medal.jpg`
- `nxt-children-pool.jpg`
- `nxt-instructor-poolside.jpg`
- `nxt-parent-phone.jpg`

## Scope Guard

This port intentionally does not add auth, tenant data, payments, schema changes, Supabase integration, or deployment changes. It is a Phase 1/2 UI consolidation step only.
