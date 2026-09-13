import { toAmsterdamDate } from "../date/business-date";
import "server-only";

import {
  calculateSwimFlowAnalytics,
  type DiplomaJourney,
  type FlowPausePeriod,
  type StageJourney,
  type SwimFlowAnalytics,
  type WaitTimeJourney
} from "./swim-flow-analytics-contract";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getSwimFlowAnalytics(
  tenantId: string,
  now = new Date()
): Promise<SwimFlowAnalytics> {
  const admin = createAdminClient();
  const [
    settingsResult,
    waitlistResult,
    intakeResult,
    lineageResult,
    enrollmentResult,
    assignmentResult,
    transitionResult,
    pauseResult,
    certificateResult
  ] = await Promise.all([
    admin.from("tenant_settings").select("timezone").eq("tenant_id", tenantId).maybeSingle(),
    admin
      .from("waitlist_entries")
      .select("id, intake_submission_id, source, status, eligible_from, created_at, updated_at, is_test, test_metadata_json")
      .eq("tenant_id", tenantId),
    admin
      .from("intake_submissions")
      .select("id, received_at, is_test")
      .eq("tenant_id", tenantId),
    admin
      .from("intake_conversion_lineage")
      .select("intake_submission_id, enrollment_id, placed_at, is_test")
      .eq("tenant_id", tenantId),
    admin
      .from("enrollments")
      .select("id, starts_on, source, is_test, test_metadata_json")
      .eq("tenant_id", tenantId),
    admin
      .from("enrollment_stage_assignments")
      .select("id, enrollment_id, curriculum_stage_id, transition_case_id, starts_at, status")
      .eq("tenant_id", tenantId),
    admin
      .from("swim_transition_cases")
      .select("id, enrollment_id, from_stage_id, execution_status, executed_at")
      .eq("tenant_id", tenantId)
      .eq("execution_status", "executed"),
    admin
      .from("enrollment_pause_periods")
      .select("enrollment_id, starts_on, expected_return_on, returned_on, status")
      .eq("tenant_id", tenantId),
    admin
      .from("certificate_records")
      .select("id, enrollment_id, issued_on, status")
      .eq("tenant_id", tenantId)
      .eq("status", "issued")
      .order("issued_on")
  ]);

  for (const [label, result] of [
    ["tenant timezone", settingsResult],
    ["waitlist", waitlistResult],
    ["intakes", intakeResult],
    ["placement lineage", lineageResult],
    ["enrollments", enrollmentResult],
    ["stage assignments", assignmentResult],
    ["transitions", transitionResult],
    ["pause periods", pauseResult],
    ["diplomas", certificateResult]
  ] as const) {
    if (result.error) throw new Error(`Could not load swim flow ${label}: ${result.error.message}`);
  }

  const timeZone = settingsResult.data?.timezone || "Europe/Amsterdam";
  const asOfDate = tenantDate(now, timeZone);
  const intakes = new Map(
    ((intakeResult.data ?? []) as IntakeRow[]).map((row) => [row.id, row])
  );
  const lineage = new Map(
    ((lineageResult.data ?? []) as LineageRow[]).map((row) => [row.intake_submission_id, row])
  );
  const enrollments = new Map(
    ((enrollmentResult.data ?? []) as EnrollmentRow[]).map((row) => [row.id, row])
  );
  const pauses = groupBy(
    (pauseResult.data ?? []) as PauseRow[],
    (row) => row.enrollment_id
  );
  const assignments = (assignmentResult.data ?? []) as AssignmentRow[];

  const waitTimes: WaitTimeJourney[] = ((waitlistResult.data ?? []) as WaitlistRow[])
    .map((entry) => {
      const intake = entry.intake_submission_id
        ? intakes.get(entry.intake_submission_id)
        : null;
      const conversion = entry.intake_submission_id
        ? lineage.get(entry.intake_submission_id)
        : null;
      return {
        id: entry.id,
        enteredAt: intake?.received_at ?? entry.created_at,
        eligibleFrom: entry.eligible_from,
        placedAt: conversion?.placed_at ?? (entry.status === "placed" ? entry.updated_at : null),
        source: entry.source,
        importedHistoryVerified: hasVerifiedHistory(entry.test_metadata_json),
        isTest: entry.is_test || intake?.is_test === true || conversion?.is_test === true
      };
    });

  const stageJourneys: StageJourney[] = ((transitionResult.data ?? []) as TransitionRow[])
    .flatMap((transition) => {
      if (!transition.executed_at) return [];
      const enrollment = enrollments.get(transition.enrollment_id);
      const assignment = assignments.find((candidate) =>
        candidate.transition_case_id === transition.id &&
        candidate.curriculum_stage_id === transition.from_stage_id &&
        candidate.status === "completed"
      );
      if (!enrollment || !assignment) return [];
      return [{
        id: transition.id,
        stageStartedAt: assignment.starts_at,
        transitionExecutedAt: transition.executed_at,
        source: enrollment.source,
        importedHistoryVerified: hasVerifiedHistory(enrollment.test_metadata_json),
        isTest: enrollment.is_test,
        pauses: mapPauses(pauses.get(enrollment.id) ?? [])
      }];
    });

  const firstCertificateByEnrollment = new Map<string, CertificateRow>();
  for (const certificate of (certificateResult.data ?? []) as CertificateRow[]) {
    if (!firstCertificateByEnrollment.has(certificate.enrollment_id)) {
      firstCertificateByEnrollment.set(certificate.enrollment_id, certificate);
    }
  }
  const diplomaJourneys: DiplomaJourney[] = [...firstCertificateByEnrollment.values()]
    .flatMap((certificate) => {
      const enrollment = enrollments.get(certificate.enrollment_id);
      if (!enrollment) return [];
      return [{
        id: certificate.id,
        enrollmentStartedOn: enrollment.starts_on,
        diplomaIssuedOn: certificate.issued_on,
        source: enrollment.source,
        importedHistoryVerified: hasVerifiedHistory(enrollment.test_metadata_json),
        isTest: enrollment.is_test,
        pauses: mapPauses(pauses.get(enrollment.id) ?? [])
      }];
    });

  return calculateSwimFlowAnalytics({
    asOfDate,
    generatedAt: now.toISOString(),
    timeZone,
    waitTimes,
    stageJourneys,
    diplomaJourneys
  });
}

