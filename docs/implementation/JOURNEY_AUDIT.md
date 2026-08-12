# Journey/tijdlijn audit en herstel

Status: hersteld; draft-PR releasegates nog open
Datum: 12 augustus 2026
Branch: `codex/parent-child-portals-v1`
Baselinecommit: `6ab9d1c0622c0b559a77fbdd95dbb7fbae78d717`
Draft PR: `#56` naar `staging`

## Reproduceerbare baseline

- Werkboom bij aanvang: schoon; upstream `origin/codex/parent-child-portals-v1`.
- Centrale domeinbron: `apps/web/lib/domain/swim-progress.ts`.
- Child-safe projectie: `apps/web/lib/domain/child-portal.ts` en `apps/web/lib/domain/child-journey-view.ts`.
- Gedeeld volgordecontract: `apps/web/lib/theme/portal-journey-contract.ts`.
- Volledige childpresentatie: `apps/web/components/child/child-journey-map.tsx`, gebruikt op `/kind` en `/kind/reis`.
- Compacte parentprojectie: `apps/web/components/parent/portal-journey-engine.tsx`.
- Historische snapshots: `public.portal_journey_chapter_snapshots`, transactioneel gevuld door `app_private.capture_portal_journey_chapter_snapshot()`.
- Routevolgorde bij actieve hoofdstukken: completion op basis van de effectieve rating-5-observatie, daarna hoogste onafgeronde voortgang en curriculumvolgorde.
- Baselinecommando: `pnpm exec tsx --test tests/unit/portal-journey-engine.test.ts tests/unit/portal-child-projection.test.ts tests/unit/portal-session-contract.test.ts tests/unit/portal-visual-matrix-contract.test.ts` — 32 geslaagd, 0 mislukt.
- Baselinecommando: `pnpm run typecheck` — geslaagd.
- Bestaand visueel contract: 322 canonieke renders en 196 dashboard-viewportcases; de journey-specifieke 86/630-matrices ontbreken nog.
- Visuele referenties zijn volledig gecontroleerd in `docs/codex-input/ocean-quest-v1.0.0/portal-final/`; het HTML-prototype is alleen als visuele referentie gebruikt.

## Verplichte pre-fix auditmatrix

Deze tabel is vastgelegd vóór de eerste functionele correctie. `PASS` betekent dat zowel gedrag als reproduceerbaar bewijs al aanwezig was.

