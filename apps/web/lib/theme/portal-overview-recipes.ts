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
  "overview/journey-engine-v1": defaultPresentation
} satisfies Partial<Record<RegisteredPageRecipeId, PortalOverviewRecipePresentation>>);

export function getPortalOverviewRecipePresentation(recipeId: RegisteredPageRecipeId) {
  return portalOverviewRecipePresentations[recipeId as keyof typeof portalOverviewRecipePresentations] ?? defaultPresentation;
}
