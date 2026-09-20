# Communicatie en nieuwsbrief: deploy-readiness

Beoordeeld op 20 september 2026 tegen de V4-broncode vanaf `be8eddd`. Dit onderzoek heeft geen e-mail verzonden en geen omgeving of database gewijzigd.

## Besluit

Communicatie blokkeert de deployment van de bestaande V4-scope niet. De nieuwsbriefmodule is bewust beperkt tot concepten. Die grens blijft gehandhaafd: `NEWSLETTER_DELIVERY_ENABLED=false`, geen planning, geen externe verzending en geen claim van aflevering. De eerdere productbeslissing staat in `docs/audits/2026-08-22-production-readiness-core-sprint-1.md`, onderdeel “Stretch 1 — nieuwsbrief production-safe”. Daar is de veilige conceptfunctie als afgerond aangemerkt en de verzendmotor als vervolgwerk.

Een volledige nieuwsbriefmotor bouwen of inschakelen is geen noodzakelijke deploymentreparatie. De app weigert externe nieuwsbriefstatussen ook wanneer iemand alleen de omgevingsvariabele op `true` zet. De deployworkflow vereist de uitgeschakelde vlag bovendien tijdens databasemigraties; dat is een containmentcontrole, geen algemene beperking op toekomstige implementatie.

## Bestaand en gecontroleerd

| Onderdeel | Implementatie en betekenis |
| --- | --- |
| Nieuwsbrief-capability | `apps/web/lib/email/newsletter-delivery-capability.ts`: `newsletterSenderImplemented=false`; een vlag kan geen niet-bestaande verzendfunctie activeren. |
| Concepten | `communication-hub-actions.ts` weigert elke status behalve `draft` vóór ontvangerpreparatie. `communication-forms.tsx` biedt alleen conceptopslag. De beheerpagina benoemt historische verzendstatussen als niet-bewezen. |
| Toestemming | Ouders kunnen toestemming geven en intrekken via `parent-portal-actions.ts`. Het schema vereist nieuwsbriefopt-in, status `granted` en geen afmeldtijdstip. |
| Doelgroepen | De nog niet geactiveerde resolver is tenantgebonden en kent ouders, programma/groep/niveau, afzwemmen, inhaalcredits, betalingen, instructeurs en intake/wachtlijst. Intake- en wachtlijstcontacten zonder toestemmingsrecord worden uitgesloten. |
| Berichtverkeer | De communicatiehub gebruikt bestaande gesprekken, meldingen, deelnemers en rollen. Deze acties genereren in-app bewijs en doen geen verborgen provider-call. |
| Transactioneel transport | `transactional.ts` ondersteunt de bestaande SendGrid API- en SMTP-configuratie, centrale transportuitschakeling, gereserveerde testadressen en tenantbranding. Provideracceptatie wordt niet als aflevering opgeslagen. |
| Duurzame verzendwachtrij | `outbox.ts` en de database-RPC's ondersteunen idempotente enqueue, atomische claims, leases, herstel, begrensde retries en terminale status. `/api/internal/email-outbox/process` vereist cron-autorisatie en de interne-jobsvlag. |

De eerdere live providercontrole was SendGrid **sandboxvalidatie**. Dat valideert een aanvraag zonder e-mail af te leveren of webhookevents te produceren; het bewijst geen ontvangst in een inbox. Zie de [officiële sandboxdocumentatie](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/sandbox-mode). Een reguliere SendGrid-respons `202` betekent acceptatie door de provider, zoals beschreven in de [Mail Send API](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send).

## Afzonderlijk implementatiepad voor daadwerkelijke nieuwsbriefverzending

Deze lijst legt het benodigde vervolg vast en is geen claim dat het al geïmplementeerd is.

1. **Duurzame lifecycle.** Voeg een tenantgebonden ontvanger/outbox-koppeling en unieke campagne-ontvanger-idempotency toe. Maak het vastleggen van campagne, ontvangers en geplande enqueue atomisch; de huidige voorbereidende losse inserts zijn geen productieklare verzendtransactie. Gebruik de bestaande outboxclaims en retries.
2. **Actuele toestemming.** Controleer de actieve tenantrelatie, het actuele adres, opt-in en afmelding opnieuw vlak vóór iedere providerpoging. Een snapshot bij planning is onvoldoende. Definieer apart hoe instructeurs toestemming geven: de huidige niet-actieve resolver behandelt een actieve instructeursrol als toestemming. Houd intake/wachtlijst uitgesloten zolang toestemming ontbreekt.
3. **Afmelden.** Implementeer tenantgebonden tokenvalidatie, alleen tokenhashes in opslag, een bevestigingspagina en idempotente afmelding. Stop ook reeds wachtende marketingitems. Ondersteun geschikte `List-Unsubscribe`-headers; de huidige transporttypes en SMTP/Mail Send-payload hebben hiervoor geen interface. Voor one-click HTTP POST geldt [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058).
4. **Inhoud en planning.** Render alleen ontvangergegevens die voor die doelgroep beschikbaar zijn, escape variabelen in HTML, bewaak classificatie en menselijke bevestiging, normaliseer het geplande tijdstip en voeg een begrensde due-worker toe. De huidige editor accepteert maximaal 100.000 tekens, terwijl de volledige outboxpayload hoogstens 65.536 bytes mag zijn; harmoniseer dit vóór enqueue.
5. **Waarheidsgetrouwe status.** Maak `accepted` expliciet voor ontvangers en communicatieleveringen of vertaal de bestaande status zonder aflevering te claimen. Koppel poging, provider-ID en outboxresultaat. Voeg alleen `delivered` toe met echt providerbewijs; open/clickvelden blijven leeg zonder een implementatie. Ondersteun gedeeltelijke mislukking, annulering en terminale campagneafhandeling.
6. **Schema en rechten.** Maak eventuele extra tabellen tenantgebonden met RLS en FORCE RLS. Nieuwe mutatie-RPC's moeten dezelfde service-only/invokerstructuur volgen als de outbox. De [actuele Supabase-functiedocumentatie](https://supabase.com/docs/guides/database/functions) adviseert invokerrechten en expliciete functieprivileges. De changelog is gecontroleerd; voor nieuwe API-tabellen moeten grants expliciet worden gecontroleerd.
7. **UI en releasecontract.** Pas capability, formulier, statusweergave, environmentdocumentatie en tests samen aan. Toon planning en verzending pas nadat de implementatie en het bewijs bestaan. Houd de default uitgeschakeld.

Verplicht verificatiepakket voor die afzonderlijke feature: tenantisolatie; geldige/ingetrokken/ontbrekende toestemming; wijziging tussen planning en retry; dubbele planning; concurrerende workers; verlopen leases; 429/5xx/permanente 4xx; annulering; volledige payloadbytegrens; HTML/variabelen; ongeldige en herhaalde afmeldtokens; gemengde campagneresultaten; provideracceptatie versus aflevering; browserflow met een lokale mailopvang en geen echte ontvangers.

## Uitgevoerde validatie

Op de onderzochte broncode zijn 31 tests geslaagd uit:

- `tests/unit/newsletter-production-safety.test.ts`
- `tests/unit/communication-hub-contract.test.ts`
- `tests/unit/communication-hub-schema.test.ts`
- `tests/unit/email-outbox-contract.test.ts`

Dit bevestigt de huidige concept-only- en transactionele contracten. Het is geen end-to-end bewijs van externe nieuwsbriefverzending, omdat die functie expliciet ontbreekt.
