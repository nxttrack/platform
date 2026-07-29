# Shadow packages en featureflags

## Doel

NXTTRACK kan pakketproposities en zachte gebruikslimieten onderzoeken zonder
tenanttoegang te wijzigen. De control plane staat op `/platform/packages`.

Dit model bevat bewust geen prijzen, checkout of factureringslogica.

## Strikte scheiding

### Technische releaseflags

`platform_release_flags` beschrijft technische rolloutstatus. De huidige UI
beheert alleen de inventaris; er is nog geen runtime-autorisatie aan gekoppeld.

### Commerciële features en pakketten

De commerciële catalogus bestaat uit:

- `platform_commercial_features`
- `platform_package_catalog`
- `platform_package_entitlements`
- `platform_package_limits`
- `tenant_package_assignments`

Een commerciële feature is nooit een technische releaseflag. Applicatiecode mag
de twee modellen niet als fallback voor elkaar gebruiken.

## Shadow-garanties

- `tenant_package_assignments.evaluation_mode` accepteert uitsluitend `shadow`.
- De evaluatie-engine retourneert voor iedere uitkomst `allowed: true`.
- De standaard `legacy_full_access` bevat iedere actieve commerciële feature.
- De migratie koppelt alle bestaande tenants aan `legacy_full_access`.
- Een databasetrigger koppelt ook iedere nieuwe tenant aan deze veilige standaard.
- Zachte limieten produceren alleen `within`, `approaching`, `exceeded` of
  `not_measured`.
- Een overschrijding blokkeert geen pagina, API, account, mutatie of achtergrondtaak.
- Package-mutaties lopen via platform owner/admin-serveractions en worden in
  `platform_admin_audit_events` vastgelegd.
- Het wijzigen van een tenantsimulatie vraagt expliciete menselijke bevestiging.

## Brondata

De control plane meet momenteel:

- actieve niet-testleerlingen;
- actieve medewerkers;
- actieve locaties;
- gevolgde opslag uit tenantdocumenten, privacyveilige voortgangsmedia en
  websitemedia.

Journey Bot-records tellen niet mee bij leerlingen of voortgangsmedia.

## Toekomstige handhaving

Handhaving mag niet via een configuratie- of UI-wijziging worden geactiveerd. Er
is altijd een afzonderlijke, gereviewde database- en applicatiemigratie nodig met:

1. een expliciet productbesluit per feature;
2. een tenantimpactanalyse en grandfatheringbeleid;
3. preview en communicatie naar getroffen tenants;
4. gerichte RLS-, API- en browsertests;
5. een rollbackpad dat toegang direct herstelt;
6. handmatige productie-go/no-go.

Tot die migratie blijft de pakketmodule uitsluitend observerend.

## Configuratie

Deze module heeft geen nieuwe secrets of environmentvariabelen nodig.