| ID | Eis | Huidig bewijs | Status | Oorzaak/risico | Benodigde wijziging |
| --- | --- | --- | --- | --- | --- |
| JNY-01 | Alle DTO-onderdelen vertegenwoordigd en bereikbaar | `focusedJourneyWindow()` rendert alleen relatieve posities -2 t/m 2; child-`<ol>` bevat daardoor maximaal vijf entries | FAIL | Veilige DTO-items buiten het focusvenster ontbreken uit DOM en accessibility tree | Alle entries exact één keer semantisch renderen en alleen de visuele camera/windowing scheiden |
| JNY-02 | Oudste/eerste completion vooraan en posities bevroren | `orderJourneyNodes()` sorteert rating-5 op `finalizedAt`; snapshots bevatten curriculumvolgorde | PARTIAL | Correcties kunnen de actieve completionvolgorde herschikken; gelijke timestamps missen expliciete instance-ID-tiebreaker; actieve positie is niet bevroren | Server-authoritative completion sequence en stabiele order key invoeren, met veilige legacy-state |
| JNY-03 | Huidig doel correct bepaald en initieel gecentreerd | `selectDefaultJourneyNode()` gebruikt hoogste voortgang en curriculumorder; focuspositie 0 is canoniek | PARTIAL | Laatste tie-breaker gebruikt label/id impliciet en volledig afgeronde/lege state is niet volledig afgedekt | Expliciete stabiele ID-tiebreaker en statefixtures voor 0/1/voltooid toevoegen |
| JNY-04 | Selected versus current gescheiden | `selectedId` bepaalt selectie, `aria-current`, titel en mascottepositie | FAIL | Bekijken van historie verandert semantisch het huidige doel | `currentGoalId` immutable afleiden en `selectedEntryId` als aparte UI-state beheren |
| JNY-05 | Mouse drag | Pointer down/up over 48px selecteert één buur | PARTIAL | Geen vloeiende camera, geen pointermove/axis lock, drag-clickonderdrukking of begin/eindbereik in één gesture | Camera-offset en gecontroleerde drag state implementeren met snap en click suppression |
| JNY-06 | Trackpad/WheelEvent-proxy | Dominant horizontale `deltaX` selecteert na drempel één buur en laat verticaal wheel vrij | PARTIAL | Geen vloeiende camera/accumulatie over de route en geen E2E proxybewijs | Routepan/snap uitbreiden en browserbewijs toevoegen zonder fysieke hardwareclaim |
| JNY-07 | Touch swipe zonder scrollhijack | Pointer-up drempel plus CSS `touch-action: pan-y` | PARTIAL | Geen dominante-as-hysterese/pointercapture na lock; diagonale jitter en markerstart onbewezen | Herbruikbare axis-lock state machine en touch-E2E voor scroll, jitter en markers toevoegen |
| JNY-08 | Keyboard, accessibility tree en screenreadersemantiek | Child gebruikt `<ol>`, pijlen/Home/End en `aria-label`; parentrail is een `<div>` | FAIL | Maximaal vijf items bestaan semantisch; `aria-current` volgt selectie; Enter/Space/detail/focusreturn onvolledig | Volledige ordered list, roving/tab-contract, echte current semantics, popupsemantiek en axe/focustests |
| JNY-09 | Eenmalige tooltip | Alleen permanente instructietekst bij parentcontrols | FAIL | Geen versiegebonden helpscope, dismiss of storagefallback | Niet-persoonlijke versioned browserflag plus memoryfallback en blijvende SR-instructie |
| JNY-10 | Popup/preview per entrytype | Parentdetail staat initieel open; child heeft vaste detailkaart en deeplink | FAIL | Geen pinned-on-activation popup, entrytypes, closeknop, dialog/popoversemantiek of outside-click/focusreturn | Gedeelde childveilige entry-popupstate en lichte focus/hoverpreview implementeren |
| JNY-11 | Chronologische interstitial badge-/mijlpaalinsertie | Child DTO levert verdiende badges los van journey; snapshots bewaren badge-ID's | FAIL | Geen timeline-adapter, ankers of interstitial rendering | Alleen verdiende child-safe badge-instances deterministisch als journey-events projecteren |
| JNY-12 | Cluster, duplicaten en gelijke timestamps | Awardquery is per award-ID; snapshotarray sorteert `awarded_at, id` | PARTIAL | Geen journeyclustering/deduplicatie of toegankelijke cluster | Instance-ID-dedupe, stabiele tiebreakers en bedienbare clusters toevoegen |
| JNY-13 | Surpriseprivacy | Awardquery filtert `awarded` + `parent_visible`; locked catalogquery sluit surprise uit; bestaande boundarytests slagen | PASS | Geen actuele leak gevonden; interstitial-adapter mag filter niet omzeilen | Bestaande serverfilter hergebruiken en netwerk/HTML/RSC/DOM-regressietest uitbreiden |
| JNY-14 | Mascot following | Eén losse decoratieve asset wordt statisch gerenderd | FAIL | Mascotte volgt current/selected entry niet | Per recipe genormaliseerde collisionbox en geselecteerde-entry docking invoeren |
| JNY-15 | Mascot endpoint- en swept-path-collision avoidance | Alleen vaste CSS-positie/z-index | FAIL | Marker, label, popup, tooltip en vaste UI kunnen overlappen; beweging heeft geen routeplanner | Deterministische kandidaatselectie, exclusion zones, fallbackdock/crossfade en meetbare settled-state toevoegen |
| JNY-16 | Responsive/reduced motion | Eigen desktop/mobile scenery; `prefers-reduced-motion` verkort bestaande transities | PARTIAL | Gesture-, popup-, tooltip-, zoom- en mascot-reflow niet volledig bewezen | Volledige viewport/orientation/reflow/motionmatrix en CSS-states toevoegen |
| JNY-17 | Snapshots en chapter transition | Additieve tabel, unieke key, trigger op assignment en `on conflict do nothing` | PARTIAL | Snapshot is immutable/idempotent, maar actieve completionpositie en superseding revisionflow zijn niet in JourneyEngine bewezen | Snapshotcontracttests uitbreiden; actieve order apart stabiliseren zonder snapshotmutatie |
| JNY-18 | Zeven-themapariteit | Eén childcomponent en zeven manifests; vijf mascotte- en twee no-mascotrecipes bestaan | PARTIAL | Geometry/collision/no-reserved-space is niet thema-/viewportbreed bewezen | Eén engine behouden en alle recipes in 86-render/630-collisionmatrix testen |
| JNY-19 | Parentpreview ongewijzigd conform goedgekeurde compositie | Parent gebruikt een eigen professionele projectie; bestaande visuele matrix heeft 322/196-contract | PASS | Volledige childinteractie mag niet teruglekken; gerichte parentregressie ontbreekt in journeyset | Parentcomponent functioneel ongemoeid laten en screenshot/contractregressie toevoegen |
| JNY-20 | Performance en geen layout shift | Production assets zijn gereduceerde AVIF/WebP-renditions; geen 8K runtimepad gevonden | PARTIAL | Geen journey-specifieke LCP/CLS/Lighthouse/interaction-latency of motion-settled bewijs | Deterministische performanceprobe en layout-/overflow-/consolechecks toevoegen |

