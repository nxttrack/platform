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

## Gaten ten opzichte van canon v2.1

1. Geen open, strikt gevalideerde `PortalThemeManifestV2`-registry of immutable releasecatalogus.
2. Geen theme assignment/schedule/auditdatamodel en geen Theme Control Center.
3. Ouderportaal gebruikt één globale visuele set; theme tokens, recipes en route-assets ontbreken.
4. Assessmentrecords missen `scale_version`, `source_scale_version` en bronwaarde.
5. Trainerinvoer gebruikt een select; ouderkaarten tonen niet exact vijf zichtbare posities met één toegankelijke `x van 5`-beschrijving.
6. Geen platform-neutrale tokenexport voor ontbrekende native clients.
7. Nieuwe world-art en badgefamilies zijn nog niet in de runtime assetpipeline opgenomen.

## Implementatierichting

- Eén platform-neutraal contract en registry; routecode importeert geen concrete themefolders.
- Serverresolver op beveiligde tenantcontext met Defaultfallback bij ontbrekende of incompatibele data.
- Eén Pearl Frame-webadapter op CSS custom properties en geregistreerde recipe-ID's.
- Eén gedeeld vijfpuntsassessmentcontract en herbruikbare webcomponent voor read/write.
- Additieve, idempotente migratie met vijf immutable releases, assignment/schedule/audit, assessmentbronbehoud en platform-admin-RPC's.
- Theme Control Center gebruikt alleen platform owner/admin-authorisatie en server-side tenantselectie.
- De ontbrekende native clients krijgen JSON-tokenexports, een adaptercontract en contracttests; geen WebView of schijnapp.

## Risico's en gates

- Bestaande ouderportaalwijzigingen stonden al ongecommit in de worktree en worden behouden.
- De drie nieuwe badgeboards zijn alleen stijlankers. Hun packstatus blijft `review`; runtime gebruikt een eigen code-native framefallback.
- Een database-inventarisatie van echte legacy driepuntsscores vereist een verbonden omgeving. De migratie converteert uitsluitend expliciet gemarkeerde legacyrecords en raadt nooit op basis van score alleen.
- Volledige 5 × 13 visuele goedkeuring en native smoke-tests vereisen respectievelijk een reviewomgeving en de toekomstige native repositories.
