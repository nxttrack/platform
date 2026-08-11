# Ouderportaal — sitemap en paginaoverzicht

Status: actuele implementatie<br>
Scope: uitsluitend het ouderportaal; het leerlingportaal valt buiten dit document.

## 1. Doel en informatiearchitectuur

Het ouderportaal is opgebouwd rondom vijf terugkerende oudertaken:

1. zien wat nu aandacht nodig heeft;
2. lessen en praktische planning beheren;
3. de ontwikkeling van een kind volgen;
4. communiceren met de zwemschool;
5. betalingen en abonnementen beheren.

De vijf hoofdtaken staan permanent in de primaire navigatie. Minder vaak gebruikte informatie, accountinstellingen en voorkeuren staan onder het profielicoon. Daardoor blijft de hoofdnavigatie compact en wordt dezelfde informatie niet op meerdere plaatsen beheerd.

## 2. Globale navigatie en header

### Primaire navigatie

Op mobiel staat onderaan een vaste bottomnavigatie. Op desktop staat dezelfde navigatie als vaste zijbalk:

1. **Overzicht**
2. **Planning**
3. **Ontwikkeling**
4. **Inbox**
5. **Betalingen**

### Header

De header bevat op iedere ouderportaalpagina:

- **Kindselector** — keuze tussen `Alle kinderen` en ieder gekoppeld kind;
- **Notificatieknop** — toont het aantal ongelezen notificaties en een pop-over met recente notificaties;
- **Profielicoon** — opent het menu met informatie, accountpagina’s en voorkeuren.

De kindselectie wordt als `?kind=<participant-id>` in de URL vastgelegd. De selectie blijft behouden wanneer de ouder via de hoofd-, sub- of profielnavigatie naar een andere pagina gaat. Pagina’s met kindgebonden inhoud filteren hun gegevens op deze selectie.

### Profielmenu

Het profielmenu is als volgt gegroepeerd:

- **Informatie**
  - Documenten
  - Feedback
- **Account**
  - Gezin en toegang
  - Profiel
- **Voorkeuren**
  - Meldingsvoorkeuren
  - Privacy en toestemming

`Meldingsvoorkeuren` opent direct het communicatiegedeelte van Profiel. `Privacy en toestemming` opent direct het toestemmingsgedeelte van Media.

## 3. Sitemap

```text
Ouderportaal
├── Overzicht
│   └── /portaal
├── Planning
│   ├── Lessen
│   │   ├── /portaal/planning#lessen
│   │   └── Lesdetails
│   │       └── /portaal/lessen/[id]
│   ├── Inhalen
│   │   └── /portaal/planning#inhalen
│   └── Afzwemmen
│       └── /portaal/planning#afzwemmen
├── Ontwikkeling
│   ├── Voortgang
│   │   └── /portaal/ontwikkeling
│   ├── Badges
│   │   └── /portaal/ontwikkeling/badges
│   ├── Media
│   │   ├── /portaal/ontwikkeling/media
│   │   └── Privacy en toestemming
│   │       └── /portaal/ontwikkeling/media#toestemming
│   └── Diploma’s
│       └── /portaal/ontwikkeling/diplomas
├── Inbox
│   ├── Gesprekken
│   │   └── /portaal/inbox#gesprekken
│   ├── Mededelingen
│   │   └── /portaal/inbox#mededelingen
│   └── Meldingen
│       └── /portaal/inbox#meldingen
├── Betalingen
│   ├── Overzicht
│   │   └── /portaal/betalingen#overzicht
│   ├── Facturen
│   │   └── /portaal/betalingen#facturen
│   └── Betaalmethode
│       └── /portaal/betalingen#betaalmethode
└── Profielmenu
    ├── Informatie
    │   ├── Documenten
    │   │   └── /portaal/documenten
    │   └── Feedback
    │       └── /portaal/feedback
    ├── Account
    │   ├── Gezin en toegang
    │   │   └── /portaal/kinderen
    │   └── Profiel
    │       └── /portaal/profiel
    └── Voorkeuren
        ├── Meldingsvoorkeuren
        │   └── /portaal/profiel#communicatie
        └── Privacy en toestemming
            └── /portaal/ontwikkeling/media#toestemming
```

