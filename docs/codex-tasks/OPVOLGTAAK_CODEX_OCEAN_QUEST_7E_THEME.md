> **SUPERSEDED — NIET UITVOEREN.** Deze opdracht is voor scope en werkwijze vervangen door `NXTTRACK_CODEX_CLOUD_PARENT_CHILD_IMPLEMENTATIESPRINT_V1.0.md`. Alleen de daarin expliciet behouden bron- en integriteitsregels blijven van toepassing.

# Opvolgtaak voor Codex — voeg Ocean Quest toe als zevende NXTTRACK-thema

## Opdracht

Voeg **Ocean Quest** volledig toe als zevende theme pack aan het reeds opgeleverde en/of reeds geïntegreerde NXTTRACK-themastelsel.

De huidige set bestaat uit:

1. NXTTRACK Default;
2. Dolphin Bay;
3. Turtle Trails;
4. Polar Splash;
5. Coastal Explorer;
6. Nationaal Zwem ABC.

Daaraan wordt nu toegevoegd:

7. **Ocean Quest** — een premium, heldere, kindvriendelijke 3D-onderwaterreis met de vriendelijke blauwe Manta als losse interactieve mascotte.

Dit is een **aanvullende implementatiesprint**, geen nieuw redesign en geen vervanging van de zes bestaande thema’s. Behoud de bestaande zes thema’s byte-for-byte waar een wijziging niet technisch noodzakelijk is. Wijzig hun vormgeving, copy, assets, routes of gedrag niet. Deel uitsluitend generieke infrastructuur wanneer dit aantoonbaar nodig is om Ocean Quest volgens dezelfde theme engine te registreren.

Werk volledig autonoom door tot implementatie, assets, responsive pagina’s, tests, renders, documentatie en het bijgewerkte overdrachtspakket gereed zijn. Geef geen tussentijdse voortgangsberichten. Maak kleine, logisch afgebakende commits. Push niet en open geen PR, tenzij daar afzonderlijk opdracht voor wordt gegeven.

---

## 1. Gezaghebbende bronnen en volgorde

Bestudeer vóór de eerste wijziging volledig:

1. alle repository-instructies, `AGENTS.md`/Codex-instructies, architectuur, bestaande theme registry, datamodellen, RLS, server actions, tests en CI;
2. het bestaande pakket `NXTTRACK_Theme_Packs_Codex_Ready_v1.0.0.zip` en vooral de daarin opgenomen masterprompt, canon, manifests, HTML/CSS/JS, routecontracten, copy-snapshots, assets en QA-scripts;
3. `NXTTRACK_Ocean_Quest_Definitief_Complete.zip`;
4. `NXTTRACK_Ocean_Quest_Complete_desktop.png`;
5. `NXTTRACK_Ocean_Quest_Complete_mobile.png`;
6. `NXTTRACK_Ocean_Quest_Interactive_Dashboard_Desktop_8K.png`;
7. `NXTTRACK_Ocean_Quest_Interactive_Dashboard_Mobile_LightNav_v2_HighRes.png`;
8. het Ocean Quest responsive prototype `portal-final/index.html`;
9. `portal-final/DESIGN_CANON.md` of het meegeleverde gelijkwaardige Ocean Quest-canondocument.

Als een bestandsnaam in het aangeleverde pakket anders is, zoek dan op inhoud en leg de gevonden mapping vast. Ontbreekt een gezaghebbende Ocean Quest-visual, het prototype of de canon daadwerkelijk, dan is dat een echte blocker: **ga niet op basis van eigen smaak benaderen of opnieuw ontwerpen**, maar rapporteer exact welk bronbestand ontbreekt.

Bij tegenstrijdigheid geldt:

1. deze opvolgtaak voor scope, nieuwste shellbesluiten en acceptatiecriteria;
2. de definitieve Ocean Quest-canon en het responsive Ocean Quest-prototype voor geometrie, interactie en copy;
3. de definitieve desktop- en mobiele visuals voor art direction en visuele vergelijking;
4. het bestaande zeventhema-onafhankelijke route-, data-, security- en permissioncontract uit de repository;
5. oudere Ocean Quest-documenten uitsluitend als historische context.

De nieuwste besluiten in deze taak hebben dus expliciet voorrang op oudere varianten met een losse kindselector, een donkere mobiele bottomnav of Betalingen als mobiel hoofditem.

---

