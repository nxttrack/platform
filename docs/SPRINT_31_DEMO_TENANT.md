# Sprint 31 — beheerde demo-tenant

De canonieke en enige showcase-tenant is **Zwemacademie De Waterlijn** (`waterlijn-demo`). De seed bevat twee
programma's, zes niveaus, een locatie met twee baden, negen groepen, 48 leerlingen, vier fictieve instructeurs,
inschrijvingen, groepsbezetting, acht weken rollende lessen, recente aanwezigheid, voortgang, badges, twee
betaalplannen, twintig representatieve abonnementen/betalingen, operationele taken, berichten en een realistische
wachtlijst.

De technische Phase 16-tenant is geen showcase. Die tenant bestaat uitsluitend voor geautomatiseerde auth-,
RLS- en browsertests, gebruikt standaard de interne identiteit `nxttrack-e2e` en wordt zichtbaar gelabeld als
**NXTTRACK technische E2E-fixture**. De historische interne slug `aquaswim-demo` mag tijdens de overgang alleen
als E2E-identificatie blijven bestaan; gebruikersgerichte copy en marketing mogen die naam niet tonen.

## Veilig uitvoeren

De seed weigert buiten staging en vereist een tweede expliciete schakel:

```bash
APP_ENV=staging ALLOW_SPRINT31_DEMO_SEED=true pnpm run staging:seed-demo
```

De Supabase serverconfiguratie komt uit `NEXT_PUBLIC_SUPABASE_URL` en `SUPABASE_SECRET_KEY` (of de service-role fallback). De seed is idempotent op tenant-slug, domein, codes en leerlingreferenties. Hij verwijdert geen bestaande data en maakt geen auth-gebruikers aan.

De normale uitvoering loopt via de GitHub Action **Staging demo tenant seed** met bevestiging `SEED_WATERLIJN_STAGING`. Die gebruikt uitsluitend het staging-environment en bewaart de run als mutatiebewijs.

Dezelfde workflow draait dagelijks om `04:17 UTC`. Een geplande run heeft geen interactieve bevestiging nodig,
maar blijft door het GitHub `staging` environment, de staging-only scriptguard en workflowconcurrency begrensd.
Na iedere seed controleert `pnpm run staging:verify-demo` de canonieke aantallen, relatieve lesdata,
instructeurstoewijzingen, financiële statusmix, tijdlijnvulling, unieke referenties en mailveilige testdomeinen.

Het publieke stagingdomein is `waterlijn-demo.staging.nxttrack.nl`. Koppel alleen bewust een tenant-owner via de normale uitnodigingsflow; de seed wijzigt geen bestaande E2E-rollen of RLS-isolatieverwachtingen.

## Onderhoud

- Draai de seed na schemawijzigingen die de showcase raken; de dagelijkse workflow herstelt daarnaast
  datumgevoelige data en canonieke dichtheid.
- Controleer dat namen fictief en professioneel blijven; `example.test`-adressen mogen nooit mail ontvangen.
- Fictieve instructeurs gebruiken uitsluitend `@demo.nxttrack.test`. Ze bestaan alleen als niet-gecommuniceerde
  Auth-identiteiten om realistische roosters en taaktoewijzingen mogelijk te maken; het seedproces verstuurt
  geen uitnodiging, resetcode of andere mail.
- Voeg nieuwe dashboardsignalen toe door bestaande gecodeerde records te verrijken, niet door een tweede demo-tenant te maken.
- Houd data relatief aan de lokale datum in `Europe/Amsterdam`; vaste kalenderdata veroorzaken verouderde
  dashboards en zijn niet toegestaan in de beheerde showcase.
- Houd operationele dichtheid representatief, maar voorspelbaar voor screenshots en demo's.
