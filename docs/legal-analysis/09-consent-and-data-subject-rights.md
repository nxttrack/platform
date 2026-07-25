# 09 — Toestemming, ouderrelaties en rechten

## Toestemmingsregister

| Toestemming/keuze | Vastlegging | Intrekken/wijzigen | Tekortkoming | Status |
|---|---|---|---|---|
| Publieke intake “contact en planning” | Vereiste checkbox; DB `consent_given` boolean | Geen self-service withdrawal of wijziging | Geen tekst-/purposeversion, timestamp of immutable history; checkbox is geen juridische conclusie | `OBSERVED` `[E087]` |
| Analytics | localStorage `granted/denied`; intake bewaart status + `analytics-v1` | Cookievoorkeur opent opnieuw; deny wist bereikbare GA-cookies | Browserkeuze heeft geen timestamp/expiry/serverreceipt; first-touch sessionStorage wordt bij revoke niet gewist | `CONFLICT` tussen gedeeltelijke intrekking en achterblijvende attributie `[E052]` |
| First-party leadattributie | Werkelijke intake bewaart bron ook bij denied/unknown GA | Geen aparte opt-out/withdrawalflow | Doel, grondslag, disclosure en retentie los van GA `OWNER DECISION REQUIRED` | `OBSERVED` `[E028]` |
| Media/foto/video | Schema met purpose, status, granted/withdrawn/expiry en evidence | Schema kan withdrawn bevatten | Geen UI/action/runtimecontrole; geen immutable versiegeschiedenis; tenantadmin kan wijzigen | `PLANNED` `[E039]` |
| Mollie incasso | Consenttermsversion, initiated/recorded timestamps, source; provider mandate | Ouder kan eigen mandate met expliciete bevestiging revoken | Contracttekst/versionbeheer en externe providerretentie onbekend | `OBSERVED` `[E088]` |
| Communicatievoorkeur | Niet aangetroffen | Niet aangetroffen | Geen nieuwsbrief-, kanaal- of notificationpreferencecentrum | `UNKNOWN` `[E059]` |

Geen juridisch oordeel wordt gegeven over de geldigheid of noodzaak van toestemming.

## Ouder-kindrelaties

- `participant_guardians` ondersteunt meerdere verzorgers en relaties `parent`, `guardian`,
  `athlete_self`, `other`, met status actief/inactief/revoked. `[E025]`
- Access-levels zijn primary/secondary/view_only, maar de autorisatie behandelt iedere actieve link als
  view/managebare kindrelatie; `view_only` is dus geen werkende writebeperking. `[E046]`
- Tenantstaff beheert guardianlinks; geen self-service invite/acceptance van tweede guardian, bewijs van
  gezag of conflictprocedure gevonden. `[E047]`
- Een optionele tweede verzorger wordt in intake opgeslagen maar niet door plaatsing aan het latere
  kindaccount gekoppeld. `[E026]`
- De repository bevat geen regeling voor tegengestelde verzoeken van verzorgers, kindstem op basis van
  leeftijd of controle wie namens het kind mag handelen.

## Ondersteuning van rechten

| Verzoek/handeling | Self-service | Tenant/backoffice | Platform | Feitelijke status |
|---|---|---|---|---|
| Inzage via product | Ouder ziet gekoppelde kinderen, lessen, zichtbare voortgang/badges/diploma’s, berichten, documenten en billing | Staff ziet operationele dossiers | Support/platform heeft technische metadata-/RLStoegang | Functionele inzage, geen complete privacykopie. `OBSERVED` `[E089]` |
| Correctie eigen profiel | Ouder kan naam en telefoon aanpassen; e-mail read-only | Geen generieke user editflow aangetroffen | Admin kan uitnodigen/rollen beheren | Beperkt. `OBSERVED` `[E089]` |
| Correctie kinddossier | Niet aangetroffen | Staff kan operationele gegevens in hun schermen muteren | Geen rights workflow | Handmatig/productafhankelijk, geen verzoektracking |
| Gegevensdownload/portabiliteit | Niet aangetroffen | Geen subjectexport | Platformadmin kan hele tenant-JSON downloaden | Tenantoffboarding is geen individueel recht. `[E059]`, `[E070]` |
| Verwijdering persoon/account | Niet aangetroffen | Geen complete cascadeflow | Alleen gehele tenant na offboarding | Niet ondersteund als individueel proces. `[E059]` |
| Beperking/bezwaar | Niet aangetroffen | Statussen/archief bestaan, niet als rightsproces | Niet aangetroffen | `UNKNOWN` |
| Intrekken analytics | Publieke cookievoorkeur | — | — | Ondersteund voor GA; first-party attributie blijft |
| Intrekken media | Geen runtimeflow | Schema/policy zou guardian/adminmutatie toelaten | — | Schema-only |
| Verwijderen foto/video | Geen specifieke kindmediaflow | Generic documentdelete mogelijk voor staff | — | Geen rightsproces |
| Mandaat intrekken | Ouder kan eigen mandate revoken | Billingaudit/status | — | Ondersteund. `[E088]` |
| Account beëindigen | Geen logout of accountsluiting | Membership kan waarschijnlijk status wijzigen via beheerflow, geen complete delete | Tenantoffboarding | Geen individueel sluitingsproces |
| Verzoek namens kind | Geen verzoekformulier | Geen verificatie-/caseflow | Geen caseflow | Niet ondersteund |
| Klacht/support | Marketingmailadres; geen appcase | Geen ticketing | Geen ticketing | Mailboxproces extern/`UNKNOWN` |

## Identiteitscontrole en audit

Voor een datarechtenverzoek zijn niet aangetroffen:

- centraal intakekanaal/formulier;
- verificatiestappen of vertegenwoordigersbewijs;
- case-ID, requesttype, owner, status, deadline en besluit;
- zoek-/exportservice over Auth, DB, JSON, Storage en leveranciers;
- correctie-/deleteledger;
- vier-ogencontrole of bewijs van oplevering;
- heruitvoering van verwijdering na backuprestore.

Procesaudits bestaan, maar vormen geen DSAR-register. `OWNER DECISION REQUIRED`.

## Direct benodigde beleids- en productkeuzes

1. Formuleer per intake-/analytics-/media-/mandaatdoel welke tekst en versie moet worden bewaard en
   welke intrekking technisch effect heeft.
2. Bepaal wie ouderlijk gezag/vertegenwoordiging controleert en hoe conflicten worden geblokkeerd.
3. Maak guardianaccess-levels daadwerkelijk onderscheidend.
4. Ontwerp een subject-rightscase die Auth, alle tenanttabellen, vrije JSON, Storage, exports/back-ups en
   leveranciers afdekt.
5. Bepaal of tenant of NXTTRACK eerste aanspreekpunt is per verzoek en hoe identiteit/deadlines/escalatie
   worden beheerd.
