# NXTTRACK — Codex Cloud implementatiesprint parent- en kinderportaal v1.0

**Datum:** 11 augustus 2026  
**Doelbranch:** `staging`  
**Uitvoering:** Codex Cloud, bij voorkeur als follow-up in dezelfde cloudchat waarin de Ocean Quest-bronnen zijn gevalideerd en uitgepakt

Geef deze volledige opdracht ongewijzigd aan Codex Cloud.

---

## 0. Uitvoeringstoestemming en vervanging van eerdere opdrachten

Deze opdracht geeft nu expliciet toestemming voor de daadwerkelijke implementatiesprint in de gekoppelde NXTTRACK-repository.

Zij vervangt voor **scope, parent/child-verdeling, routes, capabilities, UX, QA en Cloud-oplevering** de conflicterende delen van:

- `OPVOLGTAAK_CODEX_OCEAN_QUEST_7E_THEME.md`;
- de tijdelijke controlemodus uit `CODEX_CLOUD_OCEAN_QUEST_BRONNENADDENDUM.md`;
- oudere taken/canons die alle dertien portaalpagina's als één volledig gethematiseerde ouderervaring behandelen.

Vanaf deze opdracht mag Codex:

- productiecode wijzigen;
- uitsluitend noodzakelijke, data- en schema-nondestructieve migrations toevoegen;
- tests, renders en documentatie maken;
- de gevalideerde bronmap volgens de regels hieronder versioneren;
- logisch afgebakende commits maken;
- een featurebranch pushen;
- een **draft pull request naar `staging`** openen.

Codex mag niet:

- mergen;
- rechtstreeks naar staging of productie deployen;
- een remote staging- of productiedatabase migreren;
- via SSH, Tailscale of een andere route met de dev-/productie-VPS verbinden;
- productiegegevens of productiesecrets gebruiken;
- de zes bestaande thema-assets stil vervangen of opnieuw genereren.

Het bronnenaddendum blijft volledig gezaghebbend voor archiefgrootte, SHA-256, uitpakpad en bestandsmapping. Alleen het tijdelijke implementatieverbod uit dat addendum vervalt door deze opdracht.

---

## 1. Einddoel

Bouw in de bestaande NXTTRACK-applicatie één gedeelde technische kern met twee aantoonbaar gescheiden portaalervaringen:

1. **Ouderportaal — de ouder regelt en begrijpt.**
2. **Kinderportaal — het kind beleeft, ontdekt en viert echte voortgang.**

Het kinderportaal wordt functioneel veiliger en eenvoudiger, maar **niet kinderachtiger, goedkoper of visueel vlakker**. Gebruik dezelfde premium afwerking, typografie, materialen, diepte en interactieve journey-kwaliteit als de definitieve Ocean Quest-bronnen. Vermijd babytaal, cartoonfonts, willekeurige stickers, dagelijkse streaks, ranglijsten en kunstmatige schermtijdprikkels.

Behoud:

- één Next.js-app;
- één Supabase-project;
- één tenant-, curriculum-, planning-, badge- en voortgangsdomein;
- één typed theme registry;
- één journey-engine en één centrale voortgangsberekening;
- alle bestaande ouderfuncties, rechten en compatibilityroutes.

Scheid:

- routegroepen;
- shells en navigatie;
- server-loaders en DTO's;
- capabilities en commands;
- clientpayloads;
- cachepartities;
- session-/RLS-/Storage-/Realtime-autorisatie.

De zeven thema's zijn:

1. NXTTRACK Default;
2. Dolphin Bay;
3. Turtle Trails;
4. Polar Splash;
5. Coastal Explorer;
6. Nationaal Zwem ABC;
7. Ocean Quest.

Behoud de bestaande manifest-ID's van de eerste zes thema's. De canonieke Ocean Quest-ID is `ocean-quest`; maak geen `ocean-quest-child`, alias of tweede domeinthema. Parent en child gebruiken verschillende presentation recipes binnen hetzelfde thema.

Badgepagina's, states en interacties horen volledig bij deze sprint. Definitieve badgecollecties en badge-artworks horen **niet** bij deze sprint; gebruik uitsluitend de voorgeschreven placeholders.

---

## 2. Codex Cloud-werkwijze

### 2.1 Startconditie

Werk bij voorkeur verder in dezelfde Codex Cloud-chat waarin de bronnen al zijn gevalideerd. Start vanaf de actuele `staging`-branch en maak een featurebranch volgens de repositoryconventie, bij voorkeur:

`codex/parent-child-portals-v1`

Controleer vóór de eerste wijziging:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

De eerder gemelde verwachte afwijking is uitsluitend de untracked bronmap:

`docs/codex-input/ocean-quest-v1.0.0/`

Preserveer iedere andere bestaande gebruikerswijziging. Als er onverwachte wijzigingen overlappen met deze sprint, wijzig of verwijder die niet stilzwijgend; rapporteer het exacte pad als blocker.

### 2.2 Bronnen versioneren

Versioneer de gevalideerde uitgepakte bronmap bij voorkeur in een afzonderlijke commit, zodat de visuele regressie reproduceerbaar blijft. Neem het oorspronkelijke ZIP-archief niet ook op.

Voor het stagen:

- controleer repository- en `.gitattributes`-/Git LFS-beleid;
- controleer de individuele bestandsgroottes;
- comprimeer, schaal of herencodeer geen gezaghebbende bronrender;
- zorg dat `docs/codex-input/**` niet in de productiebundle terechtkomt;
- gebruik een reeds geconfigureerde Git LFS-flow wanneer die bestaat;
- volg het bestaande repositorybeleid voor grote designbronnen.

Wanneer repositorybeleid het versioneren van de volledige bronmap niet toestaat, behoud de map read-only als Cloudinput, commit het inventaris-/checksummanifest en uitsluitend de noodzakelijke productie-assets, en rapporteer dit in de PR. Stop alleen wanneer de bronnen tijdens de uitvoering niet betrouwbaar beschikbaar blijven.

### 2.3 Cloudgrenzen

Gebruik de in de repository vastgelegde setup-, lint-, typecheck-, test-, render- en buildcommands. Codex Cloud checkt de gekozen branch uit in een geïsoleerde omgeving; houd de uitvoering daarom reproduceerbaar en repository-gebonden.

Gebruik geen VPS-secrets. Voer migrations alleen uit tegen een lokale/ephemere testdatabase of de daarvoor bedoelde CI-omgeving. Open na volledige implementatie een draft PR naar `staging`; merge en deploy niet.

---

## 3. Gezaghebbende bronnen en prioriteit

Lees vóór de eerste productiewijziging volledig:

1. alle repository-instructies, `AGENTS.md`, package scripts, architectuurdocumentatie en CI-workflows;
2. de actuele auth-, tenant-, family-link-, RLS-, Storage-, Realtime-, route-, server-action- en permissionimplementatie;
3. de actuele theme registry, manifests, releases, recipes, tokens, assets en platform-adminflows;
4. het bestaande zes-themapakket en de daadwerkelijk geïntegreerde zes-theme-baseline;
5. `CODEX_CLOUD_OCEAN_QUEST_BRONNENADDENDUM.md`;
6. `docs/codex-input/ocean-quest-v1.0.0/portal-final/DESIGN_CANON.md`;
7. `docs/codex-input/ocean-quest-v1.0.0/portal-final/index.html`;
8. beide finale Ocean Quest-dashboardrenders;
9. beide complete boards en alle 26 routerenders;
10. scenery-, hoofdstuk- en Manta-assets plus render-scripts.

Neem de reeds uitgevoerde bronvalidatie als geldige startbasis over:

- oorspronkelijke archiefgrootte: `85.900.138 bytes`;
- oorspronkelijke SHA-256: `8d5b647dabc54c5a72ba279914307a31466cf1666d46933251eca36fee8ea579`.

Het oorspronkelijke ZIP-archief hoeft niet opnieuw in de featurebranch te staan en het ontbreken daarvan is na deze gevalideerde uitpakstap geen blocker. Verifieer vóór implementatie wel opnieuw de uitgepakte inventaris: 13 desktop- en 13 mobiele schermen, technisch geldige PNG's, afzonderlijke desktop-/mobielscènes, transparante Manta en syntactisch geldige renderscripts. Leg een reproduceerbaar manifest met checksums van de daadwerkelijk gebruikte uitgepakte bronnen vast.

### 3.1 Prioriteitsvolgorde bij conflicten

1. Deze opdracht voor productgrens, routes, capabilities, security, UX-splitsing, QA en oplevering.
2. De actuele repository voor werkelijke datamodellen, bestaande functies en integratiepunten.
3. Het bronnenaddendum voor integriteit, mapping en `historical-only`-classificatie.
4. De finale Ocean Quest-canon en het prototype voor materialen, componenttaal, shellmaten en journeygeometrie.
5. De finale dashboardrenders en boards voor visuele vergelijking.
6. Oudere theme-engine- en Ocean Quest-taken uitsluitend als historische context.

### 3.2 Nieuwe interpretatie van de Ocean Quest-bronnen

De huidige bronmap heet nog `ouderportaal`. Dat label is niet langer functioneel gezaghebbend.

De bronnen blijven exact gezaghebbend voor:

- Ocean Quest-art-direction en premium kwaliteitsniveau;
- scenery, Manta, route, markers, parels, bonusparels en ringen als losse lagen;
- materialen, radii, schaduwen, typografie en motion;
- journey-interactie en responsive focus;
- functionele coverage van de dertien bestaande ouderpagina's.

De bronnen zijn niet gezaghebbend voor:

- welke capability bij parent of child hoort;
- het hergebruiken van parent-DTO's in child;
- het tonen van Inbox, Betalingen, Documenten, Feedback of Gezin in child;
- het letterlijk kopiëren van fixtures zoals namen, locaties, bedragen en data;
- het behandelen van `?screen=` uit het prototype als productroute.

Pixelregressie geldt voor behouden journeycomponenten en bestaande oudercomponenten. De nieuwe child-shell wordt getoetst aan de meetbare geometrie in deze opdracht; vergelijk hem niet ten onrechte pixel-voor-pixel met een oude ouderpagina.

