# Portal theme source masters

Herkomst: `NXTTRACK Five Theme Launch v2.1`, ontvangen op 1 augustus 2026 via de door de opdrachtgever aangeleverde handoff-URL. De pakketmanifestcontrole slaagde vóór import.

Deze PNG-bestanden zijn design-/archiefmasters. Productiecode serveert uitsluitend de met `pnpm run themes:build-assets` gemaakte WebP/AVIF-renditions in `apps/web/public/portal-themes`.

| Bestand | SHA-256 bron |
| --- | --- |
| `nxttrack-default-landscape.png` | `06378fcb32d8e59acd29f3294cd5d1297f941d2fe3313711bd0d9f067f84ca48` |
| `ocean-quest-landscape.png` | `7d2341caf4fccb78b8dd0ddffa4380741cf6fe42f07296de97bad5566bac76e5` |
| `ocean-quest-portrait.png` | `40e13448e68f81871274d6c5894ed0183a0e6a0c6df3e799e59f288cf073a6a4` |
| `dolphin-bay-landscape.png` | `8cb8bd6b32e034eab891bd707b1ed5155dd1b59a979bdab3977b031a1bd82b8e` |
| `dolphin-bay-portrait.png` | `7ebc0a75061855c22368acb6bdca36ee948c0e6dff60a0ec80bc606bc0f683a2` |
| `turtle-trails-landscape.png` | `d3a5b64bcb09bc5158ae4c4329321ecd26ee31295f28760a2f8e364a6d264f61` |
| `turtle-trails-portrait.png` | `12c9ef2319ca525e46afd8d8a1e14cdb870319304845708075b1fd6b41c6f574` |
| `aqua-academy-landscape.png` | `bae5dc5659ad2780cfc14ec62e7bcdd9c5baa0e20d8d5d3bba637dabf5b4b300` |
| `aqua-academy-portrait.png` | `3e7b4054a1ea59ade109bfee096720ea061c395eb5b82e2e77f1268c3806ddd5` |

## Dedicated route masters

| Bestand | SHA-256 bron |
| --- | --- |
| `nxttrack-default-dashboard.png` | `06378fcb32d8e59acd29f3294cd5d1297f941d2fe3313711bd0d9f067f84ca48` |
| `nxttrack-default-progress.png` | `fd951bd65bee0f7b7fecbb127e31ef4ea94dbc7efb246abad70c9b545c78cc40` |
| `ocean-quest-dashboard.png` | `7d2341caf4fccb78b8dd0ddffa4380741cf6fe42f07296de97bad5566bac76e5` |
| `ocean-quest-dashboard-mobile.png` | `40e13448e68f81871274d6c5894ed0183a0e6a0c6df3e799e59f288cf073a6a4` |
| `ocean-quest-journey.png` | `db522deb90c3b91ef441f124e9c80c98a321e363a64ce9df159bb282c82da7fd` |
| `ocean-quest-journey-mobile.png` | `3bcaf40839cf3a939035b254dd7129c67cca4c6ab01384e227058112e54976d6` |
| `ocean-quest-lesson.png` | `6fff4e490edbf6127abcb4d8462a6520da21702e93bae54fb17a941e4f2978cf` |
| `ocean-quest-reward.png` | `5adfa1408c2a81efd76c5a16fb4a943c78c3d643ee0395d21ae3f083ca17cb2c` |

De twaalf Default- en twaalf Ocean Quest-badgemasters inclusief hun semantische `family.json` staan onder `badges/`. De build maakt daar 128/256/512/1024 WebP en een 1024 PNG archival rendition van. Locked en surprise worden door UI-state opgebouwd; het unlocked masterasset wordt daarvoor niet aangepast of voortijdig geladen.
