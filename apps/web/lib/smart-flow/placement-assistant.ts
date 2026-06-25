import { capacitySnapshotToRecord, type CapacitySnapshot } from "@/lib/capacity/capacity-engine";
import { smartBlocker, smartReason, type SmartDecisionBlocker, type SmartDecisionReason } from "@/lib/smart-flow/decision";
import { scoreWaitlistEntry, type WaitlistRankingEntryInput } from "@/lib/smart-flow/waitlist-ranking";

export const placementAssistantRuleVersion = "placement-v2";

export type PlacementAssistantMode = "candidate_to_groups" | "group_to_candidates" | "manual";
export type PlacementSuggestedAction = "offer_slot" | "request_more_info" | "keep_waiting" | "manual_review";

export type PlacementAssistantWaitlistEntry = WaitlistRankingEntryInput & {
  intake_submission_id: string | null;
  status: string;
  waitlist_score: number | null;
  score_reasons?: unknown[];
};

export type PlacementAssistantGroup = {
  id: string;
  program_id: string;
  stage_id: string;
  resource_id: string | null;
  instructor_id: string | null;
  weekday: number;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: string;
};

export type PlacementAssistantResource = {
  id: string;
  name?: string;
  capacity: number;
  status: string;
} | null;

export type PlacementAssistantInstructor = {
  id: string;
  display_name?: string;
  status: string;
} | null;

export type PlacementMatchInput = {
  mode: PlacementAssistantMode;
  entry: PlacementAssistantWaitlistEntry;
  group: PlacementAssistantGroup;
  capacity: CapacitySnapshot;
  resource: PlacementAssistantResource;
  instructor: PlacementAssistantInstructor;
  startDate?: string | null;
};

export type PlacementMatchResult = {
  waitlistEntryId: string;
  groupId: string;
  score: number;
  suggestedAction: PlacementSuggestedAction;
  reasons: SmartDecisionReason[];
  blockers: SmartDecisionBlocker[];
  snapshot: Record<string, unknown>;
  rationale: string;
};

