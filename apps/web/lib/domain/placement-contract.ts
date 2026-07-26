export type PlacementBlockerCode =
  | "under_minimum_age"
  | "no_capacity"
  | "wrong_stage"
  | "resource_conflict"
  | "instructor_missing"
  | "instructor_overloaded"
  | "payment_blocked"
  | "waitlist_not_approved";

export type PlacementReason = {
  code: string;
  label: string;
  explanation: string;
  evidence: string;
  weight: number;
};

export type PlacementBlocker = {
  code: PlacementBlockerCode;
  label: string;
  explanation: string;
  evidence: string;
  hard: true;
};

export type SmartPlacementEntry = {
  id: string;
  programId: string;
  stageId: string | null;
  status: string;
  birthDate: string | null;
  eligibleFrom: string | null;
  minimumAgeBlocked: boolean;
  preferredDays: number[];
  preferredTimeWindows: Array<{ weekday: number; startsAfter: string | null; endsBefore: string | null }>;
  preferredLocationId: string | null;
  fifoRank: number;
  fifoCohortSize: number;
  paymentBlocked: boolean;
  siblingGroupIds: string[];
};

export type SmartPlacementGroup = {
  id: string;
  name: string;
  programId: string;
  stageId: string | null;
  weekday: number | null;
  startsAt: string | null;
  locationId: string | null;
  fixedCapacity: number;
  usedCapacity: number;
  projectedExits4Weeks: number;
  projectedExits8Weeks: number;
  hasInstructor: boolean;
  instructorOverloaded: boolean;
  hasResource: boolean;
  resourceConflict: boolean;
  averageAgeYears: number | null;
  ageSampleSize: number;
};

export type SmartPlacementSuggestion = {
  groupId: string;
  groupName: string;
  score: number;
  confidence: number;
  reasons: PlacementReason[];
  blockers: PlacementBlocker[];
  capacitySnapshot: {
    fixed: number;
    used: number;
    available: number;
    projectedExits4Weeks: number;
    projectedExits8Weeks: number;
  };
  canOffer: boolean;
};

export function computeSmartPlacementSuggestions(input: {
  entry: SmartPlacementEntry;
  groups: SmartPlacementGroup[];
  now: string;
  allowStageFallback?: boolean;
}): SmartPlacementSuggestion[] {
  return input.groups
    .filter((group) => group.programId === input.entry.programId)
    .map((group) => scoreGroup(input.entry, group, input.now, input.allowStageFallback ?? false))
    .sort((left, right) =>
      Number(left.blockers.length > 0) - Number(right.blockers.length > 0) ||
      right.score - left.score ||
      left.groupName.localeCompare(right.groupName, "nl")
    );
}

