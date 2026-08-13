# NXTTRACK Zwemschoolcanon v3 — implementatie- en acceptatierapport

Status: implementatie en lokale eindgates compleet. Er is niet gepusht,
gedeployed of naar Google Play geüpload.

## Samenvatting per fase

| Fase | Resultaat |
| --- | --- |
| I1 Fundament | versiegebonden swim-domain, tenantrollouts, permissions, auditcontext, RLS, outbox/idempotency |
| I2 Curriculum | persistente wizard, coverage/impact/diff, immutable publicatie en expliciete curriculummigratie |
| I3 Progressie | canonieke 1–5/null-observaties, correctieketen, projections en gescheiden product-/legacymetrics |
| I4 Carryover/badges | referentiële carryover, twee aparte bulkcommands, immutable badgeversies, award batches en één verzamelnotificatie |
| I5 Ouderportaal/share | twee ringsoorten, vijf-theme viewmodels, 2/4-badgewall, multibadgeviering en capability-aware sharing |
| I6 Planning | gestructureerde masterdata, groepwizard, capaciteitbuckets, occurrence/conflict-engine en racebescherming |
| I7 Vakantie/billing | non-destructive exceptions, tijdelijke offerings, seat holds, invoice/VAT/creditnota en definitieve-documentbescherming |
| I8 Analytics | immutable lifecycle-events, rolling snapshots, cohorts/datakwaliteit, deterministische forecast en soft reservations |
| I9 Android | volledig native instructeur- en ouderapp, encrypted offline queue/cache, vijf themes en beveiligde downloads |
| I10 Delivery | pinned GitHub Actions, signed AAB's, provenance en protected internal-track upload voor beide apps |

## Architectuur en eigenaarschap

```text
Web / Android Compose
        │
        ├── server actions en /api/native/v1
        │       │
        │       ├── actor + tenant + permission guards
        │       ├── domeinservices en provideradapters
        │       └── transactionele PostgreSQL RPC's
        │
        ├── Supabase/PostgreSQL
        │       ├── tenant-safe foreign keys + FORCE RLS
        │       ├── immutable versions/events/document snapshots
        │       ├── idempotente commandrecords + audit events
        │       └── projections/snapshots/reconciliation
        │
        └── workers/providers
                ├── notification outbox
                ├── Mollie/webhooks/collection
                ├── analytics refresh/expiry
                └── Google Play internal via GitHub Actions
```

Het bestaande Next.js-platform blijft eigenaar van admin- en webportaalroutes.
`packages/swim-domain` bevat pure reken- en permissioncontracten.
`apps/web/lib/domain` orkestreert server-side use cases. PostgreSQL is
autoritatief voor permissions, stateovergangen, idempotency en concurrency.
`apps/android` is een native client op hetzelfde contract; het bevat geen
beslislogica die serverregels kan omzeilen.

## Datamodel en migrations

De implementatie is additief opgebouwd in deze volgorde:

1. `20260802120000_swim_school_canon_foundation.sql`
2. `20260802130000_canonical_assessments_and_progress.sql`
3. `20260802140000_versioned_badge_batches.sql`
4. `20260802150000_curriculum_wizard_and_migrations.sql`
5. `20260802160000_swim_progress_command_api.sql`
6. `20260802170000_transition_carryover_commands.sql`
7. `20260802180000_badge_share_capability_events.sql`
8. `20260802190000_structured_group_planning.sql`
9. `20260802200000_immutable_billing_documents.sql`
10. `20260802210000_holidays_and_paid_offerings.sql`
11. `20260802220000_rolling_analytics_and_capacity_forecasts.sql`
12. `20260802230000_native_mobile_commands.sql`

Kernbesluiten:

- gepubliceerde curricula, badgecatalogusreleases, rules, assets en definitieve
  factuur/creditnotasnapshots zijn immutable;
- tenant-id maakt deel uit van nieuwe relaties, uniqueness en lookupindexen;
- FORCE RLS geldt voor de nieuwe tenanttabellen; mutaties lopen via
  actor-gebonden RPC's;
- lifecycle-events zijn append-only; projections en snapshots zijn
  reconcilieerbaar;
- curriculumitemidentities blijven stabiel over versies en carryover verwijst
  naar het originele item;
- capacity gebruikt afzonderlijke `regular`, `flex` en `trial` buckets onder
  een harde fysieke limiet;
