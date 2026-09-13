# FASE 0.1 — bewaarde tussentijdse review- en validatiestatus

Deze opeenvolgende statusmeldingen zijn historische snapshots. Pending-staten en
oude testtellingen beschrijven hun eigen publicatiemoment. Het actuele compacte
resultaat staat in MAIN-RECONCILIATION-REPORT.md en het afsluitcommentaar van PR #57.


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

### Derde review: plaatsingsdatums

Head `d42a65f219ac7b9c6c2443bf966b95cc24d1bdc5` is volledig groen in Web CI
**34766100074** en Android native CI **34766100069**. Review **5191196954**
vond nog één P1 in thread `PRRT_kwDOTCRwsc6h50XU`: lessen waren niet begrensd
door de begin-/einddatum van actieve of proefplaatsingen.

Correctiehead **`1b28cd818e56ae034bad73c924317080fbcf376c`** selecteert beide
plaatsingsdatums. De session-query begrenst ieder plaatsingsinterval al in de
Data API met een ruime UTC-marge, waarna de inclusieve exacte lesdatum in de
tenanttijdzone wordt getoetst. Overlap geeft geen dubbele les; tussenliggende
onderbrekingen en andere groepen blijven onafhankelijk. Stabiele paginering
past de limiet van 24 toe ná deze filtering, zodat vroege ongeldige rijen geen
geldige lessen verdringen. Queryfouten leveren geen gedeeltelijke agenda.

Regressies: **464 units PASS**, inclusief instroom/uitstroom, CEST/CET,
New York/Kiritimati, overlap/gaten/open einde, paginering en foutafhandeling.
Typecheck, productiebuild/standalone en alle lokale auditgates opnieuw PASS.
De echte session-query is bovendien tegen een opnieuw gemaakte eigen lokale
PostgREST-stack met alle 147 migraties uitgevoerd: drie HTTP 200-responses op
synthetische niet-bestaande tenant/plaatsings-IDs bewijzen de OR/range/order-syntax.
De functionele datumgevallen draaien in de bovengenoemde tests; lege Data
API-responses worden niet als functioneel fixturebewijs gepresenteerd.
Geen SQL/migratie gewijzigd, geen remote database benaderd.

De vorige volledige lokale browserherhaling was groen: 52 smoke, 13 journey,
1 maintenance op de build met de tijdzone/legacy-correcties. Dezelfde suites
draaien opnieuw na de plaatsingscorrectie; CI en Codex worden op de gepushte
vervolghead opnieuw gevolgd. Zes aangetroffen threads moeten bij afsluiting
allemaal aantoonbaar zijn opgelost.

## Bewaarde ledger-updates


De historische inventaris en eerdere rode runs hierboven blijven intact. P1
compatibility is tegen echte Git-ancestry weerlegd en met een canonical-main-only
regressie en schema-/rollbackasserties onderbouwd. P2 earned/locked badges is
semantisch gecorrigeerd op stable_key met acht gedragsregressies.

De vier REVIEW_REQUIRED-advisories zijn gericht geremedieerd: beide Next criticals
GHSA-p293-qw3h-jr36/GHSA-2xp9-vwfh-vxw4 via 16.3.3, Sharp high
GHSA-rgj7-g3m4-5g8c via 0.35.4 en transitieve browser-mapping moderate
GHSA-w5vr-8v7q-w6rv via 2.11.0. Auditthreshold en gates blijven ongewijzigd.
De benodigde standalone-copycorrectie bewaart relatieve native links.

Nieuwe lokale evidence: clean frozen install, 454 units, typecheck/build/audits,
beide 147-migratieprofielen, alle domeincontracten, 102 API/storage/rollenasserties
per profiel, 52 Chromiumsmokes en maintenance groen. Journey-herhaling en nieuwe
GitHub CI/review zijn bij deze publicatie nog pending. Extra PL/pgSQL-lint meldt
drie bestaande diagnostieken; die staan afzonderlijk als risico in het rapport.

Zie [FASE 0.1-validation](2026-09-13-main-reconciliation/phase-0.1/validation.json),
[advisories](2026-09-13-main-reconciliation/phase-0.1/advisories.json),
[alle dependencywijzigingen](2026-09-13-main-reconciliation/phase-0.1/dependency-version-changes.json)
en het actuele [rapport](../../MAIN-RECONCILIATION-REPORT.md).

### Vervolg na tweede Codex-review

Op `a529056` zijn Web CI **34765275679** en Android native CI **34765275669**
volledig SUCCESS. De echte Firefox/WebKit-run leverde samen met Chromium 31 PASS
met 17 bestaande expliciete skips. De tweede review vond twee nieuwe P1
(lesstatus/tijdzone) en één P2 (legacy badge-key). Correctiecode
`6a7c0fc35f4919acb6d6f21f0a54f364ec16d144` heeft 460 groene units plus opnieuw
groene typecheck/build/packaging/audits. `b1200dd` verwijdert een identieke dubbele
workflow-envkey; 29 workflows zijn strikt gevalideerd. De nieuwe publicatie wordt
opnieuw via CI en Codex beoordeeld. Zie het rapport en de follow-up evidence;
eerdere 454-unit-/CI-runs blijven met hun eigen SHA bewaard.

### Aanvullende P1 uit de derde review

`d42a65f` heeft groene Web CI 34766100074 en Android CI 34766100069. Codex
5191196954 vond ontbrekende plaatsingsdatums in de kindagenda. `1b28cd8`
begrenst lessen inclusief op tenant-lokale instroom/uitstroom en past de
24-limiet pas na filtering toe. 464 units en alle lokale build/auditgates zijn
groen; echte lokale PostgREST-querysyntax is getest op 147 migraties. Geen SQL
gewijzigd. Afsluitende CI/review wordt op de nieuwe publicatie gevolgd.