## Schema-auditbesluit vóór herstel

Een schema-additie is gerechtvaardigd voor de actieve, eenmaal toegekende completionvolgorde: effectieve beoordelingsobservaties alleen zijn veranderlijk door correcties en leveren daarom geen bevroren position key. De additie moet tenant-scoped, RLS/force-RLS, append-only of gecontroleerd supersedable, idempotent en veilig voor lege/stagingdata zijn. Bestaande hoofdstuksnapshots blijven intact en worden niet herschreven.

## Baselinebeperkingen

- De bestaande unit-tests bewijzen vooral broncontracten en selectielogica; zij bewijzen geen echte browsergesture, popupgeometry of accessibility tree.
- Er is in deze omgeving nog geen fysieke trackpad- of echte NVDA/VoiceOver/TalkBack-smoke uitgevoerd. WheelEvent-, axe- en focustests zullen alleen het werkelijk geautomatiseerde bereik claimen.
- Geen remote database, productieomgeving, deployment of merge wordt gebruikt in deze herstelsprint.

## Geconsolideerd herstelrapport

### Eindbeeld

De childjourney op `/kind` en `/kind/reis` gebruikt één gedeelde, datagedreven Journey Engine voor zeven thema's. Alle veilige DTO-items en werkelijk verdiende child-visible badge-instances bestaan exact eenmaal in de semantische route. `currentGoalId`, `selectedEntryId` en popupstate zijn gescheiden. Een additieve, tenant-scoped en immutable completion sequence bevriest de historische hoofdonderdeelvolgorde; bestaande observaties worden expliciet als `legacy_inferred` vastgelegd.

De oorspronkelijke checksum-locked PNG-artworkbestanden zijn niet gewijzigd. Reproduceerbare AVIF/WebP-renditions en kleine transparante mascot-renditions verlagen het mobiele sceneryverkeer van circa 2,77 MB naar circa 69 KB. De formele Lighthousefixture (Chrome for Testing 151, production build, desktop preset, 1280×720, DPR 1) scoort Performance 100, LCP 655 ms, CLS 0, TBT 0 ms en Speed Index 452 ms.

### Requirementmatrix na herstel

