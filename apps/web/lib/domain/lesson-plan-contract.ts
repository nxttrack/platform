export type LessonPlanFocusCard = {
  participantId: string;
  participantName: string;
  points: Array<{
    label: string;
    explanation: string;
    sourceType: string;
  }>;
};

export type LessonPlanProposal = {
  groupGoals: Array<{ label: string; reason: string; evidenceCount: number }>;
  personalAttention: Array<{ participantId: string; participantName: string; label: string; reason: string }>;
  exercises: Array<{
    id: string;
    title: string;
    durationMinutes: number;
    instruction: string;
    differentiation: string;
    linkedGoal: string;
  }>;
  equipment: string[];
  evaluationPrompts: string[];
  confidence: "laag" | "gemiddeld" | "hoog";
  reasons: string[];
  sourceData: {
    focusCardCount: number;
    focusPointCount: number;
    groupName: string;
    sessionId: string;
    stageName: string | null;
    generatedAt: string;
    engineVersion: "lesson-plan-rules-v1";
  };
  humanApprovalRequired: true;
};

export function buildLessonPlanProposal(input: {
  sessionId: string;
  groupName: string;
  stageName: string | null;
  durationMinutes: number;
  focusCards: LessonPlanFocusCard[];
  now?: Date;
}): LessonPlanProposal {
  const allPoints = input.focusCards.flatMap((card) =>
    card.points.map((point) => ({ ...point, participantId: card.participantId, participantName: card.participantName }))
  );
  const frequencies = new Map<string, { label: string; count: number; explanations: string[] }>();
  for (const point of allPoints) {
    const key = normalize(point.label);
    const current = frequencies.get(key) ?? { label: point.label, count: 0, explanations: [] };
    current.count += 1;
    if (!current.explanations.includes(point.explanation)) current.explanations.push(point.explanation);
    frequencies.set(key, current);
  }
  const ranked = [...frequencies.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "nl"));
  const fallbackGoal = input.stageName ? `Vertrouwen en herhaling binnen ${input.stageName}` : "Veilig oefenen met plezier en herhaling";
  const groupGoals = (ranked.length ? ranked : [{ label: fallbackGoal, count: 0, explanations: ["Basisvoorstel omdat nog weinig recente observaties beschikbaar zijn."] }])
    .slice(0, 3)
    .map((point) => ({
      label: point.label,
      reason: point.explanations[0],
      evidenceCount: point.count
    }));
  const personalAttention = input.focusCards
    .flatMap((card) => card.points.slice(0, 1).map((point) => ({
      participantId: card.participantId,
      participantName: card.participantName,
      label: point.label,
      reason: point.explanation
    })))
    .slice(0, 3);
  const available = Math.max(20, Math.min(120, input.durationMinutes));
  const warmup = Math.max(5, Math.round(available * 0.15));
  const closing = Math.max(4, Math.round(available * 0.1));
  const goalMinutes = Math.max(6, Math.floor((available - warmup - closing) / groupGoals.length));
  const exercises = [
    {
      id: "warm-up",
      title: "Veilige waterstart",
      durationMinutes: warmup,
      instruction: "Start met een herkenbare routine, korte succesmomenten en één duidelijke veiligheidsafspraak.",
      differentiation: "Laat leerlingen kiezen tussen een basis- en plusvariant.",
      linkedGoal: "Veiligheid, vertrouwen en activatie"
    },
    ...groupGoals.map((goal, index) => exerciseFor(goal.label, goalMinutes, index)),
    {
      id: "evaluation",
      title: "Succesronde en terugblik",
      durationMinutes: closing,
      instruction: "Herhaal één kernbeweging en laat de groep benoemen wat vandaag beter lukte.",
      differentiation: "Gebruik voordoen, aanwijzen of één korte verbale reflectie.",
      linkedGoal: "Positieve evaluatie"
    }
  ];
  const equipment = unique(exercises.flatMap((exercise) => equipmentFor(exercise.linkedGoal))).slice(0, 12);
  const confidence = input.focusCards.length >= 4 && allPoints.length >= 6
    ? "hoog"
    : input.focusCards.length >= 2 || allPoints.length >= 3
      ? "gemiddeld"
      : "laag";
  const reasons = [
    `${input.focusCards.length} leerlinggebonden focuskaart${input.focusCards.length === 1 ? "" : "en"} gebruikt.`,
    `${allPoints.length} recente, niet-gevoelige aandachtspunt${allPoints.length === 1 ? "" : "en"} samengevat.`,
    input.stageName ? `Lescontext gekoppeld aan niveau ${input.stageName}.` : "Geen niveaucontext beschikbaar; veilig basisvoorstel gebruikt.",
    "Het voorstel wijzigt geen voortgang en vereist menselijke goedkeuring."
  ];

  return {
    groupGoals,
    personalAttention,
    exercises,
    equipment,
    evaluationPrompts: [
      "Welke groepsdoelen zijn aantoonbaar geoefend?",
      "Welke oefening werkte goed en welke aanpassing is volgende les nodig?",
      "Zijn er nieuwe positieve observaties die afzonderlijk moeten worden vastgelegd?"
    ],
    confidence,
    reasons,
    sourceData: {
      focusCardCount: input.focusCards.length,
      focusPointCount: allPoints.length,
      groupName: input.groupName,
      sessionId: input.sessionId,
      stageName: input.stageName,
      generatedAt: (input.now ?? new Date()).toISOString(),
      engineVersion: "lesson-plan-rules-v1"
    },
    humanApprovalRequired: true
  };
}

