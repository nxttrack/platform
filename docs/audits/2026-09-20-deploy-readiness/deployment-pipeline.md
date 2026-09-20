# Deploymentpipeline — onderzoek en correcties

20 september 2026. Onderzocht vanaf canonical `main`
`be8edddbdc03d13329d04da067e99110d6df8158`. Dit document beschrijft
voorbereiding van een volgende release; in deze opdracht is geen applicatie
geactiveerd en zijn geen live omgevingsinstellingen gewijzigd.

## Bron en bestaande bewijzen

De laatste succesvolle staging- en productiedeploys zijn respectievelijk
[35474984786](https://github.com/nxttrack/platform/actions/runs/35474984786) en
[35477451482](https://github.com/nxttrack/platform/actions/runs/35477451482), beide
voor `6b3c9abb686be198830f417e663ac94124d7066f`. Deze bewijzen horen bij die
applicatieversie. Ze geven geen toestemming of validatie voor een nieuwe SHA,
ook niet wanneer alleen beheertools zijn gewijzigd.

Canonical `main` bevat de volledige V4/V4.2-code en 158 migraties. De lokale
repository-truth-, migratie- en RLS-audits slaagden: 158 migratiebestanden en
256 publieke tabellen. De legacy branches `staging` en `production` bevatten
niet-canonical geschiedenis en zijn geen releasebron.

## Gevonden problemen en uitgevoerde correcties

### Productie accepteerde een staging-SHA zonder stagingbewijs

`assert-release-source.mjs` vergeleek alleen de ingevoerde staging-SHA met de
workflow-SHA. `verify-production-evidence.mjs` controleerde uitsluitend de
productie-foundation- en migratierepetitieruns. Een kandidaat zonder geslaagde
staging-browsergate kon daardoor worden gepromoveerd, terwijl het releasebewijs
Phase 15 en 16 als gevalideerd registreerde.

De deploy- en productie-migration-recovery-workflows vereisen nu tevens
`staging_release_run_id`. De verifier controleert:

- exact dezelfde volledige SHA, canonical `main`, handmatige deployworkflow en
  afgeronde succesvolle run;
- de jobs van de specifieke geslaagde runpoging, zodat eerdere pogingen niet
  worden vermengd met een nieuwe poging;
- de geslaagde `deploy`-job met broncontrole, health- en runtime-smoke;
- de geslaagde `staging browser validation`-job én alle dertien verplichte
  operationele, thema-, mutatie-, isolatie-, kwaliteits-, visuele en Phase 15/16-
  stappen, inclusief het schrijven van releasebewijs.

Een onderhoudsdeploy met overgeslagen browsertests, alleen een succesvolle
productiedeploy, een onvolledige joblijst of een onbereikbare GitHub API levert
geen geldig stagingbewijs. Het productiereleasebewijs registreert nu ook de
geverifieerde staging-run-ID.

### Buildvoorbereiding wijzigde de actieve configuratie

De workflow overschreef `shared/.env` vóór dependency-installatie, audits en
build. Een mislukte gewone deploy kon daardoor de actieve configuratie met de
SHA en instellingen van een nooit geactiveerde kandidaat achterlaten. De
cronworker leest dat bestand direct; een latere serviceherstart las eveneens
de verkeerde configuratie. Alleen migratiedeploys bewaarden een snapshot.

Iedere deploy bewaart nu eerst de actieve immutable release-identiteit en een
privé kopie van de oorspronkelijke omgeving. De actieve release moet een geldig,
compatibel artifact hebben; ontbrekende of conflicterende identiteit blokkeert
de release vóór wijzigingen. Installatie en build gebruiken uitsluitend de
private `.env.candidate` in de nieuwe releasedirectory. Zij wijzigen `shared/.env`
niet. De kandidaat wordt pas in de activatiestap atomair gepubliceerd. De helper
controleert zowel snapshot- als kandidaatidentiteit en weigert een ondertussen
door een andere operator gewijzigde actieve configuratie te overschrijven.

Bij een migratiedeploy is vóór de migratie onderhoudsmodus nodig. Die beperkte
uitzondering gebeurt nu pas na de geslaagde build: de oorspronkelijke actieve
configuratie en SHA blijven behouden, alle mail-/nieuwsbrief-/interne workers
worden uitgezet en onderhoudsmodus wordt atomair aangezet. De workflow herstart
de huidige service en bewijst HTTP 503 `maintenance_no_write` voordat SQL mag
worden uitgevoerd. Een mislukte migratie blijft onder die afscherming staan;
er is geen automatische rollback naar mogelijk schema-incompatibele code.

De snapshots staan onder `shared/deployment-<run>-<attempt>.previous.json` en
`.previous.env`. Het omgevingsbestand is alleen leesbaar voor de runner. De
geactiveerde configuratie behoudt groepstoegang voor de applicatieservice.

## Validatie

- Zeven gedragstests voor bewijsverificatie, ontbrekende/overgeslagen gates,
  verkeerde SHA/workflow/branch, netwerkweigering, private kandidaatvoorbereiding,
  atomische activatie, onderhoudsafscherming, identiteit en gelijktijdige
  configuratiewijzigingen: geslaagd.
- Zeventien bestaande certificerings- en schema-compatibiliteitstests: geslaagd.
- Repository-truth-, migratie- en RLS-audits: geslaagd.
- De nieuwe verifier is read-only uitgevoerd tegen de echte eerder geslaagde
  staging-, foundation- en migratieruns voor `6b3c9…`. Dit controleert compatibiliteit
  met de werkelijke GitHub API en stapnamen; het is geen nieuw kandidaatbewijs.

## Voor de volgende release

Na samenvoegen ligt de nieuwe kandidaat-SHA vast. Start de normale
staging→productieprocedure met die SHA. Verzamel daarna een nieuwe geslaagde
staging-deploy inclusief de volledige browserjob en verse read-only
productie-foundation- en migratierepetitieruns voor exact die SHA. Geef alle drie
run-ID's mee aan de productiepromotion. Deze volgorde is een onderdeel van de
volgende deployment; oude bewijzen worden niet hergebruikt om dat proces over
te slaan.

De aanvullende herstel-/rollbackcorrecties en de duurzame operationele tools
staan beschreven in de overige analysebestanden van deze opdracht.
