# FASE 0 — Main reconciliation vóór V4.2

> Actuele FASE 0.1-status staat onderaan. De onderstaande FASE 0-runs zijn
> historische resultaten; hun rode audit is in FASE 0.1 opnieuw uitgevoerd en groen.

Datum: 13 september 2026. Branch: `codex/main-reconciliation-v42-prep`.
Base: `0fa158fb0abc7fdfe781a103a4c83b016edcba45`; opnieuw gefetcht vóór publicatie,
zonder verandering van origin/main. Dit is een reviewbare cleanup, met een
**nog rode dependency-audit**. Dit rapport geeft geen productie-GO.

## Scope en canonieke uitkomst

Main krijgt de nog geldige pre-V4.2 architectuur uit de portal-, core- en
certificeringsfamilies. De bestaande main-canon voor beoordelingen, curriculum,
carry-over, planning, billing, native API en privacy blijft behouden. Er is geen
V4.2 UI, theme importer, Default 1.1 of ander productonderdeel uit het overdrachtspakket
geïmplementeerd. De bestaande v1 portalconsumers en hun zeven reeds bestaande
theme releases zijn onderdeel van de eerdere architectuur, geen V4.2-port.

De pakketdocumenten zijn context binnen de expliciete FASE 0-opdracht. De
README, reconciliation-instructie, execution policy en Git/baseline-secties zijn
gelezen vóór de ports. De oorspronkelijke vuile checkout en andere worktrees
zijn behouden. Zie [BASELINE.md](BASELINE.md).

## Inventaris en beslissingen

De [reconciliation-ledger](docs/audits/2026-09-13-main-reconciliation.md) en zijn
JSON-bijlagen dekken **70 refs, 54 PRs, 230 broncommits en 365 bronbestanden**.
De eerste inventaris staat in commit `d539421`, vóór de runtimewijzigingen.

| Bron/familie | Definitief besluit |
| --- | --- |
| Main `0fa158f`; main-in-portalen merge `2ac2e93` | Beide hebben tree `f65f649e0b1f1366a5d1eb16d782e345fcd61b08`. 143 historische ancestors leveren geen netto runtimeport op. |
| Portalen `68d4a79`; open PR #56 naar staging | Geldige session/privacy/journey/theme-contracten met hun bestaande consumers semantisch geport. PR #56 blijft ongewijzigd. |
| Core `4e37846` en certificering `db9806f` | Outbox, atomische provisioning, capaciteit, resumable import, business dates, grant- en releasehardening samen met hun latere correcties geport. |
| Open contrast-PR #55; lokale adminselectorfix | Superseded door nieuwere semantische contrastcode respectievelijk huidige main-testcontracten. |
| Tijdelijke previewdeploys en preview-SHA-tests | Superseded; geen featurebranch-allowlists of automatische previewmigraties op canonical main. |
| Juridische inventaris, oude inputprompts/screenshots/audits | Historie/evidence. Nuttige operationele docs zijn behouden met historische context; 44 bronbestanden blijven uitsluitend via immutable bronlinks beschikbaar. |

Definitieve commitclassificatie: **143 ALREADY_PRESENT, 61 KEEP_AND_PORT,
19 SUPERSEDED, 7 DOCS_OR_EVIDENCE_ONLY**. Van de 365 bronbestanden zijn 301
bronidentiek aanwezig, 20 aan main/historische context aangepast en 44 alleen
op de immutable bron bewaard. Cleanup en open reviewpunten staan afzonderlijk
in de ledger; geen remote branches of bestaande PRs zijn gesloten/verwijderd.

## Logische implementatiecommits

| Commit | Concrete wijziging |
| --- | --- |
| `d539421` | Baseline, ref-/PR-/commit-/fileinventaris en voorafgaande classificatie. |
| `d87aa78` | Sessiebinding, ouderreauth, child-safe DTO/media, persistente journey history, bestaande v1 routes en theme lifecycle; zeven-theme fixtures. |
| `12b4885` | Fail-closed outbox en providergrenzen; atomische tenant/participant/intake/capaciteitswrites; resumable import; concept-only nieuwsbrief; business dates; gecertificeerde grant/crash/restore-correcties; Node 24 en bronfixes voor dependencies. |
| `e1b8cb6` | Main-only release, exact-source checkout, immutable ancestry-equivalent, maintenance vóór migratie, pre/post-schema- en rollbackgates; CI draait alle unitcontracten. |
| `8a72f88` | Twee bewezen ongebruikte ouderdashboardcomponenten verwijderd; actuele README en paritybeschrijving gecorrigeerd. |
| `2f4317e` | Bestaande journey gebruikt consistente coördinaten binnen de CSS-rand; mobiel screenshotbewijs op CSS-schaal; extra anonieme child-route/API-regressies. |

