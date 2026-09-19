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
