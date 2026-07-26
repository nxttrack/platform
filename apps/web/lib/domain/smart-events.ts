import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import {
  smartEventDescription,
  smartEventLabel,
  smartEventTypes,
  type SmartEventSeverity,
  type SmartEventType
} from "./smart-event-contract";

export { smartEventDescription, smartEventLabel, smartEventTypes };
export type { SmartEventSeverity, SmartEventType };

export type SmartEventRow = {
  id: string;
  tenant_id: string;
  event_type: SmartEventType | string;
  entity_type: string;
  entity_id: string;
  participant_id: string | null;
  guardian_id: string | null;
  group_id: string | null;
  program_id: string | null;
  stage_id: string | null;
  severity: SmartEventSeverity;
  occurred_at: string;
  source: string;
  is_test: boolean;
  journey_run_id: string | null;
  metadata_json: Record<string, unknown>;
};

export type RecordSmartEventInput = {
  tenantId: string;
  eventType: SmartEventType;
  entityType: string;
  entityId: string;
  participantId?: string | null;
  guardianId?: string | null;
  groupId?: string | null;
  programId?: string | null;
  stageId?: string | null;
  severity?: SmartEventSeverity;
  occurredAt?: string;
  source: string;
  isTest?: boolean;
  journeyRunId?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
};

export type RecordSmartEventResult =
  | { ok: true; id: string | null; duplicate: boolean }
  | { ok: false; error: string };

export async function recordSmartEvent(input: RecordSmartEventInput): Promise<RecordSmartEventResult> {
  const admin = createAdminClient();
  const payload = {
    tenant_id: input.tenantId,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId,
    participant_id: input.participantId ?? null,
    guardian_id: input.guardianId ?? null,
    group_id: input.groupId ?? null,
    program_id: input.programId ?? null,
    stage_id: input.stageId ?? null,
    severity: input.severity ?? "info",
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    source: input.source,
    is_test: input.isTest ?? false,
    journey_run_id: input.isTest ? input.journeyRunId ?? null : null,
    dedupe_key: input.dedupeKey ?? null,
    metadata_json: sanitizeMetadata(input.metadata)
  };

  const result = input.dedupeKey
    ? await admin
        .from("smart_events")
        .upsert(payload, { ignoreDuplicates: true, onConflict: "tenant_id,dedupe_key" })
        .select("id")
        .maybeSingle()
    : await admin.from("smart_events").insert(payload).select("id").single();

  if (result.error) {
    console.error(`[smart-events] Could not record ${input.eventType}: ${result.error.message}`);
    return { ok: false, error: result.error.message };
  }

  return {
    ok: true,
    id: result.data?.id ?? null,
    duplicate: !result.data?.id
  };
}