| ID | Oorspronkelijk | Oorzaak | Gewijzigde hoofdbronnen | Test/bewijs | Eindstatus |
| --- | --- | --- | --- | --- | --- |
| JNY-01 | FAIL | DOM bevatte alleen een vijf-items focusvenster | `portal-journey-contract.ts`, `child-journey-map.tsx` | 30-item Playwrighttest; `0/1/4/7/12/30` unitfixtures | FIXED |
| JNY-02 | PARTIAL | rating-5 timestamp was geen bevroren position key | migration, `swim-progress.ts`, childprojectie | schema- en completion sequence-tests | FIXED |
| JNY-03 | PARTIAL | lege/voltooide state en volledige camera onbewezen | engine, map, harness | current/empty/completed E2E en routegeometrytests | FIXED |
| JNY-04 | FAIL | selectie overschreef semantisch huidig doel | engine, map | selected/current unit- en E2E-test | FIXED |
| JNY-05 | PARTIAL | geen direct drag/click suppression | map | Chromium mouse-dragtest | FIXED |
| JNY-06 | PARTIAL | wheelproxy niet browserbewezen | map | horizontale WheelEvent-proxytest | FIXED |
| JNY-07 | PARTIAL | geen dominante axis lock | engine, map | trusted Chromium-CDP touch, jitter en verticale scroll | FIXED |
| JNY-08 | FAIL | onvolledige tree en focus/popupflow | map, CSS | keyboard Home/End/Enter/Space/Escape, axe, 48px | FIXED |
| JNY-09 | FAIL | geen versioned helpscope/storagefallback | map | first visit, herbezoek, blocked storage, themeswitch | FIXED |
| JNY-10 | FAIL | statische detailkaart, geen activatiepopup | map, CSS | current/completed/badge/surprise popup + focusreturn | FIXED |
| JNY-11 | FAIL | awards stonden niet in timeline | `child-portal.ts`, engine | voor/tussen/na, live insertie en deeplinks | FIXED |
| JNY-12 | PARTIAL | geen dedupe/cluster/tiebreaker | engine, map | duplicate delivery, gelijke timestamp en compacte clusters | FIXED |
| JNY-13 | PASS | serverfilter was al fail-closed | childprojectie uitgebreid zonder querygrens te omzeilen | projectiontest en locked/surprise source boundary | PASS |
| JNY-14 | FAIL | mascot was statisch | map, engine | vijf mascotrecipes × selectionstates | FIXED |
| JNY-15 | FAIL | geen geometrische planner of swept fallback | engine, map | 630 echte DOM-eindstates + vijf benoemde swept cases | FIXED |
| JNY-16 | PARTIAL | responsive/reduced/zoom niet volledig bewezen | map, CSS | 14 viewports, reduced motion, landscape, 200% reflow | FIXED |
| JNY-17 | PARTIAL | actieve completionpositie niet immutable | migration en bestaande snapshotflow | append-only/schema/snapshotcontracttests | FIXED |
| JNY-18 | PARTIAL | zeven-themegeometry onbewezen | gedeelde map + renditions | 86 renders; vijf mascot- en twee no-mascotthema's | FIXED |
| JNY-19 | PASS | parentprojectie moest geïsoleerd blijven | parentcomponent niet functioneel gewijzigd | parent/child contract 27/27; 322/196 uitvoering vereist stagingfixtures | PASS (releasebewijs open) |
| JNY-20 | PARTIAL | geen journey performancebewijs | renditionscript, map, visual E2E | LCP 180 ms/CLS 0/Event Timing 72 ms; Lighthouse 100 | FIXED |

### Datamodel en rollback

Migration `20260812120000_stable_journey_completion_sequence.sql` voegt `public.portal_journey_item_completions` toe met tenant-safe samengestelde foreign keys, unieke item- en sequenceconstraints, force-RLS, least-privilege grants, tenant-/chaptergebonden advisory locking, idempotente insert en append-only bescherming. Nieuwe rating-5-observaties krijgen `event_sequence`; bestaande waarnemingen krijgen deterministisch `legacy_inferred`. De bestaande chapter snapshots blijven ongewijzigd.

Rollback vóór rollout: featurebranch terugdraaien en de additieve tabel, twee private triggerfuncties en twee triggers verwijderen. Na gebruik wordt de tabel niet stil verwijderd: completionhistorie is dan producthistorie en vereist een geauditeerde export/rollbackbeslissing. Er is conform opdracht geen lokale of remote database gemuteerd.

### Uitgevoerde gates

