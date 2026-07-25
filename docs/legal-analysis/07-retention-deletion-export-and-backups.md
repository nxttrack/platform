# 07 — Bewaring, verwijdering, export en back-ups

## Aangetroffen termijnen

| Object/proces | Technische termijn | Wat gebeurt er werkelijk? | Classificatie/bewijs |
|---|---|---|---|
| Publieke intake-rate-counter | Records ouder dan 2 dagen | Opportunistische `DELETE` wanneer de rate-limitfunctie opnieuw wordt aangeroepen | Geïmplementeerde cleanup, niet scheduled. `OBSERVED` `[E027]` |
| Rate-limitwindow | 15 minuten; max 5 | Nieuwe windowbucket; hash blijft daarnaast in intake submission zonder termijn | Geïmplementeerd. `OBSERVED` `[E027]` |
| Password-reset challenge | 15 minuten, max 5 attempts | Bij gebruik/statuscontrole `used`/`expired`; geen gevonden fysieke cleanup | Expiry, geen retentie. `OBSERVED` `[E045]` |
| Authinvitation | 14 dagen | `expires_at` in DB; accessflow controleert die expiry niet en wist/revokeert niets automatisch | `CONFLICT` `[E048]` |
| Slot offer | Standaard 7 dagen | Applicatie beoordeelt expiry/status; geen purge gevonden | Expiry, geen retentie. `OBSERVED` `[E067]` |
| Payment session | Appfallback circa 24 uur | Provider/checkoutexpiry en status; geen purge | Expiry, geen retentie. `OBSERVED` `[E036]` |
| Inhaalcredit | Tenantinstelling 1–365 dagen, standaard 60 | `expires_on` en status mogelijk; record blijft bestaan | Configurabele businessexpiry. `OBSERVED` `[E064]` |
| Journey Bot cleanup | Config 1–365 dagen, standaard 14 | Geen automatische scheduler voor cleanup gevonden; handmatige actie soft-archiveert data | `CONFLICT` `[E069]` |
| Tenantoffboarding | Operator kiest 30–365 dagen | Na export schorsing; na afloop owner approval + bevestigde delete | Geïmplementeerde minimale wachttermijn. `OBSERVED` `[E038]` |
| GitHub staging/releasebewijs | Vaak 14 dagen | Artifactplatform verwijdert na workflowretentie | Geconfigureerd. `OBSERVED` `[E058]` |
| GitHub productiereleasebewijs | 90 dagen | Artifactretentie in deployworkflow | Geconfigureerd. `OBSERVED` `[E058]` |
| Versleutelde Storage-back-up | 30 dagen | Handmatig gemaakte GitHub artifact | Geconfigureerd, workflow niet scheduled. `OBSERVED` `[E058]` |
| Operationele logs | `LOG_RETENTION_DAYS` wordt gevalideerd/gedocumenteerd | Geen app-, DB-, journald- of Caddy-pruning door deze variabele gevonden | `CONFLICT` `[E071]` |
| Supabase managed DB-back-up | Bestaande docs noemen verschillende momentopnames/planvoorwaarden | Huidige providerinstelling, frequentie, PITR en Auth-dekking niet uit repo bewezen | `CONFLICT` `[E080]` |

## Categorieën zonder aangetroffen bewaartermijn

Geen automatische categoriebrede cleanup of goedgekeurde termijn is gevonden voor:

- accounts, profielen, memberships en Authusers;
- intakes, antwoorden, waitlist, offers en placement audit;
- deelnemers, guardianlinks, inschrijvingen, leshistorie en annuleringen;
- presentie, voortgang, vrije instructor-notities en badges;
- diploma’s, certificaten en Storagebestanden;
- berichten, notificaties, taken en e-maildelivery attempts;
- abonnementen, facturen, payments, mandates, provider events/payloads, refunds/chargebacks;
- imports inclusief raw rows, automation runs en saved views;
- tenant events, procesaudits, consentrecords en leadattributie.

`OWNER DECISION REQUIRED` per categorie: startmoment, actieve termijn, archieftermijn, wettelijke hold,
anonimisering, hard delete, back-upbehandeling en uitzonderingen.

## Soft delete en archivering

Veel tabellen gebruiken statussen zoals `archived`, `inactive`, `suspended`, `cancelled`, `closed`,
`revoked` of `expired`. Dit beperkt bereikbaarheid maar verwijdert de rij niet. Er is geen algemene
`deleted_at`-architectuur of anonimisatieservice aangetroffen. `[E081]`

Voor Journey Bot worden testrecords gesloten/gearchiveerd en voorzien van `archived_at/reason`, maar
de botgemaakte Authuser, profiel en securityrow worden niet verwijderd. `[E069]`

## Tenantoffboarding

### Aangetroffen positieve controls

