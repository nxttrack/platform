# Parent-/kinderportaal — route- en themematrix

## Parent: dertien behouden functies

| ID | Route | Functie-eigenaar |
|---|---|---|
| overview | `/portaal` | Volgende activiteit, compacte progressie en taken/updates/berichten. |
| planning | `/portaal/planning` | Planning, afmelden, inhalen, aanbod en eindmomentreactie. |
| lesson-detail | `/portaal/lessen/[id]` | Volledige ouderlescontext en toegestane commands. |
| development | `/portaal/ontwikkeling` | Journey, historie en oudercontext. |
| badges | `/portaal/ontwikkeling/badges` | Badgewall, detail, viering en toegestane share. |
| media | `/portaal/ontwikkeling/media` | Private originelen/downloads, consent en childgoedkeuring. |
| diplomas | `/portaal/ontwikkeling/diplomas` | Private diplomakluis en downloads. |
| inbox | `/portaal/inbox` | Gesprekken, mededelingen, meldingen en childrequests. |
| payments | `/portaal/betalingen` | Bestaande betaal-/factuurfunctionaliteit. |
| documents | `/portaal/documenten` | Ouderdownloads. |
| feedback | `/portaal/feedback` | Campagnes en reacties. |
| children | `/portaal/kinderen` | Family links, toegang en veilige child-entry. |
| profile | `/portaal/profiel` | Contact-, communicatie- en securityvoorkeuren. |

Compatibility blijft bestaan voor `/portaal/lessen`, `/voortgang`, `/badges`, `/media`, `/diplomas`, `/berichten` en `/afzwemmen`. Publieke `/diploma-verificatie/[code]` toont geen private documentlink.

## Child: vijf navigatie-items en zeven canonieke schermstates

| Navigatie | State | Route | Alleen child-safe |
|---|---|---|---|
| Vandaag | today | `/kind` | Quest, volgende activiteit, compliment, laatste mijlpaal. |
| Mijn reis | journey | `/kind/reis` | Huidige etappe, doelen, hoofdstuksnapshots en ringen. |
| Mijn reis | goal-detail | `/kind/reis?onderdeel=<stable-key>` | Positieve voortgang, expliciet child-visible tip en goedgekeurde video. |
| Badges | badges | `/kind/badges` | Placeholderbadgewall, detail en in-app viering; geen share. |
| Agenda | agenda | `/kind/agenda` | Read-only activiteiten en semantische resources. |
| Agenda | lesson-detail | `/kind/agenda/lessen/[id]` | Tijd, locatie, trainer, benodigdheden en gestructureerd ouderverzoek. |
| Ik | profile-prijzenkast | `/kind/ik?tab=prijzenkast` | Veilige diploma-/mijlpaalmetadata. |
| Ik | profile-momenten | `/kind/ik?tab=momenten` | Alleen expliciet goedgekeurde inline webmedia. |
| Ik | profile-instellingen | `/kind/ik?tab=instellingen` | Thema-/accessibilityvoorkeuren, ouderportaalverzoek en reauth-exit. |

Child heeft exact vijf primaire bestemmingen: Vandaag, Mijn reis, Badges, Agenda en Ik. Er is geen sibling-/tenantselector.

## Zeven themes, één registry

| Theme-ID | Release | Parent recipe | Child recipe | Mascotte |
|---|---:|---|---|---|
| `nxttrack-default` | 3.0.0 | subtiel/neutraal | premium sportneutraal | geen |
| `dolphin-bay` | 3.0.0 | subtiele golfaccenten | volledige journey | dolfijn |
| `turtle-trails` | 3.0.0 | subtiele aqua-/groenaccenten | volledige journey | schildpad |
| `polar-splash` | 3.0.0 | ijsblauwe accenten | volledige journey | pinguïn |
| `coastal-explorer` | 3.0.0 | rustige navy-/kustaccenten | volledige journey | strandwachter |
| `nationaal-zwem-abc` | 3.0.0 | gelicenseerde A/B/C-accenten | A/B/C-vormritme | geen |
| `ocean-quest` | 3.0.0 | aqua/navy en compacte scene | premium onderwaterreis | Manta |

Theme recipes bevatten geen assessment-, tenant- of domeindatalogica. Terminologie komt uit tenantsector/programmacontext. Badge-art blijft overal `neutral-artwork-placeholders`.

## Visueel contract

Het E2E-harnas encodeert exact:

- 7 themes × (13 parentroutes × 2 + 7 childstates × 2 + publieke verificatie × 2 + twee high-res dashboards × 2) = 322 renders;
- 7 themes × 14 viewports × parent/child = 196 dashboardcases;
- 7 parentboards en 7 childboards als PR/CI-artifact.

Los van deze tellers bewaart de harness per thema representatieve renders voor alle drie profieltabs, badge celebration/locked, ouderverzoek success/rate-limit/error, reduced motion en de parent-reauthgrens. No-next-lesson, ontbrekende media en view-only blijven onderdeel van de vereiste vaste stagingfixtures.

De daadwerkelijke uitvoering vereist de stagingfixtures uit het QA-rapport.
