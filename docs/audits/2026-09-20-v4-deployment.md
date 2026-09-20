# V4 deployment: staging en production

Datum: 20 september 2026, Europe/Amsterdam. Opdracht: autonoom onderzoeken,
repareren, deployen en controleren totdat beide omgevingen bruikbaar zijn.

## Release en omgeving

De applicatierelease is `6b3c9abb686be198830f417e663ac94124d7066f`, afkomstig
van canonical `main`. Deze commit bevat de geïntegreerde V4/V4.2-portalen.
Staging en production draaien dezelfde applicatiecode, elk met een eigen
database, credentials, hostname en service. De uitvoerings- en hersteltools van
deze opdracht staan op `codex/v4-deployment-20260920`; zij veranderen de
applicatierelease niet. De bestaande lokale checkout en zijn niet vastgelegde
wijzigingen zijn behouden. Er zijn geen accounts of wachtwoorden gereset.

| Omgeving | Toegang | Release |
| --- | --- | --- |
| Staging | https://staging.nxttrack.nl | `6b3c9abb686be198830f417e663ac94124d7066f` |
| Staging demo | https://aquaswim-demo.staging.nxttrack.nl | dezelfde release |
| Production | https://nxttrack.nl | dezelfde release |
| Production platformbeheer | https://admin.nxttrack.nl/platform | dezelfde release |

Production is bewust een nieuwe, lege bedrijfsomgeving. Het bestaande
platformbeheerdersaccount is behouden en de onboardingpagina is bereikbaar.
De bestaande stagingdemodata blijft beschikbaar. De ouder-/kindsplitsing,
kindmodus en ouderverzoeken zijn ingeschakeld voor de twee actieve demotenants;
de aparte isolatietesttenant houdt zijn eigen instellingen. Een nieuwe tenant
kan zijn kindportaal activeren via de bestaande tenantinstellingen.

## Wat de analyse aantoonde

1. De lokale `main` liep 220 commits achter en had eigen wijzigingen. Deployment
   vanuit die checkout zou de verkeerde bron gebruiken. Er is een aparte
   worktree gemaakt vanuit de actuele remote releasebron.
2. De actuele stagingrelease was al volledig gevalideerd. De geslaagde
   releasegate omvatte operationele flows, zeven thema's, browsermutaties,
   rol-/tenantisolatie, toegankelijkheid, performance en schema-/RLS-controles.
3. Production draaide nog `08624b16d07bc1536ec4ef3739ff54c48ef7a39e` uit juli.
   Het productiedatabaseonderzoek vond 65 migraties en 71 publieke tabellen,
   één Auth-account, nul tenants, nul deelnemers en nul Storage-objecten.
4. De reguliere upgrade veronderstelde een nieuwere rollbackbasis en een
   onderhoudsfunctie die de julirelease nog niet had. Daarom was een expliciete
   upgrade voor deze geverifieerde lege bedrijfsomgeving nodig.
5. Mailtransport en interne achtergrondtaken stonden uit. Voor de mailwachtrij,
   geplande themaactivatie en aflopende reserveringen ontbrak een periodieke
   aanroep. Alleen de webserver deployen zou die functies niet laten werken.
6. Het bestaande Storage-backupcontract dekte vijf locaties; de twee nieuwe
   V4-locaties `portal-theme-assets` en `portal-theme-imports` ontbraken.
   De herstelworkflow gaf ook de inmiddels vereiste projectbinding niet door.

## Uitgevoerde upgrade

- Een PostgreSQL 17-dump van de oorspronkelijke productiedatabase is gemaakt,
  met AES-256 versleuteld, terug ontsleuteld en bytegewijs gecontroleerd.
  De versleutelde dump wordt 90 dagen als GitHub-artifact bewaard.
- De lege bedrijfsdata is opnieuw gecontroleerd. Een tijdelijke, afzonderlijke
  HTTP-responder stuurde gedurende de upgrade uitsluitend HTTP 503 en benaderde
  geen database. De oude release en configuratie zijn geregistreerd voor herstel.
- Alle 93 ontbrekende officiële migraties zijn uitgevoerd via `pnpm db:migrate`.
  Er is geen database-reset of reparatie van historische migratieregistraties
  gebruikt. Het bestaande platformaccount is behouden.
- De database heeft nu exact 158 migraties, zonder ontbrekende of onverwachte
  versies. Alle 256 publieke tabellen hebben RLS én FORCE RLS. De upgradepreflight,
  volledige runtime-schemacompatibiliteit en Supabase-advisors zijn geslaagd.
- De reguliere canonical productie-deploy is vervolgens uitgevoerd met het
  exacte staging-SHA en de geslaagde productie-audit- en rehearsalreferenties.
- Mailinstellingen zijn gecontroleerd met SendGrid-sandboxvalidatie, zonder
  berichtbezorging. De wachtrij was leeg voordat de worker werd aangezet.
- De runtime- en GitHub-omgevingsvariabelen voor mail en interne jobs zijn
  ingeschakeld. `MAINTENANCE_NO_WRITE=false`, migraties en bootstrap staan uit.

