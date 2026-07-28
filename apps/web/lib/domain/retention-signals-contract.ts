export type ParticipantEngagementInput = {
  participantId: string;
  participantName: string;
  enrollmentId: string | null;
  recentAttendance: Array<"present" | "absent" | "late" | "excused" | "trial">;
  previousAttendance: Array<"present" | "absent" | "late" | "excused" | "trial">;
  daysSinceProgress: number | null;
  overdueAmountCents: number;
  openParentQuestions: number;
  pauseExpectedReturnOn: string | null;
  cancellationsLast60Days: number;
  isTest: boolean;
};

export type ParticipantAttentionSignal = {
  type:
    | "repeated_absence"
    | "declining_participation"
    | "progress_stall"
    | "unpaid_balance"
    | "open_parent_question"
    | "pause_ending"
    | "schedule_friction";
  attentionLevel: "observe" | "contact_suggested" | "priority_contact";
  confidence: number;
  title: string;
  summary: string;
  reasons: string[];
  sourceData: Record<string, unknown>;
  recommendedAction: string;
};

export function detectParticipantAttentionSignals(input: ParticipantEngagementInput, now = new Date()): ParticipantAttentionSignal[] {
  if (input.isTest) return [];
  const signals: ParticipantAttentionSignal[] = [];
  const recentAbsences = input.recentAttendance.filter((status) => status === "absent").length;
  const absenceStreak = leadingCount(input.recentAttendance, "absent");
  const recentRate = participationRate(input.recentAttendance);
  const previousRate = participationRate(input.previousAttendance);
  const dataConfidence = Math.min(0.95, 0.45 + Math.min(0.4, (input.recentAttendance.length + input.previousAttendance.length) * 0.035));

  if (recentAbsences >= 3 || absenceStreak >= 2) {
    signals.push({
      type: "repeated_absence",
      attentionLevel: absenceStreak >= 3 ? "priority_contact" : "contact_suggested",
      confidence: dataConfidence,
      title: `Persoonlijke check-in voor ${input.participantName}`,
      summary: "Meerdere recente afwezigheden maken een vriendelijk, persoonlijk contactmoment mogelijk waardevol.",
      reasons: [`${recentAbsences} afwezig in de laatste ${input.recentAttendance.length} registraties`, `${absenceStreak} meest recente lessen achter elkaar afwezig`],
      sourceData: { recent_absences: recentAbsences, recent_count: input.recentAttendance.length, absence_streak: absenceStreak },
      recommendedAction: "Bekijk de context en maak alleen na menselijke beoordeling een persoonlijke contacttaak."
    });
  }
  if (input.recentAttendance.length >= 4 && input.previousAttendance.length >= 4 && previousRate - recentRate >= 0.25) {
    signals.push({
      type: "declining_participation",
      attentionLevel: "contact_suggested",
      confidence: dataConfidence,
      title: `Deelnamepatroon veranderd voor ${input.participantName}`,
      summary: "De recente deelname ligt merkbaar lager dan in de voorgaande periode; de oorzaak is niet bekend.",
      reasons: [`Recente deelname ${Math.round(recentRate * 100)}%`, `Voorgaande deelname ${Math.round(previousRate * 100)}%`],
      sourceData: { recent_rate: recentRate, previous_rate: previousRate },
      recommendedAction: "Controleer rooster, afmeldingen en oudervragen en neem alleen indien passend persoonlijk contact op."
    });
  }
  if (input.daysSinceProgress !== null && input.daysSinceProgress >= 45 && input.recentAttendance.filter((status) => status === "present").length >= 4) {
    signals.push({
      type: "progress_stall",
      attentionLevel: "observe",
      confidence: Math.min(0.9, dataConfidence),
      title: `Voortgangsmoment plannen voor ${input.participantName}`,
      summary: "Er is wel deelname, maar langere tijd geen nieuwe voortgangsregistratie. Dit kan ook een registratieachterstand zijn.",
      reasons: [`${input.daysSinceProgress} dagen sinds laatste voortgang`, `${input.recentAttendance.filter((status) => status === "present").length} recente aanwezigheden`],
      sourceData: { days_since_progress: input.daysSinceProgress },
      recommendedAction: "Bespreek dit eerst met de instructeur en plan zo nodig een persoonlijk voortgangsmoment."
    });
  }
  if (input.overdueAmountCents > 0) {
    signals.push({
      type: "unpaid_balance",
      attentionLevel: "contact_suggested",
      confidence: 0.95,
      title: `Open betaling vraagt zorgvuldige opvolging`,
      summary: "Een openstaand bedrag kan samenhangen met een administratieve fout of tijdelijke situatie.",
      reasons: [`€ ${(input.overdueAmountCents / 100).toFixed(2).replace(".", ",")} achterstallig`, "Financiële status is geen oordeel over het gezin"],
      sourceData: { overdue_amount_cents: input.overdueAmountCents },
      recommendedAction: "Controleer de factuur en kies daarna bewust voor een respectvolle, menselijke opvolging."
    });
  }
  if (input.openParentQuestions > 0) {
    signals.push({
      type: "open_parent_question",
      attentionLevel: input.openParentQuestions > 1 ? "priority_contact" : "contact_suggested",
      confidence: 0.95,
      title: `Oudervraag wacht op antwoord`,
      summary: "Een open oudervraag is een direct, oplosbaar aandachtspunt.",
      reasons: [`${input.openParentQuestions} gesprek${input.openParentQuestions === 1 ? "" : "ken"} wacht${input.openParentQuestions === 1 ? "" : "en"} op de zwemschool`],
      sourceData: { open_parent_questions: input.openParentQuestions },
      recommendedAction: "Open de communicatiehub, lees de volledige context en antwoord handmatig."
    });
  }
  if (input.pauseExpectedReturnOn) {
    const days = Math.ceil((new Date(input.pauseExpectedReturnOn).getTime() - now.getTime()) / 86_400_000);
    if (days >= 0 && days <= 14) {
      signals.push({
        type: "pause_ending",
        attentionLevel: days <= 3 ? "contact_suggested" : "observe",
        confidence: 0.9,
        title: `Pauze van ${input.participantName} loopt af`,
        summary: "De verwachte terugkeerdatum nadert; bevestig samen wat praktisch passend is.",
        reasons: [`Verwachte terugkeer over ${days} dagen`],
        sourceData: { expected_return_on: input.pauseExpectedReturnOn, days_until_return: days },
        recommendedAction: "Controleer planning en neem persoonlijk contact op om de terugkeer af te stemmen."
      });
    }
  }
  if (input.cancellationsLast60Days >= 3) {
    signals.push({
      type: "schedule_friction",
      attentionLevel: "contact_suggested",
      confidence: 0.8,
      title: `Rooster lijkt minder goed aan te sluiten`,
      summary: "Meerdere afmeldingen kunnen wijzen op roosterwrijving, maar de oorzaak is niet automatisch bekend.",
      reasons: [`${input.cancellationsLast60Days} afmeldingen in 60 dagen`],
      sourceData: { cancellations_last_60_days: input.cancellationsLast60Days },
      recommendedAction: "Bekijk voorkeuren en gezinsplanning en bespreek vrijwillig een passend alternatief."
    });
  }
  return signals;
}

function participationRate(statuses: ParticipantEngagementInput["recentAttendance"]) {
  if (!statuses.length) return 0;
  return statuses.filter((status) => ["present", "late", "trial"].includes(status)).length / statuses.length;
}

function leadingCount(statuses: ParticipantEngagementInput["recentAttendance"], target: ParticipantEngagementInput["recentAttendance"][number]) {
  let count = 0;
  for (const status of statuses) {
    if (status !== target) break;
    count += 1;
  }
  return count;
}