- schedule exceptions annuleren/materialiseren historie, maar verwijderen haar
  niet;
- definitieve financiële documenten bewaren een render snapshot en worden niet
  herschreven.

Omdat staging op beheeraccounts na resetbaar is en production leeg is, is geen
destructieve legacybackfill nodig. De rollout blijft desondanks
expand-contract: migrations toepassen, tenantfeature in `shadow`, parity en
smoke controleren, daarna `pilot`/`enabled`. Rollback is featureflag/pauze plus
forward-fix; immutable historie wordt niet teruggeschreven. Bestaande
curriculumtoewijzingen migreren alleen via preview, goedkeuring en een
idempotente execute-command.

## Rekencontract en progressringen

| Berekening | Contract |
| --- | --- |
| beoordeling | integer `1..5` of `null`; alleen `null` is Nog niet beoordeeld |
| itemprogressie | `rating / 5` |
| legacy analyse | `(rating - 1) / 4`, alleen `legacy_normalized_assessment_score_v1` |
| aggregatie | gewogen of ongewogen som op uitsluitend bijdragende, vereiste items |
| coverage | beoordeelde vereiste items / alle vereiste items |
| precision | ongerond op server; afronding alleen in presentatie |
| badjering | actuele stage/badjeprojection |
| diplomaring | totale versiegebonden diplomareis |

Voorbeeld: één item met score `5` van zes gelijk gewogen vereiste items draagt
`1 / 6 = 0,166666…` bij en wordt als `16,7%` getoond. Het is niet `20%` en
gebruikt nooit legacy-normalisatie. Doorstroomgeschiktheid, goedgekeurde
doorstroom, afzwemcontrole, afzwemgereedheid en diploma-uitgifte zijn aparte
states. Geen percentage of voorspelling voert een overgang uit.

De zichtregel is:

- afzonderlijk huidig badje: badjering + diplomaring;
- één badje dat tegelijk de volledige diplomareis is: alleen diplomaring;
- het ouderdashboard mag beide ringen tonen volgens dezelfde server-viewmodel.

## Acceptatiematrix

