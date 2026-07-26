import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildCampaignRevenueReport, type CampaignFunnelInput } from "./campaign-revenue-contract";
import type { AttributionChannel } from "./attribution";

export async function getCampaignRevenueReport(input: {
  tenantId: string;
  from: string;
  to: string;
}) {
  const admin = createAdminClient();
  const sourcesResult = await admin
    .from("lead_sources")
    .select("id, intake_submission_id, attribution_channel, attribution_source, attribution_medium, attribution_campaign, source, is_test, journey_run_id")
    .eq("tenant_id", input.tenantId);
  assertCampaignResult(sourcesResult.error, "campaign lead sources");
  const sources = sourcesResult.data ?? [];
  const intakeIds = sources.map((source) => source.intake_submission_id);
  const [intakesResult, lineageResult] = await Promise.all([
    intakeIds.length
      ? admin
          .from("intake_submissions")
          .select("id, received_at, duplicate_state")
          .eq("tenant_id", input.tenantId)
          .in("id", intakeIds)
      : Promise.resolve({ data: [], error: null }),
    intakeIds.length
      ? admin
          .from("intake_conversion_lineage")
          .select("intake_submission_id, participant_id, enrollment_id, placement_method, placed_at")
          .eq("tenant_id", input.tenantId)
          .in("intake_submission_id", intakeIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  assertCampaignResult(intakesResult.error, "campaign intakes");
  assertCampaignResult(lineageResult.error, "campaign conversion lineage");
  const lineage = lineageResult.data ?? [];
  const participantIds = lineage.map((row) => row.participant_id);
  const enrollmentIds = lineage.map((row) => row.enrollment_id);
  const [enrollmentsResult, attendanceResult, subscriptionsResult, paymentsResult] = await Promise.all([
    enrollmentIds.length
      ? admin
          .from("enrollments")
          .select("id, starts_on, status")
          .eq("tenant_id", input.tenantId)
          .in("id", enrollmentIds)
      : Promise.resolve({ data: [], error: null }),
    participantIds.length
      ? admin
          .from("session_attendance")
          .select("participant_id, status")
          .eq("tenant_id", input.tenantId)
          .in("participant_id", participantIds)
          .eq("status", "trial")
      : Promise.resolve({ data: [], error: null }),
    enrollmentIds.length
      ? admin
          .from("subscriptions")
          .select("id, enrollment_id, status")
          .eq("tenant_id", input.tenantId)
          .in("enrollment_id", enrollmentIds)
      : Promise.resolve({ data: [], error: null }),
    enrollmentIds.length
      ? admin
          .from("manual_payments")
          .select("enrollment_id, currency, amount_cents, refunded_cents, chargeback_cents, status, paid_on")
          .eq("tenant_id", input.tenantId)
          .in("enrollment_id", enrollmentIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  for (const [label, result] of [
    ["campaign enrollments", enrollmentsResult],
    ["campaign trial attendance", attendanceResult],
    ["campaign subscriptions", subscriptionsResult],
    ["campaign payments", paymentsResult]
  ] as const) assertCampaignResult(result.error, label);

  const intakeById = new Map((intakesResult.data ?? []).map((row) => [row.id, row]));
  const lineageByIntake = new Map(lineage.map((row) => [row.intake_submission_id, row]));
  const enrollmentById = new Map((enrollmentsResult.data ?? []).map((row) => [row.id, row]));
  const attendanceByParticipant = groupBy(attendanceResult.data ?? [], (row) => row.participant_id);
  const subscriptionsByEnrollment = groupBy(subscriptionsResult.data ?? [], (row) => row.enrollment_id);
  const paymentsByEnrollment = groupBy(paymentsResult.data ?? [], (row) => row.enrollment_id);
  const today = new Date().toISOString().slice(0, 10);
  const rows: CampaignFunnelInput[] = sources.flatMap((source) => {
    const intake = intakeById.get(source.intake_submission_id);
    if (!intake) return [];
    const conversion = lineageByIntake.get(intake.id);
    const enrollment = conversion ? enrollmentById.get(conversion.enrollment_id) : null;
    return [{
      intakeId: intake.id,
      receivedAt: intake.received_at,
      duplicateState: intake.duplicate_state,
      attributionChannel: source.attribution_channel as AttributionChannel,
      source: source.attribution_source,
      medium: source.attribution_medium,
      campaign: source.attribution_campaign,
      isTest: source.is_test,
      journeyRunId: source.journey_run_id,
      recordSource: source.source,
      hasLineage: !!conversion,
      placementMethod: conversion?.placement_method ?? null,
      placedAt: conversion?.placed_at ?? null,
      enrollmentStarted: !!enrollment && enrollment.starts_on <= today && ["active", "completed"].includes(enrollment.status),
      trialCompleted: !!conversion && (attendanceByParticipant.get(conversion.participant_id)?.length ?? 0) > 0,
      activeSubscription: !!conversion && (subscriptionsByEnrollment.get(conversion.enrollment_id) ?? []).some((subscription) => subscription.status === "active"),
      payments: conversion
        ? (paymentsByEnrollment.get(conversion.enrollment_id) ?? []).map((payment) => ({
            currency: payment.currency,
            amountCents: Number(payment.amount_cents),
            refundedCents: Number(payment.refunded_cents),
            chargebackCents: Number(payment.chargeback_cents),
            status: payment.status,
            paidOn: payment.paid_on
          }))
        : []
    }];
  });

  return buildCampaignRevenueReport({ rows, from: input.from, to: input.to });
}

function groupBy<Row, Key>(rows: Row[], key: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
  return grouped;
}

function assertCampaignResult(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}
