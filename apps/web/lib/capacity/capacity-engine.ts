import type { SupabaseClient } from "@supabase/supabase-js";

export type CapacityGroupInput = {
  id: string;
  resource_id: string | null;
  capacity: number;
  status: string;
  reserved_spots?: number | null;
  trial_spots?: number | null;
  makeup_spots?: number | null;
  overbooking_policy?: string | null;
};

export type CapacityResourceInput = {
  id: string;
  capacity: number;
  status?: string | null;
};

export type CapacityMembershipInput = {
  id: string;
  group_id: string;
  status: string;
  starts_on?: string | null;
  ends_on: string | null;
};

export type CapacityHoldInput = {
  id: string;
  group_id: string;
  hold_type: string;
  status: string;
  quantity: number;
  starts_on: string;
  ends_on: string | null;
  expires_at: string;
  slot_offer_id: string | null;
  release_reason?: string | null;
};

export type CapacitySlotOfferInput = {
  id: string;
  group_id: string;
  status: string;
  expires_at: string;
};

export type CapacityReason = {
  code: string;
  label: string;
  detail: string;
  severity: "info" | "warning" | "blocking";
};

export type CapacitySnapshot = {
  groupId: string;
  groupCapacity: number;
  resourceCapacity: number | null;
  capacityLimit: number;
  fixedSpots: number;
  activeMemberships: number;
  futureStarts: number;
  endingMemberships: number;
  pendingSlotOffers: number;
  heldSpots: number;
  reservedSpots: number;
  trialSpots: number;
  makeupSpots: number;
  blockedSpots: number;
  usedSpots: number;
  openSpots: number;
  availableSpots: number;
  overbookingPolicy: "blocked" | "warn" | "allow";
  isAvailable: boolean;
  status: "available" | "nearly_full" | "full" | "overbooked" | "blocked";
  reasons: CapacityReason[];
  blockers: CapacityReason[];
};

type CapacityClient = Pick<SupabaseClient, "from">;

export async function releaseExpiredCapacity(client: CapacityClient, tenantId: string) {
  const now = new Date().toISOString();

  await client
    .from("capacity_holds")
    .update({
      status: "expired",
      released_at: now,
      release_reason: "automatic expiry"
    })
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .lt("expires_at", now);

  await client
    .from("slot_offers")
    .update({
      status: "expired",
      processing_status: "completed",
      processing_error: null,
      next_reminder_at: null,
      parent_response_note: "Automatisch verlopen; capaciteitshold vrijgegeven."
    })
    .eq("tenant_id", tenantId)
    .eq("status", "sent")
    .lt("expires_at", now);
}

export function buildCapacitySnapshots(input: {
  groups: CapacityGroupInput[];
  resources: CapacityResourceInput[];
  memberships: CapacityMembershipInput[];
  holds: CapacityHoldInput[];
  slotOffers?: CapacitySlotOfferInput[];
  now?: Date;
  excludeHoldSlotOfferId?: string | null;
}): CapacitySnapshot[] {
  const resourcesById = new Map(input.resources.map((resource) => [resource.id, resource]));

  return input.groups.map((group) =>
    buildCapacitySnapshot({
      group,
      resource: group.resource_id ? (resourcesById.get(group.resource_id) ?? null) : null,
      memberships: input.memberships.filter((membership) => membership.group_id === group.id),
      holds: input.holds.filter((hold) => hold.group_id === group.id),
      slotOffers: (input.slotOffers ?? []).filter((offer) => offer.group_id === group.id),
      now: input.now,
      excludeHoldSlotOfferId: input.excludeHoldSlotOfferId
    })
  );
}

