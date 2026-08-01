import type { RegisteredPageRecipeId } from "./portal-theme-contract";

export type PortalOverviewRecipePresentation = {
  eyebrow: string;
  journeyLabel: string;
  titlePrefix: string;
  ctaLabel: string;
  progressLabel: string;
  milestoneLabels: readonly [string, string];
};

const defaultPresentation: PortalOverviewRecipePresentation = {
  eyebrow: "NXTTRACK",
  journeyLabel: "Jouw zwemontwikkeling",
  titlePrefix: "Groeien naar",
  ctaLabel: "Bekijk ontwikkeling",
  progressLabel: "Voortgang",
  milestoneLabels: ["Je zwemreis is gestart", "Volgende stap in zicht"]
};

export const portalOverviewRecipePresentations = Object.freeze({
  "overview/swim-school-v2": defaultPresentation,
  "overview/pearl-route-v2": {
    eyebrow: "Ocean Quest",
    journeyLabel: "Jouw parelreis",
    titlePrefix: "Op avontuur naar",
    ctaLabel: "Bekijk zwemreis",
    progressLabel: "Reisvoortgang",
    milestoneLabels: ["Avontuur in beweging", "Nieuwe parel in zicht"]
  },
  "overview/bay-route-v1": {
    eyebrow: "Dolphin Bay",
    journeyLabel: "Jouw boeienroute",
    titlePrefix: "Op koers naar",
    ctaLabel: "Bekijk zwemroute",
    progressLabel: "Koersvoortgang",
    milestoneLabels: ["Goed op koers", "Nieuwe boei in zicht"]
  },
  "overview/shell-route-v1": {
    eyebrow: "Turtle Trails",
    journeyLabel: "Jouw schelpenpad",
    titlePrefix: "Stap voor stap naar",
    ctaLabel: "Bekijk zwemtrail",
    progressLabel: "Trailvoortgang",
    milestoneLabels: ["Een mooie stap gezet", "Nieuwe schelp in zicht"]
  },
  "overview/academy-checkpoints-v1": {
    eyebrow: "Aqua Academy",
    journeyLabel: "Jouw academy-pass",
    titlePrefix: "Op weg naar",
    ctaLabel: "Bekijk training",
    progressLabel: "Trainingsvoortgang",
    milestoneLabels: ["Checkpoint behaald", "Volgende techniek klaar"]
  }
} satisfies Partial<Record<RegisteredPageRecipeId, PortalOverviewRecipePresentation>>);

export function getPortalOverviewRecipePresentation(recipeId: RegisteredPageRecipeId) {
  return portalOverviewRecipePresentations[recipeId as keyof typeof portalOverviewRecipePresentations] ?? defaultPresentation;
}