De laatste documentatiecommit sluit de ledger en de verificatie af. De geteste
runtime staat op `2f4317e`; daaropvolgende wijzigingen zijn documentatie/evidence.

## Bewezen cleanup en bewuste bewaring

Alleen `FamilyCommandCenter` en `PortalOverviewHero` zijn als obsolete code
verwijderd. Exacte naam- en padzoekopdrachten vonden vóór verwijdering uitsluitend
eigen definities en één verouderde documentatierij, zonder imports of routeconsumers.
`/portaal` gebruikt ParentOverviewTop; `/kind` gebruikt ChildJourneyMap.
Build vóór verwijdering en typecheck/444 units erna zijn groen; finale build en
browserchecks dekken de overblijvende consumers. Het
[cleanupbewijs](docs/audits/2026-09-13-main-reconciliation/cleanup.json) bevat de zoekresultaten.

PortalJourneyEngine, overview recipes, actieve featureflags, native apps/API,
historische theme releases en snapshot-/historycompatibiliteit blijven behouden.
**Alle 130 main-migraties en alle 147 bronmigraties zijn byte-identiek**: 17
bronmigraties toegevoegd, nul herschreven/verwijderd. Zie de per-bestand SHA-256s
in [migration-integrity.json](docs/audits/2026-09-13-main-reconciliation/migration-integrity.json).

## Schema, rollback en vereiste mergevorm

De historische schemafloor `541fe5fd6cee083cb809eef236382cfd2d519ed3` blijft
ongewijzigd. De semantische port heeft die broncommit niet als ancestor.
Daarom accepteert de release-/rollbackcontrole ook uitsluitend de expliciet
vastgelegde equivalent `12b4885a55c439caa2a7aa180d597e72baf9d2d5`. Op dat
commit zijn apps/web, package/lockfile en alle migraties exact gelijk aan
`db9806f`. Vier tests bewijzen acceptatie van deze lineage en weigering van oude
main, ontbrekende ancestors, andere floors en ongeldige SHAs. Er is geen
environment bypass of afgeschakelde ancestrycheck toegevoegd.

**Merge deze PR met een merge-commit; gebruik geen squash of rebase.** Het
genoemde compatibiliteitsanker moet in de ancestry van main blijven. Na merge
wordt de nieuwe origin/main-SHA de enige base voor FASE 1/V4.2.

Deploy blijft uitsluitend handmatige main-dispatch. Een migrerende release
vereist maintenance/no-write, uitgeschakelde mail/nieuwsbrief/jobs, een
compatibele rollbacktarget, een aantoonbaar onderhoudsantwoord van de oude
runtime, preflight vóór en na migratie en een geslaagde schemasamenhang vóór
activatie. Ontbrekende operationele voorwaarden blokkeren de release.

## Checks op de gereconcilieerde runtime

Alle checks hieronder zijn lokaal uitgevoerd op Node 24.18.0 / pnpm 10.24.0.
De [validation-bijlage](docs/audits/2026-09-13-main-reconciliation/validation.json)
legt commando's, loghashes en bekende eerdere afwijkingen vast.

| Check | Resultaat |
| --- | --- |
| Frozen install, typecheck (`lint` gebruikt dezelfde tsc) | PASS |
| Alle unitcontracten | **444 passed, 0 failed, 0 skipped**; baseline was 328 |
| Productiebuild en standalone-assets | PASS, ook na cleanup en journeycorrectie |
| Release truth, design, auth, migrations, RLS, Sprint31, Journey Bot, runtime-env audits | PASS |
| Workflow-YAML en shellsyntax | PASS: 213 workflow-runblokken syntactisch gecontroleerd; geen volledige actionlint-run |
| Upgrade vanaf lege main-database | PASS: 130 main-migraties → 147; 242 → 251 public tabellen |
| Fresh secure-default clean room | PASS: 147 exacte migraties; 251/251 RLS + FORCE RLS; vijf private buckets; 13 service-only RPC-contracten; nul public/anon functiegrants |
| DB-domeinregressies, beide grantprofielen | PASS: acht zwemcanon-SQL-suites, planningconcurrency, outbox, tenantprovisioning, onboarding/capacity (20/100 gelijktijdig), 5.000-rijen import/restart/rollback, certificering en crashwindows |
| Lokale Data API-/storage-/rollenmatrix | PASS: **102 assertions per profiel**, legacy en secure, met fictieve tenants |
| Supabase security advisors, level/fail-on error | PASS: beide eigen lokale databases, nul errors; waarschuwingen niet onderdeel van deze extra check |
| Browser smoke/a11y/performance, Chromium desktop + mobiel | **52 passed**, inclusief /kind, /kind/reis en no-store/401 op child session API |
| Journey Chromium: interaction, axe, 48px, reduced motion, geometry, renders, performance | **13 unieke tests groen**, waaronder 630 DOM-eindstates met 12 px vrije ruimte en 86 renders over zeven themes |
| Maintenance browsercontract, desktop + mobiel | **2 passed** |
| Production dependency audit | **FAIL: 4 advisories — 2 critical, 1 high, 1 moderate**, tegen 7 op de ongewijzigde baseline |

