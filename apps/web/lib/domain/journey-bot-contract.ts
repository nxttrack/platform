import { toAmsterdamDate } from "../date/business-date";
export const journeyScenarioModes = [
  "intake_only",
  "intake_to_placement",
  "placement_to_next_stage",
  "full_journey_to_diploma",
  "stress_mix"
] as const;

export type JourneyScenarioMode = (typeof journeyScenarioModes)[number];

export type JourneyBotEnvironment = "staging";

export const journeyOutcomeClassifications = ["passed", "expected_blocker", "degraded", "technical_failure"] as const;
export type JourneyOutcomeClassification = (typeof journeyOutcomeClassifications)[number];

export const journeyStressVariants = ["normal", "under_4", "needs_review", "no_capacity", "recoverable_issue"] as const;
export type JourneyStressVariant = (typeof journeyStressVariants)[number];

export type MinimumAgeDecision = {
  blocked: boolean;
  eligibleFrom: string;
};

export type JourneyExecutionOutcome = {
  classification: JourneyOutcomeClassification;
  status: string;
};

export type JourneyIssueSummary = {
  critical: number;
  error: number;
  expected: number;
  info: number;
  unexpected: number;
  warning: number;
};

export type JourneyRunSummary = {
  completed: number;
  degraded: number;
  expectedBlocked: number;
  failed: number;
  healthStatus: "healthy" | "degraded" | "failed";
  issueSummary: JourneyIssueSummary;
  passed: number;
  status: "completed" | "partial" | "failed";
  technicalFailures: number;
};

export type JourneyDiplomaMilestone = {
  code: "DIPLOMA-A" | "DIPLOMA-B" | "DIPLOMA-C";
  label: "Diploma A" | "Diploma B" | "Diploma C";
};

export function getJourneyDiplomaMilestone(stage: { code: string | null; name: string }): JourneyDiplomaMilestone | null {
  const code = stage.code?.trim().toUpperCase();
  const name = stage.name.trim().toLowerCase();

  if (code === "AFZWEM-A" || name === "afzwemmen a") return { code: "DIPLOMA-A", label: "Diploma A" };
  if (code === "DIPLOMA-B" || name === "diploma b") return { code: "DIPLOMA-B", label: "Diploma B" };
  if (code === "DIPLOMA-C" || name === "diploma c") return { code: "DIPLOMA-C", label: "Diploma C" };

  return null;
}

export function getJourneyAttendanceLessonCount(runSpeed: string) {
  if (runSpeed === "realistic") return 12;
  if (runSpeed === "balanced") return 10;

  return 8;
}

export function normalizeJourneyBotEnvironment(value: string | null | undefined): JourneyBotEnvironment | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized === "staging" ? normalized : null;
}

export function isJourneyBotEnvironmentAllowed(value: string | null | undefined) {
  return normalizeJourneyBotEnvironment(value) === "staging";
}