Voor thema's 1–6 is de actuele repositorybaseline gezaghebbend en geldt buiten de expliciet goedgekeurde dashboard-, child-entry-, security-, accessibility- en overflowcorrecties een intentionele zichtbare delta van nul. Ocean Quest heeft nog geen geïntegreerde repositorygoldens: bouw de twaalf parentroutes buiten Overzicht tegen de overeenkomstige finale Ocean Quest-routerenders en boards, met behoud van alle parentfuncties. Voor die twaalf Ocean Quest-parentroutes zijn de finale renders gezaghebbend, behalve voor de expliciet voorgeschreven equal-track-/gapcorrecties uit paragraaf 12 en mascotteplaatsingscorrecties uit paragraaf 15. Dit zijn goedgekeurde, gemaskeerde visuele deltas; de `2px`-diffgate geldt uitsluitend buiten deze allowlisted regio's. De oude Ocean Quest-overview is art- en journeyreferentie voor Child Vandaag; hij is niet de baseline voor de nieuwe parentdashboardcompositie.

---

## 4. Fase 0 — verplichte repository- en baseline-audit

Maak vóór implementatie een repository-gebonden nulmeting en leg die vast in bijvoorbeeld:

`docs/implementation/parent-child-portals-baseline.md`

Inventariseer minimaal:

- echte routeboom en compatibilityredirects;
- huidige vijf primaire ouderbestemmingen;
- parent `?kind=<participant-id>`-context en servervalidatie;
- authmethode, Supabase-clientgebruik en JWT-opslag;
- browserdirecte Data API-, GraphQL-, Realtime- en Storage-toegang;
- alle parent-sensitive tabellen, views, RPC's, route handlers en server actions;
- bestaande tenant-/guardian-/participantrelaties;
- bestaande `view_only`-logica;
- huidige featureflag- en rolloutarchitectuur;
- theme manifests, releaseversies en assetchecksums;
- bestaande journey-, snapshot-, badge- en surprisebadgestructuur;
- PWA/service-worker- en querycachegedrag;
- alle productie- en compatibilityfuncties die niet op de visuals staan;
- bestaande build-, lint-, typecheck-, unit-, integration-, SQL/RLS-, E2E-, visual- en accessibilitytests.

Leg vóór wijzigingen vast:

- commit-SHA;
- theme-ID's en release-ID's;
- route-inventaris;
- assetchecksums van de zes bestaande thema's;
- screenshots van alle bestaande parentroutes op `1440×900` en `390×844`;
- build-, bundle-, accessibility- en testbaseline;
- reeds bestaande fouten, afzonderlijk van sprintregressies.

Blokkeer alleen bij:

- ontbrekende werkelijk gezaghebbende bron;
- een afwijkende uitgepakte Ocean Quest-bron ten opzichte van het vastgelegde gevalideerde manifest;
- risico op dataverlies of destructieve migration;
- een onverwachte overlappende dirty-worktreewijziging;
- een repositorylimiet die de bronmap zonder bestaande veilige flow niet kan versioneren én waardoor de bronnen tijdens de uitvoering niet betrouwbaar beschikbaar blijven;
- ontbrekende bevoegdheid.

Ontwerp ontbrekende assets, badges of securitygedrag nooit naar eigen smaak om een blocker te omzeilen.

---

## 5. Harde architectuurkeuze

Gebruik één applicatie en één domeinmodel, maar twee presentatielagen:

```text
Shared domain, data and theme engine
├── ParentPortalShell
│   ├── parent routes
│   ├── parent loaders/DTOs
│   ├── parent commands
│   └── parent capabilities
└── ChildPortalShell
    ├── child routes
    ├── allowlisted child-safe loaders/DTOs
    ├── maximaal enkele gestructureerde child commands
    └── child capabilities
```

Deel waar passend:

- toegankelijke primitives;
- semantic tokens;
- theme provider/registry;
- journey-engine;
- curriculum- en voortgangsdomein;
- route-onafhankelijke datatypes;
- artworkcomponenten.

Deel niet:

- één generieke DTO met verborgen parentvelden;
- dezelfde commandset;
- dezelfde navigation tree;
- client-side capabilityfilters als autorisatie;
- een parent-query die daarna in React tot child wordt teruggesnoeid.

Conceptueel contract:

```ts
type PortalMode = 'parent' | 'child'

type PortalPrincipal =
  | { kind: 'guardian'; mode: 'parent' }
  | { kind: 'guardian'; mode: 'child'; childId: string }
  | { kind: 'child_direct'; childId: string } // in v1 altijd disabled

type PortalContext = {
  authUserId: string
  authSessionId: string
  tenantId: string
  mode: PortalMode
  boundChildId: string | null
  contextVersion: number
}
```

Implementeer één centrale resolver en default-deny authorizer, aangepast aan de repository:

```ts
resolvePortalContext(request): Promise<PortalContext>
authorizePortalCapability(context, capability, resource): void
```

Resolve de context opnieuw in iedere relevante Server Component-loader, Server Action, Route Handler, RPC/Storage-flow en niet uitsluitend in middleware.

Een actieve childcontext vergrendelt de **volledige geauthenticeerde Supabase-sessie**, niet alleen `/portaal`. Dezelfde gebruiker kan ook trainer-, medewerker-, tenant-admin- of platformrechten hebben. Tijdens child mode worden daarom alle niet-child routes, API's, RPC's, tabellen, Storage-objecten en Realtimekanalen voor die sessie geweigerd. Een oplossing die parentportaldata blokkeert maar `/admin`, backoffice, staff- of platformdata bereikbaar laat, faalt.

---

## 6. Product- en capabilitygrens

| Onderdeel | Parent | Child |
|---|---|---|
| Overzicht | volledige taakgerichte gezinscontext | alleen vandaag, huidig doel, volgende activiteit, compliment en laatste mijlpaal |
| Planning | bekijken, afmelden, inhalen, aanbod, afzwemreactie | uitsluitend read-only agenda en kindveilige lesdetails |
| Ontwikkeling | volledige analyse, historie en ouder-/docentcontext | veilige reis, eenvoudige voortgang en expliciet gepubliceerde trainerstip |
| Badges | bekijken, vieren en delen wanneer toegestaan | bekijken en in-app vieren; nooit extern delen |
| Media | private galerij, originelen/download en toestemming volgens policy | alleen expliciet goedgekeurde child-renditions; geen downloadactie of consentbeheer |
| Diploma's | private kluis, serienummer en beveiligde download | alleen titel/niveau/datum en visuele prijzenkast; geen privédocument of serienummer |
| Inbox | gesprekken, mededelingen, meldingen en antwoorden | geen inbox, vrije chat of oudergesprekken |
| Betalingen | volledige bestaande betaalfunctionaliteit | volledig afwezig |
| Documenten | veilige ouderdownloads | volledig afwezig |
| Feedback | campagnes en reacties | volledig afwezig |
| Gezin/toegang | kinderen, relaties en toegangsniveaus | volledig afwezig; altijd exact één gebonden kind |
| Profiel | contact-, communicatie- en beveiligingsvoorkeuren | voornaam, goedgekeurde avatar, thema- en accessibilityvoorkeuren |

### 6.1 Toegestane childcapabilities

Gebruik repository-passende namen, maar houd deze allowlist inhoudelijk exact:

- `today.read`;
- `journey.read_child_safe`;
- `badges.read_child_safe`;
- `schedule.read_child_safe`;
- `achievements.read_child_safe`;
- `approved_media.read_child_safe`;
- `child_preferences.write_safe`;
- `parent_request.create_safe` voor de strikt gestructureerde actie `Vraag mijn ouder`.

De effectieve childcapabilities zijn altijd de doorsnede van:

1. deze childallowlist;
2. de bestaande guardian-child-link en het huidige toegangsniveau;
3. tenantpolicy en rolloutflags.

Child mode geeft nooit meer rechten dan de guardian vóór de modeswitch had. Bij `view_only` blijven ook `child_preferences.write_safe` en `parent_request.create_safe` uit, tenzij de bestaande permissioncanon die mutaties expliciet toestaat.

### 6.2 Verboden childcapabilities

Child mode mag nooit:

- een les annuleren, wijzigen of omboeken;
- een inhaalmoment of aanbod reserveren;
- op een afzwemuitnodiging reageren;
- betalen, facturen of betaalgegevens bekijken;
- ouderdocumenten of privédiploma's openen;
- vrije chat, Inbox of formele feedback gebruiken;
- contact-, gezins-, medische, toestemmings- of beveiligingsgegevens zien;
- interne rubrics, ruwe beoordelingen, auditregels of trainernotities zien;
- tenant of broer/zus wisselen;
- media, diploma's of badges extern delen;
- generieke CRUD-endpoints gebruiken;
- uploaden of een openbare profieltekst plaatsen.

Een child-visible compliment of trainerstip is een afzonderlijk gecureerd veld/projectie, bijvoorbeeld `child_visible = true`; het is nooit een ouderinbox- of interne docentnotitie die alleen client-side wordt gefilterd.

### 6.3 `Vraag mijn ouder`

Implementeer geen vrije tekst. Ondersteun uitsluitend vooraf gedefinieerde resourcegebonden verzoektypen, minimaal:

- hulp nodig bij een lesmoment;
- interesse in een gepubliceerde activiteit;
- ouderportaal laten openen.

De actie:

- voert nooit de onderliggende ouderhandeling uit;
- maakt alleen een oudertaak/melding via de bestaande infrastructuur;
- valideert tenant, child, resource en actuele publicatiestatus;
- is idempotent per type/resource;
- is server-side rate-limited;
- lekt geen ouderdata terug naar child.

---

## 7. Canonieke routes

### 7.1 Ouderportaal — bestaande routes blijven behouden

1. Overzicht — `/portaal`;
2. Planning — `/portaal/planning`;
3. Lesdetail — `/portaal/lessen/[id]`;
4. Ontwikkeling — `/portaal/ontwikkeling`;
5. Badges — `/portaal/ontwikkeling/badges`;
6. Media — `/portaal/ontwikkeling/media`;
7. Diploma's — `/portaal/ontwikkeling/diplomas`;
8. Inbox — `/portaal/inbox`;
9. Betalingen — `/portaal/betalingen`;
10. Documenten — `/portaal/documenten`;
11. Feedback — `/portaal/feedback`;
12. Gezin en toegang — `/portaal/kinderen`;
13. Profiel — `/portaal/profiel`.

Behoud tevens:

- `/portaal/lessen` → `/portaal/planning`;
- `/portaal/voortgang` → `/portaal/ontwikkeling`;
- `/portaal/badges` → `/portaal/ontwikkeling/badges`;
- `/portaal/media` → `/portaal/ontwikkeling/media`;
- `/portaal/diplomas` → `/portaal/ontwikkeling/diplomas`;
- `/portaal/berichten` → `/portaal/inbox`;
- `/portaal/afzwemmen` → `/portaal/planning#afzwemmen`;
- `/diploma-verificatie/[code]` als minimale publieke verificatie zonder toegang tot het private bestand.