| Canonregel | Status | Bewijs |
| --- | --- | --- |
| 1–5 of null, null exclusief onbeoordeeld | gereed | `assessment.ts`, DB-checks, web/native tests |
| smileys/sterren exact vijfpuntsscore | gereed | trainer UI, native `FivePointAssessment`, Compose test |
| progressbar alleen discrete/read-only vijfstap | gereed | gedeelde scoreprimitives |
| product `rating/5`, legacy anders genoemd | gereed | `progress.ts`, projectionformule en unit tests |
| immutable curriculum/rules/badge-assets | gereed | publication triggers en immutable release-tabellen |
| bestaande leerling blijft op curriculumversie | gereed | assignment + preview/approve/execute migration |
| alle doorstroom-/afzwem-/diplomastates apart | gereed | transition/graduation reviewmodellen en commands |
| geen automatische move/diploma door percentage | gereed | permissiongebonden review-RPC's |
| carryover dupliceert geen curriculumitem | gereed | identity/reference constraints en integratietest |
| twee aparte bulkcommands | gereed | transition completion en remaining-badge services |
| bulkcommands previewbaar/idempotent/auditbaar | gereed | commandrecords, previews en SQL-integratietests |
| één notificatie per multibadgebatch | gereed | award batch/outbox uniqueness en retrytest |
| surprise nergens zichtbaar vóór award | gereed | serverselectie, parent/native payload- en schema-tests |
| badgewall exact 2/4 en categoriecontainers | gereed | web CSS/React en native responsive gridtests |
| iedere earned badge afzonderlijk deelbaar | gereed | share action en badgekeuze in multiviering |
| share alleen echte capability | gereed | capabilitymatrix, Web Share/Android Sharesheet/fallbacks |
| geen volgende-badgevoorspelling | gereed | parent/native viewmodels exposen geen candidate |
| groepen uitsluitend structured masterdata | gereed | resource/site/template/instructor-FK's en wizard |
| regular/flex/trial apart onder hard cap | gereed | bucketconstraints en transactionele booking checks |
| conflict live adviserend + transactioneel | gereed | evaluate/publish RPC en concurrencytest |
| vakantie verwijdert geen historie | gereed | occurrence exceptions en undo/auditflow |
| definitieve factuur nooit herschreven | gereed | immutable snapshottrigger; credit/refund/adjustment |
| rolling 12 maanden tenant/formule/kwaliteit | gereed | lifecycle/snapshotmodel en dashboardqueries |
| gender alleen expliciete badge-eligibility | gereed | enum/audience engine; geen invoer in andere formules |
| bestaande shell/routes/tokens/vijf themes | gereed | bestaande IA uitgebreid, native contract uit export |
| autoritatieve checks server-side | gereed | guards, RLS, RPC's en integration tests |
| geen tenant-JS/SQL/HTML/CSS rule engine | gereed | typed declaratieve policies/rules/render contracts |
| curriculumwizard persistent en gevalideerd | gereed | draft revisions, coverage/impact/diff/publication E2E-contract |
| correction chain en laatste definitieve observatie | gereed | immutable observations + correction constraints |
| scoreverlaging herberekent projectie | gereed | projection refresh integration test |
| offline/retry is idempotent | gereed | native queue + command UUID + DB uniqueness |
| transition review zonder automatische move | gereed | preview/approve/execute boundaries |
| Badge Studio versioned/non-destructive | gereed | structured assetcontract en immutable releases |
| badge taxonomy/family/collection/audience | gereed | versioned definitions en tenant overrides |
| message suggestions en tenantoverride | gereed | badge message templates/settings |
| revocation zonder vernietiging historie | gereed | award status/revocation audit |
| media/share privacy en consent | gereed | signed file access, consent RPC, child-safe captions |
| share-events alleen betrouwbaar/zonder PII | gereed | capability event contract; geen fake completion |
| locaties/resources/tijden/instructeurs structured | gereed | planning masterdata en FK's |
| instructor availability/qualification | gereed | publication conflictclassificatie |
| recurrence in tenanttijdzone/DST | gereed | occurrence materialisatie en DST-tests |
| twee gelijktijdige admins veilig | gereed | locks/constraints en concurrency harness |
| tijdelijke vakantie-/turboaanbiedingen | gereed | group offering core en admin/parent routes |
| gratis/per-les/pakket/direct/periodiek | gereed | pricing policy + bestaande Mollie/SEPA-kern |
| seat hold vóór betaling/enrollment | gereed | expirerende holds, webhook/idempotency |
| out-of-order webhook en retry | gereed | bestaande Mollie eventledger + contracttests |
| invoice, VAT, creditnota | gereed | tenantprofiel, 21% default, PDF snapshots en adjustments |
| logo/bedrijfsgegevens in document | gereed | tenant billing identity en PDF renderer |
| lifecycle-events en reconciliation | gereed | append-only eventlog + reconcile job |
| wacht/doorstroom/diplomaduur exact | gereed | rolling flow metricdefinitions |
| cohort mean/median/p75/p90 | gereed | tenantlokale reports en unit/SQL-tests |
| deterministic earliest/likely/latest | gereed | capacity modelversion, reasons en confidence |
| soft reservation + expiry + approval | gereed | reservation RPC's/jobs/audit |
| forecast accuracy | gereed | actual/reconciled accuracy records |
| native instructeur Android | gereed | `apps/android/instructor-app` |
| native ouder Android met vijf themes | gereed | `apps/android/parent-app`, theme contracttest |
| GitHub naar Play voor beide apps | gereed, extern te activeren | protected internal-track workflow en runbook |

## Permissions, RLS, audit en privacy

De swim-permissions onderscheiden platform-admin, tenant-admin, coordinator,
instructor en guardian. Nieuwe kernpermissions omvatten curriculumbeheer,
assessment, transition review, graduation review, badgebeheer/award,
planningpublicatie, billing, analytics en `attendance.record`.

Elke servermutatie:

1. valideert een geauthenticeerde actor;
2. bepaalt één actieve tenant;
3. valideert rol/permission;
4. valideert tenantgebonden objectrelaties;
5. schrijft transactioneel commandresultaat en auditcontext;
6. gebruikt een unique idempotency key;
7. leunt aanvullend op FORCE RLS.

Surprise badges worden vóór award niet geladen in parent/native payloads.
Signed/private downloads controleren eigenaar en geldigheid op requesttijd.
Android bewaart tokens/snapshots versleuteld en files app-private. Media consent
is beleidversiegebonden en expliciet bevestigd. Feedbacktekst wordt
geclassificeerd; restricted content wordt geweigerd. Sharecaptions bevatten
geen interne score-, groep-, tenant- of forecastmetadata.