## 2. Niet-onderhandelbare uitgangspunten

- Canonieke theme-ID: `ocean-quest`. Maak geen tweede alias of alternatieve theme-ID als die ID al bestaat.
- Gebruik de volgende passende niet-brekende versie volgens de bestaande manifestconventie. Behoud bestaande opgeslagen theme-selecties.
- Voeg Ocean Quest achter de bestaande platform-/tenantthemeconfiguratie toe. Activeer het niet automatisch voor bestaande tenants.
- Zorg dat Ocean Quest uit de keuzelijst kan worden teruggedraaid zonder voortgang, hoofdstuksnapshots of archiefdata te verwijderen.
- Ocean Quest gebruikt exact dezelfde `PortalUserShell`, routes, viewmodels, commands, rechten, RLS, downloads en domeinlogica als de overige thema’s.
- Een thema mag uitsluitend recipes, semantic tokens, materialen, vormen, assets, motion, haptics, geluid en presentatie bepalen. Voeg geen verspreide `theme === 'ocean-quest'`-branches toe aan route-, query-, command- of domeincode.
- Scope alle themaspecifieke CSS via het bestaande theme-attribuut, bijvoorbeeld `[data-theme="ocean-quest"]`. Voeg geen globale selector of hardcoded Ocean Quest-kleur toe die een bestaand thema kan beïnvloeden.
- Theme switching `bestaand thema → Ocean Quest → bestaand thema` mag geen tokens, assets, styles of state achterlaten. SSR en hydration leveren direct hetzelfde tenantthema zonder flash van Default.
- Verwijder, verberg of vereenvoudig geen bestaande functie omdat deze niet op een referentiebeeld staat. Iedere extra functie die in de actuele code bestaat, krijgt een visueel gelijkwaardige Ocean Quest-uitwerking.
- Gebruik echte data en bestaande viewmodels. Namen, data, percentages, lessen, locaties en statussen uit voorbeelden zijn uitsluitend fixtures; hardcode bijvoorbeeld niet `Mila` of `Zwembad De Waterlijn` in productiecode.
- Alle zichtbare tekst blijft echte HTML/native UI. Bak geen tekst, markers, ringen, knoppen, logo’s, badges, mascottes of persoonsgegevens in achtergronden.
- Gebruik geen screenshot als pagina, geen iframe, geen canvas-screenshottruc en geen monolithische showcasecomponent als productie-implementatie.
- Iedere letter, afbeeldingsuitsnede, radius, afstand, schaduw, kolom, kaartvolgorde en interactiestate uit het definitieve prototype wordt letterlijk overgenomen. Niet “in de geest van”, maar aantoonbaar gelijk.
- De badgepagina en alle badgestates worden volledig ontworpen en geïntegreerd, maar de **definitieve badge-artworks blijven placeholders**. Bouw nu geen nieuwe badgecollectie.

---

## 3. Ocean Quest-identiteit

Ocean Quest is een heldere, premium 3D-onderwaterzwemreis:

- licht aqua paginafundament;
- ondiep turquoise water en zachte lichtstralen;
- lichte kalksteenriffen, beheerste koralen, schelpen, parels, stepping stones en kleine routevlaggen;
- witte/glazen kaarten met zachte blauwgroene schaduw;
- aqua en helder blauw voor primaire voortgang;
- goud voor behaalde mijlpalen en surprisebadges;
- koraal voor aandacht en blokkades;
- paars voor secundaire categorieën;
- voldoende rustige safe zones voor live UI;
- speels voor kinderen, maar compact en professioneel voor ouders.

Vermijd een donkere diepzeesfeer, drukke aquariumcollages, generieke stockillustraties, overdreven neon, realistische of angstige zeedieren en willekeurig geplaatste decoratie achter tekst.

### Losse Manta

De vriendelijke blauwe Manta is een afzonderlijke transparante productieasset en wordt nooit in het panorama gebakken.

- Rond, vriendelijk gezicht, subtiele glimlach, kindvriendelijke verhoudingen.
- Beide expressieve ogen zijn altijd volledig zichtbaar.
- Gebruik een driekwartaanzicht; geen realistisch zijaanzicht waarbij een oog verdwijnt.
- De Manta zwemt mee met de route, kijkt naar het geselecteerde punt en reageert subtiel op selectie of voltooiing.
- Beweging mag geen layout shift veroorzaken.
- Manta, marker, popover en vaste informatiekaarten mogen elkaar niet afdekken. Gebruik een vaste laagvolgorde: scenery → route → Manta → markers/parels → popover → vaste informatiekaarten.
- Bij `prefers-reduced-motion` stopt idle motion en wordt verplaatsing een korte crossfade.
- Lever transparante bronasset(s), geoptimaliseerde runtimevarianten en checksum-/assetmetadata.

