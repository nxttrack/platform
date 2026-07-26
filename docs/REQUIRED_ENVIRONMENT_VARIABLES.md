# Vereiste environmentvariabelen

## Analytics

| Naam | Doel | Module | Nu/later | Placeholder | Configureren | Opmerking |
| --- | --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` | GA4 voor de publieke NXTTRACK-marketingsite | Consent-aware marketing analytics | Optioneel voor staging, nodig vóór commerciële marketingmeting | leeg | GitHub environment variable per environment | Alleen een meet-ID zoals `G-XXXXXXXXXX`; dit is geen secret. De tag blijft geblokkeerd tot toestemming. Tenantwebsites gebruiken hun eigen meet-ID in Organisatie → Instellingen. |

## Journey Simulation Bot

| Naam | Doel | Module | Nu/later | Placeholder | Configureren | Opmerking |
| --- | --- | --- | --- | --- | --- | --- |
| `CRON_SECRET` | Beveiligt `POST /api/internal/journey-bot/tick` | Journey Bot runner | Nodig voor geplande runs | `placeholder_add_later` | GitHub environment secret en VPS runtime-env | Gebruik minimaal 32 willekeurige tekens. Nooit committen. |
| `JOURNEY_BOT_DEFAULT_ENABLED` | Documenteert de gewenste defaultstatus | Control plane | Later | `false` | GitHub environment variable | Een databaseconfig moet daarnaast expliciet enabled zijn. |
| `JOURNEY_BOT_EMAIL_DOMAIN` | Domein voor herkenbare testaccounts | Testdatagenerator | Nu | `nxttrack.test` | GitHub environment variable | Gebruik een niet-bezorgbaar testdomein. |
| `ALLOW_JOURNEY_BOT_SEED` | Eenmalige mutatieguard voor De Waterlijn-seed | Staging seed script | Alleen tijdens seed | `false` | Alleen als job-env in de staging seedworkflow | Nooit in de permanente runtime-env inschakelen. |

De Journey Bot forceert `suppress_external_notifications=true` en `suppress_real_payments=true`. Deze twee beveiligingen zijn niet vanuit de UI uit te schakelen.
