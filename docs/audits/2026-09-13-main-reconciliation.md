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

## Families en besluiten vóór porten

| Familie / bron | Classificatie | Modules, reden en afhankelijkheden | Voorgenomen actie / bewijs |
| --- | --- | --- | --- |
| Main-ancestors; gemergede PRs 1–54 naar main | ALREADY_PRESENT | Bestaande canon, auth, instructor assessments, billing, media, Android en tests | Behouden; baseline 328 unit, build, audits en 40 browserchecks groen |
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
| Certificerings-SHA als schema-/rollbackfloor (`541fe5f`) | KEEP_AND_PORT | Die SHA is géén ancestor van deze semantische port | Nieuwe additieve compatibility bridge naar een bewezen reconciliation-ancestor; geen ancestrycheck verwijderen |
| `docs/nxttrack-legal-facts-inventory`, acht commits | DOCS_OR_EVIDENCE_ONLY | Alleen `docs/legal-analysis`; geen runtimecode | Op bronref bewaren, geen actuele juridische/operationele claims overnemen |
| Oude auditrapporten, screenshots, inputprompts, rolloutbewijs | DOCS_OR_EVIDENCE_ONLY | Bronmateriaal met historische datum/SHA; geen nieuw bewijs | Nuttige operationele docs behouden met historische index; grote prototype/input/evidencebinaries via immutable Git-links bewaren |
| Mogelijke duplicate helper/demo cleanup | REVIEW_REQUIRED | Een naam of legacylabel bewijst geen ongebruik | Pas OBSOLETE_REMOVE na zoek-, vervangings- en testbewijs; anders expliciet behouden |

## Grenzen en verificatie

Voor elke poort worden relevante suites uitgevoerd, daarna alle units, typecheck,
productiebuild, repository-/auth-/migratie-/RLS-audits en lokale browserchecks.
Nieuwe DB-tests gebruiken uitsluitend een eigen disposable database en fictieve
records; geen bestaande lokale stacks of remote databases muteren.

Historische migraties, releases, snapshotcompatibiliteit, audits en consumers van
featureflags blijven behouden. Readme/current-statusclaims worden gecorrigeerd;
historische auditdocumenten worden niet gewist. Het eindrapport sluit deze ledger
met werkelijke commits, checks, cleanupbewijs en resterende risico's.
