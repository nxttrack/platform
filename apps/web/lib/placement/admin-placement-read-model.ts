import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type IntakeSubmissionRow = {
  id: string;
  program_id: string;
  intake_type: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  participant_name: string;
  participant_birthdate: string | null;
  preferred_days: string[];
  preferred_time_windows: string[];
  notes: string | null;
  status: string;
  created_at: string;
};

export type WaitlistEntryRow = {
  id: string;
  intake_submission_id: string | null;
  program_id: string;
  recommended_stage_id: string | null;
  status: string;
  priority_date: string;
  preferred_days: string[];
  preferred_time_windows: string[];
  source: string;
  notes: string | null;
  created_at: string;
};

export type PlacementSuggestionRow = {
  id: string;
  waitlist_entry_id: string;
  intake_submission_id: string | null;
  program_id: string;
  stage_id: string | null;
  group_id: string;
  resource_id: string | null;
  score: number;
  capacity_snapshot: Record<string, unknown>;
  rationale: string | null;
  status: string;
  reviewed_at: string | null;
  created_at: string;
};

export type SmartDecisionSummaryRow = {
  id: string;
  engine_key: string;
  subject_type: string;
  subject_id: string;
  rule_version: string;
  score: number | null;
  confidence: string;
  reasons_json: SmartDecisionReasonSummary[];
  blockers_json: SmartDecisionBlockerSummary[];
  recommendation: Record<string, unknown>;
  decision_status: string;
  human_decision: string | null;
  override_reason: string | null;
  created_at: string;
};

export type SmartDecisionReasonSummary = {
  code?: string;
  label?: string;
  detail?: string;
  weight?: number;
};

export type SmartDecisionBlockerSummary = {
  code?: string;
  label?: string;
  detail?: string;
  severity?: string;
};

export type SlotOfferRow = {
  id: string;
  placement_suggestion_id: string;
  waitlist_entry_id: string;
  intake_submission_id: string | null;
  program_id: string;
  stage_id: string | null;
  group_id: string;
  offer_token: string;
  status: string;
  sent_at: string;
  expires_at: string;
  parent_responded_at: string | null;
  parent_response_note: string | null;
  participant_id: string | null;
  enrollment_id: string | null;
  group_membership_id: string | null;
};

export type ProgramLookupRow = {
  id: string;
  name: string;
  code: string;
};

export type StageLookupRow = {
  id: string;
  program_id: string;
  name: string;
  code: string;
};

export type GroupLookupRow = {
  id: string;
  program_id: string;
  stage_id: string;
  resource_id: string | null;
  name: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: string;
};

export type ResourceLookupRow = {
  id: string;
  name: string;
  capacity: number;
  status: string;
};

export type GroupMembershipLookupRow = {
  id: string;
  group_id: string;
  status: string;
  ends_on: string | null;
};

export type CapacitySnapshot = {
  groupId: string;
  groupCapacity: number;
  resourceCapacity: number | null;
  capacityLimit: number;
  activeMemberships: number;
  availableSpots: number;
};

export type PlacementWorkflowData = {
  intakes: IntakeSubmissionRow[];
  waitlistEntries: WaitlistEntryRow[];
  placementSuggestions: PlacementSuggestionRow[];
  slotOffers: SlotOfferRow[];
  programs: ProgramLookupRow[];
  stages: StageLookupRow[];
  groups: GroupLookupRow[];
  resources: ResourceLookupRow[];
  memberships: GroupMembershipLookupRow[];
  capacities: CapacitySnapshot[];
  smartDecisions: SmartDecisionSummaryRow[];
};

export type PlacementWorkflowSnapshot = {
  status: "ready" | "not_configured" | "no_tenant" | "query_error";
  tenant: {
    id: string;
    name: string;
    slug: string;
    sector: string;
  } | null;
  data: PlacementWorkflowData;
  errors: string[];
};