---

## 4. Definitieve shell en gridregels

### Desktop vanaf 1280 px

- Buitenmarge: `22px`.
- Losstaande donker-navy sidebar: `238px` breed, volledige beschikbare hoogte, radius `28px`.
- Ruimte tussen sidebar en hoofdvlak: `18px`.
- Losstaande witte/glazen header: `72px` hoog, radius `23px`.
- Bovenkant sidebar en header lopen exact gelijk.
- Header links: tenantlogo, tenantnaam en productcontext.
- Header rechts: uitsluitend notificaties en profiel.
- Geen losse kindselector in header of sidebar. In het profielmenu staan het actieve kind en exact de actie `Ander kind…`.
- Sidebar: Overzicht, Planning, Ontwikkeling, Inbox en Betalingen. Documenten, Feedback, Gezin/toegang en Profiel vallen onder `Profiel & meer`. Badges, Media en Diploma’s blijven subpagina’s van Ontwikkeling.
- Op het hoofddashboard delen header, Quest-container en drie onderkaarten exact dezelfde linker- en rechterlijn.
- De drie onderkaarten `Openstaande acties`, `Updates` en `Berichten` hebben gelijke breedte en hoogte.
- Onderkant van deze drie kaarten loopt exact gelijk met de onderkant van de sidebar.
- Het volledige hoofddashboard past zonder documentscroll binnen een normale desktopviewport. Op overige pagina’s scrolt alleen het contentvlak.

Gebruik voor inhoudsgrids uitsluitend `100%`, `50/50`, `33/33/33` of `25/25/25/25`. Twee of drie kolommen mogen genest worden, maar maak geen willekeurige 37/63-, 40/60- of ongelijk uitgelijnde kaartverdelingen. Alle kaartlijnen, gaps en baselines sluiten op elkaar aan.

### Tablet

- Vanaf 1024 px mag een compacte icon-sidebar worden gebruikt.
- Onder 1024 px verdwijnt de sidebar en verschijnt de lichte bottomnav.
- Landscape mag de horizontale Quest houden; portrait gebruikt de eigen verticale Quest.
- Kaarten schalen gecontroleerd terug naar één of twee kolommen zonder horizontale documentscroll.

### Mobiel

- Eén normale documentscroll, geen geneste verticale scrollcontainers.
- Floating header circa `70–72px`.
- Lichte witte bottomnav met exact: `Overzicht`, `Planning`, `Ontwikkeling`, `Inbox`, `Meer`.
- `Betalingen` staat uitsluitend onder `Meer` en verschijnt niet als zelfstandig bottomnav-item.
- Respecteer `env(safe-area-inset-bottom)`.
- De eerste dashboardviewport bevat header, de volledige ingezoomde Quest-container en bottomnav.
- `Openstaande acties`, `Updates` en `Berichten` beginnen direct onder de eerste vouw.

---

## 5. Interactieve Journey-engine

Ocean Quest is geen hero-afbeelding, maar de primaire interactieve voortgangsnavigatie.

### Hoofdstukken en eilanden

- Ieder configured badje/niveau is een eiland en vormt een hoofdstukgrens.
- Een actuele etappe gebruikt een panorama zoals `Badje 2 → Badje 3`.
- Na behalen wisselt de actieve wereld naar het volgende hoofdstuk, bijvoorbeeld `Badje 3 → Diploma A`.
- Het echte diploma-eiland verschijnt uitsluitend als bestemming van het laatste hoofdstuk.
- Zonder tussenbadjes bestaat één hoofdstuk van start naar diploma/niveau; de ring naar het volgende badje ontbreekt dan volledig.
- De hoofdstukillustratie bevat alleen wereld en eilanden. Route, markers, parels, bonusparels, Manta, popovers en ringen blijven live datalagen.
- Ondersteun dynamisch 1, 4, 7, 12 of meer curriculumonderdelen zonder lege vaste slots of overlap.

### Volgorde en camerafocus

