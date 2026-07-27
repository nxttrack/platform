# Vereiste environmentvariabelen

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
