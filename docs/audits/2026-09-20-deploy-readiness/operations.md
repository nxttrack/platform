# Operationele voorbereiding

20 september 2026. De applicatieservice, actieve releasesymlink en database
worden in deze voorbereidingsronde niet gedeployed of gemigreerd.

## Bestaande omgeving werkelijk gecontroleerd

De read-only hostaudit controleert per omgeving: onderhoudsmodus uit, interne
jobs aan, systemd actief/enabled, cron actief, immutable releaseartifact gelijk
aan de actieve configuratie, publieke HTTPS-health met dezelfde SHA en de juiste
omgeving, database en schema geslaagd, precies één workerschedule en één
back-upschedule, succesvolle workers binnen vijf minuten, private backupsleutel
en een volledige versleutelde back-up van minder dan 36 uur oud.

De nachtelijke back-ups van 20 september bestonden daadwerkelijk: productie
02:17 UTC met zeven buckets en nul objecten; staging 02:37 UTC met zeven buckets
en 43 objecten. De initiële audit faalde terecht op één nieuw gecontroleerd punt:
de bestaande sleutels waren slechts negen bytes lang, hoewel hun bestandsrechten
correct 0600 waren. Dit is gerepareerd in
[run 35505059974](https://github.com/nxttrack/platform/actions/runs/35505059974):
beide omgevingen hebben nu afzonderlijke secrets uit 48 willekeurige bytes,
bewaard als één regel van 64 base64-tekens. Historische archieven zijn met hun
oude sleutel herstelbaar gebleven; de versleutelde sleutelbundels zijn als
negentigdaags GitHub-artifact opgeslagen. Nieuwe volledige back-ups zijn met de
nieuwe sleutels gemaakt en door decryptie en bytevergelijking gecontroleerd.
Daarna slaagden alle twaalf operationele controles in beide omgevingen. Zie de
[stagingcontrole](evidence/runtime-operations-staging.json) en
[productiecontrole](evidence/runtime-operations-production.json).

## Canonical workers en back-ups

De vorige operationele installatie kwam uit een tijdelijke deploymentbranch.
De volgende normale deployment gebruikt nu `install-runtime-operations.mjs`:

- De bronbestanden krijgen een SHA-256-inhoudsversie in
  `shared/operations-v4/versions/<digest>`; een atomische pointer selecteert de
  actuele versie. Dependencies volgen de actieve applicatierelease.
- Vóór activatie controleert de installer de huidige én kandidaatconfiguratie,
  cron, tooling en de overeenkomst met de behouden backupsleutel.
- Eén hostbrede `flock` serialiseert cronwijzigingen tussen beide omgevingen.
  Alleen de twee tags van de betreffende omgeving worden vervangen. Drift en
  mislukte installatie leiden tot herstel met behoud van andere cronregels.
- De worker leest de actuele configuratie per tick, respecteert onderhoud en
  uitgeschakelde capabilities, gebruikt timeouts en verwerkt alle verschuldigde
  jobs ook wanneer één route faalt. Logs bevatten geen authenticatiemateriaal.
- De dagelijkse back-up forceert alle zeven buckets zonder prefix, valideert
  omgeving/project en volledigheid, versleutelt en vergelijkt de gedecrypteerde
  bytes. Tijdelijke plaintext wordt ook op foutpaden opgeruimd. De heartbeat wordt
  pas daarna als geslaagd gepubliceerd.

Deze versie-installatie is onderdeel van de eerstvolgende deployment. De
bestaande croninstallatie blijft tijdens deze voorbereiding draaien. Het
onmiddellijke sleutelherstel gebruikt dezelfde back-uplock en verandert geen
applicatieconfiguratie of cronplanning.

## Herstelbare sleutelvervanging en retentie

Staging en productie krijgen afzonderlijke, cryptografisch willekeurige
backupsecrets. Bestaande lokale archieven worden niet destructief herschreven.
De oude sleutel blijft privé beschikbaar in de sleutelgeschiedenis; een met de
nieuwe sleutel versleutelde herstelbundel wordt daarnaast buiten de VPS bewaard.
Daardoor blijven ook eerder opgeslagen GitHub-artifacts leesbaar. Nieuwe
volledige back-ups worden met de nieuwe sleutel gemaakt en gedecrypteerd
geverifieerd voordat het herstel als geslaagd geldt.

De daadwerkelijke retenties verschillen:

| Bewijs | Retentie |
|---|---:|
| Dagelijkse versleutelde Storage-back-ups op de VPS | 14 dagen |
| GitHub Storage-backupworkflow: ciphertext, samenvatting en verificatiebewijs | 30 dagen |
| Databasebackup van vóór de oorspronkelijke V4-upgrade | 90 dagen |
| Versleutelde sleutelgeschiedenis voor historische backups | 90 dagen in het herstelartifact; private kopie op de VPS |
| Read-only runtime-readinessrapporten | 30 dagen |

De eerdere algemene formulering dat Storage-artifacts negentig dagen bewaard
worden was onjuist. De reguliere Storageworkflow gebruikt dertig dagen. Een
provideracceptatie of lokale export alleen is geen bewijs van een behouden
back-up: de handmatige workflow publiceert de succesheartbeat pas nadat ook
artifact-ID, digest en het ongewijzigde lokale verificatiebewijs aanwezig zijn.

## Verificatie

Gedragstests behandelen cronisolatie en herstel, configuratiedrift, workers,
complete exports, encryptiefouten, plaintextcleanup, artifactbewijs en echte
tar/GPG-encryptie/decryptie. De sleutelrotatietests controleren tevens behoud
van historische archieven en herhaalbaarheid. De bestaande brede unit- en
browser-CI blijft van toepassing; deze gerichte tests vervangen die niet.

De nieuwe handmatige workflow `Deployment readiness` produceert per omgeving
een klein JSON-rapport zonder sleutels, objectpaden, gebruikers of configuratie-
inhoud. Zij kan later opnieuw worden gebruikt om dezelfde operationele
voorwaarden te controleren.
