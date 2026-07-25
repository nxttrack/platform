# 12 — Gaten, risico’s en concrete eigenaarsvragen

## Blockers voor definitieve juridische documenten

| ID | Concrete vraag/beslissing | Waarom nodig |
|---|---|---|
| L-B01 | Wat is de volledige juridische naam, KvK/BTW, vestigings-/postadres, privacycontact en security-/datalekcontact van de NXTTRACK-leverancier? | Identiteit en contact ontbreken volledig. |
| L-B02 | Bevestig per proces in hoofdstuk 04 wie verantwoordelijke, verwerker of andere contractuele rol is en wie alleen op instructie handelt. | Code toont technische zeggenschap, geen rechtsrol. |
| L-B03 | Kies per gegevenscategorie doel, `OWNER DECISION REQUIRED`-rechtsgrond, ontvangers en begin/einde van de bewaartermijn. | Vrijwel geen categoriebrede retentie. |
| L-B04 | Lever voor Supabase, SendGrid/SMTP, Mollie, Google, GitHub, VPS en alertendpoint de contractentiteit, DPA, regio, subleveranciers en transfermechanisme. | Leveranciersketen/regio onbekend. |
| L-B05 | Wie ontvangt en verifieert inzage/correctie/delete/beperking/bezwaar/portability namens ouder of kind, met welke deadline en escalatie? | Geen rechtenworkflow. |
| L-B06 | Welke guardian mag namens welk kind handelen, welk bewijs wordt gevraagd en hoe worden conflicterende verzorgers/access-levels behandeld? | Gezag niet geverifieerd; view_only werkt niet als writebeperking. |
| L-B07 | Welke intake-, analytics-, media- en mandate-teksten/versies moeten worden bewaard, en wat doet intrekking met data en toekomstige verwerking? | Huidige consentbewijzen zijn gedeeltelijk/schema-only. |
| L-B08 | Welke productieback-up-, RPO/RTO-, restore- en erasure-after-restoreafspraken gelden aantoonbaar? | Providerstate extern en objectbackup handmatig. |
| L-B09 | Definieer SaaS-prijs, looptijd, renewal, betaling, opzegging, opschorting, export-/deletewindow en support/SLA. | Marketingplannen hebben geen contractmodel. |
| L-B10 | Beslis of structurele kind-/voortgangsverwerking en scoring een formele DPIA vereist, op basis van werkelijke volumes/landen/toegang. | Repository toont meerdere risicosignalen maar geen feitelijke schaal. |

## Hoge technische/privacyprioriteit

