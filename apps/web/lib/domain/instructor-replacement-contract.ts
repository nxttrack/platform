export type ReplacementSession = {
  id: string;
  programId: string;
  stageId: string | null;
  locationId: string | null;
  startsAt: string;
  endsAt: string;
};

export type InstructorQualification = {
  programId: string | null;
  stageId: string | null;
  resourceId: string | null;
  status: string;
  validFrom: string | null;
  validUntil: string | null;
};

export type InstructorAvailabilityWindow = {
  weekday: number;
  startsAt: string;
  endsAt: string;
  type: "available" | "unavailable";
  startsOn: string | null;
  endsOn: string | null;
};

export type ScheduledInstructorSession = {
  sessionId: string;
  locationId: string | null;
  startsAt: string;
  endsAt: string;
};

export type InstructorReplacementInput = {
  instructorId: string;
  displayName: string;
  qualifications: InstructorQualification[];
  availability: InstructorAvailabilityWindow[];
  scheduledSessions: ScheduledInstructorSession[];
  weeklyMinutes: number;
  dailyMinutes: number;
  dailySessions: number;
  limits: {
    maxWeeklyMinutes: number;
    maxDailyMinutes: number;
    maxConsecutiveMinutes: number;
    maxSessionsPerDay: number;
    minimumBreakMinutes: number;
    crossLocationBufferMinutes: number;
  };
};

export type InstructorReplacementCandidate = {
  instructorId: string;
  displayName: string;
  score: number;
  confidence: number;
  actionable: boolean;
  reasons: string[];
  blockers: string[];
  workloadAfter: { weeklyMinutes: number; dailyMinutes: number; dailySessions: number };
  lessonContext: string[];
};

