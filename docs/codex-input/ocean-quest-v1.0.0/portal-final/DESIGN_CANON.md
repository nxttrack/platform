# NXTTRACK Ocean Quest — definitieve ontwerpcanon ouderportaal

## 1. Ontwerpuitkomst

Ocean Quest is geen decoratief blok boven een traditioneel dashboard, maar de primaire, interactieve navigatie door de ontwikkeling van een kind. De onderwaterwereld blijft speels en kindvriendelijk; alle taakgerichte ouderfuncties blijven professioneel, compact en voorspelbaar.

De volledige familie gebruikt:

- een licht aqua paginafundament;
- een losstaande, afgeronde donker-navy sidebar op desktop;
- een afzonderlijke witte/glazen header met dezelfde bovenlijn;
- witte kaarten met zachte blauwgroene schaduw;
- aqua en blauw voor primaire voortgang;
- goud voor mijlpalen en surprisebadges;
- koraal voor aandacht en blokkades;
- paars voor secundaire categorieën;
- de vriendelijke ronde Manta met beide ogen zichtbaar.

## 2. Shell

### Desktop vanaf 1280 px

- Buitenmarge: 22 px.
- Sidebar: 238 px breed, volledige beschikbare hoogte, radius 28 px.
- Ruimte tussen sidebar en hoofdvlak: 18 px.
- Header: 72 px hoog, radius 23 px.
- Header bevat links tenantlogo, tenantnaam en productcontext.
- Header bevat rechts uitsluitend notificaties en profiel.
- De kindselector vervalt als losse control.
- Onder profiel staat het actieve kind en de actie `Ander kind…`.
- Desktopsidebar bevat Overzicht, Planning, Ontwikkeling, Inbox en Betalingen.
- Documenten, Feedback, Gezin/toegang en Profiel vallen onder `Profiel & meer`.
- Badges, Media en Diploma’s blijven subpagina’s van Ontwikkeling.

Op het dashboard vormen sidebar en rechterkolom één geometrisch frame:

- bovenkant sidebar = bovenkant header;
- header, Ocean Quest en onderkaarten delen exact dezelfde linker- en rechterlijn;
- drie onderkaarten hebben gelijke breedte en hoogte;
- onderkant onderkaarten = onderkant sidebar;
- geen documentscroll op een normale desktopviewport.

Andere pagina’s behouden sidebar en header. Alleen het contentvlak scrolt.

### Tablet 768–1279 px

- Vanaf 1024 px mag een compacte icon-sidebar worden gebruikt.
- Onder 1024 px verdwijnt de sidebar en verschijnt de lichte bottomnav.
- Landscape mag de horizontale Quest behouden; portrait gebruikt de verticale Quest.
- Contentkaarten gaan van meerdere kolommen naar één of twee kolommen.

### Mobiel onder 768 px

- Eén normale documentscroll; geen geneste verticale scrollcontainers.
- Floating header: circa 70–72 px.
- Lichte, witte bottomnav: Overzicht, Planning, Ontwikkeling, Inbox en Meer.
- Betalingen staat uitsluitend onder Meer, niet als zesde bottomnav-item.
- Bottomnav respecteert `env(safe-area-inset-bottom)`.
- De eerste dashboardviewport bevat header, volledige Quest-container en bottomnav.
- Openstaande acties, Updates en Berichten beginnen direct onder de eerste vouw.

## 3. Interactieve Ocean Quest

### Hoofdstukken en eilanden

- Eén badje vormt één hoofdstuk tussen twee eilanden, bijvoorbeeld `Badje 2 → Badje 3`.
- Zonder tussenbadjes bestaat één hoofdstuk van start naar diploma.
- In dat geval verdwijnt de badjering; de diplomaring blijft rechts uitgelijnd.
- Een hoofdstukillustratie bevat uitsluitend wereld en eilanden.
- Route, punten, parels, bonusparels, Manta, pop-overs en ringen zijn losse datalagen.
- Een dynamisch hoofdstuk kan zonder lege posities 4, 7, 12 of meer onderdelen tonen.

### Volgorde

- Voltooide onderdelen worden chronologisch bevroren als grote lichtgevende parels.
- Het eerstvolgende onderdeel met de meeste voortgang staat standaard centraal.
- Bij ontbrekende beoordelingen geldt curriculumvolgorde en daarna alfabetische volgorde.
- Overige onafgeronde onderdelen volgen op voortgang.
- Zodra een onderdeel voltooid is, verandert zijn punt in een parel en blijft de plek historisch vaststaan.

### Surprisebadges

- Een onverdiende surprisebadge bestaat visueel nergens.
- Na behalen verschijnt deze chronologisch als kleine gouden bonusparel op een aftakkende stippellijn.
- Behaald vóór het eerste onderdeel: tussen starteiland en punt 1.
- Behaald tussen twee onderdelen: tussen die twee punten.
- Behaald na het laatste onderdeel: vóór het doeleiland.
- Meerdere verrassingen op hetzelfde moment vormen een compacte parelcluster.
- Surprisebadges tellen nooit mee voor de badje- of diplomaring.