Parent behoudt de gevalideerde `?kind=<participant-id>`-context waar de huidige architectuur die gebruikt. Iedere querywaarde wordt server-side tegen de actuele family link gecontroleerd.

### 7.2 Kinderportaal — nieuwe canonieke namespace

Gebruik exact:

| Pagina | Route | Scope |
|---|---|---|
| Vandaag | `/kind` | dominante interactieve reis en vandaagkaartjes |
| Mijn reis | `/kind/reis` | huidige etappe, doelen en afgeronde hoofdstukken |
| Doeldetail | `/kind/reis?onderdeel=<id>` | kindveilige uitleg, voortgang, tip en goedgekeurde video |
| Badges | `/kind/badges` | badgewall, detail en in-app viermoment |
| Agenda | `/kind/agenda` | read-only lessen, activiteiten en mogelijke toets-/afzwemmomenten |
| Lesdetail | `/kind/agenda/lessen/[id]` | read-only tijd, locatie, trainer en benodigdheden |
| Ik | `/kind/ik` | prijzenkast, goedgekeurde momenten en instellingen |

Gebruik op `/kind/ik` substates/tabs `prijzenkast`, `momenten` en `instellingen`; voeg die niet als primaire routes toe.

Childroutes gebruiken geen vrije `?kind=`-selector. De servercontext is aan exact één participant gebonden. Een afwijkende of toegevoegde child-ID wordt genegeerd en geweigerd, nooit gebruikt om siblingdata op te halen.

Role-specifieke deeplinks:

- child doeldetail: `/kind/reis?onderdeel=<id>`;
- child badgeviering: `/kind/badges?badge=<instance-id>&vier=1`;
- parentdeeplinks blijven onder `/portaal/ontwikkeling...`.

Valideer iedere onderdeel- en badge-instance-ID server-side tegen tenant, bound child, curriculum, toegankelijkheid en earnedstatus. Child badgeviering bevat geen share- of downloadactie.

Alle parent- en childroutes zijn private/noindex. De publieke verificatie blijft minimaal en krijgt eveneens `noindex`.

---

## 8. Child mode openen, vergrendelen en verlaten

### 8.1 Openen vanuit parent

Voeg bij een toegankelijk actief kind in het ouderprofiel/contextmenu de actie `Open kinderportaal` toe.

Flow:

1. Parent kiest exact één kind.
2. Server valideert authuser, tenantmembership, actuele guardian-child-link en toegangsniveau.
3. Server activeert transactioneel een session-ID-gebonden portalcontext met `mode = child` en `bound_child_id`.
4. Contextversie/sessionhandle roteert.
5. Parent-querycaches, RSC-cache, browserhistorygevoelige state en relevante PWA-caches worden gewist of mode-/childgebonden gepartitioneerd.
6. Een minimaal security-event wordt geschreven.
7. Vanaf het commitmoment weigeren parentroutes, parentcommands en parent-sensitive data deze sessie.

Dezelfde Supabase-authsessie in andere tabs van dezelfde browser moet dezelfde vergrendelde modus respecteren. Andere apparaten/sessies blijven onafhankelijk.

Beveilig ook de race waarbij een parentrequest vóór de childtransactie autoriseert maar erna antwoordt. Verhoog `contextVersion` transactioneel, tag responses/querykeys met die versie, abort actieve parentrequests waar mogelijk en verwerp iedere response van een oudere contextversie vóór hydration/rendering. Securitykritieke handlers hercontroleren de context vóór serialisatie wanneer een lange query, render of download ertussen zit.

Voor een tenant waarvoor de splitflag aanstaat geldt: een ontbrekende, corrupte, verlopen of ingetrokken portalcontext is **niet** impliciet `parent`. Initialiseer een ontbrekende parentcontext alleen na volledige servervalidatie van de bestaande authsessie en tenantmembership; een bestaande child/revoked context vereist altijd lock/reauth. Voor tenants waar de splitflag nog uitstaat blijft het bestaande parentgedrag compatibel.

Child mode krijgt een begrensde, server-configureerbare absolute en/of inactivity-TTL. Volg een bestaande productconventie wanneer die bestaat en kies anders geen willekeurige productwaarde; de expirymechaniek zelf is wel verplicht. Na expiry weigeren parent- én childloaders, Data API/RPC/Storage en Realtime; de UI toont locked/login en parent mode wordt nooit automatisch hersteld.

### 8.2 Terug naar parent

Toon in child uitsluitend `Naar ouderportaal`.

Volledige reauth betekent een nieuwe provider-bevestigde authenticatieceremonie die **na** de unlockaanvraag start. `getClaims()`, `getUser()`, een access-tokenrefresh, reload, een nog geldige oude JWT of browser-back gelden niet als reauth.

Maak server-side een eenmalige unlockchallenge met nonce, user-ID, oude `session_id`, contextversie en een vervaltijd van maximaal vijf minuten. Rond die challenge af via de bestaande password-, OTP-, passkey- of MFA-flow. De challenge is single-use, CSRF-beschermd, Origin/Host-gevalideerd en wordt transactioneel verbruikt.

Wanneer de flow een nieuwe Supabase-`session_id` maakt:

- blijft de oude context locked/revoked;
- ontstaat pas na succesvolle verificatie een nieuwe parentcontext voor de nieuwe sessie.

Wanneer de bestaande provider aantoonbaar in-session step-up ondersteunt, slaat de server het provider-bevestigde reauthmoment op en roteert daarna contextversie/sessionhandle.

Hergebruik een bestaande parent-PIN alleen wanneer die server-side sterk gehasht is, minimaal zes cijfers ondersteunt, distributed rate limiting en lockout heeft en nooit als login op een nieuw apparaat fungeert. Ontwerp anders geen nieuwe PIN-flow. Wanneer geen veilige in-session reauth bestaat, is de v1-fallback: laat de oude Auth-sessie revoked/locked, log volledig uit en vereis een verse normale parentlogin.

Ontbrekende, verlopen of ingetrokken childcontext leidt altijd naar een locked/loginstate, nooit automatisch naar parent.

Na succesvolle reauth:

- markeer de oude childcontext locked/revoked en behoud de tombstone zolang de oude sessie/JWT bruikbaar kan zijn;
- roteer contextversie/sessionhandle;
- wis childcaches;
- herstel parent pas na nieuwe servervalidatie;
- schrijf een minimaal audit-event.

### 8.3 Directe kindlogin

QR + kind-PIN/directe childprincipal is **niet** onderdeel van v1. Houd alleen de principalvorm en server-side featureflag `direct_child_access = false` uitbreidbaar. Maak geen verzonnen kindmailadres en bewaar nooit een parent-refresh-token in een toekomstige childprincipal.

---

## 9. Supabase-, sessie- en RLS-beveiliging

Child mode mag nooit uitsluitend een route, cookie, React-state, verborgen menu of client-side role-check zijn.

Iedere Supabase access token bevat een unieke `session_id`. Bind de portalcontext minimaal aan:

- gevalideerde `auth.uid()`;
- gevalideerde JWT-`session_id`;
- tenant-ID;
- mode;
- bound child-ID;
- contextversie;
- verloop-/revocatiestatus.

Gebruik `getClaims()` of, waar actuele serverstatus nodig is, `getUser()` volgens de aanwezige Supabase-versie. Gebruik `getSession()` niet als zelfstandig autorisatiebewijs.

### 9.1 Verplichte bypassgarantie

Bij child mode kan de browser anders een nog geldige parent-JWT houden. Implementeer en bewijs daarom één volledige architectuur:

1. een server-side BFF waarbij de browser geen parent-JWT/Data API-toegang heeft; of
2. session-ID-gebonden restrictieve RLS/Storage/RPC/Realtime-controles op iedere parent-sensitive surface.

Een BFF-architectuur voldoet alleen wanneer de browser de raw parent access-/refresh-token niet kan lezen, verkrijgen of rechtstreeks tegen Supabase kan gebruiken, en directe Data API-grants zijn ingetrokken of door dezelfde contextgate beschermd. Een BFF die met een generieke `service_role` werkt en uitsluitend handmatige `tenant_id`-filters toepast, voldoet niet.

Als de actieve browser ooit een raw parenttoken kon verkrijgen, moet de bijbehorende Auth-sessie worden revoked en moeten directe datasurfaces de oude `session_id` fail-closed weigeren. Alleen tokens uit clientstorage verwijderen of voortaan HttpOnly-cookies gebruiken is onvoldoende. Wanneer de huidige sessie browser-Supabase gebruikte, blijft session-ID-gebonden RLS/Storage/RPC-beveiliging verplicht zolang een oud access token bruikbaar kan zijn.

Bij directe browser-Supabase:

- leest autorisatie de actuele context server-side op via de gevalideerde JWT-`session_id`;
- komen mode en bound child nooit uitsluitend uit JWT/app metadata, omdat claims na een contextwissel stale kunnen zijn;
- krijgt iedere parent-, trainer-, staff-, admin- en platformgevoelige surface een fail-closed modegate;
- is een client-aangeleverde contextversie, cookie, header, tenant-ID of child-ID nooit autoritatief.

`contextVersion` is voor sessierotatie, cache-invalidatie en het verwerpen van stale responses. Directe autorisatie gebruikt steeds de server-side contextrow die bij `session_id` hoort.

Harde eis: met de nog geldige parent-JWT mag tijdens child mode via handmatige REST-, GraphQL-, RPC-, Realtime- of Storage-calls geen parent-, sibling-, trainer-, staff-, admin-, platform- of tenantvreemde data bereikbaar zijn. Het verwijderen of wijzigen van een clientcookie mag toegang niet herstellen.

### 9.2 Databaseregels

