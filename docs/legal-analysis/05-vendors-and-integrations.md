# 05 — Leveranciers en integraties

Alle rollen zijn `ROLE CANDIDATE`; “actief” betekent dat runtimecode bestaat en de benodigde
configuratie de integratie kan inschakelen.

## Leveranciersregister

| Dienst | Doel en integratiepunt | Uitgaand/inkomend | Omgeving/flag | Essentieel/uit | Contract, regio, transfer | Status |
|---|---|---|---|---|---|---|
| Supabase Database/PostgREST/Auth/Storage | SSR/browser/server clients; centrale DB/Auth en private bestanden | Vrijwel alle productdata, Authidentiteit/cookies, documenten/diploma’s; signed URLs | dev/staging/productie indien Supabase-envs | Essentieel; zonder config anonieme/geen datadiensten | Regio, plan, DPA, subprocessors, at-rest encryptie en transferconfig `UNKNOWN` | `OBSERVED` `[E054]` |
| Twilio SendGrid API | Server POST `/v3/mail/send` voor uitnodiging, reset, aanbod en notificatie | To/From, naam, subject, text/html; HTTP-status en message-id terug | Config-afhankelijk; platformsetting heeft voorrang, env fallback | Uitschakelbaar; e-mail wordt skipped/failed | DPA, regio, accountretentie, subleveranciers `UNKNOWN` | `OBSERVED` `[E055]` |
| Configureerbare SMTP-provider | Zelfgebouwde SMTP-client; host/user/password uit platform/env | Zelfde mailinhoud; SMTP-transport | Alternatief voor SendGrid | Uitschakelbaar | Provideridentiteit, land, DPA en retentie `UNKNOWN` | `OBSERVED capability` `[E055]` |
| Mollie | Directe v2 API + webhook; checkout, first/recurring payment, mandate, refund, chargeback | Guardiannaam/-mail, bedrag/valuta/omschrijving, interne UUID-metadata, URLs; provider IDs/status/last4/payload terug | Per tenant config, test/live key, status; recurring + automatic collection flags | Optioneel; manual billing blijft mogelijk | Merchant, DPA/rol, regio, bewaartermijn en live activatie `UNKNOWN` | `OBSERVED` `[E036]` |
| Google Analytics 4 / Google tag | Dynamische `gtag.js` op publieke marketing-/tenantlayout | Expliciet page URL zonder query, path, title, acquisitiekanaal, leadtype; Google ontvangt technisch request/browserdata | Alleen geldig meet-ID + analyticsconsent `granted` | Volledig optioneel | Propertyowner, DPA, regio, transfers, IP/device- en retentie-instellingen `UNKNOWN` | `OBSERVED` `[E056]` |
| GitHub Actions/Artifacts | CI/CD, audits, schedules, releasebewijs en encrypted Storage-back-up | Bron/buildmetadata, env/secrets aan runners; versleutelde tenantobjecten + summary als artifact | staging/productie; workflowafhankelijk | Essentieel voor huidige releaseflow; back-up handmatig | GitHub-plan, artifactregio, DPA, runnerbeheer/transfer `UNKNOWN` | `OBSERVED` `[E058]` |
| VPS-hostingprovider | Node standalone via systemd; Caddy reverse proxy/TLS; self-hosted runner | Alle applicatie-HTTP-verkeer en serverlogs kunnen technisch passeren | staging/productie | Essentieel | Providernaam, regio, beheerders, logretentie, TLS-issuer, DPA `UNKNOWN` | `INFERRED vendor / OBSERVED infra` `[E013]` |
| Alertwebhook (mogelijk Slack/Teams/Discord/generic) | Monitor POST; format bepaalt `{text}`, `{content}` of JSON | Omgeving, checks/failures, ownernamen, SHA, GitHub-run-URL, timestamp; geen mailbody/recipient volgens code | `MONITORING_ENABLED`, `MONITOR_ALERTS_ENABLED`, secret URL | Optioneel; monitor kan zonder alert | Werkelijke endpoint/leverancier, account, DPA/regio `UNKNOWN` | `OBSERVED capability` `[E057]` |
| Zakelijke mailbox | `mailto:` voor demo/contact | Door afzender gekozen mailinhoud | publiek, alle omgevingen | Commercieel kanaal, niet apptechnisch | Mailboxprovider en beleid `UNKNOWN` | `INFERRED vendor` `[E063]` |

