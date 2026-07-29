export type EmptySeatOpening = {
  id: string;
  sessionId: string;
  groupId: string;
  programId: string;
  stageId: string | null;
  locationId: string | null;
  startsAt: string;
  capacity: number;
  occupied: number;
  cancellationSeats: number;
  activeHolds: number;
};

export type EmptySeatCandidateInput = {
  id: string;
  type: "waitlist" | "makeup";
  displayName: string;
  programId: string;
  stageId: string | null;
  preferredWeekdays: number[];
  preferredWindows: Array<{ weekday: number; startsAfter: string | null; endsBefore: string | null }>;
  fifoRank: number | null;
  creditExpiresOn: string | null;
  familyGroupDays: number[];
  familyLocationIds: string[];
  isTest: boolean;
};

export type EmptySeatRecoveryCandidate = {
  id: string;
  type: "waitlist" | "makeup";
  displayName: string;
  score: number;
  confidence: number;
  reasons: string[];
  blockers: string[];
  fifoRank: number | null;
  familyContext: {
    sameDay: boolean;
    sameLocation: boolean;
  };
  actionable: boolean;
  suggestedAction: string;
};

export type EmptySeatRecoveryResult = {
  openingId: string;
  availableSeats: number;
  candidates: EmptySeatRecoveryCandidate[];
  actionableCount: number;
  recoveryBand: "within_24h" | "within_48h" | "within_72h" | "manual_outreach" | "no_match";
  confidence: number;
  summary: string;
  reasons: string[];
};

export function calculateEmptySeatRecovery(input: {
  opening: EmptySeatOpening;
  candidates: EmptySeatCandidateInput[];
  now?: Date;
}): EmptySeatRecoveryResult | null {
  const now = input.now ?? new Date();
  const startsAt = new Date(input.opening.startsAt);
  const availableSeats = Math.max(0, input.opening.capacity - input.opening.occupied + input.opening.cancellationSeats - input.opening.activeHolds);
  if (availableSeats <= 0 || startsAt <= now) return null;
  const weekday = isoWeekday(startsAt);
  const sessionTime = startsAt.toISOString().slice(11, 16);

  const candidates = input.candidates
    .filter((candidate) => !candidate.isTest)
    .map((candidate) => evaluateCandidate(input.opening, candidate, weekday, sessionTime, now))
    .filter((candidate) => candidate.score >= 35)
    .sort((left, right) =>
      Number(right.actionable) - Number(left.actionable)
      || right.score - left.score
      || (left.fifoRank ?? Number.MAX_SAFE_INTEGER) - (right.fifoRank ?? Number.MAX_SAFE_INTEGER)
    )
    .slice(0, 12);
  const actionable = candidates.filter((candidate) => candidate.actionable);
  const topScore = actionable[0]?.score ?? 0;
  const urgencyHours = (startsAt.getTime() - now.getTime()) / 3_600_000;

  let recoveryBand: EmptySeatRecoveryResult["recoveryBand"] = "no_match";
  if (actionable.length >= Math.min(3, availableSeats) && topScore >= 80) recoveryBand = "within_24h";
  else if (actionable.length >= availableSeats && topScore >= 70) recoveryBand = "within_48h";
  else if (actionable.length > 0) recoveryBand = "within_72h";
  else if (candidates.length > 0) recoveryBand = "manual_outreach";

  const confidence = clamp(
    0.35
    + Math.min(0.3, actionable.length * 0.08)
    + Math.min(0.25, topScore / 400)
    + (input.opening.cancellationSeats > 0 ? 0.05 : 0)
    - (urgencyHours < 12 ? 0.1 : 0),
    0.25,
    0.95
  );
  const summary = recoveryBand === "within_24h"
    ? `Deze ${availableSeats === 1 ? "plek" : `${availableSeats} plekken`} kan waarschijnlijk binnen 24 uur worden gevuld door ${actionable.length} passende kandidaten.`
    : recoveryBand === "no_match"
      ? `Er is nu geen passende kandidaat voor ${availableSeats === 1 ? "de vrije plek" : "de vrije plekken"}.`
      : `${actionable.length} kandidaat${actionable.length === 1 ? "" : "en"} vragen menselijke beoordeling voor ${availableSeats === 1 ? "de vrije plek" : `${availableSeats} vrije plekken`}.`;
  return {
    openingId: input.opening.id,
    availableSeats,
    candidates,
    actionableCount: actionable.length,
    recoveryBand,
    confidence,
    summary,
    reasons: [
      `${availableSeats} actuele vrije ${availableSeats === 1 ? "plek" : "plekken"}`,
      input.opening.cancellationSeats > 0 ? `${input.opening.cancellationSeats} plek door afmelding` : "structurele groepscapaciteit",
      `${actionable.length} blocker-vrije kandidaten`,
      `les over ${Math.max(1, Math.round(urgencyHours))} uur`
    ]
  };
}