export function scorePlacementMatch(input: PlacementMatchInput): PlacementMatchResult {
  const programMatch = input.entry.program_id === input.group.program_id;
  const stageKnown = Boolean(input.entry.recommended_stage_id);
  const stageMatch = stageKnown && input.entry.recommended_stage_id === input.group.stage_id;
  const preferredWeekday = weekdayToPreference(input.group.weekday);
  const targetTimeBucket = timeBucketForGroup(input.group);
  const dayMatch = input.entry.preferred_days.includes(preferredWeekday);
  const timeMatch = input.entry.preferred_time_windows.includes(targetTimeBucket) || (input.group.weekday >= 6 && input.entry.preferred_time_windows.includes("weekend"));
  const waitlistRanking = scoreWaitlistEntry({
    entry: input.entry,
    targetGroup: {
      id: input.group.id,
      stage_id: input.group.stage_id,
      weekday: input.group.weekday,
      starts_at: input.group.starts_at,
      ends_at: input.group.ends_at
    }
  });
  const startDate = input.startDate ?? todayInput();
  const startDateFit = startDate >= todayInput();
  const resourceAvailable = !input.resource || input.resource.status === "active";
  const instructorAvailable = !input.instructor || input.instructor.status === "active";
  const capacityAvailable = input.capacity.isAvailable;
  const reasons = [
    smartReason({
      code: programMatch ? "program_match" : "program_mismatch",
      label: programMatch ? "Programma matcht" : "Programma wijkt af",
      detail: programMatch ? "Kandidaat en groep horen bij hetzelfde programma." : "Deze groep hoort niet bij het programma van de kandidaat.",
      weight: programMatch ? 20 : 0,
      evidence: { entry_program_id: input.entry.program_id, group_program_id: input.group.program_id }
    }),
    smartReason({
      code: stageMatch ? "stage_match" : stageKnown ? "stage_mismatch" : "stage_missing",
      label: stageMatch ? "Niveau matcht" : stageKnown ? "Niveau wijkt af" : "Niveau onbekend",
      detail: stageMatch ? "Aanbevolen niveau past bij de groep." : stageKnown ? "Aanbevolen niveau verschilt van de groep." : "Er is nog geen aanbevolen niveau, dus handmatige review blijft nodig.",
      weight: stageMatch ? 20 : stageKnown ? 5 : 0,
      evidence: { recommended_stage_id: input.entry.recommended_stage_id, group_stage_id: input.group.stage_id }
    }),
    smartReason({
      code: dayMatch ? "preferred_day_match" : "preferred_day_missing",
      label: dayMatch ? "Voorkeursdag matcht" : "Geen voorkeursdag-match",
      detail: dayMatch ? "De groep valt op een voorkeursdag." : "De groep valt buiten de opgegeven voorkeursdagen.",
      weight: dayMatch ? 12 : 0,
      evidence: { preferred_days: input.entry.preferred_days, group_weekday: preferredWeekday }
    }),
    smartReason({
      code: timeMatch ? "preferred_time_match" : "preferred_time_missing",
      label: timeMatch ? "Voorkeurstijd matcht" : "Geen tijdmatch",
      detail: timeMatch ? "Het tijdvak past bij de voorkeur." : "Het tijdvak valt buiten de opgegeven voorkeur.",
      weight: timeMatch ? 10 : 0,
      evidence: { preferred_time_windows: input.entry.preferred_time_windows, target_time_bucket: targetTimeBucket }
    }),
    smartReason({
      code: capacityAvailable ? "capacity_available" : "capacity_blocked",
      label: capacityAvailable ? "Capaciteit beschikbaar" : "Capaciteit blokkeert",
      detail: `${input.capacity.openSpots}/${input.capacity.capacityLimit} plekken vrij; ${input.capacity.heldSpots} hold; ${input.capacity.reservedSpots + input.capacity.trialSpots + input.capacity.makeupSpots} gereserveerd.`,
      weight: capacityAvailable ? Math.min(18, 8 + input.capacity.openSpots * 2) : 0,
      evidence: capacitySnapshotToRecord(input.capacity)
    }),
    smartReason({
      code: resourceAvailable ? "resource_available" : "resource_unavailable",
      label: resourceAvailable ? "Resource beschikbaar" : "Resource niet beschikbaar",
      detail: input.resource ? `Resource status: ${input.resource.status}.` : "Geen aparte resource gekoppeld.",
      weight: resourceAvailable ? 6 : 0,
      evidence: { resource_id: input.group.resource_id, resource_status: input.resource?.status ?? null }
    }),
    smartReason({
      code: instructorAvailable ? "instructor_available" : "instructor_unavailable",
      label: instructorAvailable ? "Instructeur beschikbaar" : "Instructeur niet beschikbaar",
      detail: input.instructor ? `Instructeur status: ${input.instructor.status}.` : "Geen vaste instructeur gekoppeld; planning vraagt review.",
      weight: instructorAvailable ? 6 : 0,
      evidence: { instructor_id: input.group.instructor_id, instructor_status: input.instructor?.status ?? null }
    }),
    smartReason({
      code: "waitlist_priority",
      label: "Wachtlijstprioriteit",
      detail: typeof input.entry.waitlist_score === "number" ? `Wachtlijstscore ${input.entry.waitlist_score}/100 wordt meegewogen.` : "Geen opgeslagen wachtlijstscore, neutrale weging.",
      weight: waitlistPriorityWeight(input.entry.waitlist_score),
      evidence: { waitlist_score: input.entry.waitlist_score, live_waitlist_score: waitlistRanking.score, waitlist_reasons: input.entry.score_reasons ?? [] }
    }),
    smartReason({
      code: startDateFit ? "start_date_fit" : "start_date_review",
      label: startDateFit ? "Startdatum past" : "Startdatum vraagt review",
      detail: startDateFit ? "De startdatum ligt vandaag of in de toekomst." : "De startdatum ligt in het verleden.",
      weight: startDateFit ? 5 : 0,
      evidence: { start_date: startDate }
    })
  ];
  const blockers = [
    ...(programMatch ? [] : [smartBlocker({ code: "program_mismatch", label: "Programma mismatch", detail: "Plaats niet in een groep van een ander programma.", severity: "blocking" })]),
    ...capacityBlockers(input.capacity),
    ...(resourceAvailable ? [] : [smartBlocker({ code: "resource_unavailable", label: "Resource niet beschikbaar", detail: "De gekoppelde locatie/baan is niet actief.", severity: "blocking" })]),
    ...(instructorAvailable ? [] : [smartBlocker({ code: "instructor_unavailable", label: "Instructeur niet beschikbaar", detail: "Controleer de instructeur voordat je een aanbod verstuurt.", severity: "warning" })]),
    ...(stageKnown && !stageMatch ? [smartBlocker({ code: "stage_mismatch", label: "Niveau wijkt af", detail: "Handmatige review nodig voordat je deze plaatsing aanbiedt.", severity: "warning" })] : []),
    ...(input.entry.duplicate_risk === "blocking" ? [smartBlocker({ code: "duplicate_blocking", label: "Duplicaatrisico", detail: "Controleer bestaand dossier voordat je een aanbod verstuurt.", severity: "blocking" })] : []),
    ...(input.entry.duplicate_risk === "warning" ? [smartBlocker({ code: "duplicate_warning", label: "Duplicaatwaarschuwing", detail: "Controleer mogelijke dubbeling.", severity: "warning" })] : [])
  ];
  const score = clampScore(
    (programMatch ? 20 : 0) +
      (stageMatch ? 20 : stageKnown ? 5 : 0) +
      (dayMatch ? 12 : 0) +
      (timeMatch ? 10 : 0) +
      (capacityAvailable ? Math.min(18, 8 + input.capacity.openSpots * 2) : 0) +
      (resourceAvailable ? 6 : 0) +
      (instructorAvailable ? 6 : 0) +
      waitlistPriorityWeight(input.entry.waitlist_score) +
      (startDateFit ? 5 : 0) -
      blockers.filter((blocker) => blocker.severity === "blocking").length * 20 -
      blockers.filter((blocker) => blocker.severity === "warning").length * 5
  );
  const suggestedAction = suggestedActionFor(score, blockers, stageKnown);
  const snapshot = {
    rule_version: placementAssistantRuleVersion,
    mode: input.mode,
    waitlist_entry_id: input.entry.id,
    group_id: input.group.id,
    program_match: programMatch,
    stage_match: stageMatch,
    preferred_weekday: preferredWeekday,
    target_time_bucket: targetTimeBucket,
    day_match: dayMatch,
    time_match: timeMatch,
    capacity: capacitySnapshotToRecord(input.capacity),
    resource_status: input.resource?.status ?? null,
    instructor_status: input.instructor?.status ?? null,
    waitlist_score: input.entry.waitlist_score,
    live_waitlist_score: waitlistRanking.score,
    start_date: startDate
  };

  return {
    waitlistEntryId: input.entry.id,
    groupId: input.group.id,
    score,
    suggestedAction,
    reasons,
    blockers,
    snapshot,
    rationale: buildDutchRationale({ score, suggestedAction, blockers, stageMatch, dayMatch, timeMatch, capacity: input.capacity })
  };
}

