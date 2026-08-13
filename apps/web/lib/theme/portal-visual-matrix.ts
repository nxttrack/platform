export const PORTAL_VISUAL_THEMES = [
  "nxttrack-default",
  "dolphin-bay",
  "turtle-trails",
  "polar-splash",
  "coastal-explorer",
  "nationaal-zwem-abc",
  "ocean-quest"
] as const;

export const PARENT_VISUAL_ROUTES = [
  "overview",
  "planning",
  "lesson-detail",
  "development",
  "badges",
  "media",
  "diplomas",
  "inbox",
  "payments",
  "documents",
  "feedback",
  "children",
  "profile"
] as const;

export const CHILD_VISUAL_STATES = [
  "today",
  "journey",
  "goal-detail",
  "badges",
  "agenda",
  "lesson-detail",
  "profile-prijzenkast"
] as const;

export const PORTAL_REQUIRED_VIEWPORTS = [
  { name: "desktop-2560", width: 2560, height: 1440 },
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-1600", width: 1600, height: 900 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "desktop-1280", width: 1280, height: 720 },
  { name: "tablet-1180", width: 1180, height: 820 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "tablet-820", width: 820, height: 1180 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-320", width: 320, height: 568 }
] as const;

export const PORTAL_CANONICAL_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
] as const;

export const PORTAL_HIGH_RESOLUTION_VIEWPORTS = [
  { name: "desktop", width: 1920, height: 1080 },
  { name: "mobile", width: 430, height: 932 }
] as const;

export const PORTAL_VISUAL_MATRIX_CONTRACT = {
  canonicalRenders:
    PORTAL_VISUAL_THEMES.length *
    (2 + PARENT_VISUAL_ROUTES.length * PORTAL_CANONICAL_VIEWPORTS.length +
      CHILD_VISUAL_STATES.length * PORTAL_CANONICAL_VIEWPORTS.length +
      PORTAL_HIGH_RESOLUTION_VIEWPORTS.length * 2),
  dashboardViewportCases:
    PORTAL_VISUAL_THEMES.length * PORTAL_REQUIRED_VIEWPORTS.length * 2
} as const;
