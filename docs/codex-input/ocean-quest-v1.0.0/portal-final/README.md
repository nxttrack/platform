# NXTTRACK Ocean Quest — definitief ouderportaal

Deze map bevat een klikbaar, responsive visual prototype en alle definitieve desktop- en mobiele schermexports.

## Openen

Open `index.html` in een browser. Gebruik `?screen=` om een scherm rechtstreeks te openen:

| Scherm | Prototype-state | Canonieke productroute |
|---|---|---|
| Overzicht | `overview` | `/portaal` |
| Planning | `planning` | `/portaal/planning` |
| Lesdetail | `lesson` | `/portaal/lessen/[id]` |
| Ontwikkeling | `development` | `/portaal/ontwikkeling` |
| Badges | `badges` | `/portaal/ontwikkeling/badges` |
| Media | `media` | `/portaal/ontwikkeling/media` |
| Diploma’s | `diplomas` | `/portaal/ontwikkeling/diplomas` |
| Inbox | `inbox` | `/portaal/inbox` |
| Betalingen | `payments` | `/portaal/betalingen` |
| Documenten | `documents` | `/portaal/documenten` |
| Feedback | `feedback` | `/portaal/feedback` |
| Gezin en toegang | `children` | `/portaal/kinderen` |
| Profiel en meer | `profile` | `/portaal/profiel` |

Voorbeeld: `index.html?screen=development`.

## Bestanden

- `index.html`: klikbaar responsive prototype zonder externe dependencies.
- `DESIGN_CANON.md`: definitieve visuele, responsive en functionele ontwerpregels.
- `screens/desktop`: 13 exports op 3840×2160.
- `screens/mobile`: 13 exports op 1170×2532.
- `boards`: complete desktop- en mobiele overzichtsborden.
- `assets`: versioneerbare Ocean Quest-artworklagen.
- `render.js` en `render-boards.js`: reproduceerbare Playwright-exports.

Het prototype is een visuele productspecificatie. Productiedata, serveracties, rechten, beveiligde downloads en transactionele controles blijven onderdeel van de bestaande applicatiearchitectuur.
