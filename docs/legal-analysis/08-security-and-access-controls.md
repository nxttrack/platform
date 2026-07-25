# 08 — Beveiliging en toegangsmaatregelen

Dit is een inventaris, geen claim dat het platform “volledig veilig”, AVG-, ISO- of anderszins
gecertificeerd compliant is.

## Aantoonbare maatregelen

| Domein | Maatregel | Status/bewijs |
|---|---|---|
| Transport/browser | HSTS, nosniff, DENY/frame-ancestors none, strict referrer, COOP/CORP en Permissions-Policy die camera/geolocatie/microfoon/payment/USB uitschakelt; Caddy/TLS in deployrunbooks | `OBSERVED` `[E082]` |
| CSP | `base-uri`, `form-action`, `frame-ancestors`, `object-src` beperkt | `OBSERVED`, maar geen resourceallowlist `[E082]` |
| Authcontext | Supabase `getUser()` + DB-profiel/security/memberships; geen clientmetadata als autoriteitsbron | `OBSERVED` `[E045]` |
| Routeguards | Anonymous redirect, rol/shell/hostcheck en must-change-password voor private pages | `OBSERVED` `[E045]` |
| Wachtwoorden | Minimaal 12 tekens + lower/upper/cijfer/symbool; resetcodehash met pepperfallback; 5 attempts; 1/min en 5/uur resetrequest | `OBSERVED` `[E045]` |
| Tenantisolatie | `tenant_id`, samengestelde FKs, RLShelpers met vast `search_path`, RLS en latere FORCE RLS | `OBSERVED` `[E008]` |
| RLS-verificatie | Statische coverage audit, live FORCE verifier, vier-role smoke en browser-isolatietest in stagingdeploy | `OBSERVED` `[E083]` |
| Server secrets | Supabase adminclient server-only; GitHub Environments; buildaudit blokkeert `NEXT_PUBLIC_` secrets en oude patterns | `OBSERVED` `[E021]`, `[E084]` |
| Mailsecrets | SendGridkey/SMTP-password AES-256-GCM met random IV/tag in DB; secretkolommen niet aan algemene clients verleend | `OBSERVED` `[E055]` |
| Publieke intake | Honeypot, minimum invultijd, tenant/HMAC-IP+UA-fingerprint, 5 per 15 min, validation/dedupe/idempotency | `OBSERVED` `[E027]` |
| Interne endpoints | Billing/Journey bearer secret minimaal 32 tekens en timing-safe comparison | `OBSERVED` `[E085]` |
| Mollie webhook | Begrensde body/content-type, providerbetaling terughalen, tenant/bedrag/mode/metadata controleren en idempotency | `OBSERVED` `[E050]` |
| Bestanden | Private buckets, RLS/padscoping, 20 MB, MIME-allowlist, signed URL 5 min | `OBSERVED` `[E034]` |
| Back-up | Storage encrypt-before-upload, checksummanifest, no-overwrite restore | `OBSERVED` `[E058]` |
| CI | Typecheck/build, dependency audit high, auth/RLS/migration audits, E2E/axe/smokes en exact-SHA releasebewijs | `OBSERVED` `[E084]` |
| Deploy | GitHub Environment, handmatige targetkeuze, standalone release, atomic symlink, systemd/Caddy health en rollbackrunbooks | `OBSERVED` `[E004]` |
| Monitoring | 15-min schedulecode voor health/routes/assets/mail/billing; read-only aggregates; secrets in errors geredigeerd | `OBSERVED` capability `[E071]` |

Encryptie-at-rest voor Supabase, GitHub en VPS is niet vanuit applicatiecode bewezen. Alleen
mailsecret- en Storage-back-upencryptie zijn concreet aangetroffen.

## Autorisatiemodel

- Shellrollen:
  - parent: `parent`, `athlete`;
  - instructor: `instructor`, `tenant_staff`, `tenant_admin`, `tenant_owner`;
  - admin: `tenant_staff`, `tenant_admin`, `tenant_owner`;
  - platform: `platform_support`, `platform_admin`, `platform_owner`.
- DBhelpers controleren alleen actieve memberships/tenants.
- Instructeurstoegang is meestal gekoppeld aan toegewezen groepen/sessies; tenantmanagement heeft
  breder bereik.
- Guardianinzage volgt een actieve parent/guardianlink.
- Bevoorrechte servercode gebruikt vaak de Supabase secret client en passeert RLS; actorchecks en
  `.eq("tenant_id", ...)` zijn dan de primaire grens. `[E021]`