## 4. Paginaoverzicht

### 4.1 Overzicht

**URL:** `/portaal`<br>
**Doel:** in één oogopslag laten zien wat voor het gezin of geselecteerde kind belangrijk is.

#### Inhoud

- Persoonlijke welkomstkop.
- **Actie nodig** met maximaal relevante, actuele aandachtspunten:
  - afzwemuitnodiging beantwoorden;
  - openstaande betaling bekijken;
  - ongelezen updates bekijken;
  - beschikbare inhaalcredits gebruiken.
- Drie snelle doorgangen:
  - Planning, met status van de volgende les;
  - Ontwikkeling, met aantal badges;
  - Inbox, met aantal ongelezen updates.
- **Laatste updates** met maximaal drie recente notificaties, inclusief type, datum, titel en korte toelichting.
- **Volgende les** met datum, tijd, groep en link naar Planning.
- **Inhalen** met aantal beschikbare credits en uitleg over het ontstaan van credits.
- **Je gezin** wanneer alle kinderen zijn geselecteerd:
  - kind;
  - programma en groep;
  - niveau/badje;
  - volgende les;
  - laatste update;
  - voortgangspercentage;
  - knop om het portaal op dat kind te filteren.
- **Ontwikkeling van één kind** wanneer een specifiek kind is geselecteerd:
  - eerstvolgende actie;
  - volgende les;
  - voortgang;
  - tijdlijn met recente lessen, voortgang en badges;
  - links naar Planning en Ontwikkeling.

#### Acties

- Direct navigeren naar het relevante aandachtspunt.
- Naar Planning, Ontwikkeling of Inbox.
- Een kind als actieve context kiezen.

#### Lege situatie

- Melding wanneer er geen gekoppelde kinderen zijn.
- Positieve status wanneer er geen open acties zijn.
- “Nog geen les gepland” als er geen volgende les beschikbaar is.

---

### 4.2 Planning

**URL:** `/portaal/planning`<br>
**Doel:** lessen, inhaalactiviteiten en afzwemuitnodigingen op één operationele pagina beheren.

#### Subnavigatie

- Lessen
- Inhalen
- Afzwemmen

#### Samenvatting

- Aantal komende lessen.
- Aantal beschikbare inhaalcredits.
- Aantal afzwemuitnodigingen waarop nog gereageerd moet worden.
- Uitleg van de actuele annuleringstermijn van de zwemschool.

#### Lessen

Per les worden getoond:

- kind;
- datum en tijd;
- lesgroep;
- lesstatus;
- eventuele annuleringsstatus;
- link naar Lesdetails;
- annuleeractie als de les nog gepland is en de ouder mutatierechten heeft.

Bij annuleren:

- is een optionele reden mogelijk;
- wordt vooraf getoond of de annulering binnen de geldende termijn valt;
- ontstaat bij een tijdige annulering automatisch een inhaalcredit;
- ontstaat buiten de termijn geen credit;
- wordt altijd een bevestigingsstap gebruikt.

#### Inhalen

Per credit worden getoond:

- kind;
- status;
- geldigheidsdatum;
- bestaande aanvraag, indien aanwezig;
- maximaal vier passende inhaalmomenten;
- datum, tijd en groep van ieder moment;
- indicatie van beschikbaarheid/wachttijd.

Mogelijke acties:

- een inhaalmoment kiezen en bevestigen;
- de status van een bestaande aanvraag bekijken.

Beperkingen:

- alleen een primaire of secundaire verzorger kan boeken;
- de geldigheid, het niveau en de capaciteit worden bij bevestiging opnieuw gecontroleerd;
- bij gebrek aan capaciteit wordt een duidelijke lege status getoond.

#### Afzwemmen

Per uitnodiging worden getoond:

- kind;
- evenement;
- uitnodigingsstatus;
- datum en tijd;
- locatie;
- niveau/badje;
- resultaat, zodra bekend.

Mogelijke acties:

