import type { PortalThemeManifestV3 } from "./portal-theme-contract";

export type PortalTerminology = {
  activity: string;
  activities: string;
  finalCredential: string;
  finalCredentials: string;
  finalMoment: string;
  instructor: string;
  journey: string;
  makeUpActivity: string;
  makeUpActivities: string;
  organization: string;
  route: string;
  stage: string;
};

const genericTerminology: PortalTerminology = {
  activity: "activiteit",
  activities: "activiteiten",
  finalCredential: "certificaat",
  finalCredentials: "certificaten",
  finalMoment: "eindmoment",
  instructor: "begeleider",
  journey: "leerreis",
  makeUpActivity: "alternatief moment",
  makeUpActivities: "alternatieve momenten",
  organization: "organisatie",
  route: "leerroute",
  stage: "niveau"
};

const swimTerminology: PortalTerminology = {
  activity: "les",
  activities: "lessen",
  finalCredential: "diploma",
  finalCredentials: "diploma’s",
  finalMoment: "afzwemmen",
  instructor: "trainer",
  journey: "zwemreis",
  makeUpActivity: "inhaalles",
  makeUpActivities: "inhaallessen",
  organization: "zwemschool",
  route: "zwemroute",
  stage: "badje"
};

export function getPortalTerminology(
  manifest: Pick<PortalThemeManifestV3, "experience">
): PortalTerminology {
  return manifest.experience.sectorMode === "generic"
    ? genericTerminology
    : swimTerminology;
}
