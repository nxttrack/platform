# 06 — Cookies, browseropslag, PWA en tracking

## Technisch register

| Naam/sleutel | Maker/domein | Inhoud en doel | Levensduur/plaatsing | First/third party; noodzakelijk | Verwijderen | Omgeving | Status/bewijs |
|---|---|---|---|---|---|---|---|
| Supabase Auth-cookie(s), exacte naam runtime-afhankelijk | `@supabase/ssr`; huidige applicatiehost | Authsessie/refreshmateriaal; proxy leest, refresht en schrijft SDK-cookies | SDK/runtime defaults; alleen bij Authflow | First-party; noodzakelijk voor login | Supabase sign-out/browser; app heeft geen logoutflow gevonden | alle geconfigureerde envs | `OBSERVED`, metadata `UNKNOWN` `[E049]` |
| `_ga` en `_ga_*` | Google-tag; huidige host/property | GA client-/sessieherkenning voor analytics | Google-controlled; pas nadat code GA bij grant laadt | Third-party maker/first-party cookiecontext; optioneel | App zet Max-Age 0 op host en `.hostname` bij deny | publiek met meet-ID | `OBSERVED` `[E052]` |
| `localStorage:nxttrack.analytics-consent.v1` | NXTTRACK; browserorigin | `granted` of `denied` | Geen code-expiry; bij keuze, vóór GA-load | First-party; voorkeur/noodzakelijk voor consentkeuze | Overschrijven via cookievoorkeur; browserstorage wissen | publieke marketing/tenant | `OBSERVED` `[E052]` |
| `sessionStorage:nxttrack.first-touch-attribution.v1` | NXTTRACK; browserorigin | Genormaliseerde source/medium/campaign/content/term, referrerhost, path, channel, ad-clickboolean, timestamp | Browsersessie; alleen persistent na grant; anders alleen JS-memory | First-party; optional opslag, maar daadwerkelijke intake slaat attributie in DB ongeacht GA-keuze | Browsersessie/browserclear; revoke wist dit niet | publieke marketing/tenant | `CONFLICT` `[E052]` |
| `sessionStorage:nxttrack.ga-lead-sent.<reference>` | NXTTRACK; browserorigin | Boolean dedupe voor GA `generate_lead` bij intake-success | Browsersessie; na successpagina en grant | First-party; optioneel analytics | Browsersessie/browserclear | publieke tenantsite | `OBSERVED` `[E052]` |
| `localStorage:nxttrack.views.<storageKey>` | NXTTRACK; browserorigin | Saved view-naam, sorting, filters, kolomzichtbaarheid; filter kan kindnaam bevatten | Geen expiry; bij admin saved view | First-party; functionele voorkeur, niet loginnoodzakelijk | Browserclear; geen aangetroffen delete UI | authenticated admin | `OBSERVED` `[E053]` |
| Cache Storage `nxttrack-static-v1` | NXTTRACK-serviceworker; origin | Lokaal logo en same-origin `/_next/static/*` | Geen tijd-expiry; oude andere cachenamen bij activate verwijderd | First-party; PWA/performance | Serviceworker/cache verwijderen; nieuwe SW activate | production-builds | `OBSERVED` `[E010]` |
| In-memory first-touch | NXTTRACK JavaScript | Zelfde attribution snapshot | Alleen huidige paginalifecycle, ook vóór/zonder consent | Geen persistente storage | Navigatie/reload | publiek | `OBSERVED` `[E028]` |

## Extern script en events

`https://www.googletagmanager.com/gtag/js?id=G-…` wordt dynamisch ingevoegd nadat:

1. een geldig platform- of tenantmeet-ID bestaat; en
2. `nxttrack.analytics-consent.v1` `granted` is.

De code zet alle consentcategorieën default denied, adsdataredaction aan en alleen
`analytics_storage` na grant op granted. Expliciete events:

- `page_view`: origin + pathname zonder query, pathname, documenttitel en afgeleid acquisitiekanaal;
- `generate_lead`: alleen `lead_type=public_intake`.

`OBSERVED` `[E056]`. Google-side automatische collectie, cookies, IP-/devicebehandeling, propertyretentie
en cross-domainconfig zijn `UNKNOWN`.

## URL- en queryparameterregister

| Parameter/patroon | Gebruik | Persoons-/securityrelevantie | Status |
|---|---|---|---|
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` | First-touch en intakeattributie | Wordt gesanitized; waarden met e-mail/telefoonpatroon worden geweigerd, maar campagnevelden kunnen indirect identificerend zijn | `OBSERVED` `[E028]` |
| `gclid`, `dclid`, `wbraid`, `gbraid`, `msclkid` | Kanaalclassificatie | Alleen aanwezigheid als boolean; waarde niet opgeslagen | `OBSERVED` `[E028]` |
| `/intake?ontvangen=1&referentie=<8 tekens>` | Successstate en GA lead-dedupe | Referentie is korte intake-ID-prefix en kan binnen NXTTRACK koppelbaar zijn; URL kan in historie/logs staan | `OBSERVED` `[E052]` |
| Wachtwoordreset-URL met `email=` | Resetformulier vooraf invullen | E-mailadres staat in URL/browserhistorie/referrercontext | `OBSERVED` risico `[E078]` |
| Plaatsingsaanbod-token in URL | Ouder accepteert/weigert zonder login | Bearer secret staat plaintext in e-maillink; adminredirect nestelt de volledige link in query | `OBSERVED` risico `[E067]` |
| Mollie checkout/return URLs | Providercheckout en terugkeer | Provider/sessionlink en statuscontext; exacte providerquery door Mollie bepaald | `OBSERVED` `[E036]` |
| `next=` | Veilige relatieve post-loginredirect | Pad, geen formdata; sanitizer beperkt externe redirect | `OBSERVED` `[E045]` |

## PWA

- Manifest: naam NXTTRACK, `standalone`, start `/`, lokale SVG-icon en categorieën education/sports/
  productivity. `[E010]`
- Registratie: alleen wanneer `NODE_ENV=production`, maar globaal voor iedere build; tenantsetting
  `pwa_enabled` gate de registratie niet. `[E009]`, `[E010]`
- Serviceworker: geen navigatie, API-response of request met Authorization wordt gecachet.
- Geen Background Sync, offline mutatiequeue, IndexedDB, PushManager, Notification API of
  pushsubscriptiontabel aangetroffen. De UI-tekst dat wijzigingen wachten op verbinding is daarom
  sterker dan de code en vormt een `CONFLICT`. `[E079]`

## Niet aangetroffen

- Geen expliciete CSRF-cookie/token in appcode; framework-/Supabasegedrag moet apart worden bevestigd.
- Geen marketingpixels behalve GA4, fingerprinting-SDK, device-ID, embedded iframe, externe font/CDN,
  geolocatie-, camera-, microfoon-, WebSocket- of EventSourcegebruik.
- Geen analyticscomponent in authenticated portal-layouts.

## Open verificaties

1. Inspecteer in een deployed browser de exacte Supabase-cookie(s), domein, pad, expiry, SameSite,
   Secure en HttpOnly.
2. Verifieer alle door GA geplaatste cookies vóór/na grant/revoke en parent-domainvarianten.
3. Bepaal bewaartermijn en grondslag voor first-party leadattributie los van GA-consent.
4. Scope saved views aan gebruiker én tenant, maak wissen mogelijk en voorkom persistente PII-filters.
5. Verwijder e-mail/bearer secrets uit URLs waar mogelijk en stel referrer/cacheheaders expliciet in.
