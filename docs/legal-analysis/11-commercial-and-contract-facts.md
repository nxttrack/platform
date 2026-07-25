# 11 — Commerciële en contractuele productfeiten

## SaaS-aanbod op marketingpagina

De prijskaart toont drie redactionele labels:

| Label | Marketingfeatures | Prijs/status |
|---|---|---|
| Start | Ouderportaal, trainer app, basisplanning, voortgang, badges, e-mailsupport | `Op aanvraag`; prijsvalidatie volgt vóór commerciële livegang |
| Groei | Start + wachtrijbeheer, diplomakluis, communicatiehub, websitemodules, rapportages, rollen/rechten | `Op aanvraag`; “Meest gekozen” |
| Pro | Multi-location, geavanceerde planning, custom rollen, audit-log, priority support, integraties op roadmap, custom onboarding | `Op aanvraag` |

`OBSERVED` als redactionele content `[E061]`

Er is geen SaaS-plan-/entitlementtabel of runtimegate gevonden die Start/Groei/Pro afdwingt. Geen
NXTTRACK-klantfacturering, trial, automatische renewal, upgrade/downgrade of SaaS-refundlogica is
aangetroffen. De marketingfeatures zijn daarom geen technisch of contractueel bewezen pakket.

## Twee verschillende billinglagen

### Aangetroffen

Tenantzwemscholen kunnen ouder-/leerlingbetaalplannen en subscriptions maken met maand/kwartaal/jaar/
eenmalig/manual, betalingen/facturen/statussen beheren en optioneel Mollie configureren. `[E035]`,
`[E036]`

### Niet aangetroffen

Die laag factureert zwemschool→ouder en is geen bewijs voor DG Webservices/NXTTRACK→zwemschool
SaaS-abonnementen. Voor het commerciële NXTTRACK-contract zijn prijs, BTW, factuurcyclus,
betalingstermijn, renewal, minimumduur, opzegging, opschorting, upgrade/downgrade en refund
`OWNER DECISION REQUIRED`.

## Productclaims versus runtime

| Claim/onderdeel | Repositoryfeit | Classificatie |
|---|---|---|
| Ouderportaal/trainer/backoffice | Uitgebreide actieve routes en dataflows | `OBSERVED` |
| Rollen en rechten | Vaste rollen/RLS; geen custom rollenbouwer | Basis actief; “custom rollen” `PLANNED` |
| Audit-log | Meerdere procesaudits, niet centraal/immutable/compleet | `PARTIAL` `[E086]` |
| White-label | Brandingconfig/UI en custom-domainrecords | Config actief, publieke/portal/e-mail/PWA-consumptie grotendeels niet gevonden `[E062]` |
| Custom domain | Resolver/schema/onboarding ondersteunen record | `CONFLICT`: custom-domainhost zet geen tenant-slug in proxy; end-to-end werking niet bewezen `[E091]` |
| PWA/mobiel | Installable manifest/static SW | Actief beperkt; geen native app, push of offline writes `[E079]` |
| Automation builder | Rule CRUD/status | Executor niet gevonden; uitvoering `PLANNED` `[E040]` |
| Smart placement | Deterministisch advies + menselijke goedkeuring | Actief advisory, niet autonome AI `[E066]` |
| CRM | Leadattributie/conversierapport en optionele GA4 | Analytics actief; salespipeline/owner/follow-up/lost reason `PLANNED` `[E092]` |
| Media excellence | Consenttabel | Mediaflow/consentgate `PLANNED` |
| Mollie/iDEAL/incasso | Uitgebreide config-afhankelijke providercode | Runtimecode actief; productie-merchant/config/live validation `UNKNOWN` |
| Integraties | Supabase, mail, Mollie, GA, monitoring | “Integraties op roadmap” blijft open voor overige partijen |

## Demo, contact en publiciteit

- Demo/contact opent een `mailto:` naar `hello@nxttrack.nl`; er is geen CRM-record of serverbevestiging.
- Democopy belooft “binnen één werkdag reactie” en “zonder verplichtingen”.
- Marketing noemt e-mailsupport en priority support, maar supporturen, kanalen, response-/resolution
  times en escalatie zijn niet contractueel/technisch vastgelegd.
- Hardcoded trustlogo-/klantachtige namen en demostats zijn niet bewezen echte klanten of metrics.
  Toestemming/licentie/fictieve status moet vóór openbare commerciële inzet worden bevestigd.
- De globale metadata zet `robots.index=false, follow=false`, dus ook marketing is momenteel noindex.

`OBSERVED` `[E061]`, `[E063]`, `[E093]`

## Operationele contracteindeflow

Een platformadmin kan een tenant onboarden. Offboarding ondersteunt export, schorsing, 30–365 dagen
retentie, ownerapproval en tenantdelete. Dit is productfunctionaliteit, geen contractuele toezegging;
export/delete heeft aantoonbare dekkingsgaten. `[E038]`, `[E070]`

Te beslissen:

- opzegtermijn en einddatum;
- read-only/opschortingsfase;
- exportformaten, wie ontvangt en wanneer;
- kosten/assistentie;
- retentie/early deletion/legal hold;
- back-upuitloop en shared accounts;
- externe providerexit;
- herstelbaarheid na sluiting.

## Technische limieten versus commerciële quota

Aangetroffen technische grenzen:

- Storageobject maximaal 20 MB en specifieke MIME-types;
- CSV maximaal 2 MB en 5.000 rijen per job;
- intake maximaal 5 requests per 15 minuten per fingerprint/tenant;
- interne billing batch maximaal 25 in een run;
- Journey Bot budgets;
- enkele planning/capacityvelden.

Deze zijn geen commercieel fair-use-, opslag-, user-, locatie-, e-mail- of API-quotum. Geen
planhandhaving of usagebilling is gevonden.

## Niet in repository gevonden

`OWNER DECISION REQUIRED` voor:

- juridische entiteit, handelsgegevens, contact-/privacyadres;
- algemene voorwaarden, gebruikersvoorwaarden, DPA/verwerkersbijlage en security annex;
- SLA/uptime/service credits, maintenance windows, beta-definitie;
- supportscope, tijden, prioriteiten en escalatie;
- trial, prijs, korting, belastingen, facturatie, renewal, minimumtermijn en opzegging;
- wanbetaling, opschorting, beëindiging, refunds en heractivatie van de SaaS-klant;
- fair use, users/locaties/storage/e-mail/API-limieten;
- licentie op software en klantcontent, intellectueel eigendom en feedback;
- white-label/custom-domainverantwoordelijkheden en klantcontentmoderatie;
- toestemming voor klantnaam/logo/case study;
- wijzigingsprocedure product/voorwaarden/prijzen;
- subverwerkerswijziging en bezwaar-/exitprocedure;
- aansprakelijkheid, vrijwaring, verzekering, overmacht, toepasselijk recht en geschillen.

Er is geen `LICENSE`, `COPYING` of `NOTICE` met klantgerichte licentievoorwaarden aangetroffen.