- uitnodiging bevestigen;
- uitnodiging afwijzen.

Een ouder met alleen-lezen toegang kan de informatie bekijken maar niet reageren.

---

### 4.3 Lesdetails

**URL:** `/portaal/lessen/[id]`<br>
**Doel:** alle praktische informatie en kindgebonden acties voor één les tonen.

#### Inhoud

- datum en tijd van de les;
- lesgroep;
- locatie/resource;
- sessiestatus;
- terugkoppeling naar Planning;
- een kaart per zichtbaar kind in deze les;
- annuleringsstatus en creditgeschiktheid.

#### Acties

- terug naar Planning, met behoud van de actieve kindselectie;
- een toekomstige geplande les annuleren;
- optionele annuleringsreden toevoegen;
- de annulering expliciet bevestigen.

---

### 4.4 Ontwikkeling — Voortgang

**URL:** `/portaal/ontwikkeling`<br>
**Doel:** de zwemontwikkeling begrijpelijk en positief per kind presenteren.

#### Subnavigatie

- Voortgang
- Badges
- Media
- Diploma’s

#### Samenvatting

- aantal zichtbare kinderen;
- aantal beoordeelde vaardigheden;
- gemiddelde voortgangsscore;
- aantal behaalde badges.

#### Inhoud

- Recente voortgangs- en badgemeldingen.
- Per kind:
  - naam en initialen;
  - actieve inschrijving;
  - programma;
  - huidig badje/niveau;
  - lesgroep;
  - startdatum;
  - berekende groeiring;
  - laatste compliment van de instructeur.
- Per voortgangsmodule:
  - module;
  - vaardigheden;
  - positief leerdoel;
  - positieve scorebenaming;
  - voortgangsbalk;
  - persoonlijke toelichting.
- Badgeoverzicht per kind:
  - titel;
  - beschrijving of datum;
  - behaalde status;
  - eventuele persoonlijke notitie.

#### Lege situaties

- Geen gekoppelde kinderen.
- Geen zichtbare voortgangsmodules.
- Nog geen beoordelingen voor een vaardigheid.
- Nog geen badges.

---

### 4.5 Ontwikkeling — Badges

**URL:** `/portaal/ontwikkeling/badges`<br>
**Doel:** behaalde mijlpalen vieren en veilig delen.

#### Samenvatting

- aantal behaalde badges;
- aantal gestarte collecties;
- aantal gegenereerde deelafbeeldingen.

#### Inhoud per kind

- naam en aantal behaalde momenten;
- visuele badgewand;
- behaalde badges;
- optioneel nog te behalen badges;
- vergrendelde presentatie van verrassingsbadges;
- doelgroep- en kindafhankelijke badgebenaming;
- badgedetails:
  - naam;
  - beschrijving;
  - categorie;
  - behaaldatum;
  - persoonlijke notitie;
  - meldingsstatus.

#### Acties

- Badgedetails openen.
- Een veilige vierkante deelafbeelding laten genereren.
- Een reeds gegenereerde deelafbeelding bekijken en delen.
- Badgevoorkeuren beheren:
  - in-app badgemeldingen;
  - badge-e-mails;
  - deelafbeeldingen;
  - nog te behalen badges tonen.

Bij delen wordt alleen de voornaam gebruikt en wordt de gepubliceerde Badge Studio-template toegepast.

---

### 4.6 Ontwikkeling — Media

**URL:** `/portaal/ontwikkeling/media`<br>
**Directe toestemmingslink:** `/portaal/ontwikkeling/media#toestemming`<br>
**Doel:** besloten voortgangsmedia veilig tonen en mediatoestemming beheren.

#### Vertrouwensinformatie

- Media wordt privé opgeslagen.
- Toestemming en gezinskoppeling worden bij iedere weergave opnieuw gecontroleerd.
- Media en opslagobjecten worden na de bewaartermijn automatisch verwijderd.

#### Inhoud per kind

