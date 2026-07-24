export const journeyScenarioModes = [
  "intake_only",
  "intake_to_placement",
  "placement_to_next_stage",
  "full_journey_to_diploma",
  "stress_mix"
] as const;

export type JourneyScenarioMode = (typeof journeyScenarioModes)[number];

export type JourneyBotEnvironment = "development" | "dev" | "staging" | "production";

export type MinimumAgeDecision = {
  blocked: boolean;
  eligibleFrom: string;
};

export function normalizeJourneyBotEnvironment(value: string | null | undefined): JourneyBotEnvironment | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized === "development" || normalized === "dev" || normalized === "staging" || normalized === "production" ? normalized : null;
}

export function isJourneyBotEnvironmentAllowed(value: string | null | undefined, allowProduction = false) {
  const environment = normalizeJourneyBotEnvironment(value);

  return environment === "development" || environment === "dev" || environment === "staging" || (environment === "production" && allowProduction);
}

export function getMinimumAgeDecision(birthDate: string, today = new Date()): MinimumAgeDecision {
  const [year, month, day] = birthDate.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error("A valid ISO birth date is required.");
  }

  const eligibleDate = new Date(Date.UTC(year + 4, month - 1, day));
  const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  return {
    blocked: eligibleDate.getTime() > todayDate.getTime(),
    eligibleFrom: eligibleDate.toISOString().slice(0, 10)
  };
}

export function sortEligibleFifo<T extends { createdAt: string; eligibleFrom: string | null; priorityDate: string }>(
  entries: readonly T[],
  today = new Date()
): T[] {
  const todayIso = today.toISOString().slice(0, 10);

  return entries
    .filter((entry) => !entry.eligibleFrom || entry.eligibleFrom <= todayIso)
    .sort((left, right) => {
      const priority = left.priorityDate.localeCompare(right.priorityDate);

      return priority !== 0 ? priority : left.createdAt.localeCompare(right.createdAt);
    });
}

export function chooseNextRunAt(input: { maxIntervalMinutes: number; minIntervalMinutes: number; now?: Date; random?: number }) {
  const min = Math.max(1, Math.floor(input.minIntervalMinutes));
  const max = Math.max(min, Math.floor(input.maxIntervalMinutes));
  const normalizedRandom = Math.min(0.999999, Math.max(0, input.random ?? Math.random()));
  const interval = min + Math.floor(normalizedRandom * (max - min + 1));
  const next = new Date((input.now ?? new Date()).getTime() + interval * 60_000);

  return {
    intervalMinutes: interval,
    nextRunAt: next.toISOString()
  };
}

export function resolveScenarioMode(mode: JourneyScenarioMode, random = Math.random()): Exclude<JourneyScenarioMode, "stress_mix"> {
  if (mode !== "stress_mix") return mode;
  if (random < 0.2) return "intake_only";
  if (random < 0.55) return "intake_to_placement";
  if (random < 0.8) return "placement_to_next_stage";

  return "full_journey_to_diploma";
}

export function isActiveJourneyWindow(input: {
  activeDays: readonly number[];
  activeWindows: readonly { end: string; start: string }[];
  now?: Date;
  timeZone?: string;
}) {
  const now = input.now ?? new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: input.timeZone ?? "Europe/Amsterdam",
    weekday: "short"
  }).formatToParts(now);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value.toLowerCase() ?? "";
  const weekday = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 }[weekdayName as "mon"] ?? 0;
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const time = `${hour === "24" ? "00" : hour}:${minute}`;

  return input.activeDays.includes(weekday) && input.activeWindows.some((window) => window.start <= time && time <= window.end);
}
