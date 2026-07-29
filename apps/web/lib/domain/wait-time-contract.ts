import type { IntakeDaypart, WaitTimeBand } from "./intake-recommendation-contract";

export type WaitTimeQuery = {
  programId: string;
  stageId?: string | null;
  preferredDay?: number | null;
  preferredTimeBlock?: IntakeDaypart | null;
  locationId?: string | null;
};

export type HistoricalPlacement = {
  programId: string;
  stageId: string | null;
  weekday: number | null;
  timeBlock: IntakeDaypart | null;
  locationId: string | null;
  waitDays: number;
  placedAt: string;
};

export type CurrentWaitlistDemand = {
  programId: string;
  stageId: string | null;
  preferredDays: number[];
  preferredTimeBlocks: IntakeDaypart[];
  priorityDate: string;
};

export type CurrentCapacity = {
  programId: string;
  stageId: string | null;
  weekday: number | null;
  timeBlock: IntakeDaypart | null;
  locationId: string | null;
  capacity: number;
  available: number;
};

export type WaitTimeBasis =
  | "last_100_exact"
  | "last_180_days_program_stage"
  | "program_stage_general"
  | "program_general"
  | "tenant_general"
  | "current_pressure"
  | "insufficient_data";

export type WaitTimeAlternative = {
  preferredDay: number | null;
  preferredTimeBlock: IntakeDaypart | null;
  locationId: string | null;
  band: WaitTimeBand;
  reason: string;
};

export type WaitTimePrediction = {
  band: WaitTimeBand;
  confidence: number;
  sample_size: number;
  basis: WaitTimeBasis;
  reasons: string[];
  admin_explanation: string;
  parent_explanation: string;
  suggested_alternatives: WaitTimeAlternative[];
  statistics: {
    medianWeeks: number | null;
    p75Weeks: number | null;
    p90Weeks: number | null;
    inflowPerWeek: number;
    outflowPerWeek: number;
    currentWaitlist: number;
    availableCapacity: number;
  };
};

