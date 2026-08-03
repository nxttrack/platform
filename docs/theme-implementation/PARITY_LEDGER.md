# Theme pack 1.0 parity ledger

This ledger maps the supplied visual contract to the production owner. “Reference” means a screenshot/contract anchor; product data always comes from the existing server-side domain.

| Contract surface | Canonical route | Production owner | Required parity |
|---|---|---|---|
| Shared shell | all portal routes | `AppShellClient` | 22px desktop inset, 238px sidebar, 18px gap, 72px header, 86px compact sidebar, mobile header and five-item bottom navigation |
| Journey dashboard | `/portaal` | `PortalOverviewHero` + `PortalJourneyEngine` | theme scene, data-driven nodes, current detail, optional mascot, one/two canonical rings, three equal lower cards |
| Planning | `/portaal/planning` | existing planning domain page | lessons, cancellation, make-up, graduation invitation, holiday offer, seat hold and payment entry |
| Lesson detail | `/portaal/lessen/[id]` | existing lesson page | lesson facts, cancellation and read-only permissions |
| Development | `/portaal/ontwikkeling` | existing progress page | curriculum/version, 1–5 ratings or unassessed, carryover, rings, coverage and deep links |
| Badges | `/portaal/ontwikkeling/badges` | existing badge page + placeholder renderer | category containers, exactly 2/4 columns, earned/locked, hidden surprise, instance sharing and celebration |
| Media | `/portaal/ontwikkeling/media` | existing media page | private media, consent states, expiry and secure view/download |
| Diplomas | `/portaal/ontwikkeling/diplomas` | existing diploma vault | issued metadata, secure download and public verification link |
| Inbox | `/portaal/inbox` | existing communication hub | threads, announcements, notifications, reply and mark-read actions |
| Payments | `/portaal/betalingen` | existing billing page | subscriptions, attempts, invoices, credit notes, VAT, mandates, refunds and secure PDFs |
| Documents | `/portaal/documenten` | existing document page | metadata, availability and secure download |
| Feedback | `/portaal/feedback` | existing feedback page | 0–10 campaign, optional comment, consent and anti-duplicate behavior |
| Children | `/portaal/kinderen` | existing family/access page | linked children, enrollment facts and relationship/access level |
| Profile | `/portaal/profiel` | existing profile/preferences page | editable profile, communication preferences, push and unsaved-change handling |
| Diploma verification | `/diploma-verificatie/[code]` | existing public verification page | low-intensity theme treatment and no private-file disclosure |

## Theme declarations

| Theme key | Scene | Mascot | Visible development label | License gate |
|---|---|---|---|---|
| `nxttrack-default` | momentum route | none | Ontwikkeling | none |
| `dolphin-bay` | bay-to-bay | dolphin | Zwemreis | none |
| `turtle-trails` | calm-current trail | sea turtle | Zwemroute | none |
| `polar-splash` | ice-floe expedition | penguin | Poolreis | none |
| `coastal-explorer` | Dutch coast route | lifeguard | Kustreis | none |
| `nationaal-zwem-abc` | A–B–C diploma lanes | none | Zwem ABC | visible name falls back to Diplomareis A–B–C without verified permission |

## Responsive anchors

| Viewport | Shell | Content | Navigation |
|---|---|---|---|
| 1280px and wider | 22px inset, 238px sidebar, 18px gap | 12-column grid; overview closes at sidebar bottom | desktop sidebar |
| 1024–1279px | 16px inset, 86px icon sidebar | same component order and allowed grid spans | icon sidebar |
| below 1024px | no sidebar, 70px header | no nested vertical document trap; portrait journey | Overview, Planning, theme development label, Inbox, More |

## Functional invariants preserved

- Canonical assessment values remain integer `1..5 | null`.
- Progress is authoritative `rating / 5`; legacy normalized analytics retains its separate metric.
- Curriculum releases, rules and badge assets stay version-bound and immutable.
- Progress, transition, graduation review and diploma issue remain separate states.
- Surprise badges are absent before award and never represented by placeholder counts or metadata.
- All tenant data, permissions, share eligibility, secure downloads and billing operations remain server-authorized.

## Evidence gates

- Manifest/schema and source-asset checksum tests.
- Six-by-thirteen registry and native export tests.
- Route/redirect contract tests.
- Journey interaction, ring and single/multi-level tests.
- Responsive shell and badge-grid assertions.
- Typecheck, domain contract suites, production build and deployment packaging.
- Authenticated staging screenshots at desktop and mobile, followed by live health and route smoke.
