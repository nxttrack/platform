export type MakeupMarketplaceReason = {
  label: string;
  explanation: string;
  evidence: string;
  weight: number;
};

export type MakeupMarketplaceCandidate = {
  participantId: string;
  participantName: string;
  guardianUserId: string | null;
  creditId: string;
  programId: string;
  stageId: string | null;
  expiresOn: string | null;
  preferredWeekdays: number[];
  preferredStartsAfter: string | null;
  preferredEndsBefore: string | null;
  alreadyBooked: boolean;
  notificationAllowed: boolean;
  isTest: boolean;
  journeyRunId: string | null;
};

export type MakeupMarketplaceMatch = {
  participant_id: string;
  participant_name: string;
  guardian_user_id: string | null;
  credit_id: string;
  score: number;
  confidence: number;
  reasons: MakeupMarketplaceReason[];
  expires_soon: boolean;
  suggested_action: "invite_parent" | "book_after_confirmation" | "internal_test_only";
  notification_allowed: boolean;
  is_test: boolean;
  journey_run_id: string | null;
};

export function computeMakeupMarketplaceMatches(input: {
  session: {
    id: string;
    startsAt: string;
    programId: string;
    stageId: string | null;
    capacity: number;
    regularParticipants: number;
    cancelledParticipants: number;
    activeHolds: number;
  };
  candidates: MakeupMarketplaceCandidate[];
  now: string;
}) {
  const effectiveUsed = Math.max(0, input.session.regularParticipants - input.session.cancelledParticipants) + input.session.activeHolds;
  const available = Math.max(0, input.session.capacity - effectiveUsed);
  if (available === 0) return { available, effectiveUsed, matches: [] as MakeupMarketplaceMatch[] };

  const sessionDate = input.session.startsAt.slice(0, 10);
  const sessionWeekday = isoWeekday(input.session.startsAt);
  const sessionTime = input.session.startsAt.slice(11, 16);
  const nowDate = input.now.slice(0, 10);
  const matches = input.candidates.flatMap((candidate): MakeupMarketplaceMatch[] => {
    if (
      candidate.programId !== input.session.programId ||
      candidate.stageId !== input.session.stageId ||
      candidate.alreadyBooked ||
      (candidate.expiresOn !== null && candidate.expiresOn < sessionDate)
    ) {
      return [];
    }

    let score = 55;
    const reasons: MakeupMarketplaceReason[] = [
      {
        label: "Programma en niveau passen",
        explanation: "De actieve inschrijving heeft exact hetzelfde programma en niveau als de doelsessie.",
        evidence: `${candidate.programId} · ${candidate.stageId ?? "geen niveau"}`,
        weight: 55
      }
    ];
    const preferredDay = candidate.preferredWeekdays.includes(sessionWeekday);
    if (preferredDay) {
      score += 18;
      reasons.push({
        label: "Voorkeursdag",
        explanation: "De sessie valt op een vastgelegde voorkeursdag.",
        evidence: `weekdag ${sessionWeekday}`,
        weight: 18
      });
    }

    const timeMatch =
      (!candidate.preferredStartsAfter || sessionTime >= candidate.preferredStartsAfter.slice(0, 5)) &&
      (!candidate.preferredEndsBefore || sessionTime <= candidate.preferredEndsBefore.slice(0, 5));
    if (timeMatch && (candidate.preferredStartsAfter || candidate.preferredEndsBefore)) {
      score += 12;
      reasons.push({
        label: "Voorkeurstijd",
        explanation: "De starttijd ligt binnen het vastgelegde tijdvenster.",
        evidence: `${candidate.preferredStartsAfter?.slice(0, 5) ?? "start"}–${candidate.preferredEndsBefore?.slice(0, 5) ?? "einde"}`,
        weight: 12
      });
    }

    const daysUntilExpiry = candidate.expiresOn ? daysBetween(nowDate, candidate.expiresOn) : null;
    const expiresSoon = daysUntilExpiry !== null && daysUntilExpiry <= 14;
    if (expiresSoon) {
      score += 15;
      reasons.push({
        label: "Credit verloopt binnenkort",
        explanation: "Een geldige credit met korte resterende looptijd krijgt operationele prioriteit.",
        evidence: `${Math.max(0, daysUntilExpiry!)} dagen resterend`,
        weight: 15
      });
    }

    if (!candidate.notificationAllowed) {
      reasons.push({
        label: "Geen externe uitnodiging",
        explanation: "De communicatievoorkeur staat geen marketplace-uitnodiging toe. De match blijft intern zichtbaar.",
        evidence: "communicatievoorkeur",
        weight: 0
      });
    }

    return [{
      participant_id: candidate.participantId,
      participant_name: candidate.participantName,
      guardian_user_id: candidate.guardianUserId,
      credit_id: candidate.creditId,
      score: Math.min(100, score),
      confidence: candidate.preferredWeekdays.length || candidate.preferredStartsAfter || candidate.preferredEndsBefore ? 0.9 : 0.72,
      reasons,
      expires_soon: expiresSoon,
      suggested_action: candidate.isTest ? "internal_test_only" : candidate.notificationAllowed ? "invite_parent" : "book_after_confirmation",
      notification_allowed: candidate.notificationAllowed,
      is_test: candidate.isTest,
      journey_run_id: candidate.journeyRunId
    }];
  }).sort((left, right) => right.score - left.score || left.participant_name.localeCompare(right.participant_name));

  return { available, effectiveUsed, matches };
}

function isoWeekday(value: string) {
  const day = new Date(value).getUTCDay();
  return day === 0 ? 7 : day;
}

function daysBetween(left: string, right: string) {
  return Math.floor((new Date(`${right}T00:00:00Z`).getTime() - new Date(`${left}T00:00:00Z`).getTime()) / 86_400_000);
}