function evaluateCandidate(
  opening: EmptySeatOpening,
  candidate: EmptySeatCandidateInput,
  weekday: number,
  sessionTime: string,
  now: Date
): EmptySeatRecoveryCandidate {
  const reasons: string[] = [];
  const blockers: string[] = [];
  let score = 25;

  if (candidate.programId !== opening.programId) blockers.push("ander programma");
  else {
    score += 20;
    reasons.push("programma past");
  }
  if (candidate.stageId !== opening.stageId) blockers.push("niveau past niet exact");
  else {
    score += 20;
    reasons.push("niveau past exact");
  }
  if (candidate.type === "waitlist" && candidate.fifoRank !== 1) {
    blockers.push(`FIFO-positie ${candidate.fifoRank ?? "onbekend"}; eerstvolgende kandidaat blijft leidend`);
  } else if (candidate.type === "waitlist") {
    score += 10;
    reasons.push("eerste in passende FIFO-cohort");
  }
  if (candidate.preferredWeekdays.includes(weekday)) {
    score += 10;
    reasons.push("voorkeursdag");
  }
  const timeMatch = candidate.preferredWindows.some((window) =>
    window.weekday === weekday
    && (!window.startsAfter || sessionTime >= window.startsAfter.slice(0, 5))
    && (!window.endsBefore || sessionTime <= window.endsBefore.slice(0, 5))
  );
  if (timeMatch) {
    score += 10;
    reasons.push("voorkeurstijd");
  }
  const sameDay = candidate.familyGroupDays.includes(weekday);
  const sameLocation = !!opening.locationId && candidate.familyLocationIds.includes(opening.locationId);
  if (sameDay) {
    score += 5;
    reasons.push("sluit aan op gezinsdag");
  }
  if (sameLocation) {
    score += 5;
    reasons.push("zelfde gezinslocatie");
  }
  if (candidate.type === "makeup" && candidate.creditExpiresOn) {
    const days = Math.ceil((new Date(candidate.creditExpiresOn).getTime() - now.getTime()) / 86_400_000);
    if (days <= 7) {
      score += 10;
      reasons.push("inhaalcredit verloopt binnen 7 dagen");
    }
  }
  const cappedScore = Math.min(100, score);
  const actionable = blockers.length === 0;
  return {
    id: candidate.id,
    type: candidate.type,
    displayName: candidate.displayName,
    score: cappedScore,
    confidence: clamp((cappedScore / 100) * (actionable ? 0.95 : 0.65), 0.2, 0.95),
    reasons,
    blockers,
    fifoRank: candidate.fifoRank,
    familyContext: { sameDay, sameLocation },
    actionable,
    suggestedAction: actionable
      ? candidate.type === "makeup" ? "Open de inhaalmarkt en bevestig de boeking bewust." : "Open de wachtlijst en maak na controle een plaatsingsaanbod."
      : "Beoordeel alleen als context; hef blockers niet automatisch op."
  };
}

function isoWeekday(date: Date) {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