### Selectie en deeplinks

- Hover, focus of klik op een onafgerond punt toont naam, voortgang, laatste wijziging en `Bekijk meer`.
- `Bekijk meer` opent `/portaal/ontwikkeling?onderdeel=<id>&kind=<id>` met het onderdeeldetail direct geopend.
- Klik op een voltooide parel toont de bijbehorende badge.
- De ronde pijl opent `/portaal/ontwikkeling/badges?badge=<instance-id>&vier=1`.
- Deze state opent direct `Deel deze mijlpaal!`.

### Desktopinteractie

- De binnenwereld is breder dan het zichtbare masker.
- Slepen, horizontaal trackpad, zichtbare pijlen en toetsenbordnavigatie verplaatsen de wereld.
- Verticaal muiswiel wordt niet gekaapt.
- Selecteren centreert het punt in 350–500 ms.
- De achtergrond is 108–116% ingezoomd.
- Twee behaalde punten staan links, het actieve punt centraal en minimaal twee vervolgstappen rechts.
- Punten liggen verder uiteen dan in de eerdere versies, zodat de reis inspanning uitstraalt.

### Mobiele interactie

- Een eigen portrait-artwork loopt van onder naar boven.
- Twee behaalde parels staan onder het actieve punt.
- Het actieve punt staat rond 52–54% van de Quest-hoogte.
- Twee kleinere vervolgstappen staan met ruimere tussenafstand erboven.
- Gewone paginascroll blijft leidend; markerselectie en vorige/volgende verschuiven de wereld.
- Vrij pannen mag uitsluitend binnen een expliciete `Verken de route`-modus.
- De Manta blijft een losse laag, toont beide ogen en kijkt naar het geselecteerde punt.

### Afgeronde hoofdstukken

- Afgeronde hoofdstukken worden als onveranderlijke snapshot bewaard.
- Snapshot bevat artworkversie, curriculumversie, puntenvolgorde, parels, bonusparels en behaalde badges.
- Latere curriculum- of artworkwijzigingen wijzigen een historische reis niet.
- Ontwikkeling toont `Mijn Ocean Quest` met alle afgeronde hoofdstukken en het huidige hoofdstuk.

## 4. Schermcanon

### Overzicht — `/portaal`

- Interactieve Quest als dominant paneel.
- Linksboven: zwemreis, etappe, volgende les, tijd, zwembad, bad en baan.
- Rechtsonder: ring naar volgend badje en ring naar diploma.
- Onder het paneel: Openstaande acties, Updates en Berichten.
- Iedere rij is een directe deeplink.
- Mobiel toont de volledige Quest binnen de eerste viewport.

### Planning — `/portaal/planning`

- Geen verplichte drag-and-drop.
- Vier vaste tabs: Lessen, Inhalen, Afzwemmen en Vakantieaanbod.
- Lessen tonen kind, groep, tijd, locatie, status en wijzigdeadline.
- Afmelden vermeldt vooraf of een inhaalcredit ontstaat.
- Inhalen toont beschikbare/verlopen credits en maximaal vier passende momenten.
- Capaciteit, niveau, geldigheid en tenantbeleid worden bij boeken opnieuw gecontroleerd.
- Afzwemmen toont uitnodiging, datum, locatie, niveau, reactie en uitslag.
- Aanbod toont vakantie-, turbo- en tijdelijke plaatsingen, prijs, voorwaarden, capaciteit en betaalwijze.

### Lesdetail — `/portaal/lessen/[id]`

- Datum, tijd, status, kind, groep, trainer, resource en locatie.
- Lesnotitie en context van vorige/volgende les.
- Afmelden vraagt bevestiging en een optionele reden.
- `view_only` ziet geen muterende actie.

### Ontwikkeling — `/portaal/ontwikkeling`

- Programma, huidig badje, onderdelen, gemiddelde en badges.
- Beide voortgangsringen gebruiken dezelfde centrale progress-engine als het dashboard.
- Huidig hoofdstuk opent de interactieve reis.
- Onderdelen tonen 1–5 sterren/smileys, `Nog niet beoordeeld`, carryover en laatste wijziging.
- Onderdeeldetail bevat uitleg, video, beoordelingshistorie, docentnotitie en badgekoppeling.
- Dezelfde pagina toont een badgewall-preview en `Mijn Ocean Quest` met afgeronde hoofdstukken.

### Badges — `/portaal/ontwikkeling/badges`

- Categoriecontainers: zwemvaardigheden, moed/zelfvertrouwen, complimenten en verdiende verrassingen.
- Exact vier kolommen vanaf tablet en twee op mobiel.
- Verdiend: volledig op kleur.
- Locked standaardbadge: alleen artwork circa 30% opacity; naam, slot en status volledig leesbaar.
- Onverdiende surprisebadge: volledig afwezig, zonder lege positie of teller.
- Elk behaald exemplaar is afzonderlijk deelbaar als square of story.
- Native share heeft een downloadfallback.