- Voltooide onderdelen worden chronologisch vastgezet en weergegeven als grote, lichtgevende parels.
- Het eerstvolgende onafgeronde onderdeel met de meeste voortgang staat standaard centraal.
- Bij ontbrekende beoordelingen geldt eerst de expliciete curriculumvolgorde en daarna alfabetische volgorde.
- Overige onafgeronde onderdelen volgen volgens voortgang/curriculumvolgorde.
- Gebruik een stabiele onderdeel-ID als laatste tie-breaker, zodat dezelfde data altijd dezelfde route oplevert.
- Zodra een onderdeel voltooid is, blijft zijn historische positie vaststaan.
- De geselecteerde marker is de camerafocus; selectie centreert deze zonder andere routegegevens te herschikken.

### Desktop Quest

- De binnenwereld is aantoonbaar breder dan het zichtbare masker en staat `108–116%` ingezoomd.
- Twee behaalde parels zijn links zichtbaar, het actuele doel staat centraal en minimaal twee vervolgstappen liggen verder uit elkaar rechts, voor zover de dataset deze bevat.
- De afstand tussen punten moet de reis betekenisvol laten voelen; comprimeer alle stappen niet in één statisch overzicht.
- Ondersteun slepen, horizontaal trackpad, zichtbare vorige/volgende-pijlen en toetsenbordnavigatie.
- Kaap het verticale muiswiel niet.
- Centreer een gekozen punt in `350–500ms`, met reduced-motionfallback.

### Mobiele Quest

- Gebruik een afzonderlijke portrait-wereld; crop of roteer de desktopillustratie niet.
- De route loopt natuurlijk van onder naar boven.
- Toon twee behaalde parels onder het actieve punt, het actieve punt rond `52–54%` van de Quest-hoogte en twee kleinere vervolgstappen met grotere tussenruimte erboven, voor zover beschikbaar.
- De wereld is sterker ingezoomd op het huidige doel.
- Normale paginascroll blijft leidend. Markerselectie en vorige/volgende verplaatsen de camera; vrij pannen mag alleen binnen een expliciete `Verken de route`-modus.

### Markers, parels en deeplinks

- Een onafgerond punt toont bij hover, focus of klik: onderdeelnaam, voortgangsbalk, laatste wijziging en `Bekijk meer`.
- `Bekijk meer` opent `/portaal/ontwikkeling?onderdeel=<id>&kind=<id>` en zet het juiste onderdeeldetail direct open en in beeld.
- Een voltooid onderdeel verandert in een grote oplichtende parel.
- Klik/hover/focus op een voltooide parel toont de bijbehorende verdiende badge-instance met een kleine ronde pijlknop.
- Die pijl opent `/portaal/ontwikkeling/badges?badge=<instance-id>&vier=1` en direct de state `Deel deze mijlpaal!`.
- Hoverfunctionaliteit heeft altijd focus- en click/tap-pariteit.

### Surprisebadges

- Een onverdiende surprisebadge mag visueel nergens bestaan en mag ook niet vooraf in de clientpayload, DOM, serialized state of accessibility tree terechtkomen.
- Na behalen verschijnt deze chronologisch als kleine gouden bonusparel op een korte aftakkende stippellijn.
- Vóór het eerste onderdeel: tussen starteiland en punt 1.
- Tussen twee onderdelen: tussen de twee relevante tijdlijnpunten.
- Na het laatste onderdeel: vóór het doeleiland.
- Meerdere badges op dezelfde positie vormen een compacte parelcluster.
- Surprisebadges tellen nooit mee voor de badje- of diplomavoortgang.

### Voortgangsringen

- Rechtsonder in de desktop Quest staan twee smalle verticale afgeronde kaarten: voortgang naar volgend badje en voortgang naar Diploma A/B/C of het tenantniveau.
- Op mobiel worden deze compact geïntegreerd zonder het actieve punt te bedekken.
- De badjering verdwijnt volledig wanneer het programma geen tussenbadjes gebruikt; laat geen lege kaart of placeholder achter.
- Beide ringen gebruiken dezelfde centrale progress-engine als `/portaal/ontwikkeling`.

### Afgeronde hoofdstukken

