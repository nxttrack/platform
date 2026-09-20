# V4 release refresh: uitvoeringsrapport

**PRODUCTIEPROMOTIE EN EINDVERIFICATIE OPEN; STAGING VOLLEDIG GESLAAGD.**
Momentopname: 20 september 2026, 15:12 UTC. Definitieve canonical bron:
**`1a72606d5fd7bf72c382fcc5215c3419dfb689e1`**, [PR #99](https://github.com/nxttrack/platform/pull/99).
Canonical CI, foundation, migratierehearsal en de volledige stagingrun
[35516843435](https://github.com/nxttrack/platform/actions/runs/35516843435) zijn geslaagd.
Alle dertien verplichte gates, herstel van oorspronkelijke instellingen en originele bewijsopslag
op de VPS zijn bevestigd. Alle 56 definitieve Priority A-opnames passen binnen hun viewport;
twaalf daarvan en veertien beelden over alle zeven thema's zijn werkelijk visueel beoordeeld.
De coördinerende agent bekeek bovendien de vier gerepareerde layouts. De volledige oorspronkelijke
communicatiesuite slaagde zonder herkansing of aangepaste timeout. De oorzaak van de eerdere
mislukte poging blijft onbekend. Productieactivatie en de controles daarna volgen nog.

De gebruiker heeft daadwerkelijke staging-/productiedeployment en autonome technische/visuele
beslissingen geautoriseerd. Afronding vereist dat beide omgevingen deze gecontroleerde release
draaien en binnen de beschreven productscope bruikbaar zijn. De oorspronkelijke lokale werkruimte
en gebruikerswijzigingen blijven behouden. De [volledige readinessanalyse](https://github.com/nxttrack/platform/blob/b5511f16ad8367aca342aac9b5c0e83c4ee4d362/docs/audits/2026-09-20-deploy-readiness.md)
bevat de onderliggende analyse; het [go/no-go-record](2026-09-20-v4-production-go-no-go.md)
bindt de concrete promotievoorwaarden en herstelpunten aan deze SHA; de prepromotiebeslissing wordt vóór dispatch onveranderlijk vastgelegd.

## Actueel bewijs

| Controle | Bron | Werkelijke status |
|---|---|---|
| Canonical CI, exact `1a72606d…` | [35514764794](https://github.com/nxttrack/platform/actions/runs/35514764794) | **PASS**, 590 units, 102 browsersmokes, 82 Journey-tests, 35 bestaande voorwaardelijke skips; alle 12 responsivecases in drie browsers PASS; exact-source-origin/digest/inhoud geverifieerd |
| Vijfde volledige stagingrun, exact `1a72606d…` | [35514772810](https://github.com/nxttrack/platform/actions/runs/35514772810) | **FAILED**, 8/13 gates PASS, communicatiegate FAIL, vier vervolggates SKIPPED; cleanup PASS, geen Priority A-beelden of volledig releaseartifact |
| Production foundation, exact `1a72606d…` | [35514774707](https://github.com/nxttrack/platform/actions/runs/35514774707) | **PASS**, zes jobs, 49 configuratiechecks, host/TLS/routing, database-inventaris en acht mailconfiguratie-/DNS-checks |
| Production migratie-dry-run, exact `1a72606d…` | [35514776517](https://github.com/nxttrack/platform/actions/runs/35514776517) | **PASS**, 158/158 migraties, nul ontbrekende/onverwachte versies, 256 tabellen met RLS/FORCE RLS; geen migraties nodig, inventarisfingerprint ongewijzigd |
| Historische canonical CI, exact `b5511f16…` | [35512094839](https://github.com/nxttrack/platform/actions/runs/35512094839) | **PASS**, 590 units, 102 browsersmokes, 70 Journey-tests; 35 voorwaardelijke Journey-skips, 0 failures |
| Historische volledige staginggate en lokaal releasebewijs, exact `b5511f16…` | [35512095754](https://github.com/nxttrack/platform/actions/runs/35512095754) | **Workflow PASS**, 13/13 verplichte gates, cleanup na Phase 15 en bewijsopslag PASS; **visuele NO-GO**, vier van 56 screenshots met documentoverflow |
| Historische production foundation, exact `b5511f16…` | [35512097079](https://github.com/nxttrack/platform/actions/runs/35512097079) | **PASS**, 49 configuratiechecks, host/TLS/DNS, read-only database-inventaris en 8 mailconfiguratie-/DNS-checks |
| Historische production migratie-dry-run, exact `b5511f16…` | [35512098381](https://github.com/nxttrack/platform/actions/runs/35512098381) | **PASS**, database actueel, geen migraties, fingerprint ongewijzigd |
| PR #99 responsive reparatie, bron `1bc66031…` | [Lokale browseruitvoer](2026-09-20-v4-release-refresh/evidence/responsive-local-regression.json) | **Lokaal PASS**, 4/4 Chromium-regressies en typecheck; 12/12 responsivecases in drie browsers geslaagd in PR-CI 35514184316 |
| Definitieve volledige staginggate en 56 finale visuals | [35516843435](https://github.com/nxttrack/platform/actions/runs/35516843435) | **PASS**, 13/13 gates, cleanup en bewijsopslag; 56/56 breedtes/hashcontrole, gedelegeerde visuele GO binnen beschreven scope |
| Behoud historische stagingrollback `6b3c9abb…` | [35514084302](https://github.com/nxttrack/platform/actions/runs/35514084302) | **PASS**, oorspronkelijke artifact geverifieerd; runtime, configuratie en serviceproces ongewijzigd |
| Actuele versleutelde V4-productiedatabasebackup | [35514311700](https://github.com/nxttrack/platform/actions/runs/35514311700) | **PASS**, read-only export, archiefinspectie, encryptie/decrypt-bytevergelijking en artifactdigest; geen restore uitgevoerd |
| PR #98 CI vóór canonical merge | [35511585612](https://github.com/nxttrack/platform/actions/runs/35511585612) | **PASS**, 590 units, 102 browsersmokes, 70 Journey-tests; 35 voorwaardelijke Journey-skips afzonderlijk vermeld |
| Beperkte live fixture-/instructeurtest vóór merge | [35511598473](https://github.com/nxttrack/platform/actions/runs/35511598473) | **PASS**, vier ouder-recordprobes, vier rollen en instructeurmutaties zonder herkansing; actieve app bleef `433ac957…` |
| Definitieve GO en productiepromotie | Run-ID, artifact en GO-permalink toevoegen | **OPEN** |
| Authenticated browsers en publieke productieroutes | Run-ID, JSON en screenshots toevoegen | **OPEN**, beide omgevingen en bestaande eigenaar |
| Operationele probes en runtime-readiness | Run-ID's en beide JSON-artifacts toevoegen | **OPEN** |
| Volledige 30-minutenobservatie | JSONL, samenvatting en UTC-begin/einde toevoegen | **OPEN** |
| Hoststabiliteit | Twee runs en snapshots per omgeving toevoegen | **OPEN**, app en Caddy |

De [geverifieerde preflightbundel](2026-09-20-v4-release-refresh/evidence/verified-preflight-summary.json)
bindt de nieuwe CI en productiepreflights aan `1a72606d…`. De databasefingerprint omvat migratieversies,
schema-/RLS-aantallen en aantallen Auth-gebruikers/Storage-objecten, niet alle datarijen.
PR-CI en beperkte live tests vervangen de volledige canonical gate niet. Overgeslagen
verplichte releasegates tellen niet als PASS. De historische PR #98-CI draaide op GitHub-mergecommit
`d7c5f02d415d9290d20929309b3b32145352f3bd`; de reparatiebron is
`94109882c6812d6fa0f6ed698e74ff5c84f919bc`. De live precheck gebruikte opsbron
`2f2aacd0ab1926eda74e982cd419573b0c3dfaa1` en wijzigde de applicatierelease niet.

## Drie mislukte stagingpogingen en hun reparaties

1. **`4248c35e…`, [35506322862](https://github.com/nxttrack/platform/actions/runs/35506322862): FAILED.**
   De deploy slaagde, maar Phase 16 stopte met `child_session_data_api_blocked`: de directe
   Auth-login van de fixture miste verplichte oudersessiecontext. [PR #96](https://github.com/nxttrack/platform/pull/96)
   verifieert het verse token, bindt gebruiker/tenant/sessie en initialiseert de bestaande
   contextfunctie. Dataqueries blijven onder de aangemelde rol; RLS, portaalvlaggen en guards
   zijn niet verzwakt. De workflow bewaart voortaan alleen oorspronkelijk volledig geslaagd
   releasebewijs naast de VPS-release, na controle van run/poging/SHA/artifactdigest/bytes.
2. **`30af2d99…`, [35507560102](https://github.com/nxttrack/platform/actions/runs/35507560102): FAILED.**
   Elf eerdere browsergates en rolloutrestore slaagden. Phase 15 kreeg HTTP 500, SQLSTATE
   `57014`, op `/participant_progress_scores?select=tenant_id&limit=50`. De read-only
   [diagnose 35509315434](https://github.com/nxttrack/platform/actions/runs/35509315434) gebruikte dezelfde
   bestaande geldige oudercontext als `authenticated`, actieve RLS, geslaagde guard en bevestigde
   server-timeout van 2.000 ms. Van 4.537 scores was één in de eigen tenant. De ongescopeerde
   query had een `Seq Scan` en timeout na 2.023 ms; eigen tenant/deelnemer gebruikte
   `participant_progress_scores_item_idx` en retourneerde één rij in 19 ms. Dit zijn aparte
   SELECT-metingen; `EXPLAIN` draaide zonder `ANALYZE`. Beide eigen-deelnemerhelpers antwoordden
   in 15 ms. De diagnostische run bleef terecht rood door de echte timeout; zie het
   [lokale JSON](https://github.com/nxttrack/platform/actions/runs/35509315434).
   [PR #97](https://github.com/nxttrack/platform/pull/97) vervangt alleen deze probe door vier aantoonbaar
   bestaande records: eigen zichtbaar, niet-gekoppeld eigen tenant onzichtbaar, andere tenant
   onzichtbaar, interne eigen score onzichtbaar. Live fixturetest
   [35509377553](https://github.com/nxttrack/platform/actions/runs/35509377553) slaagde. Eén
   `if: always()`-cleanup herstelt de oorspronkelijke rollout nu na Phase 15 en vóór releasebewijs;
   negen rollouttests slagen.
3. **`433ac957…`, [35510477976](https://github.com/nxttrack/platform/actions/runs/35510477976): FAILED.**
   De instructeurtest verwachtte één `article` met `E2E Leerling`, maar vond bij beide pogingen
   twee. De nieuwe interne score 1 van het bestaande kind activeerde via de bestaande assessmenttrigger
   een geldige `low_skill`-focuskaart. Focuskaart en aanwezigheidskaart noemen hetzelfde kind;
   de twee nieuwe isolatiedeelnemers hebben andere namen en veroorzaakten dit niet.
   [PR #98](https://github.com/nxttrack/platform/pull/98) selecteert de aanwezigheidskaart via de exacte
   deelnemer-ID in de Studentdetail-link én het aanwezigheidsformulier. Beide tellingen blijven
   exact één; de naamcontrole blijft behouden. De gedeelde helper krijgt een DOM-regressie met
   focuskaart, eigen kaart, andere overeenkomende naam en echte duplicaat-/ontbreektgevallen.
   Geen `.first()`, fixtureverwijdering of productaanpassing. Lokale desktop/mobile-regressie en
   typecheck slaagden; PR-CI en live test zonder retries staan boven. Rolloutrestore slaagde
   ook bij deze mislukte volledige run; releasebewijs ontbrak.

Geen van deze pogingen levert volledig promotiebewijs. Schema, RLS en applicatiecode zijn bij
de reparaties ongewijzigd. De wereldwijde ongefilterde Data API-scan blijft **niet geoptimaliseerd**.
De bestaande ouderapp filtert tenant/deelnemer; de diagnostische query met die filters heeft een
indexplan. Expliciete clientfilters naast RLS sluiten aan op
[Supabase's officiële performanceadvies](https://supabase.com/docs/guides/database/postgres/row-level-security-performance#filter-in-the-client-query-too).

Historische **superseded** successen blijven traceerbaar en gelden niet voor de definitieve kandidaat:

| Oude SHA | Canonical CI | Foundation | Migratie-dry-run |
|---|---|---|---|
| `30af2d99…` | [35507543714](https://github.com/nxttrack/platform/actions/runs/35507543714): PASS, 585 units / 100 smokes / 70 Journey, 35 skips | [35507561488](https://github.com/nxttrack/platform/actions/runs/35507561488): PASS | [35507562613](https://github.com/nxttrack/platform/actions/runs/35507562613): PASS, fingerprint gelijk |
| `433ac957…` | [35510467017](https://github.com/nxttrack/platform/actions/runs/35510467017): PASS, 590 units / 100 smokes / 70 Journey, 35 skips | [35510479730](https://github.com/nxttrack/platform/actions/runs/35510479730): PASS | [35510481522](https://github.com/nxttrack/platform/actions/runs/35510481522): PASS, fingerprint gelijk |

## Vierde stagingpoging: workflow PASS, visuele NO-GO

Run [35512095754](https://github.com/nxttrack/platform/actions/runs/35512095754) op `b5511f16…`
slaagde voor alle **13/13 verplichte gates**, waaronder vier rollen, vier bestaande-recordprobes
voor ouders en de zeven-themamatrix. Phase 15 eindigde om `13:36:20Z`, herstel van de oorspronkelijke
rolloutinstellingen om `13:36:21Z` en schrijven van releasebewijs om `13:36:22Z`; bestaande sessies
bleven behouden. Ook behoud van het oorspronkelijke releaseartifact op de VPS slaagde. Artifact
`10606555620` heeft digest `sha256:3ab2f1830f78eac97799706e0417ad447263bfcb4021807a18a23017883bac96`
en is bewaard naast `/var/www/nxttrack/staging/releases/20260920125737-b5511f1`.
De [gate-samenvatting](2026-09-20-v4-release-refresh/evidence/superseded-b551-gate-summary.json)
houdt technische successen en de afwijzende visuele beslissing afzonderlijk vast.

Alle **56/56 Priority A-PNG's** zijn behouden en tegenover hun viewportmetadata gecontroleerd.
Een kwantitatieve breedteaudit vond vier overflows; de overige 52 kwamen exact met hun viewport overeen:

| Route / viewport | PNG-documentbreedte | Verwachte breedte |
|---|---:|---:|
| Publieke intake / mobiel | 13719 px | 390 px |
| Publieke intake / tablet | 13719 px | 768 px |
| Beheeragenda / mobiel | 443 px | 390 px |
| Instructeurgroep / tablet | 847 px | 768 px |

De intake liet circa veertig programma's het document verbreden en plaatste noodzakelijke formulier-
en vervolgbediening buiten beeld. Daarom is **geen productiepromotie** toegestaan voor deze SHA.
De oude screenshotgate registreerde nog geen documentbreedte en kon deze afwijking niet afkeuren.
De metadata-audit van alle 56 bestanden is geen claim dat elk beeld handmatig is bekeken: de specialist
opende daadwerkelijk 17 Priority A-beelden, 14 ouder-/kindbeelden met alle zeven thema's vertegenwoordigd
en drie platformpreviewbeelden. Zie de [visuele review](2026-09-20-v4-release-refresh/evidence/superseded-b551-visual-review.json)
en [breedteaudit](2026-09-20-v4-release-refresh/evidence/superseded-b551-width-audit.json).

[PR #99](https://github.com/nxttrack/platform/pull/99), bron `1bc660319a236d0e039c63119063f281a2308cda`,
begrensde de gridkolommen/minimumbreedtes in precies deze drie routes; intern horizontaal scrollende
programmanavigatie blijft bruikbaar. Data, formulieren/serveracties, auth en de veertig programma's
blijven behouden. De Priority A-capture registreert voortaan document-/viewportbreedte en faalt bij
meer dan 1 px documentoverflow. De testharness gebruikt echte presentatiecomponenten, is alleen onder
`APP_ENV=test` beschikbaar en weigert inzendingen zonder data- of authcalls. Vier lokale Chromiumtests
met 390/768 px slaagden, inclusief veertig programma's, eerste intakevervolgstap, planningdialoog en
instructeurvelden; typecheck en onafhankelijke review slaagden. Zes lokale screenshots hebben de juiste
viewportbreedte; drie daarvan zijn ook daadwerkelijk visueel bekeken. Zowel PR-CI als de definitieve
canonical CI voerden alle twaalf regressiegevallen over Chromium/Firefox/WebKit succesvol uit.
Lokale Firefox/WebKit startten niet wegens ontbrekende systeembibliotheken. De latere volledige staginggate
35516843435 en visuele eindreview zijn geslaagd.

## Vijfde stagingpoging: communicatiegate stopt vóór contentcontrole

Run [35514772810](https://github.com/nxttrack/platform/actions/runs/35514772810) activeerde
`1a72606d5fd7bf72c382fcc5215c3419dfb689e1` succesvol. De onafhankelijke publieke controle van
`13:55:36Z` bevestigde die SHA, omgeving staging, database/schema PASS en alle twintig PNG-assets
van de zeven thema's bytegelijk aan de bron. Acht van dertien verplichte gates slaagden, inclusief
Phase 16, de themamatrix en rol-/tenantisolatie. In de communicatiegate overschreden de platformowner
en instructeur vervolgens de **5.000 ms URL-assertie na inloggen**, vóór hun contentcontroles.
Ouder- en tenantadmincommunicatietests slaagden. Dit bewijst nog niet waarom de twee URL-overgangen
uitbleven; de latere gerichte diagnose slaagde zonder reproductie. Er is geen vastgestelde cold-render- of infrastructuuroorzaak.

Premium, Priority A-capture, Phase 15 en schrijven van releasebewijs werden overgeslagen.
De afsluitende cleanup slaagde en bevestigde expliciet herstel van oorspronkelijke rolloutvlaggen/
settings en behoud van bestaande sessies. Release-evidence-persistence werd overgeslagen.
Er zijn dus **geen 56 Priority A-beelden of volledige releaseartifacts voor deze poging**.
Zie het [volledige gaterecord](2026-09-20-v4-release-refresh/evidence/superseded-1a72606-attempt1-gates.json).

Het eerder geüploade zeven-thema-artifact is wel geverifieerd: 518 manifestregels, bestaande uit
322 canonical renders en 196 dashboardcases, met 42 geselecteerde PNG's behouden. De specialist
opende daadwerkelijk veertien nieuwe beelden: ouderdesktop en kindmobiel voor elk van de zeven
thema's. Daarin werd geen nieuwe blokkerende beeldafwijking gezien. Eén nieuw cataloguspreviewbeeld
bevestigde de bestaande begrensde clipping. De [themabeoordeling](2026-09-20-v4-release-refresh/evidence/1a72606-attempt1-theme-review.json)
is geen volledige visuele GO en verifieert de vier gecorrigeerde Priority A-breedtegevallen nog niet.

De [onafhankelijke timingvergelijking](2026-09-20-v4-release-refresh/evidence/1a72606-attempt1-quality-timing-comparison.json)
registreert vooraf een echte quality-budgetoverschrijding: instructeurgroep op 1024×768 had
DOMContentLoaded **11.307 ms tegenover 6.000 ms**, nadat TTFB ≤3.000 ms al was geslaagd;
de bestaande retry slaagde. Diezelfde groep/sessie was eerder in de run al succesvol bezocht.
Ook b551 had een overschrijding: ouder-LCP **6.724 ms tegenover 4.000 ms**, gevolgd door een geslaagde
retry. De publieke logintest bleef vergelijkbaar (3,9 → 3,7 s); admin-quality werd sneller (10,3 → 8,0 s).
De volledige geslaagde communicatietests werden juist trager: ouder 7,0 → 11,6 s, tenantadmin 9,6 → 16,6 s.
Deze testduren omvatten meer dan requests en bewijzen geen algemene latencyoorzaak. De qualitymeting
bewaart geen navigation-URL of requesttijdlijn; haar performance-JSONs en de communicatiefoutenrapporten
zijn niet als artifact behouden. Er zijn geen expliciete 5xx-/consolefouten in de beschikbare relevante
logs, maar vroege loginasserties voorkwamen de afsluitende runtime-errorcontrole. Dat sluit zulke fouten
niet uit. De observaties blijven echte failures; een geslaagde retry is geen oorzaakanalyse.

## Gerichte communicatiediagnose en ongewijzigde herhaling

De beperkte diagnose [35516511778](https://github.com/nxttrack/platform/actions/runs/35516511778)
slaagde op de ongewijzigde applicatie `1a72606d…`, met opsbron `6dcae596…`. Alle vier oorspronkelijke
communicatietests en 5.000-ms-loginasserties slaagden zonder retry, extra loginpoging of timeoutverruiming.
Per rol werd precies één succesvolle login-POST gemeten; de asserties duurden 414–957 ms.
De gecontroleerde bronkopie behield de originele testbodies. Alle zes toegestane diagnostische JSONs
zijn op bron, artifactdigest en bytes geverifieerd; geen ruwe context, sessietokens, e-mailadressen of
loginbeelden zijn gepubliceerd. [Diagnose](2026-09-20-v4-release-refresh/evidence/focused-communication-review.json)
en [herkomstcontrole](2026-09-20-v4-release-refresh/evidence/focused-communication-origin.json).

Deze niet-reproductie verklaart de eerdere fout niet. Inspectie vlak vóór de klik voegt een browser-
roundtrip toe en kan hydrationtiming beïnvloeden; cookieaanwezigheid is slechts een heuristiek.
Daarom is geen applicatie-authcode gewijzigd en vervangt de diagnose geen volledige staginggate.
Dezelfde beperkte run produceerde daarnaast 56/56 breedtecorrecte Priority A-beelden, nul runtimefouten,
gecontroleerde hashes en bytegroottes. De coördinerende agent bekeek de vier eerder mislukte beelden
zelf: intake mobiel/tablet, beheeragenda mobiel en instructeurgroep tablet. Essentiële bediening valt
binnen de viewport. Kleinere instructeurstatistieklabels blijven krap; de bestaande cataloguspreview-
clipping blijft afzonderlijk beschreven. De volledige herhaling [35516843435](https://github.com/nxttrack/platform/actions/runs/35516843435)
voert opnieuw de oorspronkelijke suite zonder deze instrumentatie uit en moet volledig slagen.

## Zesde volledige stagingpoging: definitief geslaagd

[35516843435](https://github.com/nxttrack/platform/actions/runs/35516843435) slaagde op de ongewijzigde
canonical bron `1a72606d5fd7bf72c382fcc5215c3419dfb689e1`: alle dertien verplichte gates zijn daadwerkelijk
uitgevoerd. De Phase 15-browserbatch rapporteert daarnaast 140 geslaagde en 52 overgeslagen individuele
gevallen; die telling wordt afzonderlijk van de verplichte workflowgates vastgelegd. Cleanup volgde
ná Phase 15, herstelde de eerdere rolloutinstellingen en behield bestaande sessies. Origineel
releaseartifact `10608016380`, digest `sha256:8642ab7160e3193bf9dea6110e42303f1415552a173ccee75dc8602cb3d5c275`,
is gecontroleerd en behouden in `/var/www/nxttrack/staging/releases/20260920143333-1a72606/artifacts/release-evidence.json`.
De canonical productievalidator accepteert deze run en beide exacte-SHA-preflights.
[Gate-/artifactcontrole](2026-09-20-v4-release-refresh/evidence/final-staging-verification-summary.json).

Alle 56 Priority A-beelden hebben geldige hashes, bytegroottes en exacte viewport-/documentbreedtes;
nul capture-runtimefouten. De specialist bekeek twaalf Priority A-beelden en veertien ouder-/kindbeelden
over alle zeven thema's; de coördinerende agent bekeek de vier oorspronkelijk mislukte schermen zelf.
De gedelegeerde visuele beslissing is GO binnen de beschreven runtimescope; de bestaande catalogus-
previewclipping en krappe instructeursamenvatting blijven begrensde niet-blokkerende punten.
Vier originele fictieve stagingbeelden zijn [duurzaam behouden](2026-09-20-v4-release-refresh/reviewed-visuals/manifest.json).
De 52 individuele skips zijn geclassificeerd: 24 herhaalde suites die eerder als aparte verplichte gates slaagden; 2 mobiele matrixduplicaten; 1 desktopvariant van een mobiele actie; 8 uitgezette Mollie-sandboxcases; 8 themabibliotheekcases waarvoor geïsoleerde lokale fixturecredentials nodig zijn; 2 analyticscases zonder measurement-ID. Daarnaast bleven 7 DOM-afhankelijke interactiechecks ongedekt: vier organisatietabelchecks, twee keyboardchecks en één mobiele bulkcheckboxcheck. Deze zeven gelden niet als geverifieerde functionaliteit; er is geen verplichte workflowgate overgeslagen.

De oorspronkelijke communicatiegate rapporteert 4/4 PASS, nul retries/skips, ongewijzigde specbytehash;
[onafhankelijke controle](2026-09-20-v4-release-refresh/evidence/final-communication-original-review.json).

De nieuwe idempotente [stagingrollbackcontrole 35518703256](https://github.com/nxttrack/platform/actions/runs/35518703256)
slaagde tegenover deze finale release. Historisch 6b-bewijs en pin bleven bytegelijk; canonical rollback
check-only accepteerde compatibiliteit. Actieve release, configuratie, immutable identities en PID
bleven behouden. Er is geen rollback uitgevoerd.

## Promotie en bruikbaarheid: nog af te ronden

De definitieve GO bindt `1a72606d5fd7bf72c382fcc5215c3419dfb689e1` aan succesvolle canonical CI, volledige staginggate,
56 Priority A-screenshots met gedelegeerde visuele review, foundation en ongewijzigde dry-run.
Het ingevulde GO-record moet duurzaam op de opsbranch staan vóór productiepromotie. De deploy
behoudt het releaseartifact; health moet HTTP 200, `ok=true`, juiste omgeving, exacte `commitSha`
en geslaagde DB-/schemacontroles tonen. Publieke apex/`www`/`admin`/wildcard-healthroutes worden
na activatie afzonderlijk vastgelegd. Er is geen nieuwe databasemigratie.

De aanvullende browsers verifiëren bestaande platformownerrechten, het eventueel lege tenantportfolio,
onboardingnavigatie zonder aanmaken/uitnodigen, loginpagina en anonieme beheerafscherming; op staging
ook beheerder/instructeur/ouder/kindreis en kindisolatie. Verificatiebron-SHA en app-SHA worden apart
vastgelegd. De eigenaar gebruikt een tijdelijke magiclink-sessie zonder e-mail, geen nieuwe
wachtwoordformulierlogin. Hashes worden alleen in geheugen vergeleken, met een generieke uitslag.
Alleen eigen tijdelijke sessies worden ingetrokken; owner, wachtwoord, overige sessies en
tenantaantal blijven behouden. Bootstrap/reset blijven uit; geen productietenants of uitnodigingen.

Omdat de repository openbaar is, beperkt opscommit `c10fce8d28851b10b36f49837d550e58eac68cbc`
de screenshots van deze aanvullende verifier tot de **main-regio**, zonder globale accountheader/sidebar.
Zichtbare accountmail of ingevulde e-mail-/wachtwoordvelden blokkeren vóór capture; het JSON-rapport
neemt geen ruwe assertion-, navigatie- of databasefouten over. De [privacywijziging](2026-09-20-v4-release-refresh/evidence/browser-public-evidence-amendment.json)
verandert uitsluitend de opsverifier, niet de canonical app-SHA, authenticatie of lokale sessiecleanup.
De kindcapture blijft beperkt tot stagingfixtures. Main-regiobeelden vormen geen volledige shell- of
platformbrede visuele goedkeuring. Uitvoering en eindbewijs van de aangepaste verifier blijven **OPEN**.

De observatie vereist **31 samples per omgeving van T0 tot T30, minstens 1.800 seconden, nul fouten**,
met UTC en monotone verstreken tijd. Elke eerdere fout blijft meetellen. Twee geslaagde read-only
hostsnapshots minstens dertig minuten uiteen moeten voor app én Caddy dezelfde MainPID, NRestarts
en ActiveEnterTimestamp tonen. Probes gebruiken `mode=probe` zonder externe alerts; hun interne
heartbeat moet daadwerkelijk PASS zijn, ook wanneer de workflow een waarschuwing tolereert.
Readiness vereist per omgeving `ready=true`, expliciet deze SHA, `operationsMode=versioned`, recente
succesvolle minuutjobs en verse volledige versleutelde backups. Alleen `ready` bewijst de expliciete
SHA-/versioned-voorwaarden niet.

## Bestaande configuratie, herstel en productgrenzen

Dit is een gewone V4-verversing. De [actuele scopevergelijking](2026-09-20-v4-release-refresh/evidence/application-scope-comparison.json)
legt exact de zes gewijzigde applicatiebestanden tussen productie `6b3c9abb…` en eindbron `1a72606d…`
vast. De [historische vergelijking](2026-09-20-v4-release-refresh/evidence/superseded-b551-runtime-equivalence.json)
bevestigt bytegelijke applicatie-runtime, packages, migraties en dependencybestanden **uitsluitend tussen
productie `6b3c9abb…` en de historische kandidaat `b5511f16…`**, met `apps/web/tests` uitgesloten.
PR #99 wijzigt applicatiepresentatie/CSS en de afgeschermde testharness; de volledige runtime is daardoor
niet meer bytegelijk. Backendauthenticatie, mail, upload, datalaag, schema/RLS en dependencies blijven
ongewijzigd. Operationele scripts, workflows en presentatie vereisen de nieuwe deployment-/eindcontroles. Bestaande mail-/job-/
monitoringconfiguratie en incident-/supporteigenaars blijven behouden. Foundation controleert de
fallback-mailconfiguratie; historische run `35477574832` las de gezaghebbende DB-mailsettings en de
toen lege outbox. Dit is geen nieuwe DB-inspectie of inboxbewijs. Bestaande ClamD-configuratie en eerdere
clean-PDF-stagingjourneys op dezelfde host zijn historische scannerbewijzen; de finale documentjourney
blijft vereist. Geen aparte productie-upload of nieuwe EICAR-test wordt geclaimd. Het go/no-go-record
bevat de volledige kwalificaties en herstelpunten.

Sleutelrotatie [35505059974](https://github.com/nxttrack/platform/actions/runs/35505059974) slaagde voor beide
omgevingen: nieuwe 64-teken sleutels, behouden sleutelgeschiedenis en decrypt-/bytegeverifieerde
exports van alle zeven buckets. Handmatige backup meldt pas succes na encryptie, bytecontrole en
artifactupload; tijdelijk plaintext wordt ook bij fouten opgeruimd. Geen sleutelwaarden in dit rapport.

Actuele databasebackup [35514311700](https://github.com/nxttrack/platform/actions/runs/35514311700)
is uitgevoerd met opsbron `87ea0b81d5ed1123dc3b8d4efe553f7287b97593`, van
`2026-09-20T13:43:06.552Z` tot `13:45:08.109Z`. De read-only PostgreSQL 17 custom export bevat
`public`, `app_private`, `auth`, `storage`, `supabase_migrations` en `extensions`, inclusief authgebruikers
en migratiehistorie. Archiefinspectie, AES-256-encryptie en bytegelijke decryptie slaagden; productie
bleef vóór/na gezond op `6b3c9abb686be198830f417e663ac94124d7066f`. Artifact `10606686080`
is 735935 bytes, vervalt `2026-12-19T13:42:55Z` en heeft gecontroleerde ZIP-digest
`sha256:4f26c54160815d9d60b5256fdc00c39542cbc4680cafac0c1740593741116a92`; de ciphertext
komt overeen met het [backuprapport](2026-09-20-v4-release-refresh/evidence/current-production-database-summary.json).
Dit is het actuele V4-databaseherstelpunt; de oude pre-V4-export blijft alleen historisch bewijs.
Er is **geen restore uitgevoerd**. Globale databaserollen en Storage-objectbytes vallen buiten deze
export; de afzonderlijke Storage-backup blijft daarvoor vereist. Provider-PITR wordt hiermee niet bewezen.

Run [35514084302](https://github.com/nxttrack/platform/actions/runs/35514084302) behield de historische
stagingrelease `6b3c9abb…` op `/var/www/nxttrack/staging/releases/rollback-20260919230221-6b3c9ab`.
Het oorspronkelijke releaseartifact is geverifieerd; immutable release-identiteit en bewijs bleven
behouden. Runtime `b5511f16…`, configuratie en serviceproces wijzigden niet. Dit is geen uitgevoerde rollback.

| Bewijs/opslag | Bewaartermijn |
|---|---|
| Dagelijkse versleutelde Storage-backups op VPS | 14 dagen; geen zelfstandige externe artifactkopie |
| Handmatige Storage-backup-artifacts | 30 dagen |
| Historische sleutelbundels en pre-V4-database-export | 90 dagen; oude DB-export is geen huidige V4-PITR of direct passende DB-rollback |
| Actuele V4-productiedatabase-export `35514311700` | 90 dagen, tot `2026-12-19T13:42:55Z`; restore niet uitgevoerd, geen globale rollen/objectbytes |
| Production-/stagingreleaseartifact | Respectievelijk 90 / 14 dagen |
| Runtime-readiness-/aanvullende browserartifacts | Respectievelijk 30 / 90 dagen |
| Hoststabiliteitsartifacts | 90 dagen |

Actieve en vorige bekende werkende releases blijven behouden naast de overige recente releases.
Supabase-abonnement, dashboardretentie en provider-PITR zijn niet nieuw onafhankelijk bewezen;
bestaande infrastructuur/SLA wordt niet gewijzigd. Nieuwsbrieven blijven concepten
(`NEWSLETTER_DELIVERY_ENABLED=false`), zonder verzendmotor. Zeven bestaande thema's zijn beschikbaar;
het authentieke Default 1.1-bronpakket ontbreekt en niet-gerenderde ondersteunende beeldslots gelden
niet als portaalbeelden. SendGrid-sandboxvalidatie is geen inboxbewijs. Echte providerbetalingen,
native storepublicatie en nieuwe fysieke Android-/iOS-tests vallen buiten deze verversing.

De uitgebreide preview in de platformthemacatalogus blijft deels afgeknipt: een brede previewregio
valt binnen een smallere kaart met verborgen overflow. Dit bestaande, begrensde beheerpreviewprobleem
is niet opgelost en is **geen algemene platformbrede visuele GO**. De echte ouder-/kindportalen voor
alle zeven thema's en de tenantselecties slaagden ook in de matrix op `1a72606d…`; activering staat in
een afzonderlijk bereikbaar beheerpaneel. De vereiste volledige finale stagingrun 35516843435 is geslaagd.

**Afsluiting OPEN:** vul productierun/artifact, exacte eind-SHA's, bruikbaarheidsbewijs,
observatievenster en beide hostvergelijkingen pas na werkelijke uitvoering in.