| ID | Bevinding | Concrete actie/vraag | Bewijs |
|---|---|---|---|
| H-01 | Tempwachtwoorduser krijgt direct actieve membership; must-change gate ontbreekt op directe API’s; invite expiry niet enforced | Maak membership pending tot acceptatie/password change, enforce gate op iedere API en revoke expired invites/users | `[E048]` |
| H-02 | Geen logout/MFA/device-sessionbeheer of expliciete globale revoke | Implementeer logout; bevestig Supabase MFA/rate limits/session expiry en kies revoke-policy | `[E049]` |
| H-03 | Offboardingexport kan met table errors toch `export_ready` zijn en mist data | Fail closed, centrale tabelregistry, volledigheidscheck, streaming/encryption/no-store | `[E070]` |
| H-04 | Tenantdelete mist Auth/profiles, externe providers en orphan Storage | Bouw dependency inventory, shared-accountbesluit, bucket prefix reconciliation en provider deletion ledger | `[E070]` |
| H-05 | Geen retentie/pruning voor kerncategorieën | Stel schema vast en bouw scheduled, geaudite cleanup/anonymization | `[E080]`, `[E081]` |
| H-06 | Intake event dupliceert oudermail/kindnaam; free JSON/text groeit onbegrensd | Minimaliseer payload naar IDs/categorieën en definieer schema/redactie/termijn | `[E044]` |
| H-07 | Abusefingerprint valt zonder secret terug op unsalted SHA-256 | Vereis aparte pepper fail-closed, versioneer hashes en beperk retentie | `[E027]` |
| H-08 | Guardian `view_only` beperkt writes niet; tweede guardian blijft los contact | Handhaaf access-level per actie; ontwerp invite/accept/custody/conflictflow | `[E046]`, `[E047]` |
| H-09 | Bestandsallowlist bevat SVG/Office/PDF/image zonder sniffing/scan | Voeg magic-byte check, SVG-sanitization, malware quarantine en contentbeleid toe | `[E034]` |
| H-10 | CSP heeft geen script/connect/style/img/default allowlists | Ontwerp nonce/hash-CSP met expliciete Supabase/GA-connecties en test report-only→enforce | `[E082]` |
| H-11 | Individuele rightsflow ontbreekt | Bouw case workflow, complete search/export/delete en bewijs-/deadlineaudit | `[E059]` |
| H-12 | Storageback-up is handmatig; managed providerstate onbekend | Plan encrypted cron/immutable bestemming; bewijs DB/Auth/Storage restore en erase-after-restore | `[E058]`, `[E080]` |
| H-13 | Journey Bot heeft production override en soft cleanup laat Authdata achter | Hard deny production in build/deploy en maak veilige hard cleanup voor gemarkeerde tests | `[E069]` |
| H-14 | Saved-view key is niet user/tenant-scoped en kan persoonsfilter bewaren | Scope key, voeg clear/expiry toe en vermijd PII in viewnaam/filter | `[E053]` |
| H-15 | Bearer offertoken staat in e-mail-/adminquery; resetmail zet e-mail in URL | Gebruik korte one-time route/POST, no-referrer/no-store en verwijder PII/secrets uit nested queries | `[E067]`, `[E078]` |

## Middelmatige prioriteit

| ID | Vraag/actie |
|---|---|
| M-01 | Is `tenant_staff` bedoeld als volledig admin? Zo niet, splits planner/finance/content/read-only en pas RLS/actions aan. |
| M-02 | Welke data mag `platform_support` zien? Voeg JIT approval, scope, reason en accesslog toe. |
| M-03 | Maak procesaudits append-only/immutable en definieer actor, before/after, reason, retention en export. |
| M-04 | Breid securitymonitoring uit met login-, privilege-, support-, RLS-, export-, Storage- en rights-events. |
| M-05 | Verwijder first-touch sessionStorage bij analytics revoke of documenteer/ontkoppel expliciet first-party verwerking. |
| M-06 | Bewaar intake consenttekst-/purposeversion en tijd; bied withdrawal/contactpad. |
| M-07 | Leeftijd zit in data maar niet in live matching; corrigeer claim/formule of verwijder leeftijdsclaim. |
| M-08 | Maak importrollback transactioneler en verwijder of reconcile Auth/profiles/raw rows na rollback. |
| M-09 | Laat onboardingfouten automatisch gecreëerde tenants/accounts/invites terugdraaien of als herstelcase tonen. |
| M-10 | Verifieer custom-domain routing end-to-end; huidige proxy zet voor custom domain geen tenant-slug. |
| M-11 | Verifieer exacte Auth-/GA-cookieattributes in staging/productie en documenteer ze. |
| M-12 | Corrigeer PWA-copy: er is geen offline writequeue/push; tenant `pwa_enabled` gate runtime niet. |

## Lage prioriteit / productverbetering

| ID | Vraag/actie |
|---|---|
| P-01 | Voeg privacyvriendelijke delete/reset voor saved views en browservoorkeuren toe. |
| P-02 | Maak DataTable saved views server-side of verklaar waarom browser-only beter is. |
| P-03 | Voeg compacte data-classification hints toe aan vrije tekst, CSV en uploadformulieren. |
| P-04 | Toon ouders waarom een plaatsingsadvies is gemaakt en hoe zij correctie/alternatief vragen. |
| P-05 | Geef staff een dataminimalisatie-/zichtbaarheidskeuze bij progress notes en taken. |
| P-06 | Voeg exportformaten toe die bruikbaar zijn voor tenantmigratie zonder providersecrets/payloadruis. |
| P-07 | Scheid synthetische testidentiteiten visueel en in rapportages; monitor dat `is_test` nooit ontbreekt. |