function capacityBlockers(capacity: CapacitySnapshot) {
  return capacity.blockers.map((blocker) =>
    smartBlocker({
      code: blocker.code,
      label: blocker.label,
      detail: blocker.detail,
      severity: blocker.severity === "blocking" ? "blocking" : "warning"
    })
  );
}

function suggestedActionFor(score: number, blockers: SmartDecisionBlocker[], stageKnown: boolean): PlacementSuggestedAction {
  if (blockers.some((blocker) => blocker.severity === "blocking")) {
    return blockers.some((blocker) => blocker.code === "duplicate_blocking") ? "request_more_info" : "keep_waiting";
  }

  if (!stageKnown) {
    return "request_more_info";
  }

  if (score >= 75) {
    return "offer_slot";
  }

  if (score >= 50 || blockers.length > 0) {
    return "manual_review";
  }

  return "keep_waiting";
}

function buildDutchRationale(input: { score: number; suggestedAction: PlacementSuggestedAction; blockers: SmartDecisionBlocker[]; stageMatch: boolean; dayMatch: boolean; timeMatch: boolean; capacity: CapacitySnapshot }) {
  const parts = [`Score ${input.score}/100.`];

  parts.push(input.capacity.isAvailable ? `${input.capacity.openSpots} vrije plek${input.capacity.openSpots === 1 ? "" : "ken"} beschikbaar.` : "Capaciteit blokkeert deze plaatsing.");

  if (input.stageMatch) {
    parts.push("Niveau matcht.");
  }

  if (input.dayMatch) {
    parts.push("Voorkeursdag matcht.");
  }

  if (input.timeMatch) {
    parts.push("Tijdvoorkeur matcht.");
  }

  if (input.blockers.length > 0) {
    parts.push(`${input.blockers.length} aandachtspunt${input.blockers.length === 1 ? "" : "en"} voor adminreview.`);
  }

  parts.push(`Advies: ${suggestedActionLabel(input.suggestedAction)}.`);

  return parts.join(" ");
}

function waitlistPriorityWeight(score: number | null | undefined) {
  if (typeof score !== "number") {
    return 7;
  }

  return Math.round(Math.max(0, Math.min(100, score)) * 0.15);
}

function suggestedActionLabel(action: PlacementSuggestedAction) {
  const labels: Record<PlacementSuggestedAction, string> = {
    offer_slot: "lesplek aanbieden",
    request_more_info: "meer informatie vragen",
    keep_waiting: "laten wachten",
    manual_review: "handmatig beoordelen"
  };

  return labels[action];
}

function weekdayToPreference(weekday: number) {
  const values = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  return values[weekday - 1] ?? "monday";
}

function timeBucketForGroup(group: { weekday: number; starts_at: string }) {
  if (group.weekday >= 6) {
    return "weekend";
  }

  const hour = Number(group.starts_at.slice(0, 2));

  if (Number.isNaN(hour)) {
    return "afternoon";
  }

  if (hour < 12) {
    return "morning";
  }

  if (hour < 18) {
    return "afternoon";
  }

  return "evening";
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
