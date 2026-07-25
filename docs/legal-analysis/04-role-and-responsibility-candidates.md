# 04 — Technische rol- en verantwoordelijkheidskandidaten

Dit hoofdstuk noemt uitsluitend `ROLE CANDIDATE`. Contracten, feitelijke instructies en toepasselijk
recht zijn niet onderzocht; geen rij is een juridisch oordeel.

## Technisch waargenomen zeggenschap

| Actor | Technisch waargenomen handelingen | Status |
|---|---|---|
| Zwemschool/tenant | Bepaalt programma’s, intakevragen, groepen, medewerkers, ouder-/kinddossiers, beoordelingen, communicatie, documenten, betaalplannen, Mollieconfig en tenant-GA4. | `OBSERVED` `[E072]` |
| DG Webservices/NXTTRACK | Bouwt/host de app, beheert control-plane, globale mailconfig, onboarding/offboarding, deploy, monitoring, back-upcode en platform-GA4. Exacte juridische entiteit is onbekend. | `OBSERVED/UNKNOWN` `[E073]` |
| Ouder/verzorger | Levert intakegegevens, kan aanbod accepteren, profiel aanpassen, les annuleren en betaal-/mandaatinteracties uitvoeren. | `OBSERVED` `[E074]` |
| Instructeur/medewerker | Registreert aanwezigheid, notities, scores, badges en readiness/resultaten binnen toegewezen of tenantbrede rechten. | `OBSERVED` `[E075]` |
| Platformsupport | Heeft een platformrol en kan technisch via UI/RLS brede metadata en delen van tenantdata zien; geen impersonatie of JIT-goedkeuring gevonden. | `OBSERVED` `[E022]` |
| Leveranciers | Ontvangen gegevens via de in hoofdstuk 05 bewezen integratiepunten; contractuele rol en keten zijn onbekend. | `OBSERVED/UNKNOWN` `[E054]`–`[E058]` |

## Kandidaten per verwerking