- aantal gepubliceerde voortgangsmomenten;
- status `Toestemming actief` of `Publicatie geblokkeerd`;
- galerij met:
  - foto;
  - bijschrift;
  - publicatiedatum;
  - vervaldatum;
  - downloadmogelijkheid als de zwemschool dit toestaat.
- Uitleg wanneer bekijken wel, maar downloaden niet is toegestaan.
- Toestemmingspaneel met:
  - doel en beleidsversie;
  - laatst gemaakte keuze;
  - gecombineerde toestemmingsstatus van gekoppelde verzorgers;
  - bevoegdheid van de beslisser.

#### Acties

- Toestemming geven.
- Toestemming intrekken.
- Expliciet geen toestemming geven.
- Aangeven of de gebruiker ouder/verzorger of wettelijk vertegenwoordiger is.
- Media downloaden wanneer dit is toegestaan.

Alle toestemmingswijzigingen vereisen een bewuste bevestiging. Een gebruiker met alleen-lezen toegang kan geen toestemming wijzigen.

---

### 4.7 Ontwikkeling — Diploma’s

**URL:** `/portaal/ontwikkeling/diplomas`<br>
**Doel:** officiële diploma’s en certificaten op één private plaats bewaren.

#### Inhoud

Per diploma of certificaat:

- kind;
- titel;
- uitgiftestatus;
- programma;
- badje/niveau;
- uitgiftedatum;
- certificaatnummer;
- eventuele toelichting;
- downloadmogelijkheid als een bestand beschikbaar is.

#### Digitale echtheidscontrole

Wanneer verificatie actief is:

- kan een QR-code worden geopend;
- kan de openbare verificatiepagina worden geopend;
- kan de geldigheid worden gecontroleerd zonder het private diplomabestand te delen.

Afzwemuitnodigingen staan bewust niet op deze pagina; die horen onder Planning. Hierdoor staat hier alleen het definitieve resultaat.

---

### 4.8 Inbox

**URL:** `/portaal/inbox`<br>
**Doel:** gesprekken, algemene mededelingen en persoonlijke meldingen op één communicatiepagina samenbrengen.

#### Subnavigatie

- Gesprekken
- Mededelingen
- Meldingen

#### Samenvatting

- aantal gesprekken;
- aantal updates;
- aantal ongelezen meldingen.

#### Gesprekken

- Lijst met persoonlijke gespreksthreads.
- Geselecteerd gesprek met berichtenhistorie.
- Ongelezenstatus per gesprek.
- Mogelijkheid om te antwoorden.
- Mogelijkheid om een nieuw gesprek te starten:
  - kind kiezen;
  - onderwerp en bericht invoeren;
  - alleen de relevante kindcontext met de zwemschool delen.

#### Mededelingen

- Gepubliceerde ouderberichten van de zwemschool.
- Doelgroep.
- Titel.
- Publicatiedatum.
- Volledige berichtinhoud.

#### Meldingen

Meldingen over onder meer:

- voortgang;
- badges;
- documenten;
- betalingen;
- afzwemmen;
- algemene berichten.

Per melding:

- type;
- titel;
- datum;
- inhoud;
- gelezen/ongelezenstatus.

Een individuele melding kan als gelezen worden gemarkeerd. Via de header kunnen alle meldingen in één keer als gelezen worden gemarkeerd.

---

### 4.9 Betalingen

**URL:** `/portaal/betalingen`<br>
**Doel:** abonnementen, betaalstatus, facturen en betaalmethode transparant bij elkaar tonen.

#### Subnavigatie

- Overzicht
- Facturen
- Betaalmethode

#### Samenvatting

- aantal abonnementen;
- totaal openstaand bedrag;
- totaal te laat bedrag;
- aantal betaalde betalingen;
- aantal facturen.

#### Abonnementen

Per abonnement:

- kind;
- abonnementsnaam;
- bedrag en interval;
- handmatige betaling of automatische incasso;
- abonnementsstatus;
- startdatum;
- volgende vervaldatum;
- status van de SEPA-machtiging.

Mogelijke acties:

- eerste betaling en automatische incasso veilig via Mollie activeren;
- een bestaande SEPA-machtiging intrekken na invoer van een expliciete bevestiging;
- een nog openstaande Mollie-betaling hervatten.

