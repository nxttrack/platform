import {
  buildCapacitySnapshot,
  capacitySnapshotToRecord,
  capacitySummaryText,
  releaseExpiredCapacity,
  type CapacityHoldInput,
  type CapacityMembershipInput,
  type CapacityResourceInput
} from "@/lib/capacity/capacity-engine";
import { confidenceFromScore, smartBlocker, smartReason, upsertSmartDecision, type SmartDecisionBlocker, type SmartDecisionReason } from "@/lib/smart-flow/decision";
import { createClient } from "@/lib/supabase/server";

type FlowThroughClient = Awaited<ReturnType<typeof createClient>>;

type ProposalRow = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  status: string;
  evidence_snapshot: Record<string, unknown> | null;
};

type EnrollmentRow = {
  id: string;
  participant_id: string;
  program_id: string;
  current_stage_id: string | null;
  subscription_plan_id: string | null;
  status: string;
};

type GroupRow = {
  id: string;
  program_id: string;
  stage_id: string;
  resource_id: string | null;
  instructor_id: string | null;
  name: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  capacity: number;
  reserved_spots: number;
  trial_spots: number;
  makeup_spots: number;
  overbooking_policy: string;
  status: string;
};

type GroupMembershipRow = CapacityMembershipInput & {
  enrollment_id: string;
};

type SlotOfferRow = {
  id: string;
  group_id: string;
  status: string;
  expires_at: string;
};

export type FlowThroughTargetOptionDraft = {
  groupId: string;
  resourceId: string | null;
  instructorId: string | null;
  score: number;
  confidence: string;
  capacitySummary: string;
  capacitySnapshot: Record<string, unknown>;
  preferredFit: Record<string, unknown>;
  constraintsSnapshot: Record<string, unknown>;
  reasons: SmartDecisionReason[];
  blockers: SmartDecisionBlocker[];
  suggestedStartOn: string;
  status: "candidate" | "blocked";
};

export type FlowThroughRecommendationDraft = {
  proposal: ProposalRow;
  enrollment: EnrollmentRow;
  currentMembership: GroupMembershipRow | null;
  currentGroup: GroupRow | null;
  score: number;
  confidence: string;
  reasons: SmartDecisionReason[];
  blockers: SmartDecisionBlocker[];
  completionSnapshot: Record<string, unknown>;
  capacityResult: Record<string, unknown>;
  preferredFit: Record<string, unknown>;
  constraintsSnapshot: Record<string, unknown>;
  oldSpotReleaseOn: string;
  targetStartOn: string;
  targetGroupId: string | null;
  smartDecisionId: string;
  options: FlowThroughTargetOptionDraft[];
};

