# NXTTRACK Android

NXTTRACK levert twee afzonderlijke, volledig native Android-apps:

| App | Package | Doelgroep |
| --- | --- | --- |
| Instructeur | `nl.nxttrack.instructor` | instructeurs en bevoegde beheerders |
| Ouderportaal | `nl.nxttrack.parent` | ouders/verzorgers |

De apps gebruiken Kotlin, Jetpack Compose, Material 3 en AndroidX. Er is geen
`WebView`, gekopieerde demo-HTML of parallel designsystem. Beide apps gebruiken
dezelfde server-side domeinregels, permissions, RLS en transactionele commands
als het webplatform.

## Modules

- `core:domain`: versiegebonden mobiele contracten, 1–5-scorecontract,
  progressringselectie en gedeelde modellen.
- `core:data`: HTTPS-client, tokenrefresh, versleutelde sessie- en
  snapshotopslag, SQLite-commandqueue en WorkManager-sync.
- `core:design`: gedeelde portalshell, semantic tokens, zes theme recipes,
  scoreprimitives, progressringen en responsieve badgegrid.
- `instructor-app`: vandaag, agenda, groepen, leerlingen, lesregistratie,
  beoordelingen, inbox, taken, documenten en profiel.
- `parent-app`: overzicht, planning, Live Zwemreis, badges, media, diploma's,
  inbox, betalingen, documenten, feedback, gezinstoegang en profiel.

## Autoritatief contract

De Android-clients praten uitsluitend met het versiegebonden contract onder
`/api/native/v1`:

- `POST /auth/sign-in`
- `POST /auth/refresh`
- `POST /auth/sign-out`
- `GET /bootstrap`
- `POST /commands`

Bestanden worden via de bestaande beveiligde `/api/files/*`-routes geladen.
Bearer-authenticatie wordt daar aan dezelfde actor-, tenant-, eigenaar- en
permissioncontroles onderworpen als cookie-authenticatie.

Muterende clients sturen een UUID `commandId` en stabiele `deviceId`. De server
controleert actor, tenant, rol, objecteigendom, payload en idempotency opnieuw in
PostgreSQL. De lokale queue bewaart opdrachten bij tijdelijk netwerkverlies en
verwijdert ze pas na een geaccepteerde of reeds verwerkte command.

Ondersteunde commands:

- definitieve beoordeling, inclusief correctieketen;
- aanwezigheid;
- lesafmelding;
- reactie op afzwemuitnodiging;
- notificatie gelezen;
- menselijk bevestigde inboxreactie;
- menselijk bevestigde mediatoestemming;
- menselijk bevestigde feedback.

## Canonieke presentatie

- Beoordelingen zijn `1 | 2 | 3 | 4 | 5 | null`.
- Smileys of sterren zijn invoer voor exact vijf discrete scores.
- Productprogressie gebruikt `rating / 5`.
- `(rating - 1) / 4` bestaat alleen als
  `legacy_normalized_assessment_score_v1`.
- De ouderapp toont één badjering plus één diplomaring als er een afzonderlijk
  huidig badje is; anders alleen de diplomaring.
- De badgewall toont exact twee kolommen op mobiele breedte en exact vier op
  tablet/desktopbreedte.
- Surprise badges komen niet in niet-verdiende payloads of tellingen voor.
- Earned badges delen afbeelding en tekst via de Android Sharesheet; de app
  belooft geen publicatie bij een specifieke provider.

De zes ouderportaalthemes worden als immutable `3.0.0` native themebundles
geladen. Elke bundle moet schema 3, `parent-portal/1.2`, de gedeelde shell,
alle dertien routes en alle page recipes bevatten voordat de client hem
accepteert. Een onbekende of onvolledige bundle valt dicht naar de meegeleverde
NXTTRACK Default 3.0.0-bundle.

## Offline en beveiliging

- alleen HTTPS voor releasebuilds; cleartextverkeer is geblokkeerd;
- sessietokens en gecachete payloads zijn met Android Keystore-backed
  `EncryptedSharedPreferences` versleuteld;
- pending commands staan in app-private SQLite-opslag;
- onverwachte `401` triggert één tokenrefresh en retry;
- definitief onbevoegde requests wissen de sessie, niet de pending queue;
- sign-out wist sessie, snapshot en gedownloade documentcache;
- downloads worden via app-private cache en `FileProvider` geopend of gedeeld;
- media-, diploma-, factuur- en documenttoegang wordt bij elke download opnieuw
  server-side geautoriseerd;
- notificatie- en commandretries zijn idempotent.

## Lokaal bouwen

Vereisten:

- JDK 17;
- Android SDK Platform 37 en Build Tools 37.0.0;
- een bereikbare HTTPS NXTTRACK API-origin.

```bash
cd apps/android
./gradlew --no-daemon qualityGate \
  -PNXTTRACK_API_BASE_URL=https://staging.example.nl
```

Debug-APK's en releasebundles:

```bash
./gradlew --no-daemon \
  :instructor-app:assembleDebug \
  :parent-app:assembleDebug \
  :instructor-app:bundleRelease \
  :parent-app:bundleRelease \
  -PNXTTRACK_API_BASE_URL=https://staging.example.nl
```

Instrumentatietests compileren:

```bash
./gradlew --no-daemon \
  :core:data:assembleDebugAndroidTest \
  :core:design:assembleDebugAndroidTest \
  :instructor-app:assembleDebugAndroidTest \
  :parent-app:assembleDebugAndroidTest
```

`VisualEvidenceTest` rendert uitsluitend in de instrumentation test-APK vaste,
synthetische states van de echte productiecomposables. De fixturedata wordt niet
in een release-APK/AAB verpakt.

De rootcommando's `pnpm android:quality` en `pnpm android:build` bieden dezelfde
gates. Release signing wordt alleen geactiveerd wanneer alle vier app-specifieke
`NXTTRACK_<APP>_UPLOAD_*` Gradle-properties aanwezig zijn.

## Distributie

`.github/workflows/android-ci.yml` valideert contracts, lint, unit tests en
builds. `.github/workflows/android-play.yml` kan vanaf `main`, na een expliciete
bevestiging en goedkeuring van de protected environment, beide apps als signed
AAB naar uitsluitend de Google Play internal track sturen.

Zie [ANDROID_PLAY_DELIVERY_RUNBOOK.md](../../docs/ANDROID_PLAY_DELIVERY_RUNBOOK.md)
voor de eenmalige Play Console- en GitHub-inrichting, sleutelbeheer, upload,
bewijs en rollback.
