# Main reconciliation — 13 september 2026

Deze ledger is vóór de eerste runtimeport vastgelegd. Scope: FASE 0;
geen V4.2 UI/importer/Default 1.1. De featurebranch gaat via een review-PR
naar main. De gebruiker merge; deployment is een aparte opdracht.

## Volledige inventaris

De JSON-bijlagen leggen alle lokale/remote refs, merge-bases, ahead/behind,
PRs, de 230 broncommits en 365 netto gewijzigde bestanden vast:
[refs](2026-09-13-main-reconciliation/refs.json),
[PRs](2026-09-13-main-reconciliation/pull-requests.json),
[commits](2026-09-13-main-reconciliation/commits.json),
[bestanden](2026-09-13-main-reconciliation/files.json).
Elk item heeft exact één primaire classificatie. Gemengde branches worden
hieronder per inhoudelijke familie opgesplitst; dit is geen branch-mergeplan.

## Families en besluiten (afgesloten na porten)

| Familie / bron | Classificatie | Modules, reden en afhankelijkheden | Voorgenomen actie / bewijs |
| --- | --- | --- | --- |
| Main-ancestors en gemergede PRs naar main | ALREADY_PRESENT | Bestaande canon, auth, instructor assessments, billing, media, Android en tests | Behouden; baseline 328 unit, build, audits en 40 browserchecks groen; historische staging-PRs afzonderlijk geclassificeerd in JSON |
| Historische staging-/productionontwikkeling tot `2ac2e93` | ALREADY_PRESENT | De opgeloste merge heeft exact de tree van main; 230 ahead is geen 230 runtimeports | Geen oudere routes/helpers terugzetten; treehash in BASELINE.md |
| Losse oude scaffold/phase-3/deploybranches | SUPERSEDED | Auth-boundary, `/parent`, Engelse adminroutes en oude deploymentarchitectuur vervangen door huidige trusted guards, `/portaal` en main releasecontract | Geen branchport; PR- en refmetadata behouden |
| Parent/child v1 `1ffaf01` → `68d4a79`, PR #56 | KEEP_AND_PORT | Auth-session binding, ouderreauth, child-safe DTO/media, canonical journey history, theme lifecycle en hun bestaande v1 routeconsumers | Alleen bestaande pre-V4.2 code; portal/theme/canon units, auth audit en browser journey; tenant featureflags blijven werkzaam |
| Mobiel contrast `1822d3d`, PR #55 | SUPERSEDED | Nieuwere portalenbron gebruikt `--portal-text` en semantische notification-kleuren | Niet terugzetten naar oudere color-mix helper; controle op actuele consumers |
| Lokale adminselectors `97a7cba` | SUPERSEDED | Main PRs 43–53 hebben latere canonieke wizard-, capacity-, feedback- en retryselectors | Geen oude list/tabletests herstellen |
| Core outbox `ae04a43` + latere certificeringsfixes | KEEP_AND_PORT | Persistente outbox, acceptatie ≠ aflevering, fail-closed providerconfig, lease/idempotency en contentbinding | Email units + lokale transactietests; alle providers uit |
| Atomic onboarding `785e310`, `8b9e8a6`, imports `ac11070` + certificering | KEEP_AND_PORT | Tenant/participant/intake graph, capacity claims, resumable apply/rollback, identity ownership | Additieve migraties en runtimeconsumers samen; DB concurrency/replay/rollbacktests |
| Newsletter `c0bb26e`, business dates `141ae59` | KEEP_AND_PORT | Concept-only delivery en Amsterdam-datumgrenzen in bestaande domeinen | Geen provideractivering; unit-/datumtests en typecheck |
| Certificering `22cc158` → `db9806f` | KEEP_AND_PORT | Tenant boundaries, grantrestricties, privacy, content/idempotency, provider/crashcorrecties, immutable evidence en storage/restore contract | Latere correcties tegelijk met afhankelijke runtime; oude migraties byte-identiek behouden |
| Runtime/dependencies `d16281a`, `db9806f` | KEEP_AND_PORT | Node 24, fixed nanoid/Tiptap, exacte Supabase CLI | Frozen lockfile, alle units, build en audit; actuele baselineadvisories afzonderlijk behandelen |
| Featurebranch-previewdeployments / gepinde preview-SHAs | SUPERSEDED | Tijdelijke uitzonderingen horen niet in canonical main | Main-only dispatch behouden; generieke exact-source/schema/rollbackcontroles semantisch integreren |
| Certificerings-SHA als schema-/rollbackfloor (`541fe5f`) | KEEP_AND_PORT | Die SHA is géén ancestor van deze semantische port | Immutable equivalent-ancestor map naar `12b4885`; op dat commit zijn apps/web, dependencies en alle migraties identiek aan `db9806f`. Geen extra migratie of herschreven floor. Vier nieuwe ancestrytests; merge-commit verplicht |
| `docs/nxttrack-legal-facts-inventory`, acht commits | DOCS_OR_EVIDENCE_ONLY | Alleen `docs/legal-analysis`; geen runtimecode | Op bronref bewaren, geen actuele juridische/operationele claims overnemen |
| Oude auditrapporten, screenshots, inputprompts, rolloutbewijs | DOCS_OR_EVIDENCE_ONLY | Bronmateriaal met historische datum/SHA; geen nieuw bewijs | Nuttige operationele docs behouden met historische index; grote prototype/input/evidencebinaries via immutable Git-links bewaren |
| `FamilyCommandCenter` en `PortalOverviewHero` | OBSOLETE_REMOVE | Geen imports/routeconsumers; vervangen door ParentOverviewTop en ChildJourneyMap | Verwijderd in `8a72f88`; [usage- en testbewijs](2026-09-13-main-reconciliation/cleanup.json) |
| Overige helpers, featureflags, releases en compatibility adapters | ALREADY_PRESENT | Bestaande consumers of historische snapshotcontracten | Bewust behouden; geen verwijdering op basis van alleen legacylabels |
| Vier resterende dependency-advisories | REVIEW_REQUIRED | Al op origin/main; Next/sharp/browser-mapping vallen buiten de gecertificeerde dependencyfixes | Audit blijft rood, geen allowlist of lagere threshold; aparte gerichte patchreview vóór release |