- Bewaar ieder voltooid hoofdstuk als onveranderlijke snapshot.
- Snapshot minimaal: theme-ID en -versie, artwork-ID en -versie, curriculumversie, hoofdstukgrenzen, puntenvolgorde, labels, statussen, completion timestamps, parels, bonusparels en gekoppelde verdiende badge-instances.
- Maak de snapshot in één idempotente servertransactie met een unieke idempotency key; retries mogen nooit een dubbel hoofdstuk creëren.
- Latere curriculum-, sorteer-, badge- of artworkwijzigingen mogen een historische reis niet herschrijven.
- Een correctie maakt een geaudite nieuwe revisie/superseding snapshot; wijzig een bestaande snapshot nooit stil.
- Voor legacydata zonder betrouwbare eventtimestamps wordt geen chronologie verzonnen; toon een expliciete state voor onbekende historische volgorde.
- `/portaal/ontwikkeling` toont onder `Mijn Ocean Quest` het actuele hoofdstuk en alle voltooide hoofdstukken. Een hoofdstuk is opnieuw te openen en iedere historische parel blijft deeplinkbaar waar rechten en brondata dit toelaten.

---

## 6. Dashboardinhoud

De Quest is het dominante paneel.

- Linksboven in de Quest: `De zwemreis van {voornaam}!`.
- Daaronder de dynamische volgende les met datum, tijd, locatie, bad/ruimte en baan/resource, exact volgens de copy en typografie uit het definitieve prototype.
- Rechtsonder de twee voortgangsringen volgens de regels hierboven.
- Onder de Quest: `Openstaande acties`, `Updates`, `Berichten`.
- Iedere relevante rij is een echte deeplink naar de juiste route en context.
- Laad-, lege-, fout-, offline-, view-only- en ontbrekende-volgende-lesstates passen in dezelfde geometrie zonder layout shift.

---

## 7. Alle pagina’s volledig meenemen

Maak Ocean Quest voor exact dezelfde dertien canonieke schermen en alle bestaande substates. Gebruik de werkelijke routes uit de repository; behoud minimaal deze contracten:

1. Overzicht — `/portaal`;
2. Planning — `/portaal/planning`;
3. Lesdetail — de bestaande canonieke lesdetailroute, momenteel `/portaal/lessen/[id]`;
4. Ontwikkeling — `/portaal/ontwikkeling`;
5. Badges — `/portaal/ontwikkeling/badges`;
6. Media — `/portaal/ontwikkeling/media`;
7. Diploma’s — `/portaal/ontwikkeling/diplomas`;
8. Inbox — `/portaal/inbox`;
9. Betalingen — `/portaal/betalingen`;
10. Documenten — `/portaal/documenten`;
11. Feedback — `/portaal/feedback`;
12. Gezin en toegang — `/portaal/kinderen`;
13. Profiel — `/portaal/profiel`.

Behoud tevens de publieke pagina `/diploma-verificatie/[code]` en de bestaande compatibiliteitsroutes:

- `/portaal/lessen` → `/portaal/planning`;
- `/portaal/voortgang` → `/portaal/ontwikkeling`;
- `/portaal/badges` → `/portaal/ontwikkeling/badges`;
- `/portaal/media` → `/portaal/ontwikkeling/media`;
- `/portaal/diplomas` → `/portaal/ontwikkeling/diplomas`;
- `/portaal/berichten` → `/portaal/inbox`;
- `/portaal/afzwemmen` → `/portaal/planning#afzwemmen`.

### Verplichte functionele dekking

- **Planning:** vaste tabs Lessen, Inhalen, Afzwemmen en Vakantieaanbod; aankomende lessen, lesdetail, afmelden met effect op inhaalcredit, credits en passende inhaalmomenten, afzwemuitnodiging/reactie/uitslag, vakantie-/turboaanbod, capaciteit en betaalwijze.
- **Ontwikkeling:** actuele interactieve reis, programma, badje/niveau, onderdelen, 1–5 positieve sterren/smileys, `Nog niet beoordeeld`, carryover, historie, docentnotitie, voortgangsringen, badgewall-preview en `Mijn Ocean Quest`.
- **Badges:** categorieën, filters, verdiend, locked standaardbadge, verdiende surprisebadge, detail, viermoment en delen. Alleen artwork-placeholders; onverdiende surprisebadges ontbreken volledig.
- **Media:** besloten media, publicatie/vervaldatum, veilige weergave/download en toestemming per kind/policyversie.
- **Diploma’s:** private kluis, metadata, beveiligde download en optionele minimale publieke verificatie zonder toegang tot het diploma.
- **Inbox:** Gesprekken, Mededelingen en Meldingen; zoeken, status, thread, antwoorden, gelezenstatus en nieuw gesprek. Bijlagen blijven uit zolang de huidige productcanon ze niet ondersteunt. Gebruik geen grote `Nieuw bericht`-CTA; gebruik de kleine ronde `+`- en gelezen/lijstactie uit de definitieve UI.
- **Betalingen:** alle reeds aanwezige abonnement-, factuur-, creditnota-, btw-, Mollie-, SEPA-, incasso-, refund-, stornerings- en eventstates; mobiel uitsluitend bereikbaar via Meer.
- **Documenten, Feedback, Gezin/toegang en Profiel:** volledige bestaande functies, toestemmingen en states. Kind wisselen gebeurt via profiel → `Ander kind…` en behoudt waar logisch route, query en hash.
- **Extra repositoryfuncties:** inventariseer alle extra knoppen, tabs, filters, empty states, dialogs en error states en geef ze dezelfde Ocean Quest-vormtaal. Niets stilzwijgend overslaan.

