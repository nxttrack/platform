# V4: gereedheid voor de volgende deployment

Datum: 20 september 2026. Opdracht: onderzoek de volledige deployketen en voer de
benodigde voorbereiding uit. Deze ronde activeert geen nieuwe applicatierelease.
De bestaande staging- en productieapplicatie draaien versie
`6b3c9abb686be198830f417e663ac94124d7066f`; de onderzochte canonical bron is
`main`, vanaf `be8edddbdc03d13329d04da067e99110d6df8158`.

## Beslissing en grens van het bewijs

De kandidaat bevat de correcties die nodig zijn om de normale
staging→productieprocedure te kunnen starten. Productiepromotie blijft afhankelijk
van een nieuwe, volledig geslaagde stagingdeployment voor de uiteindelijke
commit, plus de foundation-audit en migratierepetitie voor diezelfde commit.
Historisch bewijs voor `6b3c9…` is geen releasebewijs voor deze kandidaat.

Dit rapport hoort bij de CI van de bijbehorende pull request en de handmatige
`Deployment readiness`-, `Production foundation audit`- en
`Production migration rehearsal`-runs op de samengevoegde bron. Die runs leggen
de definitieve SHA en actuele resultaten vast, zonder een applicatie te
activeren. De afrondingsmelding verwijst naar deze concrete runs.

## Onderzoek per onderdeel

| Onderdeel | Vaststelling en uitgevoerde voorbereiding |
|---|---|
| Releasebron | `main` is canonical. Historische staging-/productionbranches bevatten afwijkende geschiedenis en worden niet integraal samengevoegd. De bestaande onvoltooide lokale gebruikerswijzigingen blijven in de oorspronkelijke werkruimte staan. |
| CI en dependencies | Node 24.18.0, pnpm 10.24.0 en de lockfile worden gebruikt. Typecheck, alle unittests, auth-/runtime-/migratie-/RLS-audits, dependency-audit, productiebuild en bestaande browser-CI zijn de controlepunten. |
| Omgevingen | Afzonderlijke Supabase-projecten en GitHub Environments; bestaande VPS-runner, systemd-services, Caddy en HTTPS-routes. Actuele audit controleert de echte publieke SHA, omgeving, database en schemacompatibiliteit. |
| Database | 158 migraties, 256 publieke tabellen in de statische RLS-audit. Deze kandidaat verandert geen migratie of applicatieschema. De productie-inventaris en dry-run bewijzen de actuele databasepariteit; dry-run vergelijkt ook de databasefingerprint vóór/na. |
| Productiepromotie | De verplichte staging-run wordt via de GitHub API gecontroleerd op exacte SHA, canonical branch, succesvolle deployjob en alle dertien verplichte stagingvalidatiestappen. Een opgegeven SHA zonder geslaagde stagingrun is onvoldoende. |
| Configuratie en activatie | Build/audits gebruiken een private kandidaatconfiguratie. De actieve configuratie wordt vooraf bewaard en pas atomair bij activatie vervangen. Gelijktijdige wijzigingen blokkeren de overgang. Migratieonderhoud start pas na een geslaagde build en wordt vóór SQL met HTTP 503 bewezen. |
| Health en releasebehoud | De deploysmoke vereist de verwachte commit én omgeving plus geslaagde database-/schemacontroles. Opruimen bewaart de actuele en vorige werkende release, ook als vijf nieuwere mislukte kandidaten bestaan. |
| Rollback | Expliciete omgeving en kandidaatdirectory, standaard alleen controleren. Identiteit, ancestry en identieke migratiegeschiedenis worden vóór een switch bewezen. De repetitie herstelt de oorspronkelijke omgeving en actieve symlink ook bij fouten. Schema-incompatibele rollback wordt geweigerd. |
| Ouder-/kindportalen | De stagingfixture bewaart en herstelt de vier oorspronkelijke rolloutregels duurzaam; afgebroken runs kunnen herstellen. Opruimen schakelt de V4-portalen niet meer onvoorwaardelijk uit en trekt geen tenantbrede kindsessies in. |
| Thema's | Alle zeven ingebouwde thema's en twintig unieke native PNG's zijn gecontroleerd. Het authentieke ontbrekende Default 1.1-bronpakket blijft een afzonderlijke, niet-afgeronde productlevering; bestaande runtimeversie 3.0.0 wordt daarvoor niet als bewijs opgevoerd. |
| Communicatie | Bestaande in-appcommunicatie en transactionele outbox blijven beschikbaar. Nieuwsbrieven zijn volgens het bestaande productcontract uitsluitend concepten; een daadwerkelijke verzendmotor is afzonderlijk vervolgwerk. Geen echte e-mail is voor deze analyse verzonden. |
| Workers | Bestaande minuutjobs voor thema-activatie, verlopen aanbiedingen en de mailoutbox worden op recente succesvolle ticks gecontroleerd. De volgende deploy installeert uit canonical bron een inhoudsgebonden versie van de tools, met hostbrede cronlock en behoud van de andere omgeving. |
| Storage en herstel | Volledige export van zeven buckets, byteverificatie, AES-256, decryptiecontrole en opruiming van plaintext. Een succesheartbeat volgt pas na de vereiste opslag- en verificatiestappen. De korte bestaande encryptiesleutels worden met behoud van oude herstelmogelijkheden vervangen. |