export function calculateWaitTimePrediction(input: {
  query: WaitTimeQuery;
  history: HistoricalPlacement[];
  demand: CurrentWaitlistDemand[];
  capacity: CurrentCapacity[];
  now: string;
}): WaitTimePrediction {
  const now = new Date(input.now);
  const exact = newest(
    input.history.filter((placement) => matchesQuery(placement, input.query, true)),
    100
  );
  const recentBoundary = new Date(now.getTime() - 180 * dayMs);
  const recentProgramStage = newest(
    input.history.filter((placement) =>
      placement.programId === input.query.programId &&
      (!input.query.stageId || placement.stageId === input.query.stageId) &&
      new Date(placement.placedAt) >= recentBoundary
    ),
    100
  );
  const programStage = newest(
    input.history.filter((placement) =>
      placement.programId === input.query.programId &&
      (!input.query.stageId || placement.stageId === input.query.stageId)
    ),
    100
  );
  const program = newest(
    input.history.filter((placement) => placement.programId === input.query.programId),
    100
  );
  const tenant = newest(input.history, 100);
  const selected =
    selectCohort(exact, "last_100_exact", 8) ??
    selectCohort(recentProgramStage, "last_180_days_program_stage", 8) ??
    selectCohort(programStage, "program_stage_general", 8) ??
    selectCohort(program, "program_general", 10) ??
    selectCohort(tenant, "tenant_general", 15);

  const relevantDemand = input.demand.filter((entry) => matchesDemand(entry, input.query));
  const relevantCapacity = input.capacity.filter((group) => matchesQuery(group, input.query, false));
  const currentWaitlist = relevantDemand.length;
  const availableCapacity = round2(relevantCapacity.reduce((sum, group) => sum + Math.max(0, group.available), 0));
  const inflowPerWeek = weeklyRate(
    input.demand.filter((entry) =>
      entry.programId === input.query.programId &&
      new Date(`${entry.priorityDate}T00:00:00.000Z`) >= new Date(now.getTime() - 84 * dayMs)
    ).length,
    12
  );
  const outflowPerWeek = weeklyRate(
    input.history.filter((placement) =>
      placement.programId === input.query.programId &&
      new Date(placement.placedAt) >= new Date(now.getTime() - 84 * dayMs)
    ).length,
    12
  );

  if (!selected) {
    return pressureFallback({
      availableCapacity,
      currentWaitlist,
      inflowPerWeek,
      outflowPerWeek
    });
  }

  const waits = selected.rows.map((placement) => placement.waitDays / 7).sort((left, right) => left - right);
  const medianWeeks = round1(percentile(waits, 0.5));
  const p75Weeks = round1(percentile(waits, 0.75));
  const p90Weeks = round1(percentile(waits, 0.9));
  const band = bandFromWeeks(p75Weeks);
  const confidence = confidenceFor(selected.basis, selected.rows.length);
  const reasons = [
    `${selected.rows.length} afgeronde, vergelijkbare plaatsingen gebruikt`,
    basisReason(selected.basis),
    availableCapacity > 0
      ? `${formatNumber(availableCapacity)} plekcapaciteit is nu beschikbaar`
      : "de passende groepen hebben nu geen vrije vaste capaciteit",
    outflowPerWeek < Math.max(0.5, inflowPerWeek * 0.75)
      ? "de recente uitstroom is lager dan de instroom"
      : "recente instroom en uitstroom zijn redelijk in balans"
  ];

  if (input.query.preferredDay) {
    const comparable = programStage.length >= 8 ? programStage : program;
    const comparableP75 = comparable.length ? percentile(comparable.map((row) => row.waitDays / 7).sort((a, b) => a - b), 0.75) : null;
    if (comparableP75 !== null && p75Weeks > comparableP75 * 1.2) {
      reasons.push(`${weekdayLabel(input.query.preferredDay)} is historisch drukker dan vergelijkbare momenten`);
    }
  }

  return {
    band,
    confidence,
    sample_size: selected.rows.length,
    basis: selected.basis,
    reasons,
    admin_explanation: [
      `Wachttijd: ${waitBandLabel(band).toLowerCase()}.`,
      `Gebaseerd op ${selected.rows.length} relevante plaatsingen.`,
      `Mediaan ${medianWeeks} weken; P75 ${p75Weeks} weken; P90 ${p90Weeks} weken.`,
      `Instroom ${inflowPerWeek} en uitstroom ${outflowPerWeek} per week.`,
      reasons.at(-1)
    ].join(" "),
    parent_explanation: parentExplanation(band),
    suggested_alternatives: [],
    statistics: {
      medianWeeks,
      p75Weeks,
      p90Weeks,
      inflowPerWeek,
      outflowPerWeek,
      currentWaitlist,
      availableCapacity
    }
  };
}

