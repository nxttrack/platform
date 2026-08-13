export const SWIM_FLOW_FORMULA_VERSION = "swim_flow_v3.0.0";

export type FlowMetricKey = "wait_time" | "stage_duration" | "diploma_duration";

export type FlowDurationStatistics = {
  sampleSize: number;
  meanDays: number | null;
  medianDays: number | null;
  p75Days: number | null;
  p90Days: number | null;
  minimumDays: number | null;
  maximumDays: number | null;
};

export type FlowDataQuality = {
  sourceCount: number;
  includedCount: number;
  excludedTest: number;
  excludedImportedWithoutHistory: number;
  invalidOrder: number;
  missingCompletion: number;
  pauseDaysExcluded: number;
  completenessPercentage: number;
  cohortSize: "none" | "small" | "sufficient";
};

export type FlowMetricResult = {
  metricKey: FlowMetricKey;
  label: string;
  definition: string;
  cohortDefinition: string;
  statistics: FlowDurationStatistics;
  quality: FlowDataQuality;
  cohorts: Array<{
    month: string;
    sampleSize: number;
    medianDays: number | null;
    p75Days: number | null;
  }>;
};

export type FlowPausePeriod = {
  startsOn: string;
  returnedOn: string | null;
  expectedReturnOn?: string | null;
  status: "planned" | "active" | "returned" | "cancelled";
};

export type WaitTimeJourney = {
  id: string;
  enteredAt: string;
  eligibleFrom: string | null;
  placedAt: string | null;
  source: "intake" | "manual" | "import" | "journey_simulation_bot";
  importedHistoryVerified?: boolean;
  isTest: boolean;
};

export type StageJourney = {
  id: string;
  stageStartedAt: string;
  transitionExecutedAt: string | null;
  source: "manual" | "intake" | "import" | "journey_simulation_bot";
  importedHistoryVerified?: boolean;
  isTest: boolean;
  pauses: FlowPausePeriod[];
};

export type DiplomaJourney = {
  id: string;
  enrollmentStartedOn: string;
  diplomaIssuedOn: string | null;
  source: "manual" | "intake" | "import" | "journey_simulation_bot";
  importedHistoryVerified?: boolean;
  isTest: boolean;
  pauses: FlowPausePeriod[];
};

export type SwimFlowAnalytics = {
  formulaVersion: typeof SWIM_FLOW_FORMULA_VERSION;
  timeZone: string;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  metrics: Record<FlowMetricKey, FlowMetricResult>;
};

type DurationObservation = {
  completedOn: string;
  durationDays: number;
  pauseDays: number;
};

type MetricSource<Row> = {
  rows: Row[];
  getStart: (row: Row) => string;
  getEnd: (row: Row) => string | null;
  getSource: (row: Row) => string;
  isImportedHistoryVerified: (row: Row) => boolean;
  isTest: (row: Row) => boolean;
  getPausePeriods: (row: Row) => FlowPausePeriod[];
};

