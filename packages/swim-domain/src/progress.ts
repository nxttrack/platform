export type AssessmentRating = 1 | 2 | 3 | 4 | 5;
export type AssessmentValue = AssessmentRating | null;

export const SWIM_PROGRESS_FORMULA_VERSION = "swim_progress_v3" as const;
export const LEGACY_ASSESSMENT_METRIC = "legacy_normalized_assessment_score_v1" as const;

export interface ProgressContribution {
  itemKey: string;
  rating: AssessmentValue;
  weight?: number;
}

export interface ProgressResult {
  formulaVersion: typeof SWIM_PROGRESS_FORMULA_VERSION;
  progressFraction: number | null;
  progressPercent: number | null;
  assessedCount: number;
  contributingCount: number;
  coverageFraction: number | null;
  coveragePercent: number | null;
  weighted: boolean;
}

export interface JourneyRing {
  key: string;
  label: string;
  kind: "stage" | "diploma";
  progress: ProgressResult;
}

export interface JourneyRingInput {
  diplomaLabel?: string;
  diplomaItems: readonly ProgressContribution[];
  currentStage?: {
    key: string;
    label: string;
    items: readonly ProgressContribution[];
  } | null;
  stageCount: number;
}

export function parseAssessmentRating(value: unknown): AssessmentRating {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error("Een beoordeling moet een geheel getal van 1 tot en met 5 zijn.");
  }
  return value as AssessmentRating;
}

export function parseAssessmentValue(value: unknown): AssessmentValue {
  return value === null ? null : parseAssessmentRating(value);
}

export function journeyProgressPoints(rating: AssessmentValue): number | null {
  return rating === null ? null : rating / 5;
}

export function legacyNormalizedAssessmentScore(rating: AssessmentRating): number {
  return (rating - 1) / 4;
}

export function itemProgressPercent(rating: AssessmentValue): number | null {
  const points = journeyProgressPoints(rating);
  return points === null ? null : points * 100;
}

export function calculateProgress(
  contributions: readonly ProgressContribution[],
  options: { weighted?: boolean } = {}
): ProgressResult {
  const uniqueItems = uniqueContributions(contributions);
  const weighted = options.weighted ?? false;
  let numerator = 0;
  let denominator = 0;
  let assessedCount = 0;

  for (const contribution of uniqueItems) {
    const weight = weighted ? parseWeight(contribution.weight ?? 1) : 1;
    denominator += weight;
    if (contribution.rating !== null) {
      assessedCount += 1;
      numerator += (parseAssessmentRating(contribution.rating) / 5) * weight;
    }
  }

  const progressFraction = denominator === 0 ? null : numerator / denominator;
  const coverageFraction = uniqueItems.length === 0 ? null : assessedCount / uniqueItems.length;

  return {
    formulaVersion: SWIM_PROGRESS_FORMULA_VERSION,
    progressFraction,
    progressPercent: progressFraction === null ? null : progressFraction * 100,
    assessedCount,
    contributingCount: uniqueItems.length,
    coverageFraction,
    coveragePercent: coverageFraction === null ? null : coverageFraction * 100,
    weighted
  };
}

export function buildJourneyRings(input: JourneyRingInput): JourneyRing[] {
  const rings: JourneyRing[] = [];
  if (input.stageCount > 1 && input.currentStage) {
    rings.push({
      key: input.currentStage.key,
      label: input.currentStage.label,
      kind: "stage",
      progress: calculateProgress(input.currentStage.items)
    });
  }
  rings.push({
    key: "diploma",
    label: input.diplomaLabel ?? "Reis naar diploma",
    kind: "diploma",
    progress: calculateProgress(input.diplomaItems)
  });
  return rings;
}

function uniqueContributions(contributions: readonly ProgressContribution[]) {
  const items = new Map<string, ProgressContribution>();
  for (const contribution of contributions) {
    if (!contribution.itemKey.trim()) {
      throw new Error("Een voortgangsonderdeel heeft een stabiele sleutel nodig.");
    }
    if (items.has(contribution.itemKey)) {
      continue;
    }
    parseAssessmentValue(contribution.rating);
    items.set(contribution.itemKey, contribution);
  }
  return [...items.values()];
}

function parseWeight(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Een voortgangsgewicht moet groter dan nul zijn.");
  }
  return value;
}