## Badges en sharing

Awarding gebruikt stabiele keys, immutable definitionreleases, gestructureerde
triggers en batches. Een assessment kan progressie en meerdere awards
veroorzaken, maar de outbox maakt precies één verzamelnotificatie per batch.
Retry en correctie maken geen dubbele awards of meldingen.

Capabilitymatrix:

| Kanaal | Web | Android | Betrouwbare completion |
| --- | --- | --- | --- |
| system/native | runtime Web Share met file/text | Android Sharesheet met image/text | alleen start/fallback |
| WhatsApp | Web Share/copy/download | Sharesheet; provider verschijnt alleen indien ondersteund | nee |
| X | officiële Web Intent voor tekst; afbeelding via download/share | Sharesheet | nee |
| Facebook | Web Share/copy/download | Sharesheet | nee |
| Instagram | download/copy; geen claim voor persoonlijk-accountpublishing | Sharesheet | nee |
| TikTok | download/copy; geen Direct Post zonder OAuth/audit | Sharesheet | nee |
| Snapchat | download/copy; geen Creative Kit-claim zonder review | Sharesheet | nee |

De Android Sharesheet is het platformcontract voor tekst/bestanden:
[Android sharing](https://developer.android.com/training/sharing). De actuele
primaire documentatie bevestigt dat [X Web Intents](https://docs.x.com/x-for-websites/web-intents/overview)
een door de gebruiker bevestigde composer openen, dat TikTok Direct Post
[OAuth, `video.publish`, expliciete consent en audit](https://developers.tiktok.com/doc/content-posting-api-get-started//)
vereist en dat Snapchat Creative Kit naar een
[camera-/previewflow](https://developers.snap.com/snap-kit/creative-kit/overview)
delegeert. Instagram Content Publishing is geen universele persoonlijke
sharecapability maar een professionele-accountflow. Provider-SDK of Direct Post
wordt daarom pas toegevoegd na providerreview, scopes, consent, privacyreview
en een afzonderlijk productbesluit. De huidige UI claimt geen
story/feedpublicatie en logt geen onbevestigbare completion.

## Planning, vakantie en billing

De groepwizard hergebruikt de bestaande adminshell en maakt alleen echte
masterdata aan. Live conflictadvies en transactionele publicatie controleren
resourcehiërarchie, openingstijden, closures, instructor availability,
kwalificaties, lestijd en fysieke/bucketcapaciteit opnieuw.

Vakantiepublicatie toont impact en financiële voorstellen vooraf, schrijft
non-destructive exceptions en ondersteunt gecontroleerde undo. Tijdelijke
offerings delen group/curriculum/planning, gebruiken expirerende seat holds en
maken enrollment pas na de toepasselijke gratis/betaalde bevestiging definitief.

Tenantprofiel bevat wettelijke naam, adres, registratie/VAT-gegevens,
betaalinformatie, logo en standaard VAT; `21%` is default. Invoice en creditnota
worden als nette PDF uit een immutable snapshot gerenderd. Een correctie op een
definitief document maakt een credit/refund/adjustment en herschrijft het
origineel niet.

De Mollie-adapter volgt de actuele officiële capabilitygrens:

| Capability | Geïmplementeerd contract |
| --- | --- |
| eenmalige betaling | Payments API, hosted checkout en server-side metadata-/bedragcontrole |
| status/webhook | classic webhook-ID wordt opgehaald bij Mollie en pas daarna verwerkt; duplicate en out-of-order events zijn idempotent |
| periodiek/incasso | customer + geldig mandate + expliciete consent/pre-notificatie vóór collection |
| refund | payment-refund met eigen idempotency, statusledger en credit/adjustmentkoppeling |
| factuur/VAT/creditnota | NXTTRACK is de fiscale documentbron; Mollie verwerkt betaling/refund en herschrijft geen tenantfactuur |

Dit sluit aan op Mollies actuele
[Payments API](https://docs.mollie.com/reference/payments-api),
[webhookadvies](https://docs.mollie.com/reference/webhooks),
[Mandates API](https://docs.mollie.com/reference/mandates-api) en
[Refunds API](https://docs.mollie.com/reference/refunds-api). Next-gen signed
webhooks zijn een afzonderlijke providerupgrade; de huidige classic flow is
veilig omdat de ontvangen ID nooit autoritatief is en de actuele resource met
een servercredential wordt opgehaald.

## Analytics en forecast

Autoritatieve lifecycle-events voeden daily/monthly snapshots op tenantlokale
kalendergrenzen. Rolling twaalf maanden is formuleversiegebonden en toont
cohortomvang, bronperiode, exclusions en datakwaliteit. Flowreports leveren
gemiddelde, mediaan, p75 en p90.

De capacity forecast is deterministisch en versiegebonden. Resultaten bevatten
earliest/likely/latest, confidence score/label, redenen, quality en bronfingerprint.
Geen forecast verplaatst een leerling. Soft reservations verlopen en worden pas
na plannerreview effectief; accuracy vergelijkt voorspelling met gereconcilieerde
actuals.

## Native status

Android ondersteunt API 26–37, target/compile 37, JDK 17 en release shrinking.
De apps zijn volledig Compose-native. Parent gebruikt dezelfde vijf
themebundles en Pearl Frame-invarianten als het webcontract. WorkManager
verwerkt offline commands; tokenrefresh en commandretry behouden
idempotency. Instrumentation-APK's voor secure storage, vijfpuntsscore,
themecontract en badgegrid worden in CI gebouwd.

Apple is conform opdracht uitgesteld. De gedeelde servercontracten zijn
clientneutraal, maar er is geen iOS-binary of App Store-workflow opgeleverd.

## Test- en opleverbewijs

Definitieve lokale gate:

```bash
pnpm lint
pnpm typecheck
pnpm test:swim-canon
pnpm test:swim-canon:db
pnpm test:planning:concurrency
pnpm test:portal-themes
pnpm test:billing-contract
pnpm db:audit
pnpm db:rls-audit
pnpm auth:audit
pnpm security:audit-dependencies
pnpm build

cd apps/android
./gradlew --no-daemon qualityGate
./gradlew --no-daemon \
  :instructor-app:assembleDebug \
  :parent-app:assembleDebug \
  :core:data:assembleDebugAndroidTest \
  :core:design:assembleDebugAndroidTest \
  :instructor-app:assembleDebugAndroidTest \
  :parent-app:assembleDebugAndroidTest \
  :instructor-app:bundleRelease \
  :parent-app:bundleRelease
```

Resultaten van de definitieve run:

| Gate | Exact resultaat |
| --- | --- |
| lint + typecheck | beide PASS |
| swim-canon unit | 49/49 PASS |
| vijf-theme contract | 20/20 PASS |
| billingcontract | 23/23 PASS |
| DB-integratie | PASS voor progress, badges, curriculum, carryover, planning, billing, vakanties, analytics, forecast en native commands |
| planning concurrency | PASS: twee admins, één geserialiseerde publicatie en één transactioneel conflict |
| migration audit | 129 migrations gecontroleerd |
| RLS audit | 239 publieke tabellen gecontroleerd; alleen verwachte waarschuwingen voor niet aan `authenticated` gegunde private helpers |
| auth audit | route- en boundary-audit PASS; 3/3 invitationtests PASS |
| production dependency audit | geen bekende high/critical kwetsbaarheden |
| Next.js production build | PASS, inclusief alle `/api/native/v1`-routes |
| Android JVM | 6/6 tests PASS |
| Android device | API 30 software-emulator: secure storage 1/1, vijfpuntsscore 1/1, instructeur 1/1, ouder/vijf themes 2/2 PASS |
| Android volledige gate | 497 taken; 221 uitgevoerd, 33 cache, 243 up-to-date; BUILD SUCCESSFUL |
| releasebundles | instructeur 3.736.421 bytes, SHA-256 `9a6217dd7ad0faba40057e1d68f3a9bf43adb8a72ee60271d7fe26807ff95a78`; ouder 3.867.789 bytes, SHA-256 `e5ade73a5e46ae8b25b555209df0e69a225da2fd9c08b566a2b4e2b7e2d550d4` |
| bron/workflows | `git diff --check` en YAML-parse PASS |

De lokale AAB's zijn bewust unsigned; de protected Play-workflow bouwt opnieuw
met per app gescheiden uploadkeys en weigert een unsigned artifact.

Visueel devicebewijs uit de echte productiecomposables, met fixturedata die
uitsluitend in `androidTest` is opgenomen:

- [ouder — overzicht en beide ringen](evidence/swim-canon-v3/android/parent-overview.png)
- [ouder — Live Zwemreis](evidence/swim-canon-v3/android/parent-progress.png)
- [ouder — 2-koloms badgewall](evidence/swim-canon-v3/android/parent-badges.png)
- [ouder — factuur, 21% VAT en creditnotaflow](evidence/swim-canon-v3/android/parent-payments.png)
- [ouder — besloten media en consent](evidence/swim-canon-v3/android/parent-media.png)
- [instructeur — lesregistratie](evidence/swim-canon-v3/android/instructor-session.png)
- [instructeur — leerling, ringen en vijfpuntsscore](evidence/swim-canon-v3/android/instructor-learner.png)

Er waren geen rode bestaande baselinegates. De host heeft geen KVM; daarom zijn
dezelfde gebouwde instrumentation-APK's rechtstreeks met AndroidJUnitRunner op
de software-emulator uitgevoerd nadat Gradles device-propertyprobe te traag
bleek. Dit verandert de uitgevoerde tests niet.

Authenticated desktop-screenshots, staging-smokes, echte TalkBack/200%-zoom en
Play pre-launch reports zijn omgevingschecks: daarvoor ontbreken in deze
workspace stagingaccounts respectievelijk Play Console-inrichting. De webbuild,
routecontracten en 5 × 13 themecontracten zijn wel lokaal groen. Deze checks
blijven vóór rollout verplicht en zijn geen stil als gereed gemarkeerde
testresultaten.

## Gewijzigde bestanden per module

- database: migrations `20260802120000` tot en met `20260802230000`, SQL-gates
  en concurrencyharness;
- domein: `packages/swim-domain` voor formules, ringselectie en permissions;
- server: `apps/web/lib/domain`, authcontext, private fileguards,
  serveractions/jobs en `/api/native/v1`;
- web-UI: bestaande admin-, instructeur- en ouderroutes plus bestaande
  primitives/theme recipes; geen tweede shell of designsystem;
- Android: `apps/android/core/{domain,data,design}`,
  `apps/android/instructor-app` en `apps/android/parent-app`;
- delivery: `.github/workflows/ci.yml`, `android-ci.yml` en
  `android-play.yml`;
- bewijs/documentatie: contract-/integratietests, Android runbook, dit rapport
  en zeven devicebeelden.

## Rollout en fallback

1. staging resetten met behoud van platform- en organisatiebeheerders;
2. migrations in volgorde toepassen en audits draaien;
3. masterdata/curriculum/badge-assets publiceren;
4. feature per tenant in `shadow`, projections reconciliëren en parity meten;
5. web plus beide Android-apps met testaccounts valideren;
6. tenant naar `pilot`, daarna `enabled`;
7. signed bundles via protected workflow naar internal testers;
8. pas na aparte toestemming een productie-/Play-promotiebesluit nemen.

Fallback: rollout `paused`, write commands blokkeren, bestaande immutable
versies leesbaar houden, jobs stoppen en forward-fix uitvoeren. Databasehistorie
en definitieve financiële documenten worden niet verwijderd of herschreven.

## Commits

Reeds gerealiseerde verticale commits:

1. `7b58146 feat(curriculum): add versioned swim-learning foundation`
2. `e18f194 feat(progress): add canonical assessments and journey projections`
3. `fee3419 feat(badges): add immutable batch award pipeline`
4. `2ad4b81 feat(curriculum): add guided versioned learning-line wizard`
5. `2bb1a96 feat(progress): connect canonical assessments and journey rings`
6. `af983da feat(transitions): add reviewed carryover commands`
7. `d4c035b feat(parent-portal): add capability-aware badge sharing`
8. `e0ef3da feat(planning): enforce structured group publication`
9. `eb8c47f feat(billing): add immutable documents and paid holiday offerings`
10. `598dcc4 feat(analytics): add rolling swim flow forecasts`
11. `3c96339 feat(native-api): add actor-bound mobile contract`
12. `53a66fb feat(android): add native instructor and parent apps`
13. `347153a ci(android): verify and deliver signed bundles to Play internal`
14. `docs(swim-canon): document rollout and acceptance evidence` (de commit
    die dit rapport bevat)

Er is niet gepusht of gedeployed zonder afzonderlijke opdracht.