- Default-deny en least privilege.
- RLS op iedere exposed tabel; private tabellen krijgen defense-in-depth en geen clientgrants.
- Veronderstel niet dat nieuwe `public`-tabellen automatisch exposed of automatisch private zijn. Inspecteer de actuele Data API-instelling, exposed schema's en default privileges van dit project. Enable RLS in dezelfde migration vóór bruikbare clientgrants, revoke onverwachte `PUBLIC`-, `anon`- en `authenticated`-privileges en grant daarna uitsluitend exact benodigde operations/columns. Test REST én GraphQL volgens de werkelijk ingeschakelde surfaces. Private securitytabellen staan in een niet-exposed schema en krijgen geen clientgrants.
- Gebruik geen `user_metadata` voor autorisatie.
- Gebruik geen `service_role` of secret key in browsercode of `NEXT_PUBLIC_*`.
- Views zijn `security_invoker = true`, of staan in een niet-exposed schema met ingetrokken clientrechten.
- Gebruik waar nodig `AS RESTRICTIVE` zodat bestaande permissive policies de childvergrendeling niet via `OR` omzeilen.
- `UPDATE`-policies hebben passende `SELECT`, `USING` en `WITH CHECK`.
- RLS beveiligt rijen, niet kolommen. Alleen in applicatiecode expliciete kolommen selecteren is geen securityboundary. Als een basistabel child-safe én gevoelige kolommen bevat, krijgt child geen directe `SELECT` op de basistabel. Lever uitsluitend allowlisted kolommen via een dedicated child-safe RPC/view/BFF-projectie die zelf session-ID, tenant en bound child valideert. Een handmatig REST-/GraphQL-verzoek mag de verboden kolommen niet kunnen selecteren.
- Plaats geen custom objecten in `auth`, `storage` of `realtime`; recente Supabase-versies beperken die schema's. Alleen toegestane policies op bestaande platformsurfaces zijn toegestaan.
- Gebruik bij voorkeur een private implementatiefunctie met een minimale server-/policywrapper. Wanneer een exposed RPC aantoonbaar nodig is, mag alleen een geharde wrapper exposed zijn. Die accepteert nooit auth-user-ID/session-ID als autoritatieve parameter, leest `auth.uid()` en JWT-`session_id` intern, valideert tenant/context/bound child, gebruikt een vaste minimale `search_path`, bevat geen dynamische SQL, revoke `EXECUTE` van `PUBLIC` en `anon`, en grant alleen aan de exact benodigde rol. Een private RLS-helper mag `SECURITY DEFINER` zijn als clientrollen anders de private contexttabel zouden moeten lezen; geef dan alleen `EXECUTE`, nooit tabeltoegang.
- Indexeer foreign keys en aantoonbaar gebruikte RLS-/contextpredicaten op basis van queryplan en repositoryconventies. Gebruik passende samengestelde indexes met equalitykolommen eerst; voeg geen blanket-index per kolom toe.
- Gebruik samengestelde tenantforeign keys waar passend om cross-tenantrelaties database-technisch onmogelijk te maken.

### 9.3 Conceptuele private structuur

Pas namen aan de repository aan en hergebruik bestaande tabellen waar veilig:

```text
portal_session_contexts
- auth_session_id
- auth_user_id
- tenant_id
- mode
- status
- bound_child_id
- context_version
- child_mode_expires_at
- locked_at
- revoked_at
- created_at
- updated_at

portal_security_events
- id
- occurred_at
- tenant_id
- auth_user_id
- bound_child_id
- auth_session_id_hash
- event_type
- outcome
- request_id
- minimale requestmetadata
```

Clientrollen krijgen geen directe CRUD- of selectrechten op deze structuren. Security-events zijn append-only, server-written en bevatten nooit tokens, PIN's, badgegeheimen, medische gegevens of responsepayloads.

Er bestaat per `auth_session_id` exact één autoritatieve actuele securitystate over alle tenants heen. `auth_session_id` is uniek, of een afzonderlijke session-global lockrecord is uniek wanneer tenantcontexten historisch apart worden opgeslagen. Zodra een sessie child, locked of revoked is, geldt dat voor iedere tenant en iedere rol van die sessie. Een tenantwissel is in child mode verboden. Meerdere of tegenstrijdige actuele contextrows leiden fail-closed naar locked; de resolver kiest nooit zelf de gunstigste row. Historie hoort in een afzonderlijke append-only history-/audittabel en niet in meerdere gelijktijdig autoritatieve rows.

`locked` is een persisted server-side toestand, geen uitsluitend UI-label. Implementeer dit via een expliciete status of ondubbelzinnig afgeleide servervelden. De database dwingt minimaal af:

- child vereist tenant en bound child;
- parent heeft geen child-only binding;
- expired, locked en revoked kunnen niet als parent autoriseren;
- corrupte of tegenstrijdige combinaties weigeren alles.

Expiry- en RLS-berekeningen gebruiken database-/servertijd, nooit een clienttimestamp.

Fail-closed contextmatrix:

| Situatie | Toegang |
|---|---|
| Geen contextrow, rolloutflag uit en sessie nooit child geweest | bestaand legacygedrag mag tijdelijk blijven |
| Geen contextrow, rolloutflag aan | alles weigeren totdat de server veilig parentcontext initialiseert |
| Geldige parentcontext | bestaande capabilities |
| Geldige childcontext | uitsluitend childallowlist voor bound child |
| Verlopen, locked of revoked context | geen parent- of childdata; locked/loginstate |
| Bestaande childcontext terwijl rolloutflag later uitgaat | parentdata blijft geweigerd |

Verwijder een verlopen, locked of revoked contextrow niet zolang de Auth-sessie of een uitgegeven JWT nog bruikbaar kan zijn. Bewaar een tombstone lang genoeg om terugval naar `geen row = legacy parent` onmogelijk te maken. Alleen een verse aantoonbare reauth mag voor een nieuwe/geverifieerde sessie opnieuw parentcontext creëren.

Wanneer browser-Supabase/directe Data API actief blijft, is de rollout-/enforcementstatus die de no-contextregel bepaalt database-side autoritatief en in RLS beschikbaar, of geldt de contextgate onvoorwaardelijk. Een uitsluitend client-, environment- of Next.js-featureflag kan directe REST-/GraphQL-toegang niet beveiligen.

Documenteer de volgende veilige toekomstige activatievolgorde; voer haar niet uit vanuit Codex Cloud:

1. migrations, contexthelper en restrictive gates uitrollen;
2. database-side no-context-deny voor de doeltenant activeren;
3. pas daarna de parent-/child-UI activeren.

Alleen een serverendpoint mag een ontbrekende parentcontext initialiseren. Een directe Data API-request, clientheader of queryparameter kan dit nooit doen. Een sessie met tombstone/history mag nooit via generieke lazy initialization opnieuw parent worden.

### 9.4 Storage, Realtime en caches

- Storage-paden zijn geen autorisatie; valideer tenant, child, portalcontext en objectrelatie in Storage-RLS/proxy.
- Child ontvangt alleen kindveilige renditions, niet het private origineel.
- Persoons- of childgebonden private media loopt in v1 verplicht via een authenticated same-origin proxy die bij iedere request de actuele sessionstate, tenant en bound child valideert. Standaard Supabase signed URLs zijn bearer credentials en voldoen niet aan de vereiste onmiddellijke lock-, expiry- en kill-switchsemantiek. Gebruik ze uitsluitend voor niet-persoonlijke theme-assets of wanneer de productowner later expliciet een begrensd restrisico accepteert; claim dan geen directe revocatie of contextbinding.
- Child Realtime autoriseert uiterlijk bij context-TTL, modewissel, guardianrevocation en kill switch opnieuw server-side. Implementeer geforceerde disconnect/rejoin of een kortere channelautorisatie dan de context-TTL. Wanneer de gebruikte Broadcast-/Presence-/Postgres Changes-flow geen tijdige herautorisatie kan garanderen, staat Realtime voor die childsurface uit en gebruikt de app geautoriseerde polling/serverfetch. Vertrouw niet uitsluitend op autorisatie bij channel join.
- Als een API-surface niet actief is, test en documenteer dat deze uit staat in plaats van hem alleen voor tests te activeren.
- Service worker cachet geen authenticated HTML, RSC/API-responses, signed media of ouderdata.

### 9.5 Private responseheaders

Gebruik op private parent-, child-, fout- en assetresponses waar passend:

```http
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex
Cache-Control: private, no-store
```

Gebruik daarnaast Next.js robotsmetadata, dynamische rendering en nul CDN/proxy-TTL voor private responses. Cachekeys bevatten minimaal tenant, user, mode, child en contextversie.

`private, no-store` geldt voor authenticated HTML/RSC/API en persoons-/sessiongebonden media. Openbare, niet-persoonlijke, content-hashed theme-assets mogen langdurig `public, immutable` worden gecachet en bevatten nooit persoonsgegevens of verborgen badgeinformatie.

---

## 10. Ouderportaal — UX-contract

Het ouderportaal blijft professioneel, taakgericht en volledig. De nieuwe childmodus verwijdert geen enkele ouderfunctie.

### 10.1 Navigatie

Desktopsidebar:

1. Overzicht;
2. Planning;
3. Ontwikkeling;
4. Inbox;
5. Betalingen;
6. secundair `Profiel & meer`.

Mobiele bottomnav exact:

1. Overzicht;
2. Planning;
3. Ontwikkeling;
4. Inbox;
5. Meer.

Betalingen staat mobiel uitsluitend onder `Meer`.

Parentheader:

- links tenantlogo, tenantnaam en productcontext;
- rechts notificaties en profiel;
- geen losse kindselector in header of sidebar;
- het profielmenu toont het actieve kind en exact `Ander kind…` en bevat ook `Open kinderportaal`.

`Profiel & meer` bevat exact in deze volgorde: Documenten, Feedback, Gezin en toegang, Profiel. Badges, Media en Diploma's blijven subpagina's van Ontwikkeling en worden geen losse primaire sidebaritems.

### 10.2 Shellgeometrie

Desktop vanaf `1280px`:

- buitenmarge `22px`;
- sidebar `238px`, radius `28px`;
- gap sidebar/content `18px`;
- header `72px`, radius `23px`;
- sidebar en header starten exact op dezelfde bovenlijn;
- header, contentgrids en cards delen vaste baselines;
- dashboard past vanaf `1280×720` zonder documentscroll;
- andere pagina's scrollen alleen in het contentvlak.

Tablet:

- `1024–1279px`: compacte icon-sidebar toegestaan;
- onder `1024px`: bottomnav;
- grids reduceren gecontroleerd naar `50/50` of `100%`.

Mobiel:

- één documentscroll;
- geen geneste verticale scrollcontainers;
- floating header circa `70–72px`;
- lichte bottomnav met safe-area;
- geen horizontale documentscroll.

### 10.3 Parentdashboard — expliciet goedgekeurde delta

De schermvullende gamified journey verhuist primair naar child. Pas het parentdashboard voor alle zeven thema's gecontroleerd aan:

