# Sprint 32 — Privacy-first analytics en CRM-fundament

Status: geïmplementeerd in code; database-migratie, GA4-configuratie en juridische validatie volgen via staging.

## Productbeslissing

Google Analytics is niet de CRM-bron van waarheid. Een bezoeker kan analytics weigeren en alsnog een geldige intake versturen. Daarom registreert NXTTRACK bij de daadwerkelijk verstuurde intake first-party:

- kanaal en veilige bron;
- UTM source, medium, campaign, content en term na sanitisatie;
- alleen de hostname van een externe referrer;
- alleen het landingspad, zonder vrije queryparameters;
- alleen óf een ondersteunde advertentie-click-ID aanwezig was, nooit de click-ID zelf;
- de analytics-consentstatus op het moment van versturen.

Journey Bot-records worden uit leadrapportage gefilterd.

## GA4-beveiliging

- Basic Consent Mode: de Google-tag wordt niet geladen vóór toestemming.
- `analytics_storage` wordt alleen na akkoord `granted`.
- advertentieopslag, advertentiegebruik en advertentiepersonalisatie blijven `denied`.
- Google Signals en advertentiepersonalisatiesignalen zijn uitgeschakeld.
- namen, e-mailadressen, telefoonnummers, kindgegevens, intake-referenties en interne user-ID's worden niet naar Google gestuurd.
- paginaweergaven gebruiken alleen origin en pad; alle queryparameters, UTM-waarden en click-ID's blijven buiten Google.
- Google ontvangt uitsluitend het afgeleide categorische acquisitiekanaal, zoals `direct`, `organic_search` of `paid_social`; bron- en campagnenamen blijven first-party in NXTTRACK.
- de aanbevolen GA4-eventnaam `generate_lead` wordt pas op de bevestigde intake-successpagina verstuurd en per browsersessie gededupliceerd.
- toestemming kan via de blijvende knop `Cookievoorkeuren` worden ingetrokken; GA-cookies op de huidige host worden dan verwijderd.

Google schrijft voor dat consentdefaults vóór meetcommando's worden gezet en dat een wijziging meteen wordt doorgegeven. Ook verbiedt Google het meesturen van herkenbare persoonsgegevens. Bronnen:

- [Google Consent Mode voor websites](https://developers.google.com/tag-platform/security/guides/consent)
- [Google Analytics aanbevolen event `generate_lead`](https://developers.google.com/analytics/devguides/collection/ga4/reference/events)
- [Google Analytics: voorkom het versturen van PII](https://support.google.com/analytics/answer/6366371)

## Tenantervaring

Een tenant owner/admin kan onder `Organisatie → Instellingen → Google Analytics 4` een eigen `G-...` meet-ID opslaan en analytics op de publieke organisatiesite activeren.

Onder `Operations → Rapportages → Leadherkomst en conversie` staan:

- totaal echte leads;
- niet-direct herleidbare leads;
- geconverteerde leads en conversieratio;
- kanaal en bron;
- topcampagnes;
- GA-consentpercentage als meetkwaliteitscontext.

First-party bronrapportage werkt ook zonder tenant-GA4-configuratie.

## Instellen in lekentaal

### NXTTRACK-marketing

1. Open Google Analytics en maak een aparte GA4-property voor `nxttrack.nl`.
2. Maak daarin een webgegevensstream voor `https://nxttrack.nl`.
3. Kopieer het meet-ID dat begint met `G-`.
4. Open GitHub → repository `platform` → Settings → Environments.
5. Voeg bij `staging` en later bij `production` de variabele `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` toe.
6. Gebruik op staging bij voorkeur een aparte testproperty of aparte teststream.
7. Deploy staging opnieuw.
8. Open de site in een privévenster. Controleer dat vóór toestemming geen request naar `googletagmanager.com` of `google-analytics.com` vertrekt.
9. Sta analytics toe en controleer in GA4 Realtime of een page view binnenkomt.
10. Verstuur een testintake met bijvoorbeeld `?utm_source=test&utm_medium=email&utm_campaign=staging-check` en controleer zowel GA4 als NXTTRACK Rapportages.

### Zwemschool/tenant

1. Laat de zwemschool een eigen GA4-property of webstream beheren.
2. Log als tenant owner/admin in.
3. Ga naar Organisatie → Instellingen.
4. Vul onder Google Analytics 4 het `G-...` meet-ID in.
5. Vink analytics inschakelen aan en sla op.
6. Herhaal de privévenster- en netwerkcontrole.

Een tenantmeet-ID is openbaar configuratieniveau en hoort niet in Secrets.

## Punten voor de juridische concepten

Laat de jurist of privacyadviseur minimaal expliciet valideren:

1. wie verwerkingsverantwoordelijke is voor NXTTRACK-marketing en wie voor tenantleads;
2. de rollen van NXTTRACK, de zwemschool en Google plus de juiste verwerkersafspraken;
3. doelen, gegevenscategorieën, rechtsgrond en bewaartermijn van first-party leadattributie;
4. doelen, consentgrondslag, cookies/opslag, ontvangers, eventuele doorgiften en bewaartermijn van GA4;
5. hoe toestemming wordt ingetrokken en welke rechten betrokkenen hebben;
6. dat campagneparameters geen persoonsgegevens mogen bevatten;
7. een aparte bewaartermijn en verwijderprocedure voor niet-geconverteerde leads;
8. verwerking van gegevens over kinderen, inclusief dataminimalisatie en ouder/verzorger-rol.

De producttekst in de UI is een technische disclosure en geen vervanging voor de definitieve privacyverklaring, cookieverklaring, verwerkersovereenkomst of register van verwerkingen.

## Volgende CRM-fase

Het huidige intake-object is de lead. Een volgende sprint kan daarop bouwen met:

- pipelinefasen en verloren-redenen;
- lead owner en opvolgdatum;
- taken, notities en contactmomenten;
- saved views en filters op bron/campagne;
- duplicaat-samenvoeging;
- bron-tot-plaatsing en later bron-tot-omzet;
- platformbrede demo- en contactleads naast tenantintakes;
- export en bewaartermijnjobs.