## Afwijkingen, herstel en beperkingen

Eerdere uitvoerpogingen zijn niet als groen bewijs geteld. De runtime-env audit
miste aanvankelijk de bijgewerkte REQUIRED_ENVIRONMENT_VARIABLES-documentatie;
na het porten daarvan slaagt hij. De rollenmatrix vereiste eerst de bestaande
synthetische twee-tenantfixture. Voor secure-default bleek CLI-config alleen
onvoldoende: de stack is opnieuw vanaf leeg gemaakt met PostgreSQL-default-
privilegerevocation vóór alle migraties; de sentinel bewijst nu het juiste profiel.
De finale journey-run had 12 groene tests en één ENOSPC tijdens het wegschrijven van renders; alleen de 86-render-test is opnieuw uitgevoerd met eigen shared-memory temp/output. Lokale advisors gebruiken expliciet `sslmode=disable` op loopback omdat deze
disposable stacks geen TLS aanbieden.

De eerste journey-run had een niet-stabiele eindpositiesignalering; een geïsoleerde
herhaling slaagde, maar de meting liet een rand/coördinatenverschil zien.
De correctie houdt de bestaande toleranties en vrije ruimte in stand. De lange
mobiele marketingpagina was 15.673 CSS-pixels hoog bij DPR 2.625 en kon niet als
volledige native-resolutie-screenshot worden opgenomen; CSS-schaal behoudt de
volledige pagina en dezelfde smoke-asserties.

De workspace had schijf- en Docker-runtime-inodeproblemen. Alleen eigen
buildartefacten en aantoonbaar oude, ongeopende Docker-exec-FIFOs zijn opgeruimd;
geen bestaande databasevolumes of gebruikersbestanden. De finale build gebruikt
weer een echte lokale `.next` directory. Beide testdatabases zijn uitsluitend
voor deze taak gemaakt; providers stonden uit en alle records zijn fictief.
Beide eigen teststacks zijn na verificatie gestopt en hun disposable data verwijderd.
De 86 succesvolle renders zijn lokaal bewaard met een
[artifactmanifest](docs/audits/2026-09-13-main-reconciliation/journey-artifacts.json).

Firefox/WebKit zijn geïnstalleerd maar hier niet uitgevoerd: benodigde GTK/NSS/
media-systeembibliotheken ontbreken. CI behoudt de drie-engine journeygate.
Geauthenticeerde externe stagingflows, Journey Bot-stagingwindows, echte
providerchecks en remote restore/deployrehearsals zijn niet uitgevoerd. Hun
vereiste configuratie is niet omzeild en historische bewijsclaims tellen niet mee.

## Open risico's en beslissing voor de reviewer

1. De dependency-audit rapporteert reeds op main aanwezige advisories in Next
   16.2.11 (twee critical), sharp 0.35.0 (high) en baseline-browser-mapping
   (moderate). De audit noemt patches vanaf respectievelijk 16.3.3, 0.35.4 en
   2.11.0. Geen ongevraagde frameworkupgrade, allowlist of lagere auditthreshold
   toegepast. CI blijft hierop rood; gerichte dependencyremediatie is nodig vóór
   release. Zie [de behouden audituitvoer](docs/audits/2026-09-13-main-reconciliation/logs/final-security-audit-dependencies.log).
2. Gebruik een merge-commit om het immutable schema-/rollbackanker te behouden.
   De eerste toekomstige release vereist afzonderlijke operationele verificatie
   van maintenance, huidige DB-lineage, rollbacktarget en herstelbewijs.