export function rankInstructorReplacements(input: {
  session: ReplacementSession;
  instructors: InstructorReplacementInput[];
  excludedInstructorId?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (new Date(input.session.startsAt) <= now) return [];
  return input.instructors
    .filter((instructor) => instructor.instructorId !== input.excludedInstructorId)
    .map((instructor) => evaluateInstructor(input.session, instructor, now))
    .sort((left, right) => Number(right.actionable) - Number(left.actionable) || right.score - left.score || left.displayName.localeCompare(right.displayName));
}

function evaluateInstructor(session: ReplacementSession, instructor: InstructorReplacementInput, now: Date): InstructorReplacementCandidate {
  const blockers: string[] = [];
  const reasons: string[] = [];
  let score = 20;
  const lessonMinutes = minutesBetween(session.startsAt, session.endsAt);
  const lessonDate = session.startsAt.slice(0, 10);
  const exactStage = instructor.qualifications.some((qualification) =>
    qualification.status === "active"
    && qualification.stageId === session.stageId
    && qualificationValid(qualification, lessonDate)
  );
  const programQualified = instructor.qualifications.some((qualification) =>
    qualification.status === "active"
    && qualification.programId === session.programId
    && (qualification.stageId === null || qualification.stageId === session.stageId)
    && qualificationValid(qualification, lessonDate)
  );
  if (!programQualified && !exactStage) blockers.push("geen geldige kwalificatie voor programma of niveau");
  else {
    score += exactStage ? 25 : 18;
    reasons.push(exactStage ? "exacte niveaukwalificatie" : "programmakwalificatie");
  }
  const locationQualified = !!session.locationId && instructor.qualifications.some((qualification) =>
    qualification.status === "active"
    && qualification.resourceId === session.locationId
    && qualificationValid(qualification, lessonDate)
  );
  if (locationQualified) {
    score += 8;
    reasons.push("locatiebekend");
  }
  const availability = isAvailable(session, instructor.availability);
  if (!availability.available) blockers.push(availability.reason);
  else {
    score += 18;
    reasons.push(availability.reason);
  }
  const conflict = scheduleConflict(session, instructor.scheduledSessions, instructor.limits);
  if (conflict) blockers.push(conflict);
  else {
    score += 15;
    reasons.push("geen rooster- of reisconflict");
  }
  const workloadAfter = {
    weeklyMinutes: instructor.weeklyMinutes + lessonMinutes,
    dailyMinutes: instructor.dailyMinutes + lessonMinutes,
    dailySessions: instructor.dailySessions + 1
  };
  if (lessonMinutes > instructor.limits.maxConsecutiveMinutes) blockers.push("maximale aaneengesloten lestijd overschreden");
  if (workloadAfter.weeklyMinutes > instructor.limits.maxWeeklyMinutes) blockers.push("maximale weekbelasting overschreden");
  if (workloadAfter.dailyMinutes > instructor.limits.maxDailyMinutes) blockers.push("maximale dagbelasting overschreden");
  if (workloadAfter.dailySessions > instructor.limits.maxSessionsPerDay) blockers.push("maximum aantal lessen per dag overschreden");
  if (!blockers.some((blocker) => blocker.includes("belasting") || blocker.includes("lessen per dag"))) {
    score += 10;
    reasons.push(`${workloadAfter.dailyMinutes}/${instructor.limits.maxDailyMinutes} minuten dagbelasting`);
  }
  const actionable = blockers.length === 0;
  const cappedScore = Math.min(100, score);
  return {
    instructorId: instructor.instructorId,
    displayName: instructor.displayName,
    score: cappedScore,
    confidence: Math.max(0.25, Math.min(0.95, (cappedScore / 100) * (actionable ? 0.95 : 0.6))),
    actionable,
    reasons,
    blockers,
    workloadAfter,
    lessonContext: [
      `${lessonMinutes} minuten lestijd`,
      session.locationId ? (locationQualified ? "locatie-ervaring bevestigd" : "locatie-ervaring niet expliciet vastgelegd") : "leslocatie niet ingesteld",
      `beoordeeld ${now.toISOString()}`
    ]
  };
}

function qualificationValid(qualification: InstructorQualification, lessonDate: string) {
  return (!qualification.validFrom || qualification.validFrom <= lessonDate)
    && (!qualification.validUntil || qualification.validUntil >= lessonDate);
}

function isAvailable(session: ReplacementSession, windows: InstructorAvailabilityWindow[]) {
  if (!windows.length) return { available: false, reason: "beschikbaarheid niet vastgelegd" };
  const startsAt = new Date(session.startsAt);
  const date = session.startsAt.slice(0, 10);
  const weekday = startsAt.getUTCDay();
  const startTime = session.startsAt.slice(11, 16);
  const endTime = session.endsAt.slice(11, 16);
  const active = windows.filter((window) =>
    window.weekday === weekday
    && (!window.startsOn || window.startsOn <= date)
    && (!window.endsOn || window.endsOn >= date)
  );
  if (active.some((window) => window.type === "unavailable" && window.startsAt < endTime && window.endsAt > startTime)) {
    return { available: false, reason: "expliciet als niet beschikbaar gemarkeerd" };
  }
  const covered = active.some((window) => window.type === "available" && window.startsAt <= startTime && window.endsAt >= endTime);
  return covered
    ? { available: true, reason: "beschikbaarheid dekt de volledige les" }
    : { available: false, reason: "geen beschikbaarheidsvenster voor de volledige les" };
}

function scheduleConflict(
  session: ReplacementSession,
  scheduled: ScheduledInstructorSession[],
  limits: InstructorReplacementInput["limits"]
) {
  const start = new Date(session.startsAt).getTime();
  const end = new Date(session.endsAt).getTime();
  for (const other of scheduled) {
    const otherStart = new Date(other.startsAt).getTime();
    const otherEnd = new Date(other.endsAt).getTime();
    if (start < otherEnd && otherStart < end) return "overlappende les in bestaand rooster";
    const crossLocation = !!session.locationId && !!other.locationId && session.locationId !== other.locationId;
    const requiredBuffer = (crossLocation ? limits.crossLocationBufferMinutes : limits.minimumBreakMinutes) * 60_000;
    if (otherEnd <= start && start - otherEnd < requiredBuffer) return crossLocation ? "onvoldoende reistijd vanaf vorige locatie" : "onvoldoende pauze voor de les";
    if (end <= otherStart && otherStart - end < requiredBuffer) return crossLocation ? "onvoldoende reistijd naar volgende locatie" : "onvoldoende pauze na de les";
  }
  return null;
}

function minutesBetween(startsAt: string, endsAt: string) {
  return Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);
}
