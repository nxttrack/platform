import type { AdminOperationsData } from "./admin-operations";

export type CapacityChartDatum = { name: string; bezet: number; vrij: number };
export type StatusChartDatum = { key: string; name: string; value: number; fill: string };

export type AdminChartData = {
  capacity: CapacityChartDatum[];
  intake: StatusChartDatum[];
  payments: StatusChartDatum[];
};

const chartColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function buildAdminChartData(data: AdminOperationsData): AdminChartData {
  const groupNames = new Map(data.groups.map((group) => [group.id, group.name]));
  const capacity = data.groupCapacity.slice(0, 8).map((group) => ({
    name: shorten(groupNames.get(group.groupId) ?? "Lesgroep"),
    bezet: group.used,
    vrij: group.available
  }));

  const intakeCounts = countBy(data.intakeSubmissions, (item) => item.status);
  const paymentTotals = sumBy(data.manualPayments, (item) => item.status, (item) => item.amount_cents / 100);

  return {
    capacity,
    intake: toStatusData(intakeCounts, intakeLabel),
    payments: toStatusData(paymentTotals, paymentLabel)
  };
}

function countBy<T>(items: T[], keyFor: (item: T) => string) {
  const totals = new Map<string, number>();

  for (const item of items) {
    const key = keyFor(item) || "onbekend";
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }

  return totals;
}

function sumBy<T>(items: T[], keyFor: (item: T) => string, valueFor: (item: T) => number) {
  const totals = new Map<string, number>();

  for (const item of items) {
    const key = keyFor(item) || "onbekend";
    totals.set(key, (totals.get(key) ?? 0) + valueFor(item));
  }

  return totals;
}

function toStatusData(totals: Map<string, number>, labelFor: (key: string) => string): StatusChartDatum[] {
  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, chartColors.length)
    .map(([key, value], index) => ({ key, name: labelFor(key), value: round(value), fill: chartColors[index] }));
}

function intakeLabel(status: string) {
  return ({ received: "Ontvangen", reviewing: "In beoordeling", waitlisted: "Wachtlijst", placed: "Geplaatst", closed: "Afgerond" } as Record<string, string>)[status] ?? humanize(status);
}

function paymentLabel(status: string) {
  return ({ pending: "Open", paid: "Betaald", overdue: "Achterstallig", cancelled: "Geannuleerd", refunded: "Terugbetaald" } as Record<string, string>)[status] ?? humanize(status);
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function shorten(value: string) {
  return value.length > 18 ? `${value.slice(0, 17)}…` : value;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