1. Alleen platform owner/admin start offboarding; retentie wordt op 30–365 dagen begrensd.
2. Accountsluiting vereist een eerder als `export_ready` gemarkeerde export.
3. Sluiting schorst tenant en memberships.
4. Alleen `platform_owner` kan na verstreken termijn deletion goedkeuren.
5. Permanente delete vraagt een tweede exacte tekstbevestiging.
6. Gerefereerde Storagepaden worden vóór DB-delete uit beide private buckets verwijderd.
7. Er wordt een tombstone met actor/exportmanifest geschreven; tenantdelete activeert DB-cascades.

`OBSERVED` `[E038]`

### Onvolledigheid en risico’s

- De export gebruikt een handmatige tabelallowlist en mist minimaal `email_delivery_attempts`,
  Authusers/profiles/user_security en Journey Bot-tabellen. Nieuwe tabellen kunnen stil ontbreken.
- Een tabelqueryfout wordt als `{export_error: ...}` in JSON gezet, maar de run wordt toch
  `export_ready`; sluiting/delete kan dus na een onvolledige export doorgaan.
- `select("*")` bouwt de gehele export in geheugen en levert ongeëncrypteerde JSON als
  browserdownload, zonder aangetroffen size/streaminglimiet of expliciete `Cache-Control: no-store`.
- Storagebytes zitten niet inline. Alleen DB-gerefereerde paden worden verwijderd; orphan objects onder
  tenantprefixen worden niet eerst gelist/gereconcilieerd.
- Tenantcascade verwijdert geen globale Supabase Authuser/profiel/securityrow. Dit kan voor gedeelde
  accounts gewenst zijn, maar orphan accounts worden niet gedetecteerd of afgehandeld.
- Geen delete/synchronisatie richting Mollie, SendGrid/SMTP of Google is gevonden.
- Tombstone bewaart voormalige tenantnaam/slug zonder eigen expiry; de naam kan bij een eenmanszaak
  persoonsgegeven zijn.

`CONFLICT` met een direct lifecycle-risico `[E070]`

## Individuele verwijdering

Er is geen self-service of backofficeflow gevonden om één betrokkene volledig te:

- exporteren;
- beperken of anonimiseren;
- uit alle tenanttabellen en vrije JSON te verwijderen;
- uit Storage en exports/back-ups te verwijderen;
- als Authuser te sluiten;
- bij externe leveranciers te verwijderen;
- met status/audit af te handelen.

Tenantdelete is geen individueel rechtenproces. `[E059]`

## Export

| Export | Inhoud | Toegang | Beperkingen |
|---|---|---|---|
| Tenantoffboarding JSON | Expliciete lijst tenanttabellen, volledige rijen, tenantrecord, Storagepaden, SHA-256/countmanifest | Platform owner/admin | Onvolledige allowlist; errors failen niet; geen Storagebytes; ongeëncrypteerde browserdownload |
| Billing export batch | Factuur-/billingdata en status in DB | Tenantmanagement | Exact bestandsformaat/contractuele export niet als algemeen dataportabilitymechanisme vastgesteld |
| Storage object backup | Alle bytes uit twee private buckets + manifest/checksums | Workflowoperators/artifacttoegang | Handmatig; encrypted; 30 dagen; geen individuele selectie |
| CSV-import rollbackmanifest | IDs van gemaakte records | Tenantowner/admin | Is herstelmechanisme, geen gegevensdownload; raw rows blijven |

## Back-ups en herstel

### Database

De repository bevat een logisch restore-rehearsalscript en een productierunbook. Het runbook maakt
expliciet dat managed Auth en Storage niet volledig door een logische `public/app_private` dump worden
gedekt. De actuele Supabase-planinstelling, frequentie, herstelpunten, PITR en providerretentie zijn
zonder dashboardbewijs `UNKNOWN`. `[E080]`

### Storage

- Databaseback-ups bevatten Storagemetadata, niet de objectbytes.
- De repository exporteert daarom beide private buckets, berekent SHA-256-checksums en versleutelt het
  pakket met GPG AES-256 vóór GitHub-artifactupload.
- Restore is no-overwrite en verifieert checksums; een synthetische stagingrehearsal is gedocumenteerd.
- De productieworkflow is uitsluitend `workflow_dispatch`; geen cron.
- Het runbook noemt 30 dagen GitHubretentie als eerste route en vereist nog een goedgekeurde immutable
  lange-termijnbestemming, schedule en RPO.

De handmatige workflow is `OBSERVED`; een operationeel schema is `PLANNED`. `[E058]`

### Verwijdering uit back-ups

Geen policy of code is gevonden voor:

- wanneer gewiste gegevens uit herstelpunten verdwijnen;
- blokkering/beperking van hersteltoegang;
- opnieuw uitvoeren van erasure na restore;
- een deleteledger voor betrokkenen/tenants;
- bewijs dat externe providerback-ups hetzelfde volgen.

`OWNER DECISION REQUIRED`.
