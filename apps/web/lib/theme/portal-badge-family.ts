import type { PortalThemeManifestV2 } from "./portal-theme-contract";

export const portalBadgeArtworkKeys = [
  "water_friend",
  "first_splash",
  "float_champion",
  "power_legs",
  "bubble_boss",
  "dive_explorer",
  "safety_hero",
  "keep_going",
  "back_float",
  "lane_star",
  "team_buddy",
  "ready_for_a"
] as const;

export type PortalBadgeArtworkKey = (typeof portalBadgeArtworkKeys)[number];

export function resolvePortalBadgeArtworkKey(badgeKey?: string | null, name?: string | null): PortalBadgeArtworkKey {
  const value = `${badgeKey ?? ""} ${name ?? ""}`.toLocaleLowerCase("nl-NL");
  if (/(diploma|certificate|afzwem|klaar voor)/.test(value)) return "ready_for_a";
  if (/(helper|team|maatje)/.test(value)) return "team_buddy";
  if (/(rug|back)/.test(value)) return "back_float";
  if (/(drijf|float)/.test(value)) return "float_champion";
  if (/(been|leg|kick|kracht)/.test(value)) return "power_legs";
  if (/(bel|bubble|adem|breath)/.test(value)) return "bubble_boss";
  if (/(duik|dive|onderwater)/.test(value)) return "dive_explorer";
  if (/(veilig|safety|kleding)/.test(value)) return "safety_hero";
  if (/(doorzet|streak|inzet|durf|moed|held)/.test(value)) return "keep_going";
  if (/(baan|les|attendance|aanwezig|zwemmer)/.test(value)) return "lane_star";
  if (/(start|eerste|plons|sprong)/.test(value)) return "first_splash";
  return "water_friend";
}

export function portalBadgeArtworkUrl(
  _manifest: PortalThemeManifestV2,
  _badgeKey?: string | null,
  _name?: string | null
) {
  return null;
}