export function buildCapacitySnapshot(input: {
  group: CapacityGroupInput;
  resource: CapacityResourceInput | null;
  memberships: CapacityMembershipInput[];
  holds: CapacityHoldInput[];
  slotOffers?: CapacitySlotOfferInput[];
  now?: Date;
  excludeHoldSlotOfferId?: string | null;
}): CapacitySnapshot {
  const now = input.now ?? new Date();
  const today = toDateInput(now);
  const futureWindow = addDays(today, 30);
  const overbookingPolicy = normalizeOverbookingPolicy(input.group.overbooking_policy);
  const groupCapacity = positiveInt(input.group.capacity);
  const resourceCapacity = input.resource ? positiveInt(input.resource.capacity) : null;
  const capacityLimit = Math.min(groupCapacity, resourceCapacity ?? groupCapacity);
  const activeMemberships = input.memberships.filter((membership) => isCurrentMembership(membership, today)).length;
  const futureStarts = input.memberships.filter((membership) => isFutureMembership(membership, today)).length;
  const endingMemberships = input.memberships.filter((membership) => isEndingMembership(membership, today, futureWindow)).length;
  const activeHolds = input.holds.filter((hold) => isActiveHold(hold, now) && hold.slot_offer_id !== input.excludeHoldSlotOfferId);
  const activeHoldQuantity = activeHolds.reduce((sum, hold) => sum + positiveInt(hold.quantity), 0);
  const activeHoldSlotOfferIds = new Set(activeHolds.flatMap((hold) => (hold.slot_offer_id ? [hold.slot_offer_id] : [])));
  const pendingSlotOffers = (input.slotOffers ?? []).filter((offer) => offer.status === "sent" && new Date(offer.expires_at).getTime() > now.getTime());
  const pendingOffersWithoutHold = pendingSlotOffers.filter((offer) => offer.id !== input.excludeHoldSlotOfferId && !activeHoldSlotOfferIds.has(offer.id)).length;
  const heldSpots = activeHoldQuantity + pendingOffersWithoutHold;
  const reservedSpots = nonNegativeInt(input.group.reserved_spots);
  const trialSpots = nonNegativeInt(input.group.trial_spots);
  const makeupSpots = nonNegativeInt(input.group.makeup_spots);
  const usedSpots = activeMemberships + futureStarts + heldSpots + reservedSpots + trialSpots + makeupSpots;
  const openSpots = Math.max(0, capacityLimit - usedSpots);
  const blockedSpots = Math.max(0, usedSpots - capacityLimit);
  const isOverCapacity = blockedSpots > 0;
  const reasons = capacityReasons({
    activeMemberships,
    futureStarts,
    endingMemberships,
    heldSpots,
    pendingSlotOffers: pendingSlotOffers.length,
    reservedSpots,
    trialSpots,
    makeupSpots,
    openSpots,
    capacityLimit,
    overbookingPolicy
  });
  const blockers = capacityBlockers({
    groupStatus: input.group.status,
    resourceStatus: input.resource?.status ?? null,
    openSpots,
    isOverCapacity,
    overbookingPolicy
  });
  const isAvailable = blockers.every((blocker) => blocker.severity !== "blocking") && (openSpots > 0 || overbookingPolicy !== "blocked");

  return {
    groupId: input.group.id,
    groupCapacity,
    resourceCapacity,
    capacityLimit,
    fixedSpots: capacityLimit,
    activeMemberships,
    futureStarts,
    endingMemberships,
    pendingSlotOffers: pendingSlotOffers.length,
    heldSpots,
    reservedSpots,
    trialSpots,
    makeupSpots,
    blockedSpots,
    usedSpots,
    openSpots,
    availableSpots: openSpots,
    overbookingPolicy,
    isAvailable,
    status: capacityStatus({ openSpots, blockedSpots, blockers, capacityLimit }),
    reasons,
    blockers
  };
}