function exerciseFor(goal: string, durationMinutes: number, index: number) {
  const normalized = normalize(goal);
  if (/adem|bel|onderwater|duik/.test(normalized)) {
    return exercise(index, "Bellenpad met rustige uitademing", durationMinutes, "Werk in korte banen: inademen boven water, lang uitblazen in het water.", "Pas afstand, steun en aantal herhalingen aan.", goal);
  }
  if (/drijf|rug|buik|balans/.test(normalized)) {
    return exercise(index, "Drijfstation met balanskeuzes", durationMinutes, "Oefen gestroomlijnd drijven via rug, buik en zelfstandig loslaten.", "Gebruik een noodle of handsteun als basisvariant.", goal);
  }
  if (/been|slag|crawl|schoolslag|arm/.test(normalized)) {
    return exercise(index, "Techniekbaan in drie niveaus", durationMinutes, "Oefen de kernbeweging eerst geïsoleerd en daarna in een korte combinatie.", "Werk met basis, ritme en plusafstand.", goal);
  }
  if (/spring|start|kant/.test(normalized)) {
    return exercise(index, "Start–land–zwem circuit", durationMinutes, "Combineer een veilige start met stabiele landing en een korte zwemactie.", "Laat hoogte, diepte en afstand aansluiten op vertrouwen.", goal);
  }
  return exercise(index, "Doelgericht vaardighedencircuit", durationMinutes, `Oefen “${goal}” in drie korte stations met voordoen, doen en herhalen.`, "Bied per station een steun-, basis- en plusvariant.", goal);
}

function exercise(index: number, title: string, durationMinutes: number, instruction: string, differentiation: string, linkedGoal: string) {
  return { id: `goal-${index + 1}`, title, durationMinutes, instruction, differentiation, linkedGoal };
}

function equipmentFor(value: string) {
  const normalized = normalize(value);
  const common = ["pionnen", "drijflijn"];
  if (/adem|onderwater|duik/.test(normalized)) return [...common, "duikringen"];
  if (/drijf|balans|rug|buik/.test(normalized)) return [...common, "noodles", "plankjes"];
  if (/been|slag|crawl|schoolslag|arm/.test(normalized)) return [...common, "plankjes"];
  if (/spring|start|kant/.test(normalized)) return [...common, "antislipmarkering"];
  return [...common, "plankjes", "speelvoorwerp"];
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function normalize(value: string) {
  return value.toLocaleLowerCase("nl").normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
