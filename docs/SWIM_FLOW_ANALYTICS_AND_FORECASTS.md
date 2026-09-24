# Zwemschool-flowanalytics en capaciteitsprognoses

Status: geïmplementeerd voor canon v3.0
Formuleversie: `swim_flow_v3.0.0`
Forecastmodel: `capacity_forecast_v3.0.0`

## Productgrens

De rapportages zijn tenantgeïsoleerde beslisondersteuning. Een voorspelling
verplaatst nooit een leerling, boekt geen groep en belooft geen plek. Alleen een
planner kan een tijdelijke capaciteitsreservering aanvragen; een afzonderlijke
review is nodig voordat die reservering capaciteit inneemt. Een inschrijving
blijft daarna een eigen transactioneel gecontroleerde handeling.

Testreizen en Journey Bot-data zijn uitgesloten. Geïmporteerde historie telt
alleen mee wanneer de bron expliciet als historisch volledig is gemarkeerd.
Iedere snapshot bevat de formuleversie, tenanttijdzone, cohortomvang,
bronwatermark en datakwaliteit.

## Autoritatieve gebeurtenissen

`swim_lifecycle_events` is append-only en wordt zowel bij bronmutaties als door
dagelijkse reconciliatie gevuld. De bronrecord, event key, lokale kalenderdatum,
tenanttijdzone, formuleversie, teststatus en journey-run blijven herleidbaar.
Correcties voegen bewijs toe; bestaande eventregels worden niet herschreven.

De huidige eventfamilies zijn:

- wachtlijst gestart en eligibility bereikt;
- bewezen plaatsing;
- programma-inschrijving gestart;
- badje/fase gestart en goedgekeurde doorstroom uitgevoerd;
- diploma uitgegeven;
- capaciteitsopening gerealiseerd.

De reconciliatie is idempotent op `(tenant_id, event_key)`. Projecties lezen
daarnaast de canonieke operationele tabellen om ontbrekende bronhistorie
zichtbaar als datakwaliteitsprobleem te houden.

## Rolling twaalfmaandsmetrics

Alle grenzen worden als tenant-lokale kalenderdatums berekend. Het venster
bevat voltooide gebeurtenissen vanaf exact twaalf kalendermaanden voor de
rapportagedatum tot en met de vorige lokale kalenderdag.

| Metric | Start | Einde | Bijzonderheden |
| --- | --- | --- | --- |
| Wachttijd | De latere van wachtlijststart en `eligible_from` | Bewezen plaatsing | Open wachtenden vervormen de duurstatistiek niet |
| Badjeduur | Eerste actieve assignment van het badje/de fase | Uitgevoerde, vooraf beoordeelde en goedgekeurde doorstroom | Groepswissels binnen dezelfde fase resetten de klok niet |
| Diplomaduur | Oorspronkelijke programma-inschrijving | Eerste canonieke diploma-uitgifte | Fase- en groepswissels binnen dezelfde enrollment resetten de klok niet |

Overlappende pauzes worden samengevoegd en eenmaal afgetrokken. Voor iedere
metric worden `mean`, mediaan, p75, p90, minimum, maximum en cohortomvang
opgeslagen. De UI toont daarnaast:

- ontbrekende eindgebeurtenissen;
- ongeldige datumvolgorde;
- uitgesloten test- en onbetrouwbare importregels;
- uitgesloten pauzedagen;
- volledigheidspercentage;
- maandcohorten en de labels `none`, `small` en `sufficient`.

De dagelijkse runner bewaart zowel een daily snapshot als een idempotente
monthly snapshot. Historische snapshots blijven aan hun eigen formuleversie
gebonden.

## Deterministische capaciteitsforecast

Iedere run heeft een input fingerprint, bronwatermark, horizon van 4, 8 of 12
weken en immutable modelversie. Het model combineert fysieke capaciteit,
bezetting, actieve goedgekeurde soft holds, gedateerde eindes, aantoonbare
doorstroom, historisch verloop en gewogen wachtlijstvraag. Afwezigheid en
no-show worden nooit als verwachte opening gebruikt.

De output bevat:

- conservative, likely en optimistic openings;
- earliest, likely en latest availability;
- confidence label en score;
- expliciete redenen en datakwaliteit;
- bezetting, vraag, soft holds en verwachte knelpunten.

Zonder voldoende historie of gedateerde opening wordt geen datum verzonnen:
de datumrange blijft `null` en de confidence is laag.

## Soft reservations

Een aanvraag heeft een wachtlijstkandidaat, passende actieve groep,
capaciteitsbucket, gewicht, expiry, reden en idempotency key. De server
controleert:

1. `forecast.hold.manage` in de ingelogde tenantcontext;
2. programma- en badjematch;
3. `regular`, `flex` of `trial` als afzonderlijke bucket;
4. fysieke hard capacity en het goedgekeurde leenbeleid;
5. een looptijd van 2 tot en met 168 uur;
6. idempotentie en audit.

Een aanvraag start als `pending_approval` en telt nog niet mee. Goedkeuring
herhaalt de capaciteitscontrole onder locks. Alleen `approved` telt tegen
capaciteit. Release en expiry zijn auditbaar en verwijderen geen historie.

## Accuracy en beheer

Na afloop van een horizon vergelijkt de runner de voorspelde band met de eerste
gerealiseerde opening. Het bewaart absolute fout in dagen, of de opening binnen
de band viel, bewijs-event-IDs en een expliciete `no_opening` of
`insufficient_evidence` uitkomst. Accuracy blijft per modelversie vergelijkbaar.

Beheerroutes:

- `/admin/rapportages/groei`: definities, statistiek, cohort en datakwaliteit;
- `/admin/rapportages/capaciteit`: scenario’s, ranges, confidence, accuracy en
  de reviewbare soft-holdflow.

## Dagelijkse operatie

Workflow `.github/workflows/swim-analytics-projections.yml` start dagelijks om
04:45 UTC voor staging en productie. De job doet niets zolang
`INTERNAL_JOBS_ENABLED` niet exact `true` is. Het endpoint
`POST /api/internal/analytics/swim/refresh` vereist een `CRON_SECRET` van
minimaal 32 tekens en voert per actieve tenant achtereenvolgens uit:

1. lifecycle-reconciliatie;
2. daily/monthly flow snapshots;
3. 4-, 8- en 12-weeks forecast runs;
4. accuracy-reconciliatie;
5. expiry van soft reservations.

Een tenantfout wordt per tenant gerapporteerd en maakt de workflow rood. De
runner hergebruikt dezelfde inputfingerprint en maakt dus geen dubbele run.

## Verificatie en herstel

Lokale contract- en databasegates:

```sh
pnpm run test:swim-canon
pnpm run test:predictive-operations
pnpm run test:swim-canon:db
pnpm run db:rls-audit
```

Rollback van de productfeature gebeurt via de bestaande tenantrollout en
`INTERNAL_JOBS_ENABLED=false`; bestaande events, snapshots en accuracybewijs
blijven behouden. Een schema-rollback verwijdert deze bewijsdata niet
automatisch. Bij een formulewijziging wordt een nieuwe versie toegevoegd en
worden oude snapshots niet overschreven.