3. Dit is een brede maar geclassificeerde reconciliatie. Lokale contract-, DB- en
   geselecteerde browserchecks leveren geen bewijs van de actuele externe
   staging-/productieconfiguratie of Firefox/WebKit-uitvoering.

Er is uitsluitend een featurebranch-publicatie en PR naar main toegestaan.
Er is niets gemergd of gedeployd; geen remote database, echte mail of betaling
is uitgevoerd. De gebruiker beslist over de cleanup-PR en start V4.2 pas vanaf
de daarna bijgewerkte main.

## FASE 0.1 — review and dependency closure

Uitgangspunt opnieuw gefetcht: PR #57, branch `codex/main-reconciliation-v42-prep`,
HEAD `0228c7d387dcfbb448b661febca750f30d514053`; er waren bij aanvang geen nieuwere
remote commits. De acht bestaande commits en hun ancestry zijn behouden. Geteste
codehead: `1d9243dc11f4c0b97c0a032aac6f3171f48d2e2d`. Publicatie-, CI- en tweede-reviewbewijs wordt hieronder
apart toegevoegd; de historische FASE 0-resultaten hierboven blijven ongewijzigd.

### Reviewafhandeling

- **P1 compatibility-anchor**: `git merge-base --is-ancestor
  12b4885a55c439caa2a7aa180d597e72baf9d2d5 HEAD` geeft exit 0. De review noemt
  een afgevlakte review-SHA `60b66a9`, niet de werkelijke PR-head. De correcte
  ancestryhelper en de schemafloor zijn behouden. Een nieuwe regressie maakt een
  checkout met uitsluitend `refs/heads/main`; de acceptatie van de echte head en
  weigering van oude main zijn bewezen. Ook de bestaande schema- en rollback-CLI
  slagen met `GITHUB_WORKSPACE` naar zo'n canonical-main checkout, 147 lokale
  migraties en uitsluitend een synthetisch rollbackartefact. Geen deploy uitgevoerd.
- **P2 child badge**: earned releases selecteren nu ook `stable_key`. De werkelijke
  child-projectie vergelijkt earned/locked op die logische identiteit, bewaart de
  historische award-ID, titel en datum, en behoudt tenantprioriteit, releasekeuze,
  lifecycle/audience en surprisegeschiedenis. Acht gedragsregressies dekken huidige
  en oudere awards, nooit verdiende keys, onafhankelijke keys, tenantoverrides,
  surprise/history en ontbrekende historische releases.
- Beide oorspronkelijke threads worden met dit bewijs beantwoord en pas daarna
  resolved. Een nieuwe Codex-review op de gepushte head blijft een verplichte gate.

### Productieadvisories en kleinst veilige update