export async function persistSwimFlowAnalyticsSnapshots(
  tenantId: string,
  report: SwimFlowAnalytics
) {
  const admin = createAdminClient();
  const evidence = await admin
    .from("swim_lifecycle_events")
    .select("occurred_at", { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("occurred_at", { ascending: false })
    .limit(1);
  if (evidence.error) {
    throw new Error(`Could not read swim lifecycle watermark: ${evidence.error.message}`);
  }
  const watermark = evidence.data?.[0]?.occurred_at ?? null;
  const rows = Object.values(report.metrics).flatMap((metric) => [
    snapshotRow({
      tenantId,
      report,
      metric,
      grain: "daily",
      snapshotDate: previousDate(report.windowEnd)
    }),
    snapshotRow({
      tenantId,
      report,
      metric,
      grain: "monthly",
      snapshotDate: `${previousDate(report.windowEnd).slice(0, 7)}-01`
    })
  ]).map((row) => ({
    ...row,
    source_event_count: evidence.count ?? 0,
    source_event_watermark: watermark
  }));
  const result = await admin
    .from("swim_flow_metric_snapshots")
    .upsert(rows, {
      onConflict: "tenant_id,grain,snapshot_date,metric_key,formula_version"
    });
  if (result.error) {
    throw new Error(`Could not persist swim flow snapshots: ${result.error.message}`);
  }
}

function snapshotRow(input: {
  tenantId: string;
  report: SwimFlowAnalytics;
  metric: SwimFlowAnalytics["metrics"][keyof SwimFlowAnalytics["metrics"]];
  grain: "daily" | "monthly";
  snapshotDate: string;
}) {
  return {
    tenant_id: input.tenantId,
    grain: input.grain,
    snapshot_date: input.snapshotDate,
    window_start: input.report.windowStart,
    window_end: input.report.windowEnd,
    tenant_timezone: input.report.timeZone,
    metric_key: input.metric.metricKey,
    formula_version: input.report.formulaVersion,
    metric_json: {
      label: input.metric.label,
      definition: input.metric.definition,
      cohortDefinition: input.metric.cohortDefinition,
      ...input.metric.statistics
    },
    cohorts_json: input.metric.cohorts,
    data_quality_json: input.metric.quality,
    calculated_at: input.report.generatedAt
  };
}

function mapPauses(rows: PauseRow[]): FlowPausePeriod[] {
  return rows.map((row) => ({
    startsOn: row.starts_on,
    expectedReturnOn: row.expected_return_on,
    returnedOn: row.returned_on,
    status: row.status
  }));
}

function tenantDate(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function previousDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return toAmsterdamDate(date);
}

function hasVerifiedHistory(value: unknown) {
  return isRecord(value) && value.historyVerified === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function groupBy<Row, Key>(rows: Row[], key: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
  return grouped;
}

type IntakeRow = { id: string; received_at: string; is_test: boolean };
type LineageRow = {
  intake_submission_id: string;
  enrollment_id: string;
  placed_at: string;
  is_test: boolean;
};
type WaitlistRow = {
  id: string;
  intake_submission_id: string | null;
  source: WaitTimeJourney["source"];
  status: string;
  eligible_from: string | null;
  created_at: string;
  updated_at: string;
  is_test: boolean;
  test_metadata_json: unknown;
};
type EnrollmentRow = {
  id: string;
  starts_on: string;
  source: DiplomaJourney["source"];
  is_test: boolean;
  test_metadata_json: unknown;
};
type AssignmentRow = {
  id: string;
  enrollment_id: string;
  curriculum_stage_id: string;
  transition_case_id: string | null;
  starts_at: string;
  status: string;
};
type TransitionRow = {
  id: string;
  enrollment_id: string;
  from_stage_id: string;
  execution_status: string;
  executed_at: string | null;
};
type PauseRow = {
  enrollment_id: string;
  starts_on: string;
  expected_return_on: string | null;
  returned_on: string | null;
  status: FlowPausePeriod["status"];
};
type CertificateRow = {
  id: string;
  enrollment_id: string;
  issued_on: string;
  status: string;
};
