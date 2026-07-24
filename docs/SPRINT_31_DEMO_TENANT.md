# Sprint 31 — beheerde demo-tenant

De canonieke showcase-tenant is **Zwemacademie De Waterlijn** (`waterlijn-demo`). De seed bevat twee programma's, zes niveaus, een locatie met twee baden, zeven groepen, 28 leerlingen, inschrijvingen, groepsbezetting, twee betaalplannen en een realistische wachtlijst.

## Veilig uitvoeren

De seed weigert buiten staging en vereist een tweede expliciete schakel:

```bash
APP_ENV=staging ALLOW_SPRINT31_DEMO_SEED=true pnpm run staging:seed-demo
```

De Supabase serverconfiguratie komt uit `NEXT_PUBLIC_SUPABASE_URL` en `SUPABASE_SECRET_KEY` (of de service-role fallback). De seed is idempotent op tenant-slug, domein, codes en leerlingreferenties. Hij verwijdert geen bestaande data en maakt geen auth-gebruikers aan.

Het publieke stagingdomein is `waterlijn-demo.staging.nxttrack.nl`. Koppel alleen bewust een tenant-owner via de normale uitnodigingsflow; de seed wijzigt geen bestaande E2E-rollen of RLS-isolatieverwachtingen.

## Onderhoud

- Draai de seed na schemawijzigingen die de showcase raken.
- Controleer dat namen fictief en professioneel blijven; `example.test`-adressen mogen nooit mail ontvangen.
- Voeg nieuwe dashboardsignalen toe door bestaande gecodeerde records te verrijken, niet door een tweede demo-tenant te maken.
- Houd operationele dichtheid representatief, maar voorspelbaar voor screenshots en demo's.
