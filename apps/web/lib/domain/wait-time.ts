import { toAmsterdamDate } from "../date/business-date";
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { deriveDaypart, type IntakeDaypart } from "./intake-recommendation-contract";
import {
  calculateWaitTimePrediction,
  withWaitTimeAlternatives,
  type CurrentCapacity,
  type CurrentWaitlistDemand,
  type HistoricalPlacement,
  type WaitTimePrediction,
  type WaitTimeQuery
} from "./wait-time-contract";

export type CalculateWaitTimeBandInput = WaitTimeQuery & {
  tenantId: string;
  include_test_data?: boolean;
};

export async function calculateWaitTimeBand(input: CalculateWaitTimeBandInput): Promise<WaitTimePrediction> {
  const predictions = await calculateWaitTimeBands({
    tenantId: input.tenantId,
    includeTestData: input.include_test_data ?? false,
    persist: false,
    requests: [input]
  });
  return predictions[0]?.prediction ?? emptyPrediction();
}

export async function calculateWaitTimeBands(input: {
  tenantId: string;
  requests: WaitTimeQuery[];
  includeTestData?: boolean;
  persist?: boolean;
}) {
  const includeTestData = allowTestData(input.includeTestData ?? false);
  const model = await loadWaitTimeModel(input.tenantId, includeTestData);
  const requested = deduplicateQueries(input.requests);
  const normalizedRequested = requested.map((query) => ({
    query,
    normalized: normalizeQueryLocation(query, model.locationByResource)
  }));
  const alternativeQueries = model.capacity.map((capacity) => ({
    programId: capacity.programId,
    stageId: capacity.stageId,
    preferredDay: capacity.weekday,
    preferredTimeBlock: capacity.timeBlock,
    locationId: capacity.locationId
  } satisfies WaitTimeQuery));
  const allQueries = deduplicateQueries([
    ...normalizedRequested.map((item) => item.normalized),
    ...alternativeQueries
  ]);
  const calculated = allQueries.map((query) => ({
    query,
    prediction: calculateWaitTimePrediction({
      query,
      history: model.history,
      demand: model.demand,
      capacity: model.capacity,
      now: model.now
    })
  }));
  const withAlternatives = calculated.map((item) => ({
    ...item,
    prediction: withWaitTimeAlternatives(item.prediction, item.query, calculated)
  }));
  const byKey = new Map(withAlternatives.map((item) => [queryKey(item.query), item]));
  const result = normalizedRequested.flatMap(({ query, normalized }) => {
    const prediction = byKey.get(queryKey(normalized));
    return prediction ? [{ query, prediction: prediction.prediction }] : [];
  });

  if (input.persist && result.length > 0) {
    await persistPredictions(input.tenantId, result, includeTestData, model.now);
  }

  return result;
}

