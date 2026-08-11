# NXTTRACK Theme Engine v2.1 · implementatiekaart

Datum nulmeting: 1 augustus 2026

## Bestaande basis

- Web: Next.js 16 / React 19 in `apps/web`; SSR en server actions zijn aanwezig.
- Data: Supabase/PostgreSQL met additieve SQL-migraties, RLS en service-role domeinservices.
- Ouderportaal: de dertien canonieke route-ID's zijn aanwezig als canonieke routes of compatibiliteitsroutes.
- Productkern: lessen, inhalen, afzwemmen, voortgang, badges, media, diploma's, inbox, betalingen, documenten, feedback, gezin en profiel gebruiken bestaande domeinservices.
- Beoordelingen: `participant_progress_scores.score` heeft al een databaseconstraint `1–5`; trainerwrites lopen via `scoreProgressItemAction`.
- Platformbeheer: platform owner/admin-guards, onboarding, tenantbeheer en append-only auditpatronen bestaan.
- Native: er is geen iOS- of Androidproject in deze repository.

Baseline:

```text
pnpm run typecheck   groen
pnpm run db:audit    groen (116 migraties)
pnpm run test:badges groen (22 tests)
```

## Implementatiestatus

1. `PortalThemeManifestV2`, vijf immutable releases, serverresolver, assignment, planning, rollback en append-only audit zijn aangesloten.
2. Eén Pearl Frame rendert thematische tokens, lokale fonts, een ronde kindselector en vijf primaire bestemmingen zonder themeflash.
3. Alle vijf thema’s hebben voor alle dertien route-ID’s een geregistreerde presentatie. Overzicht, Planning, Ontwikkeling en Badges zijn rijk; overige routes gebruiken rustige code-native cues.
4. Default en Ocean Quest gebruiken de dedicated dashboard-/journey-art en twaalf losse true-alpha badges. Dolphin, Turtle en Academy gebruiken de aangeleverde landscape-/portrait-art en hun eigen veilige badgeframefallback zolang hun twaalfpacks `review` zijn.
5. Mobiel gebruikt uitsluitend dedicated portrait-art. Ontbrekende of defecte art valt terug op de code-native gradient van hetzelfde thema.
6. Beoordelingen tonen exact vijf smileys of vijf sterren, schrijven alleen `1–5`, bewaren `null` als niet beoordeeld en migreren expliciete legacywaarden via `1→1`, `2→3`, `3→5`.
7. Onboarding en Theme Control Center hebben read-only desktop-, mobiel-, route-, state- en tenantbrandingpreviews.
8. De native JSON-bundles bevatten routes, recipes, assethashes, offlinegedrag, toegankelijkheid en het vijfpuntscontract; er wordt geen DOM/CSS/WebView geëxporteerd.
9. PII-veilige semantische analytics en een 5 × 13 desktop/mobiel visueel testharnas zijn aanwezig.

## Reproduceerbare gates

```text
pnpm run themes:import-handoff -- <uitgepakte-handoffmap>
pnpm run themes:build-assets
pnpm run themes:export-native
pnpm run test:portal-themes
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test:portal-themes:e2e
```

De eerste zeven commando’s zijn lokale releasegates. De E2E-matrix draait afgeschermd met platform-ownercredentials en legt 65 routecombinaties plus empty-, locked- en errorstates vast.

## Bewuste packstatus en externe clients

- Dolphin Bay, Turtle Trails en Aqua Academy blijven `review` voor badges: de handoff bevat zesdelige style-anchorboards, geen publiceerbare twaalf losse masters. De runtime toont daarom expliciet hun eigen familieframe; er wordt niets uit een ander thema geleend.
- De migratie converteert uitsluitend records die expliciet als `three_point_legacy` zijn gemarkeerd en raadt nooit op basis van de score.
- Deze repository bevat geen iOS- of Androidproject. Het adaptercontract en de gedeelde contracttests zijn compleet; native client-smokes horen in de afzonderlijke clientrepositories zodra die aan deze bundleconsumer worden gekoppeld.
