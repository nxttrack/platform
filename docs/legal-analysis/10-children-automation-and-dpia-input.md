# 10 — Minderjarigen, automatisering en DPIA-input

Dit is geen formele DPIA en geen oordeel dat een DPIA wel of niet verplicht is.

## Minderjarigen: technische feiten

- Intake vraagt volledige geboortedatum, naam, zwemervaring en planningvoorkeuren van het kind plus
  contactgegevens van maximaal twee verzorgers. `[E026]`
- Het blijvende kinddossier bevat inschrijving, groep/rooster, aanwezigheid, annuleringen, voortgang,
  notities, scores, badges, readiness, examenresultaat, diploma, betalingen en documenten. `[E025]`,
  `[E031]`, `[E032]`, `[E035]`
- Een instructor kan interne of ouderzichtbare notities en scores vastleggen. Tenantstaff en bepaalde
  platformrollen hebben breder bereik. `[E031]`, `[E022]`
- Meerdere guardians zijn technisch mogelijk, maar gezag wordt niet geverifieerd en `view_only` is niet
  als mutatiebeperking afgedwongen. `[E046]`, `[E047]`
- Geen kindminimumleeftijd, leeftijdsafhankelijke account-/consentflow, child-friendly privacytekst of
  rechtenworkflow is gevonden.
- Foto/video-consentschema bestaat, maar geen operationele media-/consentflow. `[E039]`

## Geautomatiseerde processen

| Proces | Input | Output/gevolg | Menselijke stap/override | Logging | Echte of synthetische data | Status |
|---|---|---|---|---|---|---|
| Publieke top-3 intakeaanbeveling | Zwemervaring, voorkeursdagen/dagdelen, niveaus, slots, kwalitatieve wait band | Maximaal drie tijd-/niveauopties met rank/reasons; ouder kiest | Ouder kiest; staff moet later converteren/plaatsen | Snapshot, versie en redenen in intake | Echt bij live intake | `OBSERVED` advies `[E066]` |
| Wait-bandberekening | Groepscapaciteit + actieve memberships/wachtlijstdruk | `short`, `medium`, `long`; geen publiek aantal | Staff beheert groep/capaciteit | Geselecteerde band/snapshot | Echt | `OBSERVED` `[E029]` |
| Backoffice placement score | Beschikbare capaciteit, niveau-match, dagvoorkeur | Scores/redenen per groep | Staff start scoring, kiest groep en verstuurt aanbod | `placement_scores` + audit event | Echt | `OBSERVED` advies `[E029]` |
| Dedupe/rate-limit intake | E-mail, genormaliseerde kindnaam, programma/optie; IP+UA hash | Existing reference, possible duplicate of busy response | Staff kan duplicate bevestigen/dismissen | Dedupe state + event | Echt | `OBSERVED` `[E027]` |
| Aanbodacceptatie | Bearer token, offer/group capacity/status | Participant, enrollment, membership en guardianlink | Ouder klikt; staff maakte aanbod | Offer/audit/status | Echt | `OBSERVED` met operationele gevolgen `[E067]` |
| Lescredit | Annuleringstijd t.o.v. tenantcutoff | Eligible/late en eventueel credit met expiry | Ouder initieert; staff kan beheer uitvoeren | Cancellation/credit rows | Echt | `OBSERVED` `[E064]` |
| Diplomacertificaat | Menselijk ingevoerd readiness/eventresultaat `passed` | Certificaatrecord/notificatie | Instructeur/staff beoordeelt en registreert; geen AI | Graduation/certificate/notificatie | Echt | `OBSERVED` en menselijk gestuurd `[E032]` |
| Mollie checkout/incasso | Abonnement, bedrag, providerconfig, mandate, prenotice, flags | Providerpayment en lokale status; retries/refunds/chargebacks mogelijk | Tenant configureert; ouder mandate/first payment; admin refund; automatische incasso kan gevolgen hebben | Uitgebreide provider/billingevents/idempotency | Echt indien provider live | `OBSERVED` en configuratie-afhankelijk `[E036]` |
| Automation builder | Regel event/action/config/status | Alleen regelconfig; geen aangetroffen executor/run | Admin kan status wijzigen | `automation_rules`; runmodel ongebruikt | Potentieel echt | `CONFLICT` tussen UI/schema en ontbrekende executor `[E040]` |
| Journey Bot | Synthetisch profiel, scenario, programma/rooster, randomseed | Volledige geautomatiseerde intake→diploma A/B/C testjourney en issues | Platformtestoperator start/stop/reset | Run/child/events/issues + producttestmarkers | Synthetisch | `OBSERVED` met test-only intent `[E041]` |

## Uitlegbaarheid en correctie

- Intake- en placementalgoritmen zijn lokale vaste formules, geen machinelearning. Ze bewaren
  reasons en tonen kwalitatieve uitleg.