export function getMinimumAgeDecision(birthDate: string, today = new Date()): MinimumAgeDecision {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new Error("A valid ISO birth date is required.");
  const [year, month, day] = birthDate.split("-").map(Number);
  const birth = new Date(Date.UTC(year!, month! - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month! - 1 || birth.getUTCDate() !== day) {
    throw new Error("A valid ISO birth date is required.");
  }
  const eligibleDate = new Date(Date.UTC(year + 4, month - 1, day));
  const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  return {
    blocked: eligibleDate.getTime() > todayDate.getTime(),
    eligibleFrom: toAmsterdamDate(eligibleDate)
  };
}

export function sortEligibleFifo<T extends { createdAt: string; eligibleFrom: string | null; priorityDate: string }>(
  entries: readonly T[],
  today = new Date()
): T[] {
  const todayIso = toAmsterdamDate(today);

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

export function resolveStressVariant(sequence: number): JourneyStressVariant {
  const bucket = Math.abs(Math.trunc(sequence)) % 20;

  if (bucket < 14) return "normal";
  if (bucket < 16) return "under_4";
  if (bucket < 18) return "needs_review";
  if (bucket === 18) return "no_capacity";
  return "recoverable_issue";
}

export function calculateJourneyRunAllowance(input: {
  activeJourneys: number;
  journeysStartedToday: number;
  journeysStartedTotal: number;
  maxActiveJourneys: number;
  maxJourneysPerDay: number;
  maxJourneysPerRun: number;
  stopAfterJourneys: number | null;
}) {
  const perRun = Math.max(0, Math.trunc(input.maxJourneysPerRun));
  const dailyRemaining = Math.max(0, Math.trunc(input.maxJourneysPerDay) - Math.max(0, Math.trunc(input.journeysStartedToday)));
  const activeRemaining = Math.max(0, Math.trunc(input.maxActiveJourneys) - Math.max(0, Math.trunc(input.activeJourneys)));
  const stopRemaining =
    input.stopAfterJourneys === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.trunc(input.stopAfterJourneys) - Math.max(0, Math.trunc(input.journeysStartedTotal)));

  return {
    activeRemaining,
    allowance: Math.min(perRun, dailyRemaining, activeRemaining, stopRemaining),
    dailyRemaining,
    stopRemaining
  };
}

export function getJourneyConfigStopReason(input: {
  journeysStartedTotal: number;
  now?: Date;
  runUntil: string | null;
  stopAfterJourneys: number | null;
}): "run_window_ended" | "journey_limit_reached" | null {
  if (input.runUntil && new Date(input.runUntil).getTime() <= (input.now ?? new Date()).getTime()) return "run_window_ended";
  if (input.stopAfterJourneys !== null && input.journeysStartedTotal >= input.stopAfterJourneys) return "journey_limit_reached";
  return null;
}

export function summarizeJourneyRun(outcomes: readonly JourneyExecutionOutcome[], issueSummary?: Partial<JourneyIssueSummary>): JourneyRunSummary {
  const issues: JourneyIssueSummary = {
    critical: issueSummary?.critical ?? 0,
    error: issueSummary?.error ?? 0,
    expected: issueSummary?.expected ?? 0,
    info: issueSummary?.info ?? 0,
    unexpected: issueSummary?.unexpected ?? 0,
    warning: issueSummary?.warning ?? 0
  };
  const passed = outcomes.filter((outcome) => outcome.classification === "passed").length;
  const expectedBlocked = outcomes.filter((outcome) => outcome.classification === "expected_blocker").length;
  const degraded = outcomes.filter((outcome) => outcome.classification === "degraded").length;
  const technicalFailures = outcomes.filter((outcome) => outcome.classification === "technical_failure").length;
  const hasTechnicalFailure = technicalFailures > 0 || issues.error > 0 || issues.critical > 0;
  const hasDegradation = degraded > 0 || issues.unexpected > 0;
  const status = hasTechnicalFailure ? (passed + expectedBlocked > 0 ? "partial" : "failed") : hasDegradation ? "partial" : "completed";

  return {
    completed: passed + expectedBlocked,
    degraded,
    expectedBlocked,
    failed: degraded + technicalFailures,
    healthStatus: hasTechnicalFailure ? "failed" : hasDegradation ? "degraded" : "healthy",
    issueSummary: issues,
    passed,
    status,
    technicalFailures
  };
}

export function summarizeJourneyTick(results: readonly JourneyRunSummary[]) {
  return results.reduce(
    (summary, result) => ({
      criticalIssues: summary.criticalIssues + result.issueSummary.critical,
      degradedJourneys: summary.degradedJourneys + result.degraded,
      failedRuns: summary.failedRuns + (result.healthStatus === "failed" ? 1 : 0),
      healthyRuns: summary.healthyRuns + (result.healthStatus === "healthy" ? 1 : 0),
      technicalFailures: summary.technicalFailures + result.technicalFailures,
      unexpectedIssues: summary.unexpectedIssues + result.issueSummary.unexpected
    }),
    { criticalIssues: 0, degradedJourneys: 0, failedRuns: 0, healthyRuns: 0, technicalFailures: 0, unexpectedIssues: 0 }
  );
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

  return (
    input.activeDays.includes(weekday) &&
    input.activeWindows.some((window) =>
      window.start <= window.end ? window.start <= time && time <= window.end : time >= window.start || time <= window.end
    )
  );
}
