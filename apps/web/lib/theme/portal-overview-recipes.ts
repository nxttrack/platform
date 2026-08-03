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
  milestoneLabels: ["Actuele beoordelingen", "Reis naar diploma"]
};

export const portalOverviewRecipePresentations = Object.freeze({
  "overview/swim-school-v2": defaultPresentation,
  "overview/pearl-route-v2": {
    eyebrow: "Ocean Quest",
    journeyLabel: "Jouw parelreis",
    titlePrefix: "Op avontuur naar",
    ctaLabel: "Bekijk zwemreis",
    progressLabel: "Reisvoortgang",
    milestoneLabels: ["Actuele beoordelingen", "Parelreis naar diploma"]
  },
  "overview/bay-route-v1": {
    eyebrow: "Dolphin Bay",
    journeyLabel: "Jouw boeienroute",
    titlePrefix: "Op koers naar",
    ctaLabel: "Bekijk zwemroute",
    progressLabel: "Koersvoortgang",
    milestoneLabels: ["Actuele beoordelingen", "Boeienroute naar diploma"]
  },
  "overview/shell-route-v1": {
    eyebrow: "Turtle Trails",
    journeyLabel: "Jouw schelpenpad",
    titlePrefix: "Stap voor stap naar",
    ctaLabel: "Bekijk zwemtrail",
    progressLabel: "Trailvoortgang",
    milestoneLabels: ["Actuele beoordelingen", "Schelpenpad naar diploma"]
  },
  "overview/academy-checkpoints-v1": {
    eyebrow: "Aqua Academy",
    journeyLabel: "Jouw academy-pass",
    titlePrefix: "Op weg naar",
    ctaLabel: "Bekijk training",
    progressLabel: "Trainingsvoortgang",
    milestoneLabels: ["Actuele beoordelingen", "Academy-route naar diploma"]
  }
} satisfies Partial<Record<RegisteredPageRecipeId, PortalOverviewRecipePresentation>>);

export function getPortalOverviewRecipePresentation(recipeId: RegisteredPageRecipeId) {
  return portalOverviewRecipePresentations[recipeId as keyof typeof portalOverviewRecipePresentations] ?? defaultPresentation;
}