function scoreGroup(
  entry: SmartPlacementEntry,
  group: SmartPlacementGroup,
  nowValue: string,
  allowStageFallback: boolean
): SmartPlacementSuggestion {
  const reasons: PlacementReason[] = [];
  const blockers: PlacementBlocker[] = [];
  const available = Math.max(0, group.fixedCapacity - group.usedCapacity);
  const age = ageYears(entry.birthDate, nowValue);
  let score = 15;
  let evaluatedSignals = 2;

  reasons.push(reason("program_match", "Programma past", "De groep hoort bij het gevraagde programma.", group.programId, 15));

  if (entry.minimumAgeBlocked || (entry.eligibleFrom && entry.eligibleFrom > nowValue.slice(0, 10)) || (age !== null && age < 4)) {
    blockers.push(blocker(
      "under_minimum_age",
      "Minimumleeftijd nog niet bereikt",
      "Plaatsing blijft geblokkeerd tot de vierde verjaardag.",
      entry.eligibleFrom ? `Plaatsbaar vanaf ${entry.eligibleFrom}` : `Berekende leeftijd ${age?.toFixed(1) ?? "onbekend"}`
    ));
  }

  if (!["waiting", "reviewing"].includes(entry.status)) {
    blockers.push(blocker(
      "waitlist_not_approved",
      "Wachtlijststatus staat geen nieuw aanbod toe",
      "Alleen een actieve, beoordeelde wachtlijstkandidaat kan opnieuw worden voorgesteld.",
      `Status: ${entry.status}`
    ));
  }

  const stageMatch = !!entry.stageId && group.stageId === entry.stageId;
  if (stageMatch) {
    score += 20;
    reasons.push(reason("stage_match", "Niveau sluit aan", "Het badje/niveau is exact gelijk aan de aanbeveling.", group.stageId ?? "geen niveau", 20));
  } else if (!allowStageFallback) {
    blockers.push(blocker(
      "wrong_stage",
      "Niveau komt niet overeen",
      "Een ander niveau mag alleen na een expliciete inhoudelijke beoordeling worden gebruikt.",
      `Geadviseerd ${entry.stageId ?? "onbekend"}; groep ${group.stageId ?? "onbekend"}`
    ));
  } else {
    reasons.push(reason("stage_fallback", "Expliciete niveaufallback", "De admin heeft alternatieve niveaus toegestaan.", group.stageId ?? "geen niveau", 0));
  }
  evaluatedSignals += 1;

  if (available >= 1) {
    const weight = Math.min(20, 12 + available * 2);
    score += weight;
    reasons.push(reason("fixed_capacity", "Vaste capaciteit beschikbaar", "De huidige bezetting laat minimaal één echte plek vrij.", `${available} vrij van ${group.fixedCapacity}`, weight));
  } else {
    blockers.push(blocker(
      "no_capacity",
      "Geen vaste capaciteit",
      "Verwachte doorstroom wordt nooit gebruikt om een volle groep toch plaatsbaar te verklaren.",
      `${group.usedCapacity}/${group.fixedCapacity} bezet`
    ));
  }
  evaluatedSignals += 1;

  if (group.projectedExits4Weeks > 0 || group.projectedExits8Weeks > 0) {
    const weight = available > 0 ? Math.min(5, group.projectedExits4Weeks * 2 + group.projectedExits8Weeks) : 0;
    score += weight;
    reasons.push(reason(
      "projected_flow",
      "Verwachte doorstroom",
      available > 0
        ? "Verwachte uitstroom ondersteunt de beschikbare capaciteit."
        : "Er is verwachte uitstroom, maar dat heft de huidige capaciteitsblokkade niet op.",
      `${group.projectedExits4Weeks} binnen 4 weken; ${group.projectedExits8Weeks} binnen 8 weken`,
      weight
    ));
  }

  const dayMatch = !!group.weekday && entry.preferredDays.includes(group.weekday);
  if (dayMatch) {
    score += 10;
    reasons.push(reason("preferred_day", "Voorkeursdag match", "De vaste lesdag staat bij de kandidaat als voorkeur.", `Weekdag ${group.weekday}`, 10));
  }
  evaluatedSignals += 1;

  const timeMatch = !!group.weekday && !!group.startsAt && entry.preferredTimeWindows.some((window) =>
    window.weekday === group.weekday &&
    (!window.startsAfter || group.startsAt! >= window.startsAfter) &&
    (!window.endsBefore || group.startsAt! < window.endsBefore)
  );
  if (timeMatch) {
    score += 8;
    reasons.push(reason("preferred_time", "Voorkeurstijd match", "De starttijd valt binnen het vastgelegde tijdvak.", group.startsAt ?? "", 8));
  }
  evaluatedSignals += 1;

  if (entry.preferredLocationId && group.locationId === entry.preferredLocationId) {
    score += 6;
    reasons.push(reason("preferred_location", "Locatie match", "De groep gebruikt de afgeleide voorkeurslocatie.", group.locationId, 6));
  }
  evaluatedSignals += entry.preferredLocationId ? 1 : 0;

  if (!group.hasResource || group.resourceConflict) {
    blockers.push(blocker(
      "resource_conflict",
      "Resource is niet betrouwbaar beschikbaar",
      "Een bad, baan of ruimte ontbreekt of heeft een bewezen planningsconflict.",
      group.hasResource ? "Overlappende sessie op dezelfde resource" : "Geen actieve resource gekoppeld"
    ));
  } else {
    score += 6;
    reasons.push(reason("resource_available", "Resource beschikbaar", "Er is een actieve resource zonder bewezen conflict.", group.locationId ?? "gekoppelde resource", 6));
  }
  evaluatedSignals += 1;

  if (!group.hasInstructor) {
    blockers.push(blocker(
      "instructor_missing",
      "Instructeur ontbreekt",
      "Er is geen geldige groeps- of sessietoewijzing aangetroffen.",
      "Geen effectieve instructeur"
    ));
  } else if (group.instructorOverloaded) {
    blockers.push(blocker(
      "instructor_overloaded",
      "Instructeur heeft een conflict",
      "Er is een bewezen overlappende toewijzing of onbeschikbaarheid.",
      "Planningsoverlap aangetroffen"
    ));
  } else {
    score += 8;
    reasons.push(reason("instructor_available", "Instructeur beschikbaar", "De groep heeft een geldige instructeur zonder bewezen conflict.", "Actieve toewijzing", 8));
  }
  evaluatedSignals += 1;

  if (age !== null && group.averageAgeYears !== null && group.ageSampleSize >= 3) {
    const ageDelta = Math.abs(age - group.averageAgeYears);
    const weight = ageDelta <= 1.5 ? 4 : ageDelta <= 3 ? 2 : 0;
    score += weight;
    reasons.push(reason(
      "age_balance",
      "Leeftijdsbalans",
      weight > 0 ? "De leeftijd past bij de huidige groepsbalans." : "De leeftijd wijkt af; laat de groepsdynamiek inhoudelijk beoordelen.",
      `Kandidaat ${age.toFixed(1)} jaar; groepsgemiddelde ${group.averageAgeYears.toFixed(1)} jaar`,
      weight
    ));
    evaluatedSignals += 1;
  }

  if (entry.siblingGroupIds.includes(group.id)) {
    score += 3;
    reasons.push(reason("sibling_group", "Gezinsplanning", "Een betrouwbaar gekoppelde broer of zus zit in deze groep.", group.name, 3));
    evaluatedSignals += 1;
  }

  const fifoRatio = entry.fifoCohortSize > 0
    ? 1 - Math.min(1, Math.max(0, entry.fifoRank - 1) / entry.fifoCohortSize)
    : 0.5;
  const fifoWeight = Math.round(fifoRatio * 6);
  score += fifoWeight;
  reasons.push(reason("fifo_priority", "FIFO-prioriteit", "Oudere plaatsbare kandidaten behouden voorrang binnen dezelfde doelgroep.", `Positie ${entry.fifoRank} van ${entry.fifoCohortSize}`, fifoWeight));
  evaluatedSignals += 1;

  if (entry.paymentBlocked) {
    blockers.push(blocker(
      "payment_blocked",
      "Expliciete betaalblokkade",
      "Alleen een aantoonbare beleidsblokkade mag plaatsing tegenhouden; een achterstand op zichzelf is geen automatisch besluit.",
      "Bevestigd tenantbeleid en open betaalblokkade"
    ));
  }

  const boundedScore = Math.max(0, Math.min(blockers.length ? 35 : 100, Math.round(score * 100) / 100));
  const confidence = Math.min(0.96, Math.round((0.45 + Math.min(10, evaluatedSignals) * 0.05) * 100) / 100);

  return {
    groupId: group.id,
    groupName: group.name,
    score: boundedScore,
    confidence,
    reasons,
    blockers,
    capacitySnapshot: {
      fixed: group.fixedCapacity,
      used: group.usedCapacity,
      available,
      projectedExits4Weeks: group.projectedExits4Weeks,
      projectedExits8Weeks: group.projectedExits8Weeks
    },
    canOffer: blockers.length === 0
  };
}

function reason(code: string, label: string, explanation: string, evidence: string, weight: number): PlacementReason {
  return { code, label, explanation, evidence, weight };
}

function blocker(code: PlacementBlockerCode, label: string, explanation: string, evidence: string): PlacementBlocker {
  return { code, label, explanation, evidence, hard: true };
}

function ageYears(birthDate: string | null, nowValue: string) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  const now = new Date(nowValue);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(now.getTime())) return null;
  return (now.getTime() - birth.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
}
