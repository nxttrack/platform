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
  motif: "momentum" | "bay" | "current" | "ice" | "coast" | "lanes";
  milestones: readonly [string, string, string];
};

type ThemeVisualProfile = {
  motif: PortalRoutePresentation["motif"];
  routeCues: Record<ParentPortalRouteId, string>;
  milestones: Record<"planning" | "development" | "badges", readonly [string, string, string]>;
};

const routeIdsByPath: Array<[RegExp, ParentPortalRouteId]> = [
  [/^\/portaal\/lessen\/[^/]+$/, "lesson-detail"],
  [/^\/portaal\/(?:planning|lessen|afzwemmen)$/, "planning"],
  [/^\/portaal\/ontwikkeling\/badges$|^\/portaal\/badges$/, "badges"],
  [/^\/portaal\/ontwikkeling\/media$|^\/portaal\/media$/, "media"],
  [/^\/portaal\/ontwikkeling\/diplomas$|^\/portaal\/diplomas$/, "diplomas"],
  [/^\/portaal\/(?:ontwikkeling|voortgang)$/, "development"],
  [/^\/portaal\/(?:inbox|berichten)$/, "inbox"],
  [/^\/portaal\/betalingen$/, "payments"],
  [/^\/portaal\/documenten$/, "documents"],
  [/^\/portaal\/feedback$/, "feedback"],
  [/^\/portaal\/kinderen$/, "children"],
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
  children: "Samen verbonden",
  profile: "Jouw gegevens en voorkeuren"
} as const;

const profiles: Record<string, ThemeVisualProfile> = {
  "nxttrack-default": profile("momentum", {
    overview: "Jouw ontwikkeling in beeld",
    planning: "Klaar voor de volgende les",
    development: "Elke stap telt",
    badges: "Mooie momenten om te vieren"
  }, {
    planning: ["Gepland", "Inhalen", "Afzwemmen"],
    development: ["Start", "Groei", "Volgende stap"],
    badges: ["Ontdekt", "Behaald", "Gevierd"]
  }),
  "dolphin-bay": profile("bay", {
    overview: "Op koers door de baai",
    planning: "Van boei naar boei",
    development: "Volg jouw zwemreis",
    badges: "Nieuwe boeien bereikt"
  }, {
    planning: ["Startboei", "Lesboei", "Finishboei"],
    development: ["Te water", "Op koers", "Nieuwe baai"],
    badges: ["Gespot", "Bereikt", "Gevierd"]
  }),
  "turtle-trails": profile("current", {
    overview: "Stap voor stap",
    planning: "Een rustige trail vooruit",
    development: "Volg jouw zwemroute",
    badges: "Nieuwe schelpstappen"
  }, {
    planning: ["Vandaag", "Volgende stap", "Nieuwe schelp"],
    development: ["Begin", "Vertrouwen", "Verder groeien"],
    badges: ["Gevonden", "Verdiend", "Bewaard"]
  }),
  "polar-splash": profile("ice", {
    overview: "Op expeditie naar je volgende ijsschots",
    planning: "Jouw poolreis op koers",
    development: "Volg jouw poolreis",
    badges: "Mijlpalen uit jouw expeditie"
  }, {
    planning: ["Vertrek", "Volgende ijsschots", "Pooldoel"],
    development: ["Start", "Ontdekken", "Verder reizen"],
    badges: ["Gespot", "Behaald", "Gevierd"]
  }),
  "coastal-explorer": profile("coast", {
    overview: "Op ontdekking langs de kust",
    planning: "Jouw kustreis op koers",
    development: "Volg jouw kustreis",
    badges: "Mijlpalen langs de kust"
  }, {
    planning: ["Strandpost", "Volgende punt", "Vuurtoren"],
    development: ["Vertrek", "Op koers", "Volgende haven"],
    badges: ["Ontdekt", "Behaald", "Gevierd"]
  }),
  "nationaal-zwem-abc": profile("lanes", {
    overview: "Op weg naar het zwemdiploma",
    planning: "De volgende zwemles",
    development: "Volg de diplomareis",
    badges: "Mijlpalen in de diplomareis"
  }, {
    planning: ["Startniveau", "Volgende les", "Diplomamoment"],
    development: ["Start A", "A naar B", "B naar C"],
    badges: ["Ontdekt", "Behaald", "Gevierd"]
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
  const intensity: PortalRouteIntensity = ["overview", "planning", "development", "badges"].includes(routeId)
    ? "rich"
    : "quiet";
  const milestones = routeId === "planning" || routeId === "development" || routeId === "badges"
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
  richCues: Pick<ThemeVisualProfile["routeCues"], "overview" | "planning" | "development" | "badges">,
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