#### Aangekondigde incasso’s

- gepland incassomoment;
- status;
- status van de voorafmelding;
- eventuele foutmelding.

#### Betaalstatus

Per betaling:

- kind;
- bedrag;
- abonnement;
- vervaldatum;
- status;
- betaaldatum;
- methode;
- referentie;
- terugbetaald bedrag;
- gestorneerd bedrag;
- eventuele notitie.

#### Terugbetalingen en storneringen

- type;
- bedrag;
- status;
- aanvraag- of ontvangstdatum;
- omschrijving of redencode;
- eventuele foutmelding.

#### Facturen

- factuurnummer of conceptstatus;
- totaalbedrag;
- vervaldatum;
- status;
- eventuele notitie.

#### Technische betaalgegevens

Standaard ingeklapt en alleen op verzoek zichtbaar:

- provider-betaalpogingen;
- betaalstatus en eventuele foutmelding;
- veilige hervatlink naar Mollie;
- recente betaalgeschiedenis/billingevents.

---

### 4.10 Documenten

**URL:** `/portaal/documenten`<br>
**Locatie:** Profielmenu → Informatie<br>
**Doel:** oudergerichte documenten van de zwemschool beschikbaar maken.

#### Inhoud

- aantal zichtbare documenten;
- indicatie dat alleen ouderportaal-documenten worden getoond;
- per document:
  - titel;
  - beschrijving;
  - doelgroep;
  - bestandsnaam;
  - bestandsgrootte;
  - publicatie-/aanmaakdatum;
  - opslagstatus.

#### Actie

- Het document veilig downloaden als een bestand beschikbaar is.

---

### 4.11 Feedback

**URL:** `/portaal/feedback`<br>
**Locatie:** Profielmenu → Informatie<br>
**Doel:** korte, privacybewuste feedback aan de zwemschool verzamelen.

#### Inhoud

- Uitleg over het interne gebruik van scores en vrije tekst.
- Open feedbackvragen per kind.
- Naam van de campagne.
- Verwachte invultijd.
- Vraag met score van 0 tot en met 10.
- Optionele vervolgvraag met vrije tekst.
- Optionele toestemming voor persoonlijke opvolging.
- Maximaal drie recent afgeronde vragen met ontvangen score.

#### Acties

- Score kiezen.
- Optionele toelichting toevoegen.
- Persoonlijke opvolging toestaan of weigeren.
- Feedback veilig verzenden.

#### Beveiliging en lege situatie

- Vrije tekst wordt als persoonsgegeven behandeld.
- Geheime gegevens zoals wachtwoorden en bankgegevens worden geweerd.
- Er verschijnt een positieve lege status wanneer geen vragen openstaan.

---

### 4.12 Gezin en toegang

**URL:** `/portaal/kinderen`<br>
**Locatie:** Profielmenu → Account<br>
**Doel:** tonen welke kinderen aan het account zijn gekoppeld en welke bevoegdheid de ouder per kind heeft.

#### Inhoud per kind

- naam;
- geboortedatum;
- actieve/inactieve status;
- programma;
- huidig badje/niveau;
- lesgroep;
- volgende les;
- beschikbare inhaalcredits;
- relatie tot het kind;
- toegangsniveau:
  - volledige toegang;
  - gedeelde toegang;
  - alleen bekijken.

Deze pagina is informatief. Operationele acties blijven op Planning, Ontwikkeling, Inbox of Betalingen staan.

---

### 4.13 Profiel en voorkeuren

**URL:** `/portaal/profiel`<br>
**Locatie:** Profielmenu → Account<br>
**Doel:** persoonlijke gegevens en communicatievoorkeuren beheren.

#### Profielgegevens

- naam, bewerkbaar;
- telefoonnummer, bewerkbaar;
- e-mailadres, alleen-lezen.

#### Inhaalmarktplaatsvoorkeuren

- uitnodigingen voor passende inhaalmomenten in het portaal;
- e-mail bij een passende plek;
- toestemming voor later configureerbare automatische uitnodigingsrecepten.

