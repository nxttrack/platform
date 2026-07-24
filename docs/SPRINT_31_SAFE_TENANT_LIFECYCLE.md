# Sprint 31 — veilige instroom en tenant-lifecycle

## Resultaat

Sprint 31 verbindt publieke intake, tenant-onboarding, gegevensimport, offboarding en de beheerde demo tot één herleidbare lifecycle. Alle mutaties lopen server-side met tenant-scoping. Nieuwe tabellen hebben RLS + FORCE RLS en service-role toegang is beperkt tot de server.

## Invloedrijke ontwerpkeuzes

1. **Intake blokkeert niet agressief op mogelijke dubbelen.** Een exacte retry binnen tien minuten retourneert dezelfde referentie. Een overeenkomst binnen dertig dagen wordt opgeslagen als `possible_duplicate`, zodat broers/zussen of gewijzigde voorkeuren niet verloren gaan.
2. **Geen ruwe IP-opslag.** Rate limiting gebruikt een HMAC-fingerprint van tenant, proxyadres en user-agent. De teller heeft kwartierwindows met vijf toegestane pogingen en automatische beperkte retentie.
3. **Een tenant opent alleen op een geverifieerd NXTTRACK-subdomein.** Een eigen domein mag tijdens onboarding worden aangevraagd, maar blijft `pending` tot de bestaande DNS-verificatie is afgerond.
4. **Onboarding is fail-closed.** Bij een fout blijft de tenant `inactive`; de run bewaart stap en fout. Uitnodigingen kunnen niet stil als “gelukt” gelden.
5. **CSV-import is create-only.** Apply overschrijft nooit bestaande records. Duplicaten worden overgeslagen. Rollback gebruikt een server-ondertekend manifest om manipulatie via clientrechten te voorkomen.
6. **Ouderimport verstuurt echte uitnodigingen.** Een rollback trekt de pending uitnodiging en tenantrol in, maar verwijdert een eenmaal aangemaakte globale auth-identiteit niet; die identiteit kan ook bij andere tenants horen.
7. **Offboarding scheidt data-export en objectback-up.** De JSON-export bevat alle tenanttabellen, tellingen, SHA-256 en storagepaden. Private objecten blijven via het bestaande versleutelde storage-backuprunbook lopen en moeten vóór sluiting aantoonbaar zijn veiliggesteld.
8. **Definitieve verwijdering is nooit automatisch.** Minimaal dertig dagen retentie, platform-owner autorisatie, twee tekstbevestigingen en een blijvende niet-PII tombstone zijn verplicht.
9. **Er is precies één showcase-tenant.** `waterlijn-demo` is idempotent te onderhouden en raakt geen E2E-authrollen.

## Publieke intake

- Honeypot: `companyWebsite`.
- Minimum invultijd: 250 milliseconden als aanvullend direct-POST-signaal; honeypot en rate limit blijven primair.
- Limiet: vijf submissions per tenant/fingerprint per vijftien minuten.
- Exacte retry: idempotent gedurende tien minuten.
- Mogelijk dubbel: gelijke genormaliseerde oudermail + leerlingnaam + programma + intaketype binnen dertig dagen.
- Tenant-admin beoordeelt in `/admin/intake` met **Dubbel** of **Uniek**.

## Onboarding

Start via `/platform/onboarding`. De wizard maakt achtereenvolgens:

1. inactieve zwemschooltenant en Nederlandse instellingen;
2. verified NXTTRACK-subdomein en optioneel pending custom domein;
3. actieve branding;
4. programma en badjes/niveaus;
5. locatie, zwembad en eerste groep;
6. actief maandbetaalplan;
7. owner- en instructeuruitnodigingen;
8. openingscheck en activatie.

Een custom domein wordt na DNS-validatie in het bestaande domeinbeheer geverifieerd en kan daarna primair worden gemaakt.

## CSV-contract

| Type | Verplicht | Optioneel |
| --- | --- | --- |
| Leerlingen | `display_name` | `birth_date`, `external_reference`, `guardian_email` |
| Ouders | `full_name`, `email` | — |
| Groepen | `name`, `code`, `program_code` | `stage_code`, `resource_code`, `capacity`, `weekday`, `start_time`, `end_time` |
| Inschrijvingen | `participant_reference`, `program_code` | `stage_code`, `starts_on` |
| Betalingen | `participant_reference`, `amount_eur`, `due_on` | `status` |
| Gemengd | `record_type` plus velden van het recordtype | Nederlandse enkelvoudaliases worden geaccepteerd |

Voor gemengde bestanden is de applyvolgorde: ouders → leerlingen → groepen → inschrijvingen → betalingen. Een betaling vereist vooraf een actief abonnement; import maakt geen incassomandaat of abonnement stil aan.

## Offboarding

1. Start de run in `/platform/offboarding` met reden en bewaartermijn.
2. Download de JSON-export; bewaar de responseheader `X-Content-SHA256`.
3. Exporteer de genoemde storagepaden via `docs/STORAGE_BACKUP_RUNBOOK.md`.
4. Sluit het account; tenant en memberships worden suspended.
5. Bewaar data tot `retention_ends_at`.
6. Platform owner typt eerst de tenant-slug om verwijdering goed te keuren.
7. Platform owner typt daarna `VERWIJDER <slug>` om objecten en tenantdata definitief te verwijderen.
8. Controleer de tombstone en leg het offboardingbewijs vast in het incident-/klantdossier.

## Validatie

```bash
pnpm run release:audit-sprint31
pnpm run typecheck
pnpm run db:audit
pnpm run db:rls-audit
pnpm run build
```

Na migratie op staging: draai de demo-seed, de volledige browserrun en controleer intake rate limiting, onboarding met testadressen, één import + rollback en een offboardingrun zonder definitieve verwijdering.
