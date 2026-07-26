export type WaitTimeBand = "short" | "medium" | "long" | "very_long" | "insufficient_data";

export type IntakeDaypart = "morning" | "afternoon" | "evening";

export type SwimmingExperience =
  | "none"
  | "water_familiar"
  | "lessons_no_diploma"
  | "diploma_a"
  | "diploma_b"
  | "diploma_c";

export type PublicIntakeSlot = {
  groupId: string;
  programId: string;
  groupName: string;
  stageId: string | null;
  stageName: string | null;
  stageSortOrder: number | null;
  weekday: number;
  weekdayLabel: string;
  daypart: IntakeDaypart;
  startsAt: string;
  endsAt: string;
  waitBand: WaitTimeBand;
  waitExplanation?: string;
  waitTip?: string;
};

export type IntakeRecommendation = PublicIntakeSlot & {
  rank: number;
  score: number;
  reasons: string[];
};

export type IntakeRecommendationInput = {
  slots: PublicIntakeSlot[];
  experience: SwimmingExperience;
  preferredDays: number[];
  preferredDayparts: Partial<Record<number, IntakeDaypart[]>>;
};

export const swimmingExperienceOptions: ReadonlyArray<{
  value: SwimmingExperience;
  label: string;
  description: string;
}> = [
  { value: "none", label: "Nog geen zwemles", description: "Nog niet eerder gestart met zwemles." },
  { value: "water_familiar", label: "Al wat watervrij", description: "Voelt zich redelijk vertrouwd in het water." },
  { value: "lessons_no_diploma", label: "Eerder zwemles gehad", description: "Heeft leservaring, maar nog geen diploma." },
  { value: "diploma_a", label: "Diploma A", description: "Heeft zwemdiploma A behaald." },
  { value: "diploma_b", label: "Diploma B", description: "Heeft zwemdiploma B behaald." },
  { value: "diploma_c", label: "Diploma C", description: "Heeft zwemdiploma C behaald." }
];

export const waitTimeLabels: Record<WaitTimeBand, string> = {
  short: "Korte wachttijd",
  medium: "Gemiddelde wachttijd",
  long: "Lange wachttijd",
  very_long: "Zeer lange wachttijd",
  insufficient_data: "Onvoldoende data"
};

export const daypartLabels: Record<IntakeDaypart, string> = {
  morning: "Ochtend",
  afternoon: "Middag",
  evening: "Avond"
};

export function rankIntakeSlots(input: IntakeRecommendationInput): IntakeRecommendation[] {
  if (input.preferredDays.length === 0) {
    return [];
  }

  const stageOrders = Array.from(
    new Set(input.slots.map((slot) => slot.stageSortOrder).filter((value): value is number => typeof value === "number"))
  ).sort((left, right) => left - right);
  const targetStageIndex = Math.round(getExperienceTargetRatio(input.experience) * Math.max(0, stageOrders.length - 1));
  const targetStageOrder = stageOrders[targetStageIndex] ?? null;
  const preferredDayIndex = new Map(input.preferredDays.map((weekday, index) => [weekday, index]));

  return input.slots
    .map((slot) => {
      const stageDistance =
        targetStageOrder === null || slot.stageSortOrder === null ? 0 : Math.abs(stageOrders.indexOf(slot.stageSortOrder) - targetStageIndex);
      const stageScore = Math.max(0, 34 - stageDistance * 10);
      const waitScore =
        slot.waitBand === "short"
          ? 32
          : slot.waitBand === "medium"
            ? 16
            : slot.waitBand === "long"
              ? 4
              : slot.waitBand === "insufficient_data"
                ? 2
                : 0;
      const dayPreferenceIndex = preferredDayIndex.get(slot.weekday);
      const dayMatches = typeof dayPreferenceIndex === "number";
      const preferredParts = input.preferredDayparts[slot.weekday] ?? [];
      const daypartMatches = dayMatches && (preferredParts.length === 0 || preferredParts.includes(slot.daypart));
      const preferenceScore = daypartMatches ? Math.max(42, 54 - (dayPreferenceIndex ?? 0) * 4) : dayMatches ? 24 : 0;
      const score = stageScore + waitScore + preferenceScore;
      const reasons = [
        daypartMatches
          ? `${slot.weekdayLabel.toLowerCase()} ${daypartLabels[slot.daypart].toLowerCase()} past bij jullie voorkeur`
          : dayMatches
            ? `${slot.weekdayLabel.toLowerCase()} is een alternatief dagdeel op een voorkeursdag`
            : `${slot.weekdayLabel.toLowerCase()} is het best passende alternatieve moment`,
        targetStageOrder !== null && stageDistance === 0
          ? "sluit het beste aan op de opgegeven zwemervaring"
          : "is een passend alternatief voor het vermoedelijke instroomniveau",
        waitTimeLabels[slot.waitBand].toLowerCase()
      ];

      return { ...slot, rank: 0, score, reasons };
    })
    .sort((left, right) => right.score - left.score || left.weekday - right.weekday || left.startsAt.localeCompare(right.startsAt))
    .slice(0, 3)
    .map((recommendation, index) => ({ ...recommendation, rank: index + 1 }));
}

export function deriveDaypart(startTime: string): IntakeDaypart {
  const hour = Number(startTime.slice(0, 2));

  if (hour < 12) {
    return "morning";
  }

  if (hour < 17) {
    return "afternoon";
  }

  return "evening";
}

export function isSwimmingExperience(value: string | null): value is SwimmingExperience {
  return swimmingExperienceOptions.some((option) => option.value === value);
}

export function isIntakeDaypart(value: string): value is IntakeDaypart {
  return value === "morning" || value === "afternoon" || value === "evening";
}

function getExperienceTargetRatio(experience: SwimmingExperience) {
  switch (experience) {
    case "none":
      return 0;
    case "water_familiar":
      return 0.1;
    case "lessons_no_diploma":
      return 0.25;
    case "diploma_a":
      return 0.5;
    case "diploma_b":
      return 0.75;
    case "diploma_c":
      return 1;
  }
}