export function capacitySnapshotToRecord(snapshot: CapacitySnapshot) {
  return {
    group_id: snapshot.groupId,
    group_capacity: snapshot.groupCapacity,
    resource_capacity: snapshot.resourceCapacity,
    capacity_limit: snapshot.capacityLimit,
    fixed_spots: snapshot.fixedSpots,
    active_memberships: snapshot.activeMemberships,
    future_starts: snapshot.futureStarts,
    ending_memberships: snapshot.endingMemberships,
    pending_slot_offers: snapshot.pendingSlotOffers,
    held_spots: snapshot.heldSpots,
    reserved_spots: snapshot.reservedSpots,
    trial_spots: snapshot.trialSpots,
    makeup_spots: snapshot.makeupSpots,
    used_spots: snapshot.usedSpots,
    open_spots: snapshot.openSpots,
    available_spots: snapshot.availableSpots,
    blocked_spots: snapshot.blockedSpots,
    overbooking_policy: snapshot.overbookingPolicy,
    status: snapshot.status,
    is_available: snapshot.isAvailable,
    reasons: snapshot.reasons,
    blockers: snapshot.blockers,
    rule_version: "capacity-v1"
  };
}

export function capacitySummaryText(snapshot: CapacitySnapshot) {
  if (snapshot.status === "blocked") {
    return "Capaciteit geblokkeerd";
  }

  if (snapshot.blockedSpots > 0) {
    return `${snapshot.blockedSpots} overboekt`;
  }

  return `${snapshot.openSpots}/${snapshot.capacityLimit} vrij`;
}

function capacityReasons(input: {
  activeMemberships: number;
  futureStarts: number;
  endingMemberships: number;
  heldSpots: number;
  pendingSlotOffers: number;
  reservedSpots: number;
  trialSpots: number;
  makeupSpots: number;
  openSpots: number;
  capacityLimit: number;
  overbookingPolicy: "blocked" | "warn" | "allow";
}): CapacityReason[] {
  const reasons: CapacityReason[] = [
    {
      code: "fixed_capacity",
      label: "Vaste capaciteit",
      detail: `${input.capacityLimit} plekken volgens groep en resource.`,
      severity: "info"
    },
    {
      code: "active_memberships",
      label: "Actieve groepsplaatsingen",
      detail: `${input.activeMemberships} leerling${input.activeMemberships === 1 ? "" : "en"} tellen nu mee.`,
      severity: "info"
    }
  ];

  if (input.futureStarts > 0) {
    reasons.push({ code: "future_starts", label: "Toekomstige starts", detail: `${input.futureStarts} plaatsing${input.futureStarts === 1 ? "" : "en"} starten later en reserveren ruimte.`, severity: "warning" });
  }

  if (input.endingMemberships > 0) {
    reasons.push({ code: "ending_memberships", label: "Eindigende plaatsingen", detail: `${input.endingMemberships} plaatsing${input.endingMemberships === 1 ? "" : "en"} eindigen binnen 30 dagen.`, severity: "info" });
  }

  if (input.pendingSlotOffers > 0) {
    reasons.push({ code: "pending_slot_offers", label: "Open lesplek-aanbod", detail: `${input.pendingSlotOffers} aanbod${input.pendingSlotOffers === 1 ? "" : "en"} wachten op ouderreactie.`, severity: "warning" });
  }

  if (input.heldSpots > 0) {
    reasons.push({ code: "capacity_holds", label: "Capacity holds", detail: `${input.heldSpots} plek${input.heldSpots === 1 ? "" : "ken"} tijdelijk vastgehouden.`, severity: "warning" });
  }

  if (input.reservedSpots > 0 || input.trialSpots > 0 || input.makeupSpots > 0) {
    reasons.push({
      code: "reserved_segments",
      label: "Gereserveerde segmenten",
      detail: `${input.reservedSpots} reserve, ${input.trialSpots} proefles, ${input.makeupSpots} inhaal.`,
      severity: "info"
    });
  }

  if (input.openSpots > 0) {
    reasons.push({ code: "open_capacity", label: "Beschikbaar", detail: `${input.openSpots} plek${input.openSpots === 1 ? "" : "ken"} vrij voor plaatsing.`, severity: "info" });
  }

  if (input.overbookingPolicy !== "blocked") {
    reasons.push({ code: "overbooking_policy", label: "Overboekingbeleid", detail: `Groep staat op ${input.overbookingPolicy}.`, severity: "warning" });
  }

  return reasons;
}

