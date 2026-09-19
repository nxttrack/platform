# Stagingdeployment na goedkeuring

Op 19 september gaf de beheerder opdracht: “Voer uit. Los op. Deploy.”
Daarop is PR #91 gemerged naar `e34bc6acf94b22df459bce1920532e6274c9fdea`.
[Main-CI 35470357571](https://github.com/nxttrack/platform/actions/runs/35470357571)
slaagde: 100 browser-smoketests; Journey 70 geslaagd en 35 bestaande skips.

[Deployment 35470852573](https://github.com/nxttrack/platform/actions/runs/35470852573)
heeft die exacte SHA geactiveerd op staging. Health, database en schemacompatibiliteit
slagen. Bootstrap bleef uit; de deployjob sloeg migraties over volgens de bestaande
instelling. De normale stagingfixtures en browsergate zijn uitgevoerd.

De operationele flow, zeven-thema-matrix, intake-, instructeurs- en ouderjourney
slaagden. Beide beheerlogins slaagden, ieder met één submit: action HTTP 200/303,
de beschermde programma-UI zichtbaar, en na reload opnieuw HTTP 200 met dezelfde
beschermde UI. De loginhelper had geen interne retry; de tweede login hoorde bij
de bestaande retry van de volledige test.

De beheerjourney stopte later bij `Les opslaan`, regel 152: de verwachte
`saved=1` ontbrak na een foutredirect. De oorspronkelijke inlogfout is in deze run
niet gereproduceerd; de historische oorzaak is daarmee niet alsnog bewezen.
De latere staginggates zijn overgeslagen. Er is geen volledige release-evidence
en deze release is **niet STAGING_VALIDATED**.

## Gerichte vervolganalyse

`staging-admin-diagnostic.yml` onderzoekt uitsluitend een mislukte canonical
deployrun die bij de actieve staging-SHA hoort. Het script gebruikt de bestaande
stagingdatabaseconfiguratie, controleert project- en tenantidentiteit en draait
alle SQL in een begrensde read-only transactie. Het vergelijkt de twee door de
test berekende lesvensters met resource-, sluitings- en instructeursreserveringen
en leest de schemavoorwaarden van `sessions`. Het voert geen login, fixture-reset,
businesswrite of stored procedure uit. De uitvoer bevat alleen technische
kenmerken, tijden en aantallen; geen credentials, sessies of persoonsgegevens.

De huidige `createSessionAction` interpreteert `datetime-local` in de servertijdzone;
daarom bekijkt de diagnose zowel UTC als Europe/Amsterdam, zonder vooraf een
oorzaak te veronderstellen. Ook `error=write` op zichzelf bewijst geen conflict.

Read-only-transacties volgen het
[PostgreSQL-transactiecontract](https://www.postgresql.org/docs/current/sql-set-transaction.html).
Productie, rollback en dataherstel zijn niet uitgevoerd.

## Bevinding en fixturecorrectie (20 september, Amsterdam)

[Diagnose 35473143761](https://github.com/nxttrack/platform/actions/runs/35473143761)
is geslaagd zonder remote writes. Voor beide mislukte lespogingen is één bestaande
resource-overlap gevonden bij respectievelijk `2026-09-21T03:40` en `03:45` in UTC.
De alternatieve Amsterdam-interpretatie heeft geen overlap. Sluitings- en
instructeursconflicten waren nul. De hashes van beide actieve booking-/reservation-
triggerfuncties zijn gelijk aan de repository. De exacte afwijzing is niet gelogd
door de bestaande applicatie; de aangetroffen UTC-overlap wordt door die ongewijzigde
trigger geweigerd. Een lokale uitvoering van dezelfde triggers accepteerde juist
een conflictvrije handmatige les met de geërfde groepsresource.

De eerdere run-ID-moduloberekening garandeerde geen vrij tijdvak in gedeelde,
bewaarde fixturehistorie. `prepare-sprint4-admin.mjs` selecteert nu uitsluitend met
read-only SQL twee vrije dagen uit de komende twaalf Amsterdamse kalenderdagen.
Voor groepspublicatie selecteert dezelfde conflictcontrole twee vrije zondagen
buiten het agendavenster en binnen de 700-daagse instructeurskwalificatie.
De selectie controleert resourcehiërarchie, instructeur en gepubliceerde sluitingen
voor zowel UTC als Amsterdam. De browser gebruikt exact die resource en één venster
per handeling per volledige testpoging. Bij onvoldoende ruimte stopt voorbereiding; bestaande
boekingen worden niet verwijderd, verplaatst of vrijgegeven. De live transactie-
beveiliging blijft beslissend als een andere gebruiker intussen hetzelfde moment boekt.

Tijdens de analyse bleek ook een reproduceerbare kalenderfout: na `22:00Z` in de
zomertijd kon de oude helper een maandag opleveren voor een gevraagde zondag,
doordat hij UTC-weekdagen met Amsterdamse datums combineerde. Die berekening is
verwijderd. De SQL-selectie rekent vanaf de Amsterdamse kalenderdatum; de regressies
controleren zondagen, venstergrenzen, beide zomertijdgrenzen en een jaarwisseling.

De definitieve lokale validatie en de bijbehorende CI staan in de PR-beschrijving.
De database-regressies gebruiken uitsluitend tijdelijke tabellen in een geïsoleerde
lokale Postgres 17 en voeren dezelfde query uit met alleen een tijdelijke schemanaam.
Uitvoerbaar met:

```bash
ADMIN_PLANNING_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:<testpoort>/postgres' \
  node --test tests/integration/admin-session-windows.test.mjs
```

De diagnose kan na merge dezelfde nieuwe vensterselectie read-only op staging
controleren. Volledige validatie vereist vervolgens een verse canonical deployment
en alle bestaande gates. PR #92-CI had eerst een failure in de ongewijzigde WebKit-
Journey-zoekfiltertest; een eenmalige herhaling zonder code- of retrywijziging slaagde.