| Verwerking | Primaire doel-/middelbepaler uit code | Technische rolkandidaten | Onzekerheid/contractvraag | Bewijs |
|---|---|---|---|---|
| NXTTRACK-marketing/demo | NXTTRACK bepaalt pagina, CTA en platform-GA-property | NXTTRACK: zelfstandig verantwoordelijke kandidaat; Google/mailboxprovider: ontvanger-/leverancierskandidaat | Rechtspersoon, mailbox, doelen/termijnen/GA-contract | `[E063]`, `[E056]` |
| Tenant publieke site/intake | Tenant configureert site, programma en vragen; NXTTRACK levert workflow | Zwemschool: verantwoordelijke kandidaat; NXTTRACK: verwerker of gezamenlijke kandidaat; Supabase: leverancierskandidaat | Instructies, hergebruik door NXTTRACK, intakegrondslag | `[E026]`, `[E072]` |
| Tenant-GA4 | Tenant zet eigen measurement ID aan; NXTTRACK implementeert consent/tag | Tenant en/of NXTTRACK: verantwoordelijke kandidaten; Google: zelfstandige/verwerker/subverwerker kandidaat | Eigendom property, Google-voorwaarden, doorgifte, consentverantwoordelijkheid | `[E028]`, `[E056]` |
| Accounts/rollen | Tenant/platformadmin nodigt uit; NXTTRACK/Supabase maakt Authaccount | Tenant of NXTTRACK afhankelijk van rol: verantwoordelijke kandidaat; andere partij: verwerker kandidaat; Supabase: leverancier | Platform- versus tenantaccount, securitydoeleinden | `[E045]`, `[E054]` |
| Ouder-kinddossier | Zwemschool bepaalt lesprogramma en dossierinhoud | Zwemschool: verantwoordelijke kandidaat; NXTTRACK: verwerker kandidaat; Supabase: leverancier | Rechtstreekse NXTTRACK-doeleinden, supporttoegang | `[E025]`, `[E031]` |
| Plaatsingsadvies | Tenantdata en tenantstaff sturen uitkomst; NXTTRACK levert vaste scorelogica | Zwemschool: beslisser/verantwoordelijke kandidaat; NXTTRACK: verwerker/algoritmeleverancier kandidaat | Wie valideert regels, behandelt bezwaar en corrigeert bias | `[E029]`, `[E066]` |
| Communicatie | Tenant/NXTTRACK kiest bericht afhankelijk van proces | Tenant voor tenantmail; NXTTRACK voor platformauthmail: verantwoordelijke kandidaten; SendGrid/SMTP: leverancier | Afzenderaccount, DPA, transactioneel/marketing, retentie | `[E033]`, `[E055]` |
| Documenten/diploma’s | Tenant uploadt/publiceert; NXTTRACK bewaart/deelt | Zwemschool: verantwoordelijke kandidaat; NXTTRACK: verwerker; Supabase/GitHub-back-up: leverancierskandidaten | Contentbeleid, back-upketen, toegang | `[E034]`, `[E054]`, `[E058]` |
| Ouderbilling/Mollie | Tenant stelt plan/provider in en is vermoedelijke merchant | Zwemschool: verantwoordelijke/merchant kandidaat; Mollie: zelfstandige of verwerker kandidaat; NXTTRACK: verwerker/integrator kandidaat | Merchantcontract, AML/betalingsrollen, providertermijnen | `[E035]`, `[E036]` |
| CSV-migratie | Tenant uploadt bron en start apply | Zwemschool: verantwoordelijke kandidaat; NXTTRACK/Supabase: verwerker-/leverancierskandidaten | Bronrechtmatigheid, migratie-instructie, rollback/termijn | `[E037]` |
| Productmonitoring/incident | NXTTRACK bepaalt technische checks en alertkanaal | NXTTRACK: verantwoordelijke kandidaat voor eigen operationele logs; webhook-/GitHub-/hostpartijen: leverancierskandidaten | Alertendpoint, logdoelen, personeelsgegevens, incidentproces | `[E057]`, `[E071]` |
| Journey Bot | NXTTRACK/platformbeheer bepaalt synthetische test | NXTTRACK: verantwoordelijke kandidaat voor testdata; Supabase/GitHub: leverancierskandidaten | Productieoverride, realistisch ogende data, cleanup | `[E041]`, `[E069]` |
| Tenantoffboarding | Platformadmin voert export/sluiting uit voor tenant | Zwemschool: verantwoordelijke kandidaat; NXTTRACK: uitvoerende verwerker of gezamenlijke kandidaat | Exportontvanger, instructie/retentie, wettelijke hold, shared Auth | `[E038]`, `[E070]` |
| Individueel rechtenverzoek | Geen workflow of taakverdeling in code | Zwemschool en NXTTRACK zijn beide afhandelingskandidaten | Wie ontvangt, verifieert, beslist, exporteert en verwijdert | `[E059]` |

## Mogelijke gezamenlijke of zelfstandige rollen

De volgende feiten vragen expliciete contractuele duiding:

- Platform-GA4 en tenant-GA4 gebruiken verschillende meet-ID-eigenaren en mogelijk verschillende
  doeleinden. `[E056]`
- Auth-, security-, monitoring- en fraudepreventiedata kunnen door NXTTRACK voor platformbeveiliging
  worden bepaald, terwijl tenantinhoud door de zwemschool wordt bepaald. `[E027]`, `[E045]`, `[E071]`
- Mollie ontvangt gegevens binnen een betaalrelatie en kan eigen wettelijke/providerdoeleinden hebben;
  de repository bevat geen contractuele kwalificatie. `[E036]`
- Support heeft technisch brede toegang, maar de repository beschrijft geen instructie-, approval- of
  noodtoegangsmodel. `[E022]`
- Offboardingtombstones, releasebewijs en operationele logs kunnen na tenantinstructie blijven bestaan;
  doel en rol daarvoor zijn `OWNER DECISION REQUIRED`. `[E070]`

## Niet bewezen

- Geen verwerkersovereenkomst, leveranciers-DPA, SCC, gezamenlijke-regeling of privacyrollenmatrix in de
  repository.
- Geen bewijs wie eigenaar is van Supabase-, SendGrid-, Mollie-, Google-, GitHub-, VPS- of
  webhookaccounts.
- Geen bewijs dat de zwemschool of NXTTRACK voor ieder proces definitief
  verwerkingsverantwoordelijke/verwerker is.