De migratieroute volgt het bestaande versiebeheer en de
[Supabase-migratiewerkwijze](https://supabase.com/docs/guides/deployment/database-migrations).

## Operationele inrichting

De crontab van `github-runner` heeft per omgeving één gemarkeerde V4-regel voor
de periodieke jobs. Elke minuut verwerkt die de mailwachtrij, geplande
themawissels en verlopen reserveringen. Een `flock` voorkomt overlap. De worker
leest de actieve omgeving uit `shared/.env`, respecteert onderhoudsmodus en
functieschakelaars en gebruikt de bestaande interne authenticatiegeheimen.
Dit is geen automatische betalingsincasso.

Daarnaast is er een dagelijkse, geverifieerde, versleutelde Storage-back-up:
production om 02:17 en staging om 02:37 volgens de serverklok. Alle zeven
private locaties worden meegenomen. De lokale bewaartermijn is 14 dagen;
de apart uitgevoerde GitHub-back-ups blijven 90 dagen bewaard. De
versleutelingssleutel staat buiten Git, alleen leesbaar voor de runner.
Er blijven na een geslaagde of mislukte lokale uitvoering geen tijdelijke
onversleutelde back-upbestanden staan.

Relevante serverpaden, met `<omgeving>` gelijk aan `staging` of `production`:

- `/var/www/nxttrack/<omgeving>/current`: actieve applicatie.
- `/var/www/nxttrack/<omgeving>/shared/v4-recurring-jobs.mjs`: periodieke jobs.
- `/var/www/nxttrack/<omgeving>/shared/v4-recurring-jobs.log`: uitgevoerde jobs.
- `/var/www/nxttrack/<omgeving>/shared/operations-v4/`: duurzaam back-uptoolwerk.
- `/var/www/nxttrack/<omgeving>/shared/storage-backups-v4/`: versleutelde snapshots.
- `/var/www/nxttrack/<omgeving>/shared/v4-storage-backup.log`: dagelijks back-uplog.

## Bewijs

| Controle | Resultaat en bron |
| --- | --- |
| Volledige stagingreleasegate op de applicatie-SHA | [Geslaagd, 35474984786](https://github.com/nxttrack/platform/actions/runs/35474984786) |
| Productieconfiguratie, gescheiden projecten, host, TLS, mail-DNS | [Geslaagd, 35476980922](https://github.com/nxttrack/platform/actions/runs/35476980922) |
| Read-only migratierepetitie met ongewijzigde databasefingerprint | [Geslaagd, 35476982022](https://github.com/nxttrack/platform/actions/runs/35476982022) |
| Versleutelde databaseback-up en 65 → 158 migraties | [Geslaagd, 35477257287](https://github.com/nxttrack/platform/actions/runs/35477257287) |
| Canonical deployment naar production | [Geslaagd, 35477451482](https://github.com/nxttrack/platform/actions/runs/35477451482) |
| Portalen, mailconfiguratie en terugkerende jobs | [Geslaagd, 35477574832](https://github.com/nxttrack/platform/actions/runs/35477574832) |
| Volledige productie-Storage-back-up | [Geslaagd, 35477575815](https://github.com/nxttrack/platform/actions/runs/35477575815) |
| Volledige staging-Storage-back-up | [Geslaagd, 35477576568](https://github.com/nxttrack/platform/actions/runs/35477576568) |
| Productie: bestaande eigenaar en negen beschermde platformroutes | [Productiejob geslaagd, 35477643931](https://github.com/nxttrack/platform/actions/runs/35477643931) |
| Staging: platform, tenantbeheer, instructeur, ouder, kind en afscherming | [Geslaagd, 35477873279](https://github.com/nxttrack/platform/actions/runs/35477873279) |
| Zeven synthetische Storage-objecten versleutelen, verwijderen, herstellen en vergelijken | [Geslaagd, 35477709872](https://github.com/nxttrack/platform/actions/runs/35477709872) |
| Dagelijkse back-ups, encryptierondgang en bewijs van werkelijk lopende cronjobs | [Geslaagd, 35477811868](https://github.com/nxttrack/platform/actions/runs/35477811868) |
| Productie operationele monitor na deployment | [Geslaagd, 35477645111](https://github.com/nxttrack/platform/actions/runs/35477645111) |

De aanvullende browserverificatie gebruikt tijdelijke sessies voor bestaande
bevoegde gebruikers. Er zijn geen wachtwoorden gewijzigd of inlogmails verstuurd;
de tijdelijke sessies zijn weer afgemeld. De releasegate op staging levert het
bewijs voor de bestaande browsermutaties en de uitgebreidere isolatiematrix.

Twee eerste controlepogingen zijn gecorrigeerd en niet als geslaagd meegeteld:
de herstelworkflow miste de verplichte bron-/doelfingerprint; de aanvullende
stagingtest gebruikte aanvankelijk de niet-bestaande routes `/admin/deelnemers`
en `/admin/planning`. De bestaande productroutes zijn `/admin/leerlingen` en
`/admin/agenda`. De oorspronkelijke failures blijven in GitHub zichtbaar.

## Grenzen van deze release

De oorspronkelijke Default 1.1-bronillustraties waren volgens de bestaande
V4.2-handoff niet geleverd. De bestaande ingebouwde thema's zijn beschikbaar;
er is geen ontbrekend origineel kunstwerk gefabriceerd of als origineel benoemd.

De applicatie bevat nog geen nieuwsbriefverzendmotor. Die bestaande
productbeperking blijft expliciet uitgeschakeld; transactionele mail is wel
ingericht. Live betalingen zijn niet uitgevoerd en fysieke Android-/iOS-apparaten
zijn niet opnieuw getest tijdens deze deployment.

Een applicatierollback naar de juliversie past niet meer bij het nieuwe schema.
Gebruik bij een incident een versie die aan de huidige schemacompatibiliteit
voldoet, of eerst de database-onafhankelijke onderhoudsresponder. Databaseherstel
vereist de vastgelegde versleutelde dump en de bestaande herstelprocedure.
