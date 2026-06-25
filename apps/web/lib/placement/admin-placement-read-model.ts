import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { buildCapacitySnapshots, releaseExpiredCapacity, type CapacityHoldInput, type CapacitySnapshot } from "@/lib/capacity/capacity-engine";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type { CapacitySnapshot } from "@/lib/capacity/capacity-engine";

export type IntakeSubmissionRow = {
  id: string;
  program_id: string;
  intake_form_config_id: string | null;
  intake_config_version: number | null;
  intake_type: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  participant_name: string;
  participant_birthdate: string | null;
  preferred_days: string[];
  preferred_time_windows: string[];
  answers: Record<string, unknown>;
  notes: string | null;
  recommendation_snapshot: Record<string, unknown>;
  duplicate_snapshot: Record<string, unknown>;
  missing_information: string[];
  stage_recommendation_decision_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  status: string;
  created_at: string;
};

export type IntakeSubmissionEventRow = {
  id: string;
  submission_id: string;
  status: string;
  note: string | null;
  created_at: string;
};

export type IntakeDuplicateMatchRow = {
  id: string;
  intake_submission_id: string;
  matched_record_type: string;
  matched_record_id: string | null;
  match_type: string;
  severity: string;
  score: number;
  label: string;
  detail: string | null;
  metadata: Record<string, unknown>;
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
  waitlist_score: number | null;
  score_reasons: SmartDecisionReasonSummary[];
  score_snapshot: Record<string, unknown>;
  smart_decision_id: string | null;
  admin_priority: string;
  priority_reason: string | null;
  urgency_reason: string | null;
  tenant_reason_code: string | null;
  family_key: string | null;
  sibling_participant_id: string | null;
  last_contacted_at: string | null;
  last_contact_channel: string | null;
  duplicate_risk: string;
  reevaluation_requested_at: string | null;
  evaluated_at: string | null;
  created_at: string;
};

export type WaitlistEntryEventRow = {
  id: string;
  waitlist_entry_id: string;
  event_type: string;
  note: string | null;
  metadata: Record<string, unknown>;
  created_by_profile_id: string | null;
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
  reserved_spots: number;
  trial_spots: number;
  makeup_spots: number;
  overbooking_policy: string;
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
  starts_on: string;
  ends_on: string | null;
};

export type CapacityHoldRow = CapacityHoldInput;

