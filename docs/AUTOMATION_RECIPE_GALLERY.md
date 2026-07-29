# Automation Recipe Gallery

## Doel en veiligheidsgrens

De recipegallery geeft organisatie-eigenaren en tenantbeheerders tien uitlegbare signaleringsrecepten. Een live recipe mag uitsluitend één interne controletaak aanmaken. De medewerker controleert de brondata en kiest daarna zelf of er opvolging nodig is.

De runner:

- verstuurt geen e-mail, WhatsApp of SMS;
- start geen betaling of incasso;
- plaatst, weigert of verplaatst geen leerling;
- wijzigt geen leerling-, aanbod- of betaalstatus;
- verwerkt geen Journey Bot- of andere herkenbare testdata;
- gebruikt tenant-scoped queries, idempotency en een cooldown;
- logt bronvelden, redenen, confidence en de veilige uitkomst;
- vereist bij handmatige live controle een expliciete bevestiging.

Deze grens staat zowel in de applicatielaag als in databaseconstraints. `review_only` moet altijd `true` zijn en `external_delivery_enabled` altijd `false`. Een voltooide live run is alleen geldig met exact de actie `review_task_created`.

## Catalogus

De catalogus bevat:

1. No-show opvolging
2. Verjaardagsbericht
3. Aanbod verloopt bijna
4. Lange afwezigheid
5. Diploma behaald
6. Mislukte betaling
7. Inhaalcredit verloopt bijna
8. Afzwemherinnering
9. Proefles follow-up
10. Nieuwe wachtlijstplek beschikbaar

Iedere kaart toont trigger, brondata, privacy/consent-aandachtspunt, safeguards en eventuele overlap met bestaande productflows. Drempels en cooldowns zijn per tenant instelbaar.

## Rollen en RLS

Alleen `tenant_owner`, `tenant_admin`, `platform_owner` en `platform_admin` mogen tenantconfiguratie en auditlogs lezen of beheren. Tenantmedewerkers en instructeurs krijgen geen toegang tot de recipeconfiguratie. De catalogus zelf bevat geen tenantdata en is alleen-lezen voor ingelogde gebruikers.

Server actions controleren dezelfde rollen vóórdat de service-role client wordt gebruikt. RLS blijft de tweede tenantgrens voor directe databaseverbindingen.

## Test- en livemodus

Testmodus evalueert echte, tenant-scoped brondata maar schrijft alleen een auditrun met `simulation_only`. Er wordt geen taak gemaakt.

Livemodus controleert opnieuw:

- of de recipe actief is;
- of de kandidaat actueel en niet-test is;
- of de confidence/drempel voldoende is;
- of geen cooldown of idempotencyclaim actief is.

Alleen daarna wordt één interne taak aangemaakt. Een medewerker moet elk extern of operationeel vervolg in de daarvoor bedoelde productflow apart bevestigen.

## Geplande runner

GitHub Actions roept dagelijks aan:

```text
POST /api/internal/automation-recipes/tick
Authorization: Bearer <CRON_SECRET>
```

`CRON_SECRET` moet minimaal 32 willekeurige tekens bevatten en staat als environment secret in staging en productie plus in de runtimeomgeving van de app. De response bevat alleen technische run-ID's, tenant-ID's, recipe keys en uitkomsten; geen namen of contactgegevens.

## WhatsApp en SMS

WhatsApp en SMS zijn niet beschikbaar. Voor introductie zijn minimaal nodig:

- een expliciet goedgekeurde provider en verwerkersafspraken;
- kanaalspecifieke consentregistratie en opt-out;
- template- en afzenderbeheer;
- delivery-, retry- en foutaudit;
- bewaartermijnen en incidentprocedure.

Tot dat afzonderlijk is gebouwd en beoordeeld, blijven deze kanalen zowel in de UI als in de runner uitgeschakeld.

## Legacy regelbouwer

De bestaande vrije regelbouwer blijft afzonderlijk bereikbaar via `/admin/automatisering/regels`. Deze regels zijn een configuratiearchief; er is geen executor aan gekoppeld. Nieuwe gecontroleerde automatisering hoort in de recipegallery.