- Baseline: 32/32 tests; typecheck groen.
- `pnpm run test:portal-themes`: 53/53 groen.
- `pnpm run test:parent-child-portals`: 27/27 groen.
- `pnpm run lint`: groen (repositorylint is `tsc --noEmit`).
- `APP_ENV=test pnpm --filter @nxttrack/web build`: groen.
- `pnpm run db:audit`: 135 migrations gecontroleerd, groen.
- `pnpm run db:rls-audit`: groen; uitsluitend de bestaande waarschuwingen voor bewust niet aan `authenticated` toegekende private triggerfuncties, inclusief de twee nieuwe functies.
- Chromium production-build kernflow: 10/10 groen.
- DOM-collisionmatrix: exact 630/630 groen (5 mascotthema's × 14 viewports × 9 states), harde 12px-clearance.
- Swept-motion: current→first, first→last, last→interstitial, popupinterruptie en resizeinterruptie groen.
- Journeyvisuals: exact 86/86 groen; 56 basis + 21 Ocean-selecties + 5 dense + 2 no-mascot + landscape + 200%-reflow.
- Playwright performance: LCP 180 ms, CLS 0, maximale Event Timing 72 ms, geen overflow/consolefouten/kapotte runtime-images.
- Lighthouse: Performance 100, LCP 655 ms, CLS 0, TBT 0 ms, Speed Index 452 ms op het hierboven beschreven vaste profiel.

Artifactnamen, fixtures, viewports en tellers staan machineleesbaar in `docs/evidence/journey-audit/artifact-manifest.json`. De workflow uploadt `apps/web/test-results` en `apps/web/playwright-report` veertien dagen bij de PR.

### Open releasegates

1. Firefox en WebKit konden lokaal niet starten door ontbrekende hostlibraries (Firefox: GTK/Pango; WebKit: GTK/GStreamer/WebKit-libraries) en er is geen sudo. `.github/workflows/ci.yml` installeert nu Chromium, Firefox en WebKit met dependencies en draait de volledige journeysuite. De draft PR blijft niet-mergeklaar totdat deze run groen is.
2. De bestaande authenticated stagingmatrix van 322 canonieke renders en 196 dashboardviewportcases is in deze lokale run niet opnieuw uitgevoerd: de benodigde accounts/fixturestate ontbreken en deze opdracht verbiedt remote-databasetoegang. De contracttellers blijven exact 322/196 en zijn niet verlaagd; feitelijk deze run: 0/322 en 0/196. De unieke samengestelde contractunion is 408 (322 + de afzonderlijke 86 journey-artifacts); feitelijk lokaal gegenereerde union: 86.
3. Fysieke trackpad- en NVDA/VoiceOver/TalkBack-smokes zijn niet uitgevoerd; WheelEvent/CDP-touch, axe en focustests claimen alleen hun geautomatiseerde bereik.

Er is niets gemerged of gedeployed; rolloutflags blijven uit. De branch mag worden gepusht om CI en PR-artifactopslag te laten draaien, maar de draft PR mag pas mergeklaar na beide bovenstaande geautomatiseerde releasegates.

| Bevestiging | Ja / Nee / Geblokkeerd | Bewijs |
| --- | --- | --- |
| Journey volledig datagedreven | Ja | gedeelde Journey Engine en child-safe serverprojectie |
| Alle onderdelen aanwezig, bereikbaar en correct geordend | Ja | 30-item E2E; dynamische unitfixtures |
| Oudste/eerst behaalde onderdeel vooraan en historisch bevroren | Ja | immutable completion sequence + schema/unitbewijs |
| Huidig doel initieel correct gefocust | Ja | current-goalselectie, camera- en E2E-bewijs |
| Vrij bewegen met mouse, trackpad, touch en keyboard | Ja | Chromium production-build kernflow 10/10 |
| Mobiele paginascroll blijft intact | Ja | trusted CDP-touch plus `window.scrollY`-assertie |
| Eenmalige tooltip werkt toegankelijk | Ja | first visit/herbezoek/storage/themeswitchtests |
| Badges en mijlpalen correct tussengevoegd | Ja | voor/tussen/na, cluster, dedupe en live insertie |
| Popupinteracties per entrytype volledig | Ja | current/completed/badge/surprise en focusreturn |
| Mascotte naast entry, meebewegend en collisionvrij per mascottethema | Ja | 630/630 DOM-eindstates + swept cases |
| Default en Nationaal correct zonder mascotte | Ja | no-mascot E2E en gerichte renders |
| Responsive en reduced motion groen | Ja | 14 viewports, landscape, 200% en reduced motion |
| Parent/child-isolatie en surpriseprivacy behouden | Ja | contracttests 27/27 en serverqueryboundary |
| Alle tests, renders en bewijsartifacts groen | Geblokkeerd | lokale Chromiumsets groen; Firefox/WebKit en authenticated 322/196 wachten op CI/staging |
| Resterende afwijkingen: geen | Nee | twee expliciete externe releasegates hierboven |