export async function getPlacementWorkflowSnapshot(): Promise<PlacementWorkflowSnapshot> {
  const emptyData = createEmptyData();
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    return {
      status: "no_tenant",
      tenant: null,
      data: emptyData,
      errors: ["Geen actieve tenant gevonden voor deze adminroute."]
    };
  }

  const tenant = {
    id: context.activeTenant.tenantId,
    name: context.activeTenant.name,
    slug: context.activeTenant.slug,
    sector: context.activeTenant.sector
  };

  if (!getSupabasePublicConfig()) {
    return {
      status: "not_configured",
      tenant,
      data: emptyData,
      errors: ["Supabase is nog niet geconfigureerd in deze runtime."]
    };
  }

  const supabase = await createClient();
  const tenantId = tenant.id;

  const [intakesResult, waitlistResult, suggestionsResult, offersResult, programsResult, stagesResult, groupsResult, resourcesResult, membershipsResult, smartDecisionsResult] = await Promise.all([
    supabase
      .from("intake_submissions")
      .select("id, program_id, intake_type, parent_name, parent_email, parent_phone, participant_name, participant_birthdate, preferred_days, preferred_time_windows, notes, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("waitlist_entries")
      .select("id, intake_submission_id, program_id, recommended_stage_id, status, priority_date, preferred_days, preferred_time_windows, source, notes, created_at")
      .eq("tenant_id", tenantId)
      .order("priority_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("placement_suggestions")
      .select("id, waitlist_entry_id, intake_submission_id, program_id, stage_id, group_id, resource_id, score, capacity_snapshot, rationale, status, reviewed_at, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("slot_offers")
      .select("id, placement_suggestion_id, waitlist_entry_id, intake_submission_id, program_id, stage_id, group_id, offer_token, status, sent_at, expires_at, parent_responded_at, parent_response_note, participant_id, enrollment_id, group_membership_id")
      .eq("tenant_id", tenantId)
      .order("sent_at", { ascending: false }),
    supabase.from("programs").select("id, name, code").eq("tenant_id", tenantId).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase.from("stages").select("id, program_id, name, code").eq("tenant_id", tenantId).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase
      .from("groups")
      .select("id, program_id, stage_id, resource_id, name, weekday, starts_at, ends_at, capacity, status")
      .eq("tenant_id", tenantId)
      .order("weekday", { ascending: true })
      .order("starts_at", { ascending: true }),
    supabase.from("resources").select("id, name, capacity, status").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("group_memberships").select("id, group_id, status, ends_on").eq("tenant_id", tenantId),
    supabase
      .from("smart_decisions")
      .select("id, engine_key, subject_type, subject_id, rule_version, score, confidence, reasons_json, blockers_json, recommendation, decision_status, human_decision, override_reason, created_at")
      .eq("tenant_id", tenantId)
      .in("engine_key", ["intake_recommendation", "placement"])
      .order("created_at", { ascending: false })
  ]);

  const errors = collectErrors({
    intake_submissions: intakesResult.error,
    waitlist_entries: waitlistResult.error,
    placement_suggestions: suggestionsResult.error,
    slot_offers: offersResult.error,
    programs: programsResult.error,
    stages: stagesResult.error,
    groups: groupsResult.error,
    resources: resourcesResult.error,
    group_memberships: membershipsResult.error,
    smart_decisions: smartDecisionsResult.error
  });

  const resources = asRows<ResourceLookupRow>(resourcesResult.data);
  const groups = asRows<GroupLookupRow>(groupsResult.data);
  const memberships = asRows<GroupMembershipLookupRow>(membershipsResult.data);

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    tenant,
    errors,
    data: {
      intakes: asRows<IntakeSubmissionRow>(intakesResult.data),
      waitlistEntries: asRows<WaitlistEntryRow>(waitlistResult.data),
      placementSuggestions: asRows<PlacementSuggestionRow>(suggestionsResult.data),
      slotOffers: asRows<SlotOfferRow>(offersResult.data),
      programs: asRows<ProgramLookupRow>(programsResult.data),
      stages: asRows<StageLookupRow>(stagesResult.data),
      groups,
      resources,
      memberships,
      capacities: computeCapacities(groups, resources, memberships),
      smartDecisions: asRows<SmartDecisionSummaryRow>(smartDecisionsResult.data)
    }
  };
}

export function computeCapacities(groups: GroupLookupRow[], resources: ResourceLookupRow[], memberships: GroupMembershipLookupRow[]): CapacitySnapshot[] {
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const today = new Date().toISOString().slice(0, 10);

  return groups.map((group) => {
    const resource = group.resource_id ? resourcesById.get(group.resource_id) : null;
    const activeMemberships = memberships.filter((membership) => membership.group_id === group.id && ["planned", "active"].includes(membership.status) && (!membership.ends_on || membership.ends_on >= today)).length;
    const capacityLimit = Math.min(group.capacity, resource?.capacity ?? group.capacity);

    return {
      groupId: group.id,
      groupCapacity: group.capacity,
      resourceCapacity: resource?.capacity ?? null,
      capacityLimit,
      activeMemberships,
      availableSpots: Math.max(0, capacityLimit - activeMemberships)
    };
  });
}

function createEmptyData(): PlacementWorkflowData {
  return {
    intakes: [],
    waitlistEntries: [],
    placementSuggestions: [],
    slotOffers: [],
    programs: [],
    stages: [],
    groups: [],
    resources: [],
    memberships: [],
    capacities: [],
    smartDecisions: []
  };
}

function collectErrors(errorsByTable: Record<string, { message: string } | null>): string[] {
  return Object.entries(errorsByTable).flatMap(([table, error]) => {
    return error ? [`${table}: ${error.message}`] : [];
  });
}

function asRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}