export type PlacementWorkflowData = {
  intakes: IntakeSubmissionRow[];
  intakeEvents: IntakeSubmissionEventRow[];
  intakeDuplicateMatches: IntakeDuplicateMatchRow[];
  waitlistEntries: WaitlistEntryRow[];
  waitlistEvents: WaitlistEntryEventRow[];
  placementSuggestions: PlacementSuggestionRow[];
  slotOffers: SlotOfferRow[];
  programs: ProgramLookupRow[];
  stages: StageLookupRow[];
  groups: GroupLookupRow[];
  resources: ResourceLookupRow[];
  memberships: GroupMembershipLookupRow[];
  capacityHolds: CapacityHoldRow[];
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
  await releaseExpiredCapacity(supabase, tenantId);

  const [intakesResult, intakeEventsResult, duplicateMatchesResult, waitlistResult, waitlistEventsResult, suggestionsResult, offersResult, programsResult, stagesResult, groupsResult, resourcesResult, membershipsResult, capacityHoldsResult, smartDecisionsResult] = await Promise.all([
    supabase
      .from("intake_submissions")
      .select("id, program_id, intake_form_config_id, intake_config_version, intake_type, parent_name, parent_email, parent_phone, participant_name, participant_birthdate, preferred_days, preferred_time_windows, answers, notes, recommendation_snapshot, duplicate_snapshot, missing_information, stage_recommendation_decision_id, reviewed_at, review_note, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("intake_submission_events").select("id, submission_id, status, note, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(150),
    supabase.from("intake_duplicate_matches").select("id, intake_submission_id, matched_record_type, matched_record_id, match_type, severity, score, label, detail, metadata, status, created_at").eq("tenant_id", tenantId).eq("status", "open").order("severity", { ascending: true }).order("score", { ascending: false }),
    supabase
      .from("waitlist_entries")
      .select("id, intake_submission_id, program_id, recommended_stage_id, status, priority_date, preferred_days, preferred_time_windows, source, notes, waitlist_score, score_reasons, score_snapshot, smart_decision_id, admin_priority, priority_reason, urgency_reason, tenant_reason_code, family_key, sibling_participant_id, last_contacted_at, last_contact_channel, duplicate_risk, reevaluation_requested_at, evaluated_at, created_at")
      .eq("tenant_id", tenantId)
      .order("waitlist_score", { ascending: false })
      .order("priority_date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("waitlist_entry_events")
      .select("id, waitlist_entry_id, event_type, note, metadata, created_by_profile_id, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(250),
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
      .select("id, program_id, stage_id, resource_id, name, weekday, starts_at, ends_at, capacity, reserved_spots, trial_spots, makeup_spots, overbooking_policy, status")
      .eq("tenant_id", tenantId)
      .order("weekday", { ascending: true })
      .order("starts_at", { ascending: true }),
    supabase.from("resources").select("id, name, capacity, status").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("group_memberships").select("id, group_id, status, starts_on, ends_on").eq("tenant_id", tenantId),
    supabase.from("capacity_holds").select("id, group_id, hold_type, status, quantity, starts_on, ends_on, expires_at, slot_offer_id, release_reason").eq("tenant_id", tenantId).order("expires_at", { ascending: true }),
    supabase
      .from("smart_decisions")
      .select("id, engine_key, subject_type, subject_id, rule_version, score, confidence, reasons_json, blockers_json, recommendation, decision_status, human_decision, override_reason, created_at")
      .eq("tenant_id", tenantId)
      .in("engine_key", ["intake_recommendation", "waitlist", "placement"])
      .order("created_at", { ascending: false })
  ]);

  const errors = collectErrors({
    intake_submissions: intakesResult.error,
    intake_submission_events: intakeEventsResult.error,
    intake_duplicate_matches: duplicateMatchesResult.error,
    waitlist_entries: waitlistResult.error,
    waitlist_entry_events: waitlistEventsResult.error,
    placement_suggestions: suggestionsResult.error,
    slot_offers: offersResult.error,
    programs: programsResult.error,
    stages: stagesResult.error,
    groups: groupsResult.error,
    resources: resourcesResult.error,
    group_memberships: membershipsResult.error,
    capacity_holds: capacityHoldsResult.error,
    smart_decisions: smartDecisionsResult.error
  });

  const resources = asRows<ResourceLookupRow>(resourcesResult.data);
  const groups = asRows<GroupLookupRow>(groupsResult.data);
  const memberships = asRows<GroupMembershipLookupRow>(membershipsResult.data);
  const slotOffers = asRows<SlotOfferRow>(offersResult.data);
  const capacityHolds = asRows<CapacityHoldRow>(capacityHoldsResult.data);
  const waitlistEntries = asRows<WaitlistEntryRow>(waitlistResult.data).sort(sortWaitlistEntries);

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    tenant,
    errors,
    data: {
      intakes: asRows<IntakeSubmissionRow>(intakesResult.data),
      intakeEvents: asRows<IntakeSubmissionEventRow>(intakeEventsResult.data),
      intakeDuplicateMatches: asRows<IntakeDuplicateMatchRow>(duplicateMatchesResult.data),
      waitlistEntries,
      waitlistEvents: asRows<WaitlistEntryEventRow>(waitlistEventsResult.data),
      placementSuggestions: asRows<PlacementSuggestionRow>(suggestionsResult.data),
      slotOffers,
      programs: asRows<ProgramLookupRow>(programsResult.data),
      stages: asRows<StageLookupRow>(stagesResult.data),
      groups,
      resources,
      memberships,
      capacityHolds,
      capacities: buildCapacitySnapshots({ groups, resources, memberships, holds: capacityHolds, slotOffers }),
      smartDecisions: asRows<SmartDecisionSummaryRow>(smartDecisionsResult.data)
    }
  };
}

function createEmptyData(): PlacementWorkflowData {
  return {
    intakes: [],
    intakeEvents: [],
    intakeDuplicateMatches: [],
    waitlistEntries: [],
    waitlistEvents: [],
    placementSuggestions: [],
    slotOffers: [],
    programs: [],
    stages: [],
    groups: [],
    resources: [],
    memberships: [],
    capacityHolds: [],
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

function sortWaitlistEntries(a: WaitlistEntryRow, b: WaitlistEntryRow) {
  const scoreA = typeof a.waitlist_score === "number" ? a.waitlist_score : -1;
  const scoreB = typeof b.waitlist_score === "number" ? b.waitlist_score : -1;

  if (scoreA !== scoreB) {
    return scoreB - scoreA;
  }

  const priorityA = new Date(a.priority_date).getTime();
  const priorityB = new Date(b.priority_date).getTime();

  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}
