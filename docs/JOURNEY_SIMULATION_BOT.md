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
- `Testcyclus resetten` geeft uitsluitend actieve Journey Bot-testplekken vrij, stopt testjourneys en zet het journeybudget terug op nul.
- `Archiveren` raakt uitsluitend records met `is_test=true` en `source=journey_simulation_bot`.

`Stop na journeys` is een harde budgetgrens. De teller wordt opnieuw gestart bij een nieuwe scenario-configuratie, een nieuwe inschakeling of `Run komende uren`. Zodra de grens is bereikt, wordt de config automatisch uitgeschakeld en gepauzeerd.

## Uitkomsten en technische health

Child journeys worden afzonderlijk geclassificeerd:

- `passed`: de gevraagde productflow is voltooid;
- `expected_blocker`: minimumleeftijd, handmatige review of capaciteit is correct bewaakt;
- `degraded`: een optionele of vereiste module ontbreekt;
- `technical_failure`: onverwachte applicatie-, database- of orchestrationfout.

Een verwachte blocker houdt de run technisch `healthy`. De tickworkflow faalt bij technische child-fouten of critical issues en kan daardoor niet langer vals groen worden. Het tickantwoord bevat geaggregeerde aantallen zonder persoonsgegevens.

De stressmix gebruikt een deterministische cyclus van twintig journeys: 70% normaal, 10% onder vier, 10% handmatige review, 5% geen capaciteit en 5% gecontroleerd herstelbaar issue.

De staging-smoke controleert vervolgens in één herstelbare cyclus:

- anonieme toegang tot de tickendpoint geeft `401`;
- één volledige reis bevat intake, scoring, plaatsing, attendance, progressie, transfers, capaciteitsvrijgave, afzwemmen en certificaat;
- de volledige 20-delige stressverdeling wordt uitgevoerd;
- verwachte blockers houden technische health groen;
- technische en onverwachte issueaantallen blijven nul;
- `Stop na journeys` schakelt exact bij de twintigste journey uit;
- de `finally`-cleanup geeft alle actieve testplekken weer vrij.

Geplande runner:

```bash
curl --request POST \
  --header "Authorization: Bearer $CRON_SECRET" \
  https://staging.nxttrack.nl/api/internal/journey-bot/tick
```

## Bekende beperking

De simulation adapter roept bestaande placement scoring aan en respecteert capaciteit, stage en voorkeursdag. Bestaande mutaties voor attendance/progress/graduation zijn server actions met redirects en sessie-auth; de bot schrijft daarom via één afgeschermde service-adapter naar dezelfde domeintabellen en valideert elk resultaat. Externe delivery- en paymentservices worden niet aangeroepen.

GitHub `schedule` is best-effort en kan ticks vertragen. De engine bewaakt daarom zelf `next_run_at`, actieve vensters, locks, daglimieten, actieve limieten, eindtijd en journeybudget. Voor een harde minuutcadans hoort de bestaande beveiligde endpoint uiteindelijk door een VPS/systemd-timer te worden aangeroepen.
