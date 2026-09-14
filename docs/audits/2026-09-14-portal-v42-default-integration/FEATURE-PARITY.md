# Feature parity — implementation inventory (verification in progress)
## Wat “V4.2 volledig integreren” betekent
Niet alleen de zes achtergronden. Alle bestaande V4.2-routefamilies, pop-ups en werkende acties hebben een equivalent op de echte applicatieroutes. De domeinautoriteit is de repo; geen demo-opslag achter een mooi frontend.

| V4.2 functie | Bestaande repo-ingang / te onderzoeken autoriteit | Acceptatie |
|---|---|---|
| Ouder Home | `(portaal)/portaal/page.tsx`, getParentPortalData, getJourneyForEnrollment | Volledige scène tussen header/dock; juiste kind/context; updates/praktisch bereikbaar. |
| Ontwikkeling | ontwikkeling/parent-development-page.tsx | Onderdelen, historie en mijlpalen zijn onderscheidend van Home; zoeken/filter/sort/leesdetails. |
| Historische werelden | canonical chapterSnapshots/itemCompletions | Snapshot/release blijft bewaard; geen huidige scores als vroeger bewijs. |
| Planning/lesdetail | planning/parent-planning-page.tsx, lessen/[id]/page.tsx, parent-portal-actions | Afmelden, policy, credits, inhaalvraag/boeking en capaciteit volgen echte services. |
| Tijdelijk/vakantie/turbo | bestaande planning/temporary offering services en ouderacties | Reservering/betaling/annulering blijven servergestuurd; geen fictieve capaciteit. |
| Afzwemuitnodiging/diploma | graduation service, bestaande uitnodiging/bevestiging/certificate | Preview/review/goedkeuring/uitvoering gescheiden; nooit automatische afgifte. |
| Inbox | inbox/parent-inbox-page.tsx, communication-hub(-actions) | Thread, juiste deelnemer, antwoorden/archiveren, concept bewaren, onderdeel-/lescontext. |
| Betalen | betalingen/page.tsx, billing-actions, payment sessions, webhooks | Werkelijke providerstatus; geen knop “betaald” buiten geïsoleerde demo. |
| Media | ontwikkeling/media, participant-media services, private-file routes | Alleen gepubliceerde/toegestane media; signed/private toegang; kind-aparte DTO. |
| Badges/collectie | ontwikkeling/badges, badge-system/engine, child badges | Prestatiebadge apart van speelse vondst; opgeslagen collectie raakt score niet. |
| Documenten | documenten/page.tsx, private document routes | Rechten/versies/downloads; geen publiek document uit private opslag maken. |
| Feedback | feedback/page.tsx, feedback-actions | echte validatie en opslag; fouten/lege toestanden eerlijk. |
| Gezin | kinderen/page.tsx, parent accessLinks/mutableParticipantIds | Alle-kinderen en individuele context; ongeldige kindquery lekt niet. |
| Profiel | profiel/page.tsx, bestaande voorkeur-/accountacties | Alleen toegestane velden; transient UI niet mengen met server truth. |
| Kind Home/reis/agenda/badges/ik | `(child)/kind/*`, getChildPortalData | ChildSafe projectie en child sessie; geen ouderinbox/finance/interne notities. |
| Instructeurketen | instructor/student/[id], instructor-actions, swim-operations | Scoreconcept→review→opslaan; bericht/compliment afzonderlijk publiceren. |
| Themabibliotheek | `/platform/themes`, portal-theme-control | Concept/import/preview/publicatie/toewijzing/rollback duurzaam en bevoegd. |
| Demopresentatie/feedback | nieuwe afgeschermde preview-/testharnesscontext | Geen publieke demo-rolswitch op echte accounts; feedback geen geheime payloads. |

Bestaan en semantiek van iedere service moeten bij uitvoering volledig worden gelezen; bovenstaande is een routeringskaart en geen belofte dat elk nieuw UI-detail al een kant-en-klare serveractie heeft.

## Data-adapters
Gebruik één engine-VM uit twee expliciete projecties: parent en child. De engine ontvangt alleen semantische waarden en veilige presentatie, niet een volledige Supabase-rowdump. Houd item.id, identity_id, stable_key, curriculumversion,stageid en worldid gescheiden. Verwijzingen in berichten wijzen naar geautoriseerde echte objecten, niet naar displaynamen.

Canonieke ringen komen uit `swim_progress_v3`-projecties; coverage en progress blijven gescheiden. De prototypeformule `(stage-1)*100/5 + ...` wordt verwijderd. Onbekende voortgang toont onbekend, niet0 of een verzonnen percentage. Volg mastery_threshold en canonieke completion events; `rating===5` mag niet als nieuwe universele serverregel worden ingevoerd.

Tijdlijn: historisch behaalde volgorde via completion_sequence, anders bronhistorie met provenance `legacy_inferred`; stabiele tie-break op bestaande sleutel. Correcties verwijderen geen auditspoor en mogen de route niet willekeurig herschikken. Open onderdelen zichtbaar, huidige selectie is geen onderwijsopdracht. Gebruik de bestaande orderJourneyNodes/buildJourneyTimeline-contracten als uitgangspunt.

## Mutaties
- Een score is eerst concept. Concurrencycontrole voorkomt stil overschrijven van een nieuwere beoordeling.
- Review toont het verschil; finalize gebruikt de bestaande action/RPC. Een fout laat concept/scroll intact.
- Interne notitie blijft buiten parent/childprojecties. Een handmatig gedeelde ouderupdate gebruikt de bestaande communicatie-/outboxlaag.
- Geen automatische e-mail of kindcompliment bij score-save. Child-compliment expliciet; bronvisibility serverzijdig.
- Revalidatie/refresh past parent en child aan zonder context-/camerareset. Bij actieve sessies kan beperkte refresh/subscription worden hergebruikt; niet een tweede realtimeframework invoeren.
- Actions behouden idempotency/transactionele capaciteit/credit-/billing-regels. Geen browserbedragen of collection events als autoriteit.

## Pop-upcanon
Eén portal-scoped dialogchrome op bestaande Radix-primitives. Title/description, focus trap, herstel naar trigger, Escape, gesloten-state/focus, scrollbaar midden en bereikbare actiebalk. Geen `document.querySelector`-globale rebuilds uit de demo overnemen. Berichtenconcepten worden per gebruiker/tenant/thread opgeslagen met expliciete privacy/retentie; geen ongecontroleerde globale localStorage van gevoelige inhoud. Bij reload test daadwerkelijk wat bewaard blijft.

Onderdeelkaarten kunnen een compacte geïntegreerde sheet blijven in de journey. Achterliggende geselecteerde parel blijft bereikbaar. Geneste confirm gaat terug met behoud van formulierinvoer. Onopgeslagen niet-autosaved wijzigingen vragen confirm; success alleen na geslaagde serveractie.

## UI-afwerking
V4.2 is de layoutreferentie, niet de letterlijke globale CSS. Gebruik portal-scoping en gedeelde tokens. Zelfde rijhoogte vóór/na score, verticale centrering met tekst links, actions rechts, consistente loading/empty/errorstates. Geen Ocean/Golfslag-schoolscores of teksten als generieke Defaultcopy. Behoud het huidige onderscheid Home vs Ontwikkeling ook wanneer supportheroassets beschikbaar zijn.
