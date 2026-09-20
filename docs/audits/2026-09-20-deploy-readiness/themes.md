# V4-portalen en thema's: scope en deploybaarheid

Onderzocht op 20 september 2026, broncommit `be8edddbdc03d13329d04da067e99110d6df8158`. Dit rapport actualiseert de releasebeslissing; de eerdere onderzoeksrapporten blijven historische bewijsstukken. Het is geen nieuwe certificering van alle browser-, provider- of databaseflows.

## Conclusie

De geïmplementeerde V4-portalen en de zeven ingebouwde thema's zijn als bestaande productfunctionaliteit deploybaar. In dit onderzoek is geen aanvullende technische blokkade in de thema-implementatie aangetroffen. Authenticiteit en visuele acceptatie van het afzonderlijke **Default 1.1-bronpakket blijven geblokkeerd**. De beschikbare NXTTRACK Default-runtimeversie is **3.0.0** en wordt niet voorgesteld als levering van dat ontbrekende bronpakket. De overkoepelende go/no-go moet daarnaast de actuele build, releaseworkflow, database en omgevingscontroles beoordelen.

De ontbrekende originele illustraties vervangen of genereren is geen noodzakelijke deploymentwerkzaamheid: daarmee zou de oorspronkelijke provenance-eis niet worden vervuld. Er is geen reden de werkende ingebouwde thema's uit te schakelen of hun versienummers te wijzigen.

## Wat daadwerkelijk aanwezig is

