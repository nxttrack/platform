export const planningOfferingTypes = [
  "regular",
  "vacation_course",
  "turbo_course",
  "temporary_series"
] as const;
export const capacityBorrowingPolicies = [
  "none",
  "flex_from_regular",
  "bidirectional"
] as const;

export type PlanningOfferingType = (typeof planningOfferingTypes)[number];
export type CapacityBorrowingPolicy = (typeof capacityBorrowingPolicies)[number];

export type GroupScheduleDraft = {
  capacityBorrowing: CapacityBorrowingPolicy;
  code: string;
  endTime: string;
  endsOn: string;
  flexCapacity: number;
  hardCapacity: number;
  instructorUserIds: string[];
  lessonTimeTemplateId: string;
  name: string;
  offeringType: PlanningOfferingType;
  programId: string;
  reason: string;
  recurrenceIntervalWeeks: number;
  regularCapacity: number;
  resourceId: string;
  stageId: string;
  startTime: string;
  startsOn: string;
  trialCapacity: number;
  weekday: number;
};

export type PlanningConflict = {
  blocking: boolean;
  code: string;
  detail: string;
  occurrenceDate?: string;
  relatedSessionId?: string;
  severity: "hard" | "warning";
  title: string;
};

export type PlanningConflictResult = {
  canPublish: boolean;
  conflictContractVersion: "planning_conflicts_v3";
  conflicts: PlanningConflict[];
  hardConflictCount: number;
  occurrenceCount: number;
  timezone: string;
  truncated: boolean;
  warningCount: number;
};

export function parseGroupScheduleDraft(value: unknown): GroupScheduleDraft {
  if (!isRecord(value)) throw new Error("Planning payload ontbreekt.");
  const draft: GroupScheduleDraft = {
    capacityBorrowing: readEnum(value.capacityBorrowing, capacityBorrowingPolicies, "Capaciteitsleenbeleid"),
    code: readOptionalText(value.code, "Code", 80),
    endTime: readTime(value.endTime, "Eindtijd"),
    endsOn: readDate(value.endsOn, "Einddatum"),
    flexCapacity: readInteger(value.flexCapacity, "Flexcapaciteit", 0, 500),
    hardCapacity: readInteger(value.hardCapacity, "Fysieke limiet", 1, 500),
    instructorUserIds: readUuidArray(value.instructorUserIds, "Instructeurs", 1, 8),
    lessonTimeTemplateId: readOptionalUuid(value.lessonTimeTemplateId, "Lestijdtemplate"),
    name: readText(value.name, "Naam", 2, 160),
    offeringType: readEnum(value.offeringType, planningOfferingTypes, "Aanbodtype"),
    programId: readUuid(value.programId, "Programma"),
    reason: readText(value.reason, "Reden", 3, 500),
    recurrenceIntervalWeeks: readInteger(value.recurrenceIntervalWeeks, "Herhaalinterval", 1, 8),
    regularCapacity: readInteger(value.regularCapacity, "Reguliere capaciteit", 0, 500),
    resourceId: readUuid(value.resourceId, "Resource"),
    stageId: readOptionalUuid(value.stageId, "Badje"),
    startTime: readTime(value.startTime, "Starttijd"),
    startsOn: readDate(value.startsOn, "Startdatum"),
    trialCapacity: readInteger(value.trialCapacity, "Proefcapaciteit", 0, 500),
    weekday: readInteger(value.weekday, "Weekdag", 1, 7)
  };
  if (draft.startTime >= draft.endTime) throw new Error("De eindtijd moet na de starttijd liggen.");
  if (draft.startsOn > draft.endsOn) throw new Error("De einddatum moet op of na de startdatum liggen.");
  if (draft.regularCapacity + draft.flexCapacity + draft.trialCapacity > draft.hardCapacity) {
    throw new Error("De capaciteitsbuckets passen niet binnen de fysieke limiet.");
  }
  if (draft.code && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.code)) {
    throw new Error("De groepscode gebruikt alleen kleine letters, cijfers en koppeltekens.");
  }
  return draft;
}

export function normalizePlanningConflictResult(value: unknown): PlanningConflictResult {
  if (!isRecord(value)) throw new Error("Conflictresultaat ontbreekt.");
  const conflicts = Array.isArray(value.conflicts)
    ? value.conflicts.filter(isRecord).map((conflict): PlanningConflict => ({
        blocking: conflict.blocking === true,
        code: typeof conflict.code === "string" ? conflict.code : "unknown",
        detail: typeof conflict.detail === "string" ? conflict.detail : "Geen detail beschikbaar.",
        occurrenceDate: typeof conflict.occurrenceDate === "string" ? conflict.occurrenceDate : undefined,
        relatedSessionId: typeof conflict.relatedSessionId === "string" ? conflict.relatedSessionId : undefined,
        severity: conflict.severity === "hard" ? "hard" : "warning",
        title: typeof conflict.title === "string" ? conflict.title : "Planningssignaal"
      }))
    : [];
  return {
    canPublish: value.canPublish === true,
    conflictContractVersion: "planning_conflicts_v3",
    conflicts,
    hardConflictCount: safeCount(value.hardConflictCount),
    occurrenceCount: safeCount(value.occurrenceCount),
    timezone: typeof value.timezone === "string" ? value.timezone : "Europe/Amsterdam",
    truncated: value.truncated === true,
    warningCount: safeCount(value.warningCount)
  };
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${label} is ongeldig.`);
  return value as T;
}
function readText(value: unknown, label: string, min: number, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max) throw new Error(`${label} moet ${min}–${max} tekens bevatten.`);
  return text;
}
function readOptionalText(value: unknown, label: string, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max) throw new Error(`${label} is te lang.`);
  return text;
}
function readInteger(value: unknown, label: string, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label} is ongeldig.`);
  return parsed;
}
function readDate(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} is ongeldig.`);
  return value;
}
function readTime(value: unknown, label: string) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${label} is ongeldig.`);
  return value;
}
function readUuid(value: unknown, label: string) {
  if (typeof value !== "string" || !isUuid(value)) throw new Error(`${label} is ongeldig.`);
  return value;
}
function readOptionalUuid(value: unknown, label: string) {
  return value === "" || value === null || value === undefined ? "" : readUuid(value, label);
}
function readUuidArray(value: unknown, label: string, min: number, max: number) {
  if (!Array.isArray(value)) throw new Error(`${label} ontbreken.`);
  const unique = [...new Set(value.map((item) => readUuid(item, label)))];
  if (unique.length < min || unique.length > max) throw new Error(`Kies ${min}–${max} ${label.toLowerCase()}.`);
  return unique;
}
function safeCount(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