async function loadWaitTimeModel(tenantId: string, includeTestData: boolean) {
  const admin = createAdminClient();
  let waitlistQuery = admin
    .from("waitlist_entries")
    .select("id, intake_submission_id, program_id, recommended_stage_id, priority_date, created_at, status, eligible_from, minimum_age_blocked, source, is_test, journey_run_id")
    .eq("tenant_id", tenantId);
  let membershipsQuery = admin
    .from("group_memberships")
    .select("group_id, status, capacity_weight, source, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .in("status", ["active", "trial"]);
  if (!includeTestData) {
    waitlistQuery = waitlistQuery.eq("is_test", false);
    membershipsQuery = membershipsQuery.eq("is_test", false);
  }

  const [waitlistResult, preferencesResult, offersResult, groupsResult, membershipsResult, resourcesResult, intakesResult] = await Promise.all([
    waitlistQuery,
    admin
      .from("waitlist_preferences")
      .select("waitlist_entry_id, weekday, starts_after, ends_before")
      .eq("tenant_id", tenantId),
    admin
      .from("slot_offers")
      .select("id, waitlist_entry_id, group_id, status, responded_at, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "accepted")
      .order("responded_at", { ascending: false }),
    admin
      .from("groups")
      .select("id, program_id, stage_id, default_resource_id, default_weekday, default_start_time, capacity, status")
      .eq("tenant_id", tenantId)
      .in("status", ["active", "planned"]),
    membershipsQuery,
    admin
      .from("resources")
      .select("id, parent_resource_id, kind")
      .eq("tenant_id", tenantId),
    admin
      .from("intake_submissions")
      .select("id, received_at")
      .eq("tenant_id", tenantId)
  ]);

  assertWaitTimeResult(waitlistResult.error, "waitlist entries");
  assertWaitTimeResult(preferencesResult.error, "waitlist preferences");
  assertWaitTimeResult(offersResult.error, "accepted placements");
  assertWaitTimeResult(groupsResult.error, "groups");
  assertWaitTimeResult(membershipsResult.error, "group capacity");
  assertWaitTimeResult(resourcesResult.error, "resource hierarchy");
  assertWaitTimeResult(intakesResult.error, "intake history");

  const waitlistRows = (waitlistResult.data ?? []) as Array<{
    id: string;
    intake_submission_id: string | null;
    program_id: string;
    recommended_stage_id: string | null;
    priority_date: string;
    created_at: string;
    status: string;
    eligible_from: string | null;
    minimum_age_blocked: boolean;
    source: string;
    is_test: boolean;
    journey_run_id: string | null;
  }>;
  const waitlistById = new Map(waitlistRows.map((entry) => [entry.id, entry]));
  const intakeReceivedAt = new Map(
    ((intakesResult.data ?? []) as Array<{ id: string; received_at: string }>).map((intake) => [intake.id, intake.received_at])
  );
  const preferencesByEntry = groupBy(
    (preferencesResult.data ?? []) as Array<{
      waitlist_entry_id: string;
      weekday: number;
      starts_after: string | null;
      ends_before: string | null;
    }>,
    (preference) => preference.waitlist_entry_id
  );
  const groups = (groupsResult.data ?? []) as Array<{
    id: string;
    program_id: string;
    stage_id: string | null;
    default_resource_id: string | null;
    default_weekday: number | null;
    default_start_time: string | null;
    capacity: number;
    status: string;
  }>;
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const resources = (resourcesResult.data ?? []) as Array<{
    id: string;
    parent_resource_id: string | null;
    kind: string;
  }>;
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
  const locationByResource = new Map(resources.map((resource) => [
    resource.id,
    resolveLocationId(resource.id, resourceById)
  ]));
  const usedByGroup = new Map<string, number>();
  for (const membership of (membershipsResult.data ?? []) as Array<{ group_id: string; capacity_weight: number }>) {
    usedByGroup.set(membership.group_id, (usedByGroup.get(membership.group_id) ?? 0) + Number(membership.capacity_weight));
  }
  const today = toAmsterdamDate();

  const history: HistoricalPlacement[] = ((offersResult.data ?? []) as Array<{
    waitlist_entry_id: string;
    group_id: string;
    responded_at: string | null;
    created_at: string;
  }>).flatMap((offer) => {
    const entry = waitlistById.get(offer.waitlist_entry_id);
    const group = groupById.get(offer.group_id);
    const placedAt = offer.responded_at ?? offer.created_at;
    if (!entry || !group) return [];
    const initialWaitStart = entry.intake_submission_id
      ? intakeReceivedAt.get(entry.intake_submission_id) ?? entry.created_at
      : entry.created_at;
    const waitStart = entry.eligible_from
      ? new Date(`${entry.eligible_from}T00:00:00.000Z`) > new Date(initialWaitStart)
        ? `${entry.eligible_from}T00:00:00.000Z`
        : initialWaitStart
      : initialWaitStart;
    const waitDays = Math.max(
      0,
      (new Date(placedAt).getTime() - new Date(waitStart).getTime()) / dayMs
    );
    return [{
      programId: entry.program_id,
      stageId: entry.recommended_stage_id ?? group.stage_id,
      weekday: group.default_weekday,
      timeBlock: group.default_start_time ? deriveDaypart(group.default_start_time) : null,
      locationId: group.default_resource_id
        ? locationByResource.get(group.default_resource_id) ?? group.default_resource_id
        : null,
      waitDays,
      placedAt
    }];
  });

  const demand: CurrentWaitlistDemand[] = waitlistRows
    .filter((entry) =>
      ["waiting", "reviewing", "offered"].includes(entry.status) &&
      (!entry.minimum_age_blocked || (!!entry.eligible_from && entry.eligible_from <= today)) &&
      (!entry.eligible_from || entry.eligible_from <= today)
    )
    .map((entry) => {
      const preferences = preferencesByEntry.get(entry.id) ?? [];
      return {
        programId: entry.program_id,
        stageId: entry.recommended_stage_id,
        preferredDays: [...new Set(preferences.map((preference) => preference.weekday))],
        preferredTimeBlocks: [...new Set(preferences.flatMap((preference) => timeBlocksForPreference(preference)))],
        priorityDate: entry.priority_date
      };
    });

  const capacity: CurrentCapacity[] = groups
    .filter((group) => group.status === "active")
    .map((group) => ({
      programId: group.program_id,
      stageId: group.stage_id,
      weekday: group.default_weekday,
      timeBlock: group.default_start_time ? deriveDaypart(group.default_start_time) : null,
      locationId: group.default_resource_id
        ? locationByResource.get(group.default_resource_id) ?? group.default_resource_id
        : null,
      capacity: group.capacity,
      available: Math.max(0, group.capacity - (usedByGroup.get(group.id) ?? 0))
    }));

  return { capacity, demand, history, locationByResource, now: new Date().toISOString() };
}

async function persistPredictions(
  tenantId: string,
  rows: Array<{ query: WaitTimeQuery; prediction: WaitTimePrediction }>,
  includeTestData: boolean,
  computedAt: string
) {
  const admin = createAdminClient();
  const result = await admin.from("wait_time_band_snapshots").upsert(
    rows.map(({ query, prediction }) => ({
      tenant_id: tenantId,
      program_id: query.programId,
      stage_id: query.stageId ?? null,
      preferred_day: query.preferredDay ?? null,
      preferred_time_block: query.preferredTimeBlock ?? null,
      location_id: query.locationId ?? null,
      band: prediction.band,
      confidence: prediction.confidence,
      sample_size: prediction.sample_size,
      basis: prediction.basis,
      median_weeks: prediction.statistics.medianWeeks,
      p75_weeks: prediction.statistics.p75Weeks,
      p90_weeks: prediction.statistics.p90Weeks,
      inflow_per_week: prediction.statistics.inflowPerWeek,
      outflow_per_week: prediction.statistics.outflowPerWeek,
      current_waitlist: prediction.statistics.currentWaitlist,
      available_capacity: prediction.statistics.availableCapacity,
      reasons_json: prediction.reasons,
      alternatives_json: prediction.suggested_alternatives,
      admin_explanation: prediction.admin_explanation,
      parent_explanation: prediction.parent_explanation,
      include_test_data: includeTestData,
      computed_at: computedAt,
      expires_at: new Date(new Date(computedAt).getTime() + dayMs).toISOString()
    })),
    {
      onConflict: "tenant_id,program_id,stage_id,preferred_day,preferred_time_block,location_id,include_test_data"
    }
  );
  assertWaitTimeResult(result.error, "wait-time snapshots");
}

function timeBlocksForPreference(preference: {
  starts_after: string | null;
  ends_before: string | null;
}): IntakeDaypart[] {
  if (!preference.starts_after && !preference.ends_before) return [];
  const startHour = Number((preference.starts_after ?? "00:00").slice(0, 2));
  const endHour = Number((preference.ends_before ?? "23:59").slice(0, 2));
  return ([
    ["morning", 6, 12],
    ["afternoon", 12, 17],
    ["evening", 17, 24]
  ] as const).flatMap(([block, blockStart, blockEnd]) =>
    startHour < blockEnd && endHour > blockStart ? [block] : []
  );
}

function deduplicateQueries(queries: WaitTimeQuery[]) {
  return [...new Map(queries.map((query) => [queryKey(query), query])).values()];
}

function queryKey(query: WaitTimeQuery) {
  return [
    query.programId,
    query.stageId ?? "",
    query.preferredDay ?? "",
    query.preferredTimeBlock ?? "",
    query.locationId ?? ""
  ].join(":");
}

function normalizeQueryLocation(query: WaitTimeQuery, locationByResource: Map<string, string>) {
  return {
    ...query,
    locationId: query.locationId
      ? locationByResource.get(query.locationId) ?? query.locationId
      : null
  };
}

function resolveLocationId(
  resourceId: string,
  resourceById: Map<string, { id: string; parent_resource_id: string | null; kind: string }>
) {
  let current = resourceById.get(resourceId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.kind === "location") return current.id;
    current = current.parent_resource_id ? resourceById.get(current.parent_resource_id) : undefined;
  }
  return resourceId;
}

function allowTestData(requested: boolean) {
  if (!requested) return false;
  const environment = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
  return environment === "development" || environment === "staging";
}

function emptyPrediction(): WaitTimePrediction {
  return {
    band: "insufficient_data",
    confidence: 0,
    sample_size: 0,
    basis: "insufficient_data",
    reasons: ["geen berekenbare programma- of capaciteitsdata"],
    admin_explanation: "Onvoldoende gegevens om de wachttijdband te berekenen.",
    parent_explanation: "Er is nog onvoldoende informatie voor een betrouwbare wachttijdindicatie.",
    suggested_alternatives: [],
    statistics: {
      medianWeeks: null,
      p75Weeks: null,
      p90Weeks: null,
      inflowPerWeek: 0,
      outflowPerWeek: 0,
      currentWaitlist: 0,
      availableCapacity: 0
    }
  };
}

function groupBy<Row, Key>(rows: Row[], key: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) {
    const value = key(row);
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}

function assertWaitTimeResult(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Could not calculate ${label}: ${error.message}`);
}

const dayMs = 24 * 60 * 60 * 1000;
