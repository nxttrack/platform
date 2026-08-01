# Parent Portal native theme adapter

Status: contract voor toekomstige iOS- en Androidclients; deze repository bevat geen native project.

Een native client:

1. valideert `schemaVersion`, `themeKey` en `release`;
2. cachet de laatst valide bundle onder `tenantId + themeKey + release`;
3. vertaalt semantic colors, radii, typography en motion naar Swift/SwiftUI- of Kotlin/Compose-tokens;
4. gebruikt dezelfde dertien route-ID's en vijf primaire bestemmingen;
5. implementeert eigen navigation, sheets, safe areas, Dynamic Type/font scaling en offline states;
6. rendert beoordelingen met precies vijf opties boven waarde `1–5`;
7. gebruikt nooit DOM, CSS of een WebView.

De JSON-bundles in `generated/` worden gemaakt met:

```text
pnpm run themes:export-native
```

Een onbekende recipe of incompatibele contractversie valt terug op de meegeleverde Defaultbundle en rapporteert `portal_theme_fallback_used` zonder PII.