### Media — `/portaal/ontwikkeling/media`

- Besloten media met publicatie- en vervaldatum.
- Veilig bekijken en alleen downloaden wanneer beleid en permission dit toestaan.
- Toestemming geven, weigeren of intrekken gebeurt per kind en policyversie.
- Alleen-lezen toegang blijft alleen-lezen.

### Diploma’s — `/portaal/ontwikkeling/diplomas`

- Private diplomakluis met titel, programma, badje, datum, nummer en notities.
- Beveiligde download van het private bestand.
- Optionele publieke QR bevestigt uitsluitend echtheid en minimale gegevens.
- Publieke verificatie geeft nooit toegang tot het private document.

### Inbox — `/portaal/inbox`

- Tabs: Gesprekken, Mededelingen en Meldingen.
- Desktop: lijst en thread naast elkaar.
- Mobiel: lijst en thread als afzonderlijke states.
- Zoeken, status, nieuw oudergesprek, antwoorden en gelezenstatus.
- Geen bijlagen in deze versie.

### Betalingen — `/portaal/betalingen`

- Desktopsidebar en mobiel onder Meer.
- Tabs: Overzicht, Facturen en Betaalmethode.
- Abonnementen, openstaand, te laat, betaald, handmatig, Mollie en aangekondigde incasso’s.
- Facturen en creditnota’s tonen btw, status en beveiligde PDF.
- SEPA-machtiging, eerste betaling, intrekken, refunds en storneringen.
- Technische pogingen en eventhistorie blijven een secundaire detailstate.

### Documenten — `/portaal/documenten`

- Titel, omschrijving, doelgroep, bestandsnaam, grootte, datum en status.
- Alleen veilige downloads; geen beheeracties.
- Verlopen of onbeschikbaar krijgt een uitlegbare status.

### Feedback — `/portaal/feedback`

- Open campagnes per kind.
- Score 0–10, optionele toelichting en aparte toestemming voor opvolging.
- Verlopen campagnes zijn gesloten.
- Recente reacties blijven read-only zichtbaar.
- Dubbel verzenden wordt geblokkeerd.

### Gezin en toegang — `/portaal/kinderen`

- Alle gekoppelde kinderen, status, programma, badje, groep, volgende les, credits, relatie en toegangsniveau.
- Begrijpelijke niveaus: volledig, gedeeld en alleen-lezen.
- Kind wisselen gebeurt via profiel en behoudt waar logisch route en hash.

### Profiel — `/portaal/profiel`

- Naam en telefoon bewerkbaar; e-mail read-only.
- Inhaaluitnodigingen, in-appmeldingen, servicemails, nieuwsbrief, marketing en web-push.
- Pushpermission pas na een bewuste actie.
- Niet-opgeslagen wijzigingen geven een vertrekwaarschuwing.

## 5. Rechten

- Muterende acties worden verborgen voor `view_only` en altijd opnieuw server-side gecontroleerd.
- Niet toegestaan bij `view_only`: afmelden, inhalen boeken, afzwemmen beantwoorden, aanbod reserveren, toestemming wijzigen, feedback insturen, betalen, betaalmethode aanpassen, gesprekken starten/beantwoorden en badges publiek delen.
- Wel toegestaan: toegestane informatie bekijken, eigen leesstatus bijhouden en eigen profiel/communicatievoorkeuren wijzigen.
- Downloadrechten voor diploma’s, facturen, media en documenten worden afzonderlijk beoordeeld.

## 6. Toegankelijkheid

- Route is semantisch een geordende lijst; het SVG-pad is decoratief.
- Markerknoppen noemen onderdeel, percentage, status en laatste update.
- Actief punt gebruikt `aria-current="step"`.
- Hoverinformatie is ook via focus en klik bereikbaar.
- Alle touch-targets zijn minimaal 48×48 px.
- Kleur is nooit de enige statusdrager.
- Glasvlakken voldoen aan WCAG AA.
- `prefers-reduced-motion` vervangt panning door een korte crossfade en stopt idle motion.
- Escape sluit pop-overs; focus keert terug naar de marker.
- Browserzoom en pinch-zoom blijven toegestaan.

## 7. Android-richting

De visuele familie kan één-op-één worden toegepast op de 13 native schermstates. Web blijft functioneel canoniek. Android-pariteit wordt aangevuld voor:

- inhaalboeking, afzwemoverzicht en vakantieaanbod;
- nieuw gesprek en volledig mededelingenoverzicht;
- SEPA/Mollie, abonnementdetails, refunds en storneringen;
- profielbewerking, communicatievoorkeuren en push;
- badgevoorkeuren, share-assets en multibadgeviering;
- publieke diplomaverificatie.

Native bottomnav volgt voortaan dezelfde definitieve hiërarchie: Home, Planning, Zwemreis, Inbox en Meer. Betalingen verhuist onder Meer en mag niet als vijfde én ook niet als zesde zelfstandig item terugkomen.