Planning, Inbox, Betalingen en beheergerichte pagina’s blijven rustig en taakgericht. Gebruik daar subtiele Ocean Quest-materialen; plaats niet op ieder scherm een grote onderwaterwereld. Overzicht, Ontwikkeling, Badges en hoofdstukarchief dragen de rijkste thematische ervaring.

---

## 8. Badges in deze sprint

Neem de volledige badge-UX mee, maar nog geen definitieve badgecollectie of badge-art.

- Gebruik één expliciete, neutrale `BadgeArtworkPlaceholder` met stabiele aspectratio en vervangbaar `imageUrl`/asset-slot.
- Leg in manifest en componentcontract expliciet `badgeArtworkReady: false` en `placeholderOnly: true` vast.
- Verdiende en locked standaardbadges hebben een volwaardige kaart, status, naam en interactie; het placeholder-artwork mag de layout niet veranderen wanneer later echte art wordt geplaatst.
- Locked standaardbadge: artwork circa 30% opacity, maar naam, slot en status volledig leesbaar.
- Verdiende surprisebadge: alleen na unlock zichtbaar en als instance afzonderlijk deelbaar.
- Onverdiende surprisebadge: geen kaart, geen lege gridpositie, geen tellerlek en geen clientdata.
- Square/story share-assets, native share en downloadfallback worden als functionele slots behouden; gebruik placeholder-art tot de echte badges volgen.

---

## 9. Data, security en rechten

- Behoud tenantisolatie, auth, RLS, auditgedrag en server-side permissionchecks.
- Muterende acties worden voor `view_only` verborgen en opnieuw op de server geweigerd.
- Beveilig diploma-, factuur-, media- en documentdownloads afzonderlijk.
- De globale kindcontext gebruikt `?kind=<participant-id>` waar ondersteund; valideer altijd dat de gebruiker toegang tot dit kind heeft.
- Surprisebadgebeveiliging is servergedreven: filter onverdiende surprisebadges vóór serialisatie.
- Voer migrations alleen uit wanneer de actuele schema-audit aantoont dat snapshot- of theme-metadata ontbreekt. Migrations zijn idempotent, tenant-safe en voorzien van rollback/compatibiliteitsnotitie.
- Breek geen bestaande geselecteerde thema’s, opgeslagen voorkeuren of API/native contracten.
- Vertrouw de actieve themeconfiguratie nooit uit een onbeveiligde queryparameter.
- Datums en tijden gebruiken de tenanttimezone en Nederlandse localeweergave; sortering gebruikt servertimestamps en niet de clientklok.

---

## 10. Assets en overdrachtspakket

Integreer de bestaande goedgekeurde Ocean Quest-art; regenereer deze niet wanneer de definitieve bron aanwezig is.

De theme pack bevat minimaal:

- `manifest` met ID, versie, capabilities en assetrollen;
- semantic tokens voor light/dark/auto volgens de bestaande engine;
- component-/pagina-recipes;
- aparte landscape- en portrait-scenerylayers;
- transparante Manta-assets en runtimeformaten;
- assetmanifest met rol, dimensies, alfakanaal, bronbestand en SHA-256;
- exacte artworkprompts en negative prompts voor toekomstige consistente uitbreidingen;
- HTML/CSS/JS-referentiecode en fixtures;
- route-/contentmapping;
- copy-snapshot;
- responsive screenshots, boards en QA-rapport.

