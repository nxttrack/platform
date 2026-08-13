# Ocean Quest — productieassetmanifest

Bronarchief: 85.900.138 bytes, SHA-256 `8d5b647dabc54c5a72ba279914307a31466cf1666d46933251eca36fee8ea579`.

De volledige, reproduceerbare broninventaris staat in `docs/codex-input/ocean-quest-v1.0.0/SOURCE_MANIFEST.sha256`. De vier nieuw aangesloten productie-PNG's zijn byte-for-byte kopieën:

| Productiepad | Rol | Afmetingen | Alpha | SHA-256 |
|---|---|---:|---:|---|
| `/portal-themes/ocean-quest/journey-desktop.png` | Desktop scenery voor overview/journey | 1983×793 | nee | `c8f4ca9f64608dffb2579d5494ff1cc811459e238b0b55727eda77296e64de7b` |
| `/portal-themes/ocean-quest/journey-mobile.png` | Eigen portrait scenery; geen desktopcrop | 853×1844 | nee | `fcfd746bb3b186d3e6a29702aa1eee020347f1b0491761eb14a8a79674fb1615` |
| `/portal-themes/ocean-quest/journey-completed.png` | Immutable afgerond-hoofdstuk-art | 1983×793 | nee | `8183dc2282b61b234b103095774d813171b63d5f9b1207ed4f18d95ef7d619ca` |
| `/portal-themes/ocean-quest/mascot.png` | Losse transparante Manta-laag | 1706×922 | ja (RGBA) | `b84d87656b55646bc8bee3697b1b72093846d89e06f87055ca051a49f3a6dde0` |

Tekst, markers, ringen, badges, logo's en persoonsgegevens worden als live UI/datalagen gerenderd en zitten niet in scenery. De bestaande geoptimaliseerde AVIF/WebP-renditions en assets van themes 1–6 zijn niet door deze sprint herschreven.

Definitieve badgeart hoort niet bij deze sprint. Zowel parent als child gebruiken `BadgeArtworkPlaceholder` met `badgeArtworkReady: false` en `placeholderOnly: true`; bestaande historische bestanden onder theme-assets zijn geen door deze sprint gepubliceerde badgecollectie.
