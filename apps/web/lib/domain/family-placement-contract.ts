export type FamilyPlacementReason = {
  label: string;
  explanation: string;
  evidence: string;
  weight: number;
};

export type FamilyPlacementBlocker = {
  code: string;
  label: string;
  explanation: string;
  evidence: string;
};

export type FamilyChildPlacementCandidate = {
  participantId: string | null;
  waitlistEntryId: string | null;
  participantName: string;
  groupId: string;
  groupName: string;
  programId: string;
  stageId: string | null;
  weekday: number;
  startsAt: string;
  endsAt: string;
  locationId: string | null;
  locationName: string;
  score: number;
  confidence: number;
  capacityAvailable: number;
  fifoRank: number | null;
  fifoCohortSize: number | null;
  fifoOverrideRequired: boolean;
  isTest: boolean;
  journeyRunId: string | null;
  reasons: FamilyPlacementReason[];
  blockers: FamilyPlacementBlocker[];
};

export type FamilyPlacementOption = {
  family_option_id: string;
  total_score: number;
  confidence: number;
  children_options: FamilyChildPlacementCandidate[];
  same_day: boolean;
  same_location: boolean;
  waiting_time_between_lessons: number | null;
  reasons: FamilyPlacementReason[];
  blockers: FamilyPlacementBlocker[];
};

export function computeFamilyPlacementOptions(input: {
  guardianId: string;
  candidatesByChild: Array<{
    childKey: string;
    candidates: FamilyChildPlacementCandidate[];
  }>;
  limit?: number;
}): FamilyPlacementOption[] {
  if (
    input.candidatesByChild.length < 2 ||
    input.candidatesByChild.some((child) => child.candidates.length === 0)
  ) {
    return [];
  }

  const combinations = cartesian(
    input.candidatesByChild.map((child) =>
      [...child.candidates]
        .sort((left, right) => right.score - left.score || left.groupName.localeCompare(right.groupName))
        .slice(0, 5)
    ),
    625
  );

  return combinations
    .map((children) => scoreFamilyOption(input.guardianId, children))
    .sort((left, right) =>
      left.blockers.length - right.blockers.length ||
      right.total_score - left.total_score ||
      right.confidence - left.confidence ||
      left.family_option_id.localeCompare(right.family_option_id)
    )
    .slice(0, input.limit ?? 6);
}

function scoreFamilyOption(guardianId: string, children: FamilyChildPlacementCandidate[]): FamilyPlacementOption {
  const sameDay = new Set(children.map((child) => child.weekday)).size === 1;
  const locationIds = children.map((child) => child.locationId).filter(Boolean);
  const sameLocation = locationIds.length === children.length && new Set(locationIds).size === 1;
  const waitingMinutes = sameDay ? calculateWaitingMinutes(children) : null;
  const reasons: FamilyPlacementReason[] = [];
  const blockers = dedupeBlockers(children.flatMap((child) => child.blockers));
  let total = children.reduce((sum, child) => sum + child.score, 0) / children.length;

  if (sameDay) {
    total += 24;
    reasons.push({
      label: "Dezelfde dag",
      explanation: "Alle geselecteerde lessen vallen op dezelfde weekdag.",
      evidence: weekdayLabel(children[0]!.weekday),
      weight: 24
    });
  } else {
    reasons.push({
      label: "Meerdere dagen",
      explanation: "Deze combinatie vraagt meerdere reismomenten.",
      evidence: [...new Set(children.map((child) => weekdayLabel(child.weekday)))].join(", "),
      weight: -12
    });
    total -= 12;
  }

  if (sameLocation) {
    total += 22;
    reasons.push({
      label: "Dezelfde locatie",
      explanation: "Alle lessen zijn gekoppeld aan dezelfde locatie-ancestor in de resourceboom.",
      evidence: children[0]!.locationName,
      weight: 22
    });
  } else {
    total -= 10;
    reasons.push({
      label: "Verschillende locaties",
      explanation: "De combinatie bevat meer dan één locatie of een locatie is niet bevestigd.",
      evidence: [...new Set(children.map((child) => child.locationName))].join(", "),
      weight: -10
    });
  }

  if (waitingMinutes !== null) {
    const weight = Math.max(-16, 18 - Math.round(waitingMinutes / 10));
    total += weight;
    reasons.push({
      label: "Tijd tussen lessen",
      explanation: "Korte, niet-overlappende overgangen scoren hoger.",
      evidence: `${waitingMinutes} minuten totale tussenruimte`,
      weight
    });
  }

  const fifoOverrides = children.filter((child) => child.fifoOverrideRequired);
  if (fifoOverrides.length > 0) {
    blockers.push({
      code: "fifo_override_required",
      label: "FIFO-keuze vereist",
      explanation: "Een of meer kinderen staan niet als eerste in de relevante wachtlijstcohort. De planner plaatst nooit automatisch buiten FIFO.",
      evidence: fifoOverrides
        .map((child) => `${child.participantName}: ${child.fifoRank ?? "?"}/${child.fifoCohortSize ?? "?"}`)
        .join(", ")
    });
  }

  total -= blockers.length * 35;
  const confidence = Math.min(...children.map((child) => child.confidence));
  const stableKey = children
    .map((child) => `${child.participantId ?? child.waitlistEntryId ?? child.participantName}:${child.groupId}`)
    .sort()
    .join("|");

  return {
    family_option_id: `family:${guardianId}:${stableHash(stableKey)}`,
    total_score: Math.max(0, Math.min(100, Math.round(total))),
    confidence,
    children_options: children,
    same_day: sameDay,
    same_location: sameLocation,
    waiting_time_between_lessons: waitingMinutes,
    reasons,
    blockers
  };
}

function cartesian<T>(groups: T[][], max: number): T[][] {
  let combinations: T[][] = [[]];

  for (const group of groups) {
    const next: T[][] = [];
    for (const combination of combinations) {
      for (const value of group) {
        next.push([...combination, value]);
        if (next.length >= max) break;
      }
      if (next.length >= max) break;
    }
    combinations = next;
  }

  return combinations;
}

function calculateWaitingMinutes(children: FamilyChildPlacementCandidate[]) {
  const sorted = [...children].sort((left, right) => timeMinutes(left.startsAt) - timeMinutes(right.startsAt));
  let minutes = 0;

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    minutes += Math.max(0, timeMinutes(current.startsAt) - timeMinutes(previous.endsAt));
  }

  return minutes;
}

function timeMinutes(value: string) {
  const [hours = 0, minutes = 0] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function dedupeBlockers(blockers: FamilyPlacementBlocker[]) {
  return [...new Map(blockers.map((blocker) => [`${blocker.code}:${blocker.evidence}`, blocker])).values()];
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function weekdayLabel(weekday: number) {
  return ["", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"][weekday] ?? "onbekende dag";
}