## Directe hoge risico’s/gaten

### 1. Tijdelijk wachtwoord en uitnodiging

Nieuwe users zijn direct e-mailbevestigd, krijgen een actieve membership en ontvangen een tijdelijk
wachtwoord per e-mail. `mustChangePassword` wordt alleen door de private-pageguard afgedwongen; directe
GET-API’s voor private bestanden en offboardingexport gebruiken een authcontext zonder die check.
Dat uitnodigingsexpiry niet in access/login wordt afgedwongen is `OBSERVED`; de misbruikbaarheid
daarvan is `INFERRED`. `[E048]`

### 2. Sessiebeheer

Geen logout/sign-out UI/actie, MFA, device-/sessieoverzicht of expliciete globale sessierevocation na
wachtwoordwijziging gevonden. Supabase dashboardprotecties zijn `UNKNOWN`. `[E049]`

### 3. CSP

De CSP bevat geen `default-src`, `script-src`, `connect-src`, `style-src` of `img-src` en vormt daardoor
geen betekenisvolle resource-/scriptallowlist tegen XSS/data-exfiltratie. `[E082]`

### 4. Misbruikfingerprintfallback

Als `SESSION_SECRET` en `JWT_SECRET` ontbreken, wordt de fingerprint een ongezouten SHA-256 van tenant,
IP en user-agent. De app zou in alle omgevingen fail-closed een aparte secret moeten eisen. `[E027]`

### 5. Least privilege

- `tenant_staff` krijgt de volledige adminshell en de centrale tenantmanagehelper.
- `platform_support` kan platformdata en via diverse RLSpolicies tenantdata lezen.
- `participant_guardians.access_level=view_only` beperkt daadwerkelijke mutatierechten niet.
- Geen JIT-supportapproval, purpose logging of impersonatie (positief: geen impersonatie) gevonden.

`OWNER DECISION REQUIRED` `[E022]`, `[E046]`

### 6. Bestandsveiligheid

De app vertrouwt op aangeleverde MIME en allowlist; geen magic-byte sniffing, malware scanning,
quarantine of SVG-sanitization gevonden. SVG, Office, PDF en afbeeldingen kunnen actieve of gevoelige
inhoud bevatten. `[E034]`

### 7. Export/data lifecycle

Offboardingexport kan incompleet toch `export_ready` worden en hard delete mist Auth/externe providers/
orphan Storage. Zie hoofdstuk 07. `[E070]`

## Auditlogging

Er is geen centraal, immutable en tamper-evident auditlog. Wel bestaan:

- placement audit events;
- import job events;
- tenant events;
- billing/provider events;
- Journey Bot events/issues;
- e-maildelivery attempts;
- onboarding/offboarding actorvelden.

Sommige procesaudits zijn via tenantmanagepolicies update-/deletebaar. Loggingdekking verschilt per
handeling; rolwijzigingen, supportinzage, exports/downloads en consent-/rechtenevents hebben geen
uniform auditcontract. `OBSERVED` `[E044]`, `[E086]`

## Monitoring en incidenten

Workflowcode ondersteunt elke 15 minuten staging én productie wanneer `MONITORING_ENABLED=true`.
Bestaande docs spreken elkaar tegen over actuele production enablement; runtimeflag is niet extern
geverifieerd. `LOG_RETENTION_DAYS` wordt gecontroleerd maar niet technisch op app/DB/systemlogs
toegepast. `CONFLICT` `[E071]`

De monitor kijkt naar availability, assets, mail en billing. Niet aangetroffen:

- mislukte logins/session anomalies;
- privilege-/membershipwijzigingen;
- platform-/supportaccess;
- RLS-denials/anomalieën;
- Storage-malware;
- consent/DSAR/datalekevents;
- centrale exceptiontracking/SIEM.

## Organisatorisch bewijs in repository

Runbooks bestaan voor deploy, rollback, databaseherstel, Storageback-up, incidentmonitoring en
communicatie. Namen van incident-/supportowner kunnen als environmentvariabele worden gecontroleerd.
Repositorycode bewijst niet:

- training, screening of geheimhouding medewerkers;
- access reviews/offboarding personeel;
- branch protection/environment approvals in GitHubinstellingen;
- periodieke pentests of vulnerabilitymanagement buiten dependency audit;
- provideraccount-MFA en sleutelrotatie;
- datalekregister, oefenfrequentie of formele meldprocedure.
