# 02 — Betrokkenen en gegevenscatalogus

## Categorieën betrokkenen

| Categorie | Relatie tot product | Aantoonbare gegevens | Status |
|---|---|---|---|
| Minderjarige/deelnemer | Intakekandidaat, wachtlijst, leerling, examenkandidaat | Naam, geboortedatum, externe referentie, zwemervaring, programma/niveau/groep, leshistorie, aanwezigheid, voortgang, notities, badges, diploma’s, betaalrelaties. | `OBSERVED` `[E025]`, `[E026]`, `[E031]`, `[E032]` |
| Ouder/verzorger | Intakecontact, account, vertegenwoordiger/betaler | Naam, e-mail, telefoon, Auth-ID, profiel/avatar, kindrelaties, voorkeuren, communicatie, annuleringen, betalingen/provider-ID’s. | `OBSERVED` `[E024]`, `[E025]`, `[E035]` |
| Tweede verzorger | Optioneel intakecontact | Naam, e-mail en telefoon. Wordt bij live plaatsing niet automatisch als account of guardianlink verwerkt. | `CONFLICT` `[E026]` |
| Zelfstandige leerling/athlete | Schema- en shellrol | Auth- en tenantlidmaatschapsgegevens zijn technisch mogelijk; geen normale uitnodigings- of participantkoppelflow gevonden. | `PLANNED/INFERRED` `[E006]` |
| Instructeur | Medewerker die lessen en voortgang verwerkt | Naam, e-mail, telefoon/avatar, rollen, groeps-/sessietoewijzing, availability, actor-ID’s in presentie, voortgang en beoordelingen. | `OBSERVED` `[E024]`, `[E030]`, `[E031]` |
| Tenantowner/admin/staff | Zwemschoolbeheer en operationele medewerkers | Account/profiel/rollen; actor-ID’s; ingevoerde berichten, taken, documenten, exports, imports, plaatsing, billing en configuratie. | `OBSERVED` `[E024]`, `[E033]`, `[E037]` |
| Platformowner/admin/support | NXTTRACK-control-plane | Account/profiel/platformrol; actor-ID’s voor onboarding/offboarding/invites; technisch brede platform- en deels tenantinzage. | `OBSERVED` `[E006]`, `[E022]` |
| Potentiële zakelijke klant | Demo/contact | Marketing-CTA opent `mailto:`; geen intern leadrecord uit dit formulier. De mailboxprovider en ontvangen inhoud zijn onbekend. | `OBSERVED/UNKNOWN` `[E063]` |
| Financieel contact/betaler | Via guardian/billing | Bedragen, facturen, termijnen, provider customer/payment/mandate/refund/chargeback-ID’s en beperkte bankrekeningweergave. | `OBSERVED` `[E035]`, `[E036]` |
| Synthetische testpersoon | Journey Bot/seed/E2E | Realistisch ogende maar gemarkeerde testnaam, DOB, telefoon, adres, `.test`-e-mail en volledige leer-/betaalreis zonder echte verzending/betaling. | `OBSERVED` `[E041]` |

Een aparte supportticketgebruiker, nieuwsbriefabonnee, pushabonnee, anonieme leerlingomgeving of
app-storegebruiker is niet als actieve productcategorie aangetroffen.

## Gegevenscatalogus