## Beleidskeuzes

1. Leeftijd/parental authority en communicatie rechtstreeks met een athlete-account.
2. Welke vrije informatie mag in intake, instructor notes, events, CSV en documenten.
3. Progress-/attendance-/diplomaretentie na uitschrijving en volwassenwording.
4. Media purpose, bewijsvorm, geldigheidsduur, intrekking en reeds gepubliceerd materiaal.
5. First-party leadattributie bij denied GA-consent.
6. Supporttoegang, noodtoegang, access reviews en personeelsvertrek.
7. Log-/auditretentie, incidentclassificatie en datalekmelding.
8. Back-up legal hold, restoretoegang en re-erasure.
9. Gebruik van klantnamen/logo’s, synthetische demodata en marketingstatistieken.
10. Production Journey Bot, automation executor en toekomstige AI als change/DPIA-gate.

## Contractuele keuzes

- SaaS-plannen/features/entitlements, prijzen, BTW en facturering.
- Looptijd, renewal, opzegging, wanbetaling, opschorting, exit en refunds.
- SLA/uptime, onderhoud, supporturen/prioriteiten en service credits.
- Security commitments zonder ongefundeerde complianceclaims.
- Klantverantwoordelijkheid voor accounts, notices, content, CSV en guardianauthority.
- NXTTRACK-licentie, klantcontentlicentie, feedback, merkgebruik en IP.
- Fair use/quotas voor users, locaties, storage, e-mail, imports en API/jobs.
- Subprocessorwijziging, bezwaar, audit, incidentmelding en transferwijziging.
- Aansprakelijkheid, verzekering, overmacht, toepasselijk recht en geschillen.

## Bij leveranciers opvragen

| Leverancier | Exact op te vragen |
|---|---|
| Supabase | Contractentiteit, projectregio/plan, DPA/SCC, subprocessors, Auth-/DB-/Storageback-ups, at-rest encryptie, logs, deletion en supportaccess |
| SendGrid/SMTP | Accountentiteit/regio, DPA/SCC/subprocessors, content/logretentie, suppression/bounce data, security en deletion |
| Mollie | Merchantowner, rollen/DPA, KYC/AML-data, landen, providerretentie, mandate/refund/chargebackdelete en incidentmelding |
| Google | Propertyowner, Data Processing Terms, regio/transfer, retention, IP/device instellingen, data sharing/signals en deletion |
| GitHub | Org/plan, artifact-/logregio en retentie, DPA/transfer, runner controls, secret access en deletion |
| VPS/runner/Caddy | Provider/land, DPA, beheerderstoegang, disksnapshots, logs/rotatie, TLS, patching en incidentproces |
| Alertendpoint | Werkelijke Slack/Teams/Discord/andere tenant, accountowner, kanaaltoegang, DPA/regio, retentie en export/delete |
| Mailbox | Provider, accountaccess, MFA, retentie, forwarding en verwerking van demo/support/rightsverzoeken |

## Conflicten expliciet op te lossen

1. Journey Bot “staging-only” versus production override.
2. Monitoringdocs “staging-only/not enabled” versus workflowmatrix/runbook “staging+production”.
3. `LOG_RETENTION_DAYS` claim versus geen technische pruning.
4. Custom domain record/resolver versus ontbrekende tenant-slug in proxy.
5. PWA-copy “wijzigingen wachten offline” versus alleen static cache.
6. Automationstatus `active` versus geen executor.
7. Marketing white-label/audit/custom roles/CRM versus gedeeltelijke runtime.
8. Offboardingexportstatus “ready” versus mogelijk embedded table errors.