- Zeven ingebouwde releases: NXTTRACK Default, Dolphin Bay, Turtle Trails, Polar Splash, Coastal Explorer, Ocean Quest en Nationaal Zwem ABC. De registry publiceert versie `3.0.0`; de bestaande licentiecontrole op naamvoering blijft van toepassing. Zie [`portal-theme-registry.ts`](../../../apps/web/lib/theme/portal-theme-registry.ts).
- De bestaande native contracten worden behouden. De rich presentatie van ingebouwde releases draagt `sourcePackageVersion: legacy-native-3`. De regressie in [`theme-release-validation.test.ts:52`](../../../tests/unit/theme-release-validation.test.ts#L52) bewaakt dat bestaande artwork niet als Default 1.1 wordt gepresenteerd.
- De geïmplementeerde functies omvatten ouder-/kindportalen, ontwikkeling, historische wereldbinding, planning, inbox, beoordeling door instructeurs, collecties, private bestanden en de themabibliotheek. De precieze routes en bewijsgrenzen staan in [FEATURE-PARITY.md](../2026-09-14-portal-v42-default-integration/FEATURE-PARITY.md).
- Ondersteunde pakket-/Studio-/begeleide imports hebben conceptopslag, preview, inhoudsgebonden review, publicatie, expliciete toewijzing en herstel/export. Een herkend onbekend Default-bronmanifest wordt niet stil als losse afbeeldingen geïmporteerd.

## Nieuwe lokale bestandscontrole

Op `2026-09-20T10:00:34.878Z` zijn vanuit de actuele registry alle unieke native rasterverwijzingen gelezen. Voor ieder bestand zijn bestaan, PNG-signatuur, werkelijke breedte/hoogte en SHA-256 vergeleken met het manifest.

| Thema | Release | Unieke PNG's | Resultaat |
|---|---|---:|---|
| nxttrack-default | 3.0.0 | 2 | PASS |
| dolphin-bay | 3.0.0 | 3 | PASS |
| turtle-trails | 3.0.0 | 3 | PASS |
| polar-splash | 3.0.0 | 3 | PASS |
| coastal-explorer | 3.0.0 | 3 | PASS |
| ocean-quest | 3.0.0 | 4 | PASS |
| nationaal-zwem-abc | 3.0.0 | 2 | PASS |

Totaal: **20 van 20 unieke native PNG's geslaagd**. Dit controleert de primaire registry-assets; het is geen claim dat alle 316 bestanden en rendities onder `public/portal-themes` afzonderlijk zijn doorgemeten. De eerdere deploymentcontrole van publiek geserveerde assets blijft afzonderlijk bewijs.

Reproduceerbare controle, na installatie van de vastgelegde dependencies:

```sh
pnpm exec tsx -e '
import { portalThemeCatalog } from "./apps/web/lib/theme/portal-theme-registry.ts";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
let count = 0;
for (const theme of portalThemeCatalog) {
  const seen = new Set<string>();
  for (const asset of Object.values(theme.assets)) {
    if (!asset || seen.has(asset.path)) continue;
    seen.add(asset.path);
    const bytes = readFileSync(`apps/web/public${asset.path}`);
    if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw Error(asset.path);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.contentHash) throw Error(asset.path);
    if (bytes.readUInt32BE(16) !== asset.width || bytes.readUInt32BE(20) !== asset.height) throw Error(asset.path);
    count++;
  }
}
console.log({ themes: portalThemeCatalog.length, assets: count, pass: true });
'
```

De uitgevoerde controle gebruikte de reeds geïnstalleerde `tsx` uit de naastgelegen deploymentworktree om dezelfde TypeScript-bronbestanden te lezen; aan bronbestanden of dependencies is voor deze controle niets gewijzigd.

## B01: nauwkeurig afgebakend

De historische acceptatiematrix bevat 83 gevallen: **72 PASS, 5 BLOCKED en 6 PARTIAL**. Alle elf niet volledig geslaagde gevallen zijn gekoppeld aan het ontbrekende authentieke Default 1.1-pakket:

| Status | Acceptatiegevallen |
|---|---|
| BLOCKED | AC-003 originele bronroot; AC-004 alle 96 assets; AC-008 originele configuratiestructuur; AC-020 originele portraitcompositie; AC-035 watertextuur/transparantie |
| PARTIAL | AC-005 oorspronkelijke afmetingen; AC-006 zes originele wereldidentiteiten; AC-012 overdracht van bron-/runtimeversies; AC-015 originele bestandsvarianten; AC-027 oorspronkelijke parallaxconfiguratie; AC-079 originele overdracht/beelddecodering |

Bron: [TEST-RESULTS.json](../2026-09-14-portal-v42-default-integration/TEST-RESULTS.json). Deze statussen worden niet omgezet in PASS op basis van de bestaande alternatieve thema's.

Gericht heronderzoek van de NXTTRACK-worktrees en aanwezige relevante attachment-/evidencelocaties leverde uitsluitend de bestaande Ocean Quest- en Parelroute-referentie-ZIP's op. Er is geen authentieke `config/manifest.json`, `config/assets-manifest.json`, set van zes Default-ankerkaarten of bijbehorende set van 96 originele rasterassets gevonden. Dit is een zoekresultaat in de beschikbare werkruimte, geen uitspraak over bestanden buiten deze omgeving.

De bestaande bescherming is passend:

- [`theme-package-adapters.ts:49`](../../../apps/web/lib/theme/theme-package-adapters.ts#L49) weigert de nog niet verifieerbare Default-brondialect expliciet. [`theme-package-adapters.test.ts:35`](../../../tests/unit/theme-package-adapters.test.ts#L35) bewaakt dat herkende ongeldige manifesten geen begeleide fallback worden.
- [`theme-release-validation.ts:59`](../../../apps/web/lib/theme/theme-release-validation.ts#L59) weigert technische fixturewerelden bij publicatie. Default vereist daarnaast servergeverifieerde provenance, zes juiste werelden en originele geregistreerde lagen/ankers.
- De 52 ondersteunende slots blijven in import/editor/export behouden, maar worden niet door het portaal gerenderd. De bestaande HTML geeft hun essentiële informatie weer. Zie [SUPPORT-SLOTS.md](../2026-09-14-portal-v42-default-integration/SUPPORT-SLOTS.md).

Voor een latere authentieke Default 1.1-levering zijn nog nodig: originele bronbestanden ontvangen, dialect tegen die bron implementeren, alle 96 semantische slots/varianten/afmetingen/hashes/alpha verifiëren, zes ankerkaarten en beide oriëntaties controleren, een aparte onveranderlijke runtimeversie importeren en reviewen, vervolgens browser-/netwerkacceptatie voor die concrete versie uitvoeren. Zonder die bronbestanden kan deze specifieke productlevering niet eerlijk als voltooid worden aangeduid.

## Historisch bewijs en resterende grenzen

De oude HANDOFF/NEXT/BLOCKERS beschrijven hun eigen onderzoeksfase. Uitspraken daarin over nog niet mergen/deployen mogen niet worden gelezen als de actuele omgevingsstatus. De gedateerde deploymentanalyse van 20 september en het overkoepelende huidige readinessrapport vormen daarvoor de actuele bron.

De oorspronkelijke lokale Firefox/WebKit-launchbeperking is geen open cross-browser-codeblokkade: [FINAL-VALIDATION.md:65](../2026-09-14-portal-v42-default-integration/FINAL-VALIDATION.md#L65) legt de latere succesvolle GitHub-run `34873674277` vast, met 70 geslaagde Journey-tests, 35 expliciete fixture-skips en 52 geslaagde smokechecks. Dit blijft bewijs van die concrete commit; het vervangt geen actuele CI op een gewijzigde kandidaat.

Fysieke Android/iOS-tests en echte providerbetalingen waren geen onderdeel van die thema-acceptatie. Nieuwsbriefverzending is een afzonderlijke capability en wordt niet door deze analyse gecertificeerd. Geen van deze grenzen wordt met een fixture of een bestandscontrole als geslaagd voorgesteld.

## Minimale werkzaamheden voor deze kandidaat

1. Neem bovenstaande bestaande productscope en B01 expliciet op in de actuele go/no-go. Behoud de gedateerde oorspronkelijke bewijsstukken.
2. Behoud import-/publicatiebescherming en de bestaande thema-identiteiten. Geen migratie, nieuwe artworkgeneratie of themaversiewijziging is hiervoor nodig.
3. Verduidelijk desgewenst de beheerinterface bij [`theme-support-editor.tsx:17`](../../../apps/web/components/platform/theme-support-editor.tsx#L17): de beeldkoppelingen worden bewaard en geëxporteerd, maar nog niet in het portaal getoond. De huidige tekst noemt alleen hun bedoelde locatie en kan verwachtingen wekken over zichtbaar resultaat. Dit is een kleine copycorrectie; er is geen nieuwe renderer nodig voor de bestaande releases.
4. Laat de bestaande relevante unit-/browsercontroles onderdeel van de actuele kandidaatvalidatie blijven. Na het brononderzoek zijn de bestaande gerichte import-, releasevalidatie- en visual-matrix-contracttests opnieuw uitgevoerd: **29 PASS, 0 FAIL, 0 SKIP**. Een nieuwe volledige browserrun blijft onderdeel van de eerstvolgende stagingdeployment.

## Herstelde deploymentfixture

Een aparte operationele blokkade bleek in `scripts/staging/parent-child-preview-fixture.mjs`: zowel de opruiming vóór als na de stagingbrowsermatrix zette de vier AquaSwim-portaalrollouts onvoorwaardelijk uit. De gebruikte kill-switch trok ook alle bestaande kindsessies in. Een volgende deployment zou daarmee de eerder geactiveerde V4-demoportalen opnieuw uitschakelen.

De kandidaat bewaart nu vóór de preview de oorspronkelijke vier rolloutregels en herstelt na afloop hun afzonderlijke status, readiness, configuratie, creatie- en activatiegegevens. De database legt via de bestaande trigger de daadwerkelijke hersteltijd in `updated_at` vast. Ook de afwezigheid van een oorspronkelijke regel wordt hersteld. De herstelroutine gebruikt geen tenantbrede sessiekill-switch.

De baseline staat tijdens de preview als disabled `swim.portal.preview_fixture_snapshot`-regel in de bestaande tabel. Dit overleeft een onderbroken, tijdelijke GitHub-runner en vereist geen migratie. De marker bevat alleen project-/tenantbinding, run-eigenaar en de vier configuratieregels; geen wachtwoorden, sessietokens of servicekeys. De bestaande feature-keyconstraint staat deze sleutel toe en runtimeportaalcontroles lezen uitsluitend de vier vaste capabilities. Een andere run mag een onafgeronde baseline niet vervangen. De workflow serialiseert de hele stagingdeploy inclusief browserjob met `concurrency: nxttrack-${{ inputs.target }}` en `cancel-in-progress: false`.

Opruimen zonder bekende snapshot is een no-op. Na een write-, readback- of markerverwijderingsfout blijft de snapshot beschikbaar voor een idempotente retry; verwijdering volgt pas na succesvolle verificatie van de herstelde gegevens. De begrenzing tot staging/AquaSwim blijft actief en een Phase 16-statefile voor een andere tenant wordt geweigerd.

Verificatie: **9 lokale gedrags-/contracttests PASS** voor bestaande ingeschakelde V4-flags, gemengde statussen/TTL/metadata, ontbrekende regels, onveranderde andere tenants, herhaald voorbereiden, run-eigenaarschap, onderbreking/herstel, foutinjecties, idempotentie, projectbinding, workflowserialisatie en het markercontract. Daarnaast slagen de bovengenoemde 29 bestaande tests, `node --check` en `git diff --check`. Er is hiervoor geen remote mutatie of nieuwe lokale database opgezet; de adaptertests claimen geen echte database- of stagingbrowserrun. De volledige stagingbrowservalidatie blijft verplicht bij de eerstvolgende deployment.
