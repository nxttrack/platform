import "server-only";

import { createHash } from "node:crypto";

import {
  CAPACITY_FORECAST_MODEL_VERSION,
  type CapacityForecast
} from "./learning-intelligence-contract";
import { forecastCapacity } from "./capacity-forecast";
import {
  getSwimFlowAnalytics,
  persistSwimFlowAnalyticsSnapshots
} from "./swim-flow-analytics";
import { createAdminClient } from "@/lib/supabase/admin";

const flowFormulaVersion = "swim_flow_v3.0.0";

export async function runSwimAnalyticsProjectionCycle(input: {
  tenantId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const admin = createAdminClient();
  const reconciliation = await admin.rpc("reconcile_swim_lifecycle_events", {
    target_tenant_id: input.tenantId
  });
  if (reconciliation.error) {
    throw new Error(`Could not reconcile swim lifecycle events: ${reconciliation.error.message}`);
  }

  const flow = await getSwimFlowAnalytics(input.tenantId, now);
  await persistSwimFlowAnalyticsSnapshots(input.tenantId, flow);
  const forecastRuns = [];
  for (const horizonWeeks of [4, 8, 12] as const) {
    forecastRuns.push(await persistCapacityForecastRun({
      tenantId: input.tenantId,
      horizonWeeks,
      now
    }));
  }
  const accuracy = await reconcileCapacityForecastAccuracy({
    tenantId: input.tenantId,
    asOfDate: previousDate(flow.windowEnd)
  });
  const expiry = await admin.rpc("expire_capacity_soft_reservations", {
    target_now: now.toISOString()
  });
  if (expiry.error) {
    throw new Error(`Could not expire capacity soft reservations: ${expiry.error.message}`);
  }

  return {
    reconciledEvents: Number(reconciliation.data ?? 0),
    flowSnapshotMetrics: Object.keys(flow.metrics).length,
    forecastRuns,
    accuracy,
    expiredReservations: Number(expiry.data ?? 0)
  };
}

export async function persistCapacityForecastRun(input: {
  tenantId: string;
  horizonWeeks: 4 | 8 | 12;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const admin = createAdminClient();
  const settings = await admin
    .from("tenant_settings")
    .select("timezone")
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (settings.error) throw new Error(`Could not load forecast timezone: ${settings.error.message}`);
  const timeZone = settings.data?.timezone || "Europe/Amsterdam";
  const asOfDate = tenantDate(now, timeZone);
  const forecasts = await forecastCapacity({
    tenantId: input.tenantId,
    horizonWeeks: input.horizonWeeks
  });
  const inputFingerprint = hashForecastInput(forecasts, input.horizonWeeks, asOfDate);
  const eventWatermark = await admin
    .from("swim_lifecycle_events")
    .select("occurred_at")
    .eq("tenant_id", input.tenantId)
    .order("occurred_at", { ascending: false })
    .limit(1);
  if (eventWatermark.error) {
    throw new Error(`Could not load forecast event watermark: ${eventWatermark.error.message}`);
  }

  const created = await admin
    .from("capacity_forecast_runs")
    .insert({
      tenant_id: input.tenantId,
      model_version: CAPACITY_FORECAST_MODEL_VERSION,
      formula_version: flowFormulaVersion,
      horizon_weeks: input.horizonWeeks,
      as_of_date: asOfDate,
      tenant_timezone: timeZone,
      filters_json: {},
      input_fingerprint: inputFingerprint,
      status: "generating",
      data_quality_json: summarizeForecastQuality(forecasts),
      source_event_watermark: eventWatermark.data?.[0]?.occurred_at ?? null
    })
    .select("id")
    .single();
  if (created.error) {
    if (created.error.code === "23505") {
      const existing = await admin
        .from("capacity_forecast_runs")
        .select("id, status, result_count")
        .eq("tenant_id", input.tenantId)
        .eq("model_version", CAPACITY_FORECAST_MODEL_VERSION)
        .eq("horizon_weeks", input.horizonWeeks)
        .eq("as_of_date", asOfDate)
        .eq("input_fingerprint", inputFingerprint)
        .single();
      if (existing.error) {
        throw new Error(`Could not load idempotent forecast run: ${existing.error.message}`);
      }
      return {
        runId: existing.data.id,
        status: existing.data.status,
        resultCount: existing.data.result_count,
        reused: true
      };
    }
    throw new Error(`Could not create capacity forecast run: ${created.error.message}`);
  }
  const runId = created.data.id;

  const inserted = forecasts.length
    ? await admin.from("capacity_forecast_results").insert(
        forecasts.map((forecast) => ({
          tenant_id: input.tenantId,
          run_id: runId,
          group_id: forecast.group_id,
          current_capacity: forecast.current_capacity,
          current_occupied: forecast.current_occupied,
          active_soft_reservations: forecast.active_soft_reservations,
          waitlist_demand: forecast.waitlist_demand,
          expected_openings: forecast.expected_openings,
          expected_bottlenecks: forecast.expected_bottlenecks,
          conservative_openings: forecast.opening_scenarios.conservative,
          likely_openings: forecast.opening_scenarios.likely,
          optimistic_openings: forecast.opening_scenarios.optimistic,
          earliest_availability_on: forecast.availability_range.earliest,
          likely_availability_on: forecast.availability_range.likely,
          latest_availability_on: forecast.availability_range.latest,
          risk_level: forecast.risk_level,
          confidence_label: forecast.confidence,
          confidence_score: forecast.confidence_score,
          reasons_json: forecast.reasons,
          data_quality_json: forecast.data_quality
        }))
      )
    : { error: null };
  if (inserted.error) {
    await admin
      .from("capacity_forecast_runs")
      .update({
        status: "failed",
        failure_code: "result_persistence_failed",
        completed_at: new Date().toISOString()
      })
      .eq("id", runId);
    throw new Error(`Could not persist capacity forecast results: ${inserted.error.message}`);
  }
  const completed = await admin
    .from("capacity_forecast_runs")
    .update({
      status: "completed",
      result_count: forecasts.length,
      completed_at: new Date().toISOString()
    })
    .eq("id", runId);
  if (completed.error) {
    throw new Error(`Could not complete capacity forecast run: ${completed.error.message}`);
  }
  return { runId, status: "completed", resultCount: forecasts.length, reused: false };
}

export async function reconcileCapacityForecastAccuracy(input: {
  tenantId: string;
  asOfDate: string;
}) {
  const admin = createAdminClient();
  const [accuracy, results, runs, events] = await Promise.all([
    admin
      .from("capacity_forecast_accuracy")
      .select("forecast_result_id")
      .eq("tenant_id", input.tenantId),
    admin
      .from("capacity_forecast_results")
      .select("id, run_id, group_id, earliest_availability_on, likely_availability_on, latest_availability_on")
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .limit(2000),
    admin
      .from("capacity_forecast_runs")
      .select("id, model_version, as_of_date, horizon_weeks, status")
      .eq("tenant_id", input.tenantId)
      .eq("status", "completed")
      .order("as_of_date", { ascending: false })
      .limit(1000),
    admin
      .from("swim_lifecycle_events")
      .select("id, group_id, local_date")
      .eq("tenant_id", input.tenantId)
      .eq("event_type", "capacity.opening_realized")
      .eq("is_test", false)
      .order("local_date")
  ]);
  for (const [label, result] of [
    ["existing accuracy", accuracy],
    ["forecast results", results],
    ["forecast runs", runs],
    ["opening evidence", events]
  ] as const) {
    if (result.error) throw new Error(`Could not reconcile ${label}: ${result.error.message}`);
  }
  const evaluated = new Set((accuracy.data ?? []).map((row) => row.forecast_result_id));
  const runById = new Map(((runs.data ?? []) as ForecastRunRow[]).map((row) => [row.id, row]));
  const eventsByGroup = groupBy(
    (events.data ?? []) as CapacityOpeningEventRow[],
    (row) => row.group_id
  );
  const rows = [];

  for (const result of (results.data ?? []) as ForecastResultRow[]) {
    if (evaluated.has(result.id)) continue;
    const run = runById.get(result.run_id);
    if (!run) continue;
    const horizonEnd = addDays(run.as_of_date, run.horizon_weeks * 7);
    const evidence = (eventsByGroup.get(result.group_id) ?? []).filter((event) =>
      event.local_date >= run.as_of_date && event.local_date <= horizonEnd
    );
    const first = evidence[0];
    if (first) {
      const likely = result.likely_availability_on;
      rows.push({
        tenant_id: input.tenantId,
        forecast_result_id: result.id,
        actual_first_opening_on: first.local_date,
        absolute_error_days: likely ? Math.abs(calendarDays(likely, first.local_date)) : null,
        within_predicted_range: result.earliest_availability_on &&
          result.latest_availability_on
          ? first.local_date >= result.earliest_availability_on &&
            first.local_date <= result.latest_availability_on
          : null,
        evaluation_status: likely ? "observed" : "insufficient_evidence",
        evidence_event_ids: evidence.slice(0, 100).map((event) => event.id),
        model_version: run.model_version
      });
    } else if (horizonEnd < input.asOfDate) {
      rows.push({
        tenant_id: input.tenantId,
        forecast_result_id: result.id,
        actual_first_opening_on: null,
        absolute_error_days: null,
        within_predicted_range: false,
        evaluation_status: result.likely_availability_on
          ? "no_opening"
          : "insufficient_evidence",
        evidence_event_ids: [],
        model_version: run.model_version
      });
    }
  }
  if (rows.length) {
    const inserted = await admin.from("capacity_forecast_accuracy").insert(rows);
    if (inserted.error) {
      throw new Error(`Could not persist forecast accuracy: ${inserted.error.message}`);
    }
  }
  return { evaluated: rows.length };
}

function summarizeForecastQuality(forecasts: CapacityForecast[]) {
  return {
    groupCount: forecasts.length,
    groupsWithoutHistory: forecasts.filter((row) => !row.data_quality.hasHistory).length,
    issueCount: forecasts.reduce((total, row) => total + row.data_quality.issueCount, 0),
    lowConfidenceCount: forecasts.filter((row) => row.confidence === "laag").length
  };
}

function hashForecastInput(
  forecasts: CapacityForecast[],
  horizonWeeks: 4 | 8 | 12,
  asOfDate: string
) {
  return createHash("sha256")
    .update(JSON.stringify({
      asOfDate,
      horizonWeeks,
      modelVersion: CAPACITY_FORECAST_MODEL_VERSION,
      rows: forecasts.map((row) => ({
        groupId: row.group_id,
        capacity: row.current_capacity,
        occupied: row.current_occupied,
        holds: row.active_soft_reservations,
        waitlistDemand: row.waitlist_demand,
        range: row.availability_range,
        scenarios: row.opening_scenarios,
        quality: row.data_quality
      }))
    }))
    .digest("hex");
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

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function previousDate(value: string) {
  return addDays(value, -1);
}

function calendarDays(left: string, right: string) {
  return Math.round(
    (new Date(`${right}T00:00:00.000Z`).getTime() -
      new Date(`${left}T00:00:00.000Z`).getTime()) / 86_400_000
  );
}

function groupBy<Row, Key>(rows: Row[], key: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
  return grouped;
}

type ForecastRunRow = {
  id: string;
  model_version: string;
  as_of_date: string;
  horizon_weeks: number;
  status: string;
};
type ForecastResultRow = {
  id: string;
  run_id: string;
  group_id: string;
  earliest_availability_on: string | null;
  likely_availability_on: string | null;
  latest_availability_on: string | null;
};
type CapacityOpeningEventRow = {
  id: string;
  group_id: string;
  local_date: string;
};
