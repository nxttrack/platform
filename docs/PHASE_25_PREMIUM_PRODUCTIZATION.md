# Phase 25 — Premium productization sprint

Datum: 23 juli 2026  
Status: code, migraties en volledige stagingvalidatie compleet
Gevalideerde staging-SHA: `d0fa414c8deaeea4d74f417e4fb8f1df3b3c707e`
Stagingrun: `29976973471`

## Geleverde productlaag

- Interactie-designsysteem: command palette, combobox, popover, dropdown, tooltip, toast, skeleton, progress, loading shell, calendar/date picker, toegankelijke select/checkbox, dirty-state, wizard en undo-patroon.
- Herbruikbare DataTable boven TanStack Table met zoeken, filters, sortering, kolomkeuze, selectie, bulk-action boundary, pagination, detailsheet en browser-presets per rol/resource.
- Smart Placement & Capacity Cockpit met verklaarbare voorstellen, alternatieven, redenweergave, capaciteit en handmatige goedkeuring.
- Parent mobile-first familiecommandocentrum met multi-child switcher, eerstvolgende actie, voortgang en tijdlijn.
- Instructor tablet/poolside flow met grote touch targets, sticky acties en geautoriseerde batch-attendance.
- Platform control plane met tenant-, domein-, mail- en owner-drift signalen.
- Automation builder met RLS-afgedekte regels en idempotente run-opslag.
- Herstelbare CSV-importjobs met delimiterdetectie, previewopslag, validatie, duplicate detection, limieten en annulering vóór operationele mutatie.
- White-label configuratie met live preview, e-mailcopy, tenantkleuren en branded-PWA vlag.
- Mollie checkout via server-side environment references, `Idempotency-Key` en provider-verified webhookverwerking.
- What-if planboard met drag/drop, toetsenbordalternatief, conflictcheck, expliciet toepassen en database-backed undo.
- School Health & Growth met bezetting, wachtlijstconversie, attendance en betaalachterstand gekoppeld aan vervolgstappen.
- PWA manifest en veilige offline-indicator. Alleen statische build-assets worden gecachet.
- Consent-datamodel voor foto/video-evidence; private evidence mag pas worden toegevoegd na een expliciete geldige consentcheck.

## Bewuste veiligheidsgrenzen

Deze grenzen zijn productbeslissingen en mogen niet stilzwijgend worden versoepeld:

1. De service worker cachet geen navigaties, API-antwoorden of geauthenticeerde gegevens. Echte offline rosters vereisen eerst versleutelde device-opslag, remote revoke en een geteste synchronisatie-/conflictstrategie.
2. Importjobs wijzigen nog geen leerlingen, ouders of betalingen. De huidige stap is een herstelbare validatiepreview. Veldmapping en definitieve apply/rollback vereisen per importtype expliciete product-owner mappingregels.
3. Automationregels worden geconfigureerd, maar externe acties worden niet door een ongecontroleerde webrequest uitgevoerd. Een scheduler/worker moet runs claimen met de database-idempotency key, retries begrenzen en delivery-resultaten auditen.
4. Media-consent is gemodelleerd, maar upload-UI blijft dicht totdat consentcontrole in upload én download is afgedwongen.
5. Live Mollie wordt niet automatisch geactiveerd. De providerconfig moet verwijzen naar een bestaande `MOLLIE_*` environment variable en eerst in testmode worden gevalideerd.

## Stagingconfiguratie

1. Laat de deployworkflow migraties `20260723120000_phase_25_premium_operations.sql` en `20260723140000_phase_26_planning_undo.sql` toepassen.
2. Voeg voor Mollie testmode een environment secret toe, bijvoorbeeld `MOLLIE_API_KEY`, met een `test_...` key.
3. Sla in providerconfig als secret reference `ENV:MOLLIE_API_KEY` op; nooit de sleutel zelf.
4. Gebruik `https://staging.nxttrack.nl/api/webhooks/mollie` als webhook. De code vult dit op basis van `APP_URL` in.
5. Valideer achtereenvolgens: checkout aangemaakt, browserredirect, webhook 200, payment session `paid`, manual payment `paid`, exact één billing event.

## Release-evidence

Verplicht vóór productie:

- `pnpm release:audit-premium`
- `pnpm hardening:local`
- staging browsercontrole van `/admin/wachtlijst`, `/admin/agenda`, `/admin/automatisering`, `/admin/importeren`, `/admin/branding`, `/admin/betalingen`, `/admin/rapportages`, `/portaal`, `/instructor/group/:id` en `/platform`
- keyboard-only controle van command palette, DataTable, detailsheet, wizard en planboard
- Mollie testbetaling plus herhaalde webhook om idempotency te bewijzen
- RLS role smoke na de nieuwe migraties

### Uitgevoerd op staging

- De gewone CI-run `29976969702` is volledig groen voor de gevalideerde SHA.
- Deploy, hardening, build, database-migraties, health en runtime smoke zijn groen.
- De operationele Phase 16-flow en alle Sprint 4-mutaties zijn groen voor placement, instructor, parent en tenant-admin.
- Role- en tenantisolatie, alle vier accessibility/performance-budgetcases en de Phase 15 staging/security-truth-check zijn groen.
- Alle 56 Priority A-screenshots zijn SHA-gebonden gegenereerd en de compacte logfallback is bewaard.
- GitHub heeft de screenshot- en release-evidence artifacts niet duurzaam geregistreerd omdat de Actions artifact-storagequota nog vol is. Er zijn daarom nul downloadbare artifacts op run `29976973471`; dit blijft een productie-go/no-go-punt en wordt niet opgelost door bestaand bewijs zonder expliciete toestemming te verwijderen.
- Een echte Mollie-testbetaling en herhaalde webhook zijn niet uitgevoerd zonder een expliciet geconfigureerde testkey en blijven verplicht voordat billing voor een tenant wordt geactiveerd.

## Volgende productbeslissingen

- Import mappingcontracten per ondersteund bronsysteem en welke records na apply automatisch mogen worden aangemaakt.
- Automation worker/SLA, retrybeleid en toegestane externe actions.
- Offline roster threat model en devicebeheer.
- Bewaartermijnen, toestemmingsteksten en ouderflow voor media-evidence.
- Definitieve fotografie, marketingcopy en branded iconset per tenant.
