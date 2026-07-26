export type LeadScoreBand = "high" | "average" | "low" | "waiting_for_information" | "not_placeable";

export type LeadScoreEvidence = {
  label: string;
  explanation: string;
  evidence: string;
  weight: number;
  source: string;
};

export type LeadScoreResult = {
  score_band: LeadScoreBand;
  score: number;
  confidence: number;
  reasons: LeadScoreEvidence[];
  blockers: LeadScoreEvidence[];
  suggested_next_action: string;
  model_version: "lead-score-v1";
};

export type LeadScoreInput = {
  requiredFieldsComplete: boolean;
  requiredAnswersComplete: boolean;
  birthDate: string | null;
  preferredDayCount: number;
  selectedGroupId: string | null;
  placementAvailable: boolean;
  placementConfidence: number | null;
  placementBlockers: Array<{ label: string; evidence: string }>;
  waitBand: string | null;
  offerResponseHours: number | null;
  trialCompleted: boolean;
  paymentPaid: boolean;
  locationMatchInferred: boolean;
  now: string;
};

export function computeLeadScore(input: LeadScoreInput): LeadScoreResult {
  const reasons: LeadScoreEvidence[] = [];
  const blockers: LeadScoreEvidence[] = [];

  if (!input.requiredFieldsComplete || !input.requiredAnswersComplete) {
    blockers.push(evidence(
      "Aanvulling nodig",
      "Een verplicht intakeveld of verplichte tenantvraag ontbreekt.",
      "intakevelden en intake_answers",
      0,
      "intake"
    ));
    return result("waiting_for_information", 20, 0.98, reasons, blockers, "Vraag alleen de ontbrekende intakegegevens op.");
  }

  const age = ageYears(input.birthDate, input.now);
  if (age !== null && age < 4) {
    blockers.push(evidence(
      "Nog niet plaatsbaar",
      "De operationele minimumleeftijd van vier jaar is nog niet bereikt.",
      `${age.toFixed(1)} jaar`,
      0,
      "geboortedatum"
    ));
    return result("not_placeable", 0, 0.99, reasons, blockers, "Bewaar de aanvraag en plan opvolging rond de plaatsbaarheidsdatum.");
  }

  let score = 34;
  reasons.push(evidence(
    "Intake compleet",
    "Alle verplichte velden en tenantvragen zijn ingevuld.",
    "validatie geslaagd",
    20,
    "intake"
  ));
  score += 20;

  if (age !== null) {
    score += 8;
    reasons.push(evidence(
      "Leeftijd operationeel plaatsbaar",
      "Alleen de minimumleeftijd wordt gebruikt; leeftijd bepaalt nooit de commerciële waarde van een gezin.",
      `${age.toFixed(1)} jaar`,
      8,
      "geboortedatum"
    ));
  }

  const preferenceWeight = Math.min(12, input.preferredDayCount * 3);
  score += preferenceWeight;
  reasons.push(evidence(
    "Beschikbaarheid ouder",
    "Meer opgegeven voorkeursdagen vergroten uitsluitend de kans op een passende planning.",
    `${input.preferredDayCount} voorkeursdag(en)`,
    preferenceWeight,
    "voorkeuren"
  ));

  if (input.placementAvailable) {
    score += 18;
    reasons.push(evidence(
      "Plaatsingsoptie beschikbaar",
      "De actuele plaatsingsengine ziet een blocker-vrije optie met capaciteit.",
      `${Math.round((input.placementConfidence ?? 0.5) * 100)}% confidence`,
      18,
      "smart_placement"
    ));
  } else {
    blockers.push(...input.placementBlockers.slice(0, 3).map((blocker) =>
      evidence(blocker.label, "Dit is een operationele capaciteits- of planningsbeperking, geen negatieve kwalificatie van de lead.", blocker.evidence, 0, "smart_placement")
    ));
  }

  if (input.selectedGroupId && input.locationMatchInferred) {
    score += 4;
    reasons.push(evidence(
      "Locatie impliciet bevestigd",
      "De locatie is afgeleid uit de bewust gekozen groep; er is geen los locatievoorkeursveld.",
      input.selectedGroupId,
      4,
      "gekozen_groep"
    ));
  }

  if (input.offerResponseHours !== null && input.offerResponseHours <= 48) {
    score += 8;
    reasons.push(evidence(
      "Snelle reactie op aanbod",
      "Alleen een gemeten reactie op een plaatsingsaanbod telt mee.",
      `${Math.round(input.offerResponseHours)} uur`,
      8,
      "slot_offer"
    ));
  }
  if (input.trialCompleted) {
    score += 8;
    reasons.push(evidence("Proefles bijgewoond", "Een proefles is met attendance-evidence afgerond.", "attendance status trial", 8, "attendance"));
  }
  if (input.paymentPaid) {
    score += 6;
    reasons.push(evidence("Betaling ontvangen", "Er is na plaatsing een relationeel gekoppelde betaalde post.", "manual_payment paid", 6, "billing"));
  }

  if (["long", "very_long"].includes(input.waitBand ?? "")) {
    blockers.push(evidence(
      "Langere wachttijd",
      "De wachttijd beïnvloedt de aanbevolen opvolgactie, niet de kwaliteit van de lead.",
      input.waitBand ?? "onbekend",
      0,
      "wait_time"
    ));
  }

  score = Math.max(0, Math.min(100, score));
  const band: LeadScoreBand = score >= 75 ? "high" : score >= 50 ? "average" : "low";
  const confidence = Math.max(0.45, Math.min(0.98, 0.62 + (input.placementConfidence ?? 0) * 0.25 + (age !== null ? 0.08 : 0)));
  const nextAction = input.placementAvailable
    ? "Open de plaatsingsmogelijkheden en neem persoonlijk contact op."
    : blockers.length
      ? "Bespreek een alternatief moment of bewaak de wachtlijst."
      : "Maak een opvolgtaak voor persoonlijke beoordeling.";
  return result(band, score, confidence, reasons, blockers, nextAction);
}

function result(
  band: LeadScoreBand,
  score: number,
  confidence: number,
  reasons: LeadScoreEvidence[],
  blockers: LeadScoreEvidence[],
  suggestedNextAction: string
): LeadScoreResult {
  return {
    score_band: band,
    score,
    confidence,
    reasons,
    blockers,
    suggested_next_action: suggestedNextAction,
    model_version: "lead-score-v1"
  };
}

function evidence(label: string, explanation: string, proof: string, weight: number, source: string): LeadScoreEvidence {
  return { label, explanation, evidence: proof, weight, source };
}

function ageYears(birthDate: string | null, now: string) {
  if (!birthDate) return null;
  return (new Date(now).getTime() - new Date(`${birthDate}T00:00:00Z`).getTime()) / (365.2425 * 86_400_000);
}