- bovenste rij `50/50`;
- links: volgende les/activiteit en relevante planning;
- rechts: compacte voortgangspreview met huidige etappe, huidig doel en de centrale ringen;
- onderste rij `33/33/33`: Openstaande acties, Updates en Berichten;
- preview linkt naar `/portaal/ontwikkeling`;
- geen schermvullende Manta/scenery in parent;
- thema blijft subtiel herkenbaar in materialen, kleine scenerycrop, iconen en accenten;
- lijstkaarten tonen alleen wat binnen de viewport past en bieden `Alles bekijken`.

Dit is een expliciet toegestane parentbaselinewijziging. Overige bestaande parentroutes blijven visueel en functioneel ongewijzigd, behalve noodzakelijke child-entry-, capability-, security-, accessibility- en overflowaanpassingen.

Verticale desktopstrategie:

- shell: `height: calc(100dvh - 44px)`;
- main: `grid-template-rows: 72px minmax(0, 1fr)` met `18px` gap;
- parentdashboard: `minmax(0, 1fr)` plus een onderste rij `clamp(168px, 24vh, 210px)`;
- child Vandaag: één `minmax(0, 1fr)`-rij met Quest en `repeat(3, minmax(0, 1fr))` in de informatiekolom;
- dashboardkaarten krijgen geen interne verticale scrollbar.

De no-scroll-acceptatie geldt bij `100%` browserzoom. Bij `200%` zoom moet de layout naar het passende responsive breakpoint reflowen; normale documentscroll mag dan ontstaan.

### 10.4 Functionele dekking

Behoud alle bestaande functies uit Planning, Lesdetail, Ontwikkeling, Badges, Media, Diploma's, Inbox, Betalingen, Documenten, Feedback, Gezin/toegang en Profiel. Inventariseer extra repositoryfuncties en wijs iedere functie aan exact één capability-eigenaar toe; dupliceer ze niet automatisch naar child.

---

## 11. Kinderportaal — UX-contract

### 11.1 Navigatie

Desktopsidebar en mobiele bottomnav bevatten exact en in deze volgorde:

1. Vandaag;
2. Mijn reis;
3. Badges;
4. Agenda;
5. Ik.

Geen Inbox, Betalingen, Documenten, Gezin of parent-`Meer`.

Header:

- desktop toont links tenantlogo, tenantnaam en `<effectief thema> · Kinderportaal`;
- desktop toont rechts childavatar/voornaam, accessibilitycontrol en `Naar ouderportaal`;
- mobiel toont links een compact logo plus afgekorte tenantnaam met ellipsis;
- mobiel toont rechts uitsluitend de childavatar en een `48×48px` lock-/exitknop met accessible name `Naar ouderportaal`;
- voornaam, volledige accessibilityinstellingen en de tekstuele exitactie staan mobiel onder `/kind/ik`;
- geen oudernotificatiebel, ouderavatar of kindselector;
- geen achternaam waar die niet functioneel noodzakelijk is.

De child-desktopshell erft exact de buitengeometrie uit paragraaf 10.2: buitenmarge `22px`, sidebar `238px`, sidebar/contentgap `18px`, header `72px`, sidebar-radius `28px` en header-radius `23px`. Alleen navigatielabels, headerinhoud en presentation recipe verschillen. Childsidebar, header, Quest en informatiekolom sluiten op dezelfde baselines aan. Voor tablet en mobiel gelden dezelfde breakpointregels uit paragraaf 10.2.

### 11.2 Vandaag

Gebruik de finale Ocean Quest-overview als belangrijkste kwalitatieve referentie, maar volg deze nieuwe compositie.

Desktop op vier gelijke tracks:

- Quest beslaat drie tracks (`75%` opgebouwd als 3×25%);
- informatiekolom beslaat één track (`25%`);
- informatiekolom bevat drie exact even hoge kaarten:
  1. Volgende les/activiteit;
  2. Compliment of child-visible trainerstip;
  3. Laatst behaalde mijlpaal;
- Quest en informatiekolom eindigen gelijk met sidebar;
- volledig dashboard past vanaf `1280×720` zonder documentscroll.

Quest:

- huidig doel is de dominante camerafocus;
- relevante eerdere en volgende stappen geven context;
- geen parenttaak, betaling, document of bericht in beeld;
- compacte copytemplates blijven live HTML;
- programma-/sportconfiguratie bepaalt de terminologie, niet het visuele thema;
- een zwemprogramma mag `De zwemreis van {voornaam}!` gebruiken;
- een algemeen sportprogramma gebruikt `De reis van {voornaam}!`, ongeacht het gekozen thema;
- theme recipes hardcoden geen domeinterminologie.

Mobiel eerste viewport:

- floating header;
- compacte volgende-lesinformatie in de Quest;
- de volledige Quest-container met het gefocuste portrait-cameravenster;
- lichte bottomnav;
- compliment, trainerstip en mijlpaal beginnen direct onder de eerste vouw.

Op `390×844` en groter toont het cameravenster, wanneer de data dit toelaat, twee behaalde stappen onder het actuele doel, het actuele doel rond `52–54%` van de Questhoogte en twee vervolgstappen erboven. Op `320×568` blijven de container, actieve marker, touch targets en minimaal de dichtstbijzijnde vorige en volgende stap volledig bruikbaar; overige stappen blijven via vorige/volgende bereikbaar. Prop niet het volledige hoofdstuk of alle markers tegelijk in één viewport.

### 11.3 Mijn reis

Toon:

- huidige etappe en huidig doel;
- eenvoudige, positieve voortgang per onderdeel;
- kindveilige uitleg;
- expliciet child-visible trainerstip/compliment;
- goedgekeurde instructievideo met captions/transcript;
- huidige reis en onveranderlijke afgeronde hoofdstukken;
- behaalde parels en reeds onthulde surprisebadges.

Verberg:

- interne rubrics;
- ruwe docentnotities;
- auditlog en correctieredenen;
- ouder-/medewerkercarryoverdetails;
- groepsvergelijkingen;
- siblingdata.

### 11.4 Badges

Toon volledige premium badgewall-UX met placeholder-art, filters, earned/locked standaardstates, verdiende surprises, detail en in-app viermoment. Child krijgt geen native share, publieke link of download.

### 11.5 Agenda

Toon read-only:

- datum en tijd;
- uitsluitend werkelijk aanwezige, semantisch gelabelde resourcevelden, bijvoorbeeld zwembad/bad/baan of sportlocatie/veld/ruimte;
- trainer;
- benodigdheden;
- vakantieactiviteiten;
- mogelijk toets-/afzwemmoment;
- countdown waar relevant.

Toon geen afmeld-, boek-, betaal- of reactiecommand. Alleen `Vraag mijn ouder` volgens paragraaf 6.3.

Render geen lege resourcevelden en geen zwemspecifieke labels in NXTTRACK Default wanneer de programma-/sportdata die semantiek niet bevat.

### 11.6 Ik

Toegestaan:

- voornaam;
- vooraf goedgekeurde avatar;
- prijzenkast met diploma-/mijlpaalmetadata zonder privédocument of serienummer;
- goedgekeurde lage-/webrenditions van foto's en video's zonder downloadactie;
- thema kiezen uit de tenantallowlist wanneer toegestaan;
- geluid aan/uit, voorlezen en verminderde beweging voor zover ondersteund;
- `Naar ouderportaal`.

Niet toegestaan:

- e-mail, telefoon, adres of medische gegevens;
- gezinsleden of toegangsniveaus;
- uploads of openbare profieltekst;
- beveiligingsinstellingen;
- consentbeheer;
- private bestandslinks.

Geluid staat standaard uit. Respecteer altijd OS `prefers-reduced-motion`; een childvoorkeur kan beweging verder beperken maar nooit afdwingen tegen de OS-keuze in.

### 11.7 Niet-kinderlijke richting

Verboden:

- cartoonfonts of babytaal;
- willekeurige emoji's/stickers;
- overdreven bubblebuttons;
- constante confetti, geluid of bounce;
- mascotte als chatbot;
- dagelijkse streaks, ranglijsten of verliesangst;
- kunstmatige schermtijddoelen.

Gebruik korte respectvolle copy: `Je volgende doel`, `Bekijk je reis`, `Goed gedaan: dit onderdeel is behaald`.

Maximaal één prominente mascotte per view. De mascotte is routebegeleider/statuscue en bedekt nooit content.

### 11.8 Bindende child-bronmapping

| Childstate | Gezaghebbende visuele bron | Desktopcompositie | Mobiel |
|---|---|---|---|
| Vandaag | `overview` | nieuwe `75/25`-compositie uit paragraaf 11.2 | Questcontainer eerst, kaarten onder de vouw |
| Mijn reis | `development` | huidige journey `100%`; daaronder `50/50` voor Doelen en Afgeronde hoofdstukken | alles `100%` in dezelfde volgorde |
| Doeldetail | detailstate uit `development` | `50/50`: uitleg/voortgang en child-visible tip/video | `100%`; uitleg vóór media |
| Badges | `badges` | bestaande filter-, kaart- en detailgeometrie; grid volgens paragraaf 14 | dezelfde geometrie, twee kolommen en bottomsheet/detailstate |
| Agenda | `planning` | `50/50` voor Volgende activiteit en Belangrijk moment; aankomende agenda daaronder `100%` | alles `100%` |
| Lesdetail | `lesson` | `50/50`: lesinformatie en locatie/benodigdheden | `100%` |
| Ik · prijzenkast | `diplomas` | bestaande kaartgeometrie zonder downloads/serienummers | dezelfde kaarten responsive |
| Ik · momenten | `media` | bestaande mediageometrie met child-safe renditions | dezelfde galerij responsive |
| Ik · instellingen | `profile` | `50/50` settingscards | `100%` |

Gebruik uitsluitend de child-safe velden en acties uit deze opdracht. De bron bepaalt geometrie, componenttaal en states, niet capability-eigendom. Ontwerp geen alternatieve kaartfamilie wanneer de gemapte bron al een equivalent bevat.

---

## 12. Grid- en responsivecontract

Gebruik voor nieuwe/touched contentgrids uitsluitend:

- `100%`;
- `50/50`;
- `33/33/33`;
- vier gelijke `25/25/25/25` tracks.

Een `75/25`-compositie wordt uitsluitend als drie plus één gelijke kwarttrack gebouwd. Gebruik geen willekeurige `1.65fr/.8fr`, `40/60`, `37/63` of vaste contentkolommen die kaartlijnen breken.

Gaps:

- desktop `18px` voor hoofdgrids;
- tablet `14px`;
- mobiel `12px`;
- bestaande behouden componentinterne gaps uit het finale prototype blijven exact wanneer ze niet met het hoofdgrid conflicteren.

