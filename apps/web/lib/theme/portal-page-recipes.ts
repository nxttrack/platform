import type {
  ParentPortalRouteId,
  PortalThemeManifestV2,
  RegisteredPageRecipeId
} from "./portal-theme-contract";

export type PortalRouteIntensity = "rich" | "quiet";

export type PortalRoutePresentation = {
  routeId: ParentPortalRouteId;
  recipeId: RegisteredPageRecipeId;
  intensity: PortalRouteIntensity;
  cue: string;
  motif: "wave" | "pearl" | "buoy" | "shell" | "lane";
  milestones: readonly [string, string, string];
};

type ThemeVisualProfile = {
  motif: PortalRoutePresentation["motif"];
  routeCues: Record<ParentPortalRouteId, string>;
  milestones: Record<"planning" | "progress" | "badges", readonly [string, string, string]>;
};

const routeIdsByPath: Array<[RegExp, ParentPortalRouteId]> = [
  [/^\/portaal\/lessen\/[^/]+$/, "lesson-detail"],
  [/^\/portaal\/(?:planning|lessen|afzwemmen)$/, "planning"],
  [/^\/portaal\/ontwikkeling\/badges$|^\/portaal\/badges$/, "badges"],
  [/^\/portaal\/ontwikkeling\/media$|^\/portaal\/media$/, "media"],
  [/^\/portaal\/ontwikkeling\/diplomas$|^\/portaal\/diplomas$/, "diplomas"],
  [/^\/portaal\/(?:ontwikkeling|voortgang)$/, "progress"],
  [/^\/portaal\/(?:inbox|berichten)$/, "inbox"],
  [/^\/portaal\/betalingen$/, "payments"],
  [/^\/portaal\/documenten$/, "documents"],
  [/^\/portaal\/feedback$/, "feedback"],
  [/^\/portaal\/kinderen$/, "family-access"],
  [/^\/portaal\/profiel$/, "profile"],
  [/^\/portaal$/, "overview"]
];

const commonQuietCues = {
  "lesson-detail": "Alles voor deze les",
  media: "Privé en veilig bewaard",
  diplomas: "Officiële mijlpalen",
  inbox: "Rustig contact op één plek",
  payments: "Duidelijk en veilig geregeld",
  documents: "Belangrijke informatie bij elkaar",
  feedback: "Jouw ervaring telt",
  "family-access": "Samen verbonden",
  profile: "Jouw gegevens en voorkeuren"
} as const;

const profiles: Record<string, ThemeVisualProfile> = {
  "nxttrack-default": profile("wave", {
    overview: "Jouw zwemschool in beeld",
    planning: "Klaar voor de volgende les",
    progress: "Elke stap telt",
    badges: "Mooie momenten om te vieren"
  }, {
    planning: ["Gepland", "Inhalen", "Afzwemmen"],
    progress: ["Start", "Groei", "Volgende stap"],
    badges: ["Ontdekt", "Behaald", "Gevierd"]
  }),
  "ocean-quest": profile("pearl", {
    overview: "Jouw parelreis",
    planning: "Nieuwe waypoints in zicht",
    progress: "Volg de Pearl Trail",
    badges: "Schatten uit jouw zwemreis"
  }, {
    planning: ["Vertrekpunt", "Nieuwe waypoint", "Parel in zicht"],
    progress: ["Eerste parel", "Manta-route", "Eiland bereikt"],
    badges: ["Ontdekt", "Verzameld", "Trots gedeeld"]
  }),
  "dolphin-bay": profile("buoy", {
    overview: "Op koers door de baai",
    planning: "Van boei naar boei",
    progress: "Volg jouw Buoy Course",
    badges: "Nieuwe boeien bereikt"
  }, {
    planning: ["Startboei", "Lesboei", "Finishboei"],
    progress: ["Te water", "Op koers", "Nieuwe baai"],
    badges: ["Gespot", "Bereikt", "Gevierd"]
  }),
  "turtle-trails": profile("shell", {
    overview: "Stap voor stap",
    planning: "Een rustige trail vooruit",
    progress: "Volg jouw Shell Trail",
    badges: "Nieuwe schelpstappen"
  }, {
    planning: ["Vandaag", "Volgende stap", "Nieuwe schelp"],
    progress: ["Begin", "Vertrouwen", "Verder groeien"],
    badges: ["Gevonden", "Verdiend", "Bewaard"]
  }),
  "aqua-academy": profile("lane", {
    overview: "Op weg naar je volgende checkpoint",
    planning: "Jouw training op koers",
    progress: "Bekijk jouw Academy Pass",
    badges: "Checkpoints om trots op te zijn"
  }, {
    planning: ["Startblok", "Training", "Checkpoint"],
    progress: ["Basis", "Techniek", "Diplomaklaar"],
    badges: ["Geopend", "Behaald", "Geregistreerd"]
  })
};

export function resolvePortalRouteId(pathname: string): ParentPortalRouteId {
  return routeIdsByPath.find(([pattern]) => pattern.test(pathname))?.[1] ?? "overview";
}

export function getPortalRoutePresentation(
  manifest: PortalThemeManifestV2,
  routeId: ParentPortalRouteId
): PortalRoutePresentation {
  const visual = profiles[manifest.theme.key] ?? profiles["nxttrack-default"]!;
  const intensity: PortalRouteIntensity = ["overview", "planning", "progress", "badges"].includes(routeId)
    ? "rich"
    : "quiet";
  const milestones = routeId === "planning" || routeId === "progress" || routeId === "badges"
    ? visual.milestones[routeId]
    : ["Veilig", "Duidelijk", "Vertrouwd"] as const;

  return {
    routeId,
    recipeId: manifest.recipes.pages[routeId],
    intensity,
    cue: visual.routeCues[routeId],
    motif: visual.motif,
    milestones
  };
}

function profile(
  motif: ThemeVisualProfile["motif"],
  richCues: Pick<ThemeVisualProfile["routeCues"], "overview" | "planning" | "progress" | "badges">,
  milestones: ThemeVisualProfile["milestones"]
): ThemeVisualProfile {
  return {
    motif,
    milestones,
    routeCues: {
      ...commonQuietCues,
      ...richCues
    }
  };
}