| Advisory | Ernst | Dependency vóór → na | Kwetsbaar / patched | Pad en aard |
| --- | --- | --- | --- | --- |
| [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) | critical | next 16.2.11 → 16.3.3 | >=16.0.0 <16.3.3 / >=16.3.3 | apps/web → next, direct |
| [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) | critical | next 16.2.11 → 16.3.3 | >=16.0.0 <16.3.3 / >=16.3.3 | apps/web → next, direct |
| [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | high | sharp 0.35.0 → 0.35.4 | <0.35.4 / >=0.35.4 | apps/web → sharp, direct; ook Next optional |
| [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | moderate | baseline-browser-mapping 2.10.38 → 2.11.0 | >=2.0.0 <2.11.0 / >=2.11.0 | apps/web → next → mapping, transitief |

De gekozen versies zijn de eerste patched upstreamversies. Next blijft major 16;
React/DOM 19.2.7, Node 24.18.0 en Playwright 1.61.1 voldoen aan de gepubliceerde
peer-/engine-ranges. Next accepteert Sharp ^0.35.3 en browser-mapping ^2.9.19.
De bestaande Sharp-override is verhoogd; een gerichte
`next>baseline-browser-mapping: 2.11.0` override houdt de transitieve resolutie op
de kleinste veilige versie binnen die range. Geen audit-ignore, allowlist,
thresholdwijziging, force-fix of verwijderde dependency om de audit te verbergen.

Next env/SWC en Sharp-platformpakketten volgen hun upstream parentversies;
libvips gaat 1.3.0 → 1.3.3, @swc/helpers 0.5.15 → 0.5.23 en @emnapi/runtime
1.11.1 → 1.11.3 volgens de nieuwe packagegraph. Alle 40 gewijzigde packagenamen
staan afzonderlijk in `phase-0.1/dependency-version-changes.json`; metadata,
exacte ranges en paden staan in de aangrenzende JSON-bijlagen.

De nieuwe native graph bracht een bestaande standalone-copyfout aan het licht:
kopiëren over al getracete pnpm-links gaf `ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY`.
De packaging vervangt nu de betreffende pakketdirectory en bewaart relatieve
symlinks. Een echte scriptregressie bewijst tweemaal packagen en verplaatsen zonder
brondependencies. Daarnaast slagen PNG/WebP/AVIF encode/decode/resize met Sharp
0.35.4 en HEIF 1.23.2, ook via de Next image optimizer in een verplaatst volledig
standaloneartefact; alle Sharp/libvips shared objects resolven binnen dat artefact.
Nexts gegenereerde root-params typeverwijzing is meegenomen.

### Nieuwe lokale verificatie

- Clean install na verwijderen van alleen de eigen node_modules, met frozen lockfile:
  PASS. Productie-audit: **4 → 0 advisories**, ook de ongewijzigde moderate-gate PASS.
- Typecheck, **454 units (0 failed/skipped)**, truth, Lovable, Journey Bot,
  runtime-env, auth, migratie-, RLS- en Sprint31-audits: PASS.
- Productiebuild en standalone packaging/relocatie: PASS.
- Beide eigen lokale profielen, legacy en secure: **147/147 migraties**, clean-room,
  upgradepreflight en schemaassertie PASS; 8 zwemcanon-SQL-suites, planningconcurrency,
  outbox, provisioning, onboarding/capaciteit, 5.000-rijen import/restart/rollback,
  certificering en crashwindows PASS. API/storage/rollenmatrix: **102 assertions
  per profiel**. Security advisors op errorniveau: geen errors. Geen migratie gewijzigd.
- Chromium smoke desktop/mobiel: **52 PASS**. Maintenance: **1 PASS** met het
  bestaande maintenance-script. Chromium journey-herhaling loopt na lokale
  tijdelijke-opslaguitputting; nog geen volledige PASS-claim voor die herhaling.
- Lokale Firefox/WebKit-hostlibraries blijven een beperking. De ongewijzigde
  GitHub CI installeert alle drie engines met `--with-deps`; die run moet werkelijk
  tot de browsergate komen. Geen niet-uitgevoerde test als PASS geteld.

De eerste browserpoging miste Chromiumbestanden achter oude cachelinks; opnieuw
installeren loste dat op. De eerdere journey-poging strandde op
`ERR_INSUFFICIENT_RESOURCES`/`ENOSPC` in de gedeelde tijdelijke opslag. De
herhaling gebruikt eigen temp/output op lokale schijf; geen toleranties of tests
versoepeld. De lokale databases zijn na de suites gestopt en verwijderd.

Een **aanvullende, niet in canonical CI opgenomen PL/pgSQL-lintcheck** meldt op
beide profielen drie bestaande ambigue kolomreferenties: `status` in
`app_private.execute_due_portal_theme_schedules`, `actor_user_id` in
`app_private.undo_season_blackout_v3` en `program_id` in `public.apply_import_chunk`.
Dit is geen PASS en geen security-advisoruitkomst. De eerste twee functies staan
al op origin/main; de derde komt uit de eerder geporte bron. Hun SQL is in FASE
0.1 ongewijzigd. Diagnostiek blijft zichtbaar als afzonderlijk risico; bestaande
migration-/RLS-/importcontracten zijn aantoonbaar groen. Historische migraties en
schemafloor zijn hiervoor niet herschreven.

### GitHub-verificatie en exitstatus

Historische Web CI `34762394259` op `0228c7d` faalde bij de vier advisories;
die eerdere skipstatussen worden niet achteraf gewijzigd. Android native CI
`34762394257`, dezelfde exacte SHA, is inmiddels **SUCCESS**, inclusief native
contract/lint/tests/debug- en instrumentation-APK-build. FASE 0.1 wijzigt geen
Android/Gradle/native API-contract; eventuele automatische Android-run op de PR
wordt gevolgd zonder een ongegronde handmatige rerun.

Nieuwe Web CI en tweede Codex-review: **PENDING publicatie**. PR #57 blijft open;
merge-ready wordt uitsluitend na de actuele groene CI- en reviewgates gemeld.
Het bestaande aparte deploy-workflowresultaat `34762363783` had geen jobs en
faalde op workflowvalidatie; er is geen deployment uitgevoerd of gestart.

**Merge-commit blijft verplicht; niet squashen/rebasen. Main is niet gemergd en
er is niets gedeployed. Geen V4.2-code, importer, Default 1.1, remote DB-wijziging
of echte mail, betaling of notificatie toegevoegd/uitgevoerd.**

### Tweede review en correctieronde op `6a7c0fc`

De eerste nieuwe publicatiehead `a529056475d0a809f5bfe78b02d227137f9c1df5`
heeft inmiddels volledig groene [Web CI 34765275679](https://github.com/nxttrack/platform/actions/runs/34765275679)
en [Android native CI 34765275669](https://github.com/nxttrack/platform/actions/runs/34765275669).
Web CI bereikte alle eerder overgeslagen stappen: audit nul advisories,
454 units, build, packaging, browserinstallatie, 52 smokechecks en de volledige
journeygate: **31 PASS, 17 expliciete SKIP**. Chromium draaide 13 tests,
Firefox 9 en WebKit 9. De 17 skips zijn de bestaande negen externe staging/botcases,
twee Chromium-only touchcases en zes geometrie/render/performancecases die slechts
eenmaal in Chromium draaien. Firefox/WebKit zijn daarmee werkelijk uitgevoerd;
geen infrastructurele skip is als PASS geteld. Android bouwde ook de unsigned
releasebundels. Dit was een automatische run volgens het ongewijzigde pathfilter.

Codex-review `5191141978` op `a529056` vond daarna **twee P1 en één P2**:

| Thread | Correctie | Regressiebewijs |
| --- | --- | --- |
| `PRRT_kwDOTCRwsc6h5vbl` — P1 niet-actieve lessen | De bestaande session-query gebruikt uitsluitend status `scheduled`; tenant/group/endtime/order/limit blijven behouden. | Echte Supabase-client met lokale fetch-stub verifieert de PostgREST-query, alle vier statuswaarden en nul requests zonder groepslidmaatschap. |
| `PRRT_kwDOTCRwsc6h5vbn` — P1 tijdzone | Tenantgebonden `tenant_settings.timezone` wordt child-safe geprojecteerd, gevalideerd en bij ontbrekende/ongeldige configuratie Amsterdam. Vandaag, agenda, datumchips en lesdetail gebruiken expliciet dezelfde zone. Aftelling telt lokale kalenderdagen. | UTC- en Los Angeles-host, CET/CEST, maand-/middernachtgrens, andere tenantzone, ontbrekende/ongeldige zone en beide DST-wissels. |
| `PRRT_kwDOTCRwsc6h5vbp` — P2 legacy awards | Query selecteert `resolved_badge_key`; ontbrekende release-identiteit valt terug op de immutable award-snapshot. Een bestaande release-key houdt voorrang. | Legacy award/current release zonder locked duplicaat, onafhankelijke andere key en release/snapshotconflict. Titel/datum blijven historisch. |

Alle drie correcties staan in codehead
`6a7c0fc35f4919acb6d6f21f0a54f364ec16d144`. Nieuwe volledige units:
**460 PASS, 0 failed/skipped**; typecheck, truth/Lovable/Journey Bot/runtime/auth,
migratie/RLS/Sprint31, productie-audit, build en standalone packaging opnieuw PASS.
De volledige lokale Chromium-suite draait opnieuw op die build. SQL, migraties,
import/outbox/onboarding en databasecontracten zijn in deze vervolgcorrecties niet
gewijzigd; de eerder uitgevoerde twee 147-migratieprofielen blijven hun bewijsbasis.

De afzonderlijke workflowvalidatiefout is inhoudelijk opgelost in `b1200dd`:
precies één redundante `DEPLOYED_SOURCE_SHA`-regel verwijderd. Een strikte
unique-key YAML-parser reproduceert de vorige fout op regel 483 en keurt daarna
alle **29 workflows** goed. Triggers/main-only/maintenance/schema/rollbackgates
blijven intact. Dit start of autoriseert geen deployment.

De eerste lokale journeyherhaling is volledig groen (13 PASS, 3 externe staging
SKIP), inclusief 630 DOM-eindstates en 86 renders. Aanvullende mobiele maintenance
is ook groen: samen 2 maintenancechecks. De finale publicatie en nieuwe review
van de vervolgcorrecties worden afzonderlijk gevolgd; een oudere groene run
wordt niet als bewijs voor een nieuwere SHA gepresenteerd.
