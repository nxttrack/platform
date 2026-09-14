import { parseJourneyPresentation, type JourneyScene, type PortalJourneyPresentationV1 } from "./portal-journey-presentation";

/** Expectations from Default source 1.1 documentation; these are visual IDs, never curriculum IDs. */
export const defaultJourneyWorlds = Object.freeze([
  { id: "badje-01", name: "De Startlagune" },
  { id: "badje-02", name: "De Oriëntatiestroom" },
  { id: "badje-03", name: "De Bewegingsroute" },
  { id: "badje-a", name: "De A-poort" },
  { id: "badje-b", name: "De B-horizon" },
  { id: "badje-c", name: "De C-finale" }
]);
export const defaultJourneyPalette = Object.freeze({ primary: "#4D63E6", secondary: "#15B8A6", accent: "#F0B447", attention: "#EF6C75", ink: "#172A46" });

/** Guarded preview/test fixture only. No supplied Default art or original anchor coordinates. */
export function createDefaultJourneyFixture(): PortalJourneyPresentationV1 {
  function scene(portrait: boolean): JourneyScene {
    const coordinates = portrait ? [[55, 80], [30, 65], [65, 48], [35, 30], [60, 15]] : [[15, 75], [30, 45], [50, 65], [70, 30], [85, 45]];
    return {
      intrinsic: { width: portrait ? 941 : 1672, height: portrait ? 1672 : 941 },
      layers: { back: null, mid: null, front: null },
      controlPoints: coordinates.map(([x, y], index) => ({ slotId: `fixture-${index}`, x, y })),
      anchorSource: { path: "fixtures/default-unverified-anchors.json", sha256: null, status: "fixture-only" },
      safeZones: { topFraction: 0.15, bottomFraction: 0.2 },
      parallax: { enabled: false, edgeCoverageApproved: false },
      quality: "fixture-only"
    };
  }
  return parseJourneyPresentation({
    presentationContract: "rich-swim-journey/1.0", themeId: "nxttrack-default", sourcePackageVersion: "1.1.0", runtimeRelease: "4.0.0",
    role: "standard", journeyType: "rich-swim-journey", pearlArtwork: { mode: "none", byCriterionIdentity: {} },
    guide: { mode: "route-light", pulse: true, halo: true, routeGlow: true },
    worlds: Object.fromEntries(defaultJourneyWorlds.map((world) => [world.id, { ...world, landscape: scene(false), portrait: scene(true) }])),
    assets: {}, supportSlots: {}, collectibles: { routeBinding: "none", pool: [] }
  });
}