## Concrete reparaties

De volledige lokale unitsuite telt **573 PASS, 0 FAIL, 0 SKIP**. Typecheck,
authenticatiegrenzen, runtimecontract, migratie-/RLS-audits en dependency-audit
slagen; de dependency-audit meldt geen bekende kwetsbaarheden. De statische
RLS-audit vermeldt bestaande waarschuwingen over niet publiek uitvoerbare
private functies, zonder ontbrekende RLS-dekking. Alle workflow-YAML parseert.
De sleutelreparatie en nieuwe back-ups slagen daadwerkelijk op beide hosts in
[35505059974](https://github.com/nxttrack/platform/actions/runs/35505059974),
gevolgd door twaalf geslaagde operationele controles per omgeving.

De [pipelineanalyse](2026-09-20-deploy-readiness/deployment-pipeline.md) beschrijft
de stagingbewijscontrole, private kandidaatconfiguratie en onderhoudsafscherming.
De [thema- en portaalanalyse](2026-09-20-deploy-readiness/themes.md) bevat de
assetcontrole, de precieze ontbrekende Default 1.1-scope en het herstel van de
stagingfixture. De [communicatieanalyse](2026-09-20-deploy-readiness/communication.md)
onderbouwt de huidige conceptfunctie en beschrijft het afzonderlijke werk voor
nieuwsbriefverzending. De
[operationele analyse](2026-09-20-deploy-readiness/operations.md) beschrijft
workers, opslag, sleutels en bewijsretentie.

De oorspronkelijke scope omvat geen nieuwe nieuwsbriefmotor, authentieke
illustraties die niet beschikbaar zijn, native mobiele storepublicatie of het
activeren van echte betaalproviders. Deze onderdelen worden niet stilzwijgend
als getest of geleverd beschouwd. Ze blokkeren het deployen van de bestaande,
afgebakende V4-functionaliteit niet.

## Uitvoering van de volgende release

1. Kies de samengevoegde commit op `main`; houd deze SHA gelijk gedurende de
   staging-, foundation-, migratie- en productieprocedure.
2. Start `Deploy NXTTRACK` vanaf `main`, target `staging`, zonder owner-reset.
   Laat de volledige stagingbrowserjob en het schrijven van bewijs slagen.
3. Gebruik geslaagde `Production foundation audit` en
   `Production migration rehearsal` voor exact dezelfde SHA. De in deze
   voorbereiding uitgevoerde runs zijn bruikbaar zolang de bron en relevante
   omgevingsconfiguratie ongewijzigd blijven.
4. Start productie met `staging_release_sha`, `staging_release_run_id`, beide
   productiebewijs-run-ID's, `PROMOTE_PRODUCTION` en de geregistreerde
   gebruikersautorisatie. De workflow weigert onvolledig of afwijkend bewijs.
5. Controleer de nieuwe publieke SHA, bruikbare routes, releaseartifact en
   `Deployment readiness` na afloop. Een positieve voorbereiding wordt nooit
   voorgesteld als een al geslaagde toekomstige deployment.

De operationele commando's en herstelprocedure staan in
[PRODUCTION_RELEASE_RUNBOOK.md](../PRODUCTION_RELEASE_RUNBOOK.md) en
[VPS_DEPLOY_RUNBOOK.md](../VPS_DEPLOY_RUNBOOK.md).
