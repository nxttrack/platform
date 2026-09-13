import { toAmsterdamDate } from "../date/business-date";
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type FunnelDimension = { key: string; label: string; intakes: number; placements: number; conversion: number };
export type GrowthAnalyticsReport = {
  generatedAt: string;
  metrics: { intakes: number; placements: number; placementConversion: number; medianDaysToPlace: number | null; diplomas: number; medianDaysToDiploma: number | null; cancelledEnrollments: number };
  cohorts: Array<{ month: string; intakes: number; placements: number; conversion: number; medianDaysToPlace: number | null; diplomas: number; cancelled: number }>;
  byProgram: FunnelDimension[];
  byLocation: FunnelDimension[];
  byCampaign: FunnelDimension[];
  evidence: string[];
};

export async function buildTenantGrowthReport(tenantId: string, from = oneYearAgo(), to = toAmsterdamDate()): Promise<GrowthAnalyticsReport> {
  const admin = createAdminClient();
  const [intakes, sources, lineage, enrollments, programs, memberships, groups, resources, certificates] = await Promise.all([
    admin.from("intake_submissions").select("id, received_at, is_test").eq("tenant_id", tenantId).eq("is_test", false).gte("received_at", `${from}T00:00:00.000Z`).lte("received_at", `${to}T23:59:59.999Z`).order("received_at"),
    admin.from("lead_sources").select("intake_submission_id, attribution_campaign, attribution_source, is_test").eq("tenant_id", tenantId).eq("is_test", false),
    admin.from("intake_conversion_lineage").select("intake_submission_id, participant_id, enrollment_id, placed_at").eq("tenant_id", tenantId),
    admin.from("enrollments").select("id, participant_id, program_id, status, starts_on, created_at, is_test").eq("tenant_id", tenantId).eq("is_test", false),
    admin.from("programs").select("id, name").eq("tenant_id", tenantId),
    admin.from("group_memberships").select("enrollment_id, group_id, status, is_test").eq("tenant_id", tenantId).eq("is_test", false),
    admin.from("groups").select("id, default_resource_id").eq("tenant_id", tenantId),
    admin.from("resources").select("id, name").eq("tenant_id", tenantId),
    admin.from("certificate_records").select("participant_id, issued_on, status").eq("tenant_id", tenantId).eq("status", "issued")
  ]);
  for (const result of [intakes, sources, lineage, enrollments, programs, memberships, groups, resources, certificates]) if (result.error) throw new Error(`Could not load growth analytics: ${result.error.message}`);
  const sourceByIntake = new Map((sources.data ?? []).map((row) => [row.intake_submission_id, row]));
  const lineageByIntake = new Map((lineage.data ?? []).map((row) => [row.intake_submission_id, row]));
  const enrollmentById = new Map((enrollments.data ?? []).map((row) => [row.id, row]));
  const programNames = new Map((programs.data ?? []).map((row) => [row.id, row.name]));
  const groupById = new Map((groups.data ?? []).map((row) => [row.id, row]));
  const resourceNames = new Map((resources.data ?? []).map((row) => [row.id, row.name]));
  const membershipByEnrollment = new Map<string, { group_id: string }>();
  for (const row of memberships.data ?? []) if (!membershipByEnrollment.has(row.enrollment_id) && ["active", "trial", "completed"].includes(row.status)) membershipByEnrollment.set(row.enrollment_id, row);
  const certificatesByParticipant = new Map<string, string[]>();
  for (const row of certificates.data ?? []) certificatesByParticipant.set(row.participant_id, [...(certificatesByParticipant.get(row.participant_id) ?? []), row.issued_on]);
  const rows = (intakes.data ?? []).map((intake) => {
    const conversion = lineageByIntake.get(intake.id);
    const enrollment = conversion ? enrollmentById.get(conversion.enrollment_id) : null;
    const membership = enrollment ? membershipByEnrollment.get(enrollment.id) : null;
    const resourceId = membership ? groupById.get(membership.group_id)?.default_resource_id : null;
    const source = sourceByIntake.get(intake.id);
    const firstCertificate = conversion ? (certificatesByParticipant.get(conversion.participant_id) ?? []).sort()[0] ?? null : null;
    return {
      intakeAt: intake.received_at,
      placedAt: conversion?.placed_at ?? null,
      enrollmentStatus: enrollment?.status ?? null,
      program: enrollment ? programNames.get(enrollment.program_id) ?? "Onbekend programma" : "Nog niet geplaatst",
      location: resourceId ? resourceNames.get(resourceId) ?? "Onbekende locatie" : "Nog geen locatie",
      campaign: source?.attribution_campaign || source?.attribution_source || "Direct / onbekend",
      diplomaAt: firstCertificate
    };
  });
  const placed = rows.filter((row) => row.placedAt);
  const diplomaDurations = rows.flatMap((row) => row.diplomaAt ? [daysBetween(row.intakeAt, row.diplomaAt)] : []);
  const cohorts = [...groupBy(rows, (row) => row.intakeAt.slice(0, 7)).entries()].map(([month, values]) => {
    const placements = values.filter((row) => row.placedAt);
    return { month, intakes: values.length, placements: placements.length, conversion: percentage(placements.length, values.length), medianDaysToPlace: median(placements.map((row) => daysBetween(row.intakeAt, row.placedAt!))), diplomas: values.filter((row) => row.diplomaAt).length, cancelled: values.filter((row) => row.enrollmentStatus === "cancelled").length };
  }).sort((left, right) => left.month.localeCompare(right.month));
  return {
    generatedAt: new Date().toISOString(),
    metrics: { intakes: rows.length, placements: placed.length, placementConversion: percentage(placed.length, rows.length), medianDaysToPlace: median(placed.map((row) => daysBetween(row.intakeAt, row.placedAt!))), diplomas: rows.filter((row) => row.diplomaAt).length, medianDaysToDiploma: median(diplomaDurations), cancelledEnrollments: rows.filter((row) => row.enrollmentStatus === "cancelled").length },
    cohorts,
    byProgram: summarizeDimension(rows, (row) => row.program),
    byLocation: summarizeDimension(rows, (row) => row.location),
    byCampaign: summarizeDimension(rows, (row) => row.campaign),
    evidence: ["Intakecohort op server-ontvangstdatum.", "Plaatsing uitsluitend via relationele intake_conversion_lineage.", "Diploma uitsluitend via uitgegeven certificate_records.", "Journey Bot- en overige testdata uitgesloten.", "Omzet en bezoekersprofielen worden in dit rapport bewust niet afgeleid."]
  };
}

function summarizeDimension<Row extends { placedAt: string | null }>(rows: Row[], key: (row: Row) => string): FunnelDimension[] {
  return [...groupBy(rows, key).entries()].map(([label, values]) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label, intakes: values.length, placements: values.filter((row) => row.placedAt).length, conversion: percentage(values.filter((row) => row.placedAt).length, values.length) })).sort((left, right) => right.intakes - left.intakes || right.conversion - left.conversion);
}
function groupBy<Row, Key>(rows: Row[], key: (row: Row) => Key) { const result = new Map<Key, Row[]>(); for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row]); return result; }
function daysBetween(left: string, right: string) { return Math.max(0, Math.round((new Date(right).getTime() - new Date(left).getTime()) / 86_400_000)); }
function median(values: number[]) { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2); }
function percentage(value: number, total: number) { return total ? Math.round((value / total) * 100) : 0; }
function oneYearAgo() { const date = new Date(); date.setUTCFullYear(date.getUTCFullYear() - 1); return toAmsterdamDate(date); }
