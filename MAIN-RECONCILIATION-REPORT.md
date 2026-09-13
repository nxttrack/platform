# FASE 0 — Main reconciliation vóór V4.2

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