function capacityBlockers(input: {
  groupStatus: string;
  resourceStatus: string | null;
  openSpots: number;
  isOverCapacity: boolean;
  overbookingPolicy: "blocked" | "warn" | "allow";
}): CapacityReason[] {
  const blockers: CapacityReason[] = [];

  if (input.groupStatus !== "active") {
    blockers.push({ code: "group_not_active", label: "Groep niet actief", detail: "Alleen actieve groepen kunnen een lesplek-aanbod krijgen.", severity: "blocking" });
  }

  if (input.resourceStatus && input.resourceStatus !== "active") {
    blockers.push({ code: "resource_not_active", label: "Resource niet actief", detail: "De gekoppelde resource is niet beschikbaar.", severity: "blocking" });
  }

  if (input.openSpots <= 0 && input.overbookingPolicy === "blocked") {
    blockers.push({ code: "capacity_full", label: "Geen vrije plek", detail: "Alle capaciteit is bezet, gereserveerd of tijdelijk vastgehouden.", severity: "blocking" });
  }

  if (input.isOverCapacity && input.overbookingPolicy !== "blocked") {
    blockers.push({ code: "overbooking_warning", label: "Overboeking", detail: "Deze plaatsing gebruikt overboekingsbeleid en vraagt bewuste admincontrole.", severity: "warning" });
  }

  return blockers;
}

function capacityStatus(input: { openSpots: number; blockedSpots: number; blockers: CapacityReason[]; capacityLimit: number }): CapacitySnapshot["status"] {
  if (input.blockers.some((blocker) => blocker.severity === "blocking")) {
    return "blocked";
  }

  if (input.blockedSpots > 0) {
    return "overbooked";
  }

  if (input.openSpots <= 0) {
    return "full";
  }

  if (input.openSpots <= Math.max(1, Math.ceil(input.capacityLimit * 0.15))) {
    return "nearly_full";
  }

  return "available";
}

function isCurrentMembership(membership: CapacityMembershipInput, today: string) {
  if (!["planned", "active"].includes(membership.status)) {
    return false;
  }

  const startsOn = membership.starts_on ?? today;

  return startsOn <= today && (!membership.ends_on || membership.ends_on >= today);
}

function isFutureMembership(membership: CapacityMembershipInput, today: string) {
  if (!["planned", "active"].includes(membership.status)) {
    return false;
  }

  return Boolean(membership.starts_on && membership.starts_on > today && (!membership.ends_on || membership.ends_on >= membership.starts_on));
}

function isEndingMembership(membership: CapacityMembershipInput, today: string, futureWindow: string) {
  return isCurrentMembership(membership, today) && Boolean(membership.ends_on && membership.ends_on >= today && membership.ends_on <= futureWindow);
}

function isActiveHold(hold: CapacityHoldInput, now: Date) {
  return hold.status === "active" && new Date(hold.expires_at).getTime() > now.getTime();
}

function normalizeOverbookingPolicy(value: string | null | undefined): CapacitySnapshot["overbookingPolicy"] {
  return value === "warn" || value === "allow" ? value : "blocked";
}

function nonNegativeInt(value: number | null | undefined) {
  return Math.max(0, Number.isFinite(value) ? Number(value) : 0);
}

function positiveInt(value: number | null | undefined) {
  return Math.max(1, Number.isFinite(value) ? Number(value) : 1);
}

function toDateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(dateInput: string, days: number) {
  const date = new Date(`${dateInput}T12:00:00`);
  date.setDate(date.getDate() + days);

  return toDateInput(date);
}