export function withWaitTimeAlternatives(
  prediction: WaitTimePrediction,
  query: WaitTimeQuery,
  candidates: Array<{ query: WaitTimeQuery; prediction: WaitTimePrediction }>
): WaitTimePrediction {
  const currentRank = bandRank(prediction.band);
  const seen = new Set<string>();
  const alternatives = candidates
    .filter((candidate) =>
      candidate.query.programId === query.programId &&
      (!query.stageId || candidate.query.stageId === query.stageId) &&
      bandRank(candidate.prediction.band) < currentRank
    )
    .sort((left, right) =>
      bandRank(left.prediction.band) - bandRank(right.prediction.band) ||
      right.prediction.confidence - left.prediction.confidence
    )
    .flatMap((candidate): WaitTimeAlternative[] => {
      const key = `${candidate.query.preferredDay ?? ""}:${candidate.query.preferredTimeBlock ?? ""}:${candidate.query.locationId ?? ""}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        preferredDay: candidate.query.preferredDay ?? null,
        preferredTimeBlock: candidate.query.preferredTimeBlock ?? null,
        locationId: candidate.query.locationId ?? null,
        band: candidate.prediction.band,
        reason: `${formatMoment(candidate.query)} heeft naar verwachting een ${waitBandLabel(candidate.prediction.band).toLowerCase()}`
      }];
    })
    .slice(0, 3);

  if (alternatives.length === 0) return prediction;
  return {
    ...prediction,
    parent_explanation: `${prediction.parent_explanation} ${formatMoment(alternatives[0])} geeft mogelijk sneller plek.`,
    suggested_alternatives: alternatives
  };
}

export function waitBandLabel(band: WaitTimeBand) {
  return ({
    short: "Korte wachttijd",
    medium: "Gemiddelde wachttijd",
    long: "Lange wachttijd",
    very_long: "Zeer lange wachttijd",
    insufficient_data: "Onvoldoende data"
  } as const)[band];
}

function pressureFallback(input: {
  currentWaitlist: number;
  availableCapacity: number;
  inflowPerWeek: number;
  outflowPerWeek: number;
}): WaitTimePrediction {
  let band: WaitTimeBand = "insufficient_data";
  if (input.availableCapacity > 0) band = "short";
  else if (input.currentWaitlist >= 15 && input.outflowPerWeek < 1) band = "very_long";
  else if (input.currentWaitlist >= 8) band = "long";
  else if (input.currentWaitlist >= 3) band = "medium";

  const hasOperationalSignal = input.currentWaitlist > 0 || input.availableCapacity > 0;
  return {
    band,
    confidence: hasOperationalSignal ? 0.32 : 0.12,
    sample_size: 0,
    basis: hasOperationalSignal ? "current_pressure" : "insufficient_data",
    reasons: hasOperationalSignal
      ? [
          `${input.currentWaitlist} passende wachtlijstkandidaten`,
          `${formatNumber(input.availableCapacity)} actuele plekcapaciteit`,
          "te weinig afgeronde vergelijkbare plaatsingen voor een historische band"
        ]
      : ["te weinig historische plaatsingen en actuele druk om betrouwbaar te classificeren"],
    admin_explanation: hasOperationalSignal
      ? `Historie is beperkt. De band gebruikt actuele druk: ${input.currentWaitlist} wachtenden, ${formatNumber(input.availableCapacity)} capaciteit en ${input.outflowPerWeek} uitstroom per week.`
      : "Onvoldoende historische en actuele gegevens voor een betrouwbare wachttijdband.",
    parent_explanation: band === "insufficient_data"
      ? "Er is nog onvoldoende informatie voor een betrouwbare wachttijdindicatie. De zwemschool kan de mogelijkheden persoonlijk toelichten."
      : parentExplanation(band),
    suggested_alternatives: [],
    statistics: {
      medianWeeks: null,
      p75Weeks: null,
      p90Weeks: null,
      inflowPerWeek: input.inflowPerWeek,
      outflowPerWeek: input.outflowPerWeek,
      currentWaitlist: input.currentWaitlist,
      availableCapacity: input.availableCapacity
    }
  };
}

function selectCohort(rows: HistoricalPlacement[], basis: WaitTimeBasis, minimum: number) {
  return rows.length >= minimum ? { rows, basis } : null;
}

function matchesQuery(
  record: Pick<HistoricalPlacement, "programId" | "stageId" | "weekday" | "timeBlock" | "locationId">,
  query: WaitTimeQuery,
  requirePreferences: boolean
) {
  if (record.programId !== query.programId) return false;
  if (query.stageId && record.stageId !== query.stageId) return false;
  if (query.locationId && record.locationId !== query.locationId) return false;
  if (requirePreferences && query.preferredDay && record.weekday !== query.preferredDay) return false;
  if (requirePreferences && query.preferredTimeBlock && record.timeBlock !== query.preferredTimeBlock) return false;
  return true;
}

function matchesDemand(entry: CurrentWaitlistDemand, query: WaitTimeQuery) {
  if (entry.programId !== query.programId) return false;
  if (query.stageId && entry.stageId !== query.stageId) return false;
  if (query.preferredDay && entry.preferredDays.length > 0 && !entry.preferredDays.includes(query.preferredDay)) return false;
  if (query.preferredTimeBlock && entry.preferredTimeBlocks.length > 0 && !entry.preferredTimeBlocks.includes(query.preferredTimeBlock)) return false;
  return true;
}

function newest(rows: HistoricalPlacement[], limit: number) {
  return [...rows]
    .sort((left, right) => new Date(right.placedAt).getTime() - new Date(left.placedAt).getTime())
    .slice(0, limit);
}

function percentile(sorted: number[], ratio: number) {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? sorted[lower] ?? 0) * weight;
}

function confidenceFor(basis: WaitTimeBasis, sampleSize: number) {
  const basisFactor: Record<WaitTimeBasis, number> = {
    last_100_exact: 1,
    last_180_days_program_stage: 0.88,
    program_stage_general: 0.78,
    program_general: 0.64,
    tenant_general: 0.5,
    current_pressure: 0.35,
    insufficient_data: 0.12
  };
  return round2(Math.min(0.96, basisFactor[basis] * (0.55 + Math.min(1, sampleSize / 60) * 0.45)));
}

function basisReason(basis: WaitTimeBasis) {
  return ({
    last_100_exact: "dag, dagdeel, niveau en locatie sluiten aan op de vraag",
    last_180_days_program_stage: "recente plaatsingen binnen hetzelfde programma en niveau gebruikt",
    program_stage_general: "algemene historie van hetzelfde programma en niveau gebruikt",
    program_general: "bredere programmahistorie gebruikt wegens beperkte niveaudata",
    tenant_general: "tenantbrede historie gebruikt wegens beperkte vergelijkbare data",
    current_pressure: "actuele vraag en capaciteit gebruikt",
    insufficient_data: "onvoldoende data"
  } as const)[basis];
}

function bandFromWeeks(p75Weeks: number): WaitTimeBand {
  if (p75Weeks <= 4) return "short";
  if (p75Weeks <= 8) return "medium";
  if (p75Weeks <= 16) return "long";
  return "very_long";
}

function parentExplanation(band: WaitTimeBand) {
  return ({
    short: "De wachttijd lijkt kort. Dit is een indicatie en geen vaste plaatsingsbelofte.",
    medium: "De wachttijd lijkt gemiddeld. Dit is een indicatie; beschikbaarheid kan per lesmoment verschillen.",
    long: "De wachttijd lijkt lang. Dit is een indicatie; een ander lesmoment kan mogelijk sneller plek geven.",
    very_long: "De wachttijd lijkt zeer lang. Dit is een indicatie; vraag de zwemschool gerust naar passende alternatieven.",
    insufficient_data: "Er is nog onvoldoende informatie voor een betrouwbare wachttijdindicatie."
  } as const)[band];
}

function bandRank(band: WaitTimeBand) {
  return ({ short: 0, medium: 1, long: 2, very_long: 3, insufficient_data: 4 } as const)[band];
}

function formatMoment(input: Pick<WaitTimeQuery, "preferredDay" | "preferredTimeBlock">) {
  const day = input.preferredDay ? weekdayLabel(input.preferredDay) : "Een ander moment";
  const part = input.preferredTimeBlock
    ? ({ morning: "ochtend", afternoon: "middag", evening: "avond" } as const)[input.preferredTimeBlock]
    : "";
  return `${day}${part ? ` ${part}` : ""}`;
}

function weekdayLabel(day: number) {
  return ["", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"][day] ?? "Een andere dag";
}

function weeklyRate(count: number, weeks: number) {
  return round2(count / weeks);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(value);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

const dayMs = 24 * 60 * 60 * 1000;