- Zwemervaring wordt naar een relatieve stagepositie gemapt. Leeftijd is beschikbaar als DOB en
  programma’s hebben min/maxleeftijd, maar live recommendation/placement score gebruikt leeftijd niet.
  Dit conflicteert met eventuele claim “op basis van leeftijd”. `[E090]`
- De publieke formule weegt stage, wachttijd en voorkeur; de staffformule weegt capaciteit,
  stage-match en dag-match. Uitkomst is advies totdat een mens een aanbod kiest.
- Handmatige correctie bestaat door andere groep te kiezen, duplicate te dismissen, status te
  muteren of dossiergegevens aan te passen; er is geen formele bezwaar-/algorithm reviewcase.
- Geen externe AI-API, LLM, generatieve AI, biometrische scoring of risicomodel gevonden. `[E060]`

## Journey Bot-grens

- Schema/comment en seed presenteren de bot als staging-only; `.test`-mail, `is_test`, suppression van
  notificaties/betalingen, budgets en locks beperken risico.
- Schema/runtime staat echter `environment=production` toe wanneer
  `ALLOW_JOURNEY_BOT_IN_PRODUCTION=true`. De default is false, maar actuele productionwaarde is zonder
  externe inspectie `UNKNOWN`. `CONFLICT` `[E069]`
- Cleanup soft-archiveert testdomeinrecords en verwijdert de gemaakte Authuser/profiel/securityrow niet.
- Realistisch ogende synthetische namen/adressen/telefoons mogen niet als echte betrokkenen worden
  geïnterpreteerd, maar vereisen wel testdataretentie en duidelijke scheiding.

## DPIA-/hoogrisicosignalen

| Signaal | Technisch bewijs | Onzekerheid/mitigatie-input | Indicatie |
|---|---|---|---|
| Structurele verwerking minderjarigen | Volledige journey van intake tot diploma/billing | Omvang, leeftijden, aantallen tenants en doelen extern vaststellen | Hoog |
| Ontwikkelings-/prestatiemonitoring | Attendance, scores 1–5, notities, badges, readiness 0–100 | Definieer zichtbaarheid, instructies, correctie en termijn | Hoog |
| Profilering/aanbeveling | Deterministische stage/wait/preference score en snapshot | Geen AI; wel transparantie, fairness en menselijke review vastleggen | Middel/hoog |
| Financiële koppeling aan kind | Subscription/payment/factuur/providerdata verwijzen naar participant/guardian | Minimaliseer kind-ID in provider metadata; termijnen/rollen bepalen | Middel/hoog |
| Vrije tekst/bestanden | Intake, notes, events, providerpayload, CSV en Storage | Categoriebeleid, DLP/scan, training en retentie ontbreken | Hoog |
| Meerdere guardians/gezag | Multi-guardianmodel zonder verificatie/conflictflow | Proces voor bewijs, toegang, blokkade en intrekking nodig | Hoog |
| Brede interne toegang | Tenantstaff adminbreed; support deels platform-/tenantbreed | Least privilege, JIT, accesslog en reviews | Hoog |
| Internationale leveranciers | Supabase, SendGrid, Mollie, Google, GitHub, VPS/webhook | Landen, DPA, SCC en subleveranciers onbekend | Onbekend/hoog informatiegat |
| Langdurige/onbegrensde bewaring | Vrijwel geen categoriecleanup | Retentieschema + uitvoerbare jobs nodig | Hoog |
| Foto/video | Consentmodel en generieke imageuploads, geen specifieke actieve child-mediaflow | Eerst consentgate, purpose/version, verwijdering en scan bouwen | Gepland risico |
| Test in productie | Journey runtime override bestaat | Productionflag hard uitsluiten en monitoren | Hoog technisch conflict |
| Cross-tenant deling | RLS/FKs/tests bestaan; service-role passeert RLS | Volledige serveraction/API-audit en live role tests uitbreiden | Middel/hoog |
| Openbare publicatie | Tenant site publiceert geen kinddossier; public intake schrijft server-side | Custom form/free content en toekomstige media bewaken | Momenteel beperkt |
| AI | Geen actieve AI-dependency/API | Toekomstige wijziging als nieuwe DPIA-trigger behandelen | Niet aangetroffen |

## Benodigde eigenaarinput voor een DPIA-noodzaaktoets

1. Werkelijke aantallen kinderen, leeftijdsbereik, tenants, records en jaarlijkse intakes.
2. Doelen en noodzaak per DOB-, progress-, note-, attendance-, diploma- en billingveld.
3. Verwachte schade bij onjuiste plaatsing, disclosure, guardianconflict of verlies.
4. Feitelijke providerlanden/transfers en toegang door support/hosting.
5. Termijnen, toegangsmatrix, training en toetsing van instructorvrije tekst.
6. Klacht-/bezwaar-/correctieroute voor ouders en passende informatie voor kinderen.
7. Besluit of media, production Journey Bot, automation executor of nieuwe AI vóór launch actief mag zijn.
