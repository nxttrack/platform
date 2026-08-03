import type { AssessmentRatingDisplay } from "@/lib/theme/portal-theme-contract";

export type LearnerAssessmentValue = 1 | 2 | 3 | 4 | 5;
export type LearnerAssessmentSourceValue = 1 | 2 | 3;

export interface LearnerAssessmentRating {
  ratingValue: LearnerAssessmentValue;
  scaleVersion: "five_point_v1";
  sourceScaleVersion: "five_point_v1" | "three_point_legacy";
  sourceValue?: LearnerAssessmentSourceValue;
}

export const learnerAssessmentLevels = [
  { value: 1, label: "Goed begonnen", meaning: "eerste stap; veel begeleiding nodig" },
  { value: 2, label: "Goed bezig", meaning: "aan het oefenen; regelmatig begeleiding nodig" },
  { value: 3, label: "Mooi op weg", meaning: "groeiend; gedeeltelijk zelfstandig" },
  { value: 4, label: "Heel knap", meaning: "bijna beheerst; meestal zelfstandig" },
  { value: 5, label: "Superster", meaning: "beheerst; zelfstandig" }
] as const;

export function parseLearnerAssessmentValue(value: unknown): LearnerAssessmentValue {
  const numericValue = typeof value === "string" && /^[1-5]$/.test(value) ? Number(value) : value;
  if (typeof numericValue !== "number" || !Number.isInteger(numericValue) || numericValue < 1 || numericValue > 5) {
    throw new Error("Een leerlingbeoordeling moet een geheel getal van 1 tot en met 5 zijn.");
  }
  return numericValue as LearnerAssessmentValue;
}

export function getLearnerAssessmentLevel(value: LearnerAssessmentValue) {
  return learnerAssessmentLevels[value - 1];
}

export function getLearnerAssessmentAccessibleLabel(value: LearnerAssessmentValue) {
  const level = getLearnerAssessmentLevel(value);
  return `${value} van 5 — ${level.label}, ${level.meaning}`;
}

export function legacyNormalizedAssessmentScore(value: LearnerAssessmentValue) {
  return (value - 1) / 4;
}

export function migrateLegacyThreePointValue(value: LearnerAssessmentSourceValue): LearnerAssessmentRating {
  const ratingValue = ({ 1: 1, 2: 3, 3: 5 } as const)[value];
  return {
    ratingValue,
    scaleVersion: "five_point_v1",
    sourceScaleVersion: "three_point_legacy",
    sourceValue: value
  };
}

export function isAssessmentRatingDisplay(value: unknown): value is AssessmentRatingDisplay {
  return value === "smileys" || value === "stars";
}