Touch targets minimaal `48×48px` voor nieuwe childinteracties; bestaande parenttargets minimaal volgens WCAG/projectcanon en waar aangeraakt eveneens `48×48px`.

Responsive overgang:

- vanaf `1280px`: volledige sidebar en Child Vandaag als `3×25% + 1×25%`;
- `1024–1279px`: compacte sidebar; dezelfde kwarttrackverdeling zolang de informatiekolom minimaal `220px` breed blijft, anders Quest `100%` met de drie kaarten als `33/33/33` eronder;
- `768–1023px`: Quest `100%`, met de drie informatiekaarten daaronder als `33/33/33`;
- onder `768px`: Quest `100%`, met iedere informatiekaart daaronder `100%`;
- parenttablet landscape mag boven `50/50` en onder `33/33/33` houden; tablet portrait en mobiel stapelen naar `100%`.

De no-scroll-acceptatie op dashboards geldt bij `100%` browserzoom. Bij `200%` zoom reflowt de layout en mag normale documentscroll ontstaan; horizontale documentscroll blijft verboden.

Ondersteunde viewports zonder horizontale documentscroll:

- `2560×1440`;
- `1920×1080`;
- `1600×900`;
- `1440×900`;
- `1366×768`;
- `1280×720`;
- `1180×820`;
- `1024×768`;
- `820×1180`;
- `768×1024`;
- `430×932`;
- `390×844`;
- `360×800`;
- `320×568`.

---

## 13. Journey-engine — één berekening, twee projecties

Behoud de volledige bestaande Ocean Quest-logica en maak deze themaneutraal genoeg voor NXTTRACK Default en andere sporten.

### 13.1 Lagen

Altijd afzonderlijk:

1. scenery;
2. route;
3. mascotte;
4. markers/parels/bonusparels;
5. popover;
6. vaste informatiekaarten.

Bak nooit tekst, UI, marker, ring, badge, logo, mascotte of persoonsgegevens in scenery.

### 13.2 Hoofdstukken en volgorde

- Een configured niveau/badje vormt een hoofdstukgrens.
- Zonder tussenniveaus bestaat één hoofdstuk van start naar diploma/eindniveau.
- Voltooide onderdelen worden chronologisch als parels bevroren.
- Huidig doel: eerst hoogste relevante voortgang; bij ontbrekende beoordelingen curriculumvolgorde, daarna alfabetisch en stabiele onderdeel-ID als tie-breaker.
- Voltooide historische posities veranderen niet meer.
- Ondersteun 0, 1, 4, 7, 12 en meer onderdelen zonder lege vaste slots.
- Parent en child gebruiken exact dezelfde server-authoritative progress-engine; geen tweede berekening.

### 13.3 Focus en interactie

Desktop:

- binnenwereld breder dan masker;
- `108–116%` ingezoomd;
- waar data beschikbaar: twee behaalde punten vóór, huidig doel centraal en minimaal twee vervolgstappen na;
- drag, horizontaal trackpad, pijlen en toetsenbord;
- verticaal muiswiel niet kapen;
- centreren in `350–500ms`.

Mobiel:

- eigen portrait-scene; nooit desktop crop/rotatie;
- route loopt van onder naar boven;
- huidig doel rond `52–54%` van Questhoogte;
- vrij pannen alleen in expliciete `Verken de route`-modus;
- normale documentscroll blijft leidend.

Reduced motion gebruikt een korte crossfade en stopt idle motion.

### 13.4 Afgeronde hoofdstukken

Bewaar voltooide hoofdstukken als onveranderlijke snapshots met minimaal:

- theme-ID en releaseversie;
- artwork-ID en -versie;
- curriculumversie;
- hoofdstukgrenzen;
- puntenvolgorde en labels;
- statussen en completion timestamps;
- parels en bonusparels;
- gekoppelde earned badge-instances.

Maak snapshots idempotent en transactioneel. Corrigeer via een geauditeerde superseding revision; wijzig nooit een historische snapshot stil. Verzin geen chronologie voor legacydata zonder betrouwbare timestamps.

Iedere hoofdstuksnapshot heeft een unieke idempotency key die aan het completionevent is gekoppeld. Retries mogen nooit een tweede snapshot voor hetzelfde completionevent creëren.

---

## 14. Badges en surpriseprivacy

### 14.1 Placeholdercontract

Gebruik één stabiele `BadgeArtworkPlaceholder` met vervangbaar assetslot en zonder layout shift.

Leg vast:

```text
badgeArtworkReady: false
placeholderOnly: true
```

States:

- verdiende standaardbadge: volledig gekleurd placeholder-art, naam, datum en status;
- locked standaardbadge: artwork circa 30% opacity, naam/slot/status leesbaar;
- verdiende surprisebadge: pas na unlock zichtbaar;
- onverdiende surprisebadge: volledig afwezig;
- meerdere earned instances blijven afzonderlijk.

Badgegrid:

- exact vier kolommen vanaf `768px`;
- exact twee kolommen onder `768px`.

Parent mag delen wanneer capability/toestemming dit toestaat. Child heeft uitsluitend een in-app viermoment.

Categorieën en filters komen uit echte tenant-/programmetadata. Hardcode geen zwemspecifieke categorieën in NXTTRACK Default. Een surprise-categorie verschijnt alleen wanneer minimaal één surprisebadge is verdiend.

Placeholderbadges zijn uitsluitend toegestaan in fixtures en componentstates. Deze sprint seedt geen verzonnen productiebadges en introduceert geen zelfbedachte definitieve badgecollectie.

### 14.2 Geen surpriselek

Een niet-behaalde surprisebadge mag vóór unlock nergens bestaan in een parent- of childclient:

- geen ID, naam, omschrijving, categorie of teller;
- geen artworknaam, URL, alt-tekst, dominante kleur of preload;
- geen HTML, JSON, RSC, hydrationstate of accessibility tree;
- geen REST/GraphQL-countlek;
- geen Realtime-event;
- geen browser-/service-workercache;
- geen publieke Storage-objectreferentie of buildmanifest-entry.

Filter vóór serialisatie. Een onbekende en een niet-behaalde surprisebadge geven dezelfde generieke uitkomst.

---

## 15. Thema- en mascottecontract

| Thema | Mascotte | Child | Parent |
|---|---|---|---|
| NXTTRACK Default | geen | premium, sportneutrale journey | neutrale NXTTRACK-accenten |
| Dolphin Bay | dolfijn | volledige vrolijke zwemwereld | subtiele golf-/kleuraccenten |
| Turtle Trails | schildpad | rustige eiland-/onderwaterreis | subtiele groen/aqua-accenten |
| Polar Splash | pinguïn | frisse ijswereld | heldere ijsblauwe accenten |
| Coastal Explorer | strandwachter | moderne kustjourney | rustige kust-/navyaccenten |
| Nationaal Zwem ABC | geen | A/B/C-vormritme en fasen | subtiele A/B/C-accenten |
| Ocean Quest | Manta | volledige premium onderwaterreis | aqua/navy en compacte scenerypreview |

Regels:

- één theme-ID, verschillende parent/child recipes;
- bestaande zes bronassets blijven byte-for-byte intact;
- voeg childrecipes/manifestcapabilities additief toe;
- regenereer geen goedgekeurde scenery of mascotte;
- mascottes blijven transparante losse assets;
- geen layout shift of contentoverlap;
- decoratieve mascotte is `aria-hidden`;
- reduced motion stopt idle motion;
- geen speech bubbles/chatfunctie;
- Default bevat geen hardcoded zwemspecifieke copy;
- Nationaal Zwem ABC gebruikt geen officieel logo/diploma-art zonder aangeleverde licentie.

Effectief thema:

Child voor `boundChildId`:

1. platform-/tenant-forced assignment volgens de bestaande engine;
2. child preference binnen tenantallowlist wanneer childkeuze is toegestaan;
3. tenantdefault;
4. NXTTRACK Default fallback met gelogd fallbackevent.

Parent met een actief kind gebruikt hetzelfde effectieve thema, maar uitsluitend met de parent recipe. Parent zonder actieve kindcontext gebruikt: forced assignment → tenantdefault → NXTTRACK Default. Een child preference mag nooit de parent recipe door een child recipe vervangen. Registratie van Ocean Quest activeert dit thema niet automatisch voor bestaande tenants.

Mascotteplaatsing:

- een prominente mascotte is uitsluitend toegestaan op Child Vandaag, Child Mijn reis en een verdiend viermoment;
- parent toont hoogstens een compacte decoratieve mascotte in de voortgangspreview of Ontwikkeling;
- Planning, Lesdetail, Inbox, Betalingen, Documenten, Feedback, Gezin, Profiel, Agenda en Ik krijgen geen prominente mascotte;
- NXTTRACK Default en Nationaal Zwem ABC tonen nooit een mascotte.

Theme switching laat geen styles/state achter, veroorzaakt geen hydrationverschil en flasht niet eerst Default. Gebruik productie-AVIF/WebP/renditions; laad nooit automatisch een 8K-bronbestand op mobiel.

---

## 16. Migrations, featureflags en rollback

### 16.1 Migrationregels

- Nieuwe tabellen en kolommen zijn additief.
- Securityhardening mag transactioneel `ALTER POLICY`, `DROP POLICY` + `CREATE POLICY`, `GRANT`/`REVOKE` en `CREATE OR REPLACE FUNCTION/VIEW` gebruiken wanneer de audit dit vereist. Documenteer en test de exacte voor-/natoestand.
- Verboden blijven `DROP TABLE`, `DROP COLUMN`, dataverwijdering, semantisch destructieve renames, route-ID-wijzigingen en verlies van compatibility.
- Migrationfiles worden eenmaal via migration history uitgevoerd; backfills en hersteljobs zijn restartable/idempotent. Verberg schemadrift niet met generieke `IF NOT EXISTS`-constructies.
- Maak migrations met de repository-/Supabase CLI-conventie; ontdek CLI-versie en commands via `--help`.
- Test op een verse database én op de onmiddellijk voorafgaande migrationstate met representatieve lokale fixtures.
- Voeg constraints veilig toe; Postgres ondersteunt geen generieke `ADD CONSTRAINT IF NOT EXISTS`.
- Indexeer foreign keys en aantoonbaar gebruikte RLS-/contextpredicaten op basis van queryplan en repositoryconventies. Gebruik passende samengestelde indexes met equalitykolommen eerst; voeg geen blanket-index per kolom toe.
- Run database/security advisors indien de gebruikte CLI/omgeving dit ondersteunt.
- Accepteer geen nieuwe securitywaarschuwing.
- Pas geen remote database toe vanuit Codex Cloud.

