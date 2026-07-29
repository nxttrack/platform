import type { LeadScoreBand } from "./lead-scoring-contract";

export type CrmFollowUpSignalType =
  | "intake_unfollowed"
  | "offer_unanswered"
  | "trial_unfollowed"
  | "placeable_uncontacted"
  | "payment_missing"
  | "parent_waiting";

export type CrmFollowUpCandidate = {
  fingerprint: string;
  intakeId: string | null;
  guardianUserId: string | null;
  participantId: string | null;
  participantName: string;
  parentName: string;
  signalType: CrmFollowUpSignalType;
  reason: string;
  evidence: string[];
  suggestedAction: string;
  draftSubject: string;
  draftBody: string;
  priority: "high" | "normal";
  isTest: boolean;
  journeyRunId: string | null;
};

export type CrmLeadSignalInput = {
  intakeId: string;
  participantId: string | null;
  guardianUserId: string | null;
  participantName: string;
  parentName: string;
  status: string;
  selectedOption: string;
  receivedAt: string;
  leadScoreBand: LeadScoreBand;
  placementAvailable: boolean;
  latestContactAt: string | null;
  openOffer: { id: string; offeredAt: string; expiresAt: string } | null;
  trialCompletedAt: string | null;
  hasFollowUpAfterTrial: boolean;
  missingPayment: boolean;
  isTest: boolean;
  journeyRunId: string | null;
};

export function detectCrmFollowUpCandidates(input: {
  leads: CrmLeadSignalInput[];
  now: string;
}): CrmFollowUpCandidate[] {
  const now = new Date(input.now);
  const candidates: CrmFollowUpCandidate[] = [];

  for (const lead of input.leads) {
    const ageHours = hoursBetween(lead.receivedAt, input.now);
    const contactAfterIntake = !!lead.latestContactAt && lead.latestContactAt >= lead.receivedAt;

    if (["received", "reviewing"].includes(lead.status) && ageHours >= 24 && !contactAfterIntake) {
      candidates.push(candidate(lead, {
        signalType: "intake_unfollowed",
        suffix: "intake",
        reason: "Complete intake heeft na 24 uur nog geen vastgelegd persoonlijk contactmoment.",
        evidence: [`ontvangen ${Math.floor(ageHours)} uur geleden`, `leadscore ${lead.leadScoreBand}`],
        action: "Bel de ouder of maak een gecontroleerd conceptbericht.",
        draft: `Bedankt voor de aanmelding van ${lead.participantName}. We nemen graag persoonlijk de mogelijkheden en voorkeuren met je door.`,
        priority: lead.leadScoreBand === "high" || ageHours >= 48 ? "high" : "normal"
      }));
    }

    if (lead.openOffer && new Date(lead.openOffer.expiresAt) > now && hoursBetween(lead.openOffer.offeredAt, input.now) >= 24) {
      candidates.push(candidate(lead, {
        signalType: "offer_unanswered",
        suffix: lead.openOffer.id,
        reason: "Een geldig plaatsingsaanbod heeft nog geen gemeten reactie.",
        evidence: [`verstuurd ${Math.floor(hoursBetween(lead.openOffer.offeredAt, input.now))} uur geleden`, `verloopt ${lead.openOffer.expiresAt}`],
        action: "Controleer of de ouder hulp nodig heeft bij het aanbod.",
        draft: `Er staat nog een plaatsingsaanbod voor ${lead.participantName} klaar. Laat gerust weten als je vragen hebt over het lesmoment.`,
        priority: hoursBetween(input.now, lead.openOffer.expiresAt) <= 24 ? "high" : "normal"
      }));
    }

    if (lead.trialCompletedAt && !lead.hasFollowUpAfterTrial && hoursBetween(lead.trialCompletedAt, input.now) >= 12) {
      candidates.push(candidate(lead, {
        signalType: "trial_unfollowed",
        suffix: lead.trialCompletedAt,
        reason: "De proefles is met attendance-evidence afgerond, maar er is daarna geen opvolging vastgelegd.",
        evidence: [`proefles ${lead.trialCompletedAt}`],
        action: "Vraag hoe de proefles is ervaren en bespreek een passend vervolg.",
        draft: `Hoe heeft ${lead.participantName} de proefles ervaren? We denken graag mee over een passend vervolg.`,
        priority: "normal"
      }));
    }

    if (lead.placementAvailable && !contactAfterIntake && ["received", "reviewing"].includes(lead.status)) {
      candidates.push(candidate(lead, {
        signalType: "placeable_uncontacted",
        suffix: "placeable",
        reason: "Smart Placement ziet een actuele optie, terwijl nog geen contactactiviteit is vastgelegd.",
        evidence: ["blocker-vrije plaatsingsoptie", `leadscore ${lead.leadScoreBand}`],
        action: "Open de plaatsingscockpit en neem persoonlijk contact op.",
        draft: `We zien een mogelijk passend lesmoment voor ${lead.participantName}. We nemen de details graag persoonlijk met je door.`,
        priority: "high"
      }));
    }

    if (lead.missingPayment) {
      candidates.push(candidate(lead, {
        signalType: "payment_missing",
        suffix: "payment",
        reason: "Een relationeel gekoppelde betaalpost staat open of achterstallig.",
        evidence: ["billingstatus due/overdue"],
        action: "Controleer de betaalpost en kies daarna bewust een passende opvolging.",
        draft: `Er staat nog een betaalpost open voor ${lead.participantName}. Laat weten als je vragen hebt of als gegevens niet kloppen.`,
        priority: "normal"
      }));
    }

    if (lead.selectedOption === "information_request" && ageHours >= 24 && !contactAfterIntake) {
      candidates.push(candidate(lead, {
        signalType: "parent_waiting",
        suffix: "question",
        reason: "Een informatieaanvraag wacht langer dan 24 uur zonder vastgelegd antwoord.",
        evidence: [`ontvangen ${Math.floor(ageHours)} uur geleden`],
        action: "Beantwoord de vraag persoonlijk of wijs een taak toe.",
        draft: `Bedankt voor je vraag over de zwemlessen voor ${lead.participantName}. We helpen je graag verder.`,
        priority: ageHours >= 48 ? "high" : "normal"
      }));
    }
  }

  return [...new Map(candidates.map((item) => [item.fingerprint, item])).values()]
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.participantName.localeCompare(right.participantName));
}

function candidate(
  lead: CrmLeadSignalInput,
  signal: {
    signalType: CrmFollowUpSignalType;
    suffix: string;
    reason: string;
    evidence: string[];
    action: string;
    draft: string;
    priority: "high" | "normal";
  }
): CrmFollowUpCandidate {
  return {
    fingerprint: `crm:${signal.signalType}:${lead.intakeId}:${signal.suffix}`,
    intakeId: lead.intakeId,
    guardianUserId: lead.guardianUserId,
    participantId: lead.participantId,
    participantName: lead.participantName,
    parentName: lead.parentName,
    signalType: signal.signalType,
    reason: signal.reason,
    evidence: signal.evidence,
    suggestedAction: signal.action,
    draftSubject: `Persoonlijke opvolging voor ${lead.participantName}`,
    draftBody: `Beste ${lead.parentName},\n\n${signal.draft}\n\nMet vriendelijke groet,\nhet team`,
    priority: signal.priority,
    isTest: lead.isTest,
    journeyRunId: lead.journeyRunId
  };
}

function hoursBetween(left: string, right: string) {
  return Math.max(0, (new Date(right).getTime() - new Date(left).getTime()) / 3_600_000);
}

function priorityRank(priority: "high" | "normal") {
  return priority === "high" ? 0 : 1;
}