export function calculateSwimFlowAnalytics(input: {
  asOfDate: string;
  generatedAt: string;
  timeZone: string;
  waitTimes: WaitTimeJourney[];
  stageJourneys: StageJourney[];
  diplomaJourneys: DiplomaJourney[];
}): SwimFlowAnalytics {
  assertDate(input.asOfDate, "asOfDate");
  assertTimeZone(input.timeZone);
  const windowStart = subtractCalendarMonths(input.asOfDate, 12);
  const windowEnd = addCalendarDays(input.asOfDate, 1);

  const waitRows = input.waitTimes.map((row) => ({
    ...row,
    effectiveStart: maximumDate(
      toTenantDate(row.enteredAt, input.timeZone),
      row.eligibleFrom
    )
  }));

  return {
    formulaVersion: SWIM_FLOW_FORMULA_VERSION,
    timeZone: input.timeZone,
    windowStart,
    windowEnd,
    generatedAt: input.generatedAt,
    metrics: {
      wait_time: calculateMetric({
        metricKey: "wait_time",
        label: "Wachttijd tot plaatsing",
        definition: "Aantal tenant-lokale kalenderdagen vanaf de latere datum van wachtlijststart en eligibility tot bewezen plaatsing.",
        cohortDefinition: "Plaatsingen binnen het rolling twaalfmaandsvenster; open wachtenden blijven zichtbaar als onvoltooid maar vervormen de duurstatistiek niet.",
        source: {
          rows: waitRows,
          getStart: (row) => row.effectiveStart,
          getEnd: (row) => row.placedAt ? toTenantDate(row.placedAt, input.timeZone) : null,
          getSource: (row) => row.source,
          isImportedHistoryVerified: (row) => row.importedHistoryVerified === true,
          isTest: (row) => row.isTest,
          getPausePeriods: () => []
        },
        windowStart,
        windowEnd
      }),
      stage_duration: calculateMetric({
        metricKey: "stage_duration",
        label: "Actieve duur tot goedgekeurde doorstroom",
        definition: "Tenant-lokale kalenderdagen van de actieve badje-/faseplaatsing tot uitgevoerde, vooraf beoordeelde en goedgekeurde doorstroom, minus overlappende pauzedagen.",
        cohortDefinition: "Uitgevoerde doorstromen binnen het rolling twaalfmaandsvenster; groepswissels binnen dezelfde fase resetten de klok niet.",
        source: {
          rows: input.stageJourneys,
          getStart: (row) => toTenantDate(row.stageStartedAt, input.timeZone),
          getEnd: (row) => row.transitionExecutedAt
            ? toTenantDate(row.transitionExecutedAt, input.timeZone)
            : null,
          getSource: (row) => row.source,
          isImportedHistoryVerified: (row) => row.importedHistoryVerified === true,
          isTest: (row) => row.isTest,
          getPausePeriods: (row) => row.pauses
        },
        windowStart,
        windowEnd
      }),
      diploma_duration: calculateMetric({
        metricKey: "diploma_duration",
        label: "Actieve zwemreis tot diploma",
        definition: "Tenant-lokale kalenderdagen van de oorspronkelijke programma-inschrijving tot canonieke diploma-uitgifte, minus overlappende pauzedagen.",
        cohortDefinition: "Canoniek uitgegeven diploma’s binnen het rolling twaalfmaandsvenster; fase- en groepstransfers binnen dezelfde inschrijving resetten de zwemreis niet.",
        source: {
          rows: input.diplomaJourneys,
          getStart: (row) => row.enrollmentStartedOn,
          getEnd: (row) => row.diplomaIssuedOn,
          getSource: (row) => row.source,
          isImportedHistoryVerified: (row) => row.importedHistoryVerified === true,
          isTest: (row) => row.isTest,
          getPausePeriods: (row) => row.pauses
        },
        windowStart,
        windowEnd
      })
    }
  };
}

function calculateMetric<Row>(input: {
  metricKey: FlowMetricKey;
  label: string;
  definition: string;
  cohortDefinition: string;
  source: MetricSource<Row>;
  windowStart: string;
  windowEnd: string;
}): FlowMetricResult {
  const observations: DurationObservation[] = [];
  let excludedTest = 0;
  let excludedImportedWithoutHistory = 0;
  let invalidOrder = 0;
  let missingCompletion = 0;
  let pauseDaysExcluded = 0;

  for (const row of input.source.rows) {
    if (input.source.isTest(row)) {
      excludedTest += 1;
      continue;
    }
    if (
      input.source.getSource(row) === "import" &&
      !input.source.isImportedHistoryVerified(row)
    ) {
      excludedImportedWithoutHistory += 1;
      continue;
    }
    const start = input.source.getStart(row);
    const end = input.source.getEnd(row);
    if (!end) {
      missingCompletion += 1;
      continue;
    }
    if (end < input.windowStart || end >= input.windowEnd) continue;
    if (!isDate(start) || !isDate(end) || start > end) {
      invalidOrder += 1;
      continue;
    }
    const totalDays = calendarDaysBetween(start, end);
    const pauseDays = countOverlappingPauseDays(
      input.source.getPausePeriods(row),
      start,
      end
    );
    const durationDays = Math.max(0, totalDays - pauseDays);
    pauseDaysExcluded += pauseDays;
    observations.push({ completedOn: end, durationDays, pauseDays });
  }

  const includedCount = observations.length;
  const comparableSourceCount = Math.max(
    0,
    input.source.rows.length - excludedTest - excludedImportedWithoutHistory
  );
  return {
    metricKey: input.metricKey,
    label: input.label,
    definition: input.definition,
    cohortDefinition: input.cohortDefinition,
    statistics: statistics(observations.map((row) => row.durationDays)),
    quality: {
      sourceCount: input.source.rows.length,
      includedCount,
      excludedTest,
      excludedImportedWithoutHistory,
      invalidOrder,
      missingCompletion,
      pauseDaysExcluded,
      completenessPercentage: comparableSourceCount
        ? roundOne((includedCount / comparableSourceCount) * 100)
        : 100,
      cohortSize: includedCount === 0 ? "none" : includedCount < 5 ? "small" : "sufficient"
    },
    cohorts: [...groupBy(observations, (row) => row.completedOn.slice(0, 7)).entries()]
      .map(([month, rows]) => ({
        month,
        sampleSize: rows.length,
        medianDays: percentile(rows.map((row) => row.durationDays), 0.5),
        p75Days: percentile(rows.map((row) => row.durationDays), 0.75)
      }))
      .sort((left, right) => left.month.localeCompare(right.month))
  };
}