Behoud bronart op hoge resolutie, maar serveer in productie passende responsive AVIF/WebP-varianten. Voorkom dat 8K-bronbestanden standaard op mobiele apparaten worden geladen. Artwork mag geen UI of tekst bevatten.

Lever na implementatie:

1. een bijgewerkt volledig pakket `NXTTRACK_Theme_Packs_Codex_Ready_v1.1.0.zip` met alle zeven thema’s;
2. een afzonderlijk controleerbaar `NXTTRACK_Ocean_Quest_Addon_v1.0.0.zip` met alleen de nieuwe/gewijzigde Ocean Quest-bestanden en integratienotities;
3. bijgewerkte README, masterprompt, canon, theme matrix, manifests, checksums en changelog;
4. production-ready repositorycode, niet alleen een prototype.

Verwijder geen oude gebruikersbestanden en neem geen `node_modules`, caches, tijdelijke renderbestanden of secrets op in de archieven.

---

## 11. Toegankelijkheid, performance en interactiekwaliteit

- Journeyroute is semantisch een geordende lijst; het visuele SVG-/canvaspad is decoratief.
- Markerknoppen noemen onderdeel, percentage, status en laatste update; het actieve punt heeft `aria-current="step"`.
- Alle acties zijn met toetsenbord en touch bereikbaar; touch-targets minimaal `48×48px`.
- Escape sluit popovers en focus keert terug naar de oorspronkelijke marker.
- Kleur is nooit de enige statusdrager; glasvlakken en tekst voldoen minimaal aan WCAG AA.
- Browserzoom en pinch-zoom blijven toegestaan.
- Geen layout shift bij beeldladen, camera-animation of Manta-beweging.
- Gebruik responsive images, lazy loading buiten de eerste viewport en preload uitsluitend voor de actuele dashboardscene.
- Respecteer reduced motion, databesparing en trage verbindingen met een stabiele functionele fallback.

---

## 12. Verplichte QA en visuele regressie

Gebruik de bestaande QA-matrix van het zes-themapakket en voeg Ocean Quest daaraan toe.

Leg vóór de eerste wijziging een reproduceerbare baseline vast van theme-ID’s, route-inventaris, tokenschema, assetchecksums, screenshots van de zes bestaande thema’s, accessibility-resultaten en de relevante build/bundlemetingen. Gebruik voor voor- en nameting dezelfde browserbuild, lokale fonts, DPR, fixturetijd, fixturedata en viewports.

Minimaal vereist:

- 13 canonieke schermen × desktop en mobiel = 26 Ocean Quest-routerenders;
- dashboard-high-res desktop en mobiel;
- publieke diplomaverificatie desktop en mobiel;
- twee complete Ocean Quest-paginaboards;
- totaal dus 30 nieuwe gevalideerde Ocean Quest-renders en, bij de bestaande matrix van 180, 210 renders voor het volledige zeven-themapakket;
- uitbreiding van 78 naar minimaal 91 responsive viewportcases wanneer dezelfde 13 cases per thema worden gebruikt;
- structurele vergelijking van afmetingen, gaps, baselines, kaartlijnen, copy en states met het definitieve HTML/CSS-prototype;
- visuele vergelijking met de definitieve desktop- en mobiele Ocean Quest-boards;
- contracttests voor één actieve journey-step, dynamische aantallen, chronologische parels, surprisebadge-insertie, geen locked-surprisedata, deeplinks, `view_only`, kindcontext en snapshots;
- regressietests die aantonen dat alle zes bestaande thema’s visueel en functioneel ongewijzigd blijven;
- geen horizontale documentscroll op ondersteunde viewports;
- desktopdashboard binnen viewport en exact uitgelijnd;
- mobiel header + volledige Quest + lichte bottomnav binnen eerste viewport;
- geen ontbrekende asset, kapotte route, console-error, hydration warning of a11y blocker.

Gebruik voor ieder thema exact deze dertien dashboardviewports:

| Klasse | Viewports |
| --- | --- |
| Desktop | `2560×1440`, `1920×1080`, `1600×900`, `1440×900`, `1366×768`, `1280×720` |
| Tablet | `1180×820`, `1024×768`, `820×1180` |
| Mobiel | `430×932`, `390×844`, `360×800`, `320×568` |