## Uitgevoerde afsluiting

De 70 refs, 54 PRs, 230 broncommits en 365 bronbestanden zijn volledig
geclassificeerd. Van de 230 commits zijn 143 ALREADY_PRESENT, 61 KEEP_AND_PORT,
19 SUPERSEDED en 7 DOCS_OR_EVIDENCE_ONLY. De oorspronkelijke ledgercommit
`d539421` bewaart de inventaris vóór runtimewijzigingen; deze versie legt de
definitieve besluiten vast. Preview-only workflowwijzigingen en hun gepinde
SHA-tests zijn na inhoudelijke inspectie SUPERSEDED geworden.

De geselecteerde families zijn geïntegreerd in `d87aa78` en `12b4885`;
canonical deployment/CI in `e1b8cb6`; bewezen cleanup in `8a72f88`; bestaande
journey-coördinaten en browserbewijs in `2f4317e`. Alle 130 main-migraties en
147 bronmigraties zijn byte-identiek behouden. Zie
[migration-integrity](2026-09-13-main-reconciliation/migration-integrity.json).

De twee bestaande open PRs zijn niet gewijzigd: #55 is superseded; #56 bevat
de semantisch overgenomen pre-V4.2-familie maar houdt zijn oorspronkelijke
staging-base. Ook lokale gebruikerswijzigingen en remote branches blijven staan.

## Grenzen en verificatie

Voor iedere port zijn domeinsuites uitgevoerd, gevolgd door alle units,
typecheck, productiebuild, repository-/auth-/migratie-/RLS-audits en lokale
browserchecks. DB-tests gebruiken uitsluitend eigen disposable databases met
fictieve records. Het [eindrapport](../../MAIN-RECONCILIATION-REPORT.md) bevat
de definitieve uitslagen, eerdere afwijkingen, herstelacties en beperkingen.

Historische migraties, releases, snapshotcompatibiliteit, audits en consumers van
featureflags blijven behouden. Readme/current-statusclaims worden gecorrigeerd;
historische auditdocumenten worden niet gewist. Het eindrapport sluit deze ledger
met werkelijke commits, checks, cleanupbewijs en resterende risico's.

## FASE 0.1 — review and dependency closure

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