function statistics(values: number[]): FlowDurationStatistics {
  if (!values.length) {
    return {
      sampleSize: 0,
      meanDays: null,
      medianDays: null,
      p75Days: null,
      p90Days: null,
      minimumDays: null,
      maximumDays: null
    };
  }
  return {
    sampleSize: values.length,
    meanDays: roundOne(values.reduce((total, value) => total + value, 0) / values.length),
    medianDays: percentile(values, 0.5),
    p75Days: percentile(values, 0.75),
    p90Days: percentile(values, 0.9),
    minimumDays: Math.min(...values),
    maximumDays: Math.max(...values)
  };
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = sorted[lower]!;
  const upperValue = sorted[upper]!;
  return roundOne(lowerValue + (upperValue - lowerValue) * (position - lower));
}

function countOverlappingPauseDays(
  pauses: FlowPausePeriod[],
  journeyStart: string,
  journeyEnd: string
) {
  const pausedDates = new Set<string>();
  for (const pause of pauses) {
    if (pause.status === "cancelled" || pause.status === "planned") continue;
    const rawEnd = pause.returnedOn ?? pause.expectedReturnOn ?? journeyEnd;
    const start = maximumDate(pause.startsOn, journeyStart);
    const end = minimumDate(rawEnd, journeyEnd);
    if (!isDate(start) || !isDate(end) || start >= end) continue;
    for (let date = start; date < end; date = addCalendarDays(date, 1)) {
      pausedDates.add(date);
    }
  }
  return pausedDates.size;
}

function toTenantDate(value: string, timeZone: string) {
  if (isDate(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function subtractCalendarMonths(value: string, months: number) {
  const { year, month, day } = dateParts(value);
  const absoluteMonth = year * 12 + month - 1 - months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = ((absoluteMonth % 12) + 12) % 12;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth + 1));
  return formatDate(targetYear, targetMonth + 1, targetDay);
}

function addCalendarDays(value: string, days: number) {
  const { year, month, day } = dateParts(value);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function calendarDaysBetween(start: string, end: string) {
  const left = dateParts(start);
  const right = dateParts(end);
  return Math.round(
    (
      Date.UTC(right.year, right.month - 1, right.day) -
      Date.UTC(left.year, left.month - 1, left.day)
    ) / 86_400_000
  );
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateParts(value: string) {
  assertDate(value, "date");
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

function formatDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function maximumDate(left: string, right: string | null) {
  return right && right > left ? right : left;
}

function minimumDate(left: string, right: string) {
  return left < right ? left : right;
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function assertDate(value: string, label: string) {
  if (!isDate(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new Error(`${label} must be an ISO calendar date`);
  }
}

function assertTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("nl-NL", { timeZone }).format(new Date());
  } catch {
    throw new Error("timeZone must be a valid IANA timezone");
  }
}

function groupBy<Row, Key>(rows: Row[], key: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
  return grouped;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}
