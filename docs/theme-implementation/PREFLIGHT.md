# Theme pack 1.0 preflight

Date: 2026-08-03
Source package SHA-256: `daa9d2926c7c5e153f678132985f601d6c25308763503e2db94cd0181ae56406`

## Authority and scope

- The supplied `CODEX_MASTER_PROMPT.md` and `NXTTRACK_THEME_CANON.md` are the visual and interaction contract.
- The existing NXTTRACK domain, authorization, RLS, secure-download and mutation contracts remain authoritative for product behavior.
- The former five-theme launch catalog is replaced by exactly:
  `nxttrack-default`, `dolphin-bay`, `turtle-trails`, `polar-splash`,
  `coastal-explorer`, and `nationaal-zwem-abc`.
- Prototype HTML and its static example data are reference material only and are not production runtime input.
- Supplied journey scenes and mascots are immutable source artwork. Badge artwork remains placeholder-only.

## Package verification

- Public Drive archive downloaded read-only from the supplied file ID.
- ZIP integrity: pass.
- `npm ci --ignore-scripts` executed inside a temporary extracted package only; repository dependencies and lockfiles were not changed.
- `npm run verify:package`: pass — six themes, thirteen screens, locked assets and placeholder-only badge scope.
- `npm run verify:layout`: pass — 78 theme/viewport cases and zero contract errors.
- Attachment copies of the master prompt and theme canon are byte-identical to the package copies.

## Repository baseline

- Repository: `nxttrack/platform`
- Working branch: `agent/swim-school-canon-v3-android`
- Baseline SHA: `8a4c5280ec75e7f79231f5ba70c2299cc1f6f401`
- Package manager: pnpm 10.24.0
- Web runtime: Next.js 16 / React 19 / TypeScript 5.9
- Existing `pnpm run typecheck`: pass.
- Existing `pnpm run test:portal-themes`: 20/20 pass for the superseded five-theme contract.
- Existing user work in six portal shell/hero files was recorded before implementation and is preserved in the integration.

## Non-negotiable implementation decisions

- One shared shell, one Journey Engine and one set of thirteen canonical route surfaces.
- Themes alter tokens, scenery, terminology and the optional mascot only.
- Mobile navigation is exactly Overview, Planning, Development label, Inbox and More; Payments lives under More.
- The journey reads canonical server-derived curriculum/progress data. It does not calculate or invent progress client-side.
- A current-level ring appears only when the curriculum has multiple levels; the diploma-journey ring always appears.
- `nationaal-zwem-abc` is internally stable, but the visible display name falls back to `Diplomareis A–B–C` unless a verified license record is active.
- Compatibility URLs redirect to their canonical URL while preserving allowed query parameters and fragments where the browser can provide them.
- No badge image in this package is promoted to final production artwork.

## Stop conditions checked

- No required supplied asset is missing or checksum-invalid.
- No unresolvable conflict with the pre-existing portal shell changes was found.
- No new dependency is required.
- Staging deployment remains the only deployment target for this delivery.