export async function buildFlowThroughRecommendation(
  supabase: FlowThroughClient,
  input: {
    tenantId: string;
    proposalId: string;
  }
): Promise<FlowThroughRecommendationDraft> {
  await releaseExpiredCapacity(supabase, input.tenantId);

  const proposal = await singleRow<ProposalRow>(
    supabase
      .from("stage_transition_proposals")
      .select("id, enrollment_id, participant_id, from_stage_id, to_stage_id, status, evidence_snapshot")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.proposalId)
      .single()
  );
  const enrollment = await singleRow<EnrollmentRow>(
    supabase
      .from("enrollments")
      .select("id, participant_id, program_id, current_stage_id, subscription_plan_id, status")
      .eq("tenant_id", input.tenantId)
      .eq("id", proposal.enrollment_id)
      .single()
  );
  const currentMembership = await maybeRow<GroupMembershipRow>(
    supabase
      .from("group_memberships")
      .select("id, enrollment_id, group_id, status, starts_on, ends_on")
      .eq("tenant_id", input.tenantId)
      .eq("enrollment_id", enrollment.id)
      .in("status", ["active", "planned"])
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle()
  );
  const currentGroup = currentMembership
    ? await maybeRow<GroupRow>(
        supabase
          .from("groups")
          .select("id, program_id, stage_id, resource_id, instructor_id, name, weekday, starts_at, ends_at, capacity, reserved_spots, trial_spots, makeup_spots, overbooking_policy, status")
          .eq("tenant_id", input.tenantId)
          .eq("id", currentMembership.group_id)
          .maybeSingle()
      )
    : null;
  const targetGroups = await rows<GroupRow>(
    supabase
      .from("groups")
      .select("id, program_id, stage_id, resource_id, instructor_id, name, weekday, starts_at, ends_at, capacity, reserved_spots, trial_spots, makeup_spots, overbooking_policy, status")
      .eq("tenant_id", input.tenantId)
      .eq("program_id", enrollment.program_id)
      .eq("stage_id", proposal.to_stage_id)
      .in("status", ["active", "paused"])
      .order("weekday", { ascending: true })
      .order("starts_at", { ascending: true })
  );
  const groupIds = targetGroups.map((group) => group.id);
  const resourceIds = [...new Set(targetGroups.flatMap((group) => (group.resource_id ? [group.resource_id] : [])))];
  const [resources, memberships, holds, slotOffers] = await Promise.all([
    resourceIds.length === 0
      ? Promise.resolve([])
      : rows<CapacityResourceInput>(
          supabase
            .from("resources")
            .select("id, capacity, status")
            .eq("tenant_id", input.tenantId)
            .in("id", resourceIds)
        ),
    groupIds.length === 0
      ? Promise.resolve([])
      : rows<GroupMembershipRow>(
          supabase
            .from("group_memberships")
            .select("id, enrollment_id, group_id, status, starts_on, ends_on")
            .eq("tenant_id", input.tenantId)
            .in("group_id", groupIds)
        ),
    groupIds.length === 0
      ? Promise.resolve([])
      : rows<CapacityHoldInput>(
          supabase
            .from("capacity_holds")
            .select("id, group_id, hold_type, status, quantity, starts_on, ends_on, expires_at, slot_offer_id, release_reason")
            .eq("tenant_id", input.tenantId)
            .in("group_id", groupIds)
        ),
    groupIds.length === 0
      ? Promise.resolve([])
      : rows<SlotOfferRow>(
          supabase
            .from("slot_offers")
            .select("id, group_id, status, expires_at")
            .eq("tenant_id", input.tenantId)
            .in("group_id", groupIds)
        )
  ]);
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const oldSpotReleaseOn = todayInput();
  const targetStartOn = addDays(oldSpotReleaseOn, 7);
  const completionSnapshot = {
    proposal_status: proposal.status,
    from_stage_id: proposal.from_stage_id,
    to_stage_id: proposal.to_stage_id,
    current_stage_id: enrollment.current_stage_id,
    evidence: proposal.evidence_snapshot ?? {},
    rule_version: "flow-through-v2"
  };
  const options = targetGroups
    .map((group) =>
      buildTargetOption({
        group,
        currentGroup,
        resource: group.resource_id ? (resourcesById.get(group.resource_id) ?? null) : null,
        memberships: memberships.filter((membership) => membership.group_id === group.id),
        holds: holds.filter((hold) => hold.group_id === group.id),
        slotOffers: slotOffers.filter((offer) => offer.group_id === group.id),
        suggestedStartOn: targetStartOn
      })
    )
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "candidate" ? -1 : 1;
      }

      return right.score - left.score;
    });
  const bestOption = options[0] ?? null;
  const blockers: SmartDecisionBlocker[] = [];
  const reasons: SmartDecisionReason[] = [
    smartReason({
      code: "stage_completion",
      label: "Niveau is klaar voor doorstroom",
      detail: "Gebaseerd op het bestaande stage transition proposal en de voortgangsbewijzen.",
      weight: 30,
      evidence: completionSnapshot,
      visibleToParent: false
    }),
    smartReason({
      code: "billing_guard",
      label: "Abonnement blijft ongewijzigd",
      detail: "Doorstroom verandert stage en mogelijk groep, maar niet het subscription/payment plan.",
      weight: 5,
      evidence: { subscription_plan_id: enrollment.subscription_plan_id },
      visibleToParent: true
    })
  ];

  if (currentGroup) {
    reasons.push(
      smartReason({
        code: "old_spot_release",
        label: "Oude plek kan vrijvallen",
        detail: `${currentGroup.name} wordt vrijgegeven op ${oldSpotReleaseOn}.`,
        weight: 10,
        evidence: { current_group_id: currentGroup.id, release_on: oldSpotReleaseOn }
      })
    );
  }

  if (!bestOption) {
    blockers.push(
      smartBlocker({
        code: "no_target_group",
        label: "Geen passende doelgroep",
        detail: "Er is nog geen actieve of gepauzeerde groep voor het volgende niveau.",
        severity: "blocking"
      })
    );
  } else {
    reasons.push(...bestOption.reasons.slice(0, 4));
    blockers.push(...bestOption.blockers);
  }

  const topScore = Math.max(0, Math.min(100, Math.round(35 + (bestOption?.score ?? 0) * 0.6)));
  const score = blockers.some((blocker) => blocker.severity !== "warning") ? Math.min(topScore, 49) : topScore;
  const confidence = confidenceFromScore(score, blockers);
  const recommendation = {
    target_group_id: bestOption?.groupId ?? null,
    target_start_on: targetStartOn,
    old_spot_release_on: oldSpotReleaseOn,
    billing_change: false,
    next_action: bestOption && bestOption.blockers.every((blocker) => blocker.severity === "warning") ? "approve_with_group" : "manual_review",
    explanation: bestOption ? `${bestOption.capacitySummary}; abonnement blijft ongewijzigd.` : "Maak eerst een groep voor het volgende niveau."
  };
  const smartDecisionId = await upsertSmartDecision(supabase, {
    tenantId: input.tenantId,
    engineKey: "flow_through",
    subjectType: "stage_transition_proposal",
    subjectId: proposal.id,
    inputSnapshot: {
      proposal,
      enrollment,
      current_membership: currentMembership,
      current_group: currentGroup,
      candidate_group_count: targetGroups.length
    },
    ruleVersion: "flow-through-v2",
    score,
    confidence,
    reasons,
    blockers,
    recommendation,
    decisionStatus: "recommended",
    metadata: {
      phase: "S8",
      capacity_engine: "capacity-v1"
    }
  });

  return {
    proposal,
    enrollment,
    currentMembership,
    currentGroup,
    score,
    confidence,
    reasons,
    blockers,
    completionSnapshot,
    capacityResult: bestOption?.capacitySnapshot ?? {},
    preferredFit: bestOption?.preferredFit ?? {},
    constraintsSnapshot: bestOption?.constraintsSnapshot ?? {},
    oldSpotReleaseOn,
    targetStartOn,
    targetGroupId: bestOption?.groupId ?? null,
    smartDecisionId,
    options
  };
}