| Gegevensgroep | Velden/inhoud | Tabellen/opslag | Personen | Status |
|---|---|---|---|---|
| Accountidentiteit | Supabase user UUID, e-mail, profielnaam, avatar-URL, telefoon | Supabase Auth; `profiles`, `user_security` | alle accountgebruikers | `OBSERVED` `[E024]` |
| Rollen/toegang | Tenant/platform, rol, status, invited e-mail, timestamps | `tenant_memberships`, `platform_memberships`, `auth_invitations` | medewerkers, ouders, platform | `OBSERVED` `[E006]`, `[E024]` |
| Authbeveiliging | Codehash, e-mail, attempts, expiry/consumed; must-change-password | `password_reset_challenges`, `user_security` | accountgebruikers | `OBSERVED` `[E045]` |
| Organisatie | Tenantnaam/slug/sector/status, domeinen, locale/timezone, branding, contact-/mailinstellingen | tenanttabellen, platformmailinstelling | zakelijke klanten; mogelijk natuurlijke onderneming | `OBSERVED` `[E005]`, `[E009]` |
| Kindidentiteit | display name, volledige geboortedatum, externe referentie, status | `participants`; intake/wachtlijstduplicaten | deelnemers/minderjarigen | `OBSERVED` `[E025]`, `[E026]` |
| Ouder-kindrelatie | guardian user ID, parent/guardian/athlete_self/other, primary/secondary/view_only, status | `participants.guardian_user_id`, `participant_guardians` | kind en verzorger | `OBSERVED` `[E025]` |
| Intakecontact | oudernaam/e-mail/telefoon, optionele tweede verzorger, kindnaam/DOB | `intake_submissions`, later `waitlist_entries` | kandidaat en verzorgers | `OBSERVED` `[E026]` |
| Intake-inhoud | gekozen doel, zwemmenervaring, dagen/dagdelen, vrije notities/bericht, dynamische antwoorden | intake submissions/answers | kandidaat/gezin | `OBSERVED` `[E026]` |
| Leadherkomst | kanaal, source/medium/campaign/content/term, referrerhost, landingspad, ad-click-aanwezigheid, tijd, consentstatus | intake submissions; browser memory/session storage | publieke bezoeker/kandidaat | `OBSERVED` `[E028]` |
| Misbruikpreventie | HMAC/SHA-256-fingerprint van tenant + IP + user-agent; window/count | `public_intake_rate_limits`; hash ook in intake | publieke bezoeker | `OBSERVED` `[E027]` |
| Wachtlijst/plaatsing | prioriteitsdatum, voorkeuren, adviesniveau, scores, capaciteit, redenen, aanbodstatus, oudermail, audit | waitlist/placement/slot-offer-tabellen | kind/verzorger/actor | `OBSERVED` `[E029]` |
| Planning | programma/niveau, locatie/pool/baan, groep, tijden, capaciteit, instructor assignment, availability | core/planningtabellen | deelnemer/instructeur | `OBSERVED` `[E030]` |
| Presentie | aanwezig/afwezig/laat/geoorloofd/proef, markeerder, tijd en vrije notitie | `session_attendance` | kind en instructor | `OBSERVED` `[E031]` |
| Ontwikkeling | interne/ouderzichtbare notities, scores 1–5, positief label, vaardigheidsitems, badges, actor en timestamps | progress- en badge-tabellen | kind/instructor | `OBSERVED` `[E031]` |
| Diplomering | readinessscore 0–100, checklist, review, evenement, uitnodiging, resultaat/notities, certificaatnummer/bestand | graduationtabellen; `diploma-vault` | kind/verzorger/medewerker | `OBSERVED` `[E032]` |
| Annulering/inhalen | reden, tijd, beleidsuitkomst, creditstatus/verval/gebruik | cancellation/catch-up-tabellen | kind/verzorger | `OBSERVED` `[E064]` |
| Communicatie | titel/body, publiek, zichtbaarheid, ontvanger, e-mailadres, onderwerp, provider/status/error en notificatie-inhoud | messages, notifications, email attempts | gebruikers/ontvangers | `OBSERVED` `[E033]` |
| Taken/rapportages | taaktekst, assignee/creator, mogelijk gerelateerd kind, metrics JSON en actor | tasks/report snapshots | medewerker/kind | `OBSERVED` `[E033]` |
| Documenten | titel/omschrijving, uploader, publiek, bestandsnaam/pad/MIME/grootte en inhoud | DB-metadata; private `tenant-documents` | afhankelijk van upload | `OBSERVED` `[E034]` |
| Billing | plan/abonnement, bedragen/valuta, vervaldatum/status, factuurregels, memo/notities, actor | billingtabellen | kind/verzorger/medewerker | `OBSERVED` `[E035]` |
| Providerbetaling | provider customer/payment/mandate/refund/chargeback-ID’s, checkoutlink, status/fout, account last4, consenttijd, payload | Mollie-gerelateerde tabellen | betaler/guardian | `OBSERVED` `[E036]` |
| Import | bronbestandsnaam, rauwe rij, genormaliseerde rij, mapping, fouten, duplicate key, actor, rollbackmanifest | importtabellen | geïmporteerde personen/actor | `OBSERVED` `[E037]` |
| Audit/events | actor, eventtype, bericht, vrije JSON-payload, statussen, tijden | placement/import/billing/tenant/Journey events | betrokken procespersonen | `OBSERVED` `[E044]` |
| Browservoorkeur | analyticskeuze; first-touch-attributie; GA-dedupe; DataTablefilters/sorting/kolommen | localStorage/sessionStorage | browsergebruiker | `OBSERVED` `[E052]`, `[E053]` |
| Back-up/export | volledige tenant-JSON, Storagepaden, versleutelde objectback-up en checksums | browserdownload; GitHub artifact | alle tenantbetrokkenen | `OBSERVED` `[E038]`, `[E058]` |