## Supabase-detail

- `@supabase/ssr` en `@supabase/supabase-js` zijn actieve runtimepackages. De browser gebruikt een
  publishable/legacy anon key; de server-adminclient vereist `SUPABASE_SECRET_KEY` en bewaart geen
  sessie. `[E054]`
- Twee private buckets bestaan: `tenant-documents` en `diploma-vault`, beide maximaal 20 MB met
  MIME-allowlists. Downloads gebruiken een signed URL van vijf minuten. `[E034]`
- Geen actieve Supabase Realtime- of Edge Function-aanroep gevonden.
- De repository controleert dat staging en productie verschillende projectfingerprints hebben, maar
  bewijst niet welk project/plan/regio nu live is. `[E011]`

## SendGrid/SMTP-detail

- Platformbrede DB-instellingen gaan voor op omgevingsfallback. SendGridkey en SMTP-wachtwoord worden
  AES-256-GCM versleuteld in DB; de encryptiesleutel komt uit een server-only secretketen. `[E055]`
- De lokale delivery attempt bevat ontvanger-e-mail, subject, provider/source, status, error,
  related IDs, metadata en tijden; geen mailbody in die tabel. `[E033]`
- Het product heeft geen nieuwsbrief-/bulkmarketingflow of unsubscribe aangetroffen; de actieve
  e-mails zijn transactionele productflows.

## Mollie-detail

- API-data omvat interne tenant-, payment-, subscription-, customer-, mandate- en collection-ID’s in
  metadata. Dat zijn pseudonieme identifiers, maar ze blijven koppelbaar in NXTTRACK. `[E036]`
- Webhooks accepteren een begrensde klassieke payment-ID, halen de actuele betaling bij Mollie op en
  vergelijken provider/tenant/bedrag/status voordat lokale mutaties volgen. `[E050]`
- Productie-scheduling is niet automatisch bewezen: de schedule-job verwerkt staging; productie vraagt
  expliciete manual dispatch plus actieve tenantflags/config. `[E077]`

## Google Analytics-detail

- Dit is een directe Google-tag/GA4-integratie, geen bewijs van een Google Tag Manager-container.
- Google-tag wordt pas na toestemming geladen; default consent is denied, adsredaction staat aan en
  Google signals/adpersonalization staan uit. `[E056]`
- De expliciete eventpayload bevat geen intakevelden, namen, e-mail of kinddata. Niet uit de repository
  vast te stellen is welke automatische technische gegevens GA daarnaast verzamelt of hoe de property
  extern is ingesteld.

## GitHub, hosting en back-upketen

- Deployment gebruikt zowel GitHub-hosted als self-hosted Linux runners en GitHub Environments voor
  variabelen/secrets. Productiereleases worden via symlink/systemd/Caddy geactiveerd. `[E004]`, `[E013]`
- De handmatige Storage-back-up downloadt alle objecten uit de twee private buckets, maakt checksums,
  versleutelt vóór artifactupload en gebruikt 30 dagen artifactretentie. `[E058]`
- De runbook noemt een nog te kiezen immutable lange-termijnbestemming en schedule/RPO; dit is
  `PLANNED`, niet een aangetroffen leverancier.

## Niet als actieve gegevensdienst aangetroffen

Repositorybrede zoekactie vond geen actieve runtime-integratie voor Cloudflare, Vercel, Sentry,
PostHog, Meta Pixel, Hotjar, Microsoft Clarity, OneSignal, Firebase, Expo, Apple/Google Play, OpenAI,
Anthropic, Mapbox/Google Maps, Stripe, Zapier, Make, Intercom/Zendesk, Segment/Mixpanel, Plausible,
Matomo, reCAPTCHA, hCaptcha of Turnstile. `[E060]`

Radix, TanStack, React, Next.js, Tailwind, Recharts en andere npm-packages zijn bron-/runtimecode,
maar zonder aangetroffen netwerkdatadienst geen leveranciers van persoonsgegevens in dit register.

## Informatie per leverancier opvragen

Voor iedere werkelijk gecontracteerde dienst: juridische entiteit, dienstomschrijving, rolafspraak,
DPA, subleveranciers, verwerkingslanden/regio, doorgiftemechanisme, encryptie, toegangsbeheer,
incidentmelding, auditrechten, retentie/verwijdering, export/exit en accountowner.