export async function upsertFlowThroughCapacityHold(
  supabase: FlowThroughClient,
  input: {
    tenantId: string;
    recommendationId: string;
    enrollmentId: string;
    groupId: string;
    resourceId: string | null;
    startsOn: string;
    actorProfileId: string;
    capacitySnapshot: Record<string, unknown>;
    holdDays?: number;
  }
) {
  const existingHold = await maybeRow<{ id: string }>(
    supabase
      .from("capacity_holds")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("flow_through_recommendation_id", input.recommendationId)
      .eq("status", "active")
      .maybeSingle()
  );
  const payload = {
    tenant_id: input.tenantId,
    group_id: input.groupId,
    resource_id: input.resourceId,
    enrollment_id: input.enrollmentId,
    flow_through_recommendation_id: input.recommendationId,
    hold_type: "flow_through",
    status: "active",
    quantity: 1,
    starts_on: input.startsOn,
    ends_on: null,
    expires_at: addDaysTime(new Date(), input.holdDays ?? 7),
    released_at: null,
    release_reason: null,
    created_by_profile_id: input.actorProfileId,
    metadata: {
      source: "flow_through_recommendation",
      capacity_snapshot: input.capacitySnapshot
    }
  };

  if (existingHold) {
    await throwOnError(supabase.from("capacity_holds").update(payload).eq("tenant_id", input.tenantId).eq("id", existingHold.id));
    return existingHold.id;
  }

  const { data, error } = await supabase.from("capacity_holds").insert(payload).select("id").single();

  if (error || !data) {
    throw new Error(error?.message ?? "Doorstroom capacity hold kon niet worden aangemaakt.");
  }

  return (data as { id: string }).id;
}