## Minderjarigen en relaties

- Volledige geboortedatum wordt gebruikt, niet alleen een leeftijdsband. Intake vereist een geldige
  datum vanaf 1900 tot vandaag; er is geen kindminimumleeftijd of leeftijdsafhankelijke
  toestemmingsflow. `OBSERVED` `[E025]`, `[E026]`
- Eén kind kan meerdere actieve verzorgers hebben en één account kan meerdere kinderen beheren.
  `participant_guardians` bewaart relatie en access-level. `OBSERVED` `[E025]`
- Autorisatie controleert alleen een actieve guardianlink; `view_only` wordt niet als beperkter
  mutatierecht afgedwongen. `OBSERVED` `[E046]`
- Gezag, identiteit van een verzorger, bewijs van vertegenwoordiging en conflicten tussen verzorgers
  worden niet technisch geverifieerd of afgehandeld. `UNKNOWN` `[E047]`
- Tweede-verzorgercontact uit intake wordt bij plaatsing niet automatisch uitgenodigd of aan het kind
  gekoppeld. `CONFLICT` `[E026]`

## Bijzondere en risicovolle categorieën

### Aangetroffen of mogelijke risico-input

- Aanwezigheid, zwemervaring, ontwikkelingsscores, instructeursnotities, readiness en diplomaresultaten
  beschrijven gedrag/ontwikkeling van kinderen. Dit dossier classificeert ze niet juridisch als
  bijzondere persoonsgegevens, maar wel als DPIA-/zorgvuldigheidssignaal. `[E031]`, `[E032]`
- Vrije tekstvelden, dynamische intakevragen, CSV-rijen, JSON-payloads en documenten hebben geen
  inhoudelijke categoriebeperking. Gebruikers kunnen daar medische, veiligheids- of andere gevoelige
  informatie invoeren, ook al vraagt het product daar niet gestructureerd om. `INFERRED` `[E042]`
- `avatar_url`, generieke documentuploads en toegestane afbeelding/SVG-MIME-types maken beeldmateriaal
  technisch mogelijk; een specifieke kindfoto-/videoflow is niet aangetroffen. `[E034]`, `[E039]`
- `media_consents` kan toestemming per purpose registreren, maar er is geen bereikbare appflow buiten
  export gevonden. Het schema bewijst dus geen operationeel toestemmingsproces. `PLANNED` `[E039]`

### Niet als gestructureerd actief veld aangetroffen

Gezondheid/medische gegevens, allergieën, noodcontacten, geslacht/aanspreekvorm, religie/etniciteit,
beperkingen, biometrie, BSN/nationaal identificatienummer, precieze GPS, zelfreflectie, leerwensen,
supporttickets en klachten zijn niet als gerichte productvelden of actieve flows gevonden.
`OBSERVED absence` `[E042]`

Dit sluit invoer in vrije tekst, bestanden of externe provideraccounts niet uit.

## Dataminimalisatie- en classificatievragen

1. Intake dupliceert oudermail en kindnaam in `tenant_events.payload` naast de brontabel. `[E044]`
2. Intake, wachtlijst en later participantrecords bewaren dezelfde kernidentiteit in opeenvolgende
   procesfasen zonder gevonden aflooptermijn. `[E026]`, `[E029]`
3. `payment_provider_events`, refunds/chargebacks en automation/import/events bewaren provider- of vrije
   JSON zonder aangetroffen veldredactie of categoriebeleid. `[E036]`, `[E044]`
4. Saved-viewfilters kunnen een kindnaam op een gedeelde browser bewaren; de sleutel is niet aan
   tenant of gebruiker gebonden en heeft geen verval/verwijderknop. `[E053]`
5. Juridische classificatie, verplichte/optionele velden, doeleinden en termijnen per categorie zijn
   `OWNER DECISION REQUIRED`.

