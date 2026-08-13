> **SUPERSEDED VOOR CONTROL MODE EN SCOPE.** De bronintegriteit, archiefcontrole en bronmapping uit dit document blijven normatief; de uitvoeringsmodus wordt vervangen door `NXTTRACK_CODEX_CLOUD_PARENT_CHILD_IMPLEMENTATIESPRINT_V1.0.md`.

# Codex Cloud-bronnenaddendum — Ocean Quest

## Doel

Dit addendum corrigeert uitsluitend de bronverwijzingen uit `OPVOLGTAAK_CODEX_OCEAN_QUEST_7E_THEME.md`. Het voorkomt dat Codex Cloud blokkeert op twee oudere losse exportnamen terwijl de latere definitieve exports in het aangeleverde Ocean Quest-pakket aanwezig zijn.

Dit addendum geeft **nog geen toestemming om de functioneel verouderde ouder-/kindportaal-scope uit te voeren**. De implementatieopdracht moet eerst worden aangepast aan de inmiddels gekozen scheiding:

- ouder regelt;
- kind beleeft, ontdekt en viert voortgang;
- één technische kern, maar server-side gescheiden capabilities en twee verschillende ervaringsmodi;
- het kinderportaal blijft premium en interactief en wordt niet cartoonachtiger of visueel goedkoper.

## Verplicht aangeleverd archief

Bestand:

`NXTTRACK_Ocean_Quest_Definitief_Complete.zip`

Verwachte grootte:

`85.900.138 bytes`

Verwachte SHA-256:

`8d5b647dabc54c5a72ba279914307a31466cf1666d46933251eca36fee8ea579`

Stop wanneer het archief ontbreekt, niet leesbaar is of een andere checksum heeft.

## Uitpakken

Pak het archief repo-relatief uit naar:

`docs/codex-input/ocean-quest-v1.0.0/`

Na het uitpakken moet minimaal bestaan:

- `docs/codex-input/ocean-quest-v1.0.0/portal-final/index.html`
- `docs/codex-input/ocean-quest-v1.0.0/portal-final/DESIGN_CANON.md`
- `docs/codex-input/ocean-quest-v1.0.0/portal-final/README.md`
- `docs/codex-input/ocean-quest-v1.0.0/portal-final/screens/desktop/overview.png`
- `docs/codex-input/ocean-quest-v1.0.0/portal-final/screens/mobile/overview.png`
- `docs/codex-input/ocean-quest-v1.0.0/portal-final/boards/NXTTRACK_Ocean_Quest_Complete_desktop.png`
- `docs/codex-input/ocean-quest-v1.0.0/portal-final/boards/NXTTRACK_Ocean_Quest_Complete_mobile.png`
- `docs/codex-input/ocean-quest-v1.0.0/portal-final/assets/quest-current-desktop.png`
- `docs/codex-input/ocean-quest-v1.0.0/portal-final/assets/quest-current-mobile.png`
- `docs/codex-input/ocean-quest-v1.0.0/portal-final/assets/quest-completed-chapter.png`
- `docs/codex-input/ocean-quest-v1.0.0/portal-final/assets/manta-friendly.png`

Het pakket bevat daarnaast alle dertien canonieke desktoprenders en alle dertien canonieke mobiele renders.

## Definitieve bronmapping

De volgende mapping vervangt de letterlijke bestandscontrole uit paragraaf 1 van de oude opvolgtaak:

| Oude verwijzing | Definitieve gezaghebbende bron |
|---|---|
| `NXTTRACK_Ocean_Quest_Complete_desktop.png` | `portal-final/boards/NXTTRACK_Ocean_Quest_Complete_desktop.png` |
| `NXTTRACK_Ocean_Quest_Complete_mobile.png` | `portal-final/boards/NXTTRACK_Ocean_Quest_Complete_mobile.png` |
| `NXTTRACK_Ocean_Quest_Interactive_Dashboard_Desktop_8K.png` | `portal-final/screens/desktop/overview.png` voor exacte finale UI-geometrie; een eventuele oudere 8K-conceptvisual is uitsluitend aanvullende art-direction |
| `NXTTRACK_Ocean_Quest_Interactive_Dashboard_Mobile_LightNav_v2_HighRes.png` | `portal-final/screens/mobile/overview.png`; dit is de latere definitieve lichte-bottomnav-export en vervangt de oudere losse conceptnaam |
| `portal-final/index.html` | exact dezelfde locatie binnen de uitgepakte map |
| `portal-final/DESIGN_CANON.md` | exact dezelfde locatie binnen de uitgepakte map |

Het ontbreken van de twee oudere losse conceptnamen is na deze mapping **geen blocker**. Het ontbreken van de gemapte finale bestanden is wel een blocker.

## Bronvolgorde

Bij visuele of geometrische verschillen geldt:

1. de nog te leveren herziene parent/child-implementatieopdracht voor scope, capabilities en routes;
2. `portal-final/DESIGN_CANON.md` voor ontwerpregels;
3. `portal-final/index.html` voor exacte native HTML/CSS-geometrie en responsive interactie;
4. `portal-final/screens/desktop/overview.png` en `portal-final/screens/mobile/overview.png` voor het definitieve dashboard;
5. de complete desktop- en mobiele boards voor de overige pagina’s;
6. oudere Ocean Quest-conceptvisuals uitsluitend als historische art-direction.

Legacy Ocean Quest-release `1.2.2` en oudere repository-assets zijn `historical-only` en mogen geen definitieve bron vervangen.

## Controlemodus voor nu

Na ontvangst van dit addendum en het archief mag Codex Cloud:

1. het archief valideren en uitpakken;
2. alle gemapte bestanden en checksums controleren;
3. de huidige repository en bestaande zes-theme-baseline read-only inventariseren;
4. rapporteren dat de bronnen compleet en uitvoerbaar zijn.

Codex Cloud mag de oude implementatieopdracht nog niet uitvoeren totdat de herziene opdracht voor het gescheiden ouder- en kinderportaal is aangeleverd. Maak in deze controlemodus geen productiewijzigingen, migrations, commits, pushes, PR's of deployments.