function buildTargetOption(input: {
  group: GroupRow;
  currentGroup: GroupRow | null;
  resource: CapacityResourceInput | null;
  memberships: GroupMembershipRow[];
  holds: CapacityHoldInput[];
  slotOffers: SlotOfferRow[];
  suggestedStartOn: string;
}): FlowThroughTargetOptionDraft {
  const snapshot = buildCapacitySnapshot({
    group: input.group,
    resource: input.resource,
    memberships: input.memberships,
    holds: input.holds,
    slotOffers: input.slotOffers
  });
  const dayMatch = input.currentGroup ? input.currentGroup.weekday === input.group.weekday : false;
  const timeDistance = input.currentGroup ? Math.abs(minutes(input.currentGroup.starts_at) - minutes(input.group.starts_at)) : null;
  const timeMatch = timeDistance !== null && timeDistance <= 60;
  const preferredFit = {
    current_group_id: input.currentGroup?.id ?? null,
    target_group_id: input.group.id,
    day_match: dayMatch,
    time_match: timeMatch,
    time_distance_minutes: timeDistance,
    current_moment: input.currentGroup ? `${input.currentGroup.weekday} ${input.currentGroup.starts_at}-${input.currentGroup.ends_at}` : null,
    target_moment: `${input.group.weekday} ${input.group.starts_at}-${input.group.ends_at}`
  };
  const reasons: SmartDecisionReason[] = [
    smartReason({
      code: "stage_match",
      label: "Groep hoort bij volgend niveau",
      detail: "Programma en target stage sluiten aan op het voorstel.",
      weight: 20,
      evidence: { group_id: input.group.id, stage_id: input.group.stage_id }
    }),
    smartReason({
      code: "capacity",
      label: capacitySummaryText(snapshot),
      detail: "Berekend met actieve plaatsingen, toekomstige starts, holds, reserveringen en resource-capaciteit.",
      weight: 30,
      evidence: capacitySnapshotToRecord(snapshot)
    }),
    smartReason({
      code: "preferred_fit",
      label: dayMatch && timeMatch ? "Moment lijkt op huidige les" : dayMatch ? "Zelfde lesdag" : "Andere lesdag of tijd",
      detail: "Doorstroom probeert de bestaande routine van ouder en leerling te respecteren.",
      weight: 15,
      evidence: preferredFit
    })
  ];
  const blockers = snapshot.blockers.map((blocker) =>
    smartBlocker({
      code: blocker.code,
      label: blocker.label,
      detail: blocker.detail,
      severity: blocker.severity === "warning" ? "warning" : "blocking",
      evidence: { group_id: input.group.id }
    })
  );
  const capacityScore = snapshot.isAvailable ? Math.min(30, 12 + snapshot.openSpots * 6) : 0;
  const fitScore = (dayMatch ? 9 : 0) + (timeMatch ? 6 : 0);
  const resourceScore = input.group.resource_id && input.resource?.status === "active" ? 10 : input.group.resource_id ? 2 : 5;
  const instructorScore = input.group.instructor_id ? 10 : 4;
  const score = Math.max(0, Math.min(100, Math.round(20 + capacityScore + fitScore + resourceScore + instructorScore)));

  return {
    groupId: input.group.id,
    resourceId: input.group.resource_id,
    instructorId: input.group.instructor_id,
    score,
    confidence: confidenceFromScore(score, blockers),
    capacitySummary: capacitySummaryText(snapshot),
    capacitySnapshot: capacitySnapshotToRecord(snapshot),
    preferredFit,
    constraintsSnapshot: {
      resource_status: input.resource?.status ?? null,
      instructor_id: input.group.instructor_id,
      group_status: input.group.status
    },
    reasons,
    blockers,
    suggestedStartOn: input.suggestedStartOn,
    status: blockers.some((blocker) => blocker.severity !== "warning") ? "blocked" : "candidate"
  };
}

function minutes(value: string) {
  const [hours, minutesValue] = value.split(":").map((part) => Number.parseInt(part, 10));

  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutesValue) ? minutesValue : 0);
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

async function singleRow<Row>(builder: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row> {
  const { data, error } = await builder;

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Record niet gevonden.");
  }

  return data as Row;
}

async function maybeRow<Row>(builder: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row | null> {
  const { data, error } = await builder;

  if (error) {
    throw new Error(error.message);
  }

  return data ? (data as Row) : null;
}

async function rows<Row>(builder: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const { data, error } = await builder;

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as Row[]) : [];
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateInput: string, days: number) {
  const date = new Date(`${dateInput}T12:00:00`);
  date.setDate(date.getDate() + days);

  return date.toISOString().slice(0, 10);
}

function addDaysTime(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next.toISOString();
}
