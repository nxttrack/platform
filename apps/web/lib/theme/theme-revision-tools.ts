import { themeReviewDigest } from "./theme-package-archive";
import type { ThemeReleaseDocument } from "./theme-release-validation";

export type ThemeDocumentDifference = { area: "Themagegevens" | "Kleuren en opmaak" | "Werelden" | "Gids" | "Parels" | "Ondersteunende beelden" | "Verzameling" | "Assets"; identity: string; change: "toegevoegd" | "verwijderd" | "gewijzigd" };
/** Compare presentation semantics, not source order, audit metadata or education records. */
export function compareThemeDocuments(before: ThemeReleaseDocument, after: ThemeReleaseDocument): ThemeDocumentDifference[] {
  const rows: ThemeDocumentDifference[] = [];
  const compare = (area: ThemeDocumentDifference["area"], identity: string, left: unknown, right: unknown) => {
    if (left === undefined && right === undefined) return;
    if (left !== undefined && right !== undefined && themeReviewDigest(left) === themeReviewDigest(right)) return;
    rows.push({ area, identity, change: left === undefined ? "toegevoegd" : right === undefined ? "verwijderd" : "gewijzigd" });
  };
  compare("Themagegevens", "Naam, beschrijving en portaalwoorden", { theme: before.manifest.theme, experience: before.manifest.experience }, { theme: after.manifest.theme, experience: after.manifest.experience });
  compare("Kleuren en opmaak", "Native portaalprojectie", before.manifest.tokens, after.manifest.tokens);
  for (const key of new Set([...Object.keys(before.presentation.worlds), ...Object.keys(after.presentation.worlds)])) compare("Werelden", key, before.presentation.worlds[key], after.presentation.worlds[key]);
  compare("Gids", "Gedrag en poses", before.presentation.guide, after.presentation.guide);
  compare("Parels", "Expliciete artworkregels", before.presentation.pearlArtwork, after.presentation.pearlArtwork);
  compare("Ondersteunende beelden", "Semantische slots", before.presentation.supportSlots, after.presentation.supportSlots);
  compare("Verzameling", "Onafhankelijke vondsten", before.presentation.collectibles, after.presentation.collectibles);
  for (const key of new Set([...Object.keys(before.presentation.assets), ...Object.keys(after.presentation.assets)])) {
    const semantic = (asset: ThemeReleaseDocument["presentation"]["assets"][string] | undefined) => asset ? { hash: asset.contentHash, mime: asset.mime, width: asset.width, height: asset.height, alpha: asset.hasAlpha } : undefined;
    compare("Assets", key, semantic(before.presentation.assets[key]), semantic(after.presentation.assets[key]));
  }
  return rows;
}