Test alle dertien canonieke pagina’s daarnaast minimaal op `1440×900` en `390×844`. Neem fixtures op voor nul beoordelingen, nul onderdelen, één onderdeel, vier onderdelen, twaalf onderdelen, volledig afgerond hoofdstuk, meerdere badjes, geen badjes, twee gekoppelde kinderen, `view_only`, ontbrekende volgende les/asset/preview en surprisebadges vóór, tussen en na onderdelen.

Voor de bestaande zes thema’s is de intentionele visuele delta exact nul. Een afbeeldingsdiff tot maximaal `0,05%` is alleen toegestaan voor aantoonbare anti-aliasing en vereist handmatige overlaycontrole; iedere geometrische, tekstuele of kleurafwijking faalt. Bij vaste sidebar-, header- en gridbaselines blokkeert een afwijking groter dan `2px` de oplevering. Vernieuw nooit automatisch een golden baseline om een mislukte test groen te maken.

Test minimaal op Chromium, WebKit en Firefox voor de ondersteunde kernflows. Gebruik de bestaande projectcommands voor lint, typecheck, unit-, integratie-, RLS-/security-, route-, e2e- en buildtests. Los fouten op; rapporteer ze niet als “bekend probleem” wanneer ze binnen deze scope vallen.

Voeg waar de projectinfrastructuur dit ondersteunt ook performancegates toe: geen 8K-bestand als LCP-resource, geen onverwachte layout shift, LCP maximaal `2,5s`, INP maximaal `200ms`, CLS maximaal `0,1` en Lighthouse Performance minimaal `90` op de vaste dashboardfixture. Regressie ten opzichte van de baseline moet worden verklaard en opgelost.

---

## 13. Verboden vereenvoudigingen

Beschouw de taak als niet voltooid wanneer één van deze fouten voorkomt:

- Ocean Quest is slechts een aqua kleurvariant van een ander thema;
- de Quest is één statische achtergrond zonder echte markers en data-interactie;
- Manta, markers, tekst of ringen zijn in de achtergrond gebakken;
- mobiel gebruikt een crop of rotatie van desktopart;
- alle punten zijn tegelijk samengeperst en het huidige doel is niet de duidelijke focus;
- afgeronde hoofdstukken worden opnieuw berekend in plaats van als snapshot bewaard;
- onverdiende surprisebadges lekken naar de client;
- Betalingen staat opnieuw in de mobiele bottomnav;
- een losse kindselector keert terug in de header;
- alleen het dashboard is gethematiseerd en overige pagina’s blijven generiek of incompleet;
- functies uit de actuele repository verdwijnen omdat ze niet op de visuals stonden;
- badge-placeholders worden vervangen door zelfbedachte definitieve badges;
- bestaande zes thema’s worden visueel gewijzigd;
- visuele gelijkenis wordt alleen op gevoel beoordeeld zonder renders en regressiecontrole.

---

## 14. Definition of Done en eindrapport

De sprint is pas gereed wanneer:

1. Ocean Quest als zevende thema in platformbeheer en tenantselectie beschikbaar is;
2. alle dertien schermen, publieke verificatie en alle bestaande substates volledig werken;
3. desktop en mobiel exact de definitieve shell-, grid-, viewport- en Questlogica volgen;
4. Manta, scenes en UI als afzonderlijke dynamische lagen functioneren;
5. hoofdstukken, snapshots, parels en surprisebadges correct en veilig werken;
6. badges volledig ontworpen maar uitsluitend met placeholders zijn uitgevoerd;
7. alle relevante tests, renders en regressiechecks groen zijn;
8. de zes bestaande thema’s ongewijzigd functioneren;
9. het volledige zeven-themapakket en het losse add-onpakket zijn opgebouwd en gevalideerd;
10. documentatie, manifests, checksums en changelog overeenkomen met de werkelijk geleverde bestanden.

Geef aan het einde één geconsolideerd eindrapport, per hoofdonderdeel met:

- wat exact is gebouwd;
- welke bestanden/migrations zijn gewijzigd;
- welke kleine ontwerp- of implementatiebesluiten autonoom zijn genomen en waarom;
- testcommando’s en resultaten;
- render- en viewportaantallen;
- asset- en checksumcontrole;
- bevestiging dat de zes bestaande thema’s niet zijn gewijzigd;
- eventuele echte blockers of resterende risico’s.

Geef geen algemene claim als “pixel-perfect” zonder de bijbehorende meetbare QA-uitvoer en verwijzingen naar de definitieve renders.