Maak alleen tabellen/kolommen die na audit ontbreken. Gebruik bestaande equivalents waar mogelijk voor:

- sessiongebonden portalcontext;
- security-events;
- child-safe preferences;
- gestructureerde parent requests;
- journey chapter snapshots;
- tenant child-portalconfig/allowlist.

### 16.2 Featureflags

Gebruik de bestaande flaginfrastructuur, conceptueel:

```text
portal_experience_split
child_mode
child_parent_requests
direct_child_access
```

Defaults:

- alle nieuwe rolloutflags uit;
- `direct_child_access` altijd uit in v1;
- eerst interne/stagingtenant;
- daarna tenantallowlist;
- geen automatische activatie voor bestaande tenants.

Bij eerste activatie voor een tenant worden bestaande geldige parentsessies veilig en idempotent als parentcontext geïnitialiseerd bij hun eerstvolgende volledig gevalideerde request. Een ontbrekende context mag daarna niet als clientgekozen mode worden geïnterpreteerd.

Kill switch:

- de rolloutflag bepaalt of nieuwe childcontexten mogen worden aangemaakt; hij is niet de enige database-autorisatiebron;
- bij uitschakelen worden geen nieuwe childcontexten geopend;
- bestaande childcontexten blijven parentdata onmiddellijk weigeren, ook voordat een batchjob ze locked/revoked markeert;
- contextrows worden niet verwijderd;
- resolver en RLS controleren een bestaande child-, locked- of revokedcontext vóór iedere legacy-/flagfallback;
- volledige reauth is vereist om later een nieuwe parentcontext te krijgen;
- een gedeeltelijk mislukte kill-switchjob blijft fail-closed;
- de procedure verwijdert geen data of schema.

---

## 17. Toegankelijkheid, privacy en performance

Minimaal WCAG 2.2 AA:

- correcte landmarks/headings;
- journey semantisch als geordende lijst;
- actief doel `aria-current="step"`;
- marker noemt naam, status, percentage en update;
- hover heeft focus-/tappariteit;
- Escape sluit popover en herstelt focus;
- zichtbare focus;
- kleur nooit enige statusdrager;
- 200% zoom en pinch-zoom bruikbaar;
- reduced motion;
- video captions/transcript;
- geen autoplayaudio;
- viermomenten werken zonder animatie.

Privacy:

- geen parentvelden in childpayload;
- geen achternaam/contactgegevens in URL, title, OpenGraph, manifest of analytics;
- geen childgedragssurveillance;
- analytics bevat hoogstens theme/release, route, viewportcategorie, tenanthash, mode, resultaat en Web Vitals;
- geen participant-ID, naam, bedrag, berichtcopy of badgegeheim.

Performancegates op vaste fixtures waar projectinfrastructuur dit ondersteunt:

- geen 8K-asset als LCP-resource;
- LCP maximaal `2,5s`;
- INP maximaal `200ms`;
- CLS maximaal `0,1`;
- Lighthouse Performance minimaal `90`;
- geen layout shift door scenery, Manta, camera of placeholder-art;
- lazy-load routeart onder de vouw;
- preload uitsluitend werkelijk actuele LCP-scene;
- stabiele functionele fallback bij ontbrekend artwork/data saver/trage verbinding.

---

## 18. Implementatiefasen en commits

### Fase 0 — audit en baseline

- bronnen valideren/versioneren;
- bewaar deze opdracht in de repository onder een passend `docs/codex-tasks/`-pad en plaats bovenaan de oude Ocean Quest-opvolgtaak én het bronnenaddendum een niet-destructieve `SUPERSEDED`-banner die naar deze v1.0-opdracht verwijst; maak in de addendumbanner expliciet dat alleen de tijdelijke controlemodus is superseded en dat bronintegriteit/mapping gezaghebbend blijft; laat de historische inhoud intact;
- routes, auth, Supabase-surfaces, RLS, themes en tests inventariseren;
- baselines vastleggen.

Commit: broninput en audit/testharnas, logisch gescheiden.

### Fase 1 — portalcontext en securityboundary

- centrale contextresolver/authorizer;
- session-ID-binding;
- parent/child capabilitymatrix;
- RLS/Storage/RPC/Realtime-hardening;
- featureflags en locked/reauthflow;
- securitytests eerst groen.

Commit: context/migrations en securitytests logisch gescheiden.

### Fase 2 — route- en presentatiescheiding

- ParentPortalShell/ChildPortalShell;
- parentroutes behouden;
- `/kind`-routegroep;
- allowlisted child-loaders/DTO's;
- veilige cachepartitie/noindex/no-store.

Commit: routes/shells en childprojecties.

### Fase 3 — theme recipes en assets

- Ocean Quest registreren;
- parent/child recipefamilies voor zeven thema's;
- productie-renditions;
- assetmanifest/checksums;
- geen bronassetwijziging.

Commit: theme registry/recipes/assets.

### Fase 4 — parentervaring

- goedgekeurde 50/50 + 33/33/33 dashboarddelta;
- `Open kinderportaal`;
- alle dertien functies en compatibilityroutes behouden;
- mobiel Betalingen onder Meer.

Commit: parent UX en regressietests.

### Fase 5 — childervaring

- Vandaag;
- Mijn reis en doeldetail;
- Badges;
- Agenda/lesdetail;
- Ik;
- `Vraag mijn ouder`;
- reauth/unlock.

Commit logisch per routegroep.

### Fase 6 — journey, snapshots en badges

- dynamische focus;
- parels/bonusparels;
- snapshots;
- surpriseprivacy;
- placeholder-art;
- viermomenten.

Commit: journey/badges plus tests.

### Fase 7 — eindkwaliteit

- volledige browser-/viewport-/theme-/mode-matrix;
- accessibility;
- performance;
- build;
- docs;
- draft PR.

---

## 19. Verplichte testmatrix

### 19.1 Unit/component

- portalcontextresolver en default-deny capabilities;
- parent/child route ownership;
- child DTO allowlists;
- theme resolver en fallback;
- parent/child recipes;
- childbound participant zonder siblingselector;
- `aria-current`, focusreturn en reduced motion;
- badgeplaceholderstates;
- parent-request-idempotency/rate limiting;
- ontbrekend artwork/data;
- general-sportfixture zonder zwemspecifieke hardcode.

### 19.2 SQL/RLS/security

Test minimaal:

1. Tenant A versus Tenant B met geraden geldige UUID's.
2. Parent versus niet-gekoppeld kind binnen dezelfde tenant.
3. Child A versus sibling B terwijl parent beide mag beheren.
4. Guardian die tevens trainer, staff, tenant-admin en/of platformrol bezit; alle niet-childsurfaces blijven dicht.
5. Dezelfde sessie is child in tenant A terwijl de gebruiker parent-/adminrechten in tenant B bezit; tenant B en iedere andere rol blijven dicht.
6. Rechtstreekse enabled REST-, GraphQL-, RPC-, Realtime- en Storage-pogingen met nog geldige parent-JWT tijdens child mode.
7. Bewuste selectie van een bekende verboden kolom uit iedere relevante gemengde tabel/projectie.
8. Cookie verwijderen/manipuleren, oude tab, browser-back en forged contextversion.
9. Ontbrekende contextrow met rolloutflag aan.
10. Verlopen/revoked tombstone terwijl rolloutflag uitstaat.
11. Oude JWT na succesvolle reauth of nieuwe parentlogin.
12. Contextverloop, guardian-link-revocation en tenantmembership-revocation.
13. Kill switch vóór, tijdens en na een eventuele contextbatch, inclusief gedeeltelijk mislukte batch.
14. Parentrequest dat tijdens de modeswitch al onderweg is en daarna niet mag hydrateren.
15. Realtime-stream die tijdens expiry, modeswitch of kill switch openstaat en geen gevoelige events meer ontvangt.
16. Eerder uitgegeven media-URL na lock, expiry en kill switch; private bearer-URL's zijn niet toegestaan zonder latere expliciete risicoacceptatie.
17. CSRF, Origin/Host, unlockchallenge-expiry, single-use en replay op state-changing requests.
18. Parentdata afwezig uit child HTML, JSON, RSC, hydrationstate en clientcache.
19. Onverdiende surprise afwezig uit payload, counts, Realtime, manifest, Storage en service worker.
20. Earned surprise pas zichtbaar na transactionele commit en cache-invalidatie.
21. Noindex/no-storeheaders.
22. Geen cross-user/-tenantcachelek.
23. Featureflags, tenantrollout en veilige kill switch.
24. Migrations op de lege en onmiddellijk voorafgaande migrationstate; restartable/idempotente backfill.
25. RLS op iedere exposed tabel en minimale grants.
26. Geen `service_role`, secret key of `user_metadata`-autorisatie in het clientpad; scan servercode op generieke `service_role`-queries zonder capability- en tenantscope.
27. Bij BFF: bewijs dat de browser geen raw parent access-/refresh-token en geen directe Data API-route heeft; bij browser-Supabase: bewijs dat iedere directe surface dezelfde session-ID-contextgate gebruikt.

### 19.3 E2E

- parent login en kindcontextbehoud;
- parent opent child mode voor toegestaan kind;
- parent kan niet via oude tab/URL/mutation bij parent-, trainer-, staff-, admin-, platform- of backofficedata in child mode;
- Vandaag → Mijn reis → Badges → Agenda → Ik;
- doeldeeplink en badgeviering;
- `Vraag mijn ouder` maakt uitsluitend een oudertaak;
- child kan niet annuleren/boeken/betalen/delen;
- volledige reauth terug naar parent;
- `getUser()`, tokenrefresh, reload en oude JWT worden niet als reauth geaccepteerd;
- `view_only` blijft server-side beschermd;
- publieke diplomaverificatie minimaal en zonder privédocument;
- theme switch zonder flash/statelek;
- flags uit herstellen niet stilzwijgend parentmode;
- in-flight parentresponses, open Realtime en oude mediaresponses hydrateren niet na lock/modeswitch.

### 19.4 Fixtures

Minimaal:

- 0, 1, 4, 7 en 12+ onderdelen;
- nul beoordelingen;
- volledig hoofdstuk;
- meerdere niveaus en geen tussenniveaus;
- twee gekoppelde kinderen in parent;
- exact één gebonden kind in child;
- guardian die tevens trainer/admin/platformrol heeft;
- `view_only`;
- geen volgende les;
- lange tenantnaam;
- ontbrekende asset;
- standaardbadge locked/earned;
- surprise vóór, tussen en na onderdelen;
- meerdere surprise-instances;
- swim- en algemene sportdataset.

