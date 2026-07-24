# Journey Simulation Bot

## Technische haalbaarheid

```txt
Possible now: yes
Missing critical pieces: geen voor de volledige testreis
Safe implementation mode: development/dev/staging, service-side orchestration, testmarkers, job lock, notificaties/betalingen onderdrukt
Recommended fallback: alleen expliciet geconfigureerde deterministische placement fallback; standaard uit
```

De bestaande domeinen ondersteunen intake, wachtlijst, placement scoring, capaciteit, enrollment, groepsmembership, sessies, aanwezigheid, voortgang, badges, afzwem-readiness, afzwemevents en certificaten. De bot gebruikt deze tabellen en dezelfde placement-scorefunctie. Ontbrekende modules worden als issue opgeslagen; een diploma wordt dan niet gefaket.

## De Waterlijn seed

De stagingseed maakt vóór de eerste run aan:

- vier herkenbare testinstructeurs;
- niveaus Instructie, Badje 1, Badje 2, Badje 3, Afzwemmen, Diploma B, Diploma C en Klaar;
- vijf badresources;
- acht groepen van exact 45 minuten, verdeeld over maandag tot en met vrijdag;
- zes sessies per groep;
- voortgangsmodules, vaardigheden en badges per actief zwemniveau;
- een standaard uitgeschakelde stagingconfig voor `waterlijn-demo`.

Uitvoeren via de stagingworkflow of vanaf een veilige stagingjob:

```bash
APP_ENV=staging ALLOW_JOURNEY_BOT_SEED=true pnpm staging:seed-journey-bot
```

## Bediening

Platform admins openen `/platform/test-tools/journey-bot`.

- `Run now` voert één begrensde run uit.
- `Run komende uren` activeert een tijdelijk runvenster.
- `Pauzeren` stopt nieuwe ticks zonder actieve data te verwijderen.
- `Alles stoppen` schakelt configs uit en markeert actieve runs als gestopt.
- `Archiveren` raakt uitsluitend records met `is_test=true` en `source=journey_simulation_bot`.

Geplande runner:

```bash
curl --request POST \
  --header "Authorization: Bearer $CRON_SECRET" \
  https://staging.nxttrack.nl/api/internal/journey-bot/tick
```

## Bekende beperking

De simulation adapter roept bestaande placement scoring aan en respecteert capaciteit, stage en voorkeursdag. Bestaande mutaties voor attendance/progress/graduation zijn server actions met redirects en sessie-auth; de bot schrijft daarom via één afgeschermde service-adapter naar dezelfde domeintabellen en valideert elk resultaat. Externe delivery- en paymentservices worden niet aangeroepen.