Een uitnodiging boekt nooit automatisch; de ouder moet altijd zelf bevestigen.

#### Communicatievoorkeuren

Direct bereikbaar via `/portaal/profiel#communicatie`:

- in-app meldingen;
- servicemails over lessen, planning en account;
- optionele nieuwsbrieven per e-mail;
- expliciete marketingtoestemming wanneer nieuwsbrieven worden ingeschakeld.

#### Pushmeldingen

- actuele browser-/apparaatstatus;
- pushmeldingen activeren of beheren;
- ondersteuning voor het geregistreerde apparaat.

#### Acties

- profiel opslaan;
- inhaalvoorkeuren opslaan;
- communicatievoorkeuren opslaan;
- pushmeldingen beheren.

## 5. Functionele verdeling zonder dubbele informatie

| Onderwerp | Primaire eigenaar | Andere pagina’s tonen alleen |
|---|---|---|
| Openstaande acties | Overzicht | Een directe link naar de eigenaar |
| Lessen en annuleren | Planning | Volgende-les-samenvatting |
| Inhaalcredits en boeken | Planning | Aantal beschikbare credits |
| Afzwemuitnodigingen | Planning | Actiesignalering op Overzicht en Inbox |
| Voortgang en vaardigheden | Ontwikkeling | Korte voortgangssamenvatting |
| Badges en delen | Ontwikkeling → Badges | Aantal badges en recente badge-updates |
| Mediatoestemming | Ontwikkeling → Media | Directe profielmenulink |
| Definitieve diploma’s | Ontwikkeling → Diploma’s | Diploma-uitgiftemelding |
| Gesprekken en notificaties | Inbox | Ongelezen teller en recente updates |
| Abonnementen en betalingen | Betalingen | Alleen openstaand aandachtspunt |
| Gezinskoppeling en rechten | Gezin en toegang | Kindselector gebruikt de koppeling |
| Persoons- en communicatievoorkeuren | Profiel | Profielmenu linkt naar het juiste onderdeel |

## 6. Mobiel, native en desktopgedrag

### Mobiel/native

- Vaste bottomnavigatie met vijf items.
- Ondersteuning voor de bovenste en onderste native safe-area.
- Minimaal circa 44 px hoge interactieve elementen.
- Kindselector, notificaties en profiel blijven altijd bereikbaar.
- Subnavigaties zijn horizontaal bruikbaar op smalle schermen.
- Kaarten en formulieren stapelen verticaal.
- Extra onderruimte voorkomt dat content achter de bottomnavigatie valt.

### Desktop

- Permanente zijbalk met dezelfde vijf hoofdnavigatie-items.
- Zijbalk kan worden ingeklapt.
- Header en content gebruiken de beschikbare viewportbreedte.
- Overzichten schakelen waar zinvol naar twee-, drie- of vijfkoloms layouts.
- Brede werkruimtes, zoals Inbox, gebruiken de extra ruimte voor lijst en detail naast elkaar.

## 7. Compatibiliteitsroutes

De volgende bestaande routes blijven technisch ondersteund, maar staan niet meer als afzonderlijke navigatie-items in de interface:

| Bestaande route | Canonieke bestemming/eigenaar |
|---|---|
| `/portaal/lessen` | Planning |
| `/portaal/afzwemmen` | Planning → Afzwemmen |
| `/portaal/voortgang` | Ontwikkeling → Voortgang |
| `/portaal/badges` | Ontwikkeling → Badges |
| `/portaal/media` | Ontwikkeling → Media |
| `/portaal/diplomas` | Ontwikkeling → Diploma’s |
| `/portaal/berichten` | Inbox |

Hierdoor blijven bestaande bookmarks en interne links bruikbaar terwijl de nieuwe sitemap leidend is.

## 8. Scopegrens

Dit document beschrijft alleen het ouderportaal. Functionaliteit, navigatie en schermen voor een zelfstandig leerlingportaal zijn bewust niet meegenomen en kunnen later als een aparte informatiearchitectuur worden ontworpen.