### 19.5 Browsers

- Chromium, WebKit en Firefox voor kernflows;
- keyboard- en touchsmoke;
- reduced motion;
- axe en handmatige screenreader-/focuscontrole waar projectinfrastructuur dit ondersteunt.

---

## 20. Visuele en responsive QA

Gebruik vaste fixtures, tijd, fonts, browserbuild en DPR.

### 20.1 Canonieke routerenders

- 13 parentroutes × desktop/mobiel × 7 thema's = `182`;
- 7 childschermstates, inclusief Doeldetail en Lesdetail, × desktop/mobiel × 7 thema's = `98`;
- publieke verificatie × desktop/mobiel × 7 thema's = `14`.

Minimaal `294` canonieke routerenders.

Voeg toe:

- parentdashboard high-res desktop/mobiel × 7 = `14`;
- childdashboard high-res desktop/mobiel × 7 = `14`.

Minimaal `322` gevalideerde renders, exclusief aanvullende celebration-, empty-, error-, locked- en view-only-substates.

Maak daarnaast per thema één parentboard en één childboard: `14` complete boards.

Voeg minimaal representatieve desktop- en mobilerenders toe voor:

- alle drie `/kind/ik`-tabs;
- badge celebration en locked badges;
- geen volgende les en ontbrekende media;
- `Vraag mijn ouder` in pending-, success- en rate-limitedstate;
- reauth- en lockedstate.

### 20.2 Viewportcases

Render zowel parent- als childdashboard op alle veertien viewports uit paragraaf 12 voor alle zeven thema's: minimaal `196` dashboard-viewportcases.

Test alle 13 parent- en 7 childschermstates daarnaast minimaal op:

- `1440×900`;
- `390×844`.

### 20.3 Baseline- en diffregels

- Bestaande zes bronassets/checksums: intentionele delta nul.
- Voor thema's 1–6: bestaande parentroutes buiten Overzicht en de expliciete child-entry-, security-, accessibility- en overflowaanpassingen hebben intentioneel zichtbare delta nul.
- Voor Ocean Quest: implementeer de twaalf parentroutes buiten Overzicht tegen de overeenkomstige finale Ocean Quest-routerenders en boards; er bestaat nog geen repositorygolden voor dit zevende thema. De equal-track-/gapcorrecties uit paragraaf 12 en mascotteplaatsingscorrecties uit paragraaf 15 zijn expliciet goedgekeurde, gemaskeerde deltas.
- Parent Overzicht: alleen de in deze taak goedgekeurde compositiedelta.
- De oude Ocean Quest-overview is art-/journeyreferentie voor Child Vandaag en niet de nieuwe parentdashboardbaseline.
- Child journeycomponenten: vergelijk geometrie, materialen, focus, markers, Manta, ringen en motion met de finale Ocean Quest-bronnen.
- Een vaste baselineafwijking groter dan `2px` op shell-, header-, grid- of cardbaseline blokkeert oplevering buiten de expliciet allowlisted/gemaskerde regio's.
- Vernieuw nooit automatisch goldens om een regressie groen te maken.

Publieke diplomaverificatie gebruikt uitsluitend tenantlogo, semantische themakleur en minimale kaartmaterialen. Toon geen journey, mascotte, badgewall of private documentpreview.

---

## 21. Verboden vereenvoudigingen

De sprint is niet voltooid wanneer één van deze fouten voorkomt:

- child mode is alleen UI/routerstate;
- een geldige parent-JWT kan in child mode parentdata lezen;
- parentdata wordt geladen en alleen client-side verborgen;
- child kan een sibling/tenant wisselen of raden;
- child heeft Inbox, Betalingen, Documenten, Gezin, vrije chat of private downloads;
- child kan annuleren, boeken, betalen of extern delen;
- de parent verliest een bestaande functie;
- zeven thema's worden afzonderlijke domeinimplementaties;
- Ocean Quest is slechts aqua kleur boven hetzelfde grid;
- Quest is een statische screenshot/achtergrond;
- Manta, tekst, marker, ring of badge zit in scenery ingebakken;
- mobiel gebruikt desktop crop/rotatie;
- huidige doel is niet de duidelijke focus;
- historische hoofdstukken worden herberekend;
- onverdiende surprises lekken;
- definitieve badges worden zelf bedacht;
- child wordt infantiel met babycopy, streaks of overmatige animatie;
- 8K-bronart wordt standaard als mobiele runtimeasset geladen;
- een service/secret key verschijnt in clientcode;
- private data wordt door Next.js, CDN of service worker gecachet;
- featureflagrollback behandelt child stilzwijgend als parent;
- migrations zijn destructief of alleen tegen een lege database getest;
- Android/native wordt stilzwijgend meegesleept. Native/Android is buiten scope tenzij de repositoryaudit een expliciete reeds meegescopeerde app en instructie aantreft; breek bestaande contracten niet.

---

## 22. Definition of Done

De sprint is pas gereed wanneer:

1. Parent en child afzonderlijke server-side routes, DTO's en capabilities gebruiken.
2. Parent alle dertien functies en compatibilityroutes behoudt.
3. Child exact vijf primaire navigatie-items heeft.
4. Child mode aan één tenant, Supabase-session-ID en één child is gebonden.
5. Parentdata niet via UI, API, RLS, Storage, Realtime, cache of oude tab bereikbaar is.
6. Parentdashboard op `1280×720` past en taakgericht is.
7. Child Vandaag op `1280×720` past en premium journey-first is.
8. Mobiel Child Vandaag de header, de volledige Quest-container met het gefocuste portrait-cameravenster en de bottomnav in de eerste viewport bevat.
9. Alle zeven thema's dezelfde engine en afzonderlijke parent/child recipes gebruiken.
10. Bestaande source assets niet stil zijn vervangen.
11. Ocean Quest scenery/Manta/datalagen correct gescheiden zijn.
12. Journeyfocus, parels, bonusparels, ringen en snapshots kloppen.
13. Badge-UX volledig is maar artwork placeholder-only blijft.
14. Onverdiende surprisebadges server-side volledig afwezig zijn.
15. Child geen parentmutatie of externe share kan uitvoeren.
16. `view_only`, tenantisolatie en downloadrechten server-side beschermd blijven.
17. Reauth de enige v1-route terug naar parent is wanneer geen bestaand veilig PIN-mechanisme bestaat.
18. Featureflags default uit staan en rollback veilig is.
19. Lint, typecheck, tests, build, a11y, security en render-QA groen zijn.
20. De minimumaantallen van `322` renders en `196` dashboard-viewportcases aantoonbaar zijn gehaald.
21. Geen release-blocker uit paragraaf 23 resteert.

---

## 23. Release-blockers

De volgende PR-regel geldt alleen wanneer al een reviewbare implementatiebranch bestaat. Een Fase-0-/preflightblocker stopt vóór productiewijzigingen en vereist geen lege of betekenisloze PR.

Open bij resterend werk wel een draft PR voor review, maar markeer hem expliciet **niet mergeklaar** en laat alle rolloutflags uit wanneer:

- parentdata met devtools/directe API bereikbaar is in child mode;
- trainer-, staff-, admin-, platform- of backofficedata bereikbaar blijft in child mode;
- een onverdiende surprisebadge lekt;
- sibling- of cross-tenanttoegang mogelijk is;
- child mode niet session-ID-gebonden is;
- een ontbrekende, verlopen, locked of revoked context terugvalt naar legacy parent;
- `getUser()`, tokenrefresh, reload of een bestaande JWT als reauth wordt geaccepteerd;
- gevoelige kolommen via directe selectie op een gemengde tabel/projectie bereikbaar zijn;
- reauth/lock omzeilbaar is met cookieverwijdering, oude tab of back-button;
- een in-flight parentresponse na modeswitch kan hydrateren;
- een kill switch of cleanup contextbewijs verwijdert voordat de oude JWT onbruikbaar is;
- persoons-/childgebonden private bearer-media blijft na lock, expiry of kill switch bereikbaar;
- een bestaande Realtimeverbinding blijft na expiry, lock of kill switch gevoelige events ontvangen;
- een secret/service key in de client staat;
- private responses cachebaar zijn;
- migrations destructief/niet representatief getest zijn;
- bronassets of bestaande parentfuncties ontbreken;
- visual/responsive/securitymatrix niet aantoonbaar groen is.

Fix binnen scope iedere oplosbare fout. Meld een blocker niet als `known issue` wanneer hij binnen deze opdracht oplosbaar is.

---

## 24. Verplichte oplevering

Lever in de featurebranch en draft PR:

1. production-ready repository-implementatie;
2. data- en schema-nondestructieve migrations en rollback-/compatibiliteitsnotitie;
3. parent/child capability- en threat-modeldocumentatie;
4. bijgewerkte route- en theme matrix;
5. assetmanifest met rollen, dimensies, alpha en SHA-256;
6. screenshot-/board-/viewportoutputs volgens de projectconventie; bewaar volledige renders/boards als CI- of PR-artifacts wanneer dat de conventie is en commit alleen manifests, QA-rapport, relevante goldens en compacte previews, niet automatisch alle `322` binaire renders;
7. test- en QA-rapport;
8. rollout-/kill-switch-/rollbackdocumentatie;
9. changelog;
10. draft PR naar `staging`;
11. repositorykopie van deze v1.0-opdracht plus `SUPERSEDED`-banners op de oude opdracht en het addendum.

Gebruik logische commits. Push uitsluitend de featurebranch. Merge of deploy niet.

### Eindrapport van Codex

Geef één geconsolideerd eindrapport met:

- wat per fase is gebouwd;
- exacte route-, component-, DTO-, capability- en migrationwijzigingen;
- gekozen JWT/RLS/BFF-beveiligingsarchitectuur en waarom;
- bewijs dat directe parent-JWT-bypasses zijn geweigerd;
- bevestiging dat parentfuncties behouden zijn;
- theme-/assetchecksumresultaten;
- testcommands en resultaten;
- render- en viewportaantallen;
- accessibility- en performancecijfers;
- commits en PR-link;
- flags/rolloutstatus;
- eventuele echte blockers/risico's.

Noem het werk niet `pixel-perfect`, `veilig` of `compleet` zonder de bijbehorende meetbare QA- en securityuitvoer.
