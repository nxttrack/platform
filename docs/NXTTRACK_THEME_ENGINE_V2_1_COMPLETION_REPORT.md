# NXTTRACK Five Theme Launch v2.1 · implementatierapport

Datum: 1 augustus 2026

## Resultaat

De repository bevat nu één open, strikt gevalideerde ouderportaal-theme engine met de vijf gelijktijdige launchreleases:

| Theme key | Release | Badgefamilie | Packstatus |
| --- | --- | --- | --- |
| `nxttrack-default` | `2.2.2` | `nxttrack-default-medallions/1.0.0` | theme gepubliceerd; badge-art review |
| `ocean-quest` | `1.2.2` | `ocean-quest-medallions/1.0.0` | gepubliceerd |
| `dolphin-bay` | `1.0.1` | `dolphin-bay-medallions/1.0.0` | theme gepubliceerd; code-native badgefallback |
| `turtle-trails` | `1.0.1` | `turtle-trails-scutes/1.0.0` | theme gepubliceerd; code-native badgefallback |
| `aqua-academy` | `1.0.1` | `aqua-academy-crests/1.0.0` | theme gepubliceerd; code-native badgefallback |

Alle dertien route-ID's komen uit dezelfde registry, domeinservices, commands en permissions. Themeverschillen zitten in semantic tokens, geregistreerde recipes, assets en fallbackprofielen. Routes importeren geen concrete thememap.

## Per fase

1. Nulmeting: routes, bestaande worktree, datamodel, assessmentwrites, platformrollen, tests en afwezigheid van native projecten vastgelegd in `NXTTRACK_THEME_ENGINE_V2_1_IMPLEMENTATION_MAP.md`.
2. Registry: `PortalThemeManifestV2`, open string-key, exacte semver, strict unknown-field rejection, recipewhitelists, immutable runtimecatalogus en Defaultfallback.
3. Data/security: zeven thematabellen, vijf idempotente seeds, één actieve assignment per tenant, planning, transactionele activatie, rollbackhistorie, append-only audit en RLS.
4. Productkern: bestaande dertien routes en domeinservices blijven gedeeld; navigationlabel voor `progress` wordt uitsluitend presentatief uit de actieve manifestrelease afgeleid.
5. Assessments: centrale 1–5-types/labels, vijf zichtbare smileys of sterren, tenantpresentatie, read/write-accessibility, databasebronmetadata en afwijzing van ongeldige writes.
6. Pearl Frame: SSR-resolver, semantische CSS-variabelen, thematische shell, mobiele navigatienaam, world-art en code-native mobile fallback als portrait art ontbreekt.
7. Assets: negen gecontroleerde bronmasters, reproduceerbare metadata-strippende WebP/AVIF-pipeline, responsive renditions, runtimehashes en budgettests.
8. Platformbeheer: onboardingkeuze met vijf kaarten; Theme Control Center met preview, direct activeren, plannen, cron-uitvoering, rollback en audit.
9. Native: vijf platform-neutrale JSON-tokenbundles en een expliciet adaptercontract; geen WebView of nep-native client.

## Vijfpuntsbewijs

- Databaseconstraint voor nieuwe writes: integer `1–5`, `scale_version = five_point_v1`.
- `null` blijft uitsluitend een niet-beoordeelde/draftstate en wordt in read-only UI `Nog niet beoordeeld`.
- Trainerinvoer is één radiogroup met exact vijf 44×44-opties.
- Ouder- en trainerweergave tonen vijf posities met één volledige toegankelijke beschrijving `x van 5`.
- Tenantinstelling accepteert alleen `smileys` of `stars`; de opgeslagen betekenis blijft gelijk.
- Directe authenticated writes op `participant_progress_scores` zijn ingetrokken; de actuele servercommand schrijft schaalmetadata.
- Productiecode bevat geen `/ 3`-copy of actieve driepuntsrenderer.
- Legacyconversie raakt uitsluitend expliciet geregistreerde bronrecords en gebruikt `1→1`, `2→3`, `3→5`; bronwaarde blijft behouden.

Werkelijke legacy-migratieaantallen zijn niet verzonnen: er was in deze taak geen verbonden database-inventarisatie. Het repositorieschema bewijst dat bestaande lokale modelrecords sinds tabelcreatie al een 1–5-constraint hadden. Expliciet gemarkeerde externe legacyrecords kunnen idempotent door `app_private.migrate_legacy_three_point_assessments()` worden verwerkt en gereconcilieerd.

## Validatie

```text
pnpm run typecheck             groen
pnpm run build                 groen
pnpm run db:audit              groen · 117 migraties
pnpm run test:portal-themes    groen · 9 tests
pnpm run test:badges           groen · 22 tests
pnpm run themes:export-native  groen · 5 JSON-bundles
```

De assetcontracttests verifiëren runtimebestaan, SHA-256-parity en budgets. De grootste geselecteerde mobiele WebP is minder dan 100 KB en de grootste geselecteerde desktop-WebP minder dan 145 KB, ruim onder 250/500 KB.

## Belangrijkste bestanden

- Contract/registry: `apps/web/lib/theme/portal-theme-contract.ts`, `portal-theme-registry.ts`, `portal-theme-server.ts`, `portal-theme-web.ts`
- Assessmentkern/UI: `apps/web/lib/domain/learner-assessment.ts`, `apps/web/components/assessments/five-point-assessment.tsx`
- Platformbeheer: `apps/web/app/(platform-admin)/platform/themes/page.tsx`, `portal-theme-control*.ts`
- Data: `supabase/migrations/20260801120000_parent_portal_theme_engine_v2_1.sql`
- Assets: `assets/portal-theme-masters/`, `apps/web/public/portal-themes/`, `scripts/theme/`
- Native contract: `contracts/parent-portal/`
- Tests: `tests/unit/portal-theme-*.test.ts`, `learner-assessment-contract.test.ts`

## Status en resterende releasegates

- De vijf themes zijn technisch tegelijk integreerbaar en alle routes behouden dezelfde productkern.
- Dolphin, Turtle en Academy gebruiken bewust hun eigen code-native badgefallback; hun zesdelige styleboards zijn niet als spritesheet gepubliceerd.
- Native builds en smoke-tests moeten in de toekomstige iOS-/Androidrepositories plaatsvinden.
- Authenticated 5 × 13 screenshotregressie, screenreaderhandtest en productie-RLS/cache-isolatie vereisen een gemigreerde review-/stagingomgeving.
- Er zijn geen commits gemaakt: de worktree bevatte vóór deze integratie al omvangrijke, overlappende gebruikerswijzigingen aan het ouderportaal; die zijn behouden en niet zonder eigenaarschap gecommit.