export async function getTenantSmartEvents(limit = 600): Promise<SmartEventRow[]> {
  const context = await requirePrivateShellContext("/admin");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const result = await admin
    .from("smart_events")
    .select("id, tenant_id, event_type, entity_type, entity_id, participant_id, guardian_id, group_id, program_id, stage_id, severity, occurred_at, source, is_test, journey_run_id, metadata_json")
    .eq("tenant_id", tenant.id)
    .order("occurred_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 1500)));

  if (result.error) {
    throw new Error(`Could not load smart events: ${result.error.message}`);
  }

  return (result.data ?? []) as SmartEventRow[];
}

export async function refreshSmartSignals(tenantId: string) {
  const admin = createAdminClient();
  const [offersResult, waitlistResult, groupsResult, membershipsResult, snapshotsResult] = await Promise.all([
    admin
      .from("slot_offers")
      .select("id, waitlist_entry_id, group_id, status, expires_at")
      .eq("tenant_id", tenantId)
      .eq("status", "sent"),
    admin
      .from("waitlist_entries")
      .select("id, program_id, recommended_stage_id, status, eligible_from, minimum_age_blocked, source, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    admin.from("groups").select("id, capacity, status").eq("tenant_id", tenantId).in("status", ["planned", "active"]),
    admin
      .from("group_memberships")
      .select("group_id, capacity_weight, status")
      .eq("tenant_id", tenantId)
      .in("status", ["active", "trial"]),
    admin
      .from("smart_signal_snapshots")
      .select("signal_type, entity_type, entity_id, status")
      .eq("tenant_id", tenantId)
  ]);

  assertSignalResult(offersResult.error, "slot offers");
  assertSignalResult(waitlistResult.error, "waitlist entries");
  assertSignalResult(groupsResult.error, "groups");
  assertSignalResult(membershipsResult.error, "group memberships");
  assertSignalResult(snapshotsResult.error, "signal snapshots");

  const waitlist = (waitlistResult.data ?? []) as Array<{
    id: string;
    program_id: string;
    recommended_stage_id: string | null;
    status: string;
    eligible_from: string | null;
    minimum_age_blocked: boolean;
    source: string;
    is_test: boolean;
    journey_run_id: string | null;
  }>;
  const waitlistById = new Map(waitlist.map((entry) => [entry.id, entry]));
  const previousStatus = new Map(
    (snapshotsResult.data ?? []).map((snapshot) => [
      signalKey(snapshot.signal_type, snapshot.entity_type, snapshot.entity_id),
      snapshot.status
    ])
  );
  const snapshotRows: Array<{
    tenant_id: string;
    signal_type: string;
    entity_type: string;
    entity_id: string;
    score: number | null;
    status: string;
    reasons_json: Array<Record<string, unknown>>;
    computed_at: string;
    expires_at: string | null;
  }> = [];
  let eventsCreated = 0;
  const now = new Date();
  const expiryHorizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  for (const offer of (offersResult.data ?? []) as Array<{ id: string; waitlist_entry_id: string; group_id: string; status: string; expires_at: string }>) {
    const expiresAt = new Date(offer.expires_at);
    const status = expiresAt.getTime() <= now.getTime() ? "expired" : expiresAt.getTime() <= expiryHorizon.getTime() ? "expiring" : "active";
    const type = status === "expired" ? "slot_offer_expired" : status === "expiring" ? "slot_offer_expiring" : null;
    const entry = waitlistById.get(offer.waitlist_entry_id);
    const key = signalKey("slot_offer_lifecycle", "slot_offer", offer.id);

    snapshotRows.push({
      tenant_id: tenantId,
      signal_type: "slot_offer_lifecycle",
      entity_type: "slot_offer",
      entity_id: offer.id,
      score: null,
      status,
      reasons_json: [{ expiresAt: offer.expires_at, horizonHours: 24 }],
      computed_at: now.toISOString(),
      expires_at: offer.expires_at
    });

    if (type && previousStatus.get(key) !== status) {
      const event = await recordSmartEvent({
        tenantId,
        eventType: type,
        entityType: "slot_offer",
        entityId: offer.id,
        groupId: offer.group_id,
        programId: entry?.program_id ?? null,
        stageId: entry?.recommended_stage_id ?? null,
        severity: status === "expired" ? "warning" : "info",
        source: entry?.source ?? "signal_sweep",
        isTest: entry?.is_test ?? false,
        journeyRunId: entry?.journey_run_id ?? null,
        dedupeKey: status === "expired" ? `slot-offer-expired:${offer.id}` : `slot-offer-expiring:${offer.id}:${offer.expires_at}`,
        metadata: {
          waitlistEntryId: offer.waitlist_entry_id,
          expiresAt: offer.expires_at,
          reason: status === "expired" ? "De reactietermijn is verstreken." : "De reactietermijn verloopt binnen 24 uur."
        }
      });
      if (event.ok && !event.duplicate) eventsCreated += 1;
    }
  }

  for (const entry of waitlist) {
    const eligible =
      ["waiting", "reviewing"].includes(entry.status) &&
      !entry.minimum_age_blocked &&
      !!entry.recommended_stage_id &&
      (!entry.eligible_from || entry.eligible_from <= now.toISOString().slice(0, 10));
    const status = eligible ? "eligible" : "blocked";
    const key = signalKey("waitlist_eligibility", "waitlist_entry", entry.id);

    snapshotRows.push({
      tenant_id: tenantId,
      signal_type: "waitlist_eligibility",
      entity_type: "waitlist_entry",
      entity_id: entry.id,
      score: eligible ? 1 : 0,
      status,
      reasons_json: [
        {
          hasStage: !!entry.recommended_stage_id,
          minimumAgeBlocked: entry.minimum_age_blocked,
          eligibleFrom: entry.eligible_from
        }
      ],
      computed_at: now.toISOString(),
      expires_at: null
    });

    if (eligible && previousStatus.get(key) !== status) {
      const event = await recordSmartEvent({
        tenantId,
        eventType: "waitlist_entry_eligible",
        entityType: "waitlist_entry",
        entityId: entry.id,
        programId: entry.program_id,
        stageId: entry.recommended_stage_id,
        source: entry.source,
        isTest: entry.is_test,
        journeyRunId: entry.journey_run_id,
        dedupeKey: `waitlist-eligible:${entry.id}:${entry.recommended_stage_id}`,
        metadata: {
          reason: "Programma, niveau en minimumleeftijd maken deze kandidaat plaatsbaar.",
          eligibleFrom: entry.eligible_from
        }
      });
      if (event.ok && !event.duplicate) eventsCreated += 1;
    }
  }

  const usedByGroup = new Map<string, number>();
  for (const membership of (membershipsResult.data ?? []) as Array<{ group_id: string; capacity_weight: number; status: string }>) {
    usedByGroup.set(membership.group_id, (usedByGroup.get(membership.group_id) ?? 0) + Number(membership.capacity_weight));
  }

  for (const group of (groupsResult.data ?? []) as Array<{ id: string; capacity: number; status: string }>) {
    const used = usedByGroup.get(group.id) ?? 0;
    const status = used >= group.capacity ? "full" : "available";
    const key = signalKey("group_capacity", "group", group.id);

    snapshotRows.push({
      tenant_id: tenantId,
      signal_type: "group_capacity",
      entity_type: "group",
      entity_id: group.id,
      score: group.capacity === 0 ? 1 : used / group.capacity,
      status,
      reasons_json: [{ used, capacity: group.capacity }],
      computed_at: now.toISOString(),
      expires_at: null
    });

    if (previousStatus.get(key) !== status) {
      const event = await recordSmartEvent({
        tenantId,
        eventType: status === "full" ? "group_capacity_full" : "group_capacity_available",
        entityType: "group",
        entityId: group.id,
        groupId: group.id,
        severity: status === "full" ? "warning" : "info",
        source: "signal_sweep",
        dedupeKey: `group-capacity:${group.id}:${status}:${now.toISOString().slice(0, 10)}`,
        metadata: {
          used,
          capacity: group.capacity,
          previousStatus: previousStatus.get(key) ?? null,
          status,
          reason: status === "full" ? "De actuele bezetting heeft de groepscapaciteit bereikt." : "De groep heeft actuele plaatsingsruimte."
        }
      });
      if (event.ok && !event.duplicate) eventsCreated += 1;
    }
  }

  if (snapshotRows.length > 0) {
    const snapshotWrite = await admin
      .from("smart_signal_snapshots")
      .upsert(snapshotRows, { onConflict: "tenant_id,signal_type,entity_type,entity_id" });
    assertSignalResult(snapshotWrite.error, "signal snapshots");
  }

  return {
    eventsCreated,
    snapshotsComputed: snapshotRows.length
  };
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return {};

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined)
  );
}

function signalKey(signalType: string, entityType: string, entityId: string) {
  return `${signalType}:${entityType}:${entityId}`;
}

function assertSignalResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not refresh ${label}: ${error.message}`);
  }
}
