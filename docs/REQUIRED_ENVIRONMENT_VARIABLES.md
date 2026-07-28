# Vereiste environmentvariabelen

## Communicatiehub en e-mail

| Naam | Doel | Module | Nu/later | Placeholder | Configureren | Opmerking |
| --- | --- | --- | --- | --- | --- | --- |
| `EMAIL_SENDING_ENABLED` | Expliciete releasegate voor externe communicatie vanuit de Communicatiehub | Nieuwsbrieven, templates en toekomstige externe threaddelivery | Nu veilig uit; pas aan na release-go | `false` | GitHub environment variable en VPS runtime-env | Alleen exact `true` staat een provider-call toe. Providerconfiguratie, toestemming en menselijke bevestiging blijven daarnaast verplicht. Transactionele platformmail buiten de hub behoudt zijn bestaande providerinstellingen. |
| `SENDGRID_API_KEY` | Fallback SendGrid API-key wanneer geen platformbrede providerinstelling beschikbaar is | E-mailprovider | Optioneel | `placeholder_add_later` | GitHub environment secret en VPS runtime-env | Secret; nooit als `NEXT_PUBLIC_*` of in clientcode gebruiken. Platform Global Instellingen heeft voorrang. |
| `SENDGRID_FROM_EMAIL` | Gedocumenteerde fallback-afzender voor de Communicatiehub | E-mailprovider | Optioneel | `placeholder_add_later` | GitHub environment variable | Gebruik een in SendGrid geverifieerde afzender. De bestaande runtime ondersteunt ook `SMTP_FROM_EMAIL`. |
| `SENDGRID_FROM_NAME` | Gedocumenteerde fallback-afzendernaam | E-mailprovider | Optioneel | `NXTTRACK` | GitHub environment variable | Niet geheim. De tenantnaam kan in templates als `{{tenant_name}}` worden gebruikt. |

WhatsApp en SMS blijven uit zolang er geen afzonderlijke provider, tenantinstelling, kanaaltoestemming en juridische goedkeuring aanwezig zijn. De huidige implementatie doet zonder die configuratie geen externe calls.

## Veilige web-push

| Naam | Doel | Module | Nu/later | Placeholder | Configureren | Opmerking |
| --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` | Browser laat een gebruiker een pushabonnement voor deze applicatie maken | Ouderprofiel en service worker | Optioneel; nodig om web-push te activeren | leeg | GitHub environment variable en VPS runtime-env | Publieke VAPID-key; dit is bewust geen secret. |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Ondertekent pushberichten op de server | Push delivery | Optioneel; nodig om web-push te activeren | leeg | GitHub environment secret en VPS runtime-env | Server-only. Nooit onder een `NEXT_PUBLIC_`-naam opslaan. |
| `WEB_PUSH_VAPID_SUBJECT` | Contactadres voor de pushprovider | Push delivery | Optioneel; nodig om web-push te activeren | `mailto:admin@nxttrack.nl` | GitHub environment variable en VPS runtime-env | Geldige `mailto:`- of HTTPS-URI. |

Web-push blijft vanzelf uit zolang niet alle drie waarden geldig zijn. Toestemming wordt per gebruiker én apparaat vastgelegd. De payload bevat alleen een generieke servicetekst en een interne route; geen namen of medische/financiële details.

## Analytics

| Naam | Doel | Module | Nu/later | Placeholder | Configureren | Opmerking |
| --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` | GA4 voor de publieke NXTTRACK-marketingsite | Consent-aware marketing analytics | Optioneel voor staging, nodig vóór commerciële marketingmeting | leeg | GitHub environment variable per environment | Alleen een meet-ID zoals `G-XXXXXXXXXX`; dit is geen secret. De tag blijft geblokkeerd tot toestemming. Tenantwebsites gebruiken hun eigen meet-ID in Organisatie → Instellingen. |

## Journey Simulation Bot

| Naam | Doel | Module | Nu/later | Placeholder | Configureren | Opmerking |
| --- | --- | --- | --- | --- | --- | --- |
| `CRON_SECRET` | Beveiligt `POST /api/internal/journey-bot/tick`, `POST /api/internal/next-best-actions`, `POST /api/internal/automation-recipes/tick` en `POST /api/internal/participant-media/expire` | Journey Bot, Next Best Actions, de review-only automation-recipe runner en fysieke media-expiry | Nodig voor geplande runs | `placeholder_add_later` | GitHub environment secret en VPS runtime-env | Gebruik minimaal 32 willekeurige tekens. Nooit committen. Media-expiry verwijdert uitsluitend objecten waarvan de bewaartermijn is verstreken of waarvan verwijdering al bevestigd is. |
| `INTERNAL_JOBS_ENABLED` | Releasegate voor Next Best Actions, Automation Recipes en participant-media expiry | Geplande interne GitHub Actions-jobs | Na een bewezen deployment | `false` | GitHub environment variable per environment | Ontbrekend of iedere andere waarde dan exact `true` houdt de drie jobs veilig uit. Zet staging pas aan nadat de matching SHA en migraties live zijn; productie uitsluitend binnen de goedgekeurde releaseprocedure. |
| `JOURNEY_BOT_DEFAULT_ENABLED` | Documenteert de gewenste defaultstatus | Control plane | Later | `false` | GitHub environment variable | Een databaseconfig moet daarnaast expliciet enabled zijn. |
| `JOURNEY_BOT_EMAIL_DOMAIN` | Domein voor herkenbare testaccounts | Testdatagenerator | Nu | `nxttrack.test` | GitHub environment variable | Gebruik een niet-bezorgbaar testdomein. |
| `ALLOW_JOURNEY_BOT_SEED` | Eenmalige mutatieguard voor De Waterlijn-seed | Staging seed script | Alleen tijdens seed | `false` | Alleen als job-env in de staging seedworkflow | Nooit in de permanente runtime-env inschakelen. |

De Journey Bot forceert `suppress_external_notifications=true` en `suppress_real_payments=true`. Deze twee beveiligingen zijn niet vanuit de UI uit te schakelen.

De automation-recipe runner en participant-media expiry hergebruiken bewust hetzelfde interne `CRON_SECRET`; er is geen extra secret nodig. Tenantrecipes hebben daarnaast een database-afgedwongen `review_only`-grens en kunnen geen externe delivery activeren.
