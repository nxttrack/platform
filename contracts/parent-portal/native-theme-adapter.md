# Parent Portal native theme adapter

Status: uitvoerbaar adaptercontract voor iOS- en Androidclients. Deze repository bevat geen native project, maar exporteert per immutable release de volledige gevalideerde rendererbundle.

Een native client:

1. valideert `schemaVersion`, `themeKey` en `release`;
2. cachet de laatst valide bundle onder `tenantId + themeKey + release`;
3. vertaalt semantic colors, radii, typography en motion naar Swift/SwiftUI- of Kotlin/Compose-tokens;
4. registreert uitsluitend de meegeleverde shell-, pagina-, component- en badge-recipes;
5. gebruikt dezelfde dertien route-ID's en vijf primaire bestemmingen;
6. implementeert eigen navigation, sheets, safe areas, Dynamic Type/font scaling en offline states;
7. rendert beoordelingen met precies vijf opties boven waarde `1–5`; `null` betekent nog niet beoordeeld;
8. gebruikt de assetpath, SHA-256 en afmetingen om downloads vóór cache-activatie te valideren;
9. gebruikt nooit DOM, CSS of een WebView.

De JSON-bundles in `generated/` worden gemaakt met:

```text
pnpm run themes:export-native
```

## Adaptergates

- Cachekey is exact `tenantId + themeKey + release`; een release wordt nooit in-place overschreven.
- Bij offline start wordt alleen een eerder volledig gevalideerde bundle gebruikt.
- Een onbekende recipe, hashfout of incompatibele contractversie valt terug op de meegeleverde Defaultbundle en rapporteert `portal_theme_fallback_used` zonder PII.
- Native childselectie is een popover of sheet met `Alle kinderen` als eerste rij en permissievalidatie vóór contextwissel.
- Reduced Motion toont direct de stabiele eindstate. Haptics volgt `calm`, `precise` of `playful`; geluid blijft standaard uit.
- Uploads, betalingen en downloads blijven in een beveiligde native flow en openen geen ongevalideerde externe URL.

## Smokecontract

Elke client valideert in CI voor alle vijf releases: 13 route-ID’s, vijf primaire navigatie-items, Dynamic Type, safe areas, offline cold start, onbekende-recipefallback en exact vijf smileys of sterren. De gedeelde JSON-contracttests in deze repository bewaken dezelfde inputs zolang de losse native repositories niet in deze workspace aanwezig zijn.
